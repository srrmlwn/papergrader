// Shared helpers for the API routes.
import crypto from "node:crypto";

export function passcodeOk(given) {
  const expected = process.env.APP_PASSCODE || "";
  if (!expected || typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(given.trim()).digest();
  const b = crypto.createHash("sha256").update(expected.trim()).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
