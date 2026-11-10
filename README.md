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

PC（ブラウザ）ごとに、最初の接続を1回だけ行います。データは GitHub にあるので、どの PC から見ても同じ最新の状態です。トークンは、会社の鍵として**1本だけ**発行し、どの PC でも同じ鍵を使い回します（PC ごとに作り直しません）。各 PC では、鍵ファイルから取り込むか、同じトークンを入力して接続します。

### 複数の会社を見る場合

ビューアが保持できる接続は、開く場所（URL）ごとに1社分だけです。別の会社を見る場合は、その会社のリポジトリと鍵で接続し直してください（鍵ファイルは会社ごとに分かれています）。

## トークンの用意（会社の鍵）

会社の鍵は、TinyCompany 用に**1本だけ**発行し、ビューア・フック・拡張など全ての道具で使い回すのが決まりです。GitHub の Settings → Developer settings → Personal access tokens → **Fine-grained tokens** で、対象の会社 repo だけに絞ったトークンを作ります。

- Resource owner：会社 repo のある owner
- Repository access：**Only select repositories** で会社 repo だけを選択
- Repository permissions：**Issues = Read and write**、**Contents = Read and write**（Metadata は自動で Read-only）
- 有効期限：選べる範囲の長め（例：90日、または用意されている最長）を目安にします

発行したトークンは、鍵ファイル（`tinycompany-token` で始まる名前のファイル。既定名は `tinycompany-token`、推奨の置き場所はホーム側の `~/.tinycompany/` フォルダ）に、トークンだけを1行で書いて保存します。ビューアへは、初回にこの鍵ファイルから取り込めます（トークンを直接入力しても同じです）。取り込んだ内容はブラウザの中（localStorage）にだけ保存され、ビューアのコードや会社 repo にトークンが含まれることはありません。

鍵の期限が切れたら、同じ設定で新しいトークンを発行し、鍵ファイルの中身を差し替えて、ビューアでもう一度取り込みます。

## 動作環境と想定

- WebGL に対応したモダンブラウザで開いてください。3D 表示が重い端末では、付箋ボードの表示でも仕事の状態は確認できます。
- 想定しているのは、利用者1人が管理する小規模な会社です。Issue が大量にある会社では、読み込みに時間がかかることがあります。

## 安全についての注意

- トークンには会社 repo の書き込み権限があります。入力するのは、必ず自分が用意したビューアのページだけにしてください（URL を確認すること）。
- トークンは会社 repo 1つだけに絞ること。鍵が漏れた疑いがある場合は、GitHub 側でそのトークンを失効させ、新しい鍵を発行して、鍵ファイルの差し替えと各道具への再取り込みを行ってください。
- ページを公開ホスティングに置く場合、ページ自体は公開されても、トークンは各利用者のブラウザ内にしか入らないため、他人のトークンが混ざることはありません。

## 構成

- `viewer/index.html` — ビューア本体（3D 表示・編集 UI）
- `viewer/github.js` — ブラウザから GitHub API へ接続し、会社データを整形する層（接続情報は localStorage）
- `viewer/vendor/` — three.js（同梱。CDN には依存しない）
- `start-viewer.bat` / `start-viewer.command` / `start-viewer.sh` — ダブルクリック起動用のランチャー。Windows 版は `tools/static-server.ps1`（Windows 標準機能だけの最小静的サーバー）を使う
- `CHANGELOG.md` — ビューアの変更履歴
