// typeset.js: lay out plain structured text on letter-size pages.
// Used for pasted text and Word files. Because we place every word ourselves,
// word positions are exact (no OCR), and the ragged right edge leaves the
// white space the red-pen notes need.

const PAGE_W = 1700, PAGE_H = 2200;     // US letter at 200 dpi
const MARGIN = 200;                       // 1 inch
const BODY = 33;                          // 12 pt
const FAMILY = 'Tinos, "Times New Roman", Times, serif';

const STYLE = {
  h1: { size: 46, bold: true, before: 0, after: 0.7 },
  h2: { size: 39, bold: true, before: 0.6, after: 0.45 },
  h3: { size: 35, bold: true, before: 0.5, after: 0.35 },
  p:  { size: BODY, before: 0, after: 0.6 },
  li: { size: BODY, before: 0, after: 0.25 },
  quote: { size: BODY, italic: true, before: 0, after: 0.6, indent: 60 },
};

const fontFor = (size, bold, italic) => `${italic ? "italic " : ""}${bold ? 700 : 400} ${size}px ${FAMILY}`;

export async function loadTypesetFonts() {
  try {
    await Promise.all([fontFor(BODY, false, false), fontFor(BODY, true, false), fontFor(BODY, false, true)]
      .map(f => document.fonts.load(f)));
  } catch { /* fall back to system serif */ }
}

/**
 * blocks: [{ type: "h1"|"h2"|"h3"|"p"|"li"|"quote", runs: [{ text, bold, italic } | { br: true }],
 *            marker?: "•" | "3.", level?: 0.. }]
 * returns { pages: [{ image, words, crop }], truncated }
 */
export function typeset(blocks, maxPages) {
  const meas = document.createElement("canvas").getContext("2d");
  const pages = [];
  let page = null, ctx = null, y = 0, lineNo = 0, truncated = false;

  const newPage = () => {
    if (pages.length >= maxPages) { truncated = true; return false; }
    const c = document.createElement("canvas"); c.width = PAGE_W; c.height = PAGE_H;
    ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = "#111"; ctx.textBaseline = "alphabetic";
    page = { image: c, words: [], crop: true };
    pages.push(page); y = MARGIN;
    return true;
  };
  if (!newPage()) return { pages, truncated };

  for (let bi = 0; bi < blocks.length && !truncated; bi++) {
    const b = blocks[bi];
    const st = STYLE[b.type] || STYLE.p;
    const size = st.size, lh = Math.round(size * 1.48);
    const indent = (st.indent || 0) + (b.type === "li" ? 56 + 48 * (b.level || 0) : 0);
    const left = MARGIN + indent, right = PAGE_W - MARGIN;
    if (y > MARGIN) y += Math.round(st.before * lh);

    // break runs into tokens; "glue" marks a token that continues the previous word (style change mid-word)
    const toks = [];
    for (const r of b.runs) {
      if (r.br) { toks.push({ br: true }); continue; }
      const bold = r.bold || st.bold, italic = r.italic || st.italic;
      const parts = String(r.text).split(/(\s+)/);
      let leadingSpace = false;
      parts.forEach((part, i) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { leadingSpace = true; return; }
        const prev = toks[toks.length - 1];
        const glue = i === 0 && !leadingSpace && prev && !prev.br && !prev.spaceAfter;
        toks.push({ text: part, bold, italic, glue });
        leadingSpace = false;
      });
      if (/\s$/.test(r.text) && toks.length) toks[toks.length - 1].spaceAfter = true;
    }
    // words = glued groups
    const groups = [];
    for (const t of toks) {
      if (t.br) { groups.push({ br: true }); continue; }
      meas.font = fontFor(size, t.bold, t.italic);
      t.w = meas.measureText(t.text).width;
      if (t.glue && groups.length && !groups[groups.length - 1].br) groups[groups.length - 1].parts.push(t);
      else groups.push({ parts: [t] });
    }
    for (const g of groups) if (!g.br) g.w = g.parts.reduce((s, t) => s + t.w, 0);
    meas.font = fontFor(size, false, false);
    const space = meas.measureText(" ").width;

    // greedy line breaking (ragged right)
    const lines = []; let cur = [], curW = 0;
    for (const g of groups) {
      if (g.br) { lines.push(cur); cur = []; curW = 0; continue; }
      const add = (cur.length ? space : 0) + g.w;
      if (cur.length && curW + add > right - left) { lines.push(cur); cur = [g]; curW = g.w; }
      else { cur.push(g); curW += add; }
    }
    if (cur.length || !lines.length) lines.push(cur);

    lines.forEach((ln, li) => {
      if (y + lh > PAGE_H - MARGIN && y > MARGIN) { if (!newPage()) return; }
      if (truncated) return;
      const base = y + Math.round(size * 0.95);
      if (li === 0 && b.marker) {
        ctx.font = fontFor(size, false, false);
        const mw = ctx.measureText(b.marker).width;
        ctx.fillText(b.marker, left - 18 - mw, base);
      }
      let x = left; lineNo++;
      for (const g of ln) {
        const x0 = x;
        for (const t of g.parts) { ctx.font = fontFor(size, t.bold, t.italic); ctx.fillText(t.text, x, base); x += t.w; }
        page.words.push({ text: g.parts.map(t => t.text).join(""), x: x0, y: base - size * 0.78, w: x - x0, h: size * 0.98,
                          line: `${pages.length}:t${lineNo}` });
        x += space;
      }
      y += lh;
    });
    y += Math.round(st.after * lh);
  }
  // drop a trailing empty page
  if (pages.length > 1 && !pages[pages.length - 1].words.length) pages.pop();
  return { pages, truncated };
}

