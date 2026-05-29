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

ブラウザで編集する Web 版もあります。

```bash
python3 tools/web_editor.py
```

ローカルサーバを起動して、`問題集一覧 -> 問題一覧 -> 問題編集` の順に操作します。保存と `manifest.json` の更新は Python 側が担当します。

## データ仕様

問題集一覧はルートの `manifest.json` で管理します。各問題集は `data/*.json` に置きます。
問題集の内部 `id` はフォルダ名とタイトルから自動生成されます。

`manifest.json` は `data/**/*.json` を走査して自動生成します。ローカルで再生成したいときは次を実行します。

```bash
python3 tools/regenerate_manifest.py
```

内容が最新かだけ確認したいときは `--check` を付けます。

```bash
python3 tools/regenerate_manifest.py --check
```

AI に問題集 JSON を作らせるときの詳細仕様は [`docs/ai_json_spec.md`](docs/ai_json_spec.md) を参照してください。

対応する問題タイプは次の4種類です。

- `single_choice`: 単一選択
- `multiple_choice`: 複数選択、順序なし
- `ordered_choice`: 複数選択、順序あり
- `text_input`: 入力欄数可変の穴埋め問題。`inputs` は `{"answers": ["a", "AA"]}` の配列です。`input_ordered` を `false` にすると、複数の入力欄の順序を区別せずに採点します。省略時は `true` です

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
