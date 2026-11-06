# TinyCompany Viewer 用の最小静的サーバー（Windows 標準機能のみ・追加インストール不要）
# start-viewer.bat から呼ばれる。ブラウザ完結ビューアの viewer/ フォルダを配信する。
param(
  [string]$Root = (Join-Path (Split-Path $PSScriptRoot -Parent) 'viewer'),
  [int]$Port = 8000,
  [string]$Bind = 'localhost',
  [switch]$NoOpen
)

$rootFull = [System.IO.Path]::GetFullPath($Root)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://${Bind}:${Port}/")
try {
  $listener.Start()
} catch {
  Write-Host "ポート $Port で起動できませんでした。既にビューアが起動している場合は、ブラウザで http://localhost:$Port/ を開いてください。"
  Write-Host $_.Exception.Message
  exit 1
}
Write-Host "TinyCompany Viewer が起動しました: http://localhost:$Port/"
Write-Host "閉じるときは、このウィンドウを閉じるか Ctrl+C を押してください。"
if (-not $NoOpen) { Start-Process "http://localhost:$Port/" }

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
      $file = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))
      if ($file.StartsWith($rootFull) -and (Test-Path $file -PathType Leaf)) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $ct = $mime[$ext]
        if (-not $ct) { $ct = 'application/octet-stream' }
        $ctx.Response.ContentType = $ct
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $ctx.Response.StatusCode = 404
      }
    } catch {
      try { $ctx.Response.StatusCode = 500 } catch {}
    } finally {
      try { $ctx.Response.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
