import { readFile, readText, pageText, MAX_PAGES } from "./readers.js";
import { markPage } from "./ink.js";
import { track } from "./analytics.js";

const JSPDF = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
const $ = (id) => document.getElementById(id);
const views = ["gate", "upload", "working", "result"];
const show = (v) => {
  views.forEach(id => { $(id).hidden = id !== v; });
  $("about").hidden = !(v === "gate" || v === "upload");   // the explainer only sits under the first screens
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

let passcode = store.get("pg-pass") || "";
let chosen = null;
let result = null;        // { canvases, blobs, title }
let pasteCounted = false;  // one document_added per paste, not per keystroke
let gradedThisVisit = 0;   // papers graded since the page loaded

// what kind of input this is, for analytics (never the content)
function inputType(file) {
  if (!file) return "paste";
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return "pdf";
  if (/\.docx$/i.test(file.name)) return "docx";
  if (/\.(txt|md)$/i.test(file.name) || file.type === "text/plain") return "text";
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|gif)$/i.test(file.name)) return "image";
  return "other";
}

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

// ---------- one box: paste text, or choose / drop a file (a file replaces the text box) ----------
const URL_ONLY = /^\s*https?:\/\/\S+\s*$/i;
const HINT = "PDF, Word or photo. Up to 8 pages.";
function refreshSubmit() {
  $("submit").disabled = !(chosen || $("paste").value.trim());
}
function clearFile() {
  chosen = null; $("file").value = "";
  $("composer").classList.remove("has-file");
  $("file-btn").textContent = "Choose a file";
  $("file-chip").hidden = true;
  $("paste").hidden = false;
  refreshSubmit();
}
$("paste").addEventListener("input", () => {
  const v = $("paste").value;
  const words = (v.match(/\S+/g) || []).length;
  $("composer-hint").textContent = !words ? HINT
    : URL_ONLY.test(v) ? "Links aren't supported yet. Paste the text of the page instead."
    : `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
  $("upload-error").hidden = true;
  if (words && !pasteCounted) { pasteCounted = true; track("document_added", { input_type: "paste" }); }
  if (!words) pasteCounted = false;
  refreshSubmit();
});
function describe(file) {
  const kb = file.size / 1024;
  const size = kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
  const kind = /\.pdf$/i.test(file.name) || file.type === "application/pdf" ? "PDF"
    : /\.docx$/i.test(file.name) ? "Word file"
    : /\.(txt|md)$/i.test(file.name) ? "Text file"
    : file.type.startsWith("image/") ? "Photo" : "File";
  return `${kind}, ${size}`;
}
function pick(file) {
  if (!file) return;
  chosen = file;
  $("file-name").textContent = file.name;
  $("file-meta").textContent = describe(file);
  $("composer").classList.add("has-file");
  $("file-btn").textContent = "Replace";
  $("file-chip").hidden = false;
  $("paste").hidden = true;            // pasted text stays in the box underneath, in case the file is removed
  $("composer-hint").textContent = HINT;
  $("upload-error").hidden = true;
  track("document_added", { input_type: inputType(file), size_kb: Math.round(file.size / 1024) });
  refreshSubmit();
}
$("file").addEventListener("change", (e) => pick(e.target.files[0]));
$("file-remove").addEventListener("click", () => {
  clearFile();
  $("paste").dispatchEvent(new Event("input"));
  $("paste").focus();
});
const composer = $("composer");
["dragenter", "dragover"].forEach(t => composer.addEventListener(t, (e) => { e.preventDefault(); composer.classList.add("drag"); }));
["dragleave", "drop"].forEach(t => composer.addEventListener(t, (e) => { e.preventDefault(); composer.classList.remove("drag"); }));
composer.addEventListener("drop", (e) => { if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); });

// While the grader works (20 to 60 s), show what a teacher would be doing. Not a fake progress bar:
// the lines just keep the wait from feeling stuck, and stop as soon as the grade comes back.
const WAIT_LINES = [
  "Reading it through once",
  "Reading it again, more suspiciously",
  "Checking the argument holds up",
  "Looking for claims that need backup",
  "Circling things in red",
  "Deciding whether that semicolon was necessary",
  "Deciding what this deserves",
];
function rotateLines(status) {
  let k = 0;
  const id = setInterval(() => { k = Math.min(k + 1, WAIT_LINES.length - 1); status(WAIT_LINES[k]); }, 4500);
  status(WAIT_LINES[0]);
  return () => clearInterval(id);
}

// ---------- grading ----------
let current = null;     // the paper on screen: { header, comments }

$("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pasted = chosen ? "" : $("paste").value;
  if (!chosen && !pasted.trim()) return;
  if (!chosen && URL_ONLY.test(pasted)) {
    $("upload-error").textContent = "Links aren't supported yet. Open the page, copy its text, and paste that instead.";
    $("upload-error").hidden = false; return;
  }
  const name = chosen ? chosen.name : "Pasted text";
  await runGrade({ file: chosen, text: pasted, name, label: chosen ? `Grading ${chosen.name}` : "Grading your pasted text" });
});

async function runGrade({ file, text, name, label }) {
  const t0 = Date.now(), input_type = inputType(file);
  let stage = "reading", pageCount = 0;
  $("working-name").textContent = label;   // what's being graded; the status line below says what's happening
  show("working");
  const status = (s) => { $("status").textContent = s; };
  let stopLines = () => {};
  try {
    await document.fonts.load('34px "Caveat"');
    const doc = file ? await readFile(file, status) : await readText(text, status);
    const texts = doc.pages.map(p => pageText(p.words));
    pageCount = doc.pages.length;
    if (!texts.join("").trim()) throw new Error("No readable text was found. If this is a photo, try a sharper, straighter shot.");

    stage = "grading";
    track("grading_started", { input_type, page_count: pageCount, total_pages: doc.totalPages });
    stopLines = rotateLines(status);
    const r = await fetch("/api/grade", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode, name, inputType: input_type, pages: texts.map((t, i) => ({ page: i + 1, text: t })) }),
    });
    const g = await r.json().catch(() => ({}));
    stopLines();
    if (r.status === 401) { store.del("pg-pass"); passcode = ""; show("gate"); return; }
    if (!r.ok) {
      stage = `server_${r.status}`;
      const e = new Error(g.error || "Grading failed.");
      e.retry = r.status === 502 || r.status === 504;   // worth trying again; limits (429, 503) aren't
      throw e;
    }
    stage = "drawing";

    status("Writing in the margins");
    const header = {
      title: g.title || name.replace(/\.[^.]+$/, ""),
      grade: g.grade || "?", points: Math.max(0, g.points | 0),
      verdict: g.verdict || "", summary: g.summary || "",
    };
    const canvases = []; let dropped = 0, missing = 0;
    const order = new Map((g.issues || []).map((x, k) => [x, k]));
    const comments = [];
    for (let i = 0; i < doc.pages.length; i++) {
      status(doc.pages.length > 1 ? `Writing in the margins (page ${i + 1} of ${doc.pages.length})` : "Writing in the margins");
      const issues = (g.issues || []).filter(x => (x.page || 1) === i + 1);
      const out = await markPage(doc.pages[i], issues, { index: i, count: doc.pages.length, header });
      canvases.push(out.canvas); dropped += out.dropped.length; missing += out.missing.length;
      for (const [list, st] of [[out.placed, "placed"], [out.dropped, "dropped"], [out.missing, "missing"]])
        for (const x of list) comments.push({ ...x, page: i + 1, status: st, k: order.get(x) ?? 999 });
    }
    comments.sort((a, b) => a.page - b.page || a.k - b.k);
    current = { header, comments };
    await showResult(canvases, header, { dropped, missing, total: doc.totalPages, truncated: doc.truncated });
    gradedThisVisit++;
    track("grading_completed", {
      input_type, page_count: pageCount, processing_ms: Date.now() - t0, grade: header.grade,
      doc_type: g.docType || "unknown", estimated_cost_usd: g.costUsd ?? null,
      comments_placed: comments.filter(c => c.status === "placed").length, comments_dropped: dropped,
      papers_this_visit: gradedThisVisit,
    });
  } catch (err) {
    stopLines();
    track("grading_failed", { input_type, page_count: pageCount, stage, processing_ms: Date.now() - t0 });
    console.error(err);
    show("upload");
    const retry = err.retry || (stage === "grading" && err instanceof TypeError);   // TypeError = network dropped
    const msg = stage === "grading" && err instanceof TypeError ? "Lost the connection while grading." : (err.message || "Something went wrong.");
    const hint = !retry ? "" : /try again/i.test(msg) ? " Your paper is still here." : " Your paper is still here: press Turn it in to try again.";
    $("upload-error").textContent = msg + hint;
    $("upload-error").hidden = false;
  }
}

async function showResult(canvases, header, info) {
  const blobs = await Promise.all(canvases.map(c => new Promise(r => c.toBlob(r, "image/png"))));
  const box = $("pages"); box.innerHTML = "";
  blobs.forEach((b, i) => {
    const img = new Image();
    img.src = URL.createObjectURL(b);
    img.alt = `Page ${i + 1} of the graded paper`;
    img.width = canvases[i].width; img.height = canvases[i].height;
    const btn = document.createElement("button");      // tap to view the pages full size, on this tab
    btn.type = "button"; btn.className = "page-btn";
    btn.setAttribute("aria-label", `View page ${i + 1} full size`);
    btn.addEventListener("click", () => openViewer(i, btn));
    btn.appendChild(img);
    box.appendChild(btn);
  });
  const notes = [];
  if (info.total > MAX_PAGES || info.truncated) notes.push(info.truncated ? `First ${MAX_PAGES} pages graded` : `First ${MAX_PAGES} of ${info.total} pages graded`);
  if (info.dropped) notes.push(`${info.dropped} minor ${info.dropped === 1 ? "note" : "notes"} left off for space`);
  if (info.missing) notes.push(`${info.missing} ${info.missing === 1 ? "comment" : "comments"} couldn't be placed`);
  $("result-notes").textContent = notes.length ? notes.join(". ") + "." : "";
  const slug = header.title.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "paper";
  result = { canvases, blobs, slug };
  show("result");
  window.scrollTo({ top: 0 });
}


// ---------- copy comments as plain text ----------
function commentsAsText() {
  const { header, comments } = current;
  const multi = comments.some(c => c.page > 1);
  const out = [`${header.title}: ${header.grade} (-${header.points} pts)`];
  if (header.verdict) out.push(header.verdict);
  if (header.summary) out.push(header.summary);
  let last = 0;
  for (const c of comments) {
    if (c.page !== last) { out.push("", multi ? `Page ${c.page}` : "Comments"); last = c.page; }
    const fix = c.insert && c.insert.trim() ? ` -> ${c.insert.trim()}` : "";
    out.push(`- "${String(c.anchor).replace(/\s+/g, " ").trim()}"${fix}: ${c.note}`);
  }
  return out.join("\n");
}
$("copy-comments").addEventListener("click", async () => {
  const btn = $("copy-comments");
  try {
    await navigator.clipboard.writeText(commentsAsText());
    btn.textContent = "Copied";
    track("copy_clicked", { comments: current.comments.length });
  } catch {
    btn.textContent = "Couldn't copy";
  }
  setTimeout(() => { btn.textContent = "Copy comments"; }, 1800);
});

// ---------- full-size viewer: all pages stacked, scroll through, tap outside to close ----------
let viewerReturnFocus = null;
function openViewer(index, from) {
  const v = $("viewer"), list = $("viewer-pages");
  list.innerHTML = "";
  result.blobs.forEach((b, i) => {
    const img = new Image();
    img.src = $("pages").querySelectorAll("img")[i].src;
    img.alt = `Page ${i + 1} of the graded paper`;
    img.width = result.canvases[i].width; img.height = result.canvases[i].height;
    list.appendChild(img);
  });
  viewerReturnFocus = from || null;
  v.hidden = false;
  document.documentElement.classList.add("viewer-open");
  v.scrollTop = 0;
  requestAnimationFrame(() => { list.children[index]?.scrollIntoView({ block: "start" }); });
  $("viewer-close").focus({ preventScroll: true });
}
function closeViewer() {
  if ($("viewer").hidden) return;
  $("viewer").hidden = true;
  document.documentElement.classList.remove("viewer-open");
  viewerReturnFocus?.focus({ preventScroll: true });
}
// Click outside a page closes it. On phones the pages fill the screen, so any tap closes it
// (scrolling and pinch-zooming don't produce taps).
const narrow = window.matchMedia("(max-width: 600px)");
$("viewer").addEventListener("click", (e) => { if (narrow.matches || e.target.tagName !== "IMG") closeViewer(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeViewer(); });

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
// One Download button: a single page saves as an image (easy to share), several pages as a PDF.
$("download").addEventListener("click", async () => {
  track("download_clicked", { pages: result.canvases.length, format: result.canvases.length === 1 ? "png" : "pdf" });
  if (result.canvases.length === 1) return download(result.blobs[0], `${result.slug}-graded.png`);
  const btn = $("download"); btn.disabled = true; btn.textContent = "Making PDF";
  try {
    const JsPDF = await loadJsPdf();
    let pdf = null;
    result.canvases.forEach((c) => {
      const w = c.width * 0.36, h = c.height * 0.36;       // px -> pt at 200 dpi
      if (!pdf) pdf = new JsPDF({ unit: "pt", format: [w, h], orientation: w > h ? "l" : "p", compress: true });
      else pdf.addPage([w, h], w > h ? "l" : "p");
      pdf.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, w, h);
    });
    download(pdf.output("blob"), `${result.slug}-graded.pdf`);
  } catch (err) { alert(err.message); }
  btn.disabled = false; btn.textContent = "Download";
});
// Share: every graded page as an image, page 1 (grade and comment) first. A post becomes a
// carousel and a chat gets the whole paper. Hidden where the browser can't share images.
const CAN_SHARE_FILES = (() => {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] })); }
  catch { return false; }
})();
$("share").hidden = !CAN_SHARE_FILES;
$("share").addEventListener("click", async () => {
  const files = result.blobs.map((b, i) => new File([b], `${result.slug}-graded-p${i + 1}.png`, { type: "image/png" }));
  try {
    await navigator.share({ files, title: "My paper, graded" });
    track("share_clicked", { pages: files.length, outcome: "shared" });
  } catch (err) {
    track("share_clicked", { pages: files.length, outcome: err && err.name === "AbortError" ? "cancelled" : "failed" });
    if (err && err.name !== "AbortError") console.error(err);   // AbortError = the person closed the share sheet
  }
});
$("again").addEventListener("click", () => {
  track("grade_another_clicked", { papers_this_visit: gradedThisVisit });
  current = null; pasteCounted = false;
  clearFile();
  $("paste").value = ""; $("composer-hint").textContent = HINT;
  $("submit").disabled = true;
  show("upload"); window.scrollTo({ top: 0 });
});

// ---------- start ----------
(async () => {
  // with a saved passcode, or none at all when the app is open (no APP_PASSCODE on the server)
  try { await checkPass(passcode); show("upload"); return; }
  catch { if (passcode) { store.del("pg-pass"); passcode = ""; } }
  show("gate");
})();
