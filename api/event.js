import { passcodeOk, readJson, send } from "./_lib.js";

// One log line per share or download, for counting: the action and how many images, nothing else.
const ACTIONS = new Set(["share", "share-cancel", "share-fail", "download"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: "Bad request." }); }
  if (!passcodeOk(body.passcode)) return send(res, 401, { error: "That passcode isn't right." });
  if (!ACTIONS.has(body.action)) return send(res, 400, { error: "Unknown action." });
  const files = Math.max(0, Math.min(20, Number(body.files) || 0));
  console.log("share-event " + JSON.stringify({ action: body.action, files }));
  return send(res, 200, { ok: true });
}
