#!/usr/bin/env python3
"""Run quiz_app JSON checks and emit a PR-friendly report on failure."""

from __future__ import annotations

import argparse
from pathlib import Path

from manifest_utils import MANIFEST_PATH, build_manifest, iter_book_files, load_json, validate_manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run repository JSON checks.")
    parser.add_argument(
        "--report",
        default="",
        help="Write a markdown report to this path when validation fails.",
    )
    return parser.parse_args()


def make_hint(message: str) -> str:
    if "manifest.json の内容が最新ではありません" in message:
        return (
            "manifest.json は `data/**/*.json` から生成されます。\n"
            "再生成するには `python3 tools/regenerate_manifest.py` を実行してください。\n"
            "確認だけなら `python3 tools/regenerate_manifest.py --check` を使えます。"
        )
    if message.startswith("manifest.json:"):
        return (
            "これは manifest の不整合か、manifest 形式の問題です。"
        )
    if "未対応の問題タイプです" in message:
        return "許容される問題タイプ: `single_choice`, `multiple_choice`, `ordered_choice`, `text_input`"
    if "schema_version は 1 である必要があります" in message:
        return "許容される `schema_version` の値: `1`"
    if "選択問題には2件以上の選択肢が必要です" in message:
        return "選択問題には、文字列の選択肢が2件以上必要です"
    if "answer は整数の添字である必要があります" in message:
        return "選択問題の answer は、0 始まりの整数インデックスで指定します"
    if "text_input には inputs が必要です" in message:
        return "text_input には少なくとも 1 件の `inputs` が必要です"
    if "answers は空でない配列である必要があります" in message:
        return "`inputs[*].answers` は空でない文字列配列である必要があります"
    return ""


def write_report(report_path: str, title: str, message: str) -> None:
    if not report_path:
        return

    path = Path(report_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    hint = make_hint(message)
    body = [
        "<!-- json-check-report -->",
        f"### {title}",
        "",
        f"- 問題: `{message}`",
    ]
    if hint:
        body.extend(["", f"- 補足: {hint}"])
    path.write_text("\n".join(body) + "\n", encoding="utf-8")


def run_checks() -> None:
    manifest = load_json(MANIFEST_PATH)
    book_files = list(iter_book_files())
    for path in book_files:
        load_json(path)
    validate_manifest(manifest, book_files)
    generated = build_manifest()
    validate_manifest(generated, book_files)
    if manifest != generated:
        raise SystemExit("manifest.json の内容が最新ではありません")


def main() -> int:
    args = parse_args()
    book_files = list(iter_book_files())
    try:
        run_checks()
        print(f"{len(book_files)} 件の問題集ファイル、book 形式、manifest.json を検証しました")
        return 0
    except SystemExit as exc:
        message = str(exc) or "JSON の検証に失敗しました"
        write_report(args.report, "JSON チェック失敗", message)
        print(message)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
