/* Cloudflare Pages Function: GET /api/address-suggest?q=1820 Prairie
   Address suggestions while a customer types their delivery address.
   Uses Photon (photon.komoot.io), a free address search built on
   OpenStreetMap data. No key needed. Results are limited to the area around
   the store and to California, and cached for a day.
*/

// Roughly 45 miles around the store (Torrance), as min lon, min lat, max lon, max lat
const BBOX = "-119.05,33.20,-117.60,34.50";
const NEAR = { lat: "33.865", lon: "-118.345" }; // bias results toward the store

const LIMIT = 60, WINDOW_MS = 10 * 60 * 1000;
const recent = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (recent.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) { recent.set(ip, list); return true; }
  list.push(now); recent.set(ip, list);
  if (recent.size > 5000) recent.clear();
  return false;
}

function json(body, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": cache }
  });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (q.length < 4) return json({ ok: true, results: [] });
  if (tooMany(request.headers.get("CF-Connecting-IP") || "unknown")) return json({ ok: false, error: "too_many" }, 429);

  const params = new URLSearchParams({ q, limit: "10", lang: "en", lat: NEAR.lat, lon: NEAR.lon, bbox: BBOX });
  ["house", "street"].forEach((l) => params.append("layer", l));
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch("https://photon.komoot.io/api/?" + params, {
      headers: { "User-Agent": "alaminmarket.com address search" }, signal: ctrl.signal
    }).finally(() => clearTimeout(t));
    if (!res.ok) return json({ ok: false, error: "unavailable" }, 502);
    const data = await res.json();
    const seen = new Set();
    const results = (data.features || []).map((f) => {
      const p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
      const street = [p.housenumber, p.street || (p.housenumber ? "" : p.name)].filter(Boolean).join(" ").trim();
      const city = p.city || p.town || p.village || p.district || p.locality || "";
      return {
        street, city, zip: String(p.postcode || "").slice(0, 5), state: p.state || "",
        country: p.countrycode || "", lat: c[1], lon: c[0], hasNumber: !!p.housenumber
      };
    }).filter((r) => r.country === "US" && /california/i.test(r.state) && r.street && r.city)
      .filter((r) => { const k = (r.street + r.city + r.zip).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (b.hasNumber ? 1 : 0) - (a.hasNumber ? 1 : 0))
      .slice(0, 6)
      .map(({ street, city, zip, lat, lon }) => ({ street, city, zip, lat, lon }));
    return json({ ok: true, results }, 200, "public, max-age=86400");
  } catch (e) {
    return json({ ok: false, error: "unavailable" }, 502);
  }
}
