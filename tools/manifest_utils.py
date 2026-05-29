#!/usr/bin/env python3
"""Shared helpers for quiz_app JSON books and manifest generation."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MANIFEST_PATH = ROOT / "manifest.json"
QUESTION_TYPES = ("single_choice", "multiple_choice", "ordered_choice", "text_input")


def load_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"{path}: JSONの構文エラー: {exc}") from exc


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def iter_book_files() -> list[Path]:
    return sorted(DATA_DIR.rglob("*.json"))


def validate_question(question: dict, index: int | None = None) -> None:
    prefix = f"question[{index}]" if index is not None else "question"
    if not question.get("id"):
        raise SystemExit(f"{prefix}: IDが必要です")
    if question.get("type") not in QUESTION_TYPES:
        raise SystemExit(f"{prefix}: 未対応の問題タイプです: {question.get('type')!r}")
    if not question.get("question"):
        raise SystemExit(f"{prefix}: 問題文が必要です")
    if "explanation" in question and not isinstance(question["explanation"], str):
        raise SystemExit(f"{prefix}: explanation は文字列である必要があります")
    if "tags" in question:
        tags = question["tags"]
        if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
            raise SystemExit(f"{prefix}: tags は文字列配列である必要があります")
    if "difficulty" in question and not isinstance(question["difficulty"], int):
        raise SystemExit(f"{prefix}: difficulty は整数である必要があります")

    qtype = question["type"]
    if qtype in {"single_choice", "multiple_choice", "ordered_choice"}:
        choices = question.get("choices") or []
        if len(choices) < 2:
            raise SystemExit(f"{prefix}: 選択問題には2件以上の選択肢が必要です")
        if not all(isinstance(choice, str) for choice in choices):
            raise SystemExit(f"{prefix}: choices は文字列のみである必要があります")
        answers = question["answer"] if isinstance(question.get("answer"), list) else [question.get("answer")]
        for answer in answers:
            if not isinstance(answer, int):
                raise SystemExit(f"{prefix}: answer は整数の添字である必要があります")
            if answer < 0 or answer >= len(choices):
                raise SystemExit(f"{prefix}: answer の添字が範囲外です: {answer}")
    if qtype == "text_input":
        inputs = question.get("inputs") or []
        if not inputs:
            raise SystemExit(f"{prefix}: text_input には inputs が必要です")
        for flag_name in ("input_ordered", "case_sensitive", "trim", "normalize_spaces"):
            if flag_name in question and not isinstance(question[flag_name], bool):
                raise SystemExit(f"{prefix}: {flag_name} は真偽値である必要があります")
        for input_index, item in enumerate(inputs, start=1):
            if not isinstance(item, dict):
                raise SystemExit(f"{prefix}.inputs[{input_index}]: オブジェクトである必要があります")
            answers = item.get("answers")
            if not isinstance(answers, list) or not answers:
                raise SystemExit(f"{prefix}.inputs[{input_index}]: answers は空でない配列である必要があります")
            if not all(isinstance(answer, str) for answer in answers):
                raise SystemExit(f"{prefix}.inputs[{input_index}]: answers は文字列のみである必要があります")


def validate_book(book: dict, path: Path | None = None) -> None:
    label = path.as_posix() if path is not None else "book"
    if book.get("schema_version") != 1:
        raise SystemExit(f"{label}: schema_version は 1 である必要があります")
    book_id = book.get("id")
    if not isinstance(book_id, str) or not book_id.strip():
        raise SystemExit(f"{label}: IDが必要です")
    title = book.get("title")
    if not isinstance(title, str) or not title.strip():
        raise SystemExit(f"{label}: title が必要です")
    if any(sep in title for sep in ("/", "\\")):
        raise SystemExit(f"{label}: title に / や \\ は使えません")
    questions = book.get("questions")
    if not isinstance(questions, list):
        raise SystemExit(f"{label}: questions は配列である必要があります")

    seen_ids: set[str] = set()
    for index, question in enumerate(questions, start=1):
        if not isinstance(question, dict):
            raise SystemExit(f"{label}: question[{index}] はオブジェクトである必要があります")
        question_id = question.get("id")
        if isinstance(question_id, str):
            if question_id in seen_ids:
                raise SystemExit(f"{label}: question ID が重複しています: {question_id}")
            seen_ids.add(question_id)
        validate_question(question, index=index)


def build_manifest() -> dict:
    books = []
    for path in iter_book_files():
        book = load_json(path)
        if not isinstance(book, dict):
            raise SystemExit(f"{path}: ルートはオブジェクトである必要があります")
        validate_book(book, path)
        books.append(
            {
                "id": book["id"],
                "title": book["title"],
                "description": book.get("description", ""),
                "file": f"data/{path.relative_to(DATA_DIR).as_posix()}",
            }
        )
    return {"schema_version": 1, "books": books}


def validate_manifest(manifest: dict, book_files: list[Path] | None = None) -> None:
    if not isinstance(manifest, dict):
        raise SystemExit("manifest.json: ルートはオブジェクトである必要があります")

    books = manifest.get("books")
    if not isinstance(books, list):
        raise SystemExit("manifest.json: books は配列である必要があります")

    expected_files = {path.relative_to(ROOT).as_posix() for path in (book_files or iter_book_files())}
    seen_files: set[str] = set()
    seen_ids: set[str] = set()

    for index, entry in enumerate(books, start=1):
        if not isinstance(entry, dict):
            raise SystemExit(f"manifest.json: books[{index}] はオブジェクトである必要があります")

        book_id = entry.get("id")
        title = entry.get("title")
        description = entry.get("description", "")
        file_text = entry.get("file")

        if not isinstance(book_id, str) or not book_id.strip():
            raise SystemExit(f"manifest.json: books[{index}].id が必要です")
        if not isinstance(title, str) or not title.strip():
            raise SystemExit(f"manifest.json: books[{index}].title が必要です")
        if not isinstance(file_text, str) or not file_text.strip():
            raise SystemExit(f"manifest.json: books[{index}].file が必要です")
        if not isinstance(description, str):
            raise SystemExit(f"manifest.json: books[{index}].description は文字列である必要があります")
        if book_id in seen_ids:
            raise SystemExit(f"manifest.json: book ID が重複しています: {book_id}")

        file_path = Path(file_text)
        if file_path.is_absolute() or file_path.parts[:1] != ("data",):
            raise SystemExit(f"manifest.json: books[{index}].file は data/ 配下を指す必要があります")

        relative = file_path.as_posix()
        if relative not in expected_files:
            raise SystemExit(f"manifest.json: ディスク上に存在しないファイルがあります: {relative}")
        expected_id = file_path.with_suffix("").as_posix().removeprefix("data/")
        if book_id != expected_id:
            raise SystemExit(
                f"manifest.json: books[{index}].id は拡張子を除いたファイルパスと一致する必要があります: "
                f"{book_id} != {expected_id}"
            )

        seen_ids.add(book_id)
        seen_files.add(relative)

        book_path = ROOT / file_path
        book = load_json(book_path)
        if not isinstance(book, dict):
            raise SystemExit(f"{relative}: ルートはオブジェクトである必要があります")
        if book.get("id") != book_id:
            raise SystemExit(f"{relative}: id が manifest と一致しません")
        if book.get("title") != title:
            raise SystemExit(f"{relative}: title が manifest と一致しません")
        if book.get("description", "") != description:
            raise SystemExit(f"{relative}: description が manifest と一致しません")

        validate_book(book, book_path)

    orphaned = sorted(expected_files - seen_files)
    if orphaned:
        joined = ", ".join(orphaned)
        raise SystemExit(f"manifest.json: manifest に含まれていないファイルがあります: {joined}")
