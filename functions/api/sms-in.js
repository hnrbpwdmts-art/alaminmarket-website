/* Cloudflare Pages Function: POST /api/sms-in
   Twilio calls this when a customer texts our number (set it as the
   Messaging Service's incoming-message webhook:
   https://alaminmarket.com/api/sms-in).

   - STOP / START replies are already answered and enforced by Twilio; we pass
     them to the order sheet so the Customers tab shows Texts opt-in No / Yes.
   - Any other text is saved as a chat on the staff page (Chats tab), so staff
     can read it and reply; the reply goes back as a text.

   Settings: TWILIO_AUTH_TOKEN (checks the request really came from Twilio),
   CALL_SECRET (shared with Code.gs), optional ORDER_LOG_URL.
*/

const DEFAULT_ORDER_LOG_URL =
  "https://script.google.com/macros/s/AKfycby6T80ltjKTV6QB8qJdACKgMUqqd8JmxJ3Dn1SM1lIZ0UjAnUIwPqDmZDysoaJ-v14r/exec";

const enc = new TextEncoder();

function twiml() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" }
  });
}

// Twilio signs each request: base64(HMAC-SHA1(auth token, URL + sorted name/value pairs))
async function validTwilio(token, url, params, given) {
  if (!given) return false;
  const data = url + [...params.keys()].sort().map((k) => k + params.get(k)).join("");
  const key = await crypto.subtle.importKey("raw", enc.encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  const token = env.TWILIO_AUTH_TOKEN, secret = env.CALL_SECRET;
  if (!token || !secret) return twiml();

  const raw = await request.text();
  if (raw.length > 20000) return twiml();
  const params = new URLSearchParams(raw);
  if (!(await validTwilio(token, request.url, params, request.headers.get("X-Twilio-Signature") || ""))) {
    return new Response("Forbidden", { status: 403 });
  }

  const from = String(params.get("From") || "");
  const body = String(params.get("Body") || "").trim().slice(0, 1000);
  if (!/^\+1[2-9]\d{9}$/.test(from) || !body) return twiml();

  try {
    await fetch(env.ORDER_LOG_URL || DEFAULT_ORDER_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ smsIn: 1, secret, from, body }),
      redirect: "follow"
    });
  } catch (e) { /* Twilio still handled STOP/HELP; nothing else to do */ }
  return twiml();   // empty reply: Twilio sends its own STOP/HELP/START answers
}
