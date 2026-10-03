// ink.js: draws the red-pen markup onto a page.
// Given a page image, its words (with boxes) and the grader's issues, it draws the
// marks, then squeezes each note into the nearest empty space on the paper itself,
// routing arrows so they don't slash through text. Low-priority notes are dropped
// rather than shrunk into illegibility when the page is full.

export const INK = "rgba(196, 22, 32, 0.93)";
const HAND = '"Caveat", "Bradley Hand", "Segoe Print", cursive';
const font = (sz) => `${sz}px ${HAND}`;

const MARGIN = 170;            // plain paper around the text (px at ~200 dpi)
const NOTE_SIZES = [34, 31, 28];
const NOTE_WIDTHS = [620, 480, 380, 300, 230, 170];
const LINE_H = 1.08;
const CELL = 4;                // occupancy grid resolution (px)

// ---------- small utilities ----------
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
let rand = makeRng(7);
const jit = (v, a) => v + (rand() * 2 - 1) * a;

export function norm(s) { return String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, ""); }

function lcs(a, b) {
  const m = a.length, n = b.length; if (!m || !n) return 0;
  let prev = new Uint16Array(n + 1), cur = new Uint16Array(n + 1);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    [prev, cur] = [cur, prev]; cur.fill(0);
  }
  return prev[n];
}
function tokenSim(a, b) {          // a, b already normalized
  if (a === b) return 1;
  if (a.length <= 3 || b.length <= 3) return 0;      // short words must match exactly
  return (2 * lcs(a, b)) / (a.length + b.length);
}

// ---------- anchor matching ----------
function findAll(words, phrase) {
  const toks = String(phrase).split(/\s+/).map(norm).filter(Boolean);
  if (!toks.length) return [];
  const hits = [];
  for (let i = 0; i + toks.length <= words.length; i++) {
    let sum = 0, ok = true;
    for (let k = 0; k < toks.length; k++) {
      const s = tokenSim(words[i + k].n, toks[k]);
      if (s < 0.75) { ok = false; break; }
      sum += s;
    }
    if (ok && sum / toks.length >= 0.85) hits.push(words.slice(i, i + toks.length));
  }
  return hits;
}
function findExact(words, phrase) {
  const toks = String(phrase).split(/\s+/).map(norm).filter(Boolean);
  const hits = [];
  if (!toks.length) return hits;
  for (let i = 0; i + toks.length <= words.length; i++) {
    if (toks.every((t, k) => words[i + k].n === t)) hits.push(words.slice(i, i + toks.length));
  }
  return hits;
}
function resolve(words, anchor, occurrence) {
  // exact text wins; fuzzy matching only rescues OCR slips (so "you're" never lands on "your")
  let hits = findExact(words, anchor);
  if (!hits.length) hits = findAll(words, anchor);
  if (!hits.length) return null;
  const k = Math.max(1, occurrence || 1);
  return k <= hits.length ? hits[k - 1] : null;
}
function lineBoxes(span) {
  const groups = new Map();
  for (const w of span) { if (!groups.has(w.line)) groups.set(w.line, []); groups.get(w.line).push(w); }
  const boxes = [];
  for (const ws of groups.values()) {
    boxes.push([Math.min(...ws.map(w => w.x)), Math.min(...ws.map(w => w.y)),
                Math.max(...ws.map(w => w.x + w.w)), Math.max(...ws.map(w => w.y + w.h))]);
  }
  return boxes.sort((a, b) => a[1] - b[1]);
}

