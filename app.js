import { readFile, readText, pageText, MAX_PAGES } from "./readers.js";
import { preparePage, markPage } from "./ink.js";

const JSPDF = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
const $ = (id) => document.getElementById(id);
const views = ["gate", "upload", "working", "result"];
// Show one view and move focus to its heading, so keyboard and screen reader users know where they are.
function show(v, { focus = true } = {}) {
  views.forEach(id => { $(id).hidden = id !== v; });
  $("pages").hidden = v !== "working" && v !== "result";
  if (focus) $(v).querySelector("[tabindex='-1']")?.focus({ preventScroll: true });
}
// One quiet live region for screen readers: step changes and confirmations, nothing chattier.
function announce(msg) {
  const a = $("announce"); a.textContent = "";
  setTimeout(() => { a.textContent = msg; }, 60);
}
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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

// ---------- the working screen: three steps, with the current one spelled out ----------
const STEPS = ["read", "grade", "mark"];
const LABEL = { read: "Reading your paper", grade: "Grading it", mark: "Marking it up" };
let stepNow = null;
function step(name, text = LABEL[name]) {
  const at = STEPS.indexOf(name);
  $("steps").querySelectorAll("li").forEach((li, i) => {
    li.className = i < at ? "done" : i === at ? "now" : "";
    li.querySelector(".step-text").textContent = i === at ? text : LABEL[STEPS[i]];
  });
  if (name !== stepNow) { stepNow = name; announce(LABEL[name]); }
}
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// the plain pages, shown while the paper is graded (the marks are inked onto page 1 after)
function showPaper(canvases) {
  const box = $("pages"); box.replaceChildren(...canvases.map(c => {
    const slot = document.createElement("div"); slot.className = "page-slot"; slot.append(c); return slot;
  }));
  box.setAttribute("aria-hidden", "true");
  syncRhythm();
}

async function runGrade({ file, text, name, label }) {
  $("working-name").textContent = label;
  stepNow = null; step("read");
  $("pages").replaceChildren();
  show("working");
  let timer = 0;
  try {
    await document.fonts.load('34px "Caveat"');
    const doc = file ? await readFile(file, (s) => step("read", s)) : await readText(text, (s) => step("read", s));
    const texts = doc.pages.map(p => pageText(p.words));
    if (!texts.join("").trim()) throw new Error("No readable text was found. If this is a photo, try a sharper, straighter shot.");
    const preps = doc.pages.map((p, i) => preparePage(p, i));
    showPaper(preps.map(p => p.base));

    const t0 = Date.now();
    step("grade", `Grading it  ${clock(0)}`);
    timer = setInterval(() => step("grade", `Grading it  ${clock(Date.now() - t0)}`), 1000);
    const r = await fetch("/api/grade", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode, name, pages: texts.map((t, i) => ({ page: i + 1, text: t })) }),
    });
    const g = await r.json().catch(() => ({}));
    clearInterval(timer);
    if (r.status === 401) { store.del("pg-pass"); passcode = ""; show("gate"); return; }
    if (!r.ok) throw new Error(g.error || "Grading failed. Try again.");

    step("mark");
    const header = {
      title: g.title || name.replace(/\.[^.]+$/, ""),
      grade: g.grade || "?", points: Math.max(0, g.points | 0),
      verdict: g.verdict || "", summary: g.summary || "",
    };
    const canvases = []; let dropped = 0, missing = 0, pen = null;
    const order = new Map((g.issues || []).map((x, k) => [x, k]));
    const comments = [];
    for (let i = 0; i < doc.pages.length; i++) {
      if (doc.pages.length > 1) step("mark", `Marking up page ${i + 1} of ${doc.pages.length}`);
      const issues = (g.issues || []).filter(x => (x.page || 1) === i + 1);
      const out = await markPage(preps[i], issues, { index: i, count: doc.pages.length, header });
      preps[i] = null;
      canvases.push(out.canvas); dropped += out.dropped.length; missing += out.missing.length;
      if (i === 0) pen = { base: out.base, ink: out.ink, strokes: out.strokes };   // only page 1 is inked in live
      for (const [list, st] of [[out.placed, "placed"], [out.dropped, "dropped"], [out.missing, "missing"]])
        for (const x of list) comments.push({ ...x, page: i + 1, status: st, k: order.get(x) ?? 999 });
    }
    comments.sort((a, b) => a.page - b.page || a.k - b.k);
    current = { header, comments };
    await showResult(canvases, header, { dropped, missing, total: doc.totalPages, truncated: doc.truncated }, pen);
  } catch (err) {
    console.error(err);
    show("upload");
    $("upload-error").textContent = err.message || "Something went wrong. Try again.";
    $("upload-error").hidden = false;
  } finally {
    clearInterval(timer);
  }
}

