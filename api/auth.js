import { passcodeOk, readJson, send } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: "Bad request." }); }
  if (!passcodeOk(body.passcode)) return send(res, 401, { error: "That passcode isn't right." });
  return send(res, 200, { ok: true, ready: Boolean(process.env.ANTHROPIC_API_KEY) });
}