// ---------- hand-drawn primitives ----------
function stroke(ctx, pts, width = 4) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = INK; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]);
  ctx.stroke(); ctx.restore();
}
function ellipse(ctx, [x0, y0, x1, y1], pad = 10) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2 + pad * 0.6, ry = (y1 - y0) / 2 + pad * 0.7;
  const start = rand() * Math.PI * 2, sweep = Math.PI * 2 * (1.08 + rand() * 0.1), ph = rand() * 6;
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = start + sweep * i / 60, r = 1 + 0.05 * Math.sin(3 * t + ph) + 0.06 * i / 60;
    pts.push([cx + rx * r * Math.cos(t), cy + ry * r * Math.sin(t)]);
  }
  stroke(ctx, pts, 4);
}
function strike(ctx, [x0, y0, x1, y1]) {
  const cy = (y0 + y1) / 2;
  stroke(ctx, [[x0 - 4, jit(cy + 2, 2)], [(x0 + x1) / 2, jit(cy, 2)], [x1 + 4, jit(cy - 2, 2)]], 4);
}
function underline(ctx, [x0, , x1, y1]) {
  const pts = []; for (let x = x0; x <= x1; x += 6) pts.push([x, y1 + 5 + 1.5 * Math.sin(x / 23)]);
  pts.push([x1, y1 + 5]); stroke(ctx, pts, 3);
}
function squiggle(ctx, [x0, , x1, y1]) {
  const pts = []; for (let x = x0; x <= x1; x += 2) pts.push([x, y1 + 6 + 5 * Math.sin((x - x0) / 5)]);
  stroke(ctx, pts, 3);
}
function bracket(ctx, boxes) {
  const x = Math.min(...boxes.map(b => b[0])) - 22;
  const y0 = Math.min(...boxes.map(b => b[1])) - 4, y1 = Math.max(...boxes.map(b => b[3])) + 4;
  stroke(ctx, [[x + 14, y0], [x, y0 + 4], [jit(x, 1), (y0 + y1) / 2], [x, y1 - 4], [x + 14, y1]], 4);
}
function check(ctx, box) {
  const x1 = box[2], y0 = box[1];
  stroke(ctx, [[x1 - 26, y0 - 10], [x1 - 17, y0], [x1 + 2, y0 - 26]], 5);
}
function caretInsert(ctx, [x0, y0, x1, y1], text, lifted) {
  const cx = (x0 + x1) / 2;
  const sz = Math.max(27, Math.min(32, (y1 - y0) * 0.95));
  if (lifted) y0 -= 9;                     // clear the top of a circle
  ctx.font = font(sz); ctx.fillStyle = INK; ctx.textBaseline = "alphabetic";
  const tw = ctx.measureText(text).width;
  ctx.fillText(text, cx - tw / 2, y0 - 3);
  ctx.textBaseline = "top";
  stroke(ctx, [[cx - 7, y1 + 6], [cx, y1 - 3], [cx + 7, y1 + 6]], 3);
}
function arrow(ctx, [sx, sy], [ex, ey]) {
  const mx = (sx + ex) / 2 + jit(0, 6), my = (sy + ey) / 2 + jit(0, 6);
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push([(1 - t) ** 2 * sx + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) ** 2 * sy + 2 * (1 - t) * t * my + t * t * ey]);
  }
  stroke(ctx, pts, 3);
  const [px, py] = pts[pts.length - 3];
  const ang = Math.atan2(ey - py, ex - px);
  for (const s of [-0.5, 0.5]) stroke(ctx, [[ex, ey], [ex - 20 * Math.cos(ang + s), ey - 20 * Math.sin(ang + s)]], 3);
}
function stamp(ctx, cx, cy, grade) {
  const r = 92, pts = [];
  for (let t = 0; t <= 41; t++) {
    const a = t / 40 * Math.PI * 2, rr = r + jit(0, 6);
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  stroke(ctx, pts, 5);
  const sz = grade.length > 2 ? 100 : 130;
  ctx.font = font(sz); ctx.fillStyle = INK; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.fillText(grade, cx, cy + 4);
  ctx.textAlign = "left";
}
function wrap(ctx, text, sz, maxw) {
  ctx.font = font(sz);
  const out = []; let cur = "";
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width <= maxw || !cur) cur = t; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}
function drawLines(ctx, lines, sz, x, y) {
  ctx.font = font(sz); ctx.fillStyle = INK; ctx.textBaseline = "top";
  lines.forEach((ln, k) => ctx.fillText(ln, x + jit(0, 2), y + k * sz * LINE_H));
}

