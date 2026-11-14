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
  // "Request an item": something not on the menu, priced by the store
  var REQUEST_ITEM = { id: "request", name: "Item request", priceUnit: "each", unit: "each", choices: [], price: null };
  var FAV_KEY = "alamin-favs", LAST_KEY = "alamin-last-order";
  var favs = [];
  try { favs = JSON.parse(localStorage.getItem(FAV_KEY) || "[]") || []; } catch (e) { favs = []; }
  function saveFavs() { try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) { /* ignore */ } }
  function categoryOf(id) {
    for (var c = 0; c < M.categories.length; c++) if ((M.categories[c].items || []).some(function (it) { return it.id === id; })) return M.categories[c];
    return null;
  }
  function findItem(id) {
    if (id === "request") return REQUEST_ITEM;
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
      state.cart.forEach(function (l) { l.uid = l.uid || Math.random().toString(36).slice(2); });
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
  var FAV_CAT = { id: "favorites", name: "Favorites", items: [] };
  var STAR = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20.5l-1.3-1.2C6 15.1 3 12.4 3 8.9 3 6.2 5.1 4 7.8 4c1.6 0 3.1.8 4.2 2 1.1-1.2 2.6-2 4.2-2C18.9 4 21 6.2 21 8.9c0 3.5-3 6.2-7.7 10.4z"/></svg>';
  function catList() {
    FAV_CAT.items = favs.map(findItem).filter(function (it) { return it && it.id !== "request"; });
    return (FAV_CAT.items.length ? [FAV_CAT] : []).concat(M.categories);
  }
  function renderCats() {
    var keep = catList()[activeCat];
    catsEl.textContent = ""; catTabs = [];
    catList().forEach(function (cat, i) {
      var b = el("button", "order-cat" + (cat === FAV_CAT ? " order-cat-fav" : ""));
      b.innerHTML = cat === FAV_CAT ? STAR : icon(cat.id);
      b.appendChild(el("span", null, cat.name));
      b.type = "button"; b.setAttribute("role", "tab");
      b.addEventListener("click", function () { activeCat = i; updateCats(); renderItems(); });
      catsEl.appendChild(b); catTabs.push(b);
    });
    var idx = catList().indexOf(keep); activeCat = idx > -1 ? idx : 0;
    catsEl.hidden = catList().length < 2;
    updateCats();
  }
  function updateCats() {
    catTabs.forEach(function (b, i) { b.setAttribute("aria-selected", i === activeCat ? "true" : "false"); });
  }
  function currentCat() { return catList()[activeCat] || M.categories[0]; }

  function renderItems() {
    itemsEl.textContent = "";
    var cat = currentCat();
    if (cat === FAV_CAT) itemsEl.appendChild(el("p", "order-cat-note", "Your favorites are saved on this device. Tap the heart on any item to add or remove it."));
    else if (cat.note) itemsEl.appendChild(el("p", "order-cat-note", cat.note));
    (cat.items || []).forEach(function (item) { itemsEl.appendChild(itemCard(item)); });
    itemsEl.appendChild(requestCard());
  }

  var DAY_FULL = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };
  function daysShort(days) { return days.join(" & ") + " only"; }
  function itemCard(item) {
    var card = el("article", "order-item");
    card.setAttribute("data-item", item.id);
    var head = el("button", "order-item-head");
    head.type = "button"; head.setAttribute("aria-expanded", "false");
    var thumb = el("span", "order-thumb");
    if (item.image) {
      var img = document.createElement("img");
      img.src = (document.documentElement.getAttribute("data-root") || "") + item.image; img.alt = ""; img.loading = "lazy"; img.width = 72; img.height = 72;
      thumb.appendChild(img);
    } else { var c = categoryOf(item.id); thumb.innerHTML = icon(c ? c.id : ""); thumb.classList.add("order-thumb-icon"); }
    head.appendChild(thumb);
    var main = el("span", "order-item-main");
    main.appendChild(el("span", "order-item-name", item.name));
    if (item.note) main.appendChild(el("span", "order-item-sub", item.note));
    var tags = el("span", "order-item-tags");
    tags.appendChild(el("span", "order-item-price", priceLabel(item)));
    if (item.days && item.days.length) tags.appendChild(el("span", "order-badge-days", daysShort(item.days)));
    main.appendChild(tags);
    head.appendChild(main);
    head.appendChild(el("span", "order-item-plus", "+"));
    var fav = el("button", "order-fav");
    fav.type = "button"; fav.innerHTML = STAR;
    function syncFav() {
      var on = favs.indexOf(item.id) > -1;
      fav.setAttribute("aria-pressed", on ? "true" : "false");
      fav.setAttribute("aria-label", (on ? "Remove " : "Save ") + item.name + (on ? " from favorites" : " to favorites"));
    }
    syncFav();
    fav.addEventListener("click", function (e) {
      e.stopPropagation();
      var i = favs.indexOf(item.id);
      if (i > -1) favs.splice(i, 1); else favs.push(item.id);
      saveFavs(); syncFav();
      toast(i > -1 ? "Removed from favorites" : "Saved to favorites");
      var wasFav = currentCat() === FAV_CAT;
      renderCats();
      if (wasFav) renderItems();
    });
    var body = el("div", "order-item-body"); body.hidden = true;
    head.addEventListener("click", function () { openItem(item, card); });
    card.appendChild(head); card.appendChild(fav); card.appendChild(body);
    return card;
  }
  // Open one item's options (closing any other); "line" = cart line being edited
  function openItem(item, card, line, lineIndex) {
    var body = card.querySelector(".order-item-body"), head = card.querySelector(".order-item-head");
    var open = body.hidden || line;
    itemsEl.querySelectorAll(".order-item-body").forEach(function (b) { b.hidden = true; });
    itemsEl.querySelectorAll(".order-item-head").forEach(function (h) { h.setAttribute("aria-expanded", "false"); });
    itemsEl.querySelectorAll(".order-item").forEach(function (c) { c.classList.remove("is-open"); });
    if (open) {
      body.hidden = false; head.setAttribute("aria-expanded", "true"); card.classList.add("is-open");
      buildPicker(item, body, line, lineIndex);
    }
  }

  // "Don't see it? Request an item" — added to the order as a line the store prices
  function requestCard() {
    var card = el("div", "order-request");
    var openBtn = el("button", "order-request-open", "Don't see what you need? Request an item");
    openBtn.type = "button";
    var box = el("div", "order-request-box"); box.hidden = true;
    var lab = el("label", "order-field", "What would you like, and how much?");
    var ta = document.createElement("textarea"); ta.rows = 2; ta.maxLength = 200;
    ta.placeholder = "Example: 3 lb goat liver, cut small";
    lab.appendChild(ta); box.appendChild(lab);
    box.appendChild(el("p", "order-request-note", "We'll check availability and price, and confirm with you before you pay."));
    var add = el("button", "btn btn-primary order-add", "Add request to my order"); add.type = "button";
    add.addEventListener("click", function () {
      var v = ta.value.trim();
      if (v.length < 3) { ta.focus(); ta.setAttribute("aria-invalid", "true"); return; }
      state.cart.push({ uid: Math.random().toString(36).slice(2), id: "request", picks: {}, qty: 1, unit: "each", custom: v });
      save(); renderCart(); ta.value = ""; box.hidden = true; openBtn.hidden = false;
      toast("Request added to your order");
    });
    ta.addEventListener("input", function () { ta.removeAttribute("aria-invalid"); });
    box.appendChild(add);
    openBtn.addEventListener("click", function () { openBtn.hidden = true; box.hidden = false; ta.focus(); });
    card.appendChild(openBtn); card.appendChild(box);
    return card;
  }

  // Small message at the bottom of the screen ("Added to your order")
  var toastEl = el("div", "order-toast"); toastEl.setAttribute("role", "status"); toastEl.setAttribute("aria-live", "polite");
  document.body.appendChild(toastEl);
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("is-on");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2200);
  }

  var Q_LABELS = { Cut: "How should we cut it?", Skin: "Skin on or off?", Fat: "With or without fat?", Type: "Which type?", "BBQ cut": "BBQ cut?" };
  function buildPicker(item, body, line, lineIndex) {
    var picked = line ? Object.assign({}, line.picks) : {}, qty = line ? line.qty : (item.min || 1), custom = line ? (line.custom || "") : "";
    var units = item.units && item.units.length ? item.units : [item.unit];
    var unit = line && line.unit ? line.unit : units[0];
    var step = item.step || 1, min = item.min || step;
    function draw() {
      body.textContent = "";
      if (item.days && item.days.length) body.appendChild(el("p", "order-item-days", "Available for " + item.days.map(function (d) { return DAY_FULL[d] || d; }).join(" and ") + " pickup or delivery only"));
      (item.choices || []).forEach(function (q) {
        var opts = optionsFor(item, q, picked);
        if (picked[q] && opts.indexOf(picked[q]) === -1) delete picked[q];
        if (opts.length === 1) picked[q] = opts[0];
        // Only one possible answer (and it's not the first question): no need to ask
        if (opts.length === 1 && (item.choices || []).indexOf(q) > 0) return;
        var group = el("div", "order-q");
        group.appendChild(el("p", "order-q-label", Q_LABELS[q] || q));
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
      qlab.appendChild(el("p", "order-q-label", units.length > 1 ? "Order by" : (unit === "lb" ? "How many pounds?" : "How many?")));
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
        pg.appendChild(el("p", "order-q-label", "How should we pack it?"));
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
      cl.appendChild(document.createTextNode("Special instructions (optional)"));
      var ct = document.createElement("textarea");
      ct.rows = 2; ct.maxLength = 200; ct.value = custom;
      ct.placeholder = "Example: 10 pieces, curry size, 1.5 lb packs";
      ct.addEventListener("input", function () { custom = ct.value; });
      cl.appendChild(ct);
      body.appendChild(cl);

      var ready = (item.choices || []).every(function (q) { return picked[q]; });
      // Live estimate for this item
      var est = ready ? lineCost({ id: item.id, picks: picked, qty: qty, unit: unit }) : null;
      var estEl = el("p", "order-item-est");
      if (est != null) {
        estEl.appendChild(el("span", null, priceUnit(item) === "lb" ? "Estimated price" : "Price"));
        estEl.appendChild(el("strong", null, money(est)));
      } else if (ready) estEl.appendChild(el("span", null, "Priced by weight at the store"));
      if (estEl.childNodes.length) body.appendChild(estEl);
      var editing = !!line;
      var add = el("button", "btn btn-primary order-add", ready ? (editing ? "Save changes" : "Add to order") + (est != null ? " · " + money(est) : "") : "Choose: " + (Q_LABELS[firstMissing()] || firstMissing()).replace(/\?$/, "").toLowerCase());
      add.type = "button"; add.disabled = !ready;
      add.addEventListener("click", function () {
        var newLine = { uid: line ? line.uid : Math.random().toString(36).slice(2), id: item.id, picks: Object.assign({}, picked), qty: qty, unit: unit, custom: custom.trim() };
        var idx = editing ? state.cart.findIndex(function (l) { return l.uid === line.uid; }) : -1;
        if (idx > -1) state.cart[idx] = newLine; else state.cart.push(newLine);
        save(); renderCart();
        toast(editing ? "Item updated" : "Added to your order");
        body.hidden = true; body.parentNode.classList.remove("is-open");
        body.parentNode.querySelector(".order-item-head").setAttribute("aria-expanded", "false");
        if (editing) { var sm = document.querySelector(".order-summary"); if (sm) sm.scrollIntoView({ behavior: "smooth", block: "start" }); }
      });
      body.appendChild(add);
      if (editing) {
        var cancel = el("button", "order-link-btn order-cancel-edit", "Cancel"); cancel.type = "button";
        cancel.addEventListener("click", function () { body.hidden = true; body.parentNode.classList.remove("is-open"); });
        body.appendChild(cancel);
      }
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
    if (l.id === "request") return { item: item, desc: l.custom || "", custom: "" };
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

  function cartTotals() {
    var total = 0, allPriced = true, count = 0;
    state.cart.forEach(function (l) { var c = lineCost(l); count++; if (c == null) allPriced = false; else total += c; });
    return { total: total, allPriced: allPriced, count: count };
  }
  function stepOf(l) { var it = findItem(l.id); return it.step || 1; }
  function minOf(l) { var it = findItem(l.id); return it.min || it.step || 1; }

  function renderCart() {
    cartEl.textContent = "";
    if (!state.cart.length) {
      cartEl.appendChild(el("p", "order-empty", "Your order is empty. Choose a meat to get started."));
      var last = lastOrder();
      if (last) cartEl.appendChild(reorderCard(last));
      form.hidden = true;
      updateBar(); setStep(1);
      return;
    }
    var ul = el("ul", "order-lines");
    state.cart.forEach(function (l, i) {
      var t = lineText(l), cost = lineCost(l), isReq = l.id === "request";
      var li = el("li", "order-line");
      var top = el("div", "order-line-top");
      top.appendChild(el("span", "order-line-name", isReq ? "Item request" : t.item.name));
      top.appendChild(el("span", "order-line-cost", cost != null ? money(cost) : isReq ? "We'll price it" : (itemPrice(t.item, l.picks) != null ? priceLabel(t.item, l.picks) : "")));
      li.appendChild(top);
      if (t.desc) li.appendChild(el("span", "order-line-desc", t.desc));
      if (t.custom) li.appendChild(el("span", "order-line-desc order-line-custom", "Special instructions: " + t.custom));
      var ctl = el("div", "order-line-ctl");
      if (!isReq) {
        var lb = lineUnit(l) === "lb";
        var st = el("div", "order-stepper order-stepper-sm");
        var minus = el("button", "order-step-btn", "−"); minus.type = "button"; minus.setAttribute("aria-label", "Less " + t.item.name);
        var val = el("span", "order-step-val", lb ? fmtQty(l.qty, "lb") : fmtQty(l.qty, "each", t.item));
        var plus = el("button", "order-step-btn", "+"); plus.type = "button"; plus.setAttribute("aria-label", "More " + t.item.name);
        minus.disabled = l.qty <= minOf(l);
        minus.addEventListener("click", function () { l.qty = Math.max(minOf(l), Math.round((l.qty - stepOf(l)) * 100) / 100); save(); renderCart(); });
        plus.addEventListener("click", function () { l.qty = Math.round((l.qty + stepOf(l)) * 100) / 100; save(); renderCart(); });
        st.appendChild(minus); st.appendChild(val); st.appendChild(plus);
        ctl.appendChild(st);
        var ed = el("button", "order-line-act", "Edit"); ed.type = "button";
        ed.setAttribute("aria-label", "Edit " + t.item.name);
        ed.addEventListener("click", function () { editLine(l, i); });
        ctl.appendChild(ed);
      }
      var rm = el("button", "order-line-act order-line-rm", "Remove"); rm.type = "button";
      rm.setAttribute("aria-label", "Remove " + (isReq ? "item request" : t.item.name));
      rm.addEventListener("click", function () {
        var removed = state.cart.splice(i, 1)[0]; save(); renderCart();
        toastUndo((isReq ? "Request" : t.item.name) + " removed", function () { state.cart.splice(i, 0, removed); save(); renderCart(); });
      });
      ctl.appendChild(rm);
      li.appendChild(ctl);
      ul.appendChild(li);
    });
    cartEl.appendChild(ul);
    var T = cartTotals();
    var tot = el("p", "order-total");
    tot.appendChild(el("span", null, "Estimated total"));
    tot.appendChild(el("strong", null, T.allPriced ? money(T.total) : T.total > 0 ? "From " + money(T.total) : "We'll price it"));
    cartEl.appendChild(tot);
    cartEl.appendChild(el("p", "order-weight-note", "Meat is sold by weight. Your final price is based on the actual weight when we cut your order. We'll confirm it with you before you pay."));
    form.hidden = false;
    renderDays();
    renderTotals();
    updateBar();
    setStep(2);
  }

  // Edit a cart line: open that item's options with the current choices filled in
  function editLine(l, i) {
    var cat = categoryOf(l.id), list = catList();
    var ci = list.indexOf(cat);
    if (ci > -1 && list[activeCat] !== cat && !(list[activeCat] === FAV_CAT && favs.indexOf(l.id) > -1)) { activeCat = ci; updateCats(); renderItems(); }
    var card = itemsEl.querySelector('[data-item="' + l.id + '"]');
    if (!card) return;
    openItem(findItem(l.id), card, l, i);
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toastUndo(msg, undo) {
    toastEl.textContent = msg + " ";
    var u = el("button", "order-toast-undo", "Undo"); u.type = "button";
    u.addEventListener("click", function () { undo(); toastEl.classList.remove("is-on"); });
    toastEl.appendChild(u); toastEl.classList.add("is-on");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 5000);
  }

  // ---------- order again ----------
  function lastOrder() {
    try {
      var d = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
      if (!d || !Array.isArray(d.cart)) return null;
      var cart = d.cart.filter(function (l) { var it = findItem(l.id); return it && (it.choices || []).every(function (q) { return l.picks && l.picks[q]; }); });
      return cart.length ? { cart: cart, at: d.at, num: d.num } : null;
    } catch (e) { return null; }
  }
  function reorderCard(last) {
    var box = el("div", "order-again");
    box.appendChild(el("p", "order-again-title", "Order again"));
    var when = last.at ? new Date(last.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
    box.appendChild(el("p", "order-again-sub", "Your last order" + (when ? " (" + when + ")" : "") + ":"));
    var ul = el("ul", "order-again-list");
    last.cart.slice(0, 4).forEach(function (l) {
      var t = lineText(l);
      ul.appendChild(el("li", null, (l.id === "request" ? "Request: " + t.desc : (lineUnit(l) === "lb" ? fmtQty(l.qty, "lb") + " " : l.qty + " × ") + t.item.name)));
    });
    if (last.cart.length > 4) ul.appendChild(el("li", null, "+ " + (last.cart.length - 4) + " more"));
    box.appendChild(ul);
    var b = el("button", "btn btn-cream order-again-btn", "Add these items to my order"); b.type = "button";
    b.addEventListener("click", function () {
      state.cart = last.cart.map(function (l) { return Object.assign({}, l, { uid: Math.random().toString(36).slice(2) }); });
      save(); renderCart(); toast("Items added. You can change anything before sending.");
    });
    box.appendChild(b);
    return box;
  }

  // ---------- sticky "View order" bar on phones ----------
  var bar = el("div", "cart-bar"); bar.hidden = true;
  var barBtn = el("button", "cart-bar-btn"); barBtn.type = "button";
  bar.appendChild(barBtn);
  document.body.appendChild(bar);
  var summaryEl = document.querySelector(".order-summary"), summaryVisible = false;
  barBtn.addEventListener("click", function () { summaryEl.scrollIntoView({ behavior: "smooth", block: "start" }); });
  if ("IntersectionObserver" in window && summaryEl) {
    new IntersectionObserver(function (es) { summaryVisible = es[0].isIntersecting; updateBar(); }, { rootMargin: "0px 0px -35% 0px" }).observe(summaryEl);
  }
  function updateBar() {
    var T = cartTotals();
    var show = T.count > 0 && !summaryVisible && reviewHidden() && doneEl.hidden;
    bar.hidden = !show;
    document.body.classList.toggle("has-cart-bar", show);
    barBtn.textContent = "";
    barBtn.appendChild(el("span", "cart-bar-count", String(T.count)));
    barBtn.appendChild(el("span", "cart-bar-label", "View order"));
    barBtn.appendChild(el("span", "cart-bar-total", T.allPriced ? money(T.total) : T.total > 0 ? "From " + money(T.total) : ""));
  }
  function reviewHidden() { return typeof reviewEl === "undefined" || reviewEl.hidden; }

  // ---------- progress: Choose → Your details → Review → Done ----------
  var progEl = $("order-progress");
  function setStep(n) {
    if (!progEl) return;
    [].forEach.call(progEl.children, function (li, i) {
      li.classList.toggle("is-done", i + 1 < n);
      li.classList.toggle("is-current", i + 1 === n);
      if (i + 1 === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
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
      r.addEventListener("change", function () { state.mode = m.id; save(); renderDays(); });
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
    var opt = $("order-day").selectedOptions && $("order-day").selectedOptions[0];
    var iso = opt && opt.getAttribute("data-date");
    var times = [];
    if (iso) {
      var parts = iso.split("-"), day = new Date(+parts[0], +parts[1] - 1, +parts[2]), n = storeNow();
      times = windowsFor(state.mode, day, day.toDateString() === new Date(n.getFullYear(), n.getMonth(), n.getDate()).toDateString());
    }
    var sel = $("order-time"), prev = sel.value;
    sel.textContent = "";
    times.forEach(function (t) { var o = el("option", null, t); o.value = t; sel.appendChild(o); });
    if (times.indexOf(prev) > -1) sel.value = prev;
  }

  function isoDate(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  // Store time (Los Angeles), whatever time zone the customer's device is in
  function storeNow() {
    try { return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })); }
    catch (e) { return new Date(); }
  }
  // Time windows for a day; for today, only windows ending at least 1 hour from now
  function windowsFor(mode, d, isToday) {
    var cfg = (mode === "delivery" ? M.delivery : M.pickup) || {};
    var list = (d.getDay() === 5 && cfg.fridayTimes) ? cfg.fridayTimes : (cfg.times || []);
    if (!isToday) return list.slice();
    var now = storeNow(), mins = now.getHours() * 60 + now.getMinutes();
    return list.filter(function (t) {
      var m = t.match(/(\d{1,2})(?::(\d\d))?\s*(AM|PM)\s*$/i);
      if (!m) return true;
      var h = (+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0);
      return h * 60 + (+m[2] || 0) - 60 >= mins;
    });
  }
  function renderDays() {
    var sel = $("order-day"), prev = sel.value;
    sel.textContent = "";
    var need = [];
    state.cart.forEach(function (l) { var it = findItem(l.id); if (it.days && it.days.length) need.push(it.days); });
    var now = storeNow();
    for (var i = 0; i <= (M.daysAhead || 7); i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      var dn = DAY_NAMES[d.getDay()];
      if (!windowsFor(state.mode, d, i === 0).length) continue;     // e.g. today after 6 PM
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
    var err = "", field = null;
    state.name = $("order-name").value.trim();
    state.phone = $("order-phone").value.trim();
    var a = readAddr(), digits = state.phone.replace(/\D/g, "");
    save();
    ["order-name", "order-phone", "addr-street", "addr-city", "addr-zip"].forEach(function (id) { $(id).removeAttribute("aria-invalid"); });
    if (!$("order-day").value) { err = "Please pick a day."; field = "order-day"; }
    else if (!state.name) { err = "Please enter your name."; field = "order-name"; }
    else if (digits.length < 10 || digits.length > 11 || (digits.length === 11 && digits[0] !== "1")) { err = "Please enter a 10-digit phone number we can text, like (310) 555-0123."; field = "order-phone"; }
    else if (state.mode === "delivery" && !addrComplete(a)) {
      if ($("addr-more").hidden) { err = "Please start typing your delivery address and pick it from the list, or tap \"Enter city and ZIP yourself\"."; field = "addr-street"; }
      else { err = "Please enter your delivery street, city, and 5-digit ZIP code."; field = a.street.length < 4 ? "addr-street" : a.city.length < 2 ? "addr-city" : "addr-zip"; }
    }
    else if (state.mode === "delivery" && M.delivery.minimumOrder && subtotal() < M.delivery.minimumOrder)
      err = "Delivery orders need at least " + money(M.delivery.minimumOrder) + " of meat. You have about " + money(subtotal()) + ". Add more, or choose pickup.";
    else if (state.mode === "delivery" && M.delivery.quoteUrl && !quote) { err = "Checking your delivery estimate. Please try again in a moment."; getQuote(); }
    else if (state.mode === "delivery" && quote && quote.error === "outside_area")
      err = "We can't deliver to this address. Please choose pickup.";
    var e = $("order-error"); e.hidden = !err; e.textContent = err;
    if (field) { var f = $(field); f.setAttribute("aria-invalid", "true"); f.focus({ preventScroll: true }); f.scrollIntoView({ behavior: "smooth", block: "center" }); }
    else if (err) e.scrollIntoView({ behavior: "smooth", block: "center" });
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
      if (l.id === "request") { lines.push((i + 1) + ") ITEM REQUEST (please check availability and price): " + t.desc); return; }
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
  function markSent(num) {
    state.sentNum = num; state.sentAt = Date.now(); submitNum = null; save();
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ cart: state.cart, at: Date.now(), num: num })); } catch (e) { /* ignore */ }
  }
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
    var isUpdate = !!state.sentNum, num = currentNum(), isDel = state.mode === "delivery";
    reviewEl.textContent = "";

    var head = el("div", "rv-head");
    head.appendChild(el("h2", null, isUpdate ? "Review your changes" : "Review your order"));
    head.appendChild(el("span", "rv-num", "Order " + num));
    reviewEl.appendChild(head);
    if (isUpdate) reviewEl.appendChild(el("p", "rv-update", "This will replace the order you sent earlier. Your order number stays the same."));

    // Pickup / delivery details
    var when = el("div", "rv-card rv-when");
    when.appendChild(el("p", "rv-label", isDel ? "Delivery" : "Pickup at the store"));
    when.appendChild(el("p", "rv-strong", $("order-day").value + ", " + $("order-time").value));
    if (isDel) when.appendChild(el("p", null, state.address));
    else when.appendChild(el("p", null, S.store.street + ", " + S.store.city + ", " + S.store.state + " " + S.store.zip));
    when.appendChild(el("p", "rv-muted", state.name + " · " + state.phone));
    reviewEl.appendChild(when);

    // Items
    var list = el("ul", "rv-items"), total = 0, allPriced = true, byWeight = false;
    state.cart.forEach(function (l) {
      var t = lineText(l), cost = lineCost(l), lb = lineUnit(l) === "lb";
      if (priceUnit(findItem(l.id)) === "lb") byWeight = true;
      if (cost == null) allPriced = false; else total += cost;
      var li = el("li", "rv-item");
      var left = el("div", "rv-item-main");
      left.appendChild(el("p", "rv-item-name", t.item.name));
      if (t.desc) left.appendChild(el("p", "rv-item-opts", t.desc));
      if (t.custom) left.appendChild(el("p", "rv-item-opts", "Special request: " + t.custom));
      var right = el("div", "rv-item-side");
      right.appendChild(el("p", "rv-item-qty", lb ? fmtQty(l.qty, "lb") : fmtQty(l.qty, "each", t.item)));
      right.appendChild(el("p", "rv-item-price", cost != null ? (priceUnit(t.item) === "lb" ? "about " : "") + money(cost) : "Priced at the store"));
      li.appendChild(left); li.appendChild(right); list.appendChild(li);
    });
    reviewEl.appendChild(list);

    // Totals
    var tot = el("div", "rv-totals");
    function row(label, value, cls) { var r = el("p", "rv-row" + (cls ? " " + cls : "")); r.appendChild(el("span", null, label)); r.appendChild(el("strong", null, value)); tot.appendChild(r); }
    var fee = isDel && quote && quote.fee != null ? quote.fee : null;
    row(byWeight ? "Estimated meat total" : "Meat total", (allPriced ? "" : "at least ") + money(total));
    if (isDel) row("Delivery", fee != null ? "up to " + money(fee) : "We'll send you a quote");
    row(byWeight || isDel ? "Estimated total" : "Total", (allPriced ? "" : "at least ") + money(total + (fee || 0)) + (isDel && fee == null ? " + delivery" : ""), "rv-grand");
    reviewEl.appendChild(tot);

    // What happens next
    var next = el("div", "rv-next");
    next.appendChild(el("h3", null, "What happens next"));
    var steps = el("ol", "rv-steps");
    [["We get your order", "It goes straight to our meat counter."],
     ["We cut and weigh it", "Meat is sold by weight, and every cut is a little different, so your final weight and price may be slightly more or less than the estimate."],
     ["We text you to confirm", "You'll get your final total" + (isDel ? ", delivery cost," : "") + " and a payment link at " + state.phone + "."],
     [isDel ? "We deliver it" : "Pick it up", isDel ? "We'll bring it to your door at the time we confirm." : "Come to the counter at your pickup time. Your order will be packed and ready."]
    ].forEach(function (st) { var li = el("li"); li.appendChild(el("strong", null, st[0])); li.appendChild(el("span", null, st[1])); steps.appendChild(li); });
    next.appendChild(steps);
    reviewEl.appendChild(next);

    var errBox = el("p", "order-error"); errBox.hidden = true; errBox.setAttribute("role", "alert");
    reviewEl.appendChild(errBox);
    var ok = el("button", "btn btn-primary order-submit", isUpdate ? "Send updated order" : "Send order"); ok.type = "button";
    ok.addEventListener("click", function () { doSubmit(num, isUpdate, ok, errBox); });
    var edit = el("button", "order-link-btn rv-edit", "Go back and edit"); edit.type = "button";
    edit.addEventListener("click", function () { reviewEl.hidden = true; form.hidden = false; cartEl.hidden = false; setStep(2); updateBar(); form.scrollIntoView({ block: "start" }); });
    reviewEl.appendChild(ok); reviewEl.appendChild(edit);
    reviewEl.appendChild(el("p", "rv-fine", "No payment now. You'll pay once we confirm your final total."));
    reviewEl.hidden = false; form.hidden = true; cartEl.hidden = true;
    setStep(3); updateBar();
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
    if (channel === "website") {
      var when = el("div", "rv-card");
      when.appendChild(el("p", "rv-label", state.mode === "delivery" ? "Delivery" : "Pickup"));
      when.appendChild(el("p", "rv-strong", $("order-day").value + ", " + $("order-time").value));
      when.appendChild(el("p", null, state.mode === "delivery" ? state.address : S.store.street + ", " + S.store.city + ", " + S.store.state + " " + S.store.zip));
      doneEl.insertBefore(when, doneEl.children[2] || null);
    }
    var contact = el("div", "order-done-contact");
    var wa = el("a", "btn btn-whatsapp", "WhatsApp us about this order");
    wa.href = "https://wa.me/" + S.store.whatsappNumber + "?text=" + encodeURIComponent("Hi Super Al-Amin! About my order " + num + ": ");
    wa.target = "_blank"; wa.rel = "noopener";
    var call = el("a", "btn btn-outline", "Call " + S.store.phoneDisplay); call.href = S.store.phoneLink;
    contact.appendChild(wa); contact.appendChild(call);
    doneEl.appendChild(contact);
    var again = el("button", "btn btn-cream", "Start a new order"); again.type = "button";
    again.addEventListener("click", function () {
      state.cart = []; state.sentNum = null; state.sentAt = null; submitNum = null; save(); updateSendLabels();
      doneEl.hidden = true; cartEl.hidden = false; renderCart(); window.scrollTo(0, 0);
    });
    var back = el("button", "order-link-btn", "Change this order"); back.type = "button";
    back.addEventListener("click", function () { updateSendLabels(); doneEl.hidden = true; form.hidden = false; cartEl.hidden = false; setStep(2); updateBar(); form.scrollIntoView({ block: "start" }); });
    doneEl.appendChild(again); doneEl.appendChild(back);
    doneEl.hidden = false; form.hidden = true; cartEl.hidden = true;
    setStep(4); updateBar();
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
  ["order-name", "order-phone", "addr-street", "addr-city", "addr-zip"].forEach(function (id) {
    $(id).addEventListener("input", function () { this.removeAttribute("aria-invalid"); var e = $("order-error"); if (!e.hidden) e.hidden = true; });
  });
  updateSendLabels();
  $("send-whatsapp").addEventListener("click", function () { send("whatsapp"); });
  $("send-text").addEventListener("click", function () { send("text"); });
  // WhatsApp and text links only work well on phones, so offer them there only.
  // Computers (and anyone else) use "Submit order".
  if (isPhone) { $("send-or").hidden = false; $("send-apps").hidden = false; $("apps-fineprint").hidden = false; }
  renderCats(); renderItems(); renderModes(); renderCart();
})();
