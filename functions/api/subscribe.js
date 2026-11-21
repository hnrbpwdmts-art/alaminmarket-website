/* Cloudflare Pages Function: POST /api/subscribe
   The deals sign-up page (alaminmarket.com/deals/) sends here. The customer
   is saved to the "Customers" tab of the order Google Sheet with
   Texts opt-in = Yes and the exact wording they agreed to (backend/Code.gs).

   Body: { name?, phone, email?, agree: true, optInText, source?, website? }
*/

const DEFAULT_ORDER_LOG_URL =
  "https://script.google.com/macros/s/AKfycby6T80ltjKTV6QB8qJdACKgMUqqd8JmxJ3Dn1SM1lIZ0UjAnUIwPqDmZDysoaJ-v14r/exec";

const recent = new Map();
function tooMany(key, max, windowMs) {
  const now = Date.now();
  const list = (recent.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { recent.set(key, list); return true; }
  list.push(now); recent.set(key, list);
  if (recent.size > 5000) recent.clear();
  return false;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (raw.length > 4000) return json({ ok: false, error: "too_large" }, 413);
  let d;
  try { d = JSON.parse(raw); } catch (e) { return json({ ok: false, error: "bad_request" }, 400); }
  if (d.website) return json({ ok: true });                      // hidden field bots fill in

  const digits = str(d.phone, 30).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10 || /^[01]/.test(digits) || digits.slice(3, 6) === "555")
    return json({ ok: false, error: "bad_phone" }, 400);
  if (d.agree !== true || !str(d.optInText, 400)) return json({ ok: false, error: "no_consent" }, 400);
  const email = str(d.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "bad_email" }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (tooMany(ip, 5, 10 * 60 * 1000)) return json({ ok: false, error: "too_many" }, 429);

  try {
    const res = await fetch(env.ORDER_LOG_URL || DEFAULT_ORDER_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ subscribe: 1, name: str(d.name, 60), phone: "+1" + digits, email, agree: true,
        optInText: str(d.optInText, 400), source: str(d.source, 60) || "Deals page" }),
      redirect: "follow"
    });
    let out = null;
    try { out = JSON.parse(await res.text()); } catch (e) { /* not JSON */ }
    if (!res.ok || !out || !out.ok) return json({ ok: false, error: "not_saved" }, 502);
    return json({ ok: true, already: !!out.already });
  } catch (e) {
    return json({ ok: false, error: "unreachable" }, 502);
  }
}