// ---------- free-space tracking on a coarse grid ----------
class Space {
  constructor(baseCtx, W, H, words) {
    this.W = W; this.H = H;
    this.gw = Math.ceil(W / CELL); this.gh = Math.ceil(H / CELL);
    this.occ = new Uint8Array(this.gw * this.gh);
    const px = baseCtx.getImageData(0, 0, W, H).data;
    for (let y = 0; y < H; y++) {
      const row = (y / CELL | 0) * this.gw;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11 < 225) this.occ[row + (x / CELL | 0)] = 1;
      }
    }
    for (const w of words) this.fillPx(w.x - 3, w.y - 3, w.x + w.w + 3, w.y + w.h + 3);
    this.fillPx(0, 0, W, 28); this.fillPx(0, H - 60, W, H);   // keeps the foot clear for the credit line
    this.fillPx(0, 0, 28, H); this.fillPx(W - 28, 0, W, H);
    this.text = this.occ.slice();         // text-only mask, for arrow routing
    this.refresh();
  }
  fillPx(x0, y0, x1, y1) {
    const gx0 = Math.max(0, Math.floor(x0 / CELL)), gy0 = Math.max(0, Math.floor(y0 / CELL));
    const gx1 = Math.min(this.gw, Math.ceil(x1 / CELL)), gy1 = Math.min(this.gh, Math.ceil(y1 / CELL));
    for (let y = gy0; y < gy1; y++) this.occ.fill(1, y * this.gw + gx0, y * this.gw + gx1);
  }
  addInk(inkCtx, rect) {          // rect in px: [x0,y0,x1,y1] or null for the whole page
    let [x0, y0, x1, y1] = rect || [0, 0, this.W, this.H];
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(this.W, Math.ceil(x1)); y1 = Math.min(this.H, Math.ceil(y1));
    const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
    const a = inkCtx.getImageData(x0, y0, w, h).data;
    for (let y = 0; y < h; y++) {
      const row = ((y0 + y) / CELL | 0) * this.gw;
      for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 20) this.occ[row + ((x0 + x) / CELL | 0)] = 1;
    }
    this.refresh();
  }
  refresh(pad = 2) {              // dilate by `pad` cells, then build an integral image
    const { gw, gh, occ } = this;
    const tmp = new Uint8Array(gw * gh), dil = new Uint8Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let v = 0; for (let d = -pad; d <= pad && !v; d++) { const xx = x + d; if (xx >= 0 && xx < gw) v = occ[y * gw + xx]; }
      tmp[y * gw + x] = v;
    }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let v = 0; for (let d = -pad; d <= pad && !v; d++) { const yy = y + d; if (yy >= 0 && yy < gh) v = tmp[yy * gw + x]; }
      dil[y * gw + x] = v;
    }
    const S = new Int32Array((gw + 1) * (gh + 1));
    for (let y = 1; y <= gh; y++) {
      let run = 0;
      for (let x = 1; x <= gw; x++) { run += dil[(y - 1) * gw + (x - 1)]; S[y * (gw + 1) + x] = S[(y - 1) * (gw + 1) + x] + run; }
    }
    this.S = S;
  }
  candidates(wPx, hPx, [ax0, ay0, ax1, ay1], k = 40) {
    const { gw, gh, S } = this, W1 = gw + 1;
    const w = Math.ceil(wPx / CELL), h = Math.ceil(hPx / CELL);
    if (w >= gw || h >= gh) return [];
    const dist = (x, y) => {
      const X = x * CELL, Y = y * CELL;
      const dx = Math.max(ax0 - (X + wPx), 0, X - ax1), dy = Math.max(ay0 - (Y + hPx), 0, Y - ay1);
      return Math.hypot(dx, dy * 1.15);
    };
    let best = Infinity; const free = [];
    for (let y = 0; y + h <= gh; y++) {
      for (let x = 0; x + w <= gw; x++) {
        if (S[(y + h) * W1 + x + w] - S[y * W1 + x + w] - S[(y + h) * W1 + x] + S[y * W1 + x] !== 0) continue;
        const d = dist(x, y); if (d < best) best = d;
        free.push(d, x, y);
      }
    }
    if (!free.length) return [];
    const near = [];
    for (let i = 0; i < free.length; i += 3) if (free[i] <= best + 500) near.push([free[i], free[i + 1] * CELL, free[i + 2] * CELL]);
    near.sort((a, b) => a[0] - b[0]);
    const picked = [];
    for (const [d, x, y] of near) {
      if (picked.every(([, px, py]) => Math.abs(x - px) > 40 || Math.abs(y - py) > 30)) picked.push([d, x, y]);
      if (picked.length >= k) break;
    }
    return picked.map(([d, x, y]) => ({ x, y, d }));
  }
  crossings(s, e) {
    const L = Math.hypot(e[0] - s[0], e[1] - s[1]), n = Math.max(2, L / 3 | 0);
    let c = 0;
    for (let i = 0; i <= n; i++) {
      const x = s[0] + (e[0] - s[0]) * i / n, y = s[1] + (e[1] - s[1]) * i / n;
      const gx = x / CELL | 0, gy = y / CELL | 0;
      if (gx >= 0 && gy >= 0 && gx < this.gw && gy < this.gh && this.text[gy * this.gw + gx]) c++;
    }
    return c;
  }
}

