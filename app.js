import { readFile, readText, pageText, editableText, MAX_PAGES } from "./readers.js";
import { markPage } from "./ink.js";

const JSPDF = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
const $ = (id) => document.getElementById(id);
const views = ["gate", "upload", "working", "result", "rewrite"];
const show = (v) => views.forEach(id => { $(id).hidden = id !== v; });

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

let passcode = store.get("pg-pass") || "";
let chosen = null;
let result = null;        // { canvases, blobs, title }

// ---------- passcode gate ----------
async function checkPass(code) {
  const r = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: code }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Couldn't check the passcode.");
  return j;
}
$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("passcode").value.trim();
  $("gate-error").hidden = true;
  try {
    await checkPass(code);
    passcode = code; store.set("pg-pass", code); show("upload");
  } catch (err) { $("gate-error").textContent = err.message; $("gate-error").hidden = false; }
});

// ---------- input choice: a file or pasted text (whichever was used last) ----------
const URL_ONLY = /^\s*https?:\/\/\S+\s*$/i;
function refreshSubmit() {
  const text = $("paste").value.trim();
  $("submit").disabled = !(chosen || text);
}
function clearFile() {
  chosen = null; $("file").value = "";
  $("tray").classList.remove("has-file");
  $("tray-title").textContent = "Turn in your paper";
  $("tray-hint").textContent = "Tap to choose a PDF, Word file or image, or drop it here. Up to 8 pages.";
}
$("paste").addEventListener("input", () => {
  const v = $("paste").value;
  if (v.trim() && chosen) clearFile();
  $("paste").classList.remove("dimmed");
  const words = (v.match(/\S+/g) || []).length;
  $("paste-meta").hidden = !words;
  $("paste-meta").textContent = URL_ONLY.test(v)
    ? "Links aren't supported yet. Paste the text of the page instead."
    : `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
  $("upload-error").hidden = true;
  refreshSubmit();
});
function pick(file) {
  if (!file) return;
  chosen = file;
  if ($("paste").value.trim()) $("paste").classList.add("dimmed");
  $("tray").classList.add("has-file");
  $("tray-title").textContent = file.name;
  $("tray-hint").textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB. Tap to choose a different file.`;
  $("submit").disabled = false;
  $("upload-error").hidden = true;
}
$("file").addEventListener("change", (e) => pick(e.target.files[0]));
const tray = $("tray");
["dragenter", "dragover"].forEach(t => tray.addEventListener(t, (e) => { e.preventDefault(); tray.classList.add("drag"); }));
["dragleave", "drop"].forEach(t => tray.addEventListener(t, (e) => { e.preventDefault(); tray.classList.remove("drag"); }));
tray.addEventListener("drop", (e) => pick(e.dataTransfer.files[0]));

// ---------- grading ----------
let current = null;     // the paper on screen: { name, tone, text, header, comments, round }

$("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pasted = chosen ? "" : $("paste").value;
  if (!chosen && !pasted.trim()) return;
  if (!chosen && URL_ONLY.test(pasted)) {
    $("upload-error").textContent = "Links aren't supported yet. Open the page, copy its text, and paste that instead.";
    $("upload-error").hidden = false; return;
  }
  const name = chosen ? chosen.name : "Pasted text";
  const form = new FormData(e.target);
  const tone = form.get("tone") || "fair", kind = form.get("kind") || "other";
  await runGrade({ file: chosen, text: pasted, name, tone, kind, label: chosen ? chosen.name : "your writing", onFail: "upload" });
});

