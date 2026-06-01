(async function () {
  const titleElement = document.getElementById("book-title");
  const descriptionElement = document.getElementById("book-description");
  const setupView = document.getElementById("setup-view");
  const quizView = document.getElementById("quiz-view");
  const summaryView = document.getElementById("summary-view");
  const setupShuffleQuestions = document.getElementById("setup-shuffle-questions");
  const setupReviewAtEnd = document.getElementById("setup-review-at-end");
  const setupSkipAnswerInput = document.getElementById("setup-skip-answer-input");
  const startQuizButton = document.getElementById("start-quiz");
  const resumeQuizButton = document.getElementById("resume-quiz");
  const resumeInfo = document.getElementById("resume-info");
  const themeToggle = document.getElementById("theme-toggle");
  const hardReloadButton = document.getElementById("hard-reload");

  const params = new URLSearchParams(location.search);
  const bookId = params.get("book");
  const resumeRequested = params.get("resume") === "1";

  QuizApp.initTheme(themeToggle);
  QuizApp.initHardReloadButton(hardReloadButton);
  QuizApp.hydrateStatsFromLastResult();
  console.log("[quiz_app] answer boot", {
    bookId,
    resumeRequested,
    progress: QuizApp.getProgressMap()[bookId],
    lastResult: QuizApp.getLastResultMap()[bookId],
    stats: QuizApp.getStatsMap()[bookId],
  });

  const DEFAULT_SETTINGS = {
    shuffle_questions: false,
    review_at_end: true,
    skip_answer_input: false,
  };

  let book = null;
  let session = null;
  let existingSession = null;
  let currentRenderedChoices = [];
  let orderedSelection = [];

  function renderMarkdown(text) {
    if (window.QuizMarkdown?.render) {
      return window.QuizMarkdown.render(text);
    }
    return QuizApp.escapeHtml(String(text ?? "")).replace(/\n/g, "<br>");
  }

  function normalizeSettings(settings = {}) {
    return {
      shuffle_questions: Boolean(settings.shuffle_questions),
      review_at_end: settings.review_at_end !== false,
      skip_answer_input: Boolean(settings.skip_answer_input),
    };
  }

  function questionById(id) {
    return book.questions.find((question) => question.id === id);
  }

  function currentQuestion() {
    if (!session) return null;
    return questionById(session.question_ids[session.current_index]);
  }

  function createSession(settings) {
    const normalized = normalizeSettings(settings);
    const questionIds = book.questions.map((question) => question.id);
    const orderedQuestionIds = normalized.shuffle_questions ? QuizApp.shuffle(questionIds) : questionIds;
    const now = new Date().toISOString();
    return {
      book_id: book.id,
      current_index: 0,
      question_ids: orderedQuestionIds,
      answers: {},
      settings: normalized,
      started_at: now,
      updated_at: now,
    };
  }

  function normalizeSession(existing) {
    if (!existing || typeof existing !== "object") return null;
    const settings = normalizeSettings(existing.settings || existing.quiz_settings || {});
    const validQuestionIds = Array.isArray(existing.question_ids)
      ? existing.question_ids.filter((id) => questionById(id))
      : [];
    const fallbackIds = book.questions.map((question) => question.id);
    const questionIds = validQuestionIds.length > 0
      ? validQuestionIds
      : (settings.shuffle_questions ? QuizApp.shuffle(fallbackIds) : fallbackIds);
    const currentIndex = Number(existing.current_index || 0);
    return {
      ...existing,
      settings,
      question_ids: questionIds,
      answers: existing.answers || {},
      current_index: Number.isFinite(currentIndex)
        ? Math.min(currentIndex, Math.max(questionIds.length - 1, 0))
        : 0,
    };
  }

  function saveSession() {
    if (!session) return;
    const progress = QuizApp.getProgressMap();
    session.updated_at = new Date().toISOString();
    progress[book.id] = session;
    QuizApp.saveProgressMap(progress);
    console.log("[quiz_app] saveSession", {
      bookId: book.id,
      session,
    });
  }

  function removeSession() {
    const progress = QuizApp.getProgressMap();
    delete progress[book.id];
    QuizApp.saveProgressMap(progress);
  }

  function loadExistingSession() {
    const progress = QuizApp.getProgressMap();
    const existing = progress[book.id];
    const normalized = normalizeSession(existing);
    console.log("[quiz_app] loadExistingSession", {
      bookId: book.id,
      existing,
      normalized,
    });
    return normalized && normalized.question_ids.length > 0 ? normalized : null;
  }

  function setView(view) {
    setupView.hidden = view !== "setup";
    quizView.hidden = view !== "quiz";
    summaryView.hidden = view !== "summary";
  }

  function settingsFromForm() {
    return normalizeSettings({
      shuffle_questions: setupShuffleQuestions.checked,
      review_at_end: setupReviewAtEnd.checked,
      skip_answer_input: setupSkipAnswerInput.checked,
    });
  }

  function applySettingsToForm(settings) {
    setupShuffleQuestions.checked = Boolean(settings.shuffle_questions);
    setupReviewAtEnd.checked = settings.review_at_end !== false;
    setupSkipAnswerInput.checked = Boolean(settings.skip_answer_input);
  }

  function renderProgress(question) {
    const number = session.current_index + 1;
    const total = session.question_ids.length;
    const tags = [];
    if (session.settings.shuffle_questions) tags.push("シャッフル");
    if (session.settings.review_at_end) tags.push("最後に答え合わせ");
    if (session.settings.skip_answer_input) tags.push("入力スキップ");
    const tagText = tags.length ? tags.join(" / ") : "通常";
    return `
      <div class="progress-row">
        <span>${number} / ${total}</span>
        <span>${QuizApp.escapeHtml(tagText)} ・ ${QuizApp.escapeHtml(question.type)}</span>
      </div>
    `;
  }

  function renderSingleChoice(question, disabled = false) {
    currentRenderedChoices = question.choices.map((label, index) => ({ label, index }));
    if (question.shuffle_choices) currentRenderedChoices = QuizApp.shuffle(currentRenderedChoices);
    return `
      <ul class="choice-list">
        ${currentRenderedChoices.map((choice, visibleIndex) => `
          <li>
            <label class="choice-item ${disabled ? "choice-item-disabled" : ""}">
              <input type="radio" name="answer" value="${choice.index}" ${!disabled && visibleIndex === 0 ? "checked" : ""} ${disabled ? "disabled" : ""}>
              <span>${QuizApp.escapeHtml(choice.label)}</span>
            </label>
          </li>
        `).join("")}
      </ul>
    `;
  }

  function renderMultipleChoice(question, disabled = false) {
    currentRenderedChoices = question.choices.map((label, index) => ({ label, index }));
    if (question.shuffle_choices) currentRenderedChoices = QuizApp.shuffle(currentRenderedChoices);
    return `
      <ul class="choice-list">
        ${currentRenderedChoices.map((choice) => `
          <li>
            <label class="choice-item ${disabled ? "choice-item-disabled" : ""}">
              <input type="checkbox" name="answer" value="${choice.index}" ${disabled ? "disabled" : ""}>
              <span>${QuizApp.escapeHtml(choice.label)}</span>
            </label>
          </li>
        `).join("")}
      </ul>
    `;
  }

  function renderOrderedChoice(question, disabled = false) {
    orderedSelection = [];
    currentRenderedChoices = question.choices.map((label, index) => ({ label, index }));
    if (question.shuffle_choices) currentRenderedChoices = QuizApp.shuffle(currentRenderedChoices);
    return `
      <div class="choice-list" id="ordered-choices">
        ${currentRenderedChoices.map((choice) => `
          <button class="ordered-choice-button" type="button" data-choice="${choice.index}" ${disabled ? "disabled" : ""}>
            <span class="order-number" hidden></span>${QuizApp.escapeHtml(choice.label)}
          </button>
        `).join("")}
      </div>
      <p class="muted">クリックした順番が回答順になります。もう一度クリックすると解除します。</p>
    `;
  }

  function renderTextInput(question, disabled = false) {
    return `
      <div class="text-input-list">
        ${(question.inputs || []).map((input, index) => `
          <div class="input-row">
            <label for="text-answer-${index}">${QuizApp.escapeHtml(`入力${index + 1}`)}</label>
            <input id="text-answer-${index}" type="text" data-input-index="${index}" autocomplete="off" ${index === 0 ? "autofocus" : ""} ${disabled ? "disabled" : ""}>
          </div>
        `).join("")}
      </div>
    `;
  }

  function focusFirstTextInput() {
    requestAnimationFrame(() => {
      const input = document.querySelector('#answer-form input[data-input-index="0"]:not([disabled])');
      if (!input) return;
      input.focus({ preventScroll: true });
      if (typeof input.setSelectionRange === "function") {
        const valueLength = input.value.length;
        input.setSelectionRange(valueLength, valueLength);
      }
    });
  }

  function renderInteractiveControls(question) {
    if (question.type === "single_choice") return renderSingleChoice(question);
    if (question.type === "multiple_choice") return renderMultipleChoice(question);
    if (question.type === "ordered_choice") return renderOrderedChoice(question);
    if (question.type === "text_input") return renderTextInput(question);
    return `<p>未対応の問題タイプです: ${QuizApp.escapeHtml(question.type)}</p>`;
  }

  function renderSkippedPreview(question) {
    if (question.type === "single_choice") return renderSingleChoice(question, true);
    if (question.type === "multiple_choice") return renderMultipleChoice(question, true);
    if (question.type === "ordered_choice") return renderOrderedChoice(question, true);
    if (question.type === "text_input") {
      return `
        <div class="study-note">入力欄はスキップしています。ノートや赤シートで確認してください。</div>
        ${renderTextInput(question, true)}
      `;
    }
    return `<p>未対応の問題タイプです: ${QuizApp.escapeHtml(question.type)}</p>`;
  }

  function renderStudyPanel(question) {
    quizView.innerHTML = `
      ${renderProgress(question)}
      <div class="question-text markdown-body">${renderMarkdown(question.question)}</div>
      ${renderSkippedPreview(question)}
      <div class="actions">
        <button type="button" id="show-answer">答えを見る</button>
        <button class="secondary-button" type="button" id="back-to-list">一覧に戻る</button>
      </div>
    `;
  }

  function renderInteractiveQuestion(question) {
    quizView.innerHTML = `
      ${renderProgress(question)}
      <div class="question-text markdown-body">${renderMarkdown(question.question)}</div>
      <form id="answer-form">
        ${renderInteractiveControls(question)}
        <div class="actions">
          <button type="submit">回答を確定</button>
          <button class="secondary-button" type="button" id="back-to-list">一覧に戻る</button>
        </div>
      </form>
    `;
    if (question.type === "text_input") {
      focusFirstTextInput();
    }
  }

  function renderReviewPanel(question, record, revealedOnly = false) {
    const answerText = revealedOnly
      ? "入力なし"
      : QuizApp.formatAnswer(question, record.answer);
    const correctText = QuizApp.correctAnswerText(question);
    const correct = revealedOnly ? null : Boolean(record.is_correct);

    quizView.innerHTML = `
      ${renderProgress(question)}
      <div class="question-text markdown-body">${renderMarkdown(question.question)}</div>
      <div class="result-box ${revealedOnly ? "" : (correct ? "correct" : "wrong")}">
        ${revealedOnly ? "<p><strong>表示モード</strong> 答えを確認してください。</p>" : `<p><strong>判定:</strong> ${correct ? "正解" : "不正解"}</p>`}
        <p><strong>正解:</strong> ${QuizApp.escapeHtml(correctText)}</p>
        ${revealedOnly ? "" : `<p><strong>自分の回答:</strong> ${QuizApp.escapeHtml(answerText)}</p>`}
        ${question.explanation ? `<p class="muted">${QuizApp.escapeHtml(question.explanation)}</p>` : ""}
      </div>
      <div class="actions">
        <button type="button" id="next-question">次へ</button>
        <button class="secondary-button" type="button" id="back-to-list">一覧に戻る</button>
      </div>
    `;
  }

  function renderQuestion() {
    const question = currentQuestion();
    if (!question) {
      finishSession();
      return;
    }

    const record = session.answers[question.id];

    setView("quiz");

    if (session.settings.skip_answer_input) {
      if (record?.revealed_only) {
        renderReviewPanel(question, record, true);
      } else {
        renderStudyPanel(question);
      }
      return;
    }

    if (record && session.settings.review_at_end === false && session.current_index < session.question_ids.length) {
      renderReviewPanel(question, record, false);
      return;
    }

    renderInteractiveQuestion(question);
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

  function advanceQuestion() {
    if (session.current_index >= session.question_ids.length - 1) {
      finishSession();
      return;
    }
    session.current_index += 1;
    saveSession();
    renderQuestion();
  }

  function handleAnswer(event) {
    event.preventDefault();
    const question = currentQuestion();
    if (!question) return;

    const answer = collectAnswer(question);
    if (question.type === "ordered_choice" && answer.length !== question.answer.length) {
      QuizApp.showMessage("すべての選択肢を順番に選んでください。");
      return;
    }
    QuizApp.hideMessage();

    const correct = QuizApp.isCorrect(question, answer);
    QuizApp.updateStats(book.id, question.id, answer, correct);
    session.answers[question.id] = {
      answer,
      is_correct: correct,
      answered_at: new Date().toISOString(),
    };
    saveSession();

    if (session.settings.review_at_end === false) {
      renderQuestion();
      return;
    }

    advanceQuestion();
  }

  function revealAnswer() {
    const question = currentQuestion();
    if (!question) return;
    session.answers[question.id] = {
      revealed_only: true,
      revealed_at: new Date().toISOString(),
    };
    saveSession();
    renderQuestion();
  }

  function finishSession() {
    const skippedStudy = session.settings.skip_answer_input;
    const wrongIds = skippedStudy
      ? []
      : session.question_ids.filter((id) => !session.answers[id]?.is_correct);
    const result = {
      book_id: book.id,
      finished_at: new Date().toISOString(),
      settings: session.settings,
      total: session.question_ids.length,
      correct: skippedStudy ? null : session.question_ids.length - wrongIds.length,
      answered_count: Object.values(session.answers).filter((item) => item?.answered_at).length,
      revealed_count: Object.values(session.answers).filter((item) => item?.revealed_at).length,
      question_ids: [...session.question_ids],
      wrong_question_ids: wrongIds,
      answers: session.answers,
    };
    const results = QuizApp.getLastResultMap();
    results[book.id] = result;
    QuizApp.saveLastResultMap(results);
    console.log("[quiz_app] finishSession", {
      bookId: book.id,
      result,
      statsAfterSave: QuizApp.getStatsMap()[book.id],
    });
    removeSession();
    renderSummary(result);
  }

  function renderSummary(result) {
    setView("summary");
    const studyMode = Boolean(result.settings?.skip_answer_input);
    const wrongQuestions = studyMode ? [] : result.wrong_question_ids.map((id) => questionById(id)).filter(Boolean);
    const answeredQuestions = result.question_ids || session.question_ids;

    summaryView.innerHTML = `
      <h2>${studyMode ? "確認まとめ" : "結果まとめ"}</h2>
      <div class="summary-score">
        <div class="score-tile"><span>問題数</span><strong>${result.total}</strong></div>
        ${studyMode
          ? `
            <div class="score-tile"><span>見た問題</span><strong>${result.revealed_count}</strong></div>
            <div class="score-tile"><span>採点</span><strong>なし</strong></div>
          `
          : `
            <div class="score-tile"><span>正解率</span><strong>${Math.round((result.correct / result.total) * 100)}%</strong></div>
            <div class="score-tile"><span>間違い</span><strong>${wrongQuestions.length}問</strong></div>
          `
        }
      </div>
      <div class="actions">
        ${!studyMode ? `<button type="button" id="retry-wrong" ${wrongQuestions.length === 0 ? "disabled" : ""}>間違えた問題だけ再挑戦</button>` : ""}
        <button class="secondary-button" type="button" id="restart">最初から解き直す</button>
        <button class="secondary-button" type="button" id="summary-back">問題集一覧に戻る</button>
      </div>
      <h2 style="margin-top: 26px;">今回の内容</h2>
      <div class="wrong-list">
        ${answeredQuestions.map((id) => {
          const question = questionById(id);
          const answerData = result.answers?.[id];
          const studyResult = Boolean(studyMode);
          const correct = Boolean(answerData?.is_correct);
          const questionLabel = question?.question || id;
          const correctText = question ? QuizApp.correctAnswerText(question) : "未取得";
          return `
            <article class="wrong-item">
              <div class="question-number">${QuizApp.escapeHtml(question ? `${answeredQuestions.indexOf(id) + 1}.` : "")}</div>
              <div class="question-text markdown-body">${renderMarkdown(questionLabel)}</div>
              <div class="answer-block">
                ${studyResult
                  ? `
                    <p><strong>表示:</strong> 完了</p>
                    <p><strong>正解:</strong> ${QuizApp.escapeHtml(correctText)}</p>
                  `
                  : `
                    <p><strong>判定:</strong> ${correct ? "正解" : "不正解"}</p>
                    <p><strong>自分の回答:</strong> ${QuizApp.escapeHtml(question ? QuizApp.formatAnswer(question, answerData?.answer) : "未取得")}</p>
                    <p><strong>正解:</strong> ${QuizApp.escapeHtml(correctText)}</p>
                    <p><strong>通算正解率:</strong> ${QuizApp.escapeHtml(question ? QuizApp.correctRate(book.id, id) : "未取得")}</p>
                  `
                }
              </div>
              ${question?.explanation ? `<p class="muted">${QuizApp.escapeHtml(question.explanation)}</p>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function startNewSession() {
    session = createSession(settingsFromForm());
    saveSession();
    renderQuestion();
  }

  function resumeSession() {
    if (!existingSession) return;
    session = existingSession;
    saveSession();
    renderQuestion();
  }

  function prepareSetupScreen() {
    if (existingSession) {
      applySettingsToForm(existingSession.settings);
      resumeQuizButton.hidden = false;
      resumeInfo.textContent = `途中データがあります。${existingSession.current_index + 1} 問目から続けられます。`;
    } else {
      applySettingsToForm(DEFAULT_SETTINGS);
      resumeQuizButton.hidden = true;
      resumeInfo.textContent = "設定を選んで開始してください。";
    }
    setView("setup");
  }

  document.addEventListener("click", (event) => {
    if (event.target.id === "back-to-list" || event.target.id === "summary-back") {
      location.href = "index.html";
    }
    if (event.target.id === "retry-wrong") {
      const result = QuizApp.getLastResultMap()[book.id];
      const wrongIds = result?.wrong_question_ids || [];
      if (wrongIds.length > 0) {
        session = createSession({ ...session?.settings, shuffle_questions: false, review_at_end: true });
        session.question_ids = wrongIds;
        saveSession();
        renderQuestion();
      }
    }
    if (event.target.id === "restart") {
      startNewSession();
    }
    if (event.target.id === "next-question") {
      advanceQuestion();
    }
    if (event.target.id === "show-answer") {
      revealAnswer();
    }
    const orderedButton = event.target.closest?.(".ordered-choice-button");
    if (orderedButton && !orderedButton.disabled) {
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

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (!document.getElementById("next-question")) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.target instanceof HTMLButtonElement && event.target.id !== "next-question") return;
    event.preventDefault();
    advanceQuestion();
  });

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

  startQuizButton.addEventListener("click", startNewSession);
  resumeQuizButton.addEventListener("click", resumeSession);

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
    existingSession = loadExistingSession();

    if (resumeRequested && existingSession) {
      session = existingSession;
      saveSession();
      renderQuestion();
    } else {
      prepareSetupScreen();
    }
  } catch (error) {
    titleElement.textContent = "読み込み失敗";
    QuizApp.showMessage(error.message);
  }
})();
