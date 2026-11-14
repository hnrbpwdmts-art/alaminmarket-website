/* Cloudflare Pages Function: POST /api/order
   Receives an order from the website's "Submit order" button (works on any
   device), or a copy of an order the customer is sending by WhatsApp or text,
   saves it to the store's Google Sheet, and the sheet's script emails the
   order to the store (see backend/Code.gs and backend/README.md).

   Optional settings (Pages project > Settings > Variables and Secrets):
     ORDER_LOG_URL   the Google Apps Script web app link (defaults to the one below)
*/

const DEFAULT_ORDER_LOG_URL =
  "https://script.google.com/macros/s/AKfycby6T80ltjKTV6QB8qJdACKgMUqqd8JmxJ3Dn1SM1lIZ0UjAnUIwPqDmZDysoaJ-v14r/exec";

const MAX_BODY = 30000;          // bytes; a large order is well under this
const LIMIT = 6;                 // orders per visitor...
const WINDOW_MS = 10 * 60 * 1000; // ...per 10 minutes (best effort)
const recent = new Map();        // ip -> [timestamps]

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function tooMany(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) { recent.set(ip, list); return true; }
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 5000) recent.clear();
  return false;
}

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: "too_large" }, 413);

  let d;
  try { d = JSON.parse(raw); } catch (e) { return json({ ok: false, error: "bad_request" }, 400); }

  // Hidden form field that people never fill in; bots often do.
  if (d.website) return json({ ok: true, orderNumber: str(d.orderNumber, 20) });

  const name = str(d.name, 80);
  const phoneDigits = String(d.phone || "").replace(/\D/g, "");
  const items = Array.isArray(d.items) ? d.items.slice(0, 60) : [];
  const orderNumber = str(d.orderNumber, 20);
  if (!name || phoneDigits.length < 10 || phoneDigits.length > 11 || !items.length || !/^[A-Z]{0,3}\d{4}-\d{3}$/.test(orderNumber)) {
    return json({ ok: false, error: "incomplete" }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (tooMany(ip)) return json({ ok: false, error: "too_many" }, 429);

  const payload = {
    version: 1,
    orderNumber,
    sentAt: new Date().toISOString(),
    channel: d.channel === "WhatsApp" || d.channel === "Text" ? d.channel : "Website",
    mode: d.mode === "delivery" ? "delivery" : "pickup",
    day: str(d.day, 40),
    date: str(d.date, 12),
    time: str(d.time, 40),
    name,
    phone: str(d.phone, 30),
    address: str(d.address, 200),
    notes: str(d.notes, 600),
    marketingOptIn: !!d.marketingOptIn,
    optInText: str(d.optInText, 400),
    estimatedTotal: typeof d.estimatedTotal === "number" ? d.estimatedTotal : "",
    allPriced: !!d.allPriced,
    itemCount: items.length,
    items: items.map((it) => ({
      category: str(it.category, 60), item: str(it.item, 100), choices: str(it.choices, 200),
      special: str(it.special, 200), qty: Number(it.qty) || 0, unit: it.unit === "lb" ? "lb" : "count",
      price: typeof it.price === "number" ? it.price : "", priceUnit: str(it.priceUnit, 10),
      estimate: typeof it.estimate === "number" ? it.estimate : ""
    })),
    source: str(d.source, 100),
    device: d.device === "Phone" ? "Phone" : "Computer",
    update: !!d.update,              // true = changes to an order already sent (same order number)
    message: str(d.message, 6000),   // readable order text for the email
    notify: true
  };

  try {
    const res = await fetch(env.ORDER_LOG_URL || DEFAULT_ORDER_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });
    const text = (await res.text()).trim();
    if (!res.ok || !/^ok/.test(text)) return json({ ok: false, error: "not_saved" }, 502);
    return json({ ok: true, orderNumber, emailed: /emailed/.test(text) });
  } catch (e) {
    return json({ ok: false, error: "unreachable" }, 502);
  }
}
