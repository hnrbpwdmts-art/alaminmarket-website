/* Cloudflare Pages Function: POST /api/sms
   Used only by the order sheet (backend/Code.gs) to send text messages
   through Twilio: deals to opted-in customers, welcome texts, and staff
   replies to customers who texted us. Protected by CALL_SECRET (the same
   text is in Code.gs).

   Body:
     { secret, action: "status" }                     → { ok, ready, status }
     { secret, action: "send", to: ["+1..."], body }  → { ok, results: [{ to, ok, sid?, error? }] }

   Settings (Pages project > Settings > Variables and Secrets, as Secrets):
     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, CALL_SECRET   (already set for calls)
     TWILIO_MESSAGING_SID   the Messaging Service SID (starts with MG)
*/

const MAX_PER_REQUEST = 40;            // Cloudflare limits outside requests per call; the sheet sends in batches
const E164 = /^\+1[2-9]\d{9}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function sameText(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Is the A2P campaign approved? Twilio: Messaging Service → US A2P compliance
async function campaignStatus(env, auth) {
  try {
    const r = await fetch(`https://messaging.twilio.com/v1/Services/${env.TWILIO_MESSAGING_SID}/Compliance/Usa2p`, { headers: { Authorization: auth } });
    if (!r.ok) return { ready: false, status: "unknown" };
    const d = await r.json();
    const list = d.compliance || d.us_app_to_person_usecases || d.results || [];
    const statuses = list.map((c) => String(c.campaign_status || c.status || "").toUpperCase()).filter(Boolean);
    if (statuses.includes("VERIFIED")) return { ready: true, status: "approved" };
    if (statuses.some((s) => /FAIL|REJECT/.test(s))) return { ready: false, status: "rejected" };
    return { ready: false, status: statuses.length ? "pending" : "not_registered" };
  } catch (e) {
    return { ready: false, status: "unknown" };
  }
}

export async function onRequestPost({ request, env }) {
  const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN, mg = env.TWILIO_MESSAGING_SID, secret = env.CALL_SECRET;
  if (!sid || !token || !secret) return json({ ok: false, error: "not_set" }, 503);

  const raw = await request.text();
  if (raw.length > 20000) return json({ ok: false, error: "too_large" }, 413);
  let d;
  try { d = JSON.parse(raw); } catch (e) { return json({ ok: false, error: "bad_request" }, 400); }
  if (!sameText(d.secret || "", secret)) return json({ ok: false, error: "forbidden" }, 403);
  if (!mg) return json({ ok: true, ready: false, status: "no_service" });

  const auth = "Basic " + btoa(sid + ":" + token);

  if (d.action === "status") {
    const s = await campaignStatus(env, auth);
    return json({ ok: true, ready: s.ready, status: s.status });
  }

  if (d.action !== "send") return json({ ok: false, error: "bad_action" }, 400);
  const body = String(d.body || "").trim().slice(0, 640);
  if (!body) return json({ ok: false, error: "empty" }, 400);
  const to = [...new Set((Array.isArray(d.to) ? d.to : []).map(String))].filter((n) => E164.test(n)).slice(0, MAX_PER_REQUEST);
  if (!to.length) return json({ ok: false, error: "no_numbers" }, 400);

  const results = await Promise.all(to.map(async (num) => {
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: num, MessagingServiceSid: mg, Body: body })
      });
      const out = await r.json().catch(() => ({}));
      if (r.ok && out.sid) return { to: num, ok: true, sid: out.sid };
      return { to: num, ok: false, error: String(out.code || r.status) + (out.message ? " " + String(out.message).slice(0, 120) : "") };
    } catch (e) {
      return { to: num, ok: false, error: "network" };
    }
  }));
  return json({ ok: true, results });
}
