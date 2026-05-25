#!/usr/bin/env python3
"""Tkinter editor for quiz_app question books."""

from __future__ import annotations

import json
import re
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog, ttk


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MANIFEST_PATH = ROOT / "manifest.json"
QUESTION_TYPES = ("single_choice", "multiple_choice", "ordered_choice", "text_input")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip()).strip("_").lower()
    return slug or "book"


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


def book_relative_path(book_id: str, folder_text: str) -> Path:
    folder = normalize_folder_path(folder_text)
    filename = f"{slugify(book_id)}.json"
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


class QuestionEditorScreen(ttk.Frame):
    def __init__(self, master: tk.Misc, editor: "QuizEditor"):
        super().__init__(master, padding=10)
        self.editor = editor
        self.question: dict = {"type": "single_choice", "shuffle_choices": True}
        self.vars: dict[str, tk.Variable] = {}
        self._build()
        self.load_question(self.question)

    def _build(self) -> None:
        self.columnconfigure(1, weight=1)
        row = 0

        header = ttk.Frame(self)
        header.grid(row=row, column=0, columnspan=2, sticky="ew", padx=8, pady=(0, 8))
        header.columnconfigure(1, weight=1)
        ttk.Label(header, text="問題編集").grid(row=0, column=0, sticky="w")
        ttk.Button(header, text="戻る", command=self.editor.cancel_question_edit).grid(row=0, column=2, sticky="e")
        row += 1

        self.id_var = tk.StringVar()
        self.type_var = tk.StringVar(value="single_choice")
        self.difficulty_var = tk.StringVar()
        self.shuffle_choices_var = tk.BooleanVar()
        self.case_sensitive_var = tk.BooleanVar()
        self.trim_var = tk.BooleanVar(value=True)
        self.normalize_spaces_var = tk.BooleanVar(value=True)
        self.vars = {
            "id": self.id_var,
            "type": self.type_var,
            "difficulty": self.difficulty_var,
            "shuffle_choices": self.shuffle_choices_var,
            "case_sensitive": self.case_sensitive_var,
            "trim": self.trim_var,
            "normalize_spaces": self.normalize_spaces_var,
        }

        ttk.Label(self, text="ID").grid(row=row, column=0, sticky="w", padx=8, pady=5)
        ttk.Entry(self, textvariable=self.id_var).grid(row=row, column=1, sticky="ew", padx=8, pady=5)
        row += 1

        ttk.Label(self, text="タイプ").grid(row=row, column=0, sticky="w", padx=8, pady=5)
        type_box = ttk.Combobox(self, textvariable=self.type_var, values=QUESTION_TYPES, state="readonly")
        type_box.grid(row=row, column=1, sticky="ew", padx=8, pady=5)
        type_box.bind("<<ComboboxSelected>>", lambda _event: self._sync_type_fields())
        row += 1

        ttk.Label(self, text="問題文").grid(row=row, column=0, sticky="nw", padx=8, pady=5)
        self.question_text = tk.Text(self, height=4, width=70)
        self.question_text.grid(row=row, column=1, sticky="nsew", padx=8, pady=5)
        row += 1

        ttk.Label(self, text="選択肢").grid(row=row, column=0, sticky="nw", padx=8, pady=5)
        self.choices_text = tk.Text(self, height=5, width=70)
        self.choices_text.grid(row=row, column=1, sticky="nsew", padx=8, pady=5)
        row += 1

        ttk.Label(self, text="回答").grid(row=row, column=0, sticky="w", padx=8, pady=5)
        self.answer_entry = ttk.Entry(self)
        self.answer_entry.grid(row=row, column=1, sticky="ew", padx=8, pady=5)
        row += 1

        ttk.Label(self, text="入力欄").grid(row=row, column=0, sticky="nw", padx=8, pady=5)
        self.inputs_text = tk.Text(self, height=5, width=70)
        self.inputs_text.grid(row=row, column=1, sticky="nsew", padx=8, pady=5)
        row += 1

        ttk.Label(self, text="解説").grid(row=row, column=0, sticky="nw", padx=8, pady=5)
        self.explanation_text = tk.Text(self, height=4, width=70)
        self.explanation_text.grid(row=row, column=1, sticky="nsew", padx=8, pady=5)
        row += 1

        ttk.Label(self, text="タグ").grid(row=row, column=0, sticky="w", padx=8, pady=5)
        self.tags_entry = ttk.Entry(self)
        self.tags_entry.grid(row=row, column=1, sticky="ew", padx=8, pady=5)
        row += 1

        ttk.Label(self, text="難易度").grid(row=row, column=0, sticky="w", padx=8, pady=5)
        ttk.Entry(self, textvariable=self.difficulty_var).grid(row=row, column=1, sticky="ew", padx=8, pady=5)
        row += 1

        options = ttk.Frame(self)
        options.grid(row=row, column=1, sticky="w", padx=8, pady=5)
        ttk.Checkbutton(options, text="選択肢をシャッフル", variable=self.shuffle_choices_var).pack(side="left")
        ttk.Checkbutton(options, text="大文字小文字を区別", variable=self.case_sensitive_var).pack(side="left", padx=8)
        ttk.Checkbutton(options, text="前後空白を無視", variable=self.trim_var).pack(side="left", padx=8)
        ttk.Checkbutton(options, text="連続空白を1つに正規化", variable=self.normalize_spaces_var).pack(side="left", padx=8)
        row += 1

        help_text = (
            "選択肢: 1行1件。回答: single は index、multiple/ordered は 0,2 の形式。\n"
            "入力欄: label|answer1,answer2 を1行1件。例: 一覧表示|ls"
        )
        ttk.Label(self, text=help_text, foreground="#555").grid(row=row, column=1, sticky="w", padx=8, pady=5)
        row += 1

        buttons = ttk.Frame(self)
        buttons.grid(row=row, column=1, sticky="e", padx=8, pady=10)
        ttk.Button(buttons, text="キャンセル", command=self.editor.cancel_question_edit).pack(side="right", padx=4)
        ttk.Button(buttons, text="保存", command=self._save).pack(side="right", padx=4)

    def load_question(self, question: dict) -> None:
        self.question = question
        self.id_var.set(question.get("id", ""))
        self.type_var.set(question.get("type", "single_choice"))
        self.difficulty_var.set(str(question.get("difficulty", "")))
        self.shuffle_choices_var.set(bool(question.get("shuffle_choices", False)))
        self.case_sensitive_var.set(bool(question.get("case_sensitive", False)))
        self.trim_var.set(bool(question.get("trim", True)))
        self.normalize_spaces_var.set(bool(question.get("normalize_spaces", True)))

        self.question_text.delete("1.0", "end")
        self.question_text.insert("1.0", question.get("question", ""))
        self.choices_text.delete("1.0", "end")
        self.choices_text.insert("1.0", "\n".join(question.get("choices", [])))
        self.answer_entry.delete(0, "end")
        self.answer_entry.insert(0, format_index_list(question.get("answer")))
        self.explanation_text.delete("1.0", "end")
        self.explanation_text.insert("1.0", question.get("explanation", ""))
        self.tags_entry.delete(0, "end")
        self.tags_entry.insert(0, ", ".join(question.get("tags", [])))
        self.inputs_text.delete("1.0", "end")
        inputs = []
        for item in question.get("inputs", []):
            inputs.append(f"{item.get('label', '')}|{','.join(item.get('answers', []))}")
        self.inputs_text.insert("1.0", "\n".join(inputs))
        self._sync_type_fields()

    def focus_first_field(self) -> None:
        self.question_text.focus_set()

    def _sync_type_fields(self) -> None:
        qtype = self.type_var.get()
        choice_state = "normal" if qtype in {"single_choice", "multiple_choice", "ordered_choice"} else "disabled"
        input_state = "normal" if qtype == "text_input" else "disabled"
        self.choices_text.configure(state=choice_state)
        self.answer_entry.configure(state=choice_state)
        self.inputs_text.configure(state=input_state)

    def _save(self) -> None:
        try:
            question = self._collect()
            validate_question(question)
        except Exception as exc:
            messagebox.showerror("入力エラー", str(exc), parent=self)
            return
        self.editor.finish_question_edit(question)

    def _collect(self) -> dict:
        qtype = self.type_var.get()
        question = {
            "id": self.id_var.get().strip(),
            "type": qtype,
            "question": self.question_text.get("1.0", "end").strip(),
        }
        explanation = self.explanation_text.get("1.0", "end").strip()
        tags = [tag.strip() for tag in self.tags_entry.get().split(",") if tag.strip()]
        difficulty = self.difficulty_var.get().strip()
        if explanation:
            question["explanation"] = explanation
        if tags:
            question["tags"] = tags
        if difficulty:
            question["difficulty"] = int(difficulty)

        if qtype in {"single_choice", "multiple_choice", "ordered_choice"}:
            question["choices"] = [
                line.strip() for line in self.choices_text.get("1.0", "end").splitlines() if line.strip()
            ]
            question["shuffle_choices"] = bool(self.shuffle_choices_var.get())
            if qtype == "single_choice":
                question["answer"] = int(self.answer_entry.get().strip())
            else:
                question["answer"] = parse_index_list(self.answer_entry.get())
        else:
            inputs = []
            for line in self.inputs_text.get("1.0", "end").splitlines():
                if not line.strip():
                    continue
                if "|" not in line:
                    raise ValueError("入力欄は label|answer1,answer2 の形式で入力してください。")
                label, answers = line.split("|", 1)
                inputs.append(
                    {
                        "label": label.strip(),
                        "answers": [answer.strip() for answer in answers.split(",") if answer.strip()],
                    }
                )
            question["inputs"] = inputs
            question["case_sensitive"] = bool(self.case_sensitive_var.get())
            question["trim"] = bool(self.trim_var.get())
            question["normalize_spaces"] = bool(self.normalize_spaces_var.get())
        return question


