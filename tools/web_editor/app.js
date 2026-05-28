(async function () {
  const state = {
    books: [],
    currentBook: null,
    currentBookFile: null,
    currentBookFolder: "",
    selectedQuestionIndex: null,
    editingQuestionIndex: null,
    questionDirty: false,
    suppressQuestionDirty: false,
  };

  const els = {
    message: document.getElementById("message"),
    hardReloadButton: document.getElementById("hard-reload"),
    bookScreen: document.getElementById("screen-books"),
    bookEditorScreen: document.getElementById("screen-book"),
    questionScreen: document.getElementById("screen-question"),
    bookCount: document.getElementById("book-count"),
    bookList: document.getElementById("book-list"),
    refreshBooks: document.getElementById("refresh-books"),
    newBook: document.getElementById("new-book"),
    regenerateManifest: document.getElementById("regenerate-manifest"),
    backToBooks: document.getElementById("back-to-books"),
    currentBookPath: document.getElementById("current-book-path"),
    bookId: document.getElementById("book-id"),
    bookTitle: document.getElementById("book-title"),
    bookFolder: document.getElementById("book-folder"),
    bookDescription: document.getElementById("book-description"),
    saveBook: document.getElementById("save-book"),
    deleteBook: document.getElementById("delete-book"),
    questionCount: document.getElementById("question-count"),
    questionList: document.getElementById("question-list"),
    addQuestion: document.getElementById("add-question"),
    editQuestion: document.getElementById("edit-question"),
    deleteQuestion: document.getElementById("delete-question"),
    backToBook: document.getElementById("back-to-book"),
    editingQuestionLabel: document.getElementById("editing-question-label"),
    saveQuestion: document.getElementById("save-question"),
    cancelQuestion: document.getElementById("cancel-question"),
    questionId: document.getElementById("question-id"),
    questionType: document.getElementById("question-type"),
    questionText: document.getElementById("question-text"),
    questionPreview: document.getElementById("question-preview"),
    choiceSection: document.getElementById("choice-section"),
    choicesText: document.getElementById("choices-text"),
    answerEntry: document.getElementById("answer-entry"),
    shuffleChoices: document.getElementById("shuffle-choices"),
    shuffleOptions: document.getElementById("shuffle-options"),
    choiceHelp: document.getElementById("choice-help"),
    textInputSection: document.getElementById("text-input-section"),
    addInputRow: document.getElementById("add-input-row"),
    inputRows: document.getElementById("input-rows"),
    inputOrdered: document.getElementById("input-ordered"),
    caseSensitive: document.getElementById("case-sensitive"),
    trimInput: document.getElementById("trim-input"),
    normalizeSpaces: document.getElementById("normalize-spaces"),
    textInputOptions: document.getElementById("text-input-options"),
    explanationText: document.getElementById("explanation-text"),
    tagsEntry: document.getElementById("tags-entry"),
    difficultyEntry: document.getElementById("difficulty-entry"),
    typeHint: document.getElementById("type-hint"),
  };

  QuizApp.initTheme(document.getElementById("theme-toggle"));
  QuizApp.initHardReloadButton(els.hardReloadButton);

  function parseRouteFromLocation() {
    const params = new URLSearchParams(location.search);
    const question = params.get("question");
    const index = question === null || question === "" ? null : Number(question);
    return {
      view: params.get("view") || (params.get("book") ? (Number.isInteger(index) ? "question" : "book") : "books"),
      bookFile: params.get("book") || null,
      questionIndex: Number.isInteger(index) ? index : null,
    };
  }

  function routeToUrl(route) {
    const params = new URLSearchParams();
    if (route.view !== "books" && route.bookFile) {
      params.set("book", route.bookFile);
    }
    if (route.view === "question" && Number.isInteger(route.questionIndex)) {
      params.set("question", String(route.questionIndex));
    }
    const query = params.toString();
    return query ? `${location.pathname}?${query}` : location.pathname;
  }

  function getCurrentRoute() {
    if (!state.currentBookFile) {
      return { view: "books", bookFile: null, questionIndex: null };
    }
    if (els.questionScreen.hidden === false) {
      return {
        view: "question",
        bookFile: state.currentBookFile,
        questionIndex: state.editingQuestionIndex ?? state.selectedQuestionIndex ?? 0,
      };
    }
    return { view: "book", bookFile: state.currentBookFile, questionIndex: null };
  }

  function syncHistory(route, replace = false) {
    const url = routeToUrl(route);
    if (replace) {
      history.replaceState(route, "", url);
      return;
    }
    history.pushState(route, "", url);
  }

  function scrollToScreen(name) {
    const target = name === "books"
      ? els.bookScreen
      : name === "book"
        ? els.bookEditorScreen
        : els.questionScreen;
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" });
    });
  }

  async function restoreRoute(route, { replace = false } = {}) {
    if (route.view === "books") {
      state.currentBook = null;
      state.currentBookFile = null;
      state.currentBookFolder = "";
      state.selectedQuestionIndex = null;
      state.editingQuestionIndex = null;
      state.questionDirty = false;
      syncBookForm();
      renderQuestionList();
      showScreen("books");
      if (replace) {
        syncHistory(route, true);
      }
      scrollToScreen("books");
      return;
    }

    if (!route.bookFile) {
      showScreen("books");
      if (replace) syncHistory({ view: "books", bookFile: null, questionIndex: null }, true);
      scrollToScreen("books");
      return;
    }

    await openBook(route.bookFile, {
      pushHistory: false,
      replaceHistory: replace,
      openQuestionIndex: route.view === "question" ? route.questionIndex : null,
      fromRoute: true,
    });
  }

  function showScreen(name) {
    els.bookScreen.hidden = name !== "books";
    els.bookEditorScreen.hidden = name !== "book";
    els.questionScreen.hidden = name !== "question";
  }

  function setMessage(text, kind = "info") {
    if (!text) {
      els.message.hidden = true;
      els.message.textContent = "";
      return;
    }
    els.message.hidden = false;
    els.message.textContent = text;
    els.message.style.borderLeftColor = kind === "error" ? "var(--danger)" : "var(--warning)";
    els.message.style.background = kind === "error" ? "#fff0ee" : "#fff8ea";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function computeBookId(folder, title) {
    const folderText = String(folder || "").trim().replace(/\\/g, "/");
    const titleText = String(title || "").trim();
    const parts = folderText.split("/").filter(Boolean);
    if (titleText) {
      parts.push(titleText);
    }
    return parts.join("/");
  }

  function folderFromBookId(bookId) {
    const parts = String(bookId || "").split("/").filter(Boolean);
    parts.pop();
    return parts.join("/");
  }

  function fileFromBookId(bookId) {
    return bookId ? `data/${bookId}.json` : "";
  }

  function parseIndexList(value) {
    const text = String(value || "").trim();
    if (!text) return [];
    return text.split(",").map((part) => Number(part.trim())).filter((item) => Number.isInteger(item));
  }

  function formatIndexList(value) {
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderMarkdown(text) {
    if (window.QuizMarkdown?.render) {
      return window.QuizMarkdown.render(text);
    }
    return escapeHtml(String(text ?? "")).replace(/\n/g, "<br>");
  }

  async function api(path, options = {}) {
    const init = { cache: "no-store", ...options };
    if (init.body && typeof init.body === "object" && !(init.body instanceof FormData)) {
      init.headers = { "Content-Type": "application/json; charset=utf-8", ...(init.headers || {}) };
      init.body = JSON.stringify(init.body);
    }
    const response = await fetch(path, init);
    const raw = await response.text();
    let payload = {};
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        throw new Error(`JSON の読み込みに失敗しました: ${error.message}`);
      }
    }
    if (!response.ok) {
      throw new Error(payload.error || `${response.status} ${response.statusText}`);
    }
    return payload;
  }

  function defaultQuestion() {
    return {
      id: nextQuestionId(),
      type: "single_choice",
      question: "",
      choices: ["", ""],
      answer: 0,
      shuffle_choices: true,
    };
  }

  function buildBookTree(books) {
    const root = { folders: new Map(), books: [] };

    for (const book of books) {
      const parts = String(book.id || "").split("/").filter(Boolean);
      const title = parts.pop() || book.title || book.id;
      let node = root;

      for (const part of parts) {
        if (!node.folders.has(part)) {
          node.folders.set(part, { folders: new Map(), books: [] });
        }
        node = node.folders.get(part);
      }

      node.books.push({ ...book, _treeTitle: title });
    }

    return root;
  }

  function nextQuestionId() {
    const used = new Set((state.currentBook?.questions || []).map((question) => question.id));
    let number = 1;
    while (true) {
      const candidate = `q${String(number).padStart(3, "0")}`;
      if (!used.has(candidate)) return candidate;
      number += 1;
    }
  }

  function countBooks(node) {
    return node.books.length + [...node.folders.values()].reduce((sum, child) => sum + countBooks(child), 0);
  }

  function countFolders(node) {
    return node.folders.size + [...node.folders.values()].reduce((sum, child) => sum + countFolders(child), 0);
  }

  function renderBookCard(book) {
    const isActive = state.currentBookFile === book.file;
    const folderPath = String(book.id || "").split("/").filter(Boolean).slice(0, -1).join("/");
    return `
      <article class="book-card ${isActive ? "active" : ""}">
        ${isActive ? '<span class="status-pill">編集中</span>' : ""}
        <h3>${escapeHtml(book.title || book._treeTitle || book.id)}</h3>
        ${folderPath ? `<p class="muted book-path">${escapeHtml(folderPath)}</p>` : ""}
        <p class="muted">${escapeHtml(book.description || "")}</p>
        <div class="book-actions">
          <button type="button" data-open-book="${escapeHtml(book.file)}">開く</button>
        </div>
      </article>
    `;
  }

  function renderFolderNode(name, node, pathParts = []) {
    const folderPath = [...pathParts, name].join("/");
    const childFolders = [...node.folders.entries()].map(([childName, childNode]) => {
      return renderFolderNode(childName, childNode, [...pathParts, name]);
    }).join("");
    const childBooks = node.books.map((book) => renderBookCard(book)).join("");
    const totalBooks = countBooks(node);

    return `
      <details class="book-folder">
        <summary>
          <span class="folder-name">${escapeHtml(name)}</span>
          <span class="folder-count">${totalBooks} 件</span>
        </summary>
        <div class="folder-body" data-folder="${escapeHtml(folderPath)}">
          ${childFolders}
          ${childBooks}
        </div>
      </details>
    `;
  }

  function closeOtherFolders(exceptFolder = null) {
    els.bookList.querySelectorAll("details.book-folder[open]").forEach((folder) => {
      if (folder !== exceptFolder) {
        folder.open = false;
      }
    });
  }

  function renderBookList() {
    const tree = buildBookTree(state.books);
    const rootBooks = tree.books.map((book) => renderBookCard(book)).join("");
    const folders = [...tree.folders.entries()].map(([name, node]) => renderFolderNode(name, node)).join("");
    const folderCount = countFolders(tree);

    els.bookList.innerHTML = `
      ${rootBooks}
      ${folders}
    `;
    els.bookCount.textContent = folderCount ? `${state.books.length} 件 / ${folderCount} フォルダ` : `${state.books.length} 件`;
  }

  function renderQuestionList() {
    const questions = state.currentBook?.questions || [];
    const fragment = document.createDocumentFragment();
    questions.forEach((question, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "question-item";
      if (state.selectedQuestionIndex === index) {
        item.classList.add("active");
      }

      const title = document.createElement("strong");
      title.textContent = `${index + 1}. ${question.id || "(no id)"}`;
      item.appendChild(title);

      const typeLine = document.createElement("small");
      typeLine.textContent = `${question.type} / ${question.question || ""}`;
      item.appendChild(typeLine);

      item.addEventListener("click", () => openQuestionEditor(index));
      fragment.appendChild(item);
    });

    els.questionList.replaceChildren(fragment);
    els.questionCount.textContent = `${questions.length} 問`;
    els.editQuestion.disabled = state.selectedQuestionIndex === null;
    els.deleteQuestion.disabled = state.selectedQuestionIndex === null;
  }

  function syncBookForm() {
    const book = state.currentBook;
    if (!book) {
      els.bookId.value = "";
      els.bookTitle.value = "";
      els.bookFolder.value = "";
      els.bookDescription.value = "";
      els.currentBookPath.textContent = "未選択";
      return;
    }

    const folder = state.currentBookFolder || folderFromBookId(book.id);
    els.bookFolder.value = folder;
    els.bookTitle.value = book.title || "";
    els.bookDescription.value = book.description || "";
    els.bookId.value = computeBookId(folder, book.title || "");
    els.currentBookPath.textContent = state.currentBookFile || "未保存";
  }

  function syncBookStateFromForm() {
    if (!state.currentBook) return;
    const folder = els.bookFolder.value.trim();
    const title = els.bookTitle.value.trim();
    state.currentBookFolder = folder;
    state.currentBook.title = title;
    state.currentBook.description = els.bookDescription.value.trim();
    state.currentBook.id = computeBookId(folder, title);
    els.bookId.value = state.currentBook.id;
  }

  function updateQuestionSections() {
    const type = els.questionType.value;
    const isChoice = type === "single_choice" || type === "multiple_choice" || type === "ordered_choice";
    const isTextInput = type === "text_input";
    els.choiceSection.hidden = !isChoice;
    els.textInputSection.hidden = !isTextInput;
    els.shuffleOptions.hidden = !isChoice;
    els.textInputOptions.hidden = !isTextInput;

    if (type === "single_choice") {
      els.choiceHelp.textContent = "single_choice: 正解は 0 始まりの番号で入力します。";
      els.typeHint.textContent = "single_choice: 正解は 0 始まりの番号で入れます。";
    } else if (type === "multiple_choice") {
      els.choiceHelp.textContent = "multiple_choice: 正解はカンマ区切りの番号で入力します。";
      els.typeHint.textContent = "multiple_choice: 正解はカンマ区切りの番号で入れます。";
    } else if (type === "ordered_choice") {
      els.choiceHelp.textContent = "ordered_choice: 正解は順番どおりに番号をカンマ区切りで入力します。";
      els.typeHint.textContent = "ordered_choice: 正解は順番どおりに番号をカンマ区切りで入れます。";
    } else if (type === "text_input") {
      els.choiceHelp.textContent = "";
      els.typeHint.textContent = "text_input: 穴埋め欄を行ごとに編集します。入力順はチェックボックスで切り替えます。";
    } else {
      els.choiceHelp.textContent = "";
      els.typeHint.textContent = "";
    }
  }

  function updateQuestionPreview() {
    const text = els.questionText.value;
    if (!text.trim()) {
      els.questionPreview.innerHTML = '<p class="muted">Markdown のプレビューがここに表示されます。</p>';
      return;
    }
    els.questionPreview.innerHTML = renderMarkdown(text);
  }

  function setQuestionDirty(value = true) {
    if (state.suppressQuestionDirty) return;
    state.questionDirty = value;
  }

  function bindQuestionDirtyFlag(node) {
    node.addEventListener("input", () => setQuestionDirty(true));
    node.addEventListener("change", () => setQuestionDirty(true));
  }

  function renderInputRows(inputs = []) {
    const fragment = document.createDocumentFragment();
    const rows = inputs.length ? inputs : [{ answers: [] }];

    rows.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "input-row";

      const entry = document.createElement("input");
      entry.type = "text";
      entry.value = Array.isArray(item.answers) ? item.answers.join(", ") : "";
      entry.placeholder = `入力欄 ${index + 1}`;
      entry.addEventListener("input", () => setQuestionDirty(true));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary-button";
      remove.textContent = "削除";
      remove.addEventListener("click", () => {
        row.remove();
        setQuestionDirty(true);
      });

      row.append(entry, remove);
      fragment.appendChild(row);
    });

    els.inputRows.replaceChildren(fragment);
  }

  function loadQuestionIntoEditor(index) {
    const question = state.currentBook?.questions?.[index];
    if (!question) {
      return;
    }
    state.suppressQuestionDirty = true;
    state.editingQuestionIndex = index;
    state.questionDirty = false;
    els.editingQuestionLabel.textContent = `${index + 1} 件目を編集`;
    els.questionId.value = question.id || "";
    els.questionType.value = question.type || "single_choice";
    els.questionText.value = question.question || "";
    els.choicesText.value = Array.isArray(question.choices) ? question.choices.join("\n") : "";
    els.answerEntry.value = formatIndexList(question.answer);
    els.shuffleChoices.checked = Boolean(question.shuffle_choices);
    els.inputOrdered.checked = question.input_ordered !== false;
    els.caseSensitive.checked = Boolean(question.case_sensitive);
    els.trimInput.checked = question.trim !== false;
    els.normalizeSpaces.checked = question.normalize_spaces !== false;
    els.explanationText.value = question.explanation || "";
    els.tagsEntry.value = Array.isArray(question.tags) ? question.tags.join(", ") : "";
    els.difficultyEntry.value = question.difficulty === undefined || question.difficulty === null ? "" : String(question.difficulty);
    renderInputRows(question.inputs || []);
    updateQuestionSections();
    updateQuestionPreview();
    state.suppressQuestionDirty = false;
    showScreen("question");
  }

  function loadNewQuestionEditor() {
    state.suppressQuestionDirty = true;
    state.editingQuestionIndex = null;
    state.questionDirty = false;
    const question = defaultQuestion();
    els.editingQuestionLabel.textContent = "新規問題";
    els.questionId.value = question.id;
    els.questionType.value = question.type;
    els.questionText.value = "";
    els.choicesText.value = question.choices.join("\n");
    els.answerEntry.value = formatIndexList(question.answer);
    els.shuffleChoices.checked = Boolean(question.shuffle_choices);
    els.inputOrdered.checked = true;
    els.caseSensitive.checked = false;
    els.trimInput.checked = true;
    els.normalizeSpaces.checked = true;
    els.explanationText.value = "";
    els.tagsEntry.value = "";
    els.difficultyEntry.value = "";
    renderInputRows(question.inputs || []);
    updateQuestionSections();
    updateQuestionPreview();
    state.suppressQuestionDirty = false;
    showScreen("question");
  }

  function collectQuestionFromEditor() {
    const type = els.questionType.value;
    const question = {
      id: els.questionId.value.trim(),
      type,
      question: els.questionText.value.trim(),
    };
    const explanation = els.explanationText.value.trim();
    const tags = els.tagsEntry.value.split(",").map((tag) => tag.trim()).filter(Boolean);
    const difficulty = els.difficultyEntry.value.trim();

    if (explanation) question.explanation = explanation;
    if (tags.length) question.tags = tags;
    if (difficulty) question.difficulty = Number(difficulty);

    if (type === "single_choice" || type === "multiple_choice" || type === "ordered_choice") {
      question.choices = els.choicesText.value.split("\n").map((line) => line.trim()).filter(Boolean);
      question.shuffle_choices = Boolean(els.shuffleChoices.checked);
      question.answer = type === "single_choice" ? Number(els.answerEntry.value.trim()) : parseIndexList(els.answerEntry.value);
    } else {
      const inputs = [];
      els.inputRows.querySelectorAll(".input-row").forEach((row) => {
        const value = row.querySelector("input")?.value.trim() || "";
        if (!value) return;
        const answers = value.split(",").map((item) => item.trim()).filter(Boolean);
        inputs.push({ answers });
      });
      question.inputs = inputs;
      question.input_ordered = Boolean(els.inputOrdered.checked);
      question.case_sensitive = Boolean(els.caseSensitive.checked);
      question.trim = Boolean(els.trimInput.checked);
      question.normalize_spaces = Boolean(els.normalizeSpaces.checked);
    }

    return question;
  }

  function validateQuestion(question) {
    if (!question.id) throw new Error("問題IDが必要です。");
    if (!question.question) throw new Error("問題文が必要です。");
    if (!question.type) throw new Error("問題タイプが必要です。");

    if (question.type === "single_choice" || question.type === "multiple_choice" || question.type === "ordered_choice") {
      if (!Array.isArray(question.choices) || question.choices.length < 2) {
        throw new Error("選択問題には 2 件以上の選択肢が必要です。");
      }
      const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
      for (const index of answers) {
        if (!Number.isInteger(index) || index < 0 || index >= question.choices.length) {
          throw new Error("回答 index が選択肢の範囲外です。");
        }
      }
    }

    if (question.type === "text_input") {
      if (!Array.isArray(question.inputs) || !question.inputs.length) {
        throw new Error("入力問題には入力欄が必要です。");
      }
      for (const item of question.inputs) {
        if (!Array.isArray(item.answers) || !item.answers.length) {
          throw new Error("各入力欄には許容解答が必要です。");
        }
      }
    }
  }

  function hasUnsavedQuestionChanges() {
    return state.questionDirty;
  }

  function confirmDiscardQuestionChanges() {
    if (!hasUnsavedQuestionChanges()) return true;
    return confirm("未保存の問題編集があります。破棄しますか？");
  }

  async function loadBooks(selectFile = null) {
    const payload = await api("/api/books");
    state.books = payload.books || [];
    renderBookList();
    if (selectFile) {
      const target = state.books.find((book) => book.file === selectFile);
      if (target) {
        await openBook(target.file, { pushHistory: false, replaceHistory: true });
      }
    }
  }

  async function openBook(file, { pushHistory = true, replaceHistory = false, openQuestionIndex = null, fromRoute = false } = {}) {
    if (!confirmDiscardQuestionChanges()) return;
    const payload = await api(`/api/book?file=${encodeURIComponent(file)}`);
    state.currentBook = clone(payload.book);
    state.currentBookFile = payload.file;
    state.currentBookFolder = payload.folder || "";
    state.selectedQuestionIndex = state.currentBook.questions?.length ? 0 : null;
    state.editingQuestionIndex = state.selectedQuestionIndex;
    state.questionDirty = false;
    syncBookForm();
    renderBookList();
    renderQuestionList();
    if (Number.isInteger(openQuestionIndex) && state.currentBook.questions?.[openQuestionIndex]) {
      openQuestionEditor(openQuestionIndex, { pushHistory: false, replaceHistory, fromRoute: true });
      return;
    }

    if (state.selectedQuestionIndex !== null) {
      loadQuestionIntoEditor(state.selectedQuestionIndex);
    }
    showScreen("book");
    if (!fromRoute && pushHistory) {
      syncHistory({ view: "book", bookFile: file, questionIndex: null }, replaceHistory);
    } else if (fromRoute && replaceHistory) {
      syncHistory({ view: "book", bookFile: file, questionIndex: null }, true);
    }
    scrollToScreen("book");
    setMessage("");
  }

  function newBook() {
    if (!confirmDiscardQuestionChanges()) return;
    state.currentBook = {
      schema_version: 1,
      id: "",
      title: "新しい問題集",
      description: "",
      questions: [],
    };
    state.currentBookFile = null;
    state.currentBookFolder = "";
    state.selectedQuestionIndex = null;
    state.editingQuestionIndex = null;
    state.questionDirty = false;
    syncBookForm();
    renderQuestionList();
    showScreen("book");
    syncHistory({ view: "book", bookFile: state.currentBookFile, questionIndex: null }, true);
    scrollToScreen("book");
    setMessage("問題集を新規作成しました。");
  }

  function selectQuestion(index) {
    if (!state.currentBook) return;
    if (!confirmDiscardQuestionChanges()) return;
    state.selectedQuestionIndex = index;
    state.editingQuestionIndex = index;
    renderQuestionList();
  }

  function openQuestionEditor(index = null, { pushHistory = true, replaceHistory = false, fromRoute = false } = {}) {
    if (!state.currentBook) return;
    if (index !== null) {
      state.selectedQuestionIndex = index;
      state.editingQuestionIndex = index;
      loadQuestionIntoEditor(index);
      renderQuestionList();
      if (!fromRoute && pushHistory) {
        syncHistory({ view: "question", bookFile: state.currentBookFile, questionIndex: index }, replaceHistory);
      } else if (fromRoute && replaceHistory) {
        syncHistory({ view: "question", bookFile: state.currentBookFile, questionIndex: index }, true);
      }
      scrollToScreen("question");
      return;
    }
    loadNewQuestionEditor();
    renderQuestionList();
    if (!fromRoute && pushHistory) {
      syncHistory({ view: "question", bookFile: state.currentBookFile, questionIndex: null }, replaceHistory);
    } else if (fromRoute && replaceHistory) {
      syncHistory({ view: "question", bookFile: state.currentBookFile, questionIndex: null }, true);
    }
    scrollToScreen("question");
  }

  function goToBookScreen() {
    if (!confirmDiscardQuestionChanges()) return;
    showScreen("book");
    syncHistory({ view: "book", bookFile: state.currentBookFile, questionIndex: null });
    scrollToScreen("book");
  }

  function goToBooksScreen() {
    if (!confirmDiscardQuestionChanges()) return;
    showScreen("books");
    syncHistory({ view: "books", bookFile: null, questionIndex: null });
    scrollToScreen("books");
  }

  async function saveBook() {
    if (!state.currentBook) return;
    syncBookForm();
    try {
      const response = await api("/api/save", {
        method: "POST",
        body: {
          original_file: state.currentBookFile,
          book: state.currentBook,
          overwrite: false,
        },
      });
      state.currentBook = clone(response.book);
      state.currentBookFile = response.file;
      state.currentBookFolder = folderFromBookId(state.currentBook.id);
      syncBookForm();
      await loadBooks(state.currentBookFile);
      renderQuestionList();
      setMessage("問題集を保存しました。");
    } catch (error) {
      if (String(error.message || "").includes("既に存在")) {
        if (!confirm(`${state.currentBook.id}.json は既に存在します。上書きしますか？`)) {
          return;
        }
        const response = await api("/api/save", {
          method: "POST",
          body: {
            original_file: state.currentBookFile,
            book: state.currentBook,
            overwrite: true,
          },
        });
        state.currentBook = clone(response.book);
        state.currentBookFile = response.file;
        state.currentBookFolder = folderFromBookId(state.currentBook.id);
        syncBookForm();
        await loadBooks(state.currentBookFile);
        renderQuestionList();
        setMessage("問題集を上書き保存しました。");
        return;
      }
      setMessage(error.message, "error");
    }
  }

  async function deleteBook() {
    if (!state.currentBookFile) {
      setMessage("削除する問題集を開いてください。", "error");
      return;
    }
    if (!confirm(`"${state.currentBook.title}" を削除しますか？`)) return;
    try {
      await api(`/api/book?file=${encodeURIComponent(state.currentBookFile)}`, { method: "DELETE" });
      state.currentBook = null;
      state.currentBookFile = null;
      state.currentBookFolder = "";
      state.selectedQuestionIndex = null;
      state.editingQuestionIndex = null;
      state.questionDirty = false;
      syncBookForm();
      renderQuestionList();
      await loadBooks();
      showScreen("books");
      syncHistory({ view: "books", bookFile: null, questionIndex: null }, true);
      scrollToScreen("books");
      setMessage("問題集を削除しました。");
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  function deleteSelectedQuestion() {
    if (!state.currentBook || state.selectedQuestionIndex === null) {
      setMessage("削除する問題を選択してください。", "error");
      return;
    }
    if (!confirmDiscardQuestionChanges()) return;
    if (!confirm("選択した問題を削除しますか？")) return;
    state.currentBook.questions.splice(state.selectedQuestionIndex, 1);
    state.selectedQuestionIndex = state.currentBook.questions.length
      ? Math.min(state.selectedQuestionIndex, state.currentBook.questions.length - 1)
      : null;
    state.editingQuestionIndex = state.selectedQuestionIndex;
    state.questionDirty = false;
    renderQuestionList();
    if (state.selectedQuestionIndex !== null) {
      loadQuestionIntoEditor(state.selectedQuestionIndex);
    } else {
      loadNewQuestionEditor();
      els.editingQuestionLabel.textContent = "問題がありません";
    }
    showScreen("book");
    syncHistory({ view: "book", bookFile: state.currentBookFile, questionIndex: null });
    scrollToScreen("book");
  }

  function saveQuestion() {
    if (!state.currentBook) return;
    try {
      const question = collectQuestionFromEditor();
      validateQuestion(question);
      if (state.editingQuestionIndex === null) {
        state.currentBook.questions.push(question);
        state.selectedQuestionIndex = state.currentBook.questions.length - 1;
        state.editingQuestionIndex = state.selectedQuestionIndex;
      } else {
        state.currentBook.questions[state.editingQuestionIndex] = question;
        state.selectedQuestionIndex = state.editingQuestionIndex;
      }
      state.questionDirty = false;
      renderQuestionList();
      loadQuestionIntoEditor(state.selectedQuestionIndex);
      showScreen("book");
      syncHistory({ view: "book", bookFile: state.currentBookFile, questionIndex: null });
      scrollToScreen("book");
      setMessage("問題を更新しました。");
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  function cancelQuestion() {
    if (!confirmDiscardQuestionChanges()) return;
    if (state.selectedQuestionIndex !== null) {
      loadQuestionIntoEditor(state.selectedQuestionIndex);
      showScreen("book");
      syncHistory({ view: "book", bookFile: state.currentBookFile, questionIndex: null });
      scrollToScreen("book");
      return;
    }
    showScreen("book");
    syncHistory({ view: "book", bookFile: state.currentBookFile, questionIndex: null });
    scrollToScreen("book");
  }

  async function regenerateManifest() {
    try {
      const payload = await api("/api/regenerate", { method: "POST", body: {} });
      state.books = payload.manifest?.books || [];
      renderBookList();
      setMessage(`manifest.json を再生成しました。${state.books.length} 件`);
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  function addInputRow() {
    const row = document.createElement("div");
    row.className = "input-row";

    const entry = document.createElement("input");
    entry.type = "text";
    entry.placeholder = `入力欄 ${els.inputRows.children.length + 1}`;
    entry.addEventListener("input", () => setQuestionDirty(true));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button";
    remove.textContent = "削除";
    remove.addEventListener("click", () => {
      row.remove();
      setQuestionDirty(true);
    });

    row.append(entry, remove);
    els.inputRows.appendChild(row);
    setQuestionDirty(true);
  }

  // Events
  els.refreshBooks.addEventListener("click", () => loadBooks().catch((error) => setMessage(error.message, "error")));
  els.newBook.addEventListener("click", newBook);
  els.regenerateManifest.addEventListener("click", regenerateManifest);
  els.backToBooks.addEventListener("click", goToBooksScreen);
  els.backToBook.addEventListener("click", goToBookScreen);
  els.saveBook.addEventListener("click", saveBook);
  els.deleteBook.addEventListener("click", deleteBook);
  els.addQuestion.addEventListener("click", () => {
    if (!state.currentBook) {
      setMessage("先に問題集を開いてください。", "error");
      return;
    }
    openQuestionEditor(null);
  });
  els.editQuestion.addEventListener("click", () => {
    if (state.selectedQuestionIndex === null) {
      setMessage("編集する問題を選択してください。", "error");
      return;
    }
    openQuestionEditor(state.selectedQuestionIndex);
  });
  els.deleteQuestion.addEventListener("click", deleteSelectedQuestion);
  els.saveQuestion.addEventListener("click", saveQuestion);
  els.cancelQuestion.addEventListener("click", cancelQuestion);
  els.addInputRow.addEventListener("click", addInputRow);
  els.questionType.addEventListener("change", () => {
    updateQuestionSections();
    setQuestionDirty(true);
  });
  els.questionText.addEventListener("input", () => {
    updateQuestionPreview();
    setQuestionDirty(true);
  });

  [
    els.questionId,
    els.questionText,
    els.choicesText,
    els.answerEntry,
    els.shuffleChoices,
    els.inputOrdered,
    els.caseSensitive,
    els.trimInput,
    els.normalizeSpaces,
    els.explanationText,
    els.tagsEntry,
    els.difficultyEntry,
  ].forEach(bindQuestionDirtyFlag);

  [els.bookTitle, els.bookFolder, els.bookDescription].forEach((node) => {
    node.addEventListener("input", () => {
      syncBookStateFromForm();
      renderBookList();
    });
  });

  els.bookList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-open-book]");
    if (!button) return;
    await openBook(button.dataset.openBook);
  });

  els.bookList.addEventListener("toggle", (event) => {
    const folder = event.target;
    if (!(folder instanceof HTMLDetailsElement)) return;
    if (!folder.classList.contains("book-folder")) return;
    if (folder.open) {
      closeOtherFolders(folder);
    }
  }, true);

  window.addEventListener("popstate", async (event) => {
    const route = event.state || parseRouteFromLocation();
    if (!confirmDiscardQuestionChanges()) {
      syncHistory(getCurrentRoute(), true);
      return;
    }
    await restoreRoute(route, { replace: true });
  });

  // Initial load
  const initialRoute = parseRouteFromLocation();
  history.replaceState(initialRoute, "", routeToUrl(initialRoute));
  showScreen("books");
  try {
    await loadBooks();
    if (initialRoute.view !== "books" && initialRoute.bookFile) {
      await restoreRoute(initialRoute, { replace: true });
    } else if (state.books.length === 1) {
      await openBook(state.books[0].file, { pushHistory: false, replaceHistory: true });
    } else {
      scrollToScreen("books");
    }
  } catch (error) {
    setMessage(error.message, "error");
    els.bookCount.textContent = "読み込み失敗";
  }
})();
