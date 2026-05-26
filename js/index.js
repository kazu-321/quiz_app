(async function () {
  const list = document.getElementById("book-list");
  const count = document.getElementById("book-count");
  const clearButton = document.getElementById("clear-storage");
  const detailPanel = document.getElementById("book-detail");
  const themeToggle = document.getElementById("theme-toggle");
  const hardReloadButton = document.getElementById("hard-reload");
  let currentManifest = null;
  let currentDetailBookId = null;
  const bookCache = new Map();

  QuizApp.initTheme(themeToggle);
  QuizApp.initHardReloadButton(hardReloadButton);
  QuizApp.hydrateStatsFromLastResult();

  function renderMarkdown(text) {
    if (window.QuizMarkdown?.render) {
      return window.QuizMarkdown.render(text);
    }
    return QuizApp.escapeHtml(String(text ?? "")).replace(/\n/g, "<br>");
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

  function renderBookCard(book) {
    const progress = QuizApp.getProgressMap();
    const hasProgress = Boolean(progress[book.id]);
    const folderPath = String(book.id || "").split("/").filter(Boolean).slice(0, -1).join("/");
    return `
      <article class="book-card">
        ${hasProgress ? '<span class="status-pill">中断中</span>' : ""}
        <h3>${QuizApp.escapeHtml(book.title || book._treeTitle || book.id)}</h3>
        ${folderPath ? `<p class="muted book-path">${QuizApp.escapeHtml(folderPath)}</p>` : ""}
        <p class="muted">${QuizApp.escapeHtml(book.description || "")}</p>
        <div class="book-actions">
          <button type="button" data-start="${QuizApp.escapeHtml(book.id)}">解く</button>
          <button class="secondary-button" type="button" data-stats="${QuizApp.escapeHtml(book.id)}" aria-expanded="false">正解率</button>
          ${hasProgress ? `<button class="secondary-button" type="button" data-resume="${QuizApp.escapeHtml(book.id)}">続きから</button>` : ""}
        </div>
      </article>
    `;
  }

  function syncStatsButtons(activeBookId = null) {
    list.querySelectorAll("[data-stats]").forEach((button) => {
      const isActive = activeBookId !== null && button.dataset.stats === activeBookId && !detailPanel.hidden;
      button.setAttribute("aria-expanded", String(isActive));
    });
  }

  function renderFolderNode(name, node, pathParts = []) {
    const folderPath = [...pathParts, name].join("/");
    const totalBooks = node.books.length + [...node.folders.values()].reduce((sum, child) => sum + countBooks(child), 0);
    const childFolders = [...node.folders.entries()].map(([childName, childNode]) => {
      return renderFolderNode(childName, childNode, [...pathParts, name]);
    }).join("");
    const childBooks = node.books.map((book) => renderBookCard(book)).join("");

    return `
      <details class="book-folder">
        <summary>
          <span class="folder-name">${QuizApp.escapeHtml(name)}</span>
          <span class="folder-count">${totalBooks} 件</span>
        </summary>
        <div class="folder-body" data-folder="${QuizApp.escapeHtml(folderPath)}">
          ${childFolders}
          ${childBooks}
        </div>
      </details>
    `;
  }

  function closeOtherFolders(exceptFolder = null) {
    list.querySelectorAll("details.book-folder[open]").forEach((folder) => {
      if (folder !== exceptFolder) {
        folder.open = false;
      }
    });
  }

  function countBooks(node) {
    return node.books.length + [...node.folders.values()].reduce((sum, child) => sum + countBooks(child), 0);
  }

  function countFolders(node) {
    return node.folders.size + [...node.folders.values()].reduce((sum, child) => sum + countFolders(child), 0);
  }

  function renderBooks(manifest) {
    const tree = buildBookTree(manifest.books);

    const folderCount = countFolders(tree);
    count.textContent = folderCount ? `${manifest.books.length} 件 / ${folderCount} フォルダ` : `${manifest.books.length} 件`;

    const rootBooks = tree.books.map((book) => renderBookCard(book)).join("");
    const folders = [...tree.folders.entries()].map(([name, node]) => renderFolderNode(name, node)).join("");
    list.innerHTML = `
      ${rootBooks}
      ${folders}
    `;
  }

  function questionStats(bookId, question) {
    const stats = QuizApp.getStatsMap();
    const item = stats?.[bookId]?.[question.id];
    const attempts = Number(item?.attempts || 0);
    const corrects = Number(item?.corrects || 0);
    const rateText = attempts ? `${Math.round((corrects / attempts) * 100)}% (${corrects}/${attempts})` : "未解答";
    const lastAnswer = item ? QuizApp.formatAnswer(question, item.last_answer) : "未回答";
    const lastCorrect = item ? (item.last_correct ? "正解" : "不正解") : "未解答";
    console.log("[quiz_app] questionStats", {
      bookId,
      questionId: question.id,
      item,
      attempts,
      corrects,
      rateText,
      lastAnswer,
      lastCorrect,
    });
    return { attempts, corrects, rateText, lastAnswer, lastCorrect };
  }

  async function loadBook(bookId) {
    if (bookCache.has(bookId)) {
      return bookCache.get(bookId);
    }
    const entry = currentManifest?.books.find((item) => item.id === bookId);
    if (!entry) {
      throw new Error(`問題集が見つかりません: ${bookId}`);
    }
    const book = await QuizApp.fetchJson(entry.file);
    bookCache.set(bookId, book);
    return book;
  }

  function renderDetail(book) {
    const stats = QuizApp.getStatsMap();
    const bookStats = stats?.[book.id] || {};
    const summary = Object.values(bookStats).reduce((acc, item) => {
      acc.attempts += Number(item?.attempts || 0);
      acc.corrects += Number(item?.corrects || 0);
      return acc;
    }, { attempts: 0, corrects: 0 });
    const overallRate = summary.attempts
      ? `${Math.round((summary.corrects / summary.attempts) * 100)}% (${summary.corrects}/${summary.attempts})`
      : "未解答";

    console.log("[quiz_app] renderDetail", {
      bookId: book.id,
      bookStats,
      summary,
      overallRate,
    });

    detailPanel.innerHTML = `
      <div class="toolbar detail-toolbar">
        <div>
          <h2>${QuizApp.escapeHtml(book.title)}</h2>
          <p class="muted">${QuizApp.escapeHtml(book.description || "")}</p>
        </div>
        <button type="button" class="secondary-button" id="close-book-detail">閉じる</button>
      </div>
      <div class="summary-score">
        <div class="score-tile"><span>問題数</span><strong>${book.questions.length}</strong></div>
        <div class="score-tile"><span>通算正解率</span><strong>${QuizApp.escapeHtml(overallRate)}</strong></div>
        <div class="score-tile"><span>解答済み</span><strong>${summary.attempts}</strong></div>
      </div>
      <h2 style="margin-top: 26px;">各問題の成績</h2>
      <div class="wrong-list">
        ${book.questions.map((question, index) => {
          const stat = questionStats(book.id, question);
          return `
            <article class="wrong-item">
              <div class="question-number">${index + 1}.</div>
              <div class="question-text markdown-body">${renderMarkdown(question.question)}</div>
              <div class="answer-block">
                <p><strong>通算正解率:</strong> ${QuizApp.escapeHtml(stat.rateText)}</p>
                <p><strong>最後の回答:</strong> ${QuizApp.escapeHtml(stat.lastAnswer)}</p>
                <p><strong>判定:</strong> ${QuizApp.escapeHtml(stat.lastCorrect)}</p>
                <p><strong>正解:</strong> ${QuizApp.escapeHtml(QuizApp.correctAnswerText(question))}</p>
              </div>
              ${question.explanation ? `<p class="muted">${QuizApp.escapeHtml(question.explanation)}</p>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;
    detailPanel.hidden = false;
  }

  async function toggleDetail(bookId) {
    if (currentDetailBookId === bookId && !detailPanel.hidden) {
      detailPanel.hidden = true;
      currentDetailBookId = null;
      syncStatsButtons();
      return;
    }

    try {
      const book = await loadBook(bookId);
      currentDetailBookId = bookId;
      renderDetail(book);
      syncStatsButtons(bookId);
      detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      QuizApp.showMessage(error.message);
    }
  }

  try {
    currentManifest = await QuizApp.fetchJson("manifest.json");
    renderBooks(currentManifest);

    list.addEventListener("click", async (event) => {
      const statsId = event.target.dataset.stats;
      const startId = event.target.dataset.start;
      const resumeId = event.target.dataset.resume;
      if (statsId) {
        await toggleDetail(statsId);
      }
      if (startId) {
        QuizApp.removeProgress(startId);
        location.href = `answer.html?book=${encodeURIComponent(startId)}`;
      }
      if (resumeId) {
        location.href = `answer.html?book=${encodeURIComponent(resumeId)}&resume=1`;
      }
    });

    list.addEventListener("toggle", (event) => {
      const folder = event.target;
      if (!(folder instanceof HTMLDetailsElement)) return;
      if (!folder.classList.contains("book-folder")) return;
      if (folder.open) {
        closeOtherFolders(folder);
      }
    }, true);

    detailPanel.addEventListener("click", (event) => {
      if (event.target.id !== "close-book-detail") return;
      detailPanel.hidden = true;
      currentDetailBookId = null;
      syncStatsButtons();
    });

    clearButton.addEventListener("click", () => {
      if (!confirm("学習履歴と中断データを削除しますか？")) return;
      localStorage.removeItem(QuizApp.STORAGE_KEYS.progress);
      localStorage.removeItem(QuizApp.STORAGE_KEYS.stats);
      localStorage.removeItem(QuizApp.STORAGE_KEYS.lastResult);
      renderBooks(currentManifest);
      detailPanel.hidden = true;
      currentDetailBookId = null;
      QuizApp.showMessage("学習履歴を削除しました。");
    });
  } catch (error) {
    count.textContent = "読み込み失敗";
    QuizApp.showMessage(error.message);
  }
})();
