# TinyCompany Viewer

TinyCompany の会社 repo（GitHub）を表示するビューアです。
会社 repo の設定ファイル（`board/`・`rooms/`）と GitHub Issues を読み取り、3D の会社ボードとして表示します。レイアウト・設定・建物の保存は、そのまま会社 repo にコミットされます。

**サーバーは要りません。** ビューアのページがブラウザから直接 GitHub に接続します。見たいときはページを開くだけです。

会社 repo の作り方は [tiny-company-template](https://github.com/harinn-works/tiny-company-template) を参照してください。このビューアは、どの会社 repo に対しても使えます。

## 使い方

公開ページを開く場合（標準）：

1. https://harinn-works.github.io/tiny-company-viewer/ を開く
2. 最初の1回だけ「会社に接続する」画面で、会社リポジトリ（`owner/repository`）と、その repo 専用のトークンを入力して「接続する」を押す
3. 次からは、ページを開くだけで自分の会社が表示されます。ビューアの更新も自動で反映されます

ブックマークや、デスクトップにページのショートカット（URL のショートカットファイル）を置いておくと、見たいときにすぐ開けます。
接続の設定は、開く場所（URL）ごとに保存されます。別の場所のビューアを開いたら、そこでも最初の1回だけ接続してください。

自分の PC に置いて見る場合：

1. この repo をダウンロード（ZIP）して展開する
2. OS に合った起動ファイルをダブルクリックする
   - Windows：`start-viewer.bat`（追加のインストールは不要です。Windows 標準の機能だけで小さなサーバーが立ち上がり、ブラウザが開きます）
   - Mac：`start-viewer.command`（初回だけ、右クリック→「開く」が必要な場合があります）
   - Linux：`start-viewer.sh` を実行する
3. あとは公開ページと同じです（最初の1回だけ接続する）

### 複数の PC で見る場合

PC（ブラウザ）ごとに、最初の接続を1回だけ行います。データは GitHub にあるので、どの PC から見ても同じ最新の状態です。トークンは PC ごとに分けて作ると、不要になった PC の分だけを消せて安全です。

## トークンの用意

GitHub の Settings → Developer settings → Personal access tokens → **Fine-grained tokens** で、対象の会社 repo だけに絞ったトークンを作ります。

- Resource owner：会社 repo のある owner
- Repository access：**Only select repositories** で会社 repo だけを選択
- Repository permissions：**Issues = Read and write**、**Contents = Read and write**（Metadata は自動で Read-only）

トークンは、入力したブラウザの中（localStorage）にだけ保存されます。ビューアのコードや会社 repo にトークンが含まれることはありません。

## 安全についての注意

- トークンには会社 repo の書き込み権限があります。入力するのは、必ず自分が用意したビューアのページだけにしてください（URL を確認すること）。
- トークンは会社 repo 1つだけに絞ること。使い終わった PC のトークンは GitHub 側で削除してください。
- ページを公開ホスティングに置く場合、ページ自体は公開されても、トークンは各利用者のブラウザ内にしか入らないため、他人のトークンが混ざることはありません。

## 構成

- `viewer/index.html` — ビューア本体（3D 表示・編集 UI）
- `viewer/github.js` — ブラウザから GitHub API へ接続し、会社データを整形する層（接続情報は localStorage）
- `viewer/vendor/` — three.js（同梱。CDN には依存しない）
- `start-viewer.bat` / `start-viewer.command` / `start-viewer.sh` — ダブルクリック起動用のランチャー。Windows 版は `tools/static-server.ps1`（Windows 標準機能だけの最小静的サーバー）を使う
- `server/` — 従来方式のローカルサーバー（任意）。トークンをブラウザに入れたくない場合や、常駐表示したい場合はこちらも使えます。使い方は `server/server.mjs` 冒頭と `docker-compose.yml` を参照

## 開発者向け

GitHub API のスタブで、実 repo を使わずに動作確認できます。スタブは CORS に対応しているので、ブラウザ完結ビューアから直接叩けます。

```bash
cp -r server/test/fixtures-sample server/test/fixtures   # サンプルの会社データ一式
node server/test/stub.mjs &                 # スタブ（ポート 8791）
# 静的サーバーで viewer/ を配信して開き、接続画面の詳細設定で
# API の URL に http://127.0.0.1:8791 を指定する（トークンは任意の文字列でよい）
```

ビューアとデータ層の間のデータ形式は `server/CONTRACT.md` に定義しています（ブラウザ完結版も同じ形を使います）。
