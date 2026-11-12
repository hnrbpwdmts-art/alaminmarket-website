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
  function fmtQty(q, unit) {
    var n = (Math.round(q * 100) / 100).toString();
    return unit === "lb" ? n + " lb" : n;
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

  // ---------- saved state ----------
  var state = { cart: [], mode: "pickup", name: "", phone: "", address: "" };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved && Array.isArray(saved.cart)) {
      state = Object.assign(state, saved);
      state.cart = saved.cart.filter(function (l) { return findItem(l.id); });
    }
  } catch (e) { /* storage unavailable */ }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ cart: state.cart, mode: state.mode, name: state.name, phone: state.phone, address: state.address })); } catch (e) { /* ignore */ }
  }

  // ---------- menu ----------
  var activeCat = 0, catTabs = [];
  function renderCats() {
    M.categories.forEach(function (cat, i) {
      var b = el("button", "order-cat", cat.name);
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
    (M.categories[activeCat].items || []).forEach(function (item) { itemsEl.appendChild(itemCard(item)); });
  }

  function itemCard(item) {
    var card = el("article", "order-item");
    var head = el("button", "order-item-head");
    head.type = "button"; head.setAttribute("aria-expanded", "false");
    head.appendChild(el("span", "order-item-name", item.name));
    head.appendChild(el("span", "order-item-price",
      item.price != null ? money(item.price) + (item.unit === "lb" ? " / lb" : " each") : "Price coming soon"));
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
    var picked = {}, qty = item.min || 1;
    var step = item.step || 1, min = item.min || step;
    function draw() {
      body.textContent = "";
      if (item.days && item.days.length) body.appendChild(el("p", "order-item-days", "Available: " + item.days.join(", ")));
      (item.choices || []).forEach(function (q) {
        var opts = optionsFor(item, q, picked);
        if (picked[q] && opts.indexOf(picked[q]) === -1) delete picked[q];
        if (opts.length === 1) picked[q] = opts[0];
        var group = el("div", "order-q");
        group.appendChild(el("p", "order-q-label", q));
        var row = el("div", "order-opts");
        opts.forEach(function (v) {
          var b = el("button", "order-opt", v);
          b.type = "button";
          b.setAttribute("aria-pressed", picked[q] === v ? "true" : "false");
          if (opts.length === 1) b.disabled = true;
          b.addEventListener("click", function () {
            picked[q] = v;
            var qs = item.choices, i = qs.indexOf(q);
            for (var k = i + 1; k < qs.length; k++) delete picked[qs[k]];
            draw();
          });
          row.appendChild(b);
        });
        group.appendChild(row);
        body.appendChild(group);
      });
      // quantity
      var qrow = el("div", "order-qty-row");
      qrow.appendChild(el("p", "order-q-label", item.unit === "lb" ? "Weight" : "How many"));
      var stepper = el("div", "order-stepper");
      var minus = el("button", "order-step-btn", "−"); minus.type = "button"; minus.setAttribute("aria-label", "Less");
      var val = el("span", "order-step-val", fmtQty(qty, item.unit)); val.setAttribute("aria-live", "polite");
      var plus = el("button", "order-step-btn", "+"); plus.type = "button"; plus.setAttribute("aria-label", "More");
      minus.addEventListener("click", function () { qty = Math.max(min, Math.round((qty - step) * 100) / 100); val.textContent = fmtQty(qty, item.unit); });
      plus.addEventListener("click", function () { qty = Math.round((qty + step) * 100) / 100; val.textContent = fmtQty(qty, item.unit); });
      stepper.appendChild(minus); stepper.appendChild(val); stepper.appendChild(plus);
      qrow.appendChild(stepper);
      body.appendChild(qrow);

      var ready = (item.choices || []).every(function (q) { return picked[q]; });
      var add = el("button", "btn btn-primary order-add", ready ? "Add to order" : "Choose " + firstMissing().toLowerCase());
      add.type = "button"; add.disabled = !ready;
      add.addEventListener("click", function () {
        state.cart.push({ id: item.id, picks: Object.assign({}, picked), qty: qty });
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
    var parts = (item.choices || []).map(function (q) {
      var v = l.picks[q];
      return q === "BBQ cut" ? (v === "Yes" ? "BBQ cut" : "no BBQ cut") : v;
    });
    return { item: item, desc: parts.join(", ") };
  }
  function lineCost(l) { var it = findItem(l.id); return it && it.price != null ? it.price * l.qty : null; }

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
      info.appendChild(el("span", "order-line-name", fmtQty(l.qty, t.item.unit) + (t.item.unit === "lb" ? " " : " × ") + t.item.name));
      info.appendChild(el("span", "order-line-desc", t.desc));
      li.appendChild(info);
      li.appendChild(el("span", "order-line-cost", cost != null ? money(cost) : ""));
      var rm = el("button", "order-line-rm", "Remove"); rm.type = "button";
      rm.setAttribute("aria-label", "Remove " + t.item.name);
      rm.addEventListener("click", function () { state.cart.splice(i, 1); save(); renderCart(); });
      li.appendChild(rm);
      ul.appendChild(li);
    });
    cartEl.appendChild(ul);
    var tot = el("p", "order-total");
    tot.appendChild(el("span", null, "Estimated total"));
    tot.appendChild(el("strong", null, allPriced ? money(total) : "Sent by text"));
    cartEl.appendChild(tot);
    form.hidden = false;
    renderDays();
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
    updateMode();
  }
  function updateMode() {
    var isDel = state.mode === "delivery";
    $("order-address-wrap").hidden = !isDel;
    var note = $("order-delivery-note");
    note.hidden = !(isDel && M.delivery.note);
    note.textContent = (M.delivery && M.delivery.note) || "";
    var times = (isDel ? M.delivery.times : M.pickup.times) || [];
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
      var o = el("option", null, label); o.value = label; sel.appendChild(o);
    }
    if (!sel.options.length) { var none = el("option", null, "No day has all items. Remove one to continue."); none.value = ""; sel.appendChild(none); }
    if ([].some.call(sel.options, function (o) { return o.value === prev; })) sel.value = prev;
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
    state.address = $("order-address").value.trim();
    save();
    if (!$("order-day").value) err = "Please pick a day.";
    else if (!state.name) err = "Please enter your name.";
    else if (state.phone.replace(/\D/g, "").length < 10) err = "Please enter a phone number we can text.";
    else if (state.mode === "delivery" && state.address.length < 8) err = "Please enter your delivery address.";
    var e = $("order-error"); e.hidden = !err; e.textContent = err;
    return !err;
  }
  function buildMessage(num) {
    var isDel = state.mode === "delivery", total = 0, allPriced = true;
    var lines = ["New meat order " + num, ""];
    lines.push((isDel ? "Delivery" : "Pickup") + ": " + $("order-day").value + ", " + $("order-time").value);
    lines.push("Name: " + state.name);
    lines.push("Phone: " + state.phone);
    if (isDel) lines.push("Address: " + state.address);
    lines.push("");
    state.cart.forEach(function (l, i) {
      var t = lineText(l), cost = lineCost(l);
      if (cost == null) allPriced = false; else total += cost;
      lines.push((i + 1) + ") " + t.item.name + ": " + t.desc + " | " + (t.item.unit === "lb" ? fmtQty(l.qty, "lb") : "Qty " + l.qty) +
        (cost != null ? " | about " + money(cost) : ""));
    });
    lines.push("");
    if (allPriced) lines.push("Estimated total: " + money(total) + (isDel ? " + delivery" : "") + " (final price by weight)");
    var notes = $("order-notes").value.trim();
    if (notes) lines.push("Notes: " + notes);
    return lines.join("\n");
  }
  function send(channel) {
    if (!validate()) return;
    var num = orderNumber(), msg = buildMessage(num), url;
    if (channel === "whatsapp") url = "https://wa.me/" + S.store.whatsappNumber + "?text=" + encodeURIComponent(msg);
    else url = "sms:+" + (M.textNumber || S.store.whatsappNumber) + "?&body=" + encodeURIComponent(msg);
    window.location.href = url;
    showDone(num, channel);
  }
  function showDone(num, channel) {
    doneEl.textContent = "";
    doneEl.appendChild(el("h2", null, "Almost done!"));
    doneEl.appendChild(el("p", null, "Your order " + num + " should now be open in " +
      (channel === "whatsapp" ? "WhatsApp" : "Messages") + ". Press send there to place it."));
    doneEl.appendChild(el("p", null, "We'll text you back with your " +
      (state.mode === "delivery" ? "delivery time" : "pickup time") + ", final total, and a payment link."));
    var again = el("button", "btn btn-cream", "Start a new order"); again.type = "button";
    again.addEventListener("click", function () { state.cart = []; save(); doneEl.hidden = true; cartEl.hidden = false; renderCart(); window.scrollTo(0, 0); });
    var back = el("button", "order-link-btn", "Go back and edit this order"); back.type = "button";
    back.addEventListener("click", function () { doneEl.hidden = true; form.hidden = false; cartEl.hidden = false; });
    doneEl.appendChild(again); doneEl.appendChild(back);
    doneEl.hidden = false; form.hidden = true; cartEl.hidden = true;
    doneEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- start ----------
  $("order-name").value = state.name || "";
  $("order-phone").value = state.phone || "";
  $("order-address").value = state.address || "";
  $("send-whatsapp").addEventListener("click", function () { send("whatsapp"); });
  $("send-text").addEventListener("click", function () { send("text"); });
  renderCats(); renderItems(); renderModes(); renderCart();
})();
