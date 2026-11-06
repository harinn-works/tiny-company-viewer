# TinyCompany Viewer — API 契約（ステップ4 実装用）

ビューア（viewer/index.html、原型は viewer-v21）とローカルサーバー（server/server.mjs）の間の契約。
データの正は会社 repo（GitHub）。サーバーが GitHub REST API を読み、ビューア向けに整形して渡す。

## GET /api/company

レスポンス（JSON）：

```json
{
  "repo": "owner/repo-name",
  "fetchedAt": "ISO 8601",
  "settings": { /* board/settings.json の中身そのまま */ },
  "building": { /* board/building.json の中身そのまま */ },
  "layouts": { "<roomId>": { /* rooms/<roomId>/layout.json の中身そのまま */ } },
  "issues": [ Issue ]
}
```

layouts は building.rooms にある部屋の分だけ（ファイルが無い部屋はキー自体が無い）。

Issue（サーバーが整形済み）：

```json
{
  "number": 7,
  "title": "...",
  "state": "open | closed",
  "url": "https://github.com/.../issues/7",
  "seat": "director | bucho | secretary | member | null",
  "status": "not_started | working | waiting_approval | waiting_review | null",
  "room": "pilot | null",
  "roles": ["調査"],
  "parent": 6,
  "children": [8, 9],
  "assignee": "Muse（部下役）",
  "chat": { "label": "Muse サイドチャット「…」", "url": null },
  "out": "rooms/pilot/work/.../REPORT.md",
  "ask": null,
  "reportTo": { "name": "親 #6 のチャット（部長）", "chat": null },
  "reportText": "…",
  "preCheck": { "by": "harumuse", "recommend": "…", "concerns": "…" },
  "body": "生の本文"
}
```

- seat/status は settings.json の label 定義とラベル名を照合して意味キーに変換したもの。status ラベルが無い Issue（社長など）は null。
- room は room: ラベルの接頭辞を外した id。無い場合は null（社長室扱い）。
- assignee / chat / out / ask / reportTo / reportText は席 Issue 本文の定型フィールド（担当／チャット／成果物／承認待ちの内容／報告先／報告文）から抽出。「なし」は null（ask のみ。他は文字列として保持）。
- preCheck は status が waiting_review の Issue のコメントから「一次確認」を含む最新コメントを解析したもの（推奨／懸念）。無い場合は null。
- parent / children は GitHub の sub-issue 関係（API が正。本文の「親」欄より優先）。

## POST /api/files

リクエスト：`{ "path": "board/settings.json", "content": { /* JSON オブジェクト */ } }`
許可パス：`board/settings.json`、`board/building.json`、`rooms/<roomId>/layout.json` のみ。
処理：現在の sha を取得して Contents API で1コミットとして書き込む。成功で `{ "ok": true, "commit": "<sha>" }`。
書き込み後はサーバー側キャッシュを破棄する。

## ビューア側の適合要件（index.html の改修点）

原型 v21 の埋め込みデモデータ前提を、実データ取得に差し替える。3D・パネル・編集モード・設定画面の挙動は変えない。

1. **importmap**：CDN をやめ、ローカル vendor を指す（`three` → `/vendor/three.module.js`、`three/addons/` → `/vendor/`）。
2. **データの let 化と初期化**：`SETTINGS` / `BUILDING` / `LAYOUTS` / `ISSUES` を再代入可能にし、起動を非同期 init に変える。`fetch('/api/company')` が成功したら下記の変換を適用してから従来の boot（buildTabs → switchView）を行う。失敗したら画面上部にエラーバナーを出し、埋め込みデモデータで boot する（フォールバック）。
3. **settings の変換**：repo 形式（色は "9AA5A0" のような文字列）→ 描画用（color は数値 0x…）。変換前の生オブジェクトを `SETTINGS_RAW` として保持する（保存時のマージ用）。tiers の `_note` は描画用から除くが RAW には残す。
4. **dept の排除**：実データの Issue には dept が無い。原型で `issue.dept` に依存している箇所（着席まわり）を、レイアウト＋親子ツリーから決まる方式に置き換える。
   - 着席順：① layout の memberSeats にピン留めされた Issue をその席へ。② 残りの member は「根の部長番号 → 深さ → Issue 番号」の順に並べ、島の空き席を先頭から埋める。③ 席が足りなければ最初の部署に島（4席）を追加する。④ bucho は従来通り部屋の端の専用席。⑤ director / secretary は社長室。
   - layout が無い部屋・島が無い部屋には、部署「メイン」＋4席の島を必要数だけ合成する（原型の housetodo デモと同じ考え方）。
5. **status が null の Issue**：`SETTINGS.statuses[...]` を参照する全箇所（帽子の色、詳細パネル、凡例の集計など）を null 安全にする。社長は帽子なし・凡例の人数に数えない、が既定の意味。
6. **保存の配線変更**：
   - 設定画面の保存：`settingsToJson()` の結果を、そのまま使わず `SETTINGS_RAW` にマージしてから POST する（version や tiers._note など、UI が知らないキーを消さない）。
   - レイアウト保存：従来の `cleanLayout(...)` の結果を `rooms/<roomId>/layout.json` へ POST（ピンだけ保存する既存の意味論は維持）。
   - building 保存：`BUILDING` を `board/building.json` へ POST。
   - POST が失敗したら従来通りダウンロードにフォールバックし、画面にその旨を表示する。成功したら「保存しました」と小さく表示する。
7. **更新ボタン**：ヘッダ付近に再取得ボタン（🔄）を置き、押すと /api/company を再取得して現在のビューを再構築する。あわせて接続中の repo 名を表示する。
8. 詳細パネルの「Issueを開く」は Issue の `url` を使う（サーバーが渡す）。チャットボタンは chat.url がある場合のみ有効（従来通り）。
