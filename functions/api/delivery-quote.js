/* Cloudflare Pages Function: POST /api/delivery-quote
   1. Works out how far the customer is from the store (straight-line miles),
      using the free US Census geocoder. Addresses farther than MAX_DELIVERY_MILES
      are told delivery isn't available.
   2. Asks Uber Direct for a price quote (never books a driver).
   If Uber can't quote (out of Uber's range, Uber down, keys missing), the order
   can still be placed and the store texts the delivery cost.

   Set in Cloudflare (Pages project > Settings > Variables and Secrets):
     UBER_CLIENT_ID, UBER_CLIENT_SECRET, UBER_CUSTOMER_ID   (from the Uber Direct dashboard)
   Optional:
     MAX_DELIVERY_MILES   default 40
     STORE_PHONE          e.g. +13105381188
     DELIVERY_ZIPS        only these ZIP codes, separated by spaces (leave out for no ZIP limit)
*/

const STORE = { street: "18220 Prairie Ave", city: "Torrance", state: "CA", zip: "90504" };
const STORE_ADDRESS = {
  street_address: [STORE.street], city: STORE.city, state: STORE.state, zip_code: STORE.zip, country: "US"
};

let cachedToken = null;   // { token, expiresAt }
let storeCoords = null;   // { lat, lon }

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

async function fetchWithTimeout(url, opts = {}, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// US Census geocoder: free, no key, US street addresses only
async function geocode(street, city, state, zip) {
  const q = new URLSearchParams({ street, city, state, zip, benchmark: "Public_AR_Current", format: "json" });
  try {
    const res = await fetchWithTimeout("https://geocoding.geo.census.gov/geocoder/locations/address?" + q, {}, 5000);
    if (!res.ok) return null;
    const data = await res.json();
    const m = data && data.result && data.result.addressMatches && data.result.addressMatches[0];
    if (!m || !m.coordinates) return null;
    return { lat: Number(m.coordinates.y), lon: Number(m.coordinates.x) };
  } catch (e) { return null; }
}

function milesBetween(a, b) {
  const R = 3958.8, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const validCoord = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon) && lat > 32 && lat < 36 && lon > -121 && lon < -116;

async function getToken(env) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token;
  const res = await fetchWithTimeout("https://auth.uber.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.UBER_CLIENT_ID,
      client_secret: env.UBER_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "eats.deliveries"
    })
  }, 8000);
  if (!res.ok) throw new Error("auth " + res.status);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

async function uberQuote(env, dropoff) {
  if (!env.UBER_CLIENT_ID || !env.UBER_CLIENT_SECRET || !env.UBER_CUSTOMER_ID) return { error: "not_configured" };
  try {
    const token = await getToken(env);
    const res = await fetchWithTimeout("https://api.uber.com/v1/customers/" + env.UBER_CUSTOMER_ID + "/delivery_quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        pickup_address: JSON.stringify(STORE_ADDRESS),
        dropoff_address: JSON.stringify(dropoff),
        pickup_phone_number: env.STORE_PHONE || undefined
      })
    }, 10000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: res.status === 400 ? "no_uber_quote" : "uber_error", detail: data.code || "" };
    return { quoteId: data.id, fee: (data.fee || 0) / 100, minutes: data.duration || null };
  } catch (e) {
    return { error: "uber_unreachable" };
  }
}

export async function onRequestPost({ request, env }) {
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

  const maxMiles = Number(env.MAX_DELIVERY_MILES) || 40;
  const dropoff = { street_address: unit ? [street, unit] : [street], city, state: "CA", zip_code: zip, country: "US" };

  // Distance and the Uber quote are looked up at the same time
  const [here, store, quote] = await Promise.all([
    geocode(street, city, "CA", zip),
    storeCoords ? Promise.resolve(storeCoords) : geocode(STORE.street, STORE.city, STORE.state, STORE.zip),
    uberQuote(env, dropoff)
  ]);
  if (store) storeCoords = store;
  // If the Census can't find the address, use the map point from the suggestion the customer picked
  const lat = Number(input.lat), lon = Number(input.lon);
  const point = here || (validCoord(lat, lon) ? { lat, lon } : null);
  const miles = point && store ? Math.round(milesBetween(store, point) * 10) / 10 : null;

  if (miles != null && miles > maxMiles) return json({ ok: false, error: "outside_area", miles, maxMiles });

  if (quote.error) return json({ ok: false, error: quote.error, miles, maxMiles });
  return json({ ok: true, quoteId: quote.quoteId, fee: quote.fee, minutes: quote.minutes, miles, maxMiles });
}
