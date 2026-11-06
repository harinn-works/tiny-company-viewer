# TinyCompany Viewer

TinyCompany の会社 repo（GitHub）を実データで表示する、ローカル専用のビューアです。
会社 repo の設定ファイル（`board/`・`rooms/`）と GitHub Issues を読み取り、3D の会社ボードとして表示します。レイアウト・設定・建物の保存は、そのまま会社 repo にコミットされます。

会社 repo の作り方は [tiny-company-template](https://github.com/harinn-works/tiny-company-template) を参照してください。このビューアは、どの会社 repo に対しても（`.env` の向ける先を変えるだけで）使えます。

## 必要なもの

- Docker（推奨）または Node.js 18 以上
- 会社 repo 専用の GitHub トークン（下記）

## トークンの用意

GitHub の Settings → Developer settings → Personal access tokens → **Fine-grained tokens** で、対象の会社 repo だけに絞ったトークンを作ります。

- Resource owner：会社 repo のある owner
- Repository access：**Only select repositories** で会社 repo だけを選択
- Repository permissions：**Issues = Read and write**、**Contents = Read and write**（Metadata は自動で Read-only）

## 起動

### Docker（推奨）

```bash
cp .env.example .env   # GITHUB_TOKEN と COMPANY_REPO を記入
docker compose up -d --build
```

ブラウザで http://127.0.0.1:8787 を開きます。

### Node で直接

```bash
GITHUB_TOKEN=xxxx COMPANY_REPO=your-org/your-company node server/server.mjs
```

## 設定（環境変数）

| 変数 | 既定 | 説明 |
|---|---|---|
| `GITHUB_TOKEN` | （必須） | 会社 repo 用の PAT |
| `COMPANY_REPO` | （必須） | `owner/repo` |
| `PORT` | 8787 | 待ち受けポート |
| `HOST` | 127.0.0.1 | 待ち受けアドレス。Docker 内では compose が 0.0.0.0 を設定し、公開はホストの localhost のみに絞ります |
| `CACHE_TTL_MS` | 30000 | 会社データのキャッシュ時間（ミリ秒）。保存操作の後は即座に破棄されます |
| `GITHUB_API_BASE` | https://api.github.com | テスト用。通常は変更不要 |

## 安全についての注意

- このサーバーは **localhost からの利用だけを前提**にしています。トークンには会社 repo の書き込み権限があるため、インターネットに直接公開しないでください。常駐させる場合は Tailscale などの閉じたネットワーク越しに使う想定です。
- トークンは会社 repo 1つだけに絞ること。`.env` は Git にコミットしないでください（`.gitignore` 済み）。

## 開発者向け

GitHub API のスタブで、実 repo を使わずに動作確認できます。

```bash
cp -r server/test/fixtures-sample server/test/fixtures   # サンプルの会社データ一式
node server/test/stub.mjs &                 # スタブ（ポート 8791）
GITHUB_API_BASE=http://127.0.0.1:8791 COMPANY_REPO=example/sample-company node server/server.mjs
```

ビューアとサーバーの間のデータ形式は `server/CONTRACT.md` に定義しています。