async function runGrade({ file, text, name, tone, kind = "other", label, previous = null, onFail }) {
  $("working-name").textContent = label;
  show("working");
  const status = (s) => { $("status").textContent = s; };
  try {
    await document.fonts.load('34px "Caveat"');
    const doc = file ? await readFile(file, status) : await readText(text, status);
    const texts = doc.pages.map(p => pageText(p.words));
    if (!texts.join("").trim()) throw new Error("No readable text was found. If this is a photo, try a sharper, straighter shot.");

    status(previous ? "Grading your rewrite" : "Grading your paper");
    const r = await fetch("/api/grade", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode, tone, kind, name, pages: texts.map((t, i) => ({ page: i + 1, text: t })) }),
    });
    const g = await r.json().catch(() => ({}));
    if (r.status === 401) { store.del("pg-pass"); passcode = ""; show("gate"); return; }
    if (!r.ok) throw new Error(g.error || "Grading failed. Try again.");

    status("Marking it up");
    const round = previous ? previous.round + 1 : 1;
    const baseTitle = previous ? previous.header.baseTitle : (g.title || name.replace(/\.[^.]+$/, ""));
    const header = {
      baseTitle,
      title: round > 1 ? `${baseTitle} (rewrite${round > 2 ? " " + (round - 1) : ""})` : baseTitle,
      grade: g.grade || "?", points: Math.max(0, g.points | 0),
      verdict: g.verdict || "", summary: g.summary || "",
    };
    const canvases = []; let dropped = 0, missing = 0;
    const order = new Map((g.issues || []).map((x, k) => [x, k]));
    const comments = [];
    for (let i = 0; i < doc.pages.length; i++) {
      status(doc.pages.length > 1 ? `Marking up page ${i + 1} of ${doc.pages.length}` : "Marking it up");
      const issues = (g.issues || []).filter(x => (x.page || 1) === i + 1);
      const out = await markPage(doc.pages[i], issues, { index: i, count: doc.pages.length, header });
      canvases.push(out.canvas); dropped += out.dropped.length; missing += out.missing.length;
      for (const [list, st] of [[out.placed, "placed"], [out.dropped, "dropped"], [out.missing, "missing"]])
        for (const x of list) comments.push({ ...x, page: i + 1, status: st, k: order.get(x) ?? 999 });
    }
    comments.sort((a, b) => a.page - b.page || a.k - b.k);
    const editable = editableText(doc);
    const compare = previous ? compareRounds(previous, editable) : null;
    current = { name, tone, kind, text: editable, header, comments, round };
    await showResult(canvases, header, { dropped, missing, total: doc.totalPages, truncated: doc.truncated, comments, pages: doc.pages.length, compare });
  } catch (err) {
    console.error(err);
    show(onFail);
    const box = onFail === "rewrite" ? $("rewrite-error") : $("upload-error");
    box.textContent = err.message || "Something went wrong. Try again.";
    box.hidden = false;
  }
}

