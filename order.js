/* "Order meat" page. Reads the menu from meat-menu.js and store details from
   site-config.js. Orders are sent as a WhatsApp or text message. */
(function () {
  "use strict";
  var M = window.MEAT_MENU, S = window.SITE;
  var catsEl = document.getElementById("order-cats");
  if (!M || !S || !catsEl) return;

  var itemsEl = document.getElementById("order-items");
  var cartEl = document.getElementById("order-cart");
  var form = document.getElementById("order-form");
  var doneEl = document.getElementById("order-done");
  var $ = function (id) { return document.getElementById(id); };
  var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var STORE_KEY = "alamin-order-v1";

  // ---------- helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function money(n) { return "$" + n.toFixed(2); }
  function fmtQty(q, unit, item) {
    var n = (Math.round(q * 100) / 100).toString();
    if (unit === "lb") return n + " lb";
    var names = item && item.countName;
    return names ? n + " " + (q === 1 ? names[0] : names[1]) : n;
  }
  function priceUnit(item) { return item.priceUnit || item.unit; }
  // Price can depend on one of the choices, e.g. beef with fat vs. without fat
  function itemPrice(item, picks) {
    if (item.prices && item.priceChoice) {
      var v = picks && picks[item.priceChoice];
      return v != null && item.prices[v] != null ? item.prices[v] : null;
    }
    return item.price;
  }
  function priceLabel(item, picks) {
    var per = priceUnit(item) === "lb" ? " / lb" : " each";
    var p = itemPrice(item, picks);
    if (p != null) return money(p) + per;
    if (item.prices) {
      var all = Object.keys(item.prices).map(function (k) { return item.prices[k]; });
      return money(Math.min.apply(null, all)) + "–" + money(Math.max.apply(null, all)) + per;
    }
    return "Price coming soon";
  }
  function findItem(id) {
    for (var c = 0; c < M.categories.length; c++) {
      var items = M.categories[c].items || [];
      for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    }
    return null;
  }
  // Every allowed combination of answers for an item, from its "combos" blocks.
  function expand(item) {
    if (item._combos) return item._combos;
    var out = [];
    (item.combos || []).forEach(function (block) {
      var acc = [{}];
      (item.choices || []).forEach(function (q) {
        var vals = block[q] || [];
        var next = [];
        acc.forEach(function (a) { vals.forEach(function (v) { var b = Object.assign({}, a); b[q] = v; next.push(b); }); });
        acc = next;
      });
      out = out.concat(acc);
    });
    item._combos = out;
    return out;
  }
  // Answers still possible for question q, given the answers picked so far.
  function optionsFor(item, q, picked) {
    var qs = item.choices || [], idx = qs.indexOf(q), seen = [], vals = [];
    expand(item).forEach(function (c) {
      for (var i = 0; i < idx; i++) if (picked[qs[i]] && c[qs[i]] !== picked[qs[i]]) return;
      if (seen.indexOf(c[q]) === -1) { seen.push(c[q]); vals.push(c[q]); }
    });
    return vals;
  }

  function packingFor(item, picks) {
    var list = item.packing || M.packing || [];
    var skip = item.packingSkip || {};
    for (var q in skip) if (picks[q] === skip[q]) return list.slice(0, 1);
    return list;
  }

  // ---------- saved state ----------
  var state = { cart: [], mode: "pickup", name: "", phone: "", address: "", addr: {} };
  var quote = null;
  // Phones and tablets (iPads report themselves as Macs, so also check for touch)
  var isPhone = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);           // live delivery price from Uber: { fee, minutes, quoteId } or { error }
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved && Array.isArray(saved.cart)) {
      state = Object.assign(state, saved);
      state.cart = saved.cart.filter(function (l) {
        var it = findItem(l.id);
        return it && l.picks && (it.choices || []).every(function (q) { return l.picks[q]; });
      });
    }
  } catch (e) { /* storage unavailable */ }
  // A sent order can be edited for a while; changes go out under the same order number
  if (state.sentNum && !(state.sentAt > Date.now() - 12 * 3600 * 1000)) { state.sentNum = null; state.sentAt = null; }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ cart: state.cart, mode: state.mode, name: state.name, phone: state.phone, addr: state.addr,
      sentNum: state.sentNum || null, sentAt: state.sentAt || null })); } catch (e) { /* ignore */ }
  }

  // ---------- category icons (simple line drawings) ----------
  var ICONS = {
    chicken: '<ellipse cx="15" cy="9" rx="6" ry="5" transform="rotate(-45 15 9)"/><path d="M11.5 12.5L6 18"/><circle cx="4.6" cy="17.6" r="1.6"/><circle cx="6.4" cy="19.4" r="1.6"/>',
    lamb: '<circle cx="9" cy="15" r="5.5"/><circle cx="9" cy="15" r="2"/><path d="M13 11l6.5-6.5"/><circle cx="20" cy="3.6" r="1.3"/><circle cx="20.6" cy="5.8" r="1.3"/>',
    beef: '<path d="M3.5 12.5C3.5 7.5 8 4.5 13 4.5c4.5 0 7.5 2.7 7.5 6.2 0 2.6-1.8 3.8-3.6 4.8-1.9 1-2.4 4-6.4 4C6.2 19.5 3.5 16.6 3.5 12.5z"/><circle cx="14" cy="10" r="2.2"/>',
    goat: '<path d="M8 7C6.5 4.5 4 4 2.5 5.5c2 .2 3.3 1.5 4 3.5"/><path d="M16 7c1.5-2.5 4-3 5.5-1.5-2 .2-3.3 1.5-4 3.5"/><path d="M7 10c0-2.4 2.2-3.6 5-3.6s5 1.2 5 3.6v4.5c0 3-2.2 5.5-5 5.5s-5-2.5-5-5.5z"/><path d="M10 12h.01M14 12h.01"/><path d="M11 20.5c.3 1 .6 1.5 1 1.5s.7-.5 1-1.5"/>',
    veal: '<path d="M5 10c0-3 3-5 7-5s7 2 7 5v3c0 4-3 7-7 7s-7-3-7-7z"/><path d="M5 10L2.5 8.5M19 10l2.5-1.5"/><path d="M9.5 15.5c1.5 1 3.5 1 5 0"/><path d="M9.5 11h.01M14.5 11h.01"/>'
  };
  function icon(id) {
    return ICONS[id] ? '<svg aria-hidden="true" viewBox="0 0 24 24">' + ICONS[id] + "</svg>" : "";
  }

  // ---------- menu ----------
  var activeCat = 0, catTabs = [];
  function renderCats() {
    M.categories.forEach(function (cat, i) {
      var b = el("button", "order-cat");
      b.innerHTML = icon(cat.id);
      b.appendChild(el("span", null, cat.name));
      b.type = "button"; b.setAttribute("role", "tab");
      b.addEventListener("click", function () { activeCat = i; updateCats(); renderItems(); });
      catsEl.appendChild(b); catTabs.push(b);
    });
    catsEl.hidden = M.categories.length < 2;
    updateCats();
  }
  function updateCats() {
    catTabs.forEach(function (b, i) { b.setAttribute("aria-selected", i === activeCat ? "true" : "false"); });
  }

  function renderItems() {
    itemsEl.textContent = "";
    if (M.categories[activeCat].note) itemsEl.appendChild(el("p", "order-cat-note", M.categories[activeCat].note));
    (M.categories[activeCat].items || []).forEach(function (item) { itemsEl.appendChild(itemCard(item)); });
  }

  function itemCard(item) {
    var card = el("article", "order-item");
    var head = el("button", "order-item-head");
    head.type = "button"; head.setAttribute("aria-expanded", "false");
    head.appendChild(el("span", "order-item-name", item.name));
    head.appendChild(el("span", "order-item-price", priceLabel(item)));
    var body = el("div", "order-item-body"); body.hidden = true;
    head.addEventListener("click", function () {
      var open = body.hidden;
      itemsEl.querySelectorAll(".order-item-body").forEach(function (b) { b.hidden = true; });
      itemsEl.querySelectorAll(".order-item-head").forEach(function (h) { h.setAttribute("aria-expanded", "false"); });
      if (open) { body.hidden = false; head.setAttribute("aria-expanded", "true"); buildPicker(item, body); }
    });
    card.appendChild(head); card.appendChild(body);
    return card;
  }

  function buildPicker(item, body) {
    var picked = {}, qty = item.min || 1, custom = "";
    var units = item.units && item.units.length ? item.units : [item.unit];
    var unit = units[0];
    var step = item.step || 1, min = item.min || step;
    function draw() {
      body.textContent = "";
      if (item.note) body.appendChild(el("p", "order-item-note", item.note));
      if (item.days && item.days.length) body.appendChild(el("p", "order-item-days", "Available " + item.days.map(function (d) { return ({Sun:"Sunday",Mon:"Monday",Tue:"Tuesday",Wed:"Wednesday",Thu:"Thursday",Fri:"Friday",Sat:"Saturday"})[d] || d; }).join(" and ") + " only"));
      (item.choices || []).forEach(function (q) {
        var opts = optionsFor(item, q, picked);
        if (picked[q] && opts.indexOf(picked[q]) === -1) delete picked[q];
        if (opts.length === 1) picked[q] = opts[0];
        // Only one possible answer (and it's not the first question): no need to ask
        if (opts.length === 1 && (item.choices || []).indexOf(q) > 0) return;
        var group = el("div", "order-q");
        group.appendChild(el("p", "order-q-label", q));
        // Layout: piece counts as small tiles, long lists in a neat grid,
        // grinds grouped under "Ground"
        var isCount = opts.every(function (v) { return /^(\d+ pieces|Whole.*)$/.test(v); }) && opts.some(function (v) { return /^\d+ pieces$/.test(v); });
        var ground = opts.filter(function (v) { return /^Ground \(/.test(v); });
        var main = opts.filter(function (v) { return ground.indexOf(v) === -1; });
        var row = el("div", "order-opts" + (isCount ? " order-opts-tiles" : main.length > 4 ? " order-opts-grid" : ""));
        var groundRow = null;
        if (ground.length) {
          groundRow = el("div", "order-opts order-opts-grid");
        }
        opts.forEach(function (v) {
          var label = isCount ? v.replace(/^(\d+) pieces$/, "$1 pcs").replace(/^Whole.*$/, "Whole") :
            ground.indexOf(v) > -1 ? v.replace(/^Ground \((.*)\)$/, function (m, g) { return g.charAt(0).toUpperCase() + g.slice(1); }) : v;
          if (item.prices && item.priceChoice === q && item.prices[v] != null)
            label += " · " + money(item.prices[v]) + (priceUnit(item) === "lb" ? "/lb" : "");
          var b = el("button", "order-opt", label);
          b.type = "button";
          b.setAttribute("aria-pressed", picked[q] === v ? "true" : "false");
          if (opts.length === 1) b.disabled = true;
          b.addEventListener("click", function () {
            picked[q] = v;
            var qs = item.choices, i = qs.indexOf(q);
            for (var k = i + 1; k < qs.length; k++) delete picked[qs[k]];
            draw();
          });
          if (isCount && /^Whole/.test(v)) b.title = v;
          (ground.indexOf(v) > -1 ? groundRow : row).appendChild(b);
        });
        if (row.children.length) group.appendChild(row);
        if (groundRow) {
          group.appendChild(el("p", "order-q-sublabel", "Ground"));
          group.appendChild(groundRow);
        }
        body.appendChild(group);
      });
      // quantity
      var qrow = el("div", "order-qty-row");
      var qlab = el("div", "order-qty-label");
      qlab.appendChild(el("p", "order-q-label", units.length > 1 ? "Order by" : (unit === "lb" ? "Weight" : "How many")));
      if (units.length > 1) {
        var ut = el("div", "order-opts order-unit-toggle");
        units.forEach(function (u) {
          var b = el("button", "order-opt", u === "lb" ? "Pounds" : "Quantity");
          b.type = "button"; b.setAttribute("aria-pressed", u === unit ? "true" : "false");
          b.addEventListener("click", function () { unit = u; draw(); });
          ut.appendChild(b);
        });
        qlab.appendChild(ut);
      }
      qrow.appendChild(qlab);
      var stepper = el("div", "order-stepper");
      var minus = el("button", "order-step-btn", "−"); minus.type = "button"; minus.setAttribute("aria-label", "Less");
      var val = el("span", "order-step-val", unit === "lb" ? fmtQty(qty, "lb") : String(qty)); val.setAttribute("aria-live", "polite");
      var plus = el("button", "order-step-btn", "+"); plus.type = "button"; plus.setAttribute("aria-label", "More");
      minus.addEventListener("click", function () { qty = Math.max(min, Math.round((qty - step) * 100) / 100); draw(); });
      plus.addEventListener("click", function () { qty = Math.round((qty + step) * 100) / 100; draw(); });
      stepper.appendChild(minus); stepper.appendChild(val); stepper.appendChild(plus);
      qrow.appendChild(stepper);
      body.appendChild(qrow);


      // packing: pack sizes bigger than the order are not offered
      var orderLb = unit === "lb" ? qty : (item.avgWeight ? qty * item.avgWeight : null);
      var packs = packingFor(item, picked).filter(function (v) {
        var m = v.match(/^(\d+(?:\.\d+)?) lb packs/);
        return !m || orderLb == null || +m[1] < orderLb;
      });
      if (packs.length) {
        if (packs.indexOf(picked.Packing) === -1) picked.Packing = packs[0];
        var pg = el("div", "order-q");
        pg.appendChild(el("p", "order-q-label", "Packing" + (item.packing ? "" : " (smallest pack is 1 lb)")));
        var prow = el("div", "order-opts" + (packs.length > 4 ? " order-opts-grid" : ""));
        packs.forEach(function (v) {
          var b = el("button", "order-opt", v); b.type = "button";
          b.setAttribute("aria-pressed", picked.Packing === v ? "true" : "false");
          if (packs.length === 1) b.disabled = true;
          b.addEventListener("click", function () { picked.Packing = v; draw(); });
          prow.appendChild(b);
        });
        pg.appendChild(prow); body.appendChild(pg);
      } else delete picked.Packing;

      // Free-text special cutting request, at the end of every item
      var cl = el("label", "order-field order-custom");
      cl.appendChild(document.createTextNode("Special cutting or packing? (optional)"));
      var ct = document.createElement("textarea");
      ct.rows = 2; ct.maxLength = 200; ct.value = custom;
      ct.placeholder = "Example: 10 pieces, curry size, 1.5 lb packs";
      ct.addEventListener("input", function () { custom = ct.value; });
      cl.appendChild(ct);
      body.appendChild(cl);

      var ready = (item.choices || []).every(function (q) { return picked[q]; });
      var add = el("button", "btn btn-primary order-add", ready ? "Add to order" : "Choose " + firstMissing().toLowerCase());
      add.type = "button"; add.disabled = !ready;
      add.addEventListener("click", function () {
        state.cart.push({ id: item.id, picks: Object.assign({}, picked), qty: qty, unit: unit, custom: custom.trim() });
        save(); renderCart();
        add.textContent = "Added ✓";
        setTimeout(function () { body.hidden = true; body.previousSibling.setAttribute("aria-expanded", "false"); }, 700);
      });
      body.appendChild(add);
    }
    function firstMissing() {
      var qs = item.choices || [];
      for (var i = 0; i < qs.length; i++) if (!picked[qs[i]]) return qs[i];
      return "";
    }
    draw();
  }

  // ---------- cart ----------
  function lineText(l) {
    var item = findItem(l.id);
    var parts = [];
    (item.choices || []).forEach(function (q) {
      var v = l.picks[q];
      if (q === "BBQ cut") {
        if (v === "Yes") parts.push("BBQ cut");
        else if (optionsFor(item, q, l.picks).length > 1) parts.push("no BBQ cut");
      } else parts.push(v);
    });
    if (l.picks.Packing) parts.push(/^Other size/.test(l.picks.Packing) ? "custom packing (see note)" : l.picks.Packing);
    return { item: item, desc: parts.join(", "), custom: l.custom || "" };
  }
  function lineUnit(l) { var it = findItem(l.id); return l.unit || it.unit; }
  function lineCost(l) {
    var it = findItem(l.id);
    var price = it && itemPrice(it, l.picks);
    if (price == null) return null;
    if (priceUnit(it) === "lb" && lineUnit(l) !== "lb") return it.avgWeight ? price * it.avgWeight * l.qty : null;
    return price * l.qty;
  }

  function renderCart() {
    cartEl.textContent = "";
    if (!state.cart.length) {
      cartEl.appendChild(el("p", "order-empty", "Nothing added yet."));
      form.hidden = true;
      return;
    }
    var ul = el("ul", "order-lines"), total = 0, allPriced = true;
    state.cart.forEach(function (l, i) {
      var t = lineText(l), cost = lineCost(l);
      if (cost == null) allPriced = false; else total += cost;
      var li = el("li", "order-line");
      var info = el("div", "order-line-info");
      info.appendChild(el("span", "order-line-name", lineUnit(l) === "lb" ? fmtQty(l.qty, "lb") + " " + t.item.name : l.qty + " × " + t.item.name));
      info.appendChild(el("span", "order-line-desc", t.desc));
      if (t.custom) info.appendChild(el("span", "order-line-desc order-line-custom", "Special request: " + t.custom));
      li.appendChild(info);
      li.appendChild(el("span", "order-line-cost", cost != null ? money(cost) : (itemPrice(t.item, l.picks) != null ? priceLabel(t.item, l.picks) : "")));
      var rm = el("button", "order-line-rm", "Remove"); rm.type = "button";
      rm.setAttribute("aria-label", "Remove " + t.item.name);
      rm.addEventListener("click", function () { state.cart.splice(i, 1); save(); renderCart(); });
      li.appendChild(rm);
      ul.appendChild(li);
    });
    cartEl.appendChild(ul);
    var tot = el("p", "order-total");
    tot.appendChild(el("span", null, "Estimated total"));
    tot.appendChild(el("strong", null, allPriced ? money(total) : total > 0 ? "From " + money(total) : "Sent by text"));
    cartEl.appendChild(tot);
    form.hidden = false;
    renderDays();
    renderTotals();
  }

  // ---------- pickup / delivery ----------
  var modes = [];
  if (!M.pickup || M.pickup.enabled !== false) modes.push({ id: "pickup", label: "Pickup" });
  if (M.delivery && M.delivery.enabled) modes.push({ id: "delivery", label: "Delivery" });
  if (!modes.some(function (m) { return m.id === state.mode; })) state.mode = modes[0].id;

  function renderModes() {
    var fs = $("order-mode");
    modes.forEach(function (m) {
      var lab = el("label", "order-choice-opt");
      var r = document.createElement("input");
      r.type = "radio"; r.name = "mode"; r.value = m.id; r.checked = state.mode === m.id;
      r.addEventListener("change", function () { state.mode = m.id; save(); updateMode(); });
      lab.appendChild(r); lab.appendChild(el("span", null, m.label));
      fs.appendChild(lab);
    });
    fs.hidden = modes.length < 2;
    $("order-step3-title").textContent = modes.length < 2 ? (modes[0].id === "pickup" ? "Pickup details" : "Delivery details") : "Pickup or delivery";
    updateMode();
  }
  function updateMode() {
    var isDel = state.mode === "delivery";
    $("order-address-wrap").hidden = !isDel;
    var note = $("order-delivery-note"), parts = [];
    if (M.delivery && M.delivery.minimumOrder) parts.push("Delivery minimum: " + money(M.delivery.minimumOrder) + " of meat.");
    if (M.delivery && M.delivery.maxMiles) parts.push("We deliver within " + M.delivery.maxMiles + " miles of the store.");
    if (M.delivery && M.delivery.quoteUrl) parts.push("Enter your address to see a delivery estimate.");
    else if (M.delivery && M.delivery.note) parts.push(M.delivery.note);
    note.textContent = parts.join(" ");
    note.hidden = !isDel || !parts.length;
    renderTotals();
    var times = ((isDel ? M.delivery.times : M.pickup.times) || []).filter(function (t) {
      // For today, hide time windows that have already ended
      if ($("order-day").selectedIndex !== 0 || !/^Today/.test($("order-day").value)) return true;
      var m = t.match(/(\d{1,2})(?::(\d\d))?\s*(AM|PM)\s*$/i);
      if (!m) return true;
      var h = (+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0);
      var now = new Date();
      return h * 60 + (+m[2] || 0) - 60 > now.getHours() * 60 + now.getMinutes();
    });
    var sel = $("order-time"), prev = sel.value;
    sel.textContent = "";
    times.forEach(function (t) { var o = el("option", null, t); o.value = t; sel.appendChild(o); });
    if (times.indexOf(prev) > -1) sel.value = prev;
  }

  function isoDate(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function renderDays() {
    var sel = $("order-day"), prev = sel.value;
    sel.textContent = "";
    var need = [];
    state.cart.forEach(function (l) { var it = findItem(l.id); if (it.days && it.days.length) need.push(it.days); });
    var now = new Date();
    for (var i = 0; i <= (M.daysAhead || 7); i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      var dn = DAY_NAMES[d.getDay()];
      if ((M.closedDays || []).indexOf(isoDate(d)) > -1) continue;
      if (!need.every(function (days) { return days.indexOf(dn) > -1; })) continue;
      var label = (i === 0 ? "Today, " : i === 1 ? "Tomorrow, " : "") +
        d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      var o = el("option", null, label); o.value = label; o.setAttribute("data-date", isoDate(d)); sel.appendChild(o);
    }
    if (!sel.options.length) { var none = el("option", null, "No day has all items. Remove one to continue."); none.value = ""; sel.appendChild(none); }
    if ([].some.call(sel.options, function (o) { return o.value === prev; })) sel.value = prev;
    updateMode();
    if (!$("order-time").options.length && sel.options.length > 1) { sel.selectedIndex = 1; updateMode(); }
  }

  // ---------- delivery price ----------
  function readAddr() {
    state.addr = { street: $("addr-street").value.trim(), unit: $("addr-unit").value.trim(),
      city: $("addr-city").value.trim(), zip: $("addr-zip").value.trim() };
    var a = state.addr;
    state.address = a.street ? a.street + (a.unit ? ", " + a.unit : "") + ", " + a.city + ", CA " + a.zip : "";
    return a;
  }
  // One address box: city and ZIP come from the picked suggestion, or are typed by hand
  function showManual(on) {
    $("addr-more").hidden = !on;
    $("addr-manual").hidden = on;
    $("get-quote").hidden = !on;
    if (on) $("addr-picked").hidden = true;
  }
  function showPicked(city, zip) {
    var p = $("addr-picked"); p.textContent = "";
    p.appendChild(el("strong", null, [city, "CA " + (zip || "")].join(", ").trim()));
    p.appendChild(document.createTextNode(" "));
    var ch = el("button", "order-link-btn", "Change"); ch.type = "button";
    ch.addEventListener("click", function () { showManual(true); $("addr-city").focus(); });
    p.appendChild(ch);
    p.hidden = false; $("addr-manual").hidden = true;
  }
  function addrComplete(a) { return a.street.length >= 4 && a.city.length >= 2 && /^\d{5}$/.test(a.zip); }
  function subtotal() {
    var t = 0; state.cart.forEach(function (l) { var c = lineCost(l); if (c != null) t += c; }); return t;
  }
  function showQuote(text, isError, isInfo) {
    var q = $("order-quote"); q.hidden = !text; q.textContent = text || "";
    q.classList.toggle("is-error", !!isError);
    q.classList.toggle("is-info", !!isInfo);
  }
  function clearQuote() { quote = null; showQuote(""); renderTotals(); }
  function getQuote() {
    var a = readAddr(); save();
    if (!addrComplete(a)) {
      if ($("addr-more").hidden) showQuote("Please pick your address from the list, or tap \"Enter city and ZIP yourself\".", true);
      else showQuote("Please enter your street, city, and 5-digit ZIP code.", true);
      return;
    }
    if (!M.delivery.quoteUrl) { quote = { error: "off" }; showQuote(M.delivery.note); return; }
    showQuote("Checking delivery price…");
    var body = { street: a.street, unit: a.unit, city: a.city, zip: a.zip };
    if (state.addrGeo) { body.lat = state.addrGeo.lat; body.lon = state.addrGeo.lon; }
    fetch(M.delivery.quoteUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "unavailable" }; }); })
      .then(function (d) {
        if (d && d.ok) {
          // Show a worst-case estimate: Uber's price plus any cushion, rounded up to the next dollar.
          // We may deliver ourselves or combine orders; the customer never pays more than this.
          var est = Math.ceil((Number(d.fee) || 0) + (Number(M.delivery.cushion) || 0));
          quote = { fee: est, uberFee: d.fee, minutes: d.minutes, quoteId: d.quoteId, miles: d.miles };
          showQuote("Estimated delivery: up to " + money(est) + ". We'll confirm the final delivery cost when we confirm your order.");
        } else if (d && d.error === "outside_area") {
          quote = { error: "outside_area", miles: d.miles };
          showQuote("Sorry, " + (d.miles ? "this address is about " + Math.round(d.miles) + " miles away. " : "we don't deliver to this address. ") +
            "We deliver within " + (d.maxMiles || M.delivery.maxMiles || 40) + " miles of the store. Please choose pickup, or call us.", true);
        } else if (d && d.error === "address_incomplete") {
          quote = null;
          showQuote("Please check your street, city, and 5-digit ZIP code.", true);
        } else {
          // Inside our area but Uber won't price it: the store contacts the customer with a quote
          quote = { error: "manual", miles: d && d.miles };
          showQuote(M.delivery.manualNote || M.delivery.note, false, true);
        }
        renderTotals();
      })
      .catch(function () { quote = { error: "manual" }; showQuote(M.delivery.manualNote || M.delivery.note, false, true); renderTotals(); });
  }
  // Delivery fee line under the order total
  function renderTotals() {
    var old = cartEl.querySelector(".order-total-delivery");
    if (old) old.remove();
    if (state.mode !== "delivery" || !quote || quote.fee == null || !state.cart.length) return;
    var row = el("p", "order-total order-total-delivery");
    row.appendChild(el("span", null, "Delivery (estimate, up to)"));
    row.appendChild(el("strong", null, money(quote.fee)));
    cartEl.appendChild(row);
  }

  // ---------- send ----------
  function orderNumber() {
    var d = new Date();
    return (M.orderPrefix || "A") + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") +
      "-" + String(Math.floor(Math.random() * 900) + 100);
  }
  function validate() {
    var err = "";
    state.name = $("order-name").value.trim();
    state.phone = $("order-phone").value.trim();
    var a = readAddr();
    save();
    if (!$("order-day").value) err = "Please pick a day.";
    else if (!state.name) err = "Please enter your name.";
    else if (state.phone.replace(/\D/g, "").length < 10) err = "Please enter a phone number we can text.";
    else if (state.mode === "delivery" && !addrComplete(a)) err = $("addr-more").hidden
      ? "Please pick your delivery address from the list, or tap \"Enter city and ZIP yourself\"."
      : "Please enter your delivery street, city, and ZIP code.";
    else if (state.mode === "delivery" && M.delivery.minimumOrder && subtotal() < M.delivery.minimumOrder)
      err = "Delivery orders need at least " + money(M.delivery.minimumOrder) + " of meat. Add more, or choose pickup.";
    else if (state.mode === "delivery" && M.delivery.quoteUrl && !quote) { err = "Checking your delivery estimate. Please try again in a moment."; getQuote(); }
    else if (state.mode === "delivery" && quote && quote.error === "outside_area")
      err = "We can't deliver to this address. Please choose pickup.";
    var e = $("order-error"); e.hidden = !err; e.textContent = err;
    return !err;
  }
  function buildMessage(num) {
    var isDel = state.mode === "delivery", total = 0, allPriced = true;
    var lines = [state.sentNum ? "UPDATED meat order " + num + " (replaces the earlier version)" : "New meat order " + num, ""];
    lines.push((isDel ? "Delivery" : "Pickup") + ": " + $("order-day").value + ", " + $("order-time").value);
    lines.push("Name: " + state.name);
    lines.push("Phone: " + state.phone);
    if (isDel) lines.push("Address: " + state.address);
    if (isDel && quote && quote.miles != null) lines.push("Distance: about " + quote.miles + " miles from the store (straight line)");
    if (isDel && quote && quote.error === "manual") lines.push("** DELIVERY QUOTE NEEDED: outside Uber's area. Contact the customer with a delivery price. **");
    lines.push("");
    state.cart.forEach(function (l, i) {
      var t = lineText(l), cost = lineCost(l);
      if (cost == null) allPriced = false; else total += cost;
      lines.push((i + 1) + ") " + t.item.name + ": " + t.desc + " | " + (lineUnit(l) === "lb" ? fmtQty(l.qty, "lb") : "Qty " + fmtQty(l.qty, "each", t.item)) +
        (cost != null ? " | about " + money(cost) : (itemPrice(t.item, l.picks) != null ? " | " + priceLabel(t.item, l.picks) : "")));
      if (t.custom) lines.push("   Special request: " + t.custom);
    });
    lines.push("");
    var byWeight = state.cart.some(function (l) { return priceUnit(findItem(l.id)) === "lb"; });
    var fee = isDel && quote && quote.fee != null ? quote.fee : null;
    if (fee != null) lines.push("Delivery estimate shown: up to " + money(fee) +
      (quote.uberFee != null ? " (Uber quote " + money(quote.uberFee) + (quote.quoteId ? " [" + quote.quoteId + "]" : "") + ")" : ""));
    if (total > 0) lines.push((byWeight ? "Estimated total: " : "Total: ") + (allPriced ? "" : "at least ") + money(total + (fee || 0)) +
      (isDel ? (fee != null ? " incl. delivery" : " + delivery") : "") + (byWeight ? " (final price by weight)" : ""));
    var notes = $("order-notes").value.trim();
    if (notes) lines.push("Notes: " + notes);
    return lines.join("\n");
  }
  function currentNum() { return state.sentNum || submitNum || (submitNum = orderNumber()); }
  function markSent(num) { state.sentNum = num; state.sentAt = Date.now(); submitNum = null; save(); }
  function send(channel) {
    if (!validate()) return;
    var isUpdate = !!state.sentNum, num = currentNum(), msg = buildMessage(num), url;
    if (channel === "whatsapp") url = "https://wa.me/" + S.store.whatsappNumber + "?text=" + encodeURIComponent(msg);
    else url = "sms:+" + (M.textNumber || S.store.whatsappNumber) + "?&body=" + encodeURIComponent(msg);
    var data = orderData(num, channel); data.update = isUpdate;
    logOrder(data);
    markSent(num);
    window.location.href = url;
    showDone(num, channel, isUpdate);
  }
  // "Submit order": works on any device. Sends the order to /api/order, which saves it
  // to the store's Google Sheet and emails it to the store (see functions/api/order.js).
  function submitOrder() {
    if (!validate()) return;
    showReview();
  }
  // "Check your order" screen before anything is sent
  var reviewEl = el("div", "order-review"); reviewEl.hidden = true;
  doneEl.parentNode.insertBefore(reviewEl, doneEl);
  function showReview() {
    var isUpdate = !!state.sentNum, num = currentNum();
    reviewEl.textContent = "";
    reviewEl.appendChild(el("h2", null, isUpdate ? "Check your changes" : "Check your order"));
    reviewEl.appendChild(el("p", null, isUpdate
      ? "This replaces order " + num + ". Make sure everything looks right, then send the update."
      : "Make sure everything looks right, then send it to our meat counter."));
    var text = buildMessage(num).split("\n").slice(2).join("\n").replace(/\*\* DELIVERY QUOTE NEEDED[^\n]*\n?/, "");
    reviewEl.appendChild(el("pre", "order-review-text", text));
    var errBox = el("p", "order-error"); errBox.hidden = true; errBox.setAttribute("role", "alert");
    reviewEl.appendChild(errBox);
    var ok = el("button", "btn btn-primary order-submit", isUpdate ? "Send updated order" : "Send order"); ok.type = "button";
    ok.addEventListener("click", function () { doSubmit(num, isUpdate, ok, errBox); });
    var edit = el("button", "order-link-btn", "Go back and edit"); edit.type = "button";
    edit.addEventListener("click", function () { reviewEl.hidden = true; form.hidden = false; cartEl.hidden = false; form.scrollIntoView({ block: "start" }); });
    reviewEl.appendChild(ok); reviewEl.appendChild(edit);
    reviewEl.hidden = false; form.hidden = true; cartEl.hidden = true;
    reviewEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // Sends the order to /api/order, which saves it to the store's Google Sheet and
  // emails it to the store (see functions/api/order.js).
  function doSubmit(num, isUpdate, btn, errBox) {
    if (btn.disabled) return;
    var data = orderData(num, "website");
    data.update = isUpdate;
    data.message = buildMessage(num);
    data.website = $("order-website").value;           // hidden field; people leave it empty
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = isUpdate ? "Sending your update…" : "Sending your order…";
    fetch(M.submitUrl || "/api/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (d) {
        if (d && d.ok) { markSent(num); reviewEl.hidden = true; showDone(num, "website", isUpdate); return; }
        throw new Error((d && d.error) || "failed");
      })
      .catch(function (e) {
        errBox.textContent = String(e && e.message) === "too_many"
          ? "You've sent several orders in a short time. Please call us at " + S.store.phoneDisplay + " to change your order."
          : "Sorry, we couldn't send your order. Please try again, or call us at " + S.store.phoneDisplay + ".";
        errBox.hidden = false;
        btn.disabled = false; btn.textContent = label;
      });
  }
  function updateSendLabels() {
    $("send-website").textContent = state.sentNum ? "Review updated order" : "Submit order";
  }
  var submitNum = null;

  // Save a copy of the order to the store's Google Sheet (see backend/README.md)
  function orderData(num, channel) {
    var src = "";
    try { src = sessionStorage.getItem("alamin-source") || ""; } catch (e) { /* ignore */ }
    var total = 0, allPriced = true;
    var items = state.cart.map(function (l) {
      var t = lineText(l), cost = lineCost(l), cat = "";
      M.categories.forEach(function (c) { (c.items || []).forEach(function (it) { if (it.id === l.id) cat = c.name; }); });
      if (cost == null) allPriced = false; else total += cost;
      return {
        category: cat, item: t.item.name, choices: t.desc, special: t.custom,
        qty: l.qty, unit: lineUnit(l) === "lb" ? "lb" : "count",
        price: itemPrice(t.item, l.picks), priceUnit: priceUnit(t.item),
        estimate: cost != null ? Math.round(cost * 100) / 100 : ""
      };
    });
    var data = {
      version: 1,
      orderNumber: num,
      sentAt: new Date().toISOString(),
      channel: channel === "whatsapp" ? "WhatsApp" : channel === "website" ? "Website" : "Text",
      mode: state.mode,
      day: $("order-day").value,
      date: ($("order-day").selectedOptions[0] || {}).getAttribute ? $("order-day").selectedOptions[0].getAttribute("data-date") : "",
      time: $("order-time").value,
      name: state.name,
      phone: state.phone,
      address: state.mode === "delivery" ? state.address + (quote && quote.miles != null ? " [" + quote.miles + " mi]" : "") +
        (quote && quote.fee != null ? " (delivery estimate up to " + money(quote.fee) + (quote.uberFee != null ? ", Uber " + money(quote.uberFee) : "") + ")" : "") : "",
      notes: $("order-notes").value.trim(),
      marketingOptIn: $("order-optin").checked,
      optInText: $("order-optin").checked ? $("order-optin").parentNode.textContent.replace(/\s+/g, " ").trim() : "",
      estimatedTotal: total ? Math.round(total * 100) / 100 : "",
      allPriced: allPriced,
      itemCount: items.length,
      items: items,
      source: src,
      device: isPhone ? "Phone" : "Computer"
    };
    return data;
  }
  function logOrder(data) {
    if (!M.orderLogUrl) return;
    var body = JSON.stringify(data);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(M.orderLogUrl, new Blob([body], { type: "text/plain" }))) return;
    } catch (e) { /* fall through */ }
    try { fetch(M.orderLogUrl, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain" }, body: body }); } catch (e) { /* ignore */ }
  }

  function showDone(num, channel, isUpdate) {
    doneEl.textContent = "";
    if (channel === "website" && isUpdate) {
      doneEl.appendChild(el("h2", null, "Order updated. Thank you!"));
      doneEl.appendChild(el("p", null, "We've sent your changes to our meat counter. Your order number is still " + num + "."));
      doneEl.appendChild(el("p", null, "We'll text or call you at " + state.phone + " to confirm."));
      doneEl.appendChild(el("p", "order-fineprint", "Questions? Call us at " + S.store.phoneDisplay + "."));
    } else if (channel === "website") {
      doneEl.appendChild(el("h2", null, "Order received. Thank you!"));
      doneEl.appendChild(el("p", null, "Your order number is " + num + ". It's on its way to our meat counter."));
      doneEl.appendChild(el("p", null, "We'll text or call you at " + state.phone + " to confirm your " +
        (state.mode === "delivery" ? "delivery time and delivery cost" : "pickup time") + ", your final total, and a payment link."));
      doneEl.appendChild(el("p", "order-fineprint", "Questions? Call us at " + S.store.phoneDisplay + "."));
    } else {
      doneEl.appendChild(el("h2", null, "Almost done!"));
      doneEl.appendChild(el("p", null, "Your order " + num + " should now be open in " +
        (channel === "whatsapp" ? "WhatsApp" : "Messages") + ". Press send there to place it."));
      doneEl.appendChild(el("p", null, "We'll text you back with your " +
        (state.mode === "delivery" ? "delivery time" : "pickup time") + ", final total, and a payment link."));
    }
    var again = el("button", "btn btn-cream", "Start a new order"); again.type = "button";
    again.addEventListener("click", function () {
      state.cart = []; state.sentNum = null; state.sentAt = null; submitNum = null; save(); updateSendLabels();
      doneEl.hidden = true; cartEl.hidden = false; renderCart(); window.scrollTo(0, 0);
    });
    var back = el("button", "order-link-btn", "Change this order"); back.type = "button";
    back.addEventListener("click", function () { updateSendLabels(); doneEl.hidden = true; form.hidden = false; cartEl.hidden = false; form.scrollIntoView({ block: "start" }); });
    doneEl.appendChild(again); doneEl.appendChild(back);
    doneEl.hidden = false; form.hidden = true; cartEl.hidden = true;
    doneEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- address suggestions while typing (see functions/api/address-suggest.js) ----------
  function setupSuggest() {
    var input = $("addr-street"), list = $("addr-suggest");
    if (!input || !list || !M.delivery || !M.delivery.suggestUrl) return;
    var timer = null, items = [], active = -1, lastQ = "", seq = 0, picked = false;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", "addr-suggest");
    input.setAttribute("autocomplete", "off");   // our list replaces the browser's own suggestions here

    function close() {
      list.hidden = true; list.textContent = ""; items = []; active = -1;
      input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
    }
    function highlight(i) {
      active = i;
      [].forEach.call(list.querySelectorAll('[role="option"]'), function (li, n) {
        li.setAttribute("aria-selected", n === i ? "true" : "false");
        if (n === i) { input.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); }
      });
    }
    function pick(r) {
      input.value = r.street;
      if (r.city) $("addr-city").value = r.city;
      if (r.zip) $("addr-zip").value = r.zip;
      state.addrGeo = (r.lat != null && r.lon != null) ? { lat: r.lat, lon: r.lon } : null;
      close(); clearQuote(); readAddr(); save();
      if (!r.zip || !r.city) { showManual(true); $(r.city ? "addr-zip" : "addr-city").focus(); return; }
      picked = true; showManual(false); showPicked(r.city, r.zip);
      $("addr-unit").focus();
      getQuote();     // show the estimate right away
    }
    function show(results) {
      list.textContent = ""; items = results; active = -1;
      if (!results.length) { close(); return; }
      results.forEach(function (r, i) {
        var li = el("li", "addr-option");
        li.id = "addr-opt-" + i; li.setAttribute("role", "option"); li.setAttribute("aria-selected", "false");
        li.appendChild(el("strong", null, r.street));
        li.appendChild(el("span", null, [r.city, "CA", r.zip].filter(Boolean).join(", ").replace(", CA,", ", CA")));
        li.addEventListener("mousedown", function (e) { e.preventDefault(); pick(r); });
        list.appendChild(li);
      });
      var credit = el("li", "addr-credit", "Address search © OpenStreetMap contributors");
      credit.setAttribute("aria-hidden", "true");
      list.appendChild(credit);
      list.hidden = false; input.setAttribute("aria-expanded", "true");
    }
    function search() {
      var q = input.value.trim();
      if (q.length < 4 || q === lastQ) { if (q.length < 4) close(); return; }
      lastQ = q; var my = ++seq;
      fetch(M.delivery.suggestUrl + "?q=" + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (d) { if (my === seq && document.activeElement === input) show((d && d.results) || []); })
        .catch(function () { /* suggestions are optional; typing still works */ });
    }
    input.addEventListener("input", function () {
      // Typing a new address clears the city and ZIP that came from the last pick
      if (picked || !$("addr-picked").hidden) { picked = false; $("addr-city").value = ""; $("addr-zip").value = ""; $("addr-picked").hidden = true; $("addr-manual").hidden = false; }
      clearTimeout(timer); timer = setTimeout(search, 250);
    });
    input.addEventListener("keydown", function (e) {
      if (list.hidden || !items.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); highlight(active < items.length - 1 ? active + 1 : 0); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active > 0 ? active - 1 : items.length - 1); }
      else if (e.key === "Enter" && active > -1) { e.preventDefault(); pick(items[active]); }
      else if (e.key === "Escape") { close(); }
    });
    input.addEventListener("blur", function () { setTimeout(close, 150); });
  }

  // ---------- start ----------
  $("order-name").value = state.name || "";
  $("order-phone").value = state.phone || "";
  var sa = state.addr || {};
  $("addr-street").value = sa.street || ""; $("addr-unit").value = sa.unit || "";
  $("addr-city").value = sa.city || ""; $("addr-zip").value = sa.zip || "";
  ["addr-street", "addr-unit", "addr-city", "addr-zip"].forEach(function (id) {
    $(id).addEventListener("input", function () { clearQuote(); if (id !== "addr-unit") state.addrGeo = null; });
  });
  setupSuggest();
  $("addr-manual").addEventListener("click", function () { showManual(true); $("addr-city").focus(); });
  $("addr-zip").addEventListener("input", function () { if (/^\d{5}$/.test(this.value.trim()) && addrComplete(readAddr())) getQuote(); });
  // Saved address from a previous visit: show it ready to use
  if (sa.city && sa.zip) { showManual(false); showPicked(sa.city, sa.zip); }
  $("get-quote").addEventListener("click", getQuote);
  $("order-day").addEventListener("change", updateMode);
  $("send-website").addEventListener("click", submitOrder);
  updateSendLabels();
  $("send-whatsapp").addEventListener("click", function () { send("whatsapp"); });
  $("send-text").addEventListener("click", function () { send("text"); });
  // WhatsApp and text links only work well on phones, so offer them there only.
  // Computers (and anyone else) use "Submit order".
  if (isPhone) { $("send-or").hidden = false; $("send-apps").hidden = false; $("apps-fineprint").hidden = false; }
  renderCats(); renderItems(); renderModes(); renderCart();
})();
