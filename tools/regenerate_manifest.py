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
        help="ファイルは書き込まず、manifest.json が生成結果と違えば失敗します。",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = build_manifest()
    validate_manifest(manifest)
    if args.check:
        current = load_json(MANIFEST_PATH)
        if current != manifest:
            raise SystemExit("manifest.json の内容が最新ではありません")
        print("manifest.json は最新です")
        return 0

    write_json(MANIFEST_PATH, manifest)
    print(f"{MANIFEST_PATH} を {len(manifest['books'])} 件の問題集から生成しました")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
