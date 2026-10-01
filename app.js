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
$("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pasted = chosen ? "" : $("paste").value;
  if (!chosen && !pasted.trim()) return;
  if (!chosen && URL_ONLY.test(pasted)) {
    $("upload-error").textContent = "Links aren't supported yet. Open the page, copy its text, and paste that instead.";
    $("upload-error").hidden = false; return;
  }
  const name = chosen ? chosen.name : "Pasted text";
  const tone = new FormData(e.target).get("tone") || "fair";
  $("working-name").textContent = chosen ? chosen.name : "your writing";
  show("working");
  const status = (s) => { $("status").textContent = s; };
  try {
    await document.fonts.load('34px "Caveat"');
    const doc = chosen ? await readFile(chosen, status) : await readText(pasted, status);
    const texts = doc.pages.map(p => pageText(p.words));
    if (!texts.join("").trim()) throw new Error("No readable text was found. If this is a photo, try a sharper, straighter shot.");

    status("Grading your paper");
    const r = await fetch("/api/grade", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode, tone, name, pages: texts.map((text, i) => ({ page: i + 1, text })) }),
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
    for (let i = 0; i < doc.pages.length; i++) {
      status(doc.pages.length > 1 ? `Marking up page ${i + 1} of ${doc.pages.length}` : "Marking it up");
      const issues = (g.issues || []).filter(x => (x.page || 1) === i + 1);
      const out = await markPage(doc.pages[i], issues, { index: i, count: doc.pages.length, header });
      canvases.push(out.canvas); dropped += out.dropped.length; missing += out.missing.length;
    }
    await showResult(canvases, header, { dropped, missing, total: doc.totalPages, truncated: doc.truncated });
  } catch (err) {
    console.error(err);
    show("upload");
    $("upload-error").textContent = err.message || "Something went wrong. Try again.";
    $("upload-error").hidden = false;
  }
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
    box.appendChild(a);
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
  window.scrollTo({ top: 0 });
}

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
$("again").addEventListener("click", () => {
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
