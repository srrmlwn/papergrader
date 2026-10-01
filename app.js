import { readFile, readText, pageText, MAX_PAGES } from "./readers.js";
import { markPage } from "./ink.js";

const JSPDF = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
const $ = (id) => document.getElementById(id);
const views = ["gate", "upload", "working", "result"];
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
  await runGrade({ file: chosen, text: pasted, name, label: chosen ? chosen.name : "your writing" });
});

async function runGrade({ file, text, name, label }) {
  $("working-name").textContent = label;
  show("working");
  const status = (s) => { $("status").textContent = s; };
  try {
    await document.fonts.load('34px "Caveat"');
    const doc = file ? await readFile(file, status) : await readText(text, status);
    const texts = doc.pages.map(p => pageText(p.words));
    if (!texts.join("").trim()) throw new Error("No readable text was found. If this is a photo, try a sharper, straighter shot.");

    status("Grading your paper");
    const r = await fetch("/api/grade", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode, name, pages: texts.map((t, i) => ({ page: i + 1, text: t })) }),
    });
    const g = await r.json().catch(() => ({}));
    if (r.status === 401) { store.del("pg-pass"); passcode = ""; show("gate"); return; }
    if (!r.ok) throw new Error(g.error || "Grading failed. Try again.");

    status("Marking it up");
    const header = {
      title: g.title || name.replace(/\.[^.]+$/, ""),
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
    current = { header, comments };
    await showResult(canvases, header, { dropped, missing, total: doc.totalPages, truncated: doc.truncated });
  } catch (err) {
    console.error(err);
    show("upload");
    $("upload-error").textContent = err.message || "Something went wrong. Try again.";
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
    img.addEventListener("load", syncRhythm);
    box.appendChild(btn);
  });
  $("result-title").textContent = `${header.title}: ${header.grade}`;
  const notes = [];
  if (info.truncated) notes.push(`Your writing ran past ${MAX_PAGES} pages; only the first ${MAX_PAGES} were graded.`);
  else if (info.total > MAX_PAGES) notes.push(`Only the first ${MAX_PAGES} of ${info.total} pages were graded.`);
  if (info.dropped) notes.push(`${info.dropped} minor ${info.dropped === 1 ? "note was" : "notes were"} left off because the page ran out of room.`);
  if (info.missing) notes.push(`${info.missing} ${info.missing === 1 ? "comment" : "comments"} couldn't be matched to the text and ${info.missing === 1 ? "was" : "were"} skipped.`);
  $("result-notes").textContent = notes.join(" ");
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
$("share").addEventListener("click", async () => {
  try {
    await navigator.share({ files: [new File([result.blobs[0]], `${result.slug}-graded.png`, { type: "image/png" })], title: "Graded paper" });
  } catch { /* user cancelled */ }
});
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
