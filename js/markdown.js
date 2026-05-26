(function (global) {
  const PLACEHOLDER_PREFIX = "\u0000md-placeholder-";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isSafeHref(href) {
    return /^(https?:|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(href);
  }

  function renderInline(source) {
    const placeholders = [];
    const text = String(source ?? "").replace(/`([^`]+)`/g, (_, code) => {
      const token = `${PLACEHOLDER_PREFIX}${placeholders.length}\u0000`;
      placeholders.push(`<code>${escapeHtml(code)}</code>`);
      return token;
    });

    let html = escapeHtml(text);

    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const safeHref = href.trim();
      if (!isSafeHref(safeHref)) {
        return label;
      }
      return `<a href="${escapeHtml(safeHref)}">${label}</a>`;
    });

    html = html.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*])\*([^\s*][^*]*?[^\s*])\*(?!\*)/g, "$1<em>$2</em>");
    html = html.replace(/(^|[^_])_([^\s_][^_]*?[^\s_])_(?!_)/g, "$1<em>$2</em>");

    html = html.replace(/\n/g, "<br>");
    html = html.replace(/\u0000md-placeholder-(\d+)\u0000/g, (_, index) => {
      return placeholders[Number(index)] || "";
    });
    return html;
  }

  function parseBlocks(source) {
    const text = String(source ?? "").replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      const fence = line.match(/^```([\w-]+)?\s*$/);
      if (fence) {
        const lang = fence[1] || "";
        const content = [];
        index += 1;
        while (index < lines.length && !/^```\s*$/.test(lines[index])) {
          content.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) {
          index += 1;
        }
        blocks.push({ type: "code", lang, content: content.join("\n") });
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
        index += 1;
        continue;
      }

      if (/^---\s*$/.test(line)) {
        blocks.push({ type: "hr" });
        index += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quoted = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) {
          quoted.push(lines[index].replace(/^>\s?/, ""));
          index += 1;
        }
        blocks.push({ type: "blockquote", text: quoted.join("\n") });
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*[-*+]\s+/, ""));
          index += 1;
        }
        blocks.push({ type: "ul", items });
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
          index += 1;
        }
        blocks.push({ type: "ol", items });
        continue;
      }

      const paragraph = [];
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^```/.test(lines[index]) &&
        !/^(#{1,6})\s+/.test(lines[index]) &&
        !/^---\s*$/.test(lines[index]) &&
        !/^>\s?/.test(lines[index]) &&
        !/^\s*[-*+]\s+/.test(lines[index]) &&
        !/^\s*\d+\.\s+/.test(lines[index])
      ) {
        paragraph.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    }

    return blocks;
  }

  function renderBlock(block) {
    if (block.type === "heading") {
      return `<h${block.level}>${renderInline(block.text)}</h${block.level}>`;
    }
    if (block.type === "code") {
      const className = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : "";
      return `<pre><code${className}>${escapeHtml(block.content)}</code></pre>`;
    }
    if (block.type === "hr") {
      return "<hr>";
    }
    if (block.type === "blockquote") {
      return `<blockquote>${renderInline(block.text).replace(/\n/g, "<br>")}</blockquote>`;
    }
    if (block.type === "ul") {
      return `<ul>${block.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`;
    }
    if (block.type === "ol") {
      return `<ol>${block.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`;
    }
    return `<p>${renderInline(block.text)}</p>`;
  }

  function render(markdown) {
    if (markdown === null || markdown === undefined || markdown === "") {
      return "";
    }
    return parseBlocks(markdown).map(renderBlock).join("");
  }

  global.QuizMarkdown = {
    render,
    renderInline,
    escapeHtml,
  };
})(window);