function route(space, { x, y, w, h }, tgt) {
  const [b0, b1, b2, b3] = tgt.box, cy = (b1 + b3) / 2;
  const starts = [[x + w / 2, y - 2], [x + w / 2, y + h + 2], [x - 4, y + h / 2], [x + w + 4, y + h / 2]];
  const ends = [[(b0 + b2) / 2, b1 - 8], [(b0 + b2) / 2, b3 + 8], [b0 - 10, cy], [b2 + 10, cy],
                [tgt.lx0 - 14, cy], [tgt.lx1 + 14, cy]];
  let best = null;
  for (const s of starts) for (const [ei, e] of ends.entries()) {
    const L = Math.hypot(e[0] - s[0], e[1] - s[1]);
    const cross = space.crossings(s, e);
    const cost = cross * 50 + L + (ei >= 4 ? 220 : 0);   // pointing at the line end is a fallback
    if (!best || cost < best.cost) best = { cost, s, e, cross, L };
  }
  return best;
}

function layoutNote(ctx, text, space, tgt, sizes = NOTE_SIZES, widths = NOTE_WIDTHS) {
  let best = null;
  sizes.forEach((sz, si) => {
    for (const mw of widths) {
      const lines = wrap(ctx, text, sz, mw);
      ctx.font = font(sz);
      const bw = Math.ceil(Math.max(...lines.map(l => ctx.measureText(l).width))) + 4;
      const bh = Math.ceil(sz * LINE_H * lines.length) + 6;
      for (const c of space.candidates(bw, bh, tgt.box)) {
        let cross = 0, L = 0;
        if (c.d >= 70) { const r = route(space, { x: c.x, y: c.y, w: bw, h: bh }, tgt); cross = r.cross; L = r.L; }
        const score = c.d + si * 45 + (lines.length - 1) * 10 + cross * 12 + L * 0.2;
        if (!best || score < best.score) best = { score, x: c.x, y: c.y, w: bw, h: bh, sz, lines, d: c.d, cross };
      }
    }
  });
  return best;
}

// ---------- page composition ----------
/**
 * page: { image: HTMLCanvasElement, words: [{text,x,y,w,h,line}], crop: bool }
 * issues: this page's issues from the grader. meta: { index, count, header, summary }
 * returns { canvas, placed, dropped, missing }
 */
