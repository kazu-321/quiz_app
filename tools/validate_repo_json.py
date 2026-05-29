#!/usr/bin/env python3
"""Validate quiz_app JSON files and manifest consistency."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MANIFEST_PATH = ROOT / "manifest.json"


def load_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"{path}: JSON parse error: {exc}") from exc


def validate_data_files() -> list[Path]:
    book_files = sorted(DATA_DIR.rglob("*.json"))
    for path in book_files:
        load_json(path)
    return book_files


def validate_manifest(book_files: list[Path]) -> None:
    manifest = load_json(MANIFEST_PATH)
    if not isinstance(manifest, dict):
        raise SystemExit("manifest.json: top-level value must be an object")

    books = manifest.get("books")
    if not isinstance(books, list):
        raise SystemExit("manifest.json: books must be an array")

    expected_files = {path.relative_to(ROOT).as_posix() for path in book_files}
    seen_files: set[str] = set()
    seen_ids: set[str] = set()

    for index, entry in enumerate(books, start=1):
        if not isinstance(entry, dict):
            raise SystemExit(f"manifest.json: books[{index}] must be an object")

        book_id = entry.get("id")
        title = entry.get("title")
        file_text = entry.get("file")

        if not isinstance(book_id, str) or not book_id.strip():
            raise SystemExit(f"manifest.json: books[{index}].id must be a non-empty string")
        if not isinstance(title, str) or not title.strip():
            raise SystemExit(f"manifest.json: books[{index}].title must be a non-empty string")
        if not isinstance(file_text, str) or not file_text.strip():
            raise SystemExit(f"manifest.json: books[{index}].file must be a non-empty string")
        if book_id in seen_ids:
            raise SystemExit(f"manifest.json: duplicate book id: {book_id}")

        file_path = Path(file_text)
        if file_path.is_absolute() or file_path.parts[:1] != ("data",):
            raise SystemExit(f"manifest.json: books[{index}].file must point under data/")

        relative = file_path.as_posix()
        if relative not in expected_files:
            raise SystemExit(f"manifest.json: missing file on disk: {relative}")
        expected_id = file_path.with_suffix("").as_posix().removeprefix("data/")
        if book_id != expected_id:
            raise SystemExit(
                f"manifest.json: books[{index}].id must match file path without .json: "
                f"{book_id} != {expected_id}"
            )

        seen_ids.add(book_id)
        seen_files.add(relative)

        book_path = ROOT / file_path
        book = load_json(book_path)
        if not isinstance(book, dict):
            raise SystemExit(f"{relative}: top-level value must be an object")
        if book.get("id") != book_id:
            raise SystemExit(f"{relative}: id does not match manifest")
        if book.get("title") != title:
            raise SystemExit(f"{relative}: title does not match manifest")

    orphaned = sorted(expected_files - seen_files)
    if orphaned:
        joined = ", ".join(orphaned)
        raise SystemExit(f"manifest.json: files missing from manifest: {joined}")


def main() -> int:
    book_files = validate_data_files()
    validate_manifest(book_files)
    print(f"Validated {len(book_files)} book files and manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
