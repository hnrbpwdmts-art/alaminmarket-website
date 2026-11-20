/* Super Al-Amin website chat
   ---------------------------------------------------------------------
   A small chat box on every page. Common questions (hours, address,
   delivery, goat days, payment, how to order...) are answered right away
   from the store details in site-config.js and meat-menu.js, so the
   answers stay correct when those files change. Anything else goes to the
   staff page (Chats tab) through /api/chat, and staff replies show up here.
   ===================================================================== */
(function () {
  "use strict";
  if (window.__alaminChat) return;
  window.__alaminChat = true;

  var S = window.SITE || {}, store = S.store || {};
  var ROOT = document.documentElement.getAttribute("data-root") || "";
  var API = "/api/chat";
  var KEY = "alamin-chat-v1", KEEP_MS = 3 * 86400000;
  var STORE_NAME = "Super Al-Amin";

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function track(name, p) { try { if (window.alaminTrack) window.alaminTrack(name, p); } catch (e) { /* ignore */ } }
  function link(path) { return /^(https?:|tel:|sms:|mailto:|\/)/.test(path) ? path : ROOT + path; }

  // ---------- saved conversation ----------
  var state = { id: "", msgs: [], person: false, name: "", phone: "", asked: false, count: 0, at: 0, unread: 0 };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && saved.id && Date.now() - (saved.at || 0) < KEEP_MS) state = Object.assign(state, saved);
  } catch (e) { /* private mode */ }
  function save() {
    state.at = Date.now();
    state.msgs = state.msgs.slice(-80);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function newId() {
    var a = "abcdefghijklmnopqrstuvwxyz0123456789", s = "", r = new Uint8Array(24);
    (window.crypto || window.msCrypto).getRandomValues(r);
    for (var i = 0; i < r.length; i++) s += a[r[i] % a.length];
    return s;
  }

  // ---------- store hours (same format as hoursForGoogle) ----------
  var DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var ranges = {};
  (store.hoursForGoogle || []).forEach(function (line) {
    var m = /^([A-Z][a-z])(?:-([A-Z][a-z]))?\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(String(line).trim());
    if (!m) return;
    var a = DAYS.indexOf(m[1]), b = m[2] ? DAYS.indexOf(m[2]) : a;
    if (a < 0 || b < 0) return;
    for (var d = a; ; d = (d + 1) % 7) { (ranges[d] = ranges[d] || []).push([+m[3] * 60 + +m[4], +m[5] * 60 + +m[6]]); if (d === b) break; }
  });
  function fmt(m) { var h = Math.floor(m / 60), mm = m % 60; return (h % 12 || 12) + (mm ? ":" + (mm < 10 ? "0" : "") + mm : "") + " " + (h >= 12 ? "PM" : "AM"); }
  function nowLA() {
    try {
      var parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
      var get = function (t) { return (parts.filter(function (p) { return p.type === t; })[0] || {}).value; };
      return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), min: (+get("hour") % 24) * 60 + +get("minute") };
    } catch (e) { var d = new Date(); return { day: d.getDay(), min: d.getHours() * 60 + d.getMinutes() }; }
  }
  // { open: bool, text: "Open now until 8 PM" / "Closed now. We open tomorrow at 10 AM." }
  function openState() {
    var n = nowLA(), today = (ranges[n.day] || []).slice().sort(function (x, y) { return x[0] - y[0]; });
    var cur = today.filter(function (r) { return n.min >= r[0] && n.min < r[1]; })[0];
    if (cur) return { open: true, text: "We're open now until " + fmt(cur[1]) + "." };
    var later = today.filter(function (r) { return r[0] > n.min; })[0];
    if (later) return { open: false, text: n.day === 5 && today.some(function (r) { return r[1] <= n.min; })
      ? "We're closed right now for Friday prayer and open again at " + fmt(later[0]) + "."
      : "We're closed right now and open at " + fmt(later[0]) + " today.", opens: fmt(later[0]) };
    var nd = (n.day + 1) % 7, next = (ranges[nd] || []).slice().sort(function (x, y) { return x[0] - y[0]; })[0];
    return { open: false, text: next ? "We're closed right now and open tomorrow at " + fmt(next[0]) + "." : "We're closed right now.", opens: next ? "tomorrow at " + fmt(next[0]) : "" };
  }

  // ---------- menu (for price answers) ----------
  function menu(cb) {
    if (window.MEAT_MENU) return cb(window.MEAT_MENU);
    var s = document.createElement("script");
    s.src = ROOT + "meat-menu.js";
    s.onload = function () { cb(window.MEAT_MENU || null); };
    s.onerror = function () { cb(null); };
    document.head.appendChild(s);
  }
  function itemPrice(it) {
    if (typeof it.price === "number") return it.price;
    if (it.prices) { var v = Object.keys(it.prices).map(function (k) { return it.prices[k]; }).filter(function (x) { return typeof x === "number"; }); if (v.length) return Math.min.apply(null, v); }
    return null;
  }
  function money(n) { return "$" + Number(n).toFixed(2); }

  // ---------- instant answers ----------
  // Each answer is a list of lines. [label](link) becomes a link.
  function phoneLine() { return "Call the store at [" + store.phoneDisplay + "](" + store.phoneLink + ")" + (store.whatsappDisplay ? ", or WhatsApp/text [" + store.whatsappDisplay + "](https://wa.me/" + store.whatsappNumber + ")." : "."); }
  var CATS = { turkey: /turkey|thanksgiving/, chicken: /chicken|murgh|murghi|murgi/, beef: /beef|gosht|cow/, lamb: /lamb/, goat: /goat|bakra|mutton/, veal: /veal/ };
  function catIn(q) { for (var c in CATS) if (CATS[c].test(q)) return c; return ""; }

  var INTENTS = [
    { id: "person", re: /\b(person|human|agent|someone|somebody|staff|representative|real people|talk to|speak to|speak with|talk with)\b/ },
    { id: "status", re: /\b(my order|order status|status|ready yet|haven'?t heard|no (text|reply|response)|did you get|confirm(ed|ation)?)\b/, answer: function () {
      return ["After you send an order, we text you at the number you gave to confirm the exact total and pickup or delivery time.",
        "Haven't heard back within 30 minutes while we're open? Tap Talk to a person, or " + phoneLine().charAt(0).toLowerCase() + phoneLine().slice(1)]; } },
    { id: "turkey", re: /\b(turkey|turkeys|thanksgiving)\b/, answer: function (q, done) {
      menu(function (M) {
        var it = null;
        if (M) M.categories.forEach(function (c) { c.items.forEach(function (x) { if (!it && /turkey/i.test(x.name)) it = x; }); });
        if (!it) return done(["Turkey orders for this season are closed. Thank you! For anything else, " + phoneLine().charAt(0).toLowerCase() + phoneLine().slice(1)]);
        var p = itemPrice(it), est = it.avgWeight ? " (about " + money(p * it.avgWeight) + " each)" : "";
        done(["Yes! " + it.name + ": " + money(p) + "/lb" + (it.note ? ". " + it.note.replace(/\.$/, "") : "") + est + ".",
          "Order ahead online and we'll set it aside for you. [Order a turkey](order/?cat=turkey)"]);
      });
      return null; } },
    { id: "goat", re: /\b(goat|bakra|mutton|veal|baby goat|kid meat)\b/, answer: function () {
      var d = nowLA().day, line = "Fresh baby goat and veal are available on Fridays and Saturdays.";
      var today = d === 5 || d === 6 ? "Today is " + DAY_NAMES[d] + ", so you can get them today." : "You can order ahead any day and choose Friday or Saturday for pickup or delivery.";
      return [line + " " + today, "[Order goat](order/?cat=goat) · [Order veal](order/?cat=veal)"]; } },
    { id: "delivery", re: /\b(deliver|delivers|delivery|deliveries|ship|shipping|uber|doordash|door dash|bring it|drop off)\b/, answer: function () {
      var D = (window.MEAT_MENU || {}).delivery || {};
      return ["Yes, we deliver locally" + (D.maxMiles ? " (up to about " + D.maxMiles + " miles)" : "") + "." +
        (D.minimumOrder ? " Delivery orders need at least $" + D.minimumOrder + " of meat." : "") +
        " You'll see the delivery fee before you send your order, and delivery orders are paid before they go out.",
        (D.times ? "Delivery times: " + D.times.join(", ") + (D.fridayTimes ? " (Fridays: " + D.fridayTimes.join(", ") + ")." : ".") + " " : "") + "[Order for delivery](order/)"]; } },
    { id: "payment", re: /\b(pay|paying|payment|zelle|card|cards|cash|credit|debit|apple pay|google pay|venmo|invoice)\b/, answer: function () {
      return ["You don't pay when you order online. We weigh your meat, then text you the exact total.",
        "Pickup: pay at the store" + (store.zelleDisplay ? " or by Zelle to " + store.zelleDisplay : "") + ". Delivery: paid before it goes out."]; } },
    { id: "halal", re: /\b(halal|zabiha|zabeeha|zabihah|zabeehah|hand ?slaughter(ed)?|certified|certificate|certification|machine)\b/, answer: function () {
      var hand = [];
      var M = window.MEAT_MENU;
      if (M) M.categories.forEach(function (c) { c.items.forEach(function (it) { if (/hand slaughter/i.test(it.name)) hand.push(it.name); }); });
      return ["All our meat is 100% halal, from certified halal suppliers." + (hand.length ? " We also offer " + hand.join(" and ") + "." : ""),
        "For details about a specific item, tap Talk to a person."]; } },
    { id: "price", re: /\b(price|prices|pricing|cost|costs|how much|rate|rates|per lb|per pound|a pound|expensive|cheap)\b|\$/, answer: function (q, done) {
      var cat = catIn(q);
      menu(function (M) {
        var c = M && cat ? M.categories.filter(function (x) { return x.id === cat; })[0] : null;
        if (!c) return done(["All our meat prices are on the order page, and meat is sold by weight, so we text you the exact total. [See prices](order/)"]);
        var lines = c.items.map(function (it) { var p = itemPrice(it); return p == null ? null : "• " + it.name + ": " + (it.prices ? "from " : "") + money(p) + (it.priceUnit === "each" ? " each" : "/lb"); }).filter(Boolean).slice(0, 6);
        done([c.name + " prices today:"].concat(lines).concat(["Meat is sold by weight, so we text you the exact total. [Order " + c.name.toLowerCase() + "](order/?cat=" + c.id + ")"]));
      });
      return null; } },
    { id: "hours", re: /\b(hours?|open|opening|opens|close|closed|closes|closing|timing|timings|what time|friday prayer|jummah|jumma|prayer)\b/, answer: function () {
      return [openState().text, (store.hoursSummary || "") + (store.fridayNote ? ". " + store.fridayNote + "." : "."), "Meat pickup times run until 7 PM."]; } },
    { id: "location", re: /\b(where|address|location|located|directions?|map|parking|find you|come in)\b/, answer: function () {
      return ["We're at " + store.street + ", " + store.city + ", " + store.state + " " + store.zip + ".", "[Get directions](" + store.directionsLink + ")"]; } },
    { id: "sameday", re: /\b(same day|same-day|today|tonight|how soon|how long|ready by|ready in|pick ?up time|pickup times?)\b/, answer: function () {
      var P = (window.MEAT_MENU || {}).pickup || {};
      return ["Order by 6 PM for same-day pickup.", P.times ? "Pickup times: " + P.times.join(", ") + (P.fridayTimes ? " (Fridays: " + P.fridayTimes.join(", ") + ")." : ".") : "", "[Order now](order/)"]; } },
    { id: "cuts", re: /\b(cut|cuts|cutting|curry|pieces|boneless|bone-in|bbq|mince|minced|ground|keema|qeema|kima|chops|whole|packing|packs?)\b/, answer: function () {
      return ["You choose the cut and packing for every item when you order (for example curry pieces, boneless, or whole). Need something different? Use the special request box.", "[Order now](order/)"]; } },
    { id: "order", re: /\b(order|ordering|buy|purchase|online|website|pre-?order|reserve)\b|how (do|can) i (get|order)/, answer: function () {
      return ["Ordering takes about a minute:", "1. Pick your meat and how you want it cut", "2. Enter your name and mobile number", "3. Send, and we text you to confirm your total and pickup time", "[Start an order](order/)"]; } },
    { id: "groceries", re: /\b(samosas?|chai|tea|patties|grocery|groceries|spices?|masala|rice|atta|flour|dal|daal|lentils?|snacks?|pickles?|achar|paan|produce|vegetables?|sweets?|mithai)\b/, answer: function () {
      return ["We carry Pakistani, Indian and Sri Lankan groceries, plus samosas and chai at the store. [See groceries](groceries/)",
        "Stock changes, so for a specific item, tap Talk to a person and we'll check."]; } },
    { id: "contact", re: /\b(phone|call|number|whatsapp|text you|contact|email)\b/, answer: function () { return [phoneLine(), "Or ask here and our team will reply."]; } },
    { id: "thanks", re: /\b(thanks|thank you|thankyou|thx|jazak ?allah|jazakallah|shukriya|shukria)\b/, answer: function () { return ["You're welcome! Anything else?"]; } },
    { id: "hello", re: /^(hi|hii+|hello|hey|salam|salaam|assalam|as-?salaam?u|aoa|asalam|slam)\b/, answer: function () { return ["Wa alaikum assalam! 👋 What can we help you with?"]; } }
  ];
  // Questions about stock today go to a person ("do you have X today?")
  var STOCK = /\b(do you have|have any|in stock|available|availability|got any|still have)\b/;

  function matchIntents(q) {
    var hits = INTENTS.filter(function (i) { return i.re.test(q); });
    if (hits.some(function (h) { return h.id === "person"; })) return [INTENTS[0]];
    var real = hits.filter(function (h) { return h.id !== "thanks" && h.id !== "hello"; });
    // "halal turkey price?" → the turkey answer already covers halal and price
    if (real.some(function (h) { return h.id === "turkey" || h.id === "goat"; }))
      real = real.filter(function (h) { return h.id !== "halal" && h.id !== "price"; });
    if (real.length) {
      if (STOCK.test(q) && !real.some(function (h) { return /turkey|goat|delivery|hours|location|payment|halal|groceries|price/.test(h.id); })) return [];
      return real.slice(0, 2);
    }
    if (hits.length && q.split(/\s+/).length <= 5) return hits.slice(0, 1);
    return [];
  }

  // ---------- page elements ----------
  var launcher = el("button", "chat-launcher"); launcher.type = "button";
  launcher.setAttribute("aria-label", "Chat with us");
  launcher.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/></svg><span class="chat-launcher-text">Questions?</span>';
  var badge = el("span", "chat-badge"); badge.hidden = true; launcher.appendChild(badge);

  var panel = el("section", "chat-panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Chat with " + STORE_NAME); panel.hidden = true;
  var head = el("div", "chat-head");
  var headText = el("div", "chat-head-text");
  headText.appendChild(el("strong", null, STORE_NAME));
  var headSub = el("span", "chat-head-sub"); headText.appendChild(headSub);
  var closeBtn = el("button", "chat-close"); closeBtn.type = "button"; closeBtn.setAttribute("aria-label", "Close chat");
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  head.appendChild(headText); head.appendChild(closeBtn);
  var log = el("div", "chat-log"); log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");
  var chips = el("div", "chat-chips");
  var form = el("form", "chat-form"); form.setAttribute("novalidate", "");
  var input = el("textarea", "chat-input"); input.rows = 1; input.placeholder = "Type your question…"; input.setAttribute("aria-label", "Your question"); input.maxLength = 1000;
  var trap = el("input"); trap.type = "text"; trap.name = "website"; trap.tabIndex = -1; trap.autocomplete = "off"; trap.className = "chat-trap"; trap.setAttribute("aria-hidden", "true");
  var sendBtn = el("button", "chat-send"); sendBtn.type = "submit"; sendBtn.setAttribute("aria-label", "Send");
  sendBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2-7z"/></svg>';
  form.appendChild(input); form.appendChild(trap); form.appendChild(sendBtn);
  panel.appendChild(head); panel.appendChild(log); panel.appendChild(chips); panel.appendChild(form);

  function mount() {
    document.body.appendChild(launcher); document.body.appendChild(panel);
    place(); setInterval(place, 800); window.addEventListener("resize", place);
    if (state.unread) showBadge();
    if (state.person && state.id) startPolling(false);
  }

  // Sit above the phone's bottom bar and the cart button, whatever is showing
  function place() {
    var gap = 0;
    [".quick-actions", ".cart-bar"].forEach(function (sel) {
      var e = document.querySelector(sel);
      if (!e) return;
      var cs = getComputedStyle(e), r = e.getBoundingClientRect();
      if (cs.display === "none" || cs.visibility === "hidden" || e.hidden || r.height === 0 || r.top >= innerHeight) return;
      gap = Math.max(gap, innerHeight - r.top);
    });
    document.documentElement.style.setProperty("--chat-bottom", (gap + 14) + "px");
  }

  // ---------- drawing messages ----------
  function addText(p, text) {
    var re = /\[([^\]]+)\]\(([^)\s]+)\)/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) p.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = el("a", null, m[1]); a.href = link(m[2]);
      if (/^https?:/.test(m[2]) && m[2].indexOf(location.host) < 0) { a.target = "_blank"; a.rel = "noopener"; }
      a.addEventListener("click", function () { track("chat_link", { to: this.getAttribute("href") }); });
      p.appendChild(a); last = re.lastIndex;
    }
    if (last < text.length) p.appendChild(document.createTextNode(text.slice(last)));
  }
  function bubble(m) {
    var wrap = el("div", "chat-msg chat-" + m.from);
    if (m.from === "store") wrap.appendChild(el("span", "chat-who", STORE_NAME));
    var b = el("div", "chat-bubble");
    (m.lines || [m.text]).forEach(function (line) {
      if (!line) return;
      var p = el("p");
      if (m.from === "bot" || m.from === "sys") addText(p, line); else p.textContent = line;
      b.appendChild(p);
    });
    wrap.appendChild(b);
    if (m.failed) {
      var retry = el("button", "chat-retry", "Not sent. Tap to try again"); retry.type = "button";
      retry.addEventListener("click", function () { m.failed = false; wrap.remove(); sendToStaff(m.text, m); });
      wrap.appendChild(retry);
    }
    return wrap;
  }
  function render() {
    log.textContent = "";
    state.msgs.forEach(function (m) { log.appendChild(bubble(m)); });
    if (state.person && !state.asked) log.appendChild(contactCard());
    renderChips();
    scrollDown();
  }
  function scrollDown() { requestAnimationFrame(function () { log.scrollTop = log.scrollHeight; }); }
  function push(m, keep) {
    m.at = m.at || new Date().toISOString();
    state.msgs.push(m); if (keep !== false) save();
    log.insertBefore(bubble(m), log.querySelector(".chat-contact"));   // the contact card stays last
    scrollDown();
  }
  function typing(then) {
    var t = el("div", "chat-msg chat-bot chat-typing"); t.appendChild(el("div", "chat-bubble", "…"));
    log.appendChild(t); scrollDown();
    setTimeout(function () { t.remove(); then(); }, 450);
  }

  var START_CHIPS = [["Hours", "What are your hours?"], ["Delivery", "Do you deliver?"], ["How to order", "How do I order?"],
    ["Goat & veal days", "When do you have goat?"], ["Payment", "How do I pay?"], ["Prices", "What are your prices?"]];
  function renderChips() {
    chips.textContent = "";
    var list = state.person ? [] : START_CHIPS.slice();
    list.forEach(function (c) {
      var b = el("button", "chat-chip", c[0]); b.type = "button";
      b.addEventListener("click", function () { ask(c[1], true); });
      chips.appendChild(b);
    });
    if (!state.person && personOK !== false) {
      var p = el("button", "chat-chip chat-chip-person", "💬 Talk to a person"); p.type = "button";
      p.addEventListener("click", function () { goPerson(""); });
      chips.appendChild(p);
    }
    chips.hidden = !chips.children.length;
  }

  // ---------- asking ----------
  function ask(q, fromChip) {
    q = String(q || "").trim();
    if (!q) return;
    push({ from: "me", text: q });
    if (state.person) { sendToStaff(q, state.msgs[state.msgs.length - 1]); return; }
    var lower = q.toLowerCase().replace(/[’']/g, "'");
    var hits = matchIntents(lower);
    track("chat_question", { matched: hits.map(function (h) { return h.id; }).join(",") || "none", chip: !!fromChip });
    if (!hits.length) { typing(function () { goPerson(q); }); return; }
    if (hits[0].id === "person") { typing(function () { goPerson(""); }); return; }
    var pending = hits.length;
    var answers = [];
    hits.forEach(function (h, i) {
      var out = h.answer(lower, function (lines) { answers[i] = lines; if (--pending === 0) finish(); });
      if (out) { answers[i] = out; if (--pending === 0) finish(); }
    });
    function finish() {
      typing(function () {
        answers.forEach(function (lines) { push({ from: "bot", lines: lines.filter(Boolean) }); });
      });
    }
  }

  // Is the staff side switched on? (The order sheet's script must be updated
  // for chats.) Checked once, when the chat opens. Until it is, questions for
  // a person get the store's phone numbers instead, and this turns on by
  // itself as soon as the script is updated.
  var personOK = null, checking = null;
  function checkPerson(cb) {
    if (personOK !== null || state.person) { if (state.person) personOK = true; return cb && cb(); }
    if (!checking) checking = post({ action: "poll", chatId: state.id || newId(), after: 0 })
      .then(function (res) { personOK = !!(res && res.ok); })
      .catch(function () { personOK = false; })
      .then(function () { checking = null; renderChips(); });
    checking.then(function () { if (cb) cb(); });
  }
  function goPerson(question) {
    if (personOK === null && !state.person) { checkPerson(function () { goPerson(question); }); return; }
    if (personOK === false && !state.person) {
      push({ from: "bot", lines: [(question ? "Good question! " : "") + "For that, please " + phoneLine().charAt(0).toLowerCase() + phoneLine().slice(1) + " We'll help you right away."] });
      track("chat_person_off");
      return;
    }
    state.person = true;
    if (!state.id) state.id = newId();
    var o = openState();
    push({ from: "bot", lines: question
      ? ["I'll pass your question to our team."]
      : ["Sure! Type your question, and someone from our team will reply right here."] });
    push({ from: "sys", lines: [o.open
      ? "We usually reply within a few minutes while the store is open."
      : o.text + " We'll reply when we open" + (state.phone ? ", and text you at " + state.phone + "." : ". Leave your mobile number so we can text you.")] });
    renderChips();
    if (!state.asked) log.appendChild(contactCard());
    scrollDown();
    track("chat_person", { open: o.open });
    if (question) sendToStaff(question, state.msgs.filter(function (m) { return m.from === "me"; }).pop());
    else setTimeout(function () { input.focus(); }, 50);
    save();
  }

  // Optional name + number, so staff can text back if the customer leaves the page
  function contactCard() {
    var card = el("div", "chat-contact");
    card.appendChild(el("p", "chat-contact-title", "So we can text you if you leave this page (optional):"));
    var n = el("input"); n.type = "text"; n.placeholder = "Your name"; n.autocomplete = "name"; n.value = state.name || ""; n.maxLength = 60;
    var p = el("input"); p.type = "tel"; p.placeholder = "Mobile number"; p.autocomplete = "tel"; p.inputMode = "tel"; p.value = state.phone || ""; p.maxLength = 20;
    var err = el("p", "chat-contact-err"); err.hidden = true;
    var row = el("div", "chat-contact-btns");
    var ok = el("button", "chat-contact-ok", "Save"); ok.type = "button";
    var skip = el("button", "chat-contact-skip", "Skip"); skip.type = "button";
    row.appendChild(ok); row.appendChild(skip);
    [n, p, err, row].forEach(function (x) { card.appendChild(x); });
    ok.addEventListener("click", function () {
      var digits = p.value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
      if (p.value.trim() && (digits.length !== 10 || /^[01]/.test(digits) || digits.slice(3, 6) === "555")) {
        err.textContent = "Please check the mobile number (10 digits)."; err.hidden = false; p.focus(); return;
      }
      state.name = n.value.trim(); state.phone = digits ? "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6) : "";
      state.asked = true; save(); card.remove();
      push({ from: "sys", lines: [state.phone ? "Thanks" + (state.name ? ", " + state.name.split(" ")[0] : "") + "! If you leave, we'll text you at " + state.phone + "." : "Thanks!"] });
      // let staff see who this is, even if the question was already sent
      if (state.id && state.msgs.some(function (m) { return m.from === "me" && m.sent; }) && (state.name || state.phone))
        sendToStaff("(Contact: " + [state.name, state.phone].filter(Boolean).join(", ") + ")", null, true);
    });
    skip.addEventListener("click", function () { state.asked = true; save(); card.remove(); });
    return card;
  }

  // ---------- talking to staff ----------
  var pollTimer = null, pollUntil = 0, polling = false;
  function post(body) {
    return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function sendToStaff(text, msgObj, quiet) {
    if (!state.id) state.id = newId();
    var page = location.pathname;
    post({ action: "send", chatId: state.id, text: text, name: state.name, phone: state.phone, page: page, after: state.count, website: trap.value })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || "send");
        if (msgObj) { msgObj.sent = true; }
        take(res, true);
        save(); startPolling(true);
      })
      .catch(function () {
        if (quiet) return;
        if (msgObj) { msgObj.failed = true; save(); render(); }
        push({ from: "sys", lines: ["Sorry, that didn't go through. Please try again, or " + phoneLine().charAt(0).toLowerCase() + phoneLine().slice(1)] }, false);
      });
  }
  // New messages from the sheet: show store replies (customer messages are already on screen)
  function take(res, fromSend) {
    var list = res.messages || [];
    state.count = Number(res.count) || state.count;
    var gotReply = false;
    list.forEach(function (m) {
      if (m.from !== "Store") return;
      gotReply = true;
      push({ from: "store", text: m.text, at: m.at });
    });
    if (gotReply) {
      pollUntil = Date.now() + 30 * 60000;
      if (panel.hidden) { state.unread = (state.unread || 0) + list.filter(function (m) { return m.from === "Store"; }).length; showBadge(); }
      save();
    }
  }
  function startPolling(fresh) {
    if (fresh) pollUntil = Date.now() + 30 * 60000;
    else if (!pollUntil) pollUntil = Date.now() + 5 * 60000;
    if (!pollTimer) schedule(1500);
  }
  function schedule(ms) { clearTimeout(pollTimer); pollTimer = setTimeout(poll, ms); }
  function poll() {
    pollTimer = null;
    if (!state.id || Date.now() > pollUntil) return;
    if (document.hidden) { schedule(15000); return; }
    if (polling) { schedule(5000); return; }
    polling = true;
    post({ action: "poll", chatId: state.id, after: state.count })
      .then(function (res) { if (res && res.ok) take(res); })
      .catch(function () { /* try again next time */ })
      .then(function () { polling = false; schedule(panel.hidden ? 20000 : 6000); });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && state.person && state.id) { if (Date.now() > pollUntil) pollUntil = Date.now() + 5 * 60000; schedule(500); } });

  // ---------- open / close ----------
  function showBadge() { badge.textContent = String(state.unread || ""); badge.hidden = !state.unread; launcher.classList.toggle("has-unread", !!state.unread); }
  function open() {
    panel.hidden = false; launcher.classList.add("is-open"); document.body.classList.add("chat-open");
    state.unread = 0; showBadge(); save();
    menu(function () { /* load prices and times for answers */ });
    checkPerson();
    var o = openState();
    headSub.textContent = o.open ? "Open now · usually replies in minutes" : "Closed now · we'll reply when we open";
    if (!state.msgs.length) {
      state.msgs.push({ from: "bot", lines: ["Assalamu alaikum! 👋 Ask us anything, or tap a question below."], at: new Date().toISOString() });
      save();
    }
    render();
    if (state.person && state.id) startPolling(false), schedule(300);
    if (!/iPhone|iPad|Android/i.test(navigator.userAgent)) setTimeout(function () { input.focus(); }, 50);
    track("chat_open");
  }
  function close() { panel.hidden = true; launcher.classList.remove("is-open"); document.body.classList.remove("chat-open"); launcher.focus(); }
  launcher.addEventListener("click", function () { if (panel.hidden) open(); else close(); });
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) close(); });
  form.addEventListener("submit", function (e) { e.preventDefault(); var v = input.value; input.value = ""; grow(); ask(v); });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit")); } });
  function grow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 110) + "px"; }
  input.addEventListener("input", grow);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  window.alaminChat = { open: open, close: close };
})();