class BookSelectScreen(ttk.Frame):
    def __init__(self, master: tk.Misc, editor: "QuizEditor"):
        super().__init__(master, padding=10)
        self.editor = editor
        self._build()

    def _build(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        ttk.Label(self, text="1. 問題集選択").grid(row=0, column=0, sticky="w")
        self.book_list = tk.Listbox(self, height=20)
        self.book_list.grid(row=1, column=0, sticky="nsew", pady=6)
        self.book_list.bind("<<ListboxSelect>>", lambda _event: self.editor.open_selected_book())
        self.book_list.bind("<Double-Button-1>", lambda _event: self.editor.open_selected_book())

        buttons = ttk.Frame(self)
        buttons.grid(row=2, column=0, sticky="ew")
        ttk.Button(buttons, text="新規作成", command=self.editor.new_book).pack(side="left", padx=3)
        ttk.Button(buttons, text="ファイルを開く", command=self.editor.open_file).pack(side="left", padx=3)
        ttk.Button(buttons, text="manifest再生成", command=self.editor.regenerate_manifest).pack(side="left", padx=3)

    def refresh(self) -> None:
        self.book_list.delete(0, tk.END)
        DATA_DIR.mkdir(exist_ok=True)
        for path in sorted(DATA_DIR.rglob("*.json")):
            self.book_list.insert(tk.END, path.relative_to(DATA_DIR).as_posix())
        if self.editor.book_path is not None:
            try:
                relative = self.editor.book_path.relative_to(DATA_DIR).as_posix()
            except ValueError:
                return
            items = self.book_list.get(0, tk.END)
            if relative in items:
                index = items.index(relative)
                self.book_list.selection_set(index)
                self.book_list.see(index)


class QuestionListScreen(ttk.Frame):
    def __init__(self, master: tk.Misc, editor: "QuizEditor"):
        super().__init__(master, padding=10)
        self.editor = editor
        self._build()

    def _build(self) -> None:
        self.columnconfigure(1, weight=1)
        self.rowconfigure(6, weight=1)

        header = ttk.Frame(self)
        header.grid(row=0, column=0, columnspan=2, sticky="ew")
        header.columnconfigure(1, weight=1)
        ttk.Label(header, text="2. 問題選択").grid(row=0, column=0, sticky="w")
        ttk.Button(header, text="問題集へ戻る", command=self.editor.show_book_select).grid(row=0, column=2, sticky="e")

        self.id_var = tk.StringVar()
        self.title_var = tk.StringVar()
        self.description_var = tk.StringVar()
        self.folder_var = tk.StringVar()

        ttk.Label(self, text="問題集ID").grid(row=1, column=0, sticky="w", pady=4)
        ttk.Entry(self, textvariable=self.id_var).grid(row=1, column=1, sticky="ew", pady=4)
        ttk.Label(self, text="タイトル").grid(row=2, column=0, sticky="w", pady=4)
        ttk.Entry(self, textvariable=self.title_var).grid(row=2, column=1, sticky="ew", pady=4)
        ttk.Label(self, text="説明").grid(row=3, column=0, sticky="w", pady=4)
        ttk.Entry(self, textvariable=self.description_var).grid(row=3, column=1, sticky="ew", pady=4)
        ttk.Label(self, text="フォルダ").grid(row=4, column=0, sticky="w", pady=4)
        ttk.Entry(self, textvariable=self.folder_var).grid(row=4, column=1, sticky="ew", pady=4)

        action_bar = ttk.Frame(self)
        action_bar.grid(row=5, column=0, columnspan=2, sticky="ew", pady=8)
        ttk.Button(action_bar, text="問題追加", command=self.editor.add_question).pack(side="left", padx=3)
        ttk.Button(action_bar, text="問題編集", command=self.editor.edit_question).pack(side="left", padx=3)
        ttk.Button(action_bar, text="問題削除", command=self.editor.delete_question).pack(side="left", padx=3)
        ttk.Button(action_bar, text="問題集削除", command=self.editor.delete_book).pack(side="left", padx=3)
        ttk.Button(action_bar, text="保存", command=self.editor.save_book).pack(side="right", padx=3)

        self.question_list = tk.Listbox(self)
        self.question_list.grid(row=6, column=0, columnspan=2, sticky="nsew")
        self.question_list.bind("<Double-Button-1>", lambda _event: self.editor.edit_question())

        self.status_var = tk.StringVar()
        ttk.Label(self, textvariable=self.status_var).grid(row=7, column=0, columnspan=2, sticky="w", pady=6)

    def refresh(self) -> None:
        self.id_var.set(self.editor.book.get("id", ""))
        self.title_var.set(self.editor.book.get("title", ""))
        self.description_var.set(self.editor.book.get("description", ""))
        self.folder_var.set(folder_from_book_path(self.editor.book_path))
        self.question_list.delete(0, tk.END)
        for question in self.editor.book.get("questions", []):
            self.question_list.insert(tk.END, f"{question.get('id')} [{question.get('type')}] {question.get('question')}")
        path_text = str(self.editor.book_path.relative_to(ROOT)) if self.editor.book_path else "未保存"
        self.status_var.set(f"{path_text} / {len(self.editor.book.get('questions', []))}問")


class QuizEditor(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Quiz App Editor")
        self.geometry("1120x760")
        self.book_path: Path | None = None
        self.book = self._empty_book()
        self.editing_question_index: int | None = None
        self._build()
        self.show_book_select()
        self.refresh_book_list()
        self.refresh_question_list()

    def _empty_book(self) -> dict:
        return {"schema_version": 1, "id": "new_book", "title": "新しい問題集", "description": "", "questions": []}

    def _build(self) -> None:
        self.container = ttk.Frame(self)
        self.container.pack(fill="both", expand=True)
        self.container.rowconfigure(0, weight=1)
        self.container.columnconfigure(0, weight=1)

        self.book_select_screen = BookSelectScreen(self.container, self)
        self.question_list_screen = QuestionListScreen(self.container, self)
        self.question_editor_screen = QuestionEditorScreen(self.container, self)

        for screen in (self.book_select_screen, self.question_list_screen, self.question_editor_screen):
            screen.grid(row=0, column=0, sticky="nsew")

    def show_screen(self, screen: tk.Widget) -> None:
        screen.tkraise()

    def show_book_select(self) -> None:
        self.refresh_book_list()
        self.show_screen(self.book_select_screen)

    def show_question_list(self) -> None:
        self.refresh_question_list()
        self.show_screen(self.question_list_screen)

    def show_question_editor(self, question: dict, index: int | None) -> None:
        self.editing_question_index = index
        self.question_editor_screen.load_question(question)
        self.show_screen(self.question_editor_screen)
        self.after_idle(self.question_editor_screen.focus_first_field)

    def refresh_book_list(self) -> None:
        self.book_select_screen.refresh()

    def refresh_question_list(self) -> None:
        self.question_list_screen.refresh()

    def sync_book_fields(self) -> None:
        self.book["id"] = self.question_list_screen.id_var.get().strip()
        self.book["title"] = self.question_list_screen.title_var.get().strip()
        self.book["description"] = self.question_list_screen.description_var.get().strip()

    def new_book(self) -> None:
        title = simpledialog.askstring("新規問題集", "タイトルを入力してください。", parent=self)
        if title is None:
            return
        book_id = slugify(simpledialog.askstring("新規問題集", "問題集IDを入力してください。", initialvalue=slugify(title), parent=self) or title)
        self.book_path = DATA_DIR / f"{book_id}.json"
        self.book = {"schema_version": 1, "id": book_id, "title": title, "description": "", "questions": []}
        self.show_question_list()

    def open_selected_book(self) -> None:
        selection = self.book_select_screen.book_list.curselection()
        if not selection:
            return
        self.open_path(DATA_DIR / self.book_select_screen.book_list.get(selection[0]))

    def open_file(self) -> None:
        path = filedialog.askopenfilename(
            parent=self,
            initialdir=DATA_DIR,
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
        )
        if path:
            self.open_path(Path(path))

    def open_path(self, path: Path) -> None:
        try:
            book = read_json(path)
            validate_book(book)
        except Exception as exc:
            messagebox.showerror("読み込みエラー", str(exc), parent=self)
            return
        self.book_path = path
        self.book = book
        self.show_question_list()

    def next_question_id(self) -> str:
        used = {question.get("id") for question in self.book.get("questions", [])}
        number = 1
        while True:
            candidate = f"q{number:03d}"
            if candidate not in used:
                return candidate
            number += 1

    def selected_question_index(self) -> int | None:
        selection = self.question_list_screen.question_list.curselection()
        return selection[0] if selection else None

    def add_question(self) -> None:
        self.show_question_editor(
            {"id": self.next_question_id(), "type": "single_choice", "shuffle_choices": True},
            None,
        )

    def edit_question(self) -> None:
        index = self.selected_question_index()
        if index is None:
            messagebox.showinfo("問題編集", "問題を選択してください。", parent=self)
            return
        self.show_question_editor(dict(self.book["questions"][index]), index)

    def finish_question_edit(self, question: dict) -> None:
        if self.editing_question_index is None:
            self.book.setdefault("questions", []).append(question)
        else:
            self.book["questions"][self.editing_question_index] = question
        self.editing_question_index = None
        self.show_question_list()

    def cancel_question_edit(self) -> None:
        self.editing_question_index = None
        self.show_question_list()

    def delete_question(self) -> None:
        index = self.selected_question_index()
        if index is None:
            return
        if not messagebox.askyesno("問題削除", "選択した問題を削除しますか？", parent=self):
            return
        del self.book["questions"][index]
        self.refresh_question_list()

    def save_book(self) -> None:
        self.sync_book_fields()
        try:
            validate_book(self.book)
            desired_relative = book_relative_path(self.book["id"], self.question_list_screen.folder_var.get())
        except Exception as exc:
            messagebox.showerror("保存エラー", str(exc), parent=self)
            return

        desired_path = DATA_DIR / desired_relative
        if self.book_path is not None and self.book_path != desired_path and desired_path.exists():
            if not messagebox.askyesno(
                "上書き確認",
                f"{desired_relative.as_posix()} は既に存在します。上書きしますか？",
                parent=self,
            ):
                return

        if self.book_path is not None and self.book_path != desired_path and self.book_path.exists():
            desired_path.parent.mkdir(parents=True, exist_ok=True)
            self.book_path.rename(desired_path)

        write_json(desired_path, self.book)
        self.book_path = desired_path
        generate_manifest()
        self.refresh_book_list()
        self.refresh_question_list()
        messagebox.showinfo("保存", "問題集と manifest.json を保存しました。", parent=self)

    def delete_book(self) -> None:
        if self.book_path is None:
            messagebox.showinfo("問題集削除", "削除する問題集を開いてください。", parent=self)
            return
        relative = self.book_path.relative_to(ROOT) if self.book_path.is_relative_to(ROOT) else self.book_path
        if not messagebox.askyesno("問題集削除", f"{relative} を削除しますか？", parent=self):
            return
        try:
            if self.book_path.exists():
                self.book_path.unlink()
            if self.book_path.parent.is_relative_to(DATA_DIR):
                cleanup_empty_dirs(self.book_path.parent, DATA_DIR)
        except Exception as exc:
            messagebox.showerror("削除エラー", str(exc), parent=self)
            return

        self.book_path = None
        self.book = self._empty_book()
        generate_manifest()
        self.refresh_book_list()
        self.refresh_question_list()
        self.show_book_select()
        messagebox.showinfo("問題集削除", "問題集を削除しました。", parent=self)

    def regenerate_manifest(self) -> None:
        manifest = generate_manifest()
        self.refresh_book_list()
        messagebox.showinfo("manifest再生成", f"{len(manifest['books'])} 件を manifest.json に保存しました。", parent=self)


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
            if not item.get("answers"):
                raise ValueError("各入力欄には許容解答が必要です。")


def validate_book(book: dict) -> None:
    if book.get("schema_version") != 1:
        raise ValueError("schema_version は 1 にしてください。")
    if not book.get("id"):
        raise ValueError("問題集IDが必要です。")
    if not book.get("title"):
        raise ValueError("問題集タイトルが必要です。")
    if not isinstance(book.get("questions"), list):
        raise ValueError("questions は配列にしてください。")
    ids = set()
    for question in book["questions"]:
        validate_question(question)
        if question["id"] in ids:
            raise ValueError(f"問題IDが重複しています: {question['id']}")
        ids.add(question["id"])


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    app = QuizEditor()
    app.mainloop()


if __name__ == "__main__":
    main()
