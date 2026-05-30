(function () {
  const STORAGE_KEYS = {
    progress: "quiz_app_progress",
    stats: "quiz_app_stats",
    lastResult: "quiz_app_last_result",
    theme: "quiz_app_theme"
  };

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`Failed to read ${key}`, error);
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${path} の読み込みに失敗しました (${response.status})`);
    }
    return response.json();
  }

  function showMessage(text) {
    const element = document.getElementById("message");
    if (!element) return;
    element.textContent = text;
    element.hidden = false;
  }

  function hideMessage() {
    const element = document.getElementById("message");
    if (!element) return;
    element.hidden = true;
    element.textContent = "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getProgressMap() {
    return readJson(STORAGE_KEYS.progress, {});
  }

  function saveProgressMap(progress) {
    writeJson(STORAGE_KEYS.progress, progress);
  }

  function removeProgress(bookId) {
    const progress = getProgressMap();
    delete progress[bookId];
    saveProgressMap(progress);
  }

  function getStatsMap() {
    return readJson(STORAGE_KEYS.stats, {});
  }

  function saveStatsMap(stats) {
    writeJson(STORAGE_KEYS.stats, stats);
  }

  function getLastResultMap() {
    return readJson(STORAGE_KEYS.lastResult, {});
  }

  function saveLastResultMap(results) {
    writeJson(STORAGE_KEYS.lastResult, results);
  }

  function hydrateStatsFromLastResult() {
    const stats = getStatsMap();
    const results = getLastResultMap();
    let changed = false;

    console.log("[quiz_app] hydrateStatsFromLastResult:start", {
      resultBooks: Object.keys(results || {}),
      statBooks: Object.keys(stats || {}),
    });

    for (const [bookId, result] of Object.entries(results || {})) {
      const answers = result?.answers;
      if (!answers || typeof answers !== "object") continue;
      stats[bookId] = stats[bookId] || {};

      for (const [questionId, record] of Object.entries(answers)) {
        if (!record || record.answered_at === undefined) continue;
        if (stats[bookId][questionId]) continue;

        console.log("[quiz_app] hydrateStatsFromLastResult:seed", {
          bookId,
          questionId,
          record,
        });
        stats[bookId][questionId] = {
          attempts: 1,
          corrects: record.is_correct ? 1 : 0,
          last_answer: record.answer,
          last_correct: Boolean(record.is_correct),
          last_answered_at: record.answered_at,
        };
        changed = true;
      }
    }

    if (changed) {
      saveStatsMap(stats);
    }

    console.log("[quiz_app] hydrateStatsFromLastResult:end", {
      changed,
      statBooks: Object.keys(stats || {}),
    });
  }

  function getPreferredTheme() {
    const stored = localStorage.getItem(STORAGE_KEYS.theme);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    const normalized = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = normalized;
    document.documentElement.style.colorScheme = normalized;
    return normalized;
  }

  function setTheme(theme) {
    const normalized = theme === "dark" ? "dark" : "light";
    localStorage.setItem(STORAGE_KEYS.theme, normalized);
    return applyTheme(normalized);
  }

  function toggleTheme() {
    return setTheme(getPreferredTheme() === "dark" ? "light" : "dark");
  }

  function refreshThemeToggle(button) {
    if (!button) return;
    const theme = document.documentElement.dataset.theme || getPreferredTheme();
    button.textContent = theme === "dark" ? "ライトモード" : "ダークモード";
    button.setAttribute("aria-label", theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え");
    button.dataset.themeState = theme;
  }

  function initTheme(themeButton = null) {
    applyTheme(getPreferredTheme());
    refreshThemeToggle(themeButton);
    if (!themeButton) return;
    themeButton.addEventListener("click", () => {
      const next = toggleTheme();
      refreshThemeToggle(themeButton);
      return next;
    });
  }

  function hardReload() {
    const url = new URL(window.location.href);
    url.searchParams.set("__reload", Date.now().toString(36));
    window.location.replace(url.toString());
  }

  function initHardReloadButton(button = null) {
    if (!button) return;
    button.setAttribute("aria-label", "強制更新する");
    button.setAttribute("title", "Shift+F5 相当で再読み込み");
    button.addEventListener("click", hardReload);
  }

  function normalizeText(value, question) {
    let text = String(value ?? "");
    if (question.trim !== false) text = text.trim();
    if (question.normalize_spaces) text = text.replace(/\s+/g, " ");
    if (!question.case_sensitive) text = text.toLowerCase();
    return text;
  }

  function textInputMatchesOrdered(question, answer) {
    const inputs = question.inputs || [];
    if (!Array.isArray(answer) || answer.length !== inputs.length) {
      return false;
    }
    return inputs.every((input, index) => {
      const userValue = normalizeText(answer?.[index] ?? "", question);
      return (input.answers || []).some((candidate) => normalizeText(candidate, question) === userValue);
    });
  }

  function textInputMatchesUnordered(question, answer) {
    const inputs = question.inputs || [];
    if (!Array.isArray(answer) || answer.length !== inputs.length) {
      return false;
    }

    const normalizedAnswer = answer.map((value) => normalizeText(value, question));
    const candidateIndices = inputs.map((input) => {
      const allowed = input.answers || [];
      return normalizedAnswer.flatMap((userValue, userIndex) => {
        return allowed.some((candidate) => normalizeText(candidate, question) === userValue)
          ? [userIndex]
          : [];
      });
    });

    if (candidateIndices.some((indices) => indices.length === 0)) {
      return false;
    }

    candidateIndices.sort((left, right) => left.length - right.length);
    const used = new Set();

    function search(position) {
      if (position >= candidateIndices.length) {
        return true;
      }
      for (const userIndex of candidateIndices[position]) {
        if (used.has(userIndex)) continue;
        used.add(userIndex);
        if (search(position + 1)) {
          return true;
        }
        used.delete(userIndex);
      }
      return false;
    }

    return search(0);
  }

  function sameSet(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    const a = [...left].sort((x, y) => x - y);
    const b = [...right].sort((x, y) => x - y);
    return a.every((value, index) => value === b[index]);
  }

  function isCorrect(question, answer) {
    if (question.type === "single_choice") {
      return Number(answer) === Number(question.answer);
    }
    if (question.type === "multiple_choice") {
      return sameSet(answer, question.answer);
    }
    if (question.type === "ordered_choice") {
      return Array.isArray(answer) &&
        Array.isArray(question.answer) &&
        answer.length === question.answer.length &&
        answer.every((value, index) => Number(value) === Number(question.answer[index]));
    }
    if (question.type === "text_input") {
      return question.input_ordered === false
        ? textInputMatchesUnordered(question, answer)
        : textInputMatchesOrdered(question, answer);
    }
    return false;
  }

  function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function formatAnswer(question, answer) {
    if (answer === undefined || answer === null) return "未回答";
    if (question.type === "single_choice") {
      return question.choices?.[answer] ?? String(answer);
    }
    if (question.type === "multiple_choice" || question.type === "ordered_choice") {
      return (answer || []).map((index) => question.choices?.[index] ?? String(index)).join(" / ");
    }
    if (question.type === "text_input") {
      return (answer || []).map((value, index) => `入力${index + 1}: ${value}`).join(" / ");
    }
    return String(answer);
  }

  function correctAnswerText(question) {
    if (question.type === "text_input") {
      const answerText = (question.inputs || []).map((input, index) => {
        return `入力${index + 1}: ${(input.answers || []).join(" / ")}`;
      }).join(" / ");
      return question.input_ordered === false ? `順不同: ${answerText}` : answerText;
    }
    return formatAnswer(question, question.answer);
  }

  function updateStats(bookId, questionId, answer, correct) {
    const stats = getStatsMap();
    stats[bookId] = stats[bookId] || {};
    const current = stats[bookId][questionId] || { attempts: 0, corrects: 0 };
    current.attempts += 1;
    current.corrects += correct ? 1 : 0;
    current.last_answer = answer;
    current.last_correct = correct;
    current.last_answered_at = new Date().toISOString();
    stats[bookId][questionId] = current;
    saveStatsMap(stats);
    console.log("[quiz_app] updateStats", {
      bookId,
      questionId,
      answer,
      correct,
      saved: current,
    });
  }

  function correctRate(bookId, questionId) {
    const stats = getStatsMap();
    const item = stats?.[bookId]?.[questionId];
    if (!item || !item.attempts) return "未解答";
    return `${Math.round((item.corrects / item.attempts) * 100)}% (${item.corrects}/${item.attempts})`;
  }

  function bookAccuracy(bookId) {
    const stats = getStatsMap();
    const bookStats = stats?.[bookId] || {};
    const summary = Object.values(bookStats).reduce((acc, item) => {
      acc.attempts += Number(item?.attempts || 0);
      acc.corrects += Number(item?.corrects || 0);
      return acc;
    }, { attempts: 0, corrects: 0 });

    if (!summary.attempts) {
      return {
        attempts: 0,
        corrects: 0,
        rateText: "未解答"
      };
    }

    const percent = Math.round((summary.corrects / summary.attempts) * 100);
    return {
      attempts: summary.attempts,
      corrects: summary.corrects,
      rateText: `${percent}% (${summary.corrects}/${summary.attempts})`
    };
  }

  window.QuizApp = {
    STORAGE_KEYS,
    fetchJson,
    showMessage,
    hideMessage,
    escapeHtml,
    getProgressMap,
    saveProgressMap,
    removeProgress,
    getStatsMap,
    getLastResultMap,
    saveLastResultMap,
    hydrateStatsFromLastResult,
    getPreferredTheme,
    applyTheme,
    setTheme,
    toggleTheme,
    refreshThemeToggle,
    initTheme,
    hardReload,
    initHardReloadButton,
    isCorrect,
    shuffle,
    formatAnswer,
    correctAnswerText,
    updateStats,
    correctRate,
    bookAccuracy
  };
})();
