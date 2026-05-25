#!/usr/bin/env python3
"""Local web-based editor for quiz_app question books."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import urllib.parse
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
WEB_DIR = ROOT / "tools" / "web_editor"
MANIFEST_PATH = ROOT / "manifest.json"
QUESTION_TYPES = ("single_choice", "multiple_choice", "ordered_choice", "text_input")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local quiz_app web editor.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1).")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind to (default: 8765).")
    parser.add_argument("--no-open-browser", action="store_true", help="Do not open the browser automatically.")
    return parser.parse_args()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_index_list(value: str) -> list[int]:
    if not value.strip():
        return []
    return [int(part.strip()) for part in value.split(",") if part.strip()]


def format_index_list(value: object) -> str:
    if isinstance(value, list):
        return ", ".join(str(item) for item in value)
    if value is None:
        return ""
    return str(value)


def folder_from_book_path(path: Path | None) -> str:
    if path is None:
        return ""
    try:
        relative = path.relative_to(DATA_DIR)
    except ValueError:
        return ""
    parent = relative.parent
    return "" if str(parent) == "." else parent.as_posix()


def normalize_folder_path(value: str) -> Path:
    text = value.strip().replace("\\", "/")
    if not text:
        return Path()
    path = Path(text)
    if path.is_absolute():
        raise ValueError("フォルダは相対パスで指定してください。")
    parts = []
    for part in path.parts:
        if part in {"", ".", "/"}:
            continue
        if part == "..":
            raise ValueError("フォルダに .. は使えません。")
        parts.append(part)
    return Path(*parts)


def book_id_from(folder_text: str, title: str) -> str:
    folder = normalize_folder_path(folder_text)
    title_text = title.strip()
    parts = [part for part in folder.parts if part]
    if title_text:
        parts.append(title_text)
    return "/".join(parts)


def book_relative_path(folder_text: str, title: str) -> Path:
    folder = normalize_folder_path(folder_text)
    title_text = title.strip()
    if not title_text:
        raise ValueError("問題集タイトルが必要です。")
    if any(sep in title_text for sep in ("/", "\\")):
        raise ValueError("タイトルに / や \\ は使えません。")
    filename = f"{title_text}.json"
    return folder / filename if folder.parts else Path(filename)


def cleanup_empty_dirs(path: Path, stop_at: Path) -> None:
    current = path
    while current != stop_at and current.exists():
        try:
            current.rmdir()
        except OSError:
            break
        current = current.parent


def generate_manifest() -> dict:
    books = []
    for path in sorted(DATA_DIR.rglob("*.json")):
        try:
            data = read_json(path)
        except Exception:
            continue
        if not data.get("id") or not data.get("title"):
            continue
        books.append(
            {
                "id": data["id"],
                "title": data["title"],
                "description": data.get("description", ""),
                "file": f"data/{path.relative_to(DATA_DIR).as_posix()}",
            }
        )
    manifest = {"schema_version": 1, "books": books}
    write_json(MANIFEST_PATH, manifest)
    return manifest


def validate_question(question: dict) -> None:
    if not question.get("id"):
        raise ValueError("問題IDが必要です。")
    if question.get("type") not in QUESTION_TYPES:
        raise ValueError("未対応の問題タイプです。")
    if not question.get("question"):
        raise ValueError("問題文が必要です。")

    qtype = question["type"]
    if qtype in {"single_choice", "multiple_choice", "ordered_choice"}:
        choices = question.get("choices") or []
        if len(choices) < 2:
            raise ValueError("選択問題には2件以上の選択肢が必要です。")
        answers = question["answer"] if isinstance(question["answer"], list) else [question["answer"]]
        for index in answers:
            if index < 0 or index >= len(choices):
                raise ValueError("回答 index が選択肢の範囲外です。")
    if qtype == "text_input":
        inputs = question.get("inputs") or []
        if not inputs:
            raise ValueError("入力問題には入力欄が必要です。")
        for item in inputs:
            if not isinstance(item, dict):
                raise ValueError("入力欄の形式が正しくありません。")
            if not item.get("answers"):
                raise ValueError("各入力欄には許容解答が必要です。")


def validate_book(book: dict) -> None:
    if book.get("schema_version") != 1:
        raise ValueError("schema_version は 1 にしてください。")
    if not book.get("id"):
        raise ValueError("問題集IDが必要です。")
    title = (book.get("title") or "").strip()
    if not title:
        raise ValueError("問題集タイトルが必要です。")
    if any(sep in title for sep in ("/", "\\")):
        raise ValueError("問題集タイトルに / や \\ は使えません。")
    questions = book.get("questions")
    if not isinstance(questions, list):
        raise ValueError("questions は配列である必要があります。")
    for question in questions:
        if not isinstance(question, dict):
            raise ValueError("問題の形式が正しくありません。")
        validate_question(question)


def list_books() -> list[dict]:
    books: list[dict] = []
    for path in sorted(DATA_DIR.rglob("*.json")):
        try:
            data = read_json(path)
        except Exception:
            continue
        if not data.get("id") or not data.get("title"):
            continue
        books.append(
            {
                "id": data["id"],
                "title": data["title"],
                "description": data.get("description", ""),
                "file": f"data/{path.relative_to(DATA_DIR).as_posix()}",
                "folder": folder_from_book_path(path),
                "question_count": len(data.get("questions", [])),
            }
        )
    return books


def load_book(file_text: str) -> dict:
    relative = Path(file_text)
    if relative.is_absolute() or relative.parts[:1] != ("data",):
        raise ValueError("data/ 配下のファイルを指定してください。")
    path = ROOT / relative
    book = read_json(path)
    validate_book(book)
    return {
        "book": book,
        "file": relative.as_posix(),
        "folder": folder_from_book_path(path),
    }


def save_book(payload: dict) -> dict:
    book = payload.get("book")
    if not isinstance(book, dict):
        raise ValueError("book が必要です。")
    original_file = payload.get("original_file")
    overwrite = bool(payload.get("overwrite", False))

    validate_book(book)

    desired_relative = Path(f"{book['id']}.json")
    desired_path = DATA_DIR / desired_relative
    original_path = None
    if original_file:
        original_relative = Path(original_file)
        if original_relative.is_absolute() or original_relative.parts[:1] != ("data",):
            raise ValueError("original_file は data/ 配下である必要があります。")
        original_path = ROOT / original_relative

    if desired_path.exists() and original_path != desired_path and not overwrite:
        raise FileExistsError(f"{desired_relative.as_posix()} は既に存在します。")

    if original_path and original_path.exists() and original_path != desired_path:
        desired_path.parent.mkdir(parents=True, exist_ok=True)
        if desired_path.exists() and overwrite:
            desired_path.unlink()
        original_path.rename(desired_path)
    else:
        desired_path.parent.mkdir(parents=True, exist_ok=True)

    write_json(desired_path, book)
    manifest = generate_manifest()
    return {
        "file": f"data/{desired_relative.as_posix()}",
        "manifest": manifest,
        "book": book,
    }


def delete_book(file_text: str) -> dict:
    relative = Path(file_text)
    if relative.is_absolute() or relative.parts[:1] != ("data",):
        raise ValueError("data/ 配下のファイルを指定してください。")
    path = ROOT / relative
    if path.exists():
        path.unlink()
        cleanup_empty_dirs(path.parent, DATA_DIR)
    manifest = generate_manifest()
    return {"manifest": manifest}


def json_response(handler: SimpleHTTPRequestHandler, status: HTTPStatus, payload: dict) -> None:
    data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def read_request_json(handler: SimpleHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length) if length else b"{}"
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


class WebEditorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            self.path = "/tools/web_editor/index.html"
            return super().do_GET()
        if parsed.path == "/api/books":
            return json_response(self, HTTPStatus.OK, {"books": list_books()})
        if parsed.path == "/api/manifest":
            return json_response(self, HTTPStatus.OK, {"manifest": read_json(MANIFEST_PATH)})
        if parsed.path == "/api/book":
            params = urllib.parse.parse_qs(parsed.query)
            file_text = params.get("file", [""])[0]
            try:
                return json_response(self, HTTPStatus.OK, load_book(file_text))
            except Exception as exc:
                return json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        try:
            payload = read_request_json(self)
            if parsed.path == "/api/save":
                return json_response(self, HTTPStatus.OK, save_book(payload))
            if parsed.path == "/api/regenerate":
                return json_response(self, HTTPStatus.OK, {"manifest": generate_manifest()})
            return json_response(self, HTTPStatus.NOT_FOUND, {"error": "Unknown endpoint"})
        except FileExistsError as exc:
            return json_response(self, HTTPStatus.CONFLICT, {"error": str(exc)})
        except Exception as exc:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def do_DELETE(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/book":
            return json_response(self, HTTPStatus.NOT_FOUND, {"error": "Unknown endpoint"})
        params = urllib.parse.parse_qs(parsed.query)
        file_text = params.get("file", [""])[0]
        try:
            return json_response(self, HTTPStatus.OK, delete_book(file_text))
        except Exception as exc:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))


def main() -> int:
    args = parse_args()
    mimetypes.add_type("text/javascript", ".js")
    mimetypes.add_type("text/css", ".css")

    server = ThreadingHTTPServer((args.host, args.port), WebEditorHandler)
    url = f"http://{args.host}:{args.port}/"
    print(f"Serving {ROOT} at {url}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    print("Server stopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