// ---------- pasted text -> blocks ----------
const LIST_RE = /^\s*(?:[-*•‣◦]|\d{1,3}[.)])\s+/;

export function blocksFromText(raw) {
  const text = String(raw).replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/ /g, " ").trim();
  if (!text) return [];
  const hasBlank = /\n\s*\n/.test(text);
  // with blank lines: blank line = paragraph, single newline = line break.
  // without: each line is its own paragraph (how most web/app copies arrive).
  const chunks = hasBlank ? text.split(/\n\s*\n/) : text.split("\n");
  const blocks = [];
  for (const chunk of chunks) {
    const lines = chunk.split("\n").map(l => l.replace(/\s+$/, "")).filter(l => l.trim());
    if (!lines.length) continue;
    if (lines.every(l => LIST_RE.test(l))) {
      for (const l of lines) {
        const m = l.match(LIST_RE)[0];
        const num = m.trim().match(/^\d+/);
        blocks.push({ type: "li", marker: num ? `${num[0]}.` : "•", runs: [{ text: l.slice(m.length).trim() }] });
      }
      continue;
    }
    const runs = [];
    lines.forEach((l, i) => { if (i) runs.push({ br: true }); runs.push({ text: l.trim() }); });
    blocks.push({ type: "p", runs });
  }
  // a short first line with no end punctuation reads as a title
  const f = blocks[0];
  if (blocks.length > 1 && f.type === "p" && f.runs.length === 1) {
    const t = f.runs[0].text;
    if (t.length <= 80 && !/[.!?:;,]$/.test(t)) f.type = "h1";
  }
  return blocks;
}

// ---------- Word (HTML from mammoth) -> blocks ----------
export function blocksFromHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const blocks = [];
  const inline = (node, style = {}, out = []) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { if (n.nodeValue) out.push({ text: n.nodeValue, ...style }); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === "br") { out.push({ br: true }); continue; }
      if (tag === "img") continue;
      const s = { ...style };
      if (tag === "strong" || tag === "b") s.bold = true;
      if (tag === "em" || tag === "i") s.italic = true;
      inline(n, s, out);
    }
    return out;
  };
  const clean = (runs) => {
    const r = runs.filter(x => x.br || x.text);
    while (r.length && (r[0].br || !r[0].text.trim())) r.shift();
    while (r.length && (r[r.length - 1].br || !r[r.length - 1].text.trim())) r.pop();
    return r;
  };
  const walk = (el, level = 0) => {
    for (const n of el.children) {
      const tag = n.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const runs = clean(inline(n)); if (runs.length) blocks.push({ type: tag === "h1" ? "h1" : tag === "h2" ? "h2" : "h3", runs });
      } else if (tag === "p") {
        const runs = clean(inline(n)); if (runs.length) blocks.push({ type: "p", runs });
      } else if (tag === "blockquote") {
        const runs = clean(inline(n)); if (runs.length) blocks.push({ type: "quote", runs });
      } else if (tag === "ul" || tag === "ol") {
        let k = 0;
        for (const li of n.children) {
          if (li.tagName.toLowerCase() !== "li") continue;
          k++;
          const own = li.cloneNode(true);
          own.querySelectorAll("ul,ol").forEach(x => x.remove());
          const runs = clean(inline(own));
          if (runs.length) blocks.push({ type: "li", level, marker: tag === "ol" ? `${k}.` : "•", runs });
          for (const sub of li.children) if (/^(ul|ol)$/i.test(sub.tagName)) walk({ children: [sub] }, level + 1);
        }
      } else if (tag === "table") {
        for (const tr of n.querySelectorAll("tr")) {
          const cells = [...tr.children].map(td => td.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
          if (cells.length) blocks.push({ type: "p", runs: [{ text: cells.join("   |   ") }] });
        }
      } else {
        walk(n, level);
      }
    }
  };
  walk(doc.body);
  return blocks;
}