async function showResult(canvases, header, info, pen) {
  const blobs = await Promise.all(canvases.map(c => new Promise(r => c.toBlob(r, "image/png"))));
  const count = (p) => current.comments.filter(c => c.page === p && c.status === "placed").length;
  const box = $("pages"); box.replaceChildren(); box.removeAttribute("aria-hidden");
  const live = pen && !reduceMotion.matches;
  blobs.forEach((b, i) => {
    const img = new Image();
    img.src = URL.createObjectURL(b);
    const n = count(i + 1);
    img.alt = `Page ${i + 1} of the graded paper${i === 0 ? `, graded ${header.grade}` : ""}, with ${n} ${n === 1 ? "comment" : "comments"} written on it. Every comment is also under "Read the comments as text".`;
    img.width = canvases[i].width; img.height = canvases[i].height;
    const btn = document.createElement("button");      // tap to view the pages full size, on this tab
    btn.type = "button"; btn.className = "page-btn";
    btn.setAttribute("aria-label", `View page ${i + 1} full size`);
    btn.addEventListener("click", () => { if (inking) inking.finish(); else openViewer(i, btn); });
    btn.appendChild(i === 0 && live ? penCanvas(pen, img) : img);
    img.addEventListener("load", syncRhythm);
    box.appendChild(btn);
  });
  $("result-grade").textContent = header.grade;
  $("result-verdict").textContent = header.verdict;
  $("result-title").textContent = header.points ? `${header.title} · -${header.points} pts` : header.title;
  renderComments();
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
  $("result").classList.toggle("inking", !!live);       // the grade is written in after the page
  show("result");
  window.scrollTo({ top: 0 });
  syncRhythm();
  if (live) penIn(box.querySelector("canvas"), pen, () => $("result").classList.remove("inking"));
}

// ---------- the pen: ink page 1 in the order the teacher made the marks ----------
let inking = null;      // { finish } while the pen is moving
function penCanvas({ base }, img) {
  const c = document.createElement("canvas");
  c.width = base.width; c.height = base.height;
  c.setAttribute("role", "img"); c.setAttribute("aria-label", img.alt);
  c.getContext("2d").drawImage(base, 0, 0);
  c.img = img;              // swapped in when the pen is done, so the page can be saved like any image
  return c;
}
function penIn(live, { base, ink, strokes }, done) {
  const ctx = live.getContext("2d"), W = live.width, H = live.height;
  // timeline: each stroke takes time for its length, with a beat between marks; long pages speed up
  const SPEED = 2.2, BEAT = 140, LIFT = 35, MAX = 6500;     // SPEED in canvas px per ms
  const plan = []; let t = 350;
  for (const group of strokes) {
    for (const s of group) {
      const len = s.ax === "x" ? s.r[2] - s.r[0] : s.r[3] - s.r[1];
      const d = Math.min(650, Math.max(70, len / SPEED));
      plan.push({ s, t, d, at: 0 }); t += d + LIFT;
    }
    t += BEAT;
  }
  const k = t > MAX ? MAX / t : 1;
  plan.forEach(p => { p.t *= k; p.d *= k; });

  // reveal the stroke's rectangle from `at` to `to` along the pen's direction (base, then ink,
  // so a slice drawn twice never darkens)
  const reveal = (p, to) => {
    const x0 = Math.max(0, Math.floor(p.s.r[0])), y0 = Math.max(0, Math.floor(p.s.r[1]));
    const x1 = Math.min(W, Math.ceil(p.s.r[2])), y1 = Math.min(H, Math.ceil(p.s.r[3]));
    const horiz = p.s.ax === "x", len = horiz ? x1 - x0 : y1 - y0;
    const a = Math.round(len * p.at), b = Math.round(len * to);
    p.at = to;
    if (b <= a || len <= 0) return;
    const from = p.s.dir > 0 ? a : len - b, size = b - a;
    const [sx, sy, sw, sh] = horiz ? [x0 + from, y0, size, y1 - y0] : [x0, y0 + from, x1 - x0, size];
    if (sw <= 0 || sh <= 0) return;
    ctx.drawImage(base, sx, sy, sw, sh, sx, sy, sw, sh);
    ctx.drawImage(ink, sx, sy, sw, sh, sx, sy, sw, sh);
  };
  let start = null, raf = 0;
  const frame = (now) => {
    start ??= now;
    const el = now - start;
    let more = false;
    for (const p of plan) {
      if (p.at >= 1) continue;
      if (el < p.t) { more = true; break; }
      const f = Math.min(1, (el - p.t) / p.d);
      reveal(p, f);
      if (f < 1) more = true;
    }
    if (more) raf = requestAnimationFrame(frame); else finish();
  };
  const finish = () => {
    cancelAnimationFrame(raf);
    inking = null;
    if (live.isConnected) live.replaceWith(live.img);
    done();
    syncRhythm();
  };
  inking = { finish };
  raf = requestAnimationFrame(frame);
}

