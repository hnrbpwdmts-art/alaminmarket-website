/* Cloudflare Pages Function: POST /api/call-order
   Asked by the order sheet (backend/Code.gs, checkCalls) to ring the store
   about a new online order. Twilio places the call and reads the order out;
   pressing 1 goes to /api/call-confirm, which stops the reminders.

   Settings (Pages project > Settings > Variables and Secrets, as Secrets):
     TWILIO_ACCOUNT_SID   from the Twilio console (starts with AC)
     TWILIO_AUTH_TOKEN    from the Twilio console
     TWILIO_FROM          your Twilio phone number, like +13105550123
     CALL_SECRET          any long random text; the same text goes in Code.gs
   Optional:
     CALL_STORE_PHONE     number to ring first (default +13105381188, the store landline)
     CALL_BACKUP_PHONE    number to ring after the landline tries (default +14245273540)
*/
/* ---- helpers (same in call-order.js and call-confirm.js) ---- */
const DEFAULT_ORDER_LOG_URL =
  "https://script.google.com/macros/s/AKfycby6T80ltjKTV6QB8qJdACKgMUqqd8JmxJ3Dn1SM1lIZ0UjAnUIwPqDmZDysoaJ-v14r/exec";
const ORDER_RE = /^[A-Z]{0,3}\d{4}-\d{3}$/;
const VOICE = "Polly.Joanna";

const enc = new TextEncoder();

// Short signature so only our own calls can confirm an order
async function sign(secret, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return [...new Uint8Array(mac)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function xml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function twiml(inner) {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response>' + inner + "</Response>", {
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" }
  });
}

// "A1113-600" -> "6 0 0" (read out digit by digit)
function spokenEnding(order) {
  return String(order).slice(-3).split("").join(" ");
}
/* ---- end helpers ---- */

const str = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN, from = env.TWILIO_FROM, secret = env.CALL_SECRET;
  if (!sid || !token || !from || !secret) return json({ ok: false, error: "not_set" }, 503);

  let d;
  try { d = JSON.parse(await request.text()); } catch (e) { return json({ ok: false, error: "bad_request" }, 400); }
  if (!sameText(d.secret || "", secret)) return json({ ok: false, error: "forbidden" }, 403);
  const order = str(d.order, 20);
  if (!ORDER_RE.test(order)) return json({ ok: false, error: "bad_order" }, 400);

  const to = d.to === "cell" ? (env.CALL_BACKUP_PHONE || "+14245273540") : (env.CALL_STORE_PHONE || "+13105381188");
  const name = str(d.name, 40) || "a customer";
  const mode = d.mode === "delivery" ? "delivery" : "pickup";
  const day = str(d.day, 40);
  const time = str(d.time, 40).replace(/\s*[–-]\s*/g, " to ");
  const attempt = Math.max(1, Math.min(20, Number(d.attempt) || 1));

  const kind = d.channel === "WhatsApp" ? "WhatsApp order" : d.channel === "Text" ? "text message order" : "online order";
  const intro = (d.update ? "Updated " : "New ") + kind + (attempt > 1 ? ", reminder" : "") + ".";
  const details = `From ${name}, for ${mode}${day ? " " + day : ""}${time ? ", " + time : ""}. Order number ending in ${spokenEnding(order)}.`;
  const ask = "Press 1 to confirm you got it.";

  const sig = await sign(secret, order);
  const action = `${new URL(request.url).origin}/api/call-confirm?order=${encodeURIComponent(order)}&sig=${sig}`;
  const say = (t) => `<Say voice="${VOICE}">${xml(t)}</Say>`;
  const body =
    `<Response><Pause length="1"/><Gather numDigits="1" timeout="8" action="${xml(action)}" method="POST">` +
    say(intro + " " + details + " " + ask) + `<Pause length="1"/>` + say(details + " " + ask) +
    `</Gather>` + say("We did not get an answer. We will call again in a few minutes. Goodbye.") + `</Response>`;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${token}`),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ To: to, From: from, Twiml: body, Timeout: "25" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ ok: false, error: "twilio", code: data.code || res.status, message: str(data.message, 200) }, 502);
    return json({ ok: true, callSid: data.sid, to: to === (env.CALL_BACKUP_PHONE || "+14245273540") ? "cell" : "landline" });
  } catch (e) {
    return json({ ok: false, error: "unreachable" }, 502);
  }
}