export async function markPage(page, issues, meta) {
  rand = makeRng(1000 + meta.index * 97);
  const src = page.image;
  // crop to the text block (drops empty page area, nav bars etc.), then add plain margins
  let cx0 = 0, cy0 = 0, cx1 = src.width, cy1 = src.height;
  if (page.words.length && page.crop) {
    cx0 = Math.max(0, Math.min(...page.words.map(w => w.x)) - 10);
    cy0 = firstInkRow(src, cx0, cx1, Math.min(...page.words.map(w => w.y)));
    cx1 = Math.min(src.width, Math.max(...page.words.map(w => w.x + w.w)) + 10);
    cy1 = Math.min(src.height, Math.max(...page.words.map(w => w.y + w.h)) + 10);
  }
  const side = page.crop ? MARGIN : 90;
  const W = Math.round(cx1 - cx0 + 2 * side);
  // page 1 opens with the teacher's header: name line, grade stamp, then the verdict and end
  // comment beside the stamp. The paper's text starts below it (the band grows to fit).
  let top = (page.crop ? MARGIN : 40) + (meta.index === 0 ? 150 : 40);
  let note = null;
  if (meta.index === 0 && (meta.header.verdict || meta.header.summary)) {
    const m = document.createElement("canvas").getContext("2d");
    const colW = W - side - 330;                         // keep clear of the stamp on the right
    const vLines = meta.header.verdict ? wrap(m, meta.header.verdict, 52, colW) : [];
    const sLines = meta.header.summary ? wrap(m, meta.header.summary, 38, colW) : [];
    const y = 128, h = vLines.length * 52 * 1.2 + sLines.length * 38 * LINE_H;
    note = { vLines, sLines, y };
    top = Math.max(top, Math.round(y + h + 70));
  }
  const bottom = page.crop ? MARGIN : 60;
  const H = Math.round(cy1 - cy0 + top + bottom);

  const base = document.createElement("canvas"); base.width = W; base.height = H;
  const bctx = base.getContext("2d", { willReadFrequently: true });
  bctx.fillStyle = "#fff"; bctx.fillRect(0, 0, W, H);
  bctx.drawImage(src, cx0, cy0, cx1 - cx0, cy1 - cy0, side, top, cx1 - cx0, cy1 - cy0);
  whiten(bctx, W, H);

  const words = page.words.map(w => ({ ...w, x: w.x - cx0 + side, y: w.y - cy0 + top, n: norm(w.text) }))
                          .filter(w => w.n);

  const ink = document.createElement("canvas"); ink.width = W; ink.height = H;
  const ctx = ink.getContext("2d", { willReadFrequently: true });

  if (meta.index === 0) {
    const h = meta.header;
    ctx.font = font(46); ctx.fillStyle = INK; ctx.textBaseline = "top";
    ctx.fillText(`Name: ${h.title}`, side, 54);
    ctx.font = font(40);
    const pts = `-${h.points} pts`;
    ctx.fillText(pts, W - 290 - ctx.measureText(pts).width, 70);
    stamp(ctx, W - 150, 125, h.grade);
    if (note) {
      drawLines(ctx, note.vLines, 52, side, note.y);
      drawLines(ctx, note.sLines, 38, side, note.y + note.vLines.length * 52 * 1.2);
    }
  } else {
    ctx.font = font(40); ctx.fillStyle = INK; ctx.textBaseline = "top";
    ctx.fillText(`p.${meta.index + 1}`, W - 150, 40);
  }

  // 1) draw the marks
  const pending = [], missing = [];
  for (const iss of issues) {
    const refs = [{ anchor: iss.anchor, occurrence: iss.occurrence }, ...(iss.also || [])];
    const spans = refs.map(r => resolve(words, r.anchor, r.occurrence)).filter(Boolean);
    if (!spans.length) { missing.push(iss); continue; }
    const tgts = [];
    for (const span of spans) {
      const boxes = lineBoxes(span), m = iss.mark;
      if (m === "circle") boxes.forEach(b => ellipse(ctx, b));
      else if (m === "strike") boxes.forEach(b => strike(ctx, b));
      else if (m === "underline") boxes.forEach(b => underline(ctx, b));
      else if (m === "squiggle") boxes.forEach(b => squiggle(ctx, b));
      else if (m === "bracket") bracket(ctx, boxes);
      else if (m === "check") { boxes.forEach(b => underline(ctx, b)); check(ctx, boxes[boxes.length - 1]); }
      else boxes.forEach(b => underline(ctx, b));
      if (iss.insert && iss.insert.trim()) caretInsert(ctx, boxes[0], iss.insert.trim(), m === "circle");
      const ln = m === "bracket" ? span[0] : span[span.length - 1];
      const same = words.filter(w => w.line === ln.line);
      const lx0 = Math.min(...same.map(w => w.x)), lx1 = Math.max(...same.map(w => w.x + w.w));
      if (m === "bracket") {
        const bx = Math.min(...boxes.map(b => b[0])) - 24;
        tgts.push({ box: [bx - 4, boxes[0][1], bx + 2, boxes[boxes.length - 1][3]], lx0: bx - 4, lx1 });
      } else tgts.push({ box: boxes[boxes.length - 1], lx0, lx1 });
    }
    pending.push({ iss, tgts });
  }

  const space = new Space(bctx, W, H, words);
  space.addInk(ctx, null);

  // 2) notes: most important first; drop rather than shrink below readable size
  pending.sort((a, b) => (a.iss.priority || 2) - (b.iss.priority || 2) || a.tgts[0].box[1] - b.tgts[0].box[1]);
  const placed = [], dropped = [];
  for (const p of pending) {
    await new Promise(r => setTimeout(r, 0));           // keep the UI responsive
    if (!String(p.iss.note || "").trim()) { placed.push(p.iss); continue; }   // a mark with nothing to say
    const fit = layoutNote(ctx, p.iss.note, space, p.tgts[0]);
    const tooFar = fit && fit.d > 380 && (p.iss.priority || 2) >= 2;
    if (!fit || tooFar) { dropped.push(p.iss); continue; }
    drawLines(ctx, fit.lines, fit.sz, fit.x, fit.y);
    space.fillPx(fit.x - 28, fit.y - 8, fit.x + fit.w + 28, fit.y + fit.h + 8);
    const rect = { x: fit.x, y: fit.y, w: fit.w, h: fit.h };
    let dirty = [fit.x - 10, fit.y - 10, fit.x + fit.w + 10, fit.y + fit.h + 10];
    p.tgts.slice(0, 4).forEach((t, i) => {
      if (i === 0 && fit.d < 70) return;
      const r = route(space, rect, t);
      if (i > 0 && (r.cross > 20 || r.L > 450)) return;   // extra targets only on clean short paths
      arrow(ctx, r.s, r.e);
      dirty = [Math.min(dirty[0], r.s[0], r.e[0]) - 30, Math.min(dirty[1], r.s[1], r.e[1]) - 30,
               Math.max(dirty[2], r.s[0], r.e[0]) + 30, Math.max(dirty[3], r.s[1], r.e[1]) + 30];
    });
    space.addInk(ctx, dirty);
    placed.push(p.iss);
  }

  const out = { base, ink, W, H };

  const canvas = document.createElement("canvas"); canvas.width = out.W; canvas.height = out.H;
  const c = canvas.getContext("2d");
  c.drawImage(out.base, 0, 0);
  c.filter = "blur(0.6px)"; c.drawImage(out.ink, 0, 0); c.filter = "none";
  // small gray credit at the foot of every page, so screenshots and downloads say where they came from
  c.font = '400 22px "Courier Prime", "Courier New", monospace'; c.fillStyle = "#9a9ea6";
  c.textAlign = "center"; c.textBaseline = "alphabetic";
  c.fillText(`Graded by Paper Grader \u00b7 ${location.host || "papergrader"}`, out.W / 2, out.H - 26);
  c.textAlign = "left";
  // for the share card's crop: the bottom of the page-1 header (grade and end comment)
  canvas.headerBottom = meta.index === 0 ? top - 20 : 0;
  return { canvas, placed, dropped, missing };
}

// Top edge of the content: the first row with real ink across the text column, so titles,
// logos and letterheads drawn as images above the first line of text are kept.
function firstInkRow(src, x0, x1, firstWordY) {
  const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(firstWordY));
  const ctx = src.getContext("2d", { willReadFrequently: true });
  const d = ctx.getImageData(Math.round(x0), 0, w, h).data;
  for (let y = 0; y < h; y++) {
    let dark = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i] + d[i + 1] + d[i + 2] < 600) { if (++dark > 3) return Math.max(0, y - 10); }
    }
  }
  return Math.max(0, firstWordY - 10);
}

function whiten(ctx, W, H) {                  // scanner-gray / off-white paper -> white
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 232 && d[i + 1] > 232 && d[i + 2] > 232) d[i] = d[i + 1] = d[i + 2] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------- helpers reused by the share card ----------
export function drawStamp(ctx, cx, cy, grade, scale = 1) {
  rand = makeRng(42);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
  stamp(ctx, 0, 0, grade);
  ctx.restore();
}
export function wrapText(ctx, text, sz, maxw) { return wrap(ctx, text, sz, maxw); }
export const handFont = font;
