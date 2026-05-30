#!/usr/bin/env python3
"""Validate quiz_app JSON files, book schemas, and manifest consistency."""

from __future__ import annotations

from manifest_utils import MANIFEST_PATH, build_manifest, iter_book_files, load_json, validate_manifest

def main() -> int:
    manifest = load_json(MANIFEST_PATH)
    book_files = list(iter_book_files())
    for path in book_files:
        load_json(path)
    validate_manifest(manifest, book_files)
    generated = build_manifest()
    validate_manifest(generated, book_files)
    if manifest != generated:
        raise SystemExit("manifest.json is out of date; run tools/regenerate_manifest.py")
    print(f"Validated {len(book_files)} book files, book schema, and manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
