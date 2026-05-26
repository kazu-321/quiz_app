# quiz_app JSON 仕様書（AI 向け）

この文書は、AI に `data/*.json` の問題集ファイルを作らせるための仕様です。

## 1. 目的

- 1 つの JSON ファイルに 1 つの問題集を入れます。
- 問題集は `manifest.json` で一覧化されますが、通常は手で編集しません。
- 生成する JSON は、`tools/editor.py` と `tools/web_editor.py` がそのまま読み書きできる形にします。

## 2. ファイル配置

- 問題集本体は `data/<フォルダ>/<タイトル>.json` に置きます。
- 例: `data/現代の社会I/01_認知科学とはなにか.json`
- `title` はファイル名のベースになります。
- `id` は `フォルダ名/タイトル` 形式にします。

## 3. ルート構造

```json
{
  "schema_version": 1,
  "id": "現代の社会I/01_認知科学とはなにか",
  "title": "01_認知科学とはなにか",
  "description": "",
  "questions": []
}
```

### ルート必須項目

- `schema_version`
  - 必須
  - 数値 `1` 固定
- `id`
  - 必須
  - 問題集の内部 ID
  - `フォルダ/タイトル` 形式
- `title`
  - 必須
  - 問題集タイトル
  - `/` と `\` は使わない
- `questions`
  - 必須
  - 問題の配列
  - 0 件は避ける

### ルート任意項目

- `description`
  - 任意
  - 問題集の説明文

## 4. 問題オブジェクト共通仕様

各 `question` は次の共通項目を持ちます。

```json
{
  "id": "q001",
  "type": "single_choice",
  "question": "問題文",
  "explanation": "解説",
  "tags": ["認知科学", "基礎"],
  "difficulty": 2
}
```

### 共通必須項目

- `id`
  - 必須
  - 問題内で一意
  - 推奨形式は `q001`, `q002` のような連番
- `type`
  - 必須
  - 次のいずれか
    - `single_choice`
    - `multiple_choice`
    - `ordered_choice`
    - `text_input`
- `question`
  - 必須
  - 問題文

### 共通任意項目

- `explanation`
  - 任意
  - 解説文
- `tags`
  - 任意
  - 文字列配列
- `difficulty`
  - 任意
  - 数値

## 5. 問題タイプ別仕様

### 5.1 `single_choice`

単一選択問題です。

```json
{
  "id": "q001",
  "type": "single_choice",
  "question": "認知科学とはなにか",
  "choices": [
    "知的な行動プロセスを情報処理の視点から科学的に明らかにする学問",
    "認知症について科学的に明らかにする学問"
  ],
  "shuffle_choices": true,
  "answer": 0
}
```

#### 必須項目

- `choices`
  - 2 件以上の文字列配列
- `answer`
  - 0 から始まる番号
  - `choices` の添字で指定する

#### 任意項目

- `shuffle_choices`
  - 選択肢を表示時にシャッフルするかどうか
  - 推奨値は `true`
  - 省略時は `false` 扱い

### 5.2 `multiple_choice`

複数選択問題です。回答は順不同です。

```json
{
  "id": "q002",
  "type": "multiple_choice",
  "question": "正しいものをすべて選べ",
  "choices": [
    "A",
    "B",
    "C"
  ],
  "shuffle_choices": true,
  "answer": [0, 2]
}
```

#### 必須項目

- `choices`
  - 2 件以上の文字列配列
- `answer`
  - 0 から始まる番号の配列
  - 正解の選択肢をすべて入れる

#### 任意項目

- `shuffle_choices`
  - 推奨値は `true`
  - 省略時は `false` 扱い

### 5.3 `ordered_choice`

並び順も正解条件に含まれる複数選択問題です。

```json
{
  "id": "q003",
  "type": "ordered_choice",
  "question": "正しい順に並べよ",
  "choices": [
    "A",
    "B",
    "C"
  ],
  "shuffle_choices": true,
  "answer": [1, 0, 2]
}
```

#### 必須項目

- `choices`
  - 2 件以上の文字列配列
- `answer`
  - 0 から始まる番号の配列
  - 並び順を含めて指定する

#### 任意項目

- `shuffle_choices`
  - 推奨値は `true`
  - 省略時は `false` 扱い

### 5.4 `text_input`

穴埋め問題です。入力欄は複数置けます。

```json
{
  "id": "q004",
  "type": "text_input",
  "question": "(1) は (2) と呼ばれる",
  "inputs": [
    {
      "answers": ["ミラー"]
    },
    {
      "answers": ["マジカルナンバー"]
    }
  ],
  "input_ordered": true,
  "case_sensitive": false,
  "trim": true,
  "normalize_spaces": true
}
```

#### 必須項目

- `inputs`
  - 1 件以上の配列
  - 各要素は次の形式

```json
{
  "answers": ["許容解答1", "許容解答2"]
}
```

- `answers`
  - 1 件以上の文字列配列
  - その入力欄で許容する表記をすべて列挙する

#### 任意項目

- `input_ordered`
  - 入力欄の順序を区別するかどうか
  - `true` なら順序を区別する
  - `false` なら順不同で採点する
  - 省略時は `true` 扱い
- `case_sensitive`
  - `true` なら大文字小文字を区別する
  - 省略時は `false` 扱い
- `trim`
  - `true` なら前後空白を無視する
  - 省略時は `true` 扱い
- `normalize_spaces`
  - `true` なら連続空白を 1 個に正規化する
  - 省略時は `false` 扱い

## 6. 値のルール

- 文字列は UTF-8 で書く
- JSON はダブルクォートを使う
- 末尾カンマは付けない
- コメントは書けない
- `single_choice` の `answer` は数値 1 件
- `multiple_choice` / `ordered_choice` の `answer` は数値配列
- `text_input` の `inputs[*].answers` は文字列配列
- 選択肢の index は 0 始まり
- `choices` は 2 件以上
- `inputs` は 1 件以上
- `question.id` は同じ問題集内で重複させない

## 7. 生成時の推奨ルール

- 問題文は短くしすぎず、何を答えるかが分かる形にする
- `text_input` は丸暗記の 1 語だけでなく、表記ゆれを `answers` に入れる
- 選択問題の正解 index は、`choices` を作った直後に数える
- `shuffle_choices` を `true` にしても、`answer` はシャッフル前の index で書く
- 迷う場合は `explanation` を入れる
- 既存の問題集に合わせて、表記や粒度をそろえる

## 8. 最小例

```json
{
  "schema_version": 1,
  "id": "サンプル/01_サンプル",
  "title": "01_サンプル",
  "description": "",
  "questions": [
    {
      "id": "q001",
      "type": "single_choice",
      "question": "正しいものを選べ",
      "choices": ["A", "B"],
      "shuffle_choices": true,
      "answer": 0,
      "explanation": "A が正解。"
    },
    {
      "id": "q002",
      "type": "text_input",
      "question": "東京の都道府県名は何か",
      "inputs": [
        {
          "answers": ["東京都"]
        }
      ],
      "input_ordered": true,
      "case_sensitive": false,
      "trim": true,
      "normalize_spaces": true
    }
  ]
}
```

## 9. AI に依頼するときの注意

- 仕様にないキーは勝手に増やさない
- 既存データと整合する命名にする
