const manifestPath = "notes/manifest.json";
const state = {
  notes: [],
  activeNote: null,
  headings: [],
  slugs: new Map(),
};

const noteList = document.querySelector("#note-list");
const searchInput = document.querySelector("#note-search");
const meta = document.querySelector("#note-meta");
const body = document.querySelector("#markdown-body");
const toc = document.querySelector("#toc");

init();

async function init() {
  try {
    const response = await fetch(manifestPath, { cache: "no-store" });
    if (!response.ok) throw new Error(`Cannot load ${manifestPath}`);
    state.notes = await response.json();
    renderNoteList(state.notes);
    bindEvents();

    const requested = new URLSearchParams(location.search).get("note");
    const initial = state.notes.find((note) => note.file === requested) || state.notes[0];
    if (initial) loadNote(initial);
  } catch (error) {
    noteList.innerHTML = `<p class="load-error">无法读取笔记清单：${escapeHtml(error.message)}</p>`;
  }
}

function bindEvents() {
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = state.notes.filter((note) => {
      const content = [note.title, note.description, ...(note.tags || [])].join(" ").toLowerCase();
      return content.includes(query);
    });
    renderNoteList(filtered);
  });

  window.addEventListener("scroll", highlightActiveHeading, { passive: true });
}

function renderNoteList(notes) {
  if (!notes.length) {
    noteList.innerHTML = `<p class="load-error">没有匹配的笔记。</p>`;
    return;
  }

  noteList.innerHTML = notes
    .map(
      (note) => `
        <button class="note-item" type="button" data-file="${escapeHtml(note.file)}">
          <strong>${escapeHtml(note.title)}</strong>
          <span>${escapeHtml(note.description || "未填写摘要")}</span>
        </button>
      `,
    )
    .join("");

  noteList.querySelectorAll(".note-item").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = state.notes.find((note) => note.file === button.dataset.file);
      if (selected) loadNote(selected);
    });
  });

  markActiveNote();
}

async function loadNote(note) {
  state.activeNote = note;
  markActiveNote();
  meta.innerHTML = renderMeta(note);
  body.innerHTML = `<p>正在加载...</p>`;
  toc.innerHTML = "";

  const response = await fetch(`notes/${note.file}`, { cache: "no-store" });
  if (!response.ok) {
    body.innerHTML = `<p>无法加载 <code>${escapeHtml(note.file)}</code>。</p>`;
    return;
  }

  const markdown = await response.text();
  body.innerHTML = renderMarkdown(markdown, note.file);
  state.headings = collectHeadings();
  renderToc();
  body.focus({ preventScroll: true });

  const url = new URL(location.href);
  url.searchParams.set("note", note.file);
  history.replaceState({}, "", url);
}

function renderMeta(note) {
  const date = note.date ? `<span>${escapeHtml(note.date)}</span>` : "";
  const tags = (note.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  return `
    <h1>${escapeHtml(note.title)}</h1>
    <div class="meta-row">${date}${tags}</div>
  `;
}

function markActiveNote() {
  noteList.querySelectorAll(".note-item").forEach((button) => {
    button.classList.toggle("active", state.activeNote?.file === button.dataset.file);
  });
}

function renderMarkdown(markdown, noteFile) {
  const blocks = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  state.slugs = new Map();
  let paragraph = [];
  let list = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];
  let quote = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${renderInline(paragraph.join(" "), noteFile)}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(`<ul>${list.map((item) => `<li>${renderInline(item, noteFile)}</li>`).join("")}</ul>`);
      list = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(`<blockquote>${quote.map((line) => `<p>${renderInline(line, noteFile)}</p>`).join("")}</blockquote>`);
      quote = [];
    }
  };

  for (const line of lines) {
    const codeMatch = line.match(/^```(\w+)?\s*$/);
    if (codeMatch) {
      if (inCode) {
        blocks.push(
          `<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`,
        );
        inCode = false;
        codeLang = "";
        codeLines = [];
      } else {
        flushParagraph();
        flushList();
        flushQuote();
        inCode = true;
        codeLang = codeMatch[1] || "";
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = uniqueSlug(text);
      blocks.push(`<h${level} id="${id}">${renderInline(text, noteFile)}</h${level}>`);
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(
        `<p><img src="${escapeAttribute(resolveMarkdownUrl(image[2], noteFile))}" alt="${escapeAttribute(image[1])}" /></p>`,
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushQuote();
      list.push(bullet[1]);
      continue;
    }

    const quoteLine = line.match(/^>\s?(.*)$/);
    if (quoteLine) {
      flushParagraph();
      flushList();
      quote.push(quoteLine[1]);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushQuote();

  return blocks.join("\n");
}

function renderInline(text, noteFile = "") {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      return `<a href="${escapeAttribute(resolveMarkdownUrl(href, noteFile))}" target="_blank" rel="noreferrer">${label}</a>`;
    });
}

function collectHeadings() {
  return [...body.querySelectorAll("h2, h3, h4")].map((heading) => ({
    id: heading.id,
    level: Number(heading.tagName.slice(1)),
    text: heading.textContent,
    top: heading.offsetTop,
  }));
}

function renderToc() {
  if (!state.headings.length) {
    toc.innerHTML = `<span class="toc-empty">这篇笔记没有二级或三级小标题。</span>`;
    return;
  }

  toc.innerHTML = state.headings
    .map(
      (heading) =>
        `<a class="level-${heading.level}" href="#${heading.id}" data-id="${heading.id}">${escapeHtml(heading.text)}</a>`,
    )
    .join("");
  highlightActiveHeading();
}

function highlightActiveHeading() {
  if (!state.headings.length) return;
  const current = [...body.querySelectorAll("h2, h3, h4")]
    .filter((heading) => heading.getBoundingClientRect().top < 140)
    .pop();

  const currentId = current?.id || state.headings[0].id;
  toc.querySelectorAll("a").forEach((link) => {
    link.classList.toggle("active", link.dataset.id === currentId);
  });
}

function slugify(text) {
  const slug = encodeURIComponent(
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, ""),
  );
  return slug || "section";
}

function uniqueSlug(text) {
  const base = slugify(text);
  const count = state.slugs.get(base) || 0;
  state.slugs.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
}

function resolveMarkdownUrl(url, noteFile) {
  if (/^(https?:|mailto:|#|\/)/i.test(url)) return url;
  const base = noteFile.includes("/") ? noteFile.slice(0, noteFile.lastIndexOf("/") + 1) : "";
  return `notes/${base}${url}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
