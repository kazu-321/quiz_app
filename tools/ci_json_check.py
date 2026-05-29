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
    if "manifest.json is out of date" in message:
        return (
            "manifest.json is generated from `data/**/*.json`.\n"
            "Run `python3 tools/regenerate_manifest.py` to regenerate it, or `--check` to verify."
        )
    if message.startswith("manifest.json:"):
        return (
            "This is a manifest mismatch or manifest schema problem.\n"
            "If you edited `data/**/*.json`, run `python3 tools/regenerate_manifest.py`.\n"
            "If you edited `manifest.json` directly, the generated result must still match exactly."
        )
    if ": unsupported type:" in message:
        return "Allowed question types: `single_choice`, `multiple_choice`, `ordered_choice`, `text_input`."
    if ": schema_version must be 1" in message:
        return "Allowed `schema_version` value: `1`."
    if ": choice questions need at least 2 choices" in message:
        return "Choice questions need at least 2 string choices."
    if ": answer indices must be integers" in message:
        return "Answers for choice questions must be 0-based integer indices."
    if ": text_input questions need inputs" in message:
        return "Text input questions need at least one `inputs` entry."
    if ": answers must be a non-empty array" in message:
        return "Each `inputs[*].answers` must be a non-empty string array."
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
        f"`{message}`",
    ]
    if hint:
        body.extend(["", hint])
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
        raise SystemExit("manifest.json is out of date; run tools/regenerate_manifest.py")


def main() -> int:
    args = parse_args()
    book_files = list(iter_book_files())
    try:
        run_checks()
        print(f"Validated {len(book_files)} book files, book schema, and manifest.json")
        return 0
    except SystemExit as exc:
        message = str(exc) or "JSON validation failed"
        write_report(args.report, "JSON check failed", message)
        print(message)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
