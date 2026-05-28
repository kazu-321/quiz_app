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

## 10. 教科別資料から問題集を作る手順

`教科別資料/<教科名>/` に授業資料や過去問がある場合は、次の手順で `quiz_app` 用の問題集を作成します。

### 10.1 既存形式の確認

作成前に必ず次を確認します。

- この仕様書
- `data/` 配下にある既存教科の JSON
- `manifest.json` の構造
- 必要に応じて `README.md` と `tools/editor.py`

既存の問題集と同じように、1ファイルを1単元または1ジャンルとして扱います。

### 10.2 資料の確認

対象教科の資料を次の順に確認します。

1. 過去問
2. 過去問の解答
3. 試験範囲の授業資料

過去問がある場合は、単に答えを写すのではなく、次を分析します。

- よく問われる用語
- 出題形式
- 空欄補充、正誤、選択、順序、コード読解などの比率
- 「過不足なく選べ」「どこがどう間違っているか」などの採点されやすい形式
- 図やコードから、どの対応関係を答えさせているか

授業資料からは、過去問で直接出た箇所だけでなく、同じ形式で出題されそうな周辺項目も拾います。

### 10.3 単元分け

問題は、他の教科と同じようにジャンルや単元ごとに分けます。

推奨ファイル名は次の形式です。

```text
data/<教科名>/01_<単元名>.json
data/<教科名>/02_<単元名>.json
```

単元名は、授業資料の章立て、過去問の大問、または内容のまとまりに合わせます。

例:

- `01_概要と開発プロセス`
- `02_MVC基礎`
- `03_MVC設計とリマインダー`
- `04_MVC実装と拡張`
- `05_シーケンス図`

### 10.4 問題作成方針

過去問の傾向を反映し、次のように問題タイプを使い分けます。

- 用語や短い答えを問う場合: `text_input`
- 正誤や1つの正解を選ぶ場合: `single_choice`
- 「すべて選べ」「過不足なく選べ」の場合: `multiple_choice`
- 工程、手順、流れを問う場合: `ordered_choice`

問題文は、授業資料の文章を丸写ししすぎず、試験で問われる形に直します。ただし、専門用語、メソッド名、コード片、選択肢の表現は、授業資料や過去問に合わせます。

### 10.5 問題の粒度

1つの問題では、原則として1つの知識または1つの判断を問います。

ただし、過去問で複数空欄や対応関係が問われている場合は、`text_input` の `inputs` を複数にしてまとめて構いません。

例:

```json
{
  "id": "q001",
  "type": "text_input",
  "question": "MVCでは、(1)はデータ、(2)はユーザインタフェース、(3)は処理の制御を担当する。",
  "inputs": [
    { "answers": ["Model"] },
    { "answers": ["View"] },
    { "answers": ["Controller"] }
  ],
  "input_ordered": true,
  "case_sensitive": false,
  "trim": true,
  "normalize_spaces": true
}
```

### 10.6 解答と許容表記

`text_input` では、授業資料や解答例で許容されている別表記を `answers` に入れます。

例:

```json
{
  "answers": ["保守", "供給"]
}
```

ただし、意味が変わる別表記は入れません。英単語は、授業資料で英語表記が使われている場合は英語を基本にし、必要に応じて大文字小文字を区別しない設定にします。

### 10.7 解説・タグ・難易度

各問題には、可能な限り次を付けます。

- `explanation`: なぜその答えになるか、どの考え方で解くか
- `tags`: 単元名、重要語句、出題形式
- `difficulty`: 1から3程度を目安にした難易度

難易度の目安:

- `1`: 用語の単純暗記
- `2`: 対応関係や流れの理解
- `3`: コード読解、複数条件、過不足なし選択

### 10.8 manifest の更新

問題集 JSON を追加したら、`manifest.json` を更新します。

手作業で編集してもよいですが、通常は `tools/editor.py` の `generate_manifest()` と同じ形式にします。

`manifest.json` の各項目は次の形式です。

```json
{
  "id": "ソフトウェア工学/01_概要と開発プロセス",
  "title": "01_概要と開発プロセス",
  "description": "問題集の説明",
  "file": "data/ソフトウェア工学/01_概要と開発プロセス.json"
}
```

## 11. 作成後の検証

問題集を作成したら、少なくとも次を確認します。

- JSON として読み込める
- `schema_version` が `1`
- `id` が `フォルダ/タイトル` 形式
- `title` とファイル名のベースが一致している
- `questions` が空でない
- 同一ファイル内で `question.id` が重複していない
- `type` が対応タイプのいずれか
- 選択問題の `answer` が `choices` の範囲内
- `text_input` の `inputs[].answers` が空でない
- `manifest.json` に追加した問題集が入っている

検証用の簡易スクリプト例:

```bash
python3 - <<'PY'
import json
from pathlib import Path

root = Path('quiz_app')
for path in sorted((root / 'data').rglob('*.json')):
    data = json.loads(path.read_text(encoding='utf-8'))
    assert data['schema_version'] == 1, path
    assert data['id'], path
    assert data['title'], path
    assert data['questions'], path
    ids = [q['id'] for q in data['questions']]
    assert len(ids) == len(set(ids)), path
    for q in data['questions']:
        assert q['type'] in {'single_choice', 'multiple_choice', 'ordered_choice', 'text_input'}, (path, q['id'])
        assert q.get('question'), (path, q['id'])
        if q['type'] in {'single_choice', 'multiple_choice', 'ordered_choice'}:
            assert len(q['choices']) >= 2, (path, q['id'])
            if q['type'] == 'single_choice':
                assert isinstance(q['answer'], int), (path, q['id'])
                assert 0 <= q['answer'] < len(q['choices']), (path, q['id'])
            else:
                assert isinstance(q['answer'], list) and q['answer'], (path, q['id'])
                assert all(isinstance(i, int) and 0 <= i < len(q['choices']) for i in q['answer']), (path, q['id'])
        else:
            assert q['inputs'], (path, q['id'])
            assert all(inp.get('answers') for inp in q['inputs']), (path, q['id'])
print('ok')
PY
```

ローカルで表示確認する場合は、`quiz_app` のルートをサーバで配信します。

```bash
cd quiz_app
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開き、追加した教科と単元が一覧に出ることを確認します。
