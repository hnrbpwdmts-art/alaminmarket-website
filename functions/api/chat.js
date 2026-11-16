/* Cloudflare Pages Function: POST /api/chat
   The website chat box sends customer questions here (and checks for staff
   replies). Questions are saved in the "Chats" tab of the order Google Sheet,
   where the staff page reads them (see backend/Code.gs).

   Body: { action: "send" | "poll", chatId, text?, name?, phone?, page?, after? }

   Optional setting (Pages project > Settings > Variables and Secrets):
     ORDER_LOG_URL   the Google Apps Script web app link (defaults to the one below)
*/

const DEFAULT_ORDER_LOG_URL =
  "https://script.google.com/macros/s/AKfycby6T80ltjKTV6QB8qJdACKgMUqqd8JmxJ3Dn1SM1lIZ0UjAnUIwPqDmZDysoaJ-v14r/exec";

const CHAT_ID_RE = /^[a-z0-9]{20,40}$/;
const LIMITS = { send: [15, 10 * 60 * 1000], poll: [40, 60 * 1000] }; // per visitor (best effort)
const recent = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function tooMany(key, max, windowMs) {
  const now = Date.now();
  const list = (recent.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { recent.set(key, list); return true; }
  list.push(now);
  recent.set(key, list);
  if (recent.size > 5000) recent.clear();
  return false;
}

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (raw.length > 5000) return json({ ok: false, error: "too_large" }, 413);
  let d;
  try { d = JSON.parse(raw); } catch (e) { return json({ ok: false, error: "bad_request" }, 400); }

  const action = d.action === "send" ? "send" : d.action === "poll" ? "poll" : "";
  const chatId = str(d.chatId, 40);
  if (!action || !CHAT_ID_RE.test(chatId)) return json({ ok: false, error: "bad_request" }, 400);
  if (d.website) return json({ ok: true, count: 0, messages: [] });   // hidden field bots fill in

  const text = str(d.text, 1000);
  if (action === "send" && !text) return json({ ok: false, error: "empty" }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const [max, windowMs] = LIMITS[action];
  if (tooMany(action + ":" + ip, max, windowMs)) return json({ ok: false, error: "too_many" }, 429);

  const payload = { chat: 1, action, chatId, after: Math.max(0, Math.floor(Number(d.after) || 0)) };
  if (action === "send") {
    payload.text = text;
    payload.name = str(d.name, 60);
    payload.phone = str(d.phone, 30);
    payload.page = str(d.page, 100);
  }

  try {
    const res = await fetch(env.ORDER_LOG_URL || DEFAULT_ORDER_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });
    let out;
    try { out = JSON.parse(await res.text()); } catch (e) { out = null; }
    if (!res.ok || !out || !out.ok) return json({ ok: false, error: "not_saved" }, 502);
    return json({
      ok: true,
      count: Number(out.count) || 0,
      messages: (Array.isArray(out.messages) ? out.messages : []).slice(0, 100).map((m) => ({
        at: str(m.at, 40), from: m.from === "Store" ? "Store" : "Customer", text: str(m.text, 1000)
      }))
    });
  } catch (e) {
    return json({ ok: false, error: "unreachable" }, 502);
  }
}
