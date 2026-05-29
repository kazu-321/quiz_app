#!/usr/bin/env python3
"""Regenerate manifest.json from data/*.json files."""

from __future__ import annotations

import argparse

from manifest_utils import MANIFEST_PATH, build_manifest, load_json, validate_manifest, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Regenerate or verify manifest.json.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Do not write files; fail if manifest.json differs from the generated result.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = build_manifest()
    validate_manifest(manifest)
    if args.check:
        current = load_json(MANIFEST_PATH)
        if current != manifest:
            raise SystemExit("manifest.json is out of date; regenerate it with this script")
        print("manifest.json is up to date")
        return 0

    write_json(MANIFEST_PATH, manifest)
    print(f"Wrote {MANIFEST_PATH} from {len(manifest['books'])} book files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
