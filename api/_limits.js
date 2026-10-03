// Abuse and cost guards, backed by Upstash Redis (connected through Vercel Storage).
// Two counters, nothing else is stored:
//   rl:<hashed IP>:<hour>   grades per visitor per hour (expires after an hour)
//   spend:<Pacific date>    estimated Claude spend today in US$ (expires after two days)
// If Redis isn't configured or doesn't answer, grading still works (fail open) and a
// warning is logged: a Redis outage shouldn't take the app down.
import crypto from "node:crypto";

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
export const PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR || 10);
export const DAILY_USD = Number(process.env.DAILY_SPEND_LIMIT_USD || 5);

let warned = false;
async function redis(commands) {
  if (!URL_ || !TOKEN) {
    if (!warned) { warned = true; console.warn("limits: Redis not configured (UPSTASH_REDIS_REST_URL / KV_REST_API_URL), not enforcing"); }
    return null;
  }
  try {
    const r = await fetch(`${URL_.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) throw new Error(`redis ${r.status}`);
    return (await r.json()).map(x => x.result);
  } catch (e) {
    console.warn("limits: redis unavailable, not enforcing", String(e.message || e));
    return null;
  }
}

function visitorKey(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown").split(",")[0].trim();
  // hashed so no raw IP address is ever stored
  return crypto.createHash("sha256").update(`${ip}|${process.env.ANTHROPIC_API_KEY || ""}`).digest("hex").slice(0, 24);
}
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });   // YYYY-MM-DD

// Before calling Claude. Returns null if OK, or { status, error } to send back.
export async function checkLimits(req) {
  const hour = Math.floor(Date.now() / 3600000);
  const rl = `rl:${visitorKey(req)}:${hour}`;
  const out = await redis([["INCR", rl], ["EXPIRE", rl, 3600], ["GET", `spend:${today()}`]]);
  if (!out) return null;
  const [count, , spent] = out;
  if (Number(spent || 0) >= DAILY_USD) {
    console.warn("daily-spend-ceiling", JSON.stringify({ spent: Number(spent), limit: DAILY_USD }));
    return { status: 503, error: "Grade this. is resting for the day: it hit its daily grading budget. Please try again tomorrow." };
  }
  if (count > PER_HOUR) {
    return { status: 429, error: `That's ${PER_HOUR} papers this hour, the most one person can turn in. Try again in a little while.` };
  }
  return null;
}

// After a successful grade: add its estimated cost to today's total.
export async function recordSpend(usd) {
  if (!(usd > 0)) return;
  const k = `spend:${today()}`;
  await redis([["INCRBYFLOAT", k, String(usd)], ["EXPIRE", k, 172800]]);
}
