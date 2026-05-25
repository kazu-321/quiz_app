(function () {
  const STORAGE_KEYS = {
    progress: "quiz_app_progress",
    stats: "quiz_app_stats",
    lastResult: "quiz_app_last_result"
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

  function normalizeText(value, question) {
    let text = String(value ?? "");
    if (question.trim !== false) text = text.trim();
    if (question.normalize_spaces) text = text.replace(/\s+/g, " ");
    if (!question.case_sensitive) text = text.toLowerCase();
    return text;
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
      return (question.inputs || []).every((input, index) => {
        const userValue = normalizeText(answer?.[index] ?? "", question);
        return (input.answers || []).some((candidate) => normalizeText(candidate, question) === userValue);
      });
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
      return (answer || []).map((value, index) => {
        const label = question.inputs?.[index]?.label || `入力${index + 1}`;
        return `${label}: ${value}`;
      }).join(" / ");
    }
    return String(answer);
  }

  function correctAnswerText(question) {
    if (question.type === "text_input") {
      return (question.inputs || []).map((input, index) => {
        const label = input.label || `入力${index + 1}`;
        return `${label}: ${(input.answers || []).join(" / ")}`;
      }).join(" / ");
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
    isCorrect,
    shuffle,
    formatAnswer,
    correctAnswerText,
    updateStats,
    correctRate,
    bookAccuracy
  };
})();
