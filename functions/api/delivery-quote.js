/* Cloudflare Pages Function: POST /api/delivery-quote
   Asks Uber Direct how much a delivery from the store to the customer costs.

   Set these in Cloudflare (Pages project > Settings > Variables and Secrets):
     UBER_CLIENT_ID, UBER_CLIENT_SECRET, UBER_CUSTOMER_ID   (from the Uber Direct dashboard)
   Optional:
     STORE_PHONE   e.g. +13105381188
*/

const STORE_ADDRESS = {
  street_address: ["18220 Prairie Ave"],
  city: "Torrance",
  state: "CA",
  zip_code: "90504",
  country: "US"
};

let cachedToken = null; // { token, expiresAt }

// Best-effort limit so nobody can use the site to spam Uber with quote requests
const LIMIT = 12, WINDOW_MS = 10 * 60 * 1000;
const recent = new Map(); // ip -> [timestamps]
function tooMany(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) { recent.set(ip, list); return true; }
  list.push(now); recent.set(ip, list);
  if (recent.size > 5000) recent.clear();
  return false;
}

async function getToken(env) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token;
  const res = await fetch("https://auth.uber.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.UBER_CLIENT_ID,
      client_secret: env.UBER_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "eats.deliveries"
    })
  });
  if (!res.ok) throw new Error("auth " + res.status);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.UBER_CLIENT_ID || !env.UBER_CLIENT_SECRET || !env.UBER_CUSTOMER_ID) {
    return json({ ok: false, error: "not_configured" });
  }
  if (tooMany(request.headers.get("CF-Connecting-IP") || "unknown")) return json({ ok: false, error: "too_many" }, 429);
  let input;
  try { input = await request.json(); } catch (e) { return json({ ok: false, error: "bad_request" }, 400); }

  const street = String(input.street || "").trim().slice(0, 120);
  const unit = String(input.unit || "").trim().slice(0, 40);
  const city = String(input.city || "").trim().slice(0, 60);
  const zip = String(input.zip || "").trim();
  if (street.length < 4 || city.length < 2 || !/^\d{5}$/.test(zip)) {
    return json({ ok: false, error: "address_incomplete" }, 400);
  }
  const allowed = String(env.DELIVERY_ZIPS || "").split(/[\s,]+/).filter(Boolean);
  if (allowed.length && allowed.indexOf(zip) === -1) return json({ ok: false, error: "outside_area" });

  const dropoff = {
    street_address: unit ? [street, unit] : [street],
    city, state: "CA", zip_code: zip, country: "US"
  };

  try {
    const token = await getToken(env);
    const res = await fetch("https://api.uber.com/v1/customers/" + env.UBER_CUSTOMER_ID + "/delivery_quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        pickup_address: JSON.stringify(STORE_ADDRESS),
        dropoff_address: JSON.stringify(dropoff),
        pickup_phone_number: env.STORE_PHONE || undefined
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Uber says it can't deliver there (out of range, bad address, etc.)
      return json({ ok: false, error: res.status === 400 ? "undeliverable" : "uber_error", detail: data.code || "" });
    }
    return json({
      ok: true,
      quoteId: data.id,
      fee: (data.fee || 0) / 100,
      currency: data.currency || "usd",
      minutes: data.duration || null,
      dropoffEta: data.dropoff_eta || null,
      expires: data.expires || null
    });
  } catch (e) {
    return json({ ok: false, error: "uber_unreachable" }, 502);
  }
}
