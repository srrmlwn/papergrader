// readers.js: turn an uploaded file into page images + positioned words.
// PDFs use their own text layer (exact positions); images and scanned PDFs use OCR.

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

export const MAX_PAGES = 8;
const PDF_SCALE = 200 / 72;         // ~200 dpi, matches the ink engine's sizes
const IMAGE_WIDTH = 1500;           // images are scaled to about this width before OCR

let pdfjsP = null;
function loadPdfjs() {
  if (!pdfjsP) pdfjsP = import(/* @vite-ignore */ PDFJS).then(m => {
    m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return m;
  });
  return pdfjsP;
}
let tessP = null;
function loadTesseract() {
  if (!tessP) tessP = new Promise((res, rej) => {
    if (window.Tesseract) return res(window.Tesseract);
    const s = document.createElement("script"); s.src = TESSERACT; s.async = true;
    s.onload = () => res(window.Tesseract); s.onerror = () => rej(new Error("Couldn't load the text reader."));
    document.head.appendChild(s);
  });
  return tessP;
}

export async function readFile(file, onStatus) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) return readPdf(file, onStatus);
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|gif)$/i.test(file.name)) return readImage(file, onStatus);
  throw new Error("That file type isn't supported. Upload a PDF or an image (PNG, JPG, WebP).");
}

async function readPdf(file, onStatus) {
  onStatus("Opening the PDF");
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const n = Math.min(doc.numPages, MAX_PAGES);
  const pages = [];
  for (let i = 1; i <= n; i++) {
    onStatus(`Reading page ${i} of ${n}`);
    const pg = await doc.getPage(i);
    const vp = pg.getViewport({ scale: PDF_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    const tc = await pg.getTextContent();
    let words = pdfWords(tc.items, vp, pdfjs, i);
    if (words.length < 5) {                      // scanned page: no text layer
      onStatus(`Page ${i} is a scan, reading it with OCR`);
      words = await ocrWords(canvas, i, onStatus);
    }
    pages.push({ image: canvas, words, crop: true });
  }
  return { pages, totalPages: doc.numPages };
}

function pdfWords(items, vp, pdfjs, pageNo) {
  const meas = document.createElement("canvas").getContext("2d");
  const words = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const tx = pdfjs.Util.transform(vp.transform, it.transform);
    const fh = Math.hypot(tx[2], tx[3]);
    const x = tx[4], base = tx[5];
    const width = it.width * vp.scale;
    meas.font = `${fh}px sans-serif`;
    const full = meas.measureText(it.str).width || 1;
    const k = width / full;
    const re = /\S+/g; let m;
    while ((m = re.exec(it.str))) {
      const pre = meas.measureText(it.str.slice(0, m.index)).width * k;
      const ww = meas.measureText(m[0]).width * k;
      words.push({ text: m[0], x: x + pre, y: base - fh * 0.82, w: ww, h: fh * 1.0,
                   line: `${pageNo}:${Math.round(base / 4)}` });
    }
  }
  return words;
}

async function readImage(file, onStatus) {
  onStatus("Loading the image");
  const bmp = await loadBitmap(file);
  const scale = IMAGE_WIDTH / bmp.width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const words = await ocrWords(canvas, 1, onStatus);
  return { pages: [{ image: canvas, words, crop: false }], totalPages: 1 };
}

async function loadBitmap(file) {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file); } catch { /* fall through */ }
  }
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res(img);
    img.onerror = () => rej(new Error("That image couldn't be opened. Try a PNG or JPG."));
    img.src = URL.createObjectURL(file);
  });
}

async function ocrWords(canvas, pageNo, onStatus) {
  onStatus("Loading the text reader");
  const T = await loadTesseract();
  const { data } = await T.recognize(canvas, "eng", {
    logger: m => { if (m.status === "recognizing text") onStatus(`Reading the text (${Math.round(m.progress * 100)}%)`); },
  });
  const words = [];
  (data.lines || []).forEach((ln, li) => {
    for (const w of ln.words || []) {
      if (!w.text || !w.text.trim() || w.confidence < 20) continue;
      const b = w.bbox;
      words.push({ text: w.text, x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, line: `${pageNo}:ocr${li}` });
    }
  });
  return words;
}

// Plain text of a page, line by line, for the grader.
export function pageText(words) {
  const lines = new Map();
  for (const w of words) { if (!lines.has(w.line)) lines.set(w.line, []); lines.get(w.line).push(w); }
  return [...lines.values()]
    .map(ws => ws.sort((a, b) => a.x - b.x))
    .sort((a, b) => a[0].y - b[0].y)
    .map(ws => ws.map(w => w.text).join(" "))
    .join("\n");
}
