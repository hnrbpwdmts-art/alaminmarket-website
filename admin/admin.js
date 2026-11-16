/* Super Al-Amin staff order page.
   Reads orders from the order Google Sheet (backend/Code.gs) with the store
   passcode and saves each order's status there, so staff can keep track.
   Staff text customers themselves (Call / Text / WhatsApp links on each card).
   It does not replace the order emails. */
(function () {
  "use strict";
  var S = window.SITE || {}, store = S.store || {}, M = window.MEAT_MENU || {};
  var API = M.orderLogUrl;
  var PASS_KEY = "alamin-admin-pass";
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var pass = "", orders = [], tab = "active", timer = null;
  var chats = [], chatsOn = null, openChat = "", chatTimer = null, chatSig = "";   // chatsOn: null = not known yet

  // Ready-made chat replies (tap to put in the reply box, then edit or send)
  var QUICK_REPLIES = [
    "Yes, we have it today. Want us to save some for you?",
    "Sorry, we're out of that today. Please check back with us soon.",
    "You can order online here: https://alaminmarket.com/order/ and we'll text you to confirm.",
    "Please call us at " + (store.phoneDisplay || "(310) 538-1188") + " and we'll help you right away.",
    "Thank you! See you soon."
  ];
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
    unlockAudio();   // the Sign in tap lets the page play sounds
    if ("Notification" in window && Notification.permission === "default") try { Notification.requestPermission(); } catch (e) { /* ignore */ }
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
    pass = ""; orders = []; chats = []; openChat = ""; clearInterval(chatTimer);
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
      orders = res.orders;
      loadChats();
      $("adm-login").hidden = true; $("adm-app").hidden = false; $("adm-top-actions").hidden = false;
      render();
      checkAlarm();
      updateEnable();
      $("adm-status-line").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " · checks for new orders every 30 seconds";
      clearInterval(timer);
      // Keep checking even when this tab is in the background, so the alarm can sound
      timer = setInterval(function () { load(false); }, 30000);
      return true;
    }).catch(function () {
      if (first && !orders.length) showLogin(ERRORS.network);
      else $("adm-status-line").textContent = ERRORS.network;
      return false;
    });
  }
  $("adm-refresh").addEventListener("click", function () { load(false); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && pass && !$("adm-app").hidden) load(false); });

  // ---------- chats ----------
  function loadChats() {
    return api({ action: "chats", days: 3 }).then(function (res) {
      if (!res || !res.ok) return;
      var wasOn = chatsOn === true;
      if (!Array.isArray(res.chats)) { var was = chatsOn; chatsOn = false; if (was !== false) render(); return; }   // sheet script not updated yet
      chatsOn = true;
      var sig = JSON.stringify(res.chats.map(function (c) { return [c.id, c.messages.length, c.name, c.phone]; }));
      if (sig === chatSig && wasOn) { checkAlarm(); return; }   // nothing new: don't redraw (keeps scroll position)
      chatSig = sig;
      chats = res.chats;
      if (tab === "chats") { renderChatsKeepTyping(); scrollThread(); } else render();
      checkAlarm();
    }).catch(function () { /* try again next time */ });
  }
  // Check chats more often while the Chats tab is open
  function chatPolling() {
    clearInterval(chatTimer); chatTimer = null;
    if (tab === "chats" && pass) chatTimer = setInterval(function () { if (!document.hidden) loadChats(); }, 8000);
  }
  var DONE_KEY = "alamin-admin-chatdone";
  var chatDone = {};
  try { chatDone = JSON.parse(localStorage.getItem(DONE_KEY) || "{}") || {}; } catch (e) { chatDone = {}; }
  function lastMsg(c) { return c.messages[c.messages.length - 1] || {}; }
  function needsReply(c) { var m = lastMsg(c); return m.from === "Customer" && chatDone[c.id] !== m.at; }
  function markDone(c) {
    chatDone[c.id] = lastMsg(c).at;
    var keep = {}; chats.forEach(function (x) { if (chatDone[x.id]) keep[x.id] = chatDone[x.id]; }); chatDone = keep;
    try { localStorage.setItem(DONE_KEY, JSON.stringify(chatDone)); } catch (e) { /* ignore */ }
  }
  function ago(iso) {
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!(m >= 0)) return "";
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    var d = new Date(iso);
    return (d.toDateString() === new Date().toDateString() ? "" : d.toLocaleDateString("en-US", { weekday: "short" }) + " ") +
      d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function chatName(c) { return c.name || "Website visitor"; }
  function renderChatsKeepTyping() {
    var box = document.getElementById("adm-chat-reply"), keep = box ? box.value : null, focused = box && document.activeElement === box;
    render();
    var nb = document.getElementById("adm-chat-reply");
    if (nb && keep != null) { nb.value = keep; if (focused) nb.focus(); }
  }
  function renderChats(ul) {
    var empty = $("adm-empty");
    if (chatsOn === false) {
      empty.hidden = false;
      empty.textContent = "Chats aren't turned on yet. Paste the updated script into the order sheet (see backend/README.md, \"Live chat\") and deploy a new version.";
      return;
    }
    var c = openChat && chats.filter(function (x) { return x.id === openChat; })[0];
    if (c) { ul.appendChild(chatThread(c)); empty.hidden = true; return; }
    openChat = "";
    chats.forEach(function (x) { ul.appendChild(chatCard(x)); });
    empty.hidden = chats.length > 0;
    empty.textContent = chatsOn ? "No chats in the last 3 days. Questions from the website chat show up here." : "Loading chats…";
  }
  function chatCard(c) {
    var li = el("li", "adm-card adm-chat-card" + (needsReply(c) ? " is-new" : ""));
    var b = el("button", "adm-chat-open"); b.type = "button";
    var top = el("span", "adm-chat-top");
    top.appendChild(el("strong", null, chatName(c)));
    if (needsReply(c)) top.appendChild(el("span", "adm-badge is-new", "Needs reply"));
    top.appendChild(el("span", "adm-chat-ago", ago(lastMsg(c).at)));
    b.appendChild(top);
    var m = lastMsg(c);
    b.appendChild(el("span", "adm-chat-snip", (m.from === "Store" ? "You: " : "") + m.text));
    b.addEventListener("click", function () { openChat = c.id; ackChat(c); render(); scrollThread(); });
    li.appendChild(b);
    return li;
  }
  function scrollThread() { requestAnimationFrame(function () { var t = document.querySelector(".adm-thread-msgs"); if (t) t.scrollTop = t.scrollHeight; }); }
  function chatThread(c) {
    var li = el("li", "adm-card adm-thread");
    var head = el("div", "adm-thread-head");
    var back = el("button", "adm-link-btn adm-back", "‹ All chats"); back.type = "button";
    back.addEventListener("click", function () { openChat = ""; render(); });
    head.appendChild(back);
    var who = el("div", "adm-who");
    who.appendChild(el("strong", null, chatName(c)));
    var links = el("span", "adm-links"), ph = digits(c.phone);
    if (ph) {
      var full = ph.length === 10 ? "1" + ph : ph;
      var call = el("a", null, "Call"); call.href = "tel:+" + full; links.appendChild(call);
      var t = el("a", null, "Text"); t.href = "sms:+" + full; links.appendChild(t);
      var wa = el("a", null, "WhatsApp"); wa.href = "https://wa.me/" + full; wa.target = "_blank"; wa.rel = "noopener"; links.appendChild(wa);
    } else links.appendChild(el("span", "adm-fine-inline", "No phone number given"));
    who.appendChild(links);
    head.appendChild(who);
    li.appendChild(head);
    if (ph) { var d10 = ph.slice(-10); li.appendChild(el("p", "adm-chat-hint", "If they've left the website, text them at (" + d10.slice(0, 3) + ") " + d10.slice(3, 6) + "-" + d10.slice(6) + ".")); }

    var msgs = el("div", "adm-thread-msgs");
    c.messages.forEach(function (m) {
      var row = el("div", "adm-msg " + (m.from === "Store" ? "is-store" : "is-customer"));
      row.appendChild(el("div", "adm-msg-text", m.text));
      row.appendChild(el("span", "adm-msg-time", (m.from === "Store" ? "You · " : "") + ago(m.at)));
      msgs.appendChild(row);
    });
    li.appendChild(msgs);

    var quick = el("div", "adm-quick");
    QUICK_REPLIES.forEach(function (q) {
      var b = el("button", "adm-quick-btn", q.length > 38 ? q.slice(0, 36) + "…" : q); b.type = "button"; b.title = q;
      b.addEventListener("click", function () { box.value = q; box.focus(); });
      quick.appendChild(b);
    });
    li.appendChild(quick);

    var form = el("form", "adm-reply");
    var box = el("textarea"); box.id = "adm-chat-reply"; box.rows = 2; box.placeholder = "Type a reply…"; box.maxLength = 1000;
    box.setAttribute("aria-label", "Reply to " + chatName(c));
    var send = el("button", "btn btn-primary", "Send"); send.type = "submit";
    form.appendChild(box); form.appendChild(send);
    box.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !onPhone) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : send.click(); } });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = box.value.trim(); if (!text) return;
      send.disabled = true; send.textContent = "Sending…";
      api({ action: "chatReply", chatId: c.id, text: text }).then(function (res) {
        if (!res || !res.ok) throw new Error("save");
        c.messages.push({ at: res.at || new Date().toISOString(), from: "Store", text: text });
        box.value = ""; render(); scrollThread();
      }).catch(function () {
        send.disabled = false; send.textContent = "Send";
        toast("Couldn't send. Check your internet and try again.");
      });
    });
    li.appendChild(form);

    var foot = el("div", "adm-thread-foot");
    if (needsReply(c)) {
      var done = el("button", "adm-link-btn", "✓ Mark as answered"); done.type = "button"; done.title = "Use this if you answered by phone or text";
      done.addEventListener("click", function () { markDone(c); ackChat(c); render(); toast("Marked as answered"); });
      foot.appendChild(done);
    }
    if (c.page) foot.appendChild(el("span", "adm-fine-inline", "Asked on " + c.page));
    li.appendChild(foot);
    return li;
  }

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
    { id: "done", label: "Done", test: function (o) { return o.status === "Done" || o.status === "Cancelled"; } },
    { id: "chats", label: "💬 Chats", chats: true }
  ];
  function render() {
    var tabsEl = $("adm-tabs"); tabsEl.textContent = "";
    TABS.forEach(function (t) {
      if (t.chats && chatsOn === false) return;   // hide until the sheet script is updated
      var n = t.chats ? chats.filter(needsReply).length : orders.filter(t.test).length;
      var b = el("button", "adm-tab"); b.type = "button"; b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", t.id === tab ? "true" : "false");
      b.appendChild(document.createTextNode(t.label + " "));
      b.appendChild(el("span", "adm-count", String(n)));
      if (t.chats && n) b.classList.add("has-chat");
      b.addEventListener("click", function () { tab = t.id; if (t.chats) { openChat = ""; loadChats(); } render(); chatPolling(); });
      tabsEl.appendChild(b);
    });
    if (tab === "chats") { var cl = $("adm-list"); cl.textContent = ""; renderChats(cl); return; }
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
    var CALL_BADGE = { "Calling": "📞 Calling store…", "Confirmed by phone": "📞 Answered", "No answer": "📞 No answer" };
    if (CALL_BADGE[o.callStatus]) top.appendChild(el("span", "adm-badge adm-call" + (o.callStatus === "No answer" ? " is-new" : ""), CALL_BADGE[o.callStatus]));
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
      var full = ph.length === 10 ? "1" + ph : ph;
      var call = el("a", null, "Call"); call.href = "tel:+" + full; links.appendChild(call);
      var txt = el("a", null, "Text"); txt.href = "sms:+" + full; links.appendChild(txt);
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
    if (o.mode === "delivery" && (o.status === "New" || o.status === "Confirmed"))
      li.appendChild(el("p", "adm-pay-note", "Delivery: collect payment (Zelle or card link) before it goes out."));

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
      b.addEventListener("click", function () { changeStatus(o, s.status); });
      acts.appendChild(b);
    });
    var more = el("select", "adm-more"); more.setAttribute("aria-label", "Change status of " + o.num);
    more.appendChild(new Option("Change status…", ""));
    ["New", "Confirmed", o.mode === "delivery" ? "Out for delivery" : "Ready", "Done", "Cancelled"].forEach(function (st) {
      if (st !== o.status) more.appendChild(new Option(st, st));
    });
    more.addEventListener("change", function () { var v = more.value; more.value = ""; if (v) changeStatus(o, v); });
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

  // ---------- status (staff text customers themselves) ----------
  function changeStatus(o, status) {
    if (o.mode === "delivery" && status === "Out for delivery" &&
        !window.confirm("Delivery orders must be paid before they go out. Has " + o.name + " paid?")) return;
    if (status === "Cancelled" && !window.confirm("Cancel order " + o.num + " for " + o.name + "?")) return;
    ackOrder(o);
    var before = o.status;
    save(o, status, function () { toast(o.num + " marked " + status, function () { save(o, before); }); });
    if (MESSAGE_STATUSES.indexOf(status) > -1 && digits(o.phone)) openSheet(o, status);
  }

  // ---------- optional customer update (WhatsApp on a computer; text or WhatsApp on a phone) ----------
  var MESSAGE_STATUSES = ["Confirmed", "Ready", "Out for delivery", "Cancelled"];
  var onPhone = /iPhone|iPod|Android.*Mobile|Mobile.*Android|Windows Phone/i.test(navigator.userAgent) ||
    (/iPad|Android/i.test(navigator.userAgent) && Math.min(screen.width, screen.height) < 600);
  var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  var sheetCtx = null;
  function firstName(n) { return String(n || "").trim().split(/\s+/)[0] || "there"; }
  function messageFor(o, status) {
    var hi = "Hi " + firstName(o.name) + ", this is " + (store.name || "Super Al-Amin Halal Market") + ". ";
    var when = dayLabel(o).replace(/^(Today|Tomorrow), /, function (m, w) { return w.toLowerCase() + ", "; }) + (o.time ? ", " + o.time : "");
    var where = (store.street || "18220 Prairie Ave") + ", " + (store.city || "Torrance");
    switch (status) {
      case "Confirmed": return hi + "Your order " + o.num + " is confirmed for " + (o.mode === "delivery" ? "delivery" : "pickup") + " " + when + ". Thank you!";
      case "Ready": return hi + "Your order " + o.num + " is ready for pickup at " + where + ". See you soon!";
      case "Out for delivery": return hi + "Your order " + o.num + " is on its way to you now. Thank you!";
      case "Cancelled": return hi + "Your order " + o.num + " has been cancelled. If you have any questions, please call us at " + (store.phoneDisplay || "(310) 538-1188") + ".";
      default: return hi;
    }
  }
  function fullPhone(o) { var p = digits(o.phone); return p.length === 10 ? "1" + p : p; }
  function openSheet(o, status) {
    sheetCtx = { o: o, status: status };
    $("adm-sheet-sub").textContent = o.name + " · " + o.num + " · marked " + status;
    $("adm-msg").value = messageFor(o, status);
    $("adm-send-sms").hidden = !onPhone;
    $("adm-send-wa").textContent = onPhone ? "Send on WhatsApp" : "Open in WhatsApp";
    $("adm-send-web").hidden = onPhone;
    updateWebLink();
    $("adm-sheet").hidden = false; $("adm-sheet-bg").hidden = false;
    document.body.classList.add("sheet-open");
  }
  // Links are kept up to date as the message is edited, so a tap opens the app directly
  function updateWebLink() {
    if (!sheetCtx) return;
    var ph = fullPhone(sheetCtx.o), msg = encodeURIComponent($("adm-msg").value.trim());
    var wa = $("adm-send-wa");
    if (onPhone) { wa.href = "https://wa.me/" + ph + "?text=" + msg; wa.target = "_blank"; }
    else { wa.href = "whatsapp://send?phone=" + ph + "&text=" + msg; wa.removeAttribute("target"); }   // WhatsApp desktop app
    $("adm-send-web").href = "https://web.whatsapp.com/send?phone=" + ph + "&text=" + msg;
  }
  function closeSheet() {
    $("adm-sheet").hidden = true; $("adm-sheet-bg").hidden = true; sheetCtx = null;
    document.body.classList.remove("sheet-open");
  }
  $("adm-msg").addEventListener("input", updateWebLink);
  $("adm-sheet-close").addEventListener("click", closeSheet);
  $("adm-sheet-bg").addEventListener("click", closeSheet);
  $("adm-skip").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("adm-sheet").hidden) closeSheet(); });
  $("adm-send-wa").addEventListener("click", function () { setTimeout(closeSheet, 100); });
  $("adm-send-sms").addEventListener("click", function () {
    if (!sheetCtx) return;
    var ph = fullPhone(sheetCtx.o), msg = encodeURIComponent($("adm-msg").value.trim());
    closeSheet();
    location.href = "sms:+" + ph + (isIOS ? "&" : "?") + "body=" + msg;
  });
  $("adm-send-web").addEventListener("click", function () { setTimeout(closeSheet, 100); });
  function save(o, status, onOk) {
    var before = { status: o.status, statusAt: o.statusAt };
    o.status = status; o.statusAt = new Date().toISOString();   // show it right away
    render();
    api({ action: "status", order: o.num, status: status }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || "save");
      if (onOk) onOk();
    }).catch(function () {
      o.status = before.status; o.statusAt = before.statusAt; render();
      toast("Couldn't save the status for " + o.num + ". Please try again.");
    });
  }

  // ---------- new order alarm: chime + voice + banner + notification, repeats until "Got it" ----------
  var ACK_KEY = "alamin-admin-ack", SOUND_KEY = "alamin-admin-sound";
  var acked = {};
  try { acked = JSON.parse(localStorage.getItem(ACK_KEY) || "{}") || {}; } catch (e) { acked = {}; }
  var soundOn = true;
  try { soundOn = localStorage.getItem(SOUND_KEY) !== "off"; } catch (e) { /* ignore */ }
  var audioCtx = null, ringTimer = null, titleTimer = null, rung = {}, baseTitle = document.title;
  function alarmKey(o) { return o.num + "|" + (o.sentAt || ""); }   // an edited order alarms again
  function pendingOrders() { return orders.filter(function (o) { return o.status === "New" && !acked[alarmKey(o)]; }); }
  function saveAcks() {
    // keep the list small: only keys for orders still on the page
    var keep = {}; orders.forEach(function (o) { var k = alarmKey(o); if (acked[k]) keep[k] = 1; });
    chats.forEach(function (c) { var k = chatKey(c); if (acked[k]) keep[k] = 1; });
    acked = keep;
    try { localStorage.setItem(ACK_KEY, JSON.stringify(acked)); } catch (e) { /* ignore */ }
  }
  var chatRung = {};
  function chatKey(c) { return c.id + "|" + lastMsg(c).at; }
  function pendingChats() { return chats.filter(function (c) { return needsReply(c) && !acked[chatKey(c)]; }); }
  function ackChat(c) {
    acked[chatKey(c)] = 1;
    try { localStorage.setItem(ACK_KEY, JSON.stringify(acked)); } catch (e) { /* ignore */ }
    setTimeout(checkAlarm, 0);
  }
  function chatAnnounce(list) {
    return list.length > 1 ? "You have " + list.length + " new chat messages." : "New chat message from " + firstName(chatName(list[0])) + ".";
  }
  function ackOrder(o) { acked[alarmKey(o)] = 1; saveAcks(); setTimeout(checkAlarm, 0); }
  function unlockAudio() {
    try {
      if (!audioCtx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); }
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) { /* no sound on this device */ }
    if (window.speechSynthesis) try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch (e) { /* ignore */ }
    updateEnable();
  }
  function audioReady() { return !!(audioCtx && audioCtx.state === "running"); }
  function updateEnable() { $("adm-enable").hidden = !soundOn || audioReady() || $("adm-app").hidden; }
  function chime() {
    if (!audioReady()) return;
    var t = audioCtx.currentTime;
    [[880, 0], [660, .28], [880, .7], [660, .98]].forEach(function (n) {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, t + n[1]);
      g.gain.exponentialRampToValueAtTime(0.5, t + n[1] + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + 0.26);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t + n[1]); o.stop(t + n[1] + 0.3);
    });
  }
  function spokenTime(t) { return String(t || "").replace(/\s*[–-]\s*/g, " to "); }
  function announceText(list) {
    if (list.length > 1) return "You have " + list.length + " new online orders.";
    var o = list[0];
    var day = dayLabel(o).replace(/,.*$/, "");
    return "New online order from " + firstName(o.name) + ", " + (o.mode === "delivery" ? "delivery" : "pickup") +
      (day ? " " + day.toLowerCase() : "") + (o.time ? ", " + spokenTime(o.time) : "") + ".";
  }
  function speak(text) {
    if (!window.speechSynthesis) return;
    try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.lang = "en-US"; speechSynthesis.speak(u); } catch (e) { /* ignore */ }
  }
  function notify(list) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      var n = new Notification(list.length > 1 ? list.length + " new orders" : "New order from " + list[0].name,
        { body: list.length > 1 ? "Open the order page to see them." : announceText(list), tag: "alamin-order", renotify: true, icon: "../images/apple-touch-icon.png" });
      n.onclick = function () { window.focus(); n.close(); };
    } catch (e) { /* ignore */ }
  }
  function ring(list, chatList) {
    if (!soundOn) return;
    chime();
    var say = list.length ? announceText(list) : chatAnnounce(chatList || []);
    setTimeout(function () { speak(say); }, 1300);
    if (navigator.vibrate) try { navigator.vibrate([300, 150, 300]); } catch (e) { /* ignore */ }
  }
  function checkAlarm() {
    var list = pendingOrders(), box = $("adm-alarm"), cl = pendingChats();
    // a chat the staff member is looking at right now doesn't need an alarm
    if (tab === "chats" && openChat && !document.hidden) cl.filter(function (c) { return c.id === openChat; }).forEach(function (c) { acked[chatKey(c)] = 1; });
    cl = pendingChats();
    if (!list.length && cl.length) {
      $("adm-alarm-title").textContent = cl.length > 1 ? "💬 " + cl.length + " new chat messages" : "💬 New chat from " + chatName(cl[0]);
      $("adm-alarm-sub").textContent = cl.length > 1 ? "" : String(lastMsg(cl[0]).text).slice(0, 90);
      box.hidden = false;
      var freshC = cl.filter(function (c) { return !chatRung[chatKey(c)]; });
      if (freshC.length) {
        freshC.forEach(function (c) { chatRung[chatKey(c)] = 1; });
        ring([], cl);
        if ("Notification" in window && Notification.permission === "granted") try {
          var n = new Notification(chatAnnounce(freshC), { body: String(lastMsg(freshC[0]).text).slice(0, 120), tag: "alamin-chat", renotify: true, icon: "../images/apple-touch-icon.png" });
          n.onclick = function () { window.focus(); tab = "chats"; openChat = freshC[0].id; render(); n.close(); };
        } catch (e) { /* ignore */ }
      }
      if (!ringTimer) ringTimer = setInterval(function () { var l = pendingOrders(), c2 = pendingChats(); if (l.length || c2.length) ring(l, c2); }, 30000);
      if (!titleTimer) { var f2 = false; titleTimer = setInterval(function () { f2 = !f2; document.title = f2 ? "💬 New chat!" : baseTitle; }, 1000); }
      return;
    }
    if (!list.length) {
      box.hidden = true; clearInterval(ringTimer); ringTimer = null;
      clearInterval(titleTimer); titleTimer = null; document.title = baseTitle;
      return;
    }
    $("adm-alarm-title").textContent = list.length > 1 ? "🔔 " + list.length + " new orders!" : "🔔 New order from " + list[0].name;
    $("adm-alarm-sub").textContent = list.length > 1
      ? list.map(function (o) { return o.name; }).join(", ")
      : (list[0].mode === "delivery" ? "Delivery" : "Pickup") + " · " + dayLabel(list[0]) + (list[0].time ? " · " + list[0].time : "");
    box.hidden = false;
    var fresh = list.filter(function (o) { return !rung[alarmKey(o)]; });
    if (fresh.length) {
      fresh.forEach(function (o) { rung[alarmKey(o)] = 1; });
      ring(list); notify(fresh);
    }
    if (!ringTimer) ringTimer = setInterval(function () { var l = pendingOrders(), c2 = pendingChats(); if (l.length || c2.length) ring(l, c2); }, 30000);
    if (!titleTimer) {
      var flip = false;
      titleTimer = setInterval(function () { flip = !flip; document.title = flip ? "🔔 New order!" : baseTitle; }, 1000);
    }
  }
  $("adm-alarm-ok").addEventListener("click", function () {
    unlockAudio();
    pendingOrders().forEach(function (o) { acked[alarmKey(o)] = 1; });
    pendingChats().forEach(function (c) { acked[chatKey(c)] = 1; });
    saveAcks(); checkAlarm();
    if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  });
  function soundLabel() {
    var b = $("adm-sound"); b.textContent = soundOn ? "🔔 Alerts on" : "🔕 Alerts off"; b.setAttribute("aria-pressed", soundOn ? "true" : "false");
  }
  $("adm-sound").addEventListener("click", function () {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (e) { /* ignore */ }
    soundLabel();
    if (soundOn) {
      unlockAudio(); chime();
      if ("Notification" in window && Notification.permission === "default") try { Notification.requestPermission(); } catch (e) { /* ignore */ }
    } else if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    updateEnable();
  });
  $("adm-enable").addEventListener("click", function () {
    unlockAudio(); chime();
    if ("Notification" in window && Notification.permission === "default") try { Notification.requestPermission(); } catch (e) { /* ignore */ }
    var l = pendingOrders(); if (l.length) setTimeout(function () { speak(announceText(l)); }, 1300);
  });
  soundLabel();

  var toastTimer = null;
  function toast(msg, undo) {
    var t = $("adm-toast"); t.textContent = msg;
    if (undo) {
      var u = el("button", "adm-undo", "Undo"); u.type = "button";
      u.addEventListener("click", function () { t.classList.remove("is-on"); undo(); });
      t.appendChild(u);
    }
    t.classList.add("is-on");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("is-on"); }, undo ? 5000 : 2600);
  }

  // ---------- start ----------
  if (!API) { showLogin("The order sheet link is missing (orderLogUrl in meat-menu.js)."); return; }
  if (pass) load(true); else showLogin("");
})();
