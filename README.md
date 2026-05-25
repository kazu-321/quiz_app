# quiz_app

GitHub Pages で公開できる、一問一答・選択問題対応の学習アプリです。

## 使い方

ローカルで確認する場合は、リポジトリルートで次を実行します。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開きます。

## 問題集の編集

標準ライブラリの Tkinter を使った編集ツールを起動します。

```bash
python3 tools/editor.py
```

保存すると `data/*.json` と `manifest.json` が整形済み JSON として更新されます。

## データ仕様

問題集一覧はルートの `manifest.json` で管理します。各問題集は `data/*.json` に置きます。
問題集の内部 `id` はフォルダ名とタイトルから自動生成されます。

対応する問題タイプは次の4種類です。

- `single_choice`: 単一選択
- `multiple_choice`: 複数選択、順序なし
- `ordered_choice`: 複数選択、順序あり
- `text_input`: 入力欄数可変の穴埋め問題。`inputs` は `{"answers": ["a", "AA"]}` の配列です

学習状態はブラウザの `localStorage` に保存されます。

- `quiz_app_progress`: 回答中セッション
- `quiz_app_stats`: 各問題の通算成績
- `quiz_app_last_result`: 最後の結果

## GitHub Pages に公開するファイル

- `index.html`
- `answer.html`
- `manifest.json`
- `css/`
- `js/`
- `data/`

`tools/editor.py` はローカル編集用です。
