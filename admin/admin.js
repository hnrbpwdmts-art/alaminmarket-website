/* Super Al-Amin staff order page.
   Reads orders from the order Google Sheet (backend/Code.gs) with the store
   passcode, saves each order's status there, and opens WhatsApp or Messages on
   this phone with a ready-to-send note for the customer. It does not replace
   the order emails, WhatsApp, or text orders. */
(function () {
  "use strict";
  var S = window.SITE || {}, store = S.store || {}, M = window.MEAT_MENU || {};
  var API = M.orderLogUrl;
  var PASS_KEY = "alamin-admin-pass";
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var pass = "", orders = [], seen = {}, tab = "active", timer = null, sheetCtx = null;
  try { pass = sessionStorage.getItem(PASS_KEY) || localStorage.getItem(PASS_KEY) || ""; } catch (e) { /* private mode */ }

  // ---------- talking to the sheet ----------
  function api(body) {
    body.admin = 1; body.passcode = pass;
    return fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  var ERRORS = {
    wrong_passcode: "That passcode isn't right.",
    locked: "Too many wrong tries. Please wait 15 minutes and try again.",
    not_set: "The order page isn't set up yet. Add a passcode in the order sheet's script (ADMIN_PASSCODE) and redeploy it.",
    network: "Couldn't reach the order sheet. Check your internet and try again."
  };

  // ---------- sign in ----------
  function showLogin(msg) {
    $("adm-login").hidden = false; $("adm-app").hidden = true; $("adm-top-actions").hidden = true;
    var e = $("adm-login-error"); e.hidden = !msg; e.textContent = msg || "";
    clearInterval(timer);
  }
  $("adm-login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var v = $("adm-pass").value.trim();
    if (!v) { showLogin("Please enter the passcode."); return; }
    pass = v;
    var btn = ev.target.querySelector("button"); btn.disabled = true; btn.textContent = "Signing in…";
    load(true).then(function (ok) {
      btn.disabled = false; btn.textContent = "Sign in";
      if (!ok) return;
      try {
        sessionStorage.setItem(PASS_KEY, pass);
        if ($("adm-remember").checked) localStorage.setItem(PASS_KEY, pass); else localStorage.removeItem(PASS_KEY);
      } catch (e) { /* ignore */ }
    });
  });
  $("adm-lock").addEventListener("click", function () {
    pass = ""; orders = [];
    try { sessionStorage.removeItem(PASS_KEY); localStorage.removeItem(PASS_KEY); } catch (e) { /* ignore */ }
    $("adm-pass").value = ""; showLogin("");
  });

  // ---------- loading ----------
  function load(first) {
    $("adm-status-line").textContent = "Loading…";
    return api({ action: "list", days: 14 }).then(function (res) {
      if (!res || !res.ok) {
        var err = (res && res.error) || "network";
        if (err === "wrong_passcode" || err === "locked" || err === "not_set") {
          try { sessionStorage.removeItem(PASS_KEY); localStorage.removeItem(PASS_KEY); } catch (e) { /* ignore */ }
          showLogin(ERRORS[err]);
        } else $("adm-status-line").textContent = ERRORS.network;
        return false;
      }
      var fresh = [];
      res.orders.forEach(function (o) { if (!first && !seen[o.num] && Object.keys(seen).length) fresh.push(o); seen[o.num] = true; });
      orders = res.orders;
      $("adm-login").hidden = true; $("adm-app").hidden = false; $("adm-top-actions").hidden = false;
      if (fresh.length) {
        var n = $("adm-new"); n.hidden = false;
        n.textContent = fresh.length === 1 ? "1 new order just came in: " + fresh[0].name : fresh.length + " new orders just came in";
        if (navigator.vibrate) try { navigator.vibrate(200); } catch (e) { /* ignore */ }
      }
      render();
      $("adm-status-line").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " · refreshes every minute";
      clearInterval(timer);
      timer = setInterval(function () { if (!document.hidden && $("adm-sheet").hidden) load(false); }, 60000);
      return true;
    }).catch(function () {
      if (first && !orders.length) showLogin(ERRORS.network);
      else $("adm-status-line").textContent = ERRORS.network;
      return false;
    });
  }
  $("adm-refresh").addEventListener("click", function () { $("adm-new").hidden = true; load(false); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && pass && !$("adm-app").hidden) load(false); });

  // ---------- dates ----------
  function todayISO() {
    var p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return p.slice(0, 10);
  }
  function dayLabel(o) {
    if (!o.date) return o.dayText || "";
    var t = todayISO(), d = new Date(o.date + "T12:00:00");
    var tom = new Date(t + "T12:00:00"); tom.setDate(tom.getDate() + 1);
    var name = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    if (o.date === t) return "Today, " + name;
    if (d.toDateString() === tom.toDateString()) return "Tomorrow, " + name;
    return name;
  }
  function timeStart(t) {
    var m = String(t || "").match(/(\d{1,2})(?::(\d\d))?\s*(AM|PM)?/i);
    if (!m) return 0;
    var h = +m[1] % 12, pm = /pm/i.test(m[3] || "") || (!m[3] && h < 8);
    return (h + (pm ? 12 : 0)) * 60 + (+m[2] || 0);
  }

  // ---------- list ----------
  var TABS = [
    { id: "active", label: "To do", test: function (o) { return o.status !== "Done" && o.status !== "Cancelled"; } },
    { id: "today", label: "Today", test: function (o) { return o.date === todayISO() && o.status !== "Cancelled"; } },
    { id: "done", label: "Done", test: function (o) { return o.status === "Done" || o.status === "Cancelled"; } }
  ];
  function render() {
    var tabsEl = $("adm-tabs"); tabsEl.textContent = "";
    TABS.forEach(function (t) {
      var n = orders.filter(t.test).length;
      var b = el("button", "adm-tab"); b.type = "button"; b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", t.id === tab ? "true" : "false");
      b.appendChild(document.createTextNode(t.label + " "));
      b.appendChild(el("span", "adm-count", String(n)));
      b.addEventListener("click", function () { tab = t.id; render(); });
      tabsEl.appendChild(b);
    });
    var t = TABS.filter(function (x) { return x.id === tab; })[0];
    var list = orders.filter(t.test).slice();
    if (tab === "done") list.sort(function (a, b) { return (b.statusAt || b.sentAt).localeCompare(a.statusAt || a.sentAt); });
    else list.sort(function (a, b) {
      return (a.date || "9999").localeCompare(b.date || "9999") || timeStart(a.time) - timeStart(b.time) || a.sentAt.localeCompare(b.sentAt);
    });
    var ul = $("adm-list"); ul.textContent = "";
    list.forEach(function (o) { ul.appendChild(card(o)); });
    var empty = $("adm-empty");
    empty.hidden = list.length > 0;
    empty.textContent = tab === "done" ? "No finished orders in the last 2 weeks." : tab === "today" ? "No orders for today." : "All caught up. New orders will show up here.";
  }

  var STATUS_CLASS = { "New": "is-new", "Confirmed": "is-confirmed", "Ready": "is-ready", "Out for delivery": "is-ready", "Done": "is-done", "Cancelled": "is-cancelled" };
  function money(n) { return n === "" || n == null || isNaN(n) ? "" : "$" + Number(n).toFixed(2); }
  function digits(p) { return String(p || "").replace(/\D/g, ""); }

  function card(o) {
    var li = el("li", "adm-card " + (STATUS_CLASS[o.status] || ""));
    var top = el("div", "adm-card-top");
    top.appendChild(el("span", "adm-badge " + (STATUS_CLASS[o.status] || ""), o.status));
    if (o.updated) top.appendChild(el("span", "adm-badge is-updated", "Customer changed it"));
    top.appendChild(el("span", "adm-num", o.num));
    li.appendChild(top);

    var when = el("p", "adm-when");
    when.appendChild(el("span", "adm-mode " + (o.mode === "delivery" ? "is-delivery" : ""), o.mode === "delivery" ? "Delivery" : "Pickup"));
    when.appendChild(document.createTextNode(" " + dayLabel(o) + (o.time ? " · " + o.time : "")));
    li.appendChild(when);

    var who = el("div", "adm-who");
    who.appendChild(el("strong", null, o.name || "No name"));
    var links = el("span", "adm-links");
    var ph = digits(o.phone);
    if (ph) {
      var call = el("a", null, "Call"); call.href = "tel:+" + (ph.length === 10 ? "1" + ph : ph); links.appendChild(call);
      var wa = el("a", null, "WhatsApp"); wa.href = "https://wa.me/" + (ph.length === 10 ? "1" + ph : ph); wa.target = "_blank"; wa.rel = "noopener"; links.appendChild(wa);
    }
    who.appendChild(links);
    li.appendChild(who);
    if (o.mode === "delivery" && o.address) {
      var ad = el("a", "adm-address", o.address);
      ad.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(o.address); ad.target = "_blank"; ad.rel = "noopener";
      li.appendChild(ad);
    }

    var items = el("ul", "adm-items");
    String(o.items || "").split(/;\s*/).filter(Boolean).forEach(function (t) { items.appendChild(el("li", null, t)); });
    li.appendChild(items);
    if (o.notes) li.appendChild(el("p", "adm-notes", "Note: " + o.notes));

    var foot = el("div", "adm-card-foot");
    var tot = el("p", "adm-total");
    if (o.finalTotal !== "" && o.finalTotal != null) { tot.appendChild(el("strong", null, money(o.finalTotal))); tot.appendChild(document.createTextNode(" final")); }
    else if (o.estimate !== "" && o.estimate != null) { tot.appendChild(document.createTextNode("Estimate ")); tot.appendChild(el("strong", null, money(o.estimate))); }
    tot.appendChild(el("span", "adm-channel", " · via " + (o.channel || "website")));
    foot.appendChild(tot);
    li.appendChild(foot);

    var acts = el("div", "adm-actions");
    nextSteps(o).forEach(function (s, i) {
      var b = el("button", "btn " + (i === 0 ? "btn-primary" : "btn-outline") + " adm-act", s.label); b.type = "button";
      b.addEventListener("click", function () { openSheet(o, s.status); });
      acts.appendChild(b);
    });
    var more = el("select", "adm-more"); more.setAttribute("aria-label", "Change status of " + o.num);
    more.appendChild(new Option("Change status…", ""));
    ["New", "Confirmed", o.mode === "delivery" ? "Out for delivery" : "Ready", "Done", "Cancelled"].forEach(function (st) {
      if (st !== o.status) more.appendChild(new Option(st, st));
    });
    more.addEventListener("change", function () { if (more.value) openSheet(o, more.value); more.value = ""; });
    acts.appendChild(more);
    li.appendChild(acts);
    return li;
  }
  function nextSteps(o) {
    var ready = o.mode === "delivery" ? { label: "Out for delivery", status: "Out for delivery" } : { label: "Ready for pickup", status: "Ready" };
    switch (o.status) {
      case "New": return [{ label: "Confirm order", status: "Confirmed" }];
      case "Confirmed": return [ready];
      case "Ready": case "Out for delivery": return [{ label: "Mark done", status: "Done" }];
      default: return [];
    }
  }

  // ---------- messages ----------
  function firstName(n) { return String(n || "").trim().split(/\s+/)[0] || "there"; }
  function messageFor(o, status, total) {
    var hi = "Hi " + firstName(o.name) + ", this is " + (store.name || "Super Al-Amin Halal Market") + ". ";
    var when = dayLabel(o).replace(/^(Today|Tomorrow), /, function (m, w) { return w.toLowerCase() + ", "; }) + (o.time ? ", " + o.time : "");
    var t = total !== "" && total != null && !isNaN(total) ? " Your final total is " + money(total) + "." : "";
    var where = (store.street || "18220 Prairie Ave") + ", " + (store.city || "Torrance");
    switch (status) {
      case "Confirmed":
        return hi + "Your order " + o.num + " is confirmed for " + (o.mode === "delivery" ? "delivery" : "pickup") + " " + when + "." + t + " Thank you!";
      case "Ready":
        return hi + "Your order " + o.num + " is ready for pickup at " + where + "." + t + " See you soon!";
      case "Out for delivery":
        return hi + "Your order " + o.num + " is on its way to you now." + t + " Thank you!";
      case "Done":
        return hi + "Thank you for your order " + o.num + "! We hope you enjoy it.";
      case "Cancelled":
        return hi + "Your order " + o.num + " has been cancelled. If you have any questions, please call us at " + (store.phoneDisplay || "(310) 538-1188") + ".";
      default:
        return hi + "About your order " + o.num + ": ";
    }
  }
  var TITLES = { "Confirmed": "Confirm order", "Ready": "Ready for pickup", "Out for delivery": "Out for delivery", "Done": "Mark done", "Cancelled": "Cancel order", "New": "Move back to New" };
  function openSheet(o, status) {
    sheetCtx = { o: o, status: status };
    $("adm-sheet-title").textContent = TITLES[status] || status;
    $("adm-sheet-sub").textContent = o.num + " · " + o.name + " · " + dayLabel(o) + (o.time ? ", " + o.time : "");
    var showTotal = status === "Confirmed" || status === "Ready" || status === "Out for delivery";
    $("adm-total-wrap").hidden = !showTotal;
    $("adm-total").value = o.finalTotal !== "" && o.finalTotal != null ? Number(o.finalTotal).toFixed(2) : "";
    $("adm-msg").value = messageFor(o, status, o.finalTotal);
    var quiet = status === "Done" || status === "New";
    $("adm-msg-wrap").hidden = status === "New";
    $("adm-send-wa").hidden = $("adm-send-sms").hidden = status === "New" || !digits(o.phone);
    $("adm-save-only").className = "btn " + (quiet ? "btn-primary" : "btn-outline");
    $("adm-sheet-error").hidden = true;
    $("adm-sheet").hidden = false; $("adm-sheet-bg").hidden = false;
    document.body.classList.add("sheet-open");
    setTimeout(function () { (showTotal && !$("adm-total").value ? $("adm-total") : $("adm-msg")).focus(); }, 50);
  }
  function closeSheet() {
    $("adm-sheet").hidden = true; $("adm-sheet-bg").hidden = true; sheetCtx = null;
    document.body.classList.remove("sheet-open");
  }
  $("adm-sheet-close").addEventListener("click", closeSheet);
  $("adm-sheet-bg").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("adm-sheet").hidden) closeSheet(); });
  $("adm-total").addEventListener("input", function () {
    if (!sheetCtx) return;
    var v = $("adm-total").value;
    $("adm-msg").value = messageFor(sheetCtx.o, sheetCtx.status, v === "" ? "" : Number(v));
  });

  function save(channel) {
    if (!sheetCtx) return;
    var o = sheetCtx.o, status = sheetCtx.status, total = $("adm-total-wrap").hidden ? "" : $("adm-total").value;
    var msg = $("adm-msg").value.trim(), ph = digits(o.phone);
    if (ph.length === 10) ph = "1" + ph;
    // Open the messaging app right away (phones block it if we wait for the save)
    if (channel === "wa") window.open("https://wa.me/" + ph + "?text=" + encodeURIComponent(msg), "_blank");
    var body = { action: "status", order: o.num, status: status };
    if (total !== "") body.finalTotal = total;
    // Optimistic: show the new status now; undo if the save fails
    var before = { status: o.status, finalTotal: o.finalTotal, statusAt: o.statusAt };
    o.status = status; if (total !== "") o.finalTotal = Number(total); o.statusAt = new Date().toISOString();
    var req = api(body);
    closeSheet(); render();
    if (channel === "sms") {
      var ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
      location.href = "sms:+" + ph + (ios ? "&" : "?") + "body=" + encodeURIComponent(msg);
    }
    req.then(function (res) {
      if (res && res.ok) { toast(o.num + " marked " + status); return; }
      throw new Error((res && res.error) || "save");
    }).catch(function () {
      o.status = before.status; o.finalTotal = before.finalTotal; o.statusAt = before.statusAt; render();
      toast("Couldn't save the status for " + o.num + ". Please try again.");
    });
  }
  $("adm-send-wa").addEventListener("click", function () { save("wa"); });
  $("adm-send-sms").addEventListener("click", function () { save("sms"); });
  $("adm-save-only").addEventListener("click", function () { save(""); });

  var toastTimer = null;
  function toast(msg) {
    var t = $("adm-toast"); t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("is-on"); }, 2600);
  }

  // ---------- start ----------
  if (!API) { showLogin("The order sheet link is missing (orderLogUrl in meat-menu.js)."); return; }
  if (pass) load(true); else showLogin("");
})();
