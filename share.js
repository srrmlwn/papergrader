// share.js: a post-ready image of a graded paper (1080 x 1350, 4:5 portrait).
// The grade, the strip of the paper with the most red ink, the sharpest comment as a
// pull quote, and the site address, so every shared image says what made it.
import { INK, drawStamp, wrapText, handFont } from "./ink.js";

const W = 1080, H = 1350;
const DESK = "#e9edf2", TYPE = "#25272d", FAINT = "#6b6f78";
const TYPED = '"Courier Prime", "Courier New", monospace';

export async function makeShareCard({ canvases, header, comments }) {
  await Promise.all([document.fonts.load(handFont(60)), document.fonts.load(`700 30px ${TYPED}`)]).catch(() => {});
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = DESK; g.fillRect(0, 0, W, H);

  // header: wordmark and the grade
  g.fillStyle = INK; g.font = handFont(64); g.textBaseline = "alphabetic";
  g.fillText("Paper Grader", 64, 118);
  g.fillStyle = TYPE; g.font = `400 30px ${TYPED}`;
  g.fillText("Your paper is back.", 66, 172);
  drawStamp(g, W - 160, 116, header.grade, 0.9);

  // the reddest strip of the paper
  const quote = pickQuote(comments);
  // wrap the comment in quote marks unless it already contains some
  const qtext = quote ? (/["\u201C\u201D]/.test(quote.note) ? quote.note : `\u201C${quote.note}\u201D`) : "";
  const quoteLines = quote ? wrapText(g, qtext, 50, W - 160).slice(0, 3) : [];
  const verdictH = header.verdict ? 70 : 0;
  const bottomH = 70 + verdictH + quoteLines.length * 58 + 40;
  const top = 236, cardW = W - 128, cardH = H - top - bottomH - 40;
  const { canvas: src, y: sy, h: sh } = reddestStrip(canvases, cardW, cardH);
  g.save();
  g.shadowColor = "rgba(30, 40, 60, .22)"; g.shadowBlur = 28; g.shadowOffsetY = 8;
  g.fillStyle = "#fff"; g.fillRect(64, top, cardW, cardH);
  g.restore();
  g.drawImage(src, 0, sy, src.width, sh, 64, top, cardW, cardH);
  // fade the bottom edge so the crop reads as part of a longer page
  const fade = g.createLinearGradient(0, top + cardH - 90, 0, top + cardH);
  fade.addColorStop(0, "rgba(255,255,255,0)"); fade.addColorStop(1, "rgba(255,255,255,1)");
  g.fillStyle = fade; g.fillRect(64, top + cardH - 90, cardW, 90);

  // verdict and pull quote, in the teacher's hand
  let y = top + cardH + 78;
  if (header.verdict) {
    g.fillStyle = INK; g.font = handFont(60);
    g.fillText(header.verdict, 70, y); y += verdictH;
  }
  g.fillStyle = INK; g.font = handFont(50);
  quoteLines.forEach((ln, i) => g.fillText(ln, 70, y + i * 58));

  // site address
  g.fillStyle = FAINT; g.font = `400 28px ${TYPED}`;
  g.fillText(location.host || "papergrader", 66, H - 52);

  return new Promise((res) => c.toBlob(res, "image/png"));
}

// The comment most worth quoting: a real criticism (not praise), important, and short
// enough to read at a glance.
function pickQuote(comments) {
  const cands = (comments || []).filter(x => x.note && x.kind !== "praise");
  if (!cands.length) return (comments || []).find(x => x.note) || null;
  const score = (x) => (x.priority || 2) * 10
    + (["logic", "clarity", "style"].includes(x.kind) ? 0 : 4)
    + (x.note.length < 25 ? 6 : x.note.length > 90 ? 8 : 0)
    + (x.page || 1) * 0.1;
  return cands.slice().sort((a, b) => score(a) - score(b))[0];
}

// Find the band of the graded pages with the most red ink, at the card's aspect ratio.
function reddestStrip(canvases, cardW, cardH) {
  let best = { canvas: canvases[0], y: 0, h: Math.round(canvases[0].width * cardH / cardW), score: -1 };
  for (const cv of canvases.slice(0, 4)) {
    const bandH = Math.min(cv.height, Math.round(cv.width * cardH / cardW));
    const start = cv.headerBottom || 0;   // skip page 1's header: the grade and end comment are on the card already
    const limit = cv.height;
    const scale = 0.25, w = Math.round(cv.width * scale), h = Math.round(cv.height * scale);
    const t = document.createElement("canvas"); t.width = w; t.height = h;
    const tg = t.getContext("2d", { willReadFrequently: true }); tg.drawImage(cv, 0, 0, w, h);
    const d = tg.getImageData(0, 0, w, h).data;
    const rows = new Float32Array(h);
    for (let yy = 0; yy < h; yy++) {
      let n = 0;
      for (let xx = 0; xx < w; xx++) {
        const i = (yy * w + xx) * 4;
        if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 110) n++;
      }
      rows[yy] = n;
    }
    const bh = Math.max(1, Math.round(bandH * scale));
    const minY = Math.round(start * scale), maxY = Math.round(limit * scale);
    let run = 0;
    for (let yy = minY; yy < Math.min(minY + bh, h); yy++) run += rows[yy];
    for (let yy = minY; yy + bh <= Math.min(h, maxY); yy++) {
      if (yy > minY) run += rows[yy + bh - 1] - rows[yy - 1];
      if (run > best.score) best = { canvas: cv, y: Math.round(yy / scale), h: bandH, score: run };
    }
  }
  best.y = Math.max(0, Math.min(best.y, best.canvas.height - best.h));
  return best;
}
