(async function () {
  const titleElement = document.getElementById("book-title");
  const descriptionElement = document.getElementById("book-description");
  const quizView = document.getElementById("quiz-view");
  const summaryView = document.getElementById("summary-view");

  const params = new URLSearchParams(location.search);
  const bookId = params.get("book");
  let book = null;
  let session = null;
  let currentRenderedChoices = [];
  let orderedSelection = [];

  function renderMarkdown(text) {
    if (window.QuizMarkdown?.render) {
      return window.QuizMarkdown.render(text);
    }
    return QuizApp.escapeHtml(String(text ?? "")).replace(/\n/g, "<br>");
  }

  function questionById(id) {
    return book.questions.find((question) => question.id === id);
  }

  function createSession(mode, questionIds) {
    const now = new Date().toISOString();
    return {
      book_id: book.id,
      current_index: 0,
      mode,
      question_ids: questionIds,
      answers: {},
      started_at: now,
      updated_at: now
    };
  }

  function saveSession() {
    const progress = QuizApp.getProgressMap();
    session.updated_at = new Date().toISOString();
    progress[book.id] = session;
    QuizApp.saveProgressMap(progress);
  }

  function loadOrCreateSession() {
    const progress = QuizApp.getProgressMap();
    const existing = progress[book.id];
    const allQuestionIds = book.questions.map((question) => question.id);
    if (existing && Array.isArray(existing.question_ids) && existing.question_ids.length > 0) {
      const validQuestionIds = existing.question_ids.filter((id) => questionById(id));
      if (validQuestionIds.length > 0) {
        session = {
          ...existing,
          question_ids: validQuestionIds,
          answers: existing.answers || {},
          current_index: Math.min(existing.current_index || 0, validQuestionIds.length - 1)
        };
        saveSession();
        return;
      }
    }
    session = createSession("normal", allQuestionIds);
    saveSession();
  }

  function renderProgress(question) {
    const number = session.current_index + 1;
    const total = session.question_ids.length;
    const mode = session.mode === "review_wrong" ? "間違い再挑戦" : "通常";
    return `
      <div class="progress-row">
        <span>${number} / ${total}</span>
        <span>${QuizApp.escapeHtml(mode)} ・ ${QuizApp.escapeHtml(question.type)}</span>
      </div>
    `;
  }

  function renderSingleChoice(question) {
    currentRenderedChoices = question.choices.map((label, index) => ({ label, index }));
    if (question.shuffle_choices) currentRenderedChoices = QuizApp.shuffle(currentRenderedChoices);
    return `
      <ul class="choice-list">
        ${currentRenderedChoices.map((choice, visibleIndex) => `
          <li>
            <label class="choice-item">
              <input type="radio" name="answer" value="${choice.index}" ${visibleIndex === 0 ? "checked" : ""}>
              <span>${QuizApp.escapeHtml(choice.label)}</span>
            </label>
          </li>
        `).join("")}
      </ul>
    `;
  }

  function renderMultipleChoice(question) {
    currentRenderedChoices = question.choices.map((label, index) => ({ label, index }));
    if (question.shuffle_choices) currentRenderedChoices = QuizApp.shuffle(currentRenderedChoices);
    return `
      <ul class="choice-list">
        ${currentRenderedChoices.map((choice) => `
          <li>
            <label class="choice-item">
              <input type="checkbox" name="answer" value="${choice.index}">
              <span>${QuizApp.escapeHtml(choice.label)}</span>
            </label>
          </li>
        `).join("")}
      </ul>
    `;
  }

  function renderOrderedChoice(question) {
    orderedSelection = [];
    currentRenderedChoices = question.choices.map((label, index) => ({ label, index }));
    if (question.shuffle_choices) currentRenderedChoices = QuizApp.shuffle(currentRenderedChoices);
    return `
      <div class="choice-list" id="ordered-choices">
        ${currentRenderedChoices.map((choice) => `
          <button class="ordered-choice-button" type="button" data-choice="${choice.index}">
            <span class="order-number" hidden></span>${QuizApp.escapeHtml(choice.label)}
          </button>
        `).join("")}
      </div>
      <p class="muted">クリックした順番が回答順になります。もう一度クリックすると解除します。</p>
    `;
  }

  function renderTextInput(question) {
    return `
      <div class="text-input-list">
        ${(question.inputs || []).map((input, index) => `
          <div class="input-row">
            <label for="text-answer-${index}">${QuizApp.escapeHtml(`入力${index + 1}`)}</label>
            <input id="text-answer-${index}" type="text" data-input-index="${index}" autocomplete="off" ${index === 0 ? "autofocus" : ""}>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderAnswerControls(question) {
    if (question.type === "single_choice") return renderSingleChoice(question);
    if (question.type === "multiple_choice") return renderMultipleChoice(question);
    if (question.type === "ordered_choice") return renderOrderedChoice(question);
    if (question.type === "text_input") return renderTextInput(question);
    return `<p>未対応の問題タイプです: ${QuizApp.escapeHtml(question.type)}</p>`;
  }

  function renderQuestion() {
    const question = questionById(session.question_ids[session.current_index]);
    if (!question) {
      QuizApp.showMessage("問題が見つかりません。");
      return;
    }

    summaryView.hidden = true;
    quizView.hidden = false;
    quizView.innerHTML = `
      ${renderProgress(question)}
      <div class="question-text markdown-body">${renderMarkdown(question.question)}</div>
      <form id="answer-form">
        ${renderAnswerControls(question)}
        <div class="actions">
          <button type="submit">回答を確定</button>
          <button class="secondary-button" type="button" id="back-to-list">一覧に戻る</button>
        </div>
      </form>
    `;

    if (question.type === "text_input") {
      requestAnimationFrame(() => {
        const firstInput = quizView.querySelector('input[data-input-index="0"]');
        if (!firstInput) return;
        try {
          firstInput.focus({ preventScroll: true });
        } catch {
          firstInput.focus();
        }
      });
    }
  }

  function refreshOrderedButtons() {
    document.querySelectorAll(".ordered-choice-button").forEach((button) => {
      const index = Number(button.dataset.choice);
      const position = orderedSelection.indexOf(index);
      const number = button.querySelector(".order-number");
      if (position >= 0) {
        button.classList.add("selected");
        number.hidden = false;
        number.textContent = String(position + 1);
      } else {
        button.classList.remove("selected");
        number.hidden = true;
        number.textContent = "";
      }
    });
  }

  function collectAnswer(question) {
    if (question.type === "single_choice") {
      const selected = document.querySelector('input[name="answer"]:checked');
      return selected ? Number(selected.value) : null;
    }
    if (question.type === "multiple_choice") {
      return [...document.querySelectorAll('input[name="answer"]:checked')].map((input) => Number(input.value));
    }
    if (question.type === "ordered_choice") {
      return [...orderedSelection];
    }
    if (question.type === "text_input") {
      return [...document.querySelectorAll("[data-input-index]")].map((input) => input.value);
    }
    return null;
  }

  function handleAnswer(event) {
    event.preventDefault();
    const question = questionById(session.question_ids[session.current_index]);
    const answer = collectAnswer(question);
    if (question.type === "ordered_choice" && answer.length !== question.answer.length) {
      QuizApp.showMessage("すべての選択肢を順番に選んでください。");
      return;
    }
    QuizApp.hideMessage();

    const correct = QuizApp.isCorrect(question, answer);
    session.answers[question.id] = {
      answer,
      is_correct: correct,
      answered_at: new Date().toISOString()
    };
    QuizApp.updateStats(book.id, question.id, answer, correct);

    const atLast = session.current_index >= session.question_ids.length - 1;
    if (atLast) {
      finishSession();
    } else {
      session.current_index += 1;
      saveSession();
      renderQuestion();
    }
  }

  function finishSession() {
    const wrongIds = session.question_ids.filter((id) => !session.answers[id]?.is_correct);
    const result = {
      book_id: book.id,
      finished_at: new Date().toISOString(),
      mode: session.mode,
      total: session.question_ids.length,
      correct: session.question_ids.length - wrongIds.length,
      question_ids: [...session.question_ids],
      wrong_question_ids: wrongIds,
      answers: session.answers
    };
    const results = QuizApp.getLastResultMap();
    results[book.id] = result;
    QuizApp.saveLastResultMap(results);
    QuizApp.removeProgress(book.id);
    renderSummary(result);
  }

  function renderSummary(result) {
    quizView.hidden = true;
    summaryView.hidden = false;
    const wrongQuestions = result.wrong_question_ids.map((id) => questionById(id)).filter(Boolean);
    const answeredQuestions = result.question_ids || session.question_ids;

    summaryView.innerHTML = `
      <h2>結果まとめ</h2>
      <div class="summary-score">
        <div class="score-tile"><span>スコア</span><strong>${result.correct} / ${result.total}</strong></div>
        <div class="score-tile"><span>正解率</span><strong>${Math.round((result.correct / result.total) * 100)}%</strong></div>
        <div class="score-tile"><span>間違い</span><strong>${wrongQuestions.length}問</strong></div>
      </div>
      <div class="actions">
        <button type="button" id="retry-wrong" ${wrongQuestions.length === 0 ? "disabled" : ""}>間違えた問題だけ再挑戦</button>
        <button class="secondary-button" type="button" id="restart">最初から解き直す</button>
        <button class="secondary-button" type="button" id="summary-back">問題集一覧に戻る</button>
      </div>
      <h2 style="margin-top: 26px;">今回の回答</h2>
      <div class="wrong-list">
        ${answeredQuestions.map((id) => {
          const question = questionById(id);
          const answerData = result.answers?.[id];
          const correct = Boolean(answerData?.is_correct);
          return `
            <article class="wrong-item">
              <div class="question-text markdown-body">${renderMarkdown(question?.question || id)}</div>
              <div class="answer-block">
                <p><strong>判定:</strong> ${correct ? "正解" : "不正解"}</p>
                <p><strong>自分の回答:</strong> ${QuizApp.escapeHtml(QuizApp.formatAnswer(question, answerData?.answer))}</p>
                <p><strong>正解:</strong> ${QuizApp.escapeHtml(QuizApp.correctAnswerText(question))}</p>
                <p><strong>通算正解率:</strong> ${QuizApp.escapeHtml(QuizApp.correctRate(book.id, id))}</p>
              </div>
              ${question?.explanation ? `<p class="muted">${QuizApp.escapeHtml(question.explanation)}</p>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function startReviewWrong() {
    const result = QuizApp.getLastResultMap()[book.id];
    const wrongIds = result?.wrong_question_ids || [];
    if (wrongIds.length === 0) return;
    session = createSession("review_wrong", wrongIds);
    saveSession();
    renderQuestion();
  }

  function restart() {
    session = createSession("normal", book.questions.map((question) => question.id));
    saveSession();
    renderQuestion();
  }

  document.addEventListener("click", (event) => {
    if (event.target.id === "back-to-list" || event.target.id === "summary-back") {
      location.href = "index.html";
    }
    if (event.target.id === "retry-wrong") startReviewWrong();
    if (event.target.id === "restart") restart();
    const orderedButton = event.target.closest?.(".ordered-choice-button");
    if (orderedButton) {
      const index = Number(orderedButton.dataset.choice);
      const current = orderedSelection.indexOf(index);
      if (current >= 0) {
        orderedSelection.splice(current, 1);
      } else {
        orderedSelection.push(index);
      }
      refreshOrderedButtons();
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "answer-form") handleAnswer(event);
  });

  try {
    if (!bookId) throw new Error("URLに book が指定されていません。");
    const manifest = await QuizApp.fetchJson("manifest.json");
    const entry = manifest.books.find((item) => item.id === bookId);
    if (!entry) throw new Error(`問題集が見つかりません: ${bookId}`);
    book = await QuizApp.fetchJson(entry.file);
    if (!Array.isArray(book.questions) || book.questions.length === 0) {
      throw new Error("この問題集には問題がありません。");
    }

    titleElement.textContent = book.title;
    descriptionElement.textContent = book.description || "";
    loadOrCreateSession();
    renderQuestion();
  } catch (error) {
    titleElement.textContent = "読み込み失敗";
    QuizApp.showMessage(error.message);
  }
})();
