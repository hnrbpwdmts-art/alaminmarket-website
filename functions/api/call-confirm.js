/* Cloudflare Pages Function: POST /api/call-confirm
   Twilio sends the key pressed during an order call here. Pressing 1 tells
   the order sheet (backend/Code.gs) the order was seen, which stops the
   reminder calls. The link carries a signature so nobody else can use it. */
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

const say = (t) => `<Say voice="${VOICE}">${xml(t)}</Say>`;

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const order = url.searchParams.get("order") || "";
  const sig = url.searchParams.get("sig") || "";
  if (!env.CALL_SECRET || !ORDER_RE.test(order) || !sameText(sig, await sign(env.CALL_SECRET, order))) {
    return twiml(say("Sorry, something went wrong. Goodbye.") + "<Hangup/>");
  }
  let digits = "";
  try { digits = String((await request.formData()).get("Digits") || ""); } catch (e) { /* no keys pressed */ }

  if (digits === "1") {
    let saved = false;
    try {
      const res = await fetch(env.ORDER_LOG_URL || DEFAULT_ORDER_LOG_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ callAck: 1, secret: env.CALL_SECRET, order }),
        redirect: "follow"
      });
      saved = /^ok/.test((await res.text()).trim());
    } catch (e) { /* the sheet will call again; staff can also mark it on the order page */ }
    return twiml(say(saved
      ? `Thank you. Order ending in ${spokenEnding(order)} is confirmed. Goodbye.`
      : `Thank you. We could not save that right now, so you may get one more call. Goodbye.`) + "<Hangup/>");
  }
  // Any other key: ask again once
  return twiml(
    `<Gather numDigits="1" timeout="8" action="${xml(url.toString())}" method="POST">` +
    say("Please press 1 to confirm the new online order.") + `</Gather>` + say("Goodbye.") + "<Hangup/>"
  );
}