// ---------- the comments as text, for screen readers and anyone revising elsewhere ----------
function renderComments() {
  const { header, comments } = current;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const body = $("comments-body"); body.replaceChildren();
  if (header.summary) body.append(el("p", "end-note", header.summary));
  const multi = comments.some(c => c.page > 1);
  let list = null, last = 0;
  for (const c of comments) {
    if (c.page !== last) {
      if (multi) body.append(el("h3", null, `Page ${c.page}`));
      list = body.appendChild(el("ul")); last = c.page;
    }
    const li = el("li");
    li.append(el("q", null, String(c.anchor).replace(/\s+/g, " ").trim()));
    if (c.insert && c.insert.trim()) {
      const to = el("span", "fix");
      to.append(el("span", "sr-only", " change to "), el("span", null, " → "));
      to.lastChild.setAttribute("aria-hidden", "true");
      to.append(el("ins", null, c.insert.trim()));
      li.append(to);
    }
    if (String(c.note || "").trim()) li.append(" ", el("span", "note", c.note));
    if (c.status !== "placed") li.append(" ", el("span", "off-page", "(not on the page)"));
    list.append(li);
  }
  if (!comments.length) body.append(el("p", null, "No comments. Nothing needed marking."));
  $("result").querySelector(".comments-text").open = false;
}

// keep text after the page images on the ruled lines: the images have arbitrary heights,
// so pad below them until the next element starts on the same rhythm as the header text.
const LINE = 32;
function syncRhythm() {
  const pages = $("pages"), ref = document.querySelector(".sheet");
  if (pages.hidden) return;
  pages.style.paddingBottom = "0px";
  const off = (pages.getBoundingClientRect().bottom - ref.getBoundingClientRect().top) % LINE;
  pages.style.paddingBottom = `${(LINE - off) % LINE}px`;
}
window.addEventListener("resize", syncRhythm);
document.querySelector(".comments-text").addEventListener("toggle", syncRhythm);

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
    const note = String(c.note || "").trim();
    out.push(`- "${String(c.anchor).replace(/\s+/g, " ").trim()}"${fix}${note ? `: ${note}` : ""}`);
  }
  return out.join("\n");
}
$("copy-comments").addEventListener("click", async () => {
  const btn = $("copy-comments");
  try {
    await navigator.clipboard.writeText(commentsAsText());
    btn.textContent = "Copied";
    announce("Comments copied");
  } catch {
    btn.textContent = "Couldn't copy";
    announce("Couldn't copy the comments");
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
    const src = $("pages").querySelectorAll("img")[i];
    img.src = src.src; img.alt = src.alt;
    img.width = result.canvases[i].width; img.height = result.canvases[i].height;
    list.appendChild(img);
  });
  viewerReturnFocus = from || null;
  document.querySelector("main").inert = true;           // keep Tab inside the viewer
  v.hidden = false;
  document.documentElement.classList.add("viewer-open");
  v.scrollTop = 0;
  requestAnimationFrame(() => { list.children[index]?.scrollIntoView({ block: "start" }); });
  $("viewer-close").focus({ preventScroll: true });
}
function closeViewer() {
  if ($("viewer").hidden) return;
  $("viewer").hidden = true;
  document.querySelector("main").inert = false;
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
    s.onload = () => res(window.jspdf.jsPDF); s.onerror = () => { jspdfP = null; s.remove(); rej(new Error("Couldn't load the PDF maker.")); };
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
    btn.textContent = "Download";
  } catch (err) {
    btn.textContent = "Couldn't make the PDF";
    announce(`${err.message} Try Download again.`);
    setTimeout(() => { btn.textContent = "Download"; }, 2400);
  }
  btn.disabled = false;
});
$("share").addEventListener("click", async () => {
  try {
    await navigator.share({ files: [new File([result.blobs[0]], `${result.slug}-graded.png`, { type: "image/png" })], title: "Graded paper" });
  } catch { /* user cancelled */ }
});
$("again").addEventListener("click", () => {
  inking?.finish();
  current = null;
  clearFile();
  $("paste").value = ""; $("paste").classList.remove("dimmed"); $("paste-meta").hidden = true;
  $("submit").disabled = true;
  show("upload"); window.scrollTo({ top: 0 });
});

// ---------- start ----------
(async () => {
  if (passcode) {
    try { await checkPass(passcode); show("upload", { focus: false }); return; } catch { store.del("pg-pass"); passcode = ""; }
  }
  show("gate", { focus: false });
})();