// How many of the previous round's problems no longer appear in the rewrite, judged by
// their marked text. Short marks must vanish exactly (case counts: "friday" -> "Friday");
// long ones (whole sentences) count as gone when most of their wording has changed.
function compareRounds(prev, newText) {
  const toks = (t) => String(t).replace(/[\u2018\u2019]/g, "'").split(/[^A-Za-z0-9']+/).filter(Boolean);
  const hayToks = toks(newText);
  const hay = " " + hayToks.join(" ") + " ";
  const grams = new Set(hayToks.slice(2).map((t, i) => `${hayToks[i]} ${hayToks[i + 1]} ${t}`));
  const stillThere = (anchor) => {
    const a = toks(anchor);
    if (!a.length) return true;
    if (a.length <= 8) return hay.includes(" " + a.join(" ") + " ");
    const g = a.slice(2).map((t, i) => `${a[i]} ${a[i + 1]} ${t}`);
    return g.filter(x => grams.has(x)).length / g.length >= 0.5;
  };
  const problems = prev.comments.filter(c => c.kind !== "praise");
  const gone = problems.filter(c => !stillThere(c.anchor));
  return { from: prev.header.grade, gone: gone.length, total: problems.length };
}

// ---------- rewrite ----------
function openRewrite() {
  if (!current) return;
  $("rewrite-text").value = current.text;
  $("rewrite-error").hidden = true;
  $("rewrite-comments").appendChild($("comments-section"));      // keep the comments in view while editing
  $("comments-section").hidden = !current.comments.length;
  show("rewrite");
  window.scrollTo({ top: 0 });
  $("rewrite-text").focus({ preventScroll: true });
}
function closeRewrite() {
  $("result").appendChild($("comments-section"));
  show("result");
  syncRhythm();
}
$("rewrite").addEventListener("click", (e) => { if (e.target.id === "rewrite-cancel") closeRewrite(); });
$("rewrite-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("rewrite-text").value;
  if (!text.trim()) { $("rewrite-error").textContent = "The rewrite is empty."; $("rewrite-error").hidden = false; return; }
  if (text.trim() === current.text.trim()) { $("rewrite-error").textContent = "Nothing has changed yet. Edit the text, then regrade."; $("rewrite-error").hidden = false; return; }
  $("result").appendChild($("comments-section"));
  const prev = current;
  await runGrade({ text, name: prev.name, tone: prev.tone, kind: prev.kind, label: "your rewrite", previous: prev, onFail: "rewrite" });
  if ($("rewrite").hidden === false) $("rewrite-comments").appendChild($("comments-section"));
});

async function showResult(canvases, header, info) {
  const blobs = await Promise.all(canvases.map(c => new Promise(r => c.toBlob(r, "image/png"))));
  const box = $("pages"); box.innerHTML = "";
  blobs.forEach((b, i) => {
    const img = new Image();
    img.src = URL.createObjectURL(b);
    img.alt = `Page ${i + 1} of the graded paper`;
    img.width = canvases[i].width; img.height = canvases[i].height;
    const a = document.createElement("a");          // tap to open full size (zoomable on phones)
    a.href = img.src; a.target = "_blank"; a.rel = "noopener";
    a.title = "Open full size"; a.appendChild(img);
    img.addEventListener("load", syncRhythm);
    box.appendChild(a);
  });
  $("result-title").textContent = `${header.title}: ${header.grade}`;
  const cmp = info.compare;
  $("result-compare").hidden = !cmp;
  if (cmp) {
    $("compare-from").textContent = cmp.from;
    $("compare-to").textContent = header.grade;
    $("compare-detail").textContent = cmp.total
      ? `${cmp.gone} of ${cmp.total} marked ${cmp.total === 1 ? "problem" : "problems"} no longer ${cmp.total === 1 ? "appears" : "appear"} in your rewrite.`
      : "";
  }
  const notes = [];
  if (info.truncated) notes.push(`Your writing ran past ${MAX_PAGES} pages; only the first ${MAX_PAGES} were graded.`);
  else if (info.total > MAX_PAGES) notes.push(`Only the first ${MAX_PAGES} of ${info.total} pages were graded.`);
  if (info.dropped) notes.push(`${info.dropped} minor ${info.dropped === 1 ? "note was" : "notes were"} left off because the page ran out of room.`);
  if (info.missing) notes.push(`${info.missing} ${info.missing === 1 ? "comment" : "comments"} couldn't be matched to the text and ${info.missing === 1 ? "was" : "were"} skipped.`);
  $("result-notes").textContent = notes.join(" ");
  renderComments(header, info.comments || [], info.pages || canvases.length);
  const slug = header.title.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "paper";
  result = { canvases, blobs, slug };
  const file0 = new File([blobs[0]], `${slug}-graded.png`, { type: "image/png" });
  $("share").hidden = !(navigator.canShare && navigator.canShare({ files: [file0] }));
  show("result");
  syncRhythm();
  window.scrollTo({ top: 0 });
}

// keep text after the page images on the ruled lines: the images have arbitrary heights,
// so pad below them until the next element starts on the same rhythm as the header text.
const LINE = 32;
function syncRhythm() {
  const pages = $("pages"), ref = $("result-title");
  if (!pages || $("result").hidden) return;
  pages.style.paddingBottom = "0px";
  const off = (pages.getBoundingClientRect().bottom - ref.getBoundingClientRect().top) % LINE;
  pages.style.paddingBottom = `${(LINE - off) % LINE}px`;
}
window.addEventListener("resize", syncRhythm);

// ---------- comments as text ----------
const STATUS_TEXT = {
  dropped: "Not written on the page (no room)",
  missing: "Couldn't find this exact text on the page",
};
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function snippet(s, n = 70) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function renderComments(header, comments, pageCount) {
  const box = $("comments"); box.innerHTML = "";
  $("comments-link").hidden = !comments.length;
  $("comments-section").hidden = !comments.length;
  if (!comments.length) return;
  $("comments-link").textContent = `Read all ${comments.length} comments as text`;
  $("comments-summary").textContent = [header.verdict, header.summary].filter(Boolean).join(" ");
  let list = null, lastPage = 0;
  for (const c of comments) {
    if (pageCount > 1 && c.page !== lastPage) {
      box.appendChild(el("h3", "c-page", `Page ${c.page}`));
      list = null; lastPage = c.page;
    }
    if (!list) { list = el("ol", "c-list"); box.appendChild(list); }
    const li = el("li", "c-item" + (c.kind === "praise" ? " c-praise" : ""));
    const quote = el("p", "c-quote");
    quote.appendChild(el("q", null, snippet(c.anchor)));
    if (c.insert && c.insert.trim()) {
      quote.appendChild(document.createTextNode(" "));
      quote.appendChild(el("span", "c-arrow", "→"));
      quote.appendChild(document.createTextNode(" "));
      quote.appendChild(el("span", "c-fix", c.insert.trim()));
    }
    li.appendChild(quote);
    li.appendChild(el("p", "c-note", c.note));
    if (STATUS_TEXT[c.status]) li.appendChild(el("p", "c-status", STATUS_TEXT[c.status]));
    list.appendChild(li);
  }
  result_comments = { header, comments, pageCount };
}
let result_comments = null;

function commentsAsText() {
  const { header, comments, pageCount } = result_comments;
  const out = [`${header.title}: ${header.grade} (-${header.points} pts)`];
  if (header.verdict) out.push(header.verdict);
  if (header.summary) out.push(header.summary);
  let last = 0;
  for (const c of comments) {
    if (pageCount > 1 && c.page !== last) { out.push("", `Page ${c.page}`); last = c.page; }
    else if (last === 0) { out.push(""); last = c.page; }
    const fix = c.insert && c.insert.trim() ? ` -> ${c.insert.trim()}` : "";
    out.push(`- "${snippet(c.anchor, 120)}"${fix}: ${c.note}`);
  }
  return out.join("\n");
}
$("copy-comments").addEventListener("click", async () => {
  const btn = $("copy-comments");
  try {
    await navigator.clipboard.writeText(commentsAsText());
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Couldn't copy";
  }
  setTimeout(() => { btn.textContent = "Copy all comments"; }, 1800);
});

// ---------- downloads ----------
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
let jspdfP = null;
function loadJsPdf() {
  if (!jspdfP) jspdfP = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = JSPDF;
    s.onload = () => res(window.jspdf.jsPDF); s.onerror = () => rej(new Error("Couldn't load the PDF maker."));
    document.head.appendChild(s);
  });
  return jspdfP;
}
$("dl-pdf").addEventListener("click", async () => {
  const btn = $("dl-pdf"); btn.disabled = true; btn.textContent = "Making PDF";
  try {
    const JsPDF = await loadJsPdf();
    let pdf = null;
    result.canvases.forEach((c, i) => {
      const w = c.width * 0.36, h = c.height * 0.36;       // px -> pt at 200 dpi
      if (!pdf) pdf = new JsPDF({ unit: "pt", format: [w, h], orientation: w > h ? "l" : "p", compress: true });
      else pdf.addPage([w, h], w > h ? "l" : "p");
      pdf.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, w, h);
    });
    download(pdf.output("blob"), `${result.slug}-graded.pdf`);
  } catch (err) { alert(err.message); }
  btn.disabled = false; btn.textContent = "Download PDF";
});
$("dl-png").addEventListener("click", async () => {
  if (result.canvases.length === 1) return download(result.blobs[0], `${result.slug}-graded.png`);
  // several pages: stack them into one tall image
  const gap = 40, W = Math.max(...result.canvases.map(c => c.width));
  const H = result.canvases.reduce((s, c) => s + c.height, 0) + gap * (result.canvases.length - 1);
  const big = document.createElement("canvas"); big.width = W; big.height = H;
  const g = big.getContext("2d"); g.fillStyle = "#e3e8ef"; g.fillRect(0, 0, W, H);
  let y = 0; for (const c of result.canvases) { g.drawImage(c, (W - c.width) / 2, y); y += c.height + gap; }
  big.toBlob(b => download(b, `${result.slug}-graded.png`), "image/png");
});
$("share").addEventListener("click", async () => {
  try {
    await navigator.share({ files: [new File([result.blobs[0]], `${result.slug}-graded.png`, { type: "image/png" })], title: "Graded paper" });
  } catch { /* user cancelled */ }
});
$("rewrite-open").addEventListener("click", openRewrite);
$("again").addEventListener("click", () => {
  current = null;
  clearFile();
  $("paste").value = ""; $("paste").classList.remove("dimmed"); $("paste-meta").hidden = true;
  $("submit").disabled = true;
  show("upload"); window.scrollTo({ top: 0 });
});

// ---------- start ----------
(async () => {
  if (passcode) {
    try { await checkPass(passcode); show("upload"); return; } catch { store.del("pg-pass"); passcode = ""; }
  }
  show("gate");
})();
