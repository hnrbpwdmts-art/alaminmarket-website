/**
 * Super Al-Amin: saves online meat orders to this Google Sheet.
 * Setup steps are in backend/README.md. Paste this whole file into
 * Extensions > Apps Script in your orders Google Sheet.
 *
 * Every order (website, WhatsApp, and text) is also emailed to NOTIFY_EMAIL
 * below, as a backup in case nobody is near the store phone.
 *
 * Tabs created automatically:
 *   Orders     one row per order
 *   Items      one row per item (best for "what sells" research)
 *   Customers  one row per phone number: first/last order, order count, opt-in
 */

// Website orders are emailed here. Separate several addresses with commas.
var NOTIFY_EMAIL = "Muhammad@alaminmarket.com";

// Passcode for the staff order page (alaminmarket.com/admin/).
// Change it to your own: at least 8 characters, letters and numbers.
// Leave it as "" to turn the order page off.
var ADMIN_PASSCODE = "";

// Phone call reminders for new website orders (needs Twilio; see backend/README.md).
// CALL_SECRET must be the same text as CALL_SECRET in Cloudflare. "" = calls off.
var CALL_SECRET = "";
var CALL_URL = "https://alaminmarket.com/api/call-order";
var SMS_URL = "https://alaminmarket.com/api/sms";        // texts (deals, welcome, replies) go through here
var SMS_FORCE_READY = false;     // texting turns on by itself when Twilio approves the campaign; set true only if the staff page still says "waiting" after approval
var DEAL_HOURS = [9, 20];        // deals only go out between 9 AM and 8 PM (store time)
var WELCOME_TEXT = "Super Al-Amin Halal Market: You're signed up for deals, about 2-4 msgs/month. Msg & data rates may apply. Reply HELP for help, STOP to opt out.";
var CALL_EVERY_MINUTES = 5;   // wait between calls
var CALL_LANDLINE_TRIES = 5;  // store landline first...
var CALL_CELL_TRIES = 3;      // ...then the backup cell phone
var CALL_CHANNELS = ["Website", "WhatsApp", "Text"]; // remove a channel to stop its calls
// Calls only happen while the store is open (store time, 24-hour clock)
var CALL_HOURS = ["Mo-Th 10:00-20:00", "Fr 10:00-12:15", "Fr 13:15-20:00", "Sa-Su 10:00-20:00"];

var ORDER_HEADERS = ["Sent at", "Order #", "Channel", "Pickup/Delivery", "Pickup date", "Time", "Name", "Phone",
  "Address", "Items", "Item count", "Estimated total", "All items priced", "Notes",
  "Texts opt-in", "Opt-in wording", "Source", "Device", "Status", "Final total", "Status updated",
  "Call status", "Call tries", "Last call"];
// Order statuses used by the staff order page
var CHAT_HEADERS = ["Time", "Chat ID", "From", "Name", "Phone", "Message", "Page"];
var CHAT_EMAIL_EVERY_MINUTES = 15; // email the store about a chat at most this often (per chat)
var STATUSES = ["New", "Confirmed", "Ready", "Out for delivery", "Done", "Cancelled"];
var ITEM_HEADERS = ["Sent at", "Order #", "Category", "Item", "Choices", "Special request",
  "Amount", "Unit", "Price", "Price per", "Estimate"];
var CUSTOMER_HEADERS = ["Phone", "Name", "First order", "Last order", "Orders", "Texts opt-in",
  "Opt-in date", "Opt-in wording", "Email", "Signed up from", "Opted out"];
var DEAL_HEADERS = ["Time", "Message", "Recipients", "Sent", "Failed", "Test", "Failures"];

function doPost(e) {
  var parsed = null;
  try { parsed = JSON.parse(e.postData.contents); } catch (err) { /* not JSON */ }
  if (parsed && parsed.admin) return adminRequest(parsed);
  if (parsed && parsed.callAck) return callAck(parsed);
  if (parsed && parsed.chat) return chatRequest(parsed);
  if (parsed && parsed.subscribe) return subscribe(parsed);
  if (parsed && parsed.smsIn) return smsIn(parsed);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    if (!d || !d.orderNumber || !Array.isArray(d.items)) return reply("ignored");
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var when = d.sentAt ? new Date(d.sentAt) : new Date();
    var phone = cleanPhone(d.phone);

    var itemsText = d.items.map(function (it) {
      return it.item + " (" + it.choices + ") " + it.qty + (it.unit === "lb" ? " lb" : "");
    }).join("; ");

    var orders = sheet(ss, "Orders", ORDER_HEADERS);
    ensureHeaders(orders, ORDER_HEADERS);
    orders.appendRow([
      when, d.orderNumber, d.channel + (d.update ? " (UPDATE)" : ""), d.mode, d.date || d.day, d.time, safe(d.name), asText(phone),
      safe(d.address), safe(itemsText), d.itemCount, d.estimatedTotal, d.allPriced ? "Yes" : "No",
      safe(d.notes), d.marketingOptIn ? "Yes" : "No", safe(d.optInText), safe(d.source), d.device
    ]);
    if (CALL_SECRET && CALL_CHANNELS.indexOf(d.channel) > -1) startCalls(orders, d.orderNumber);

    var itemSheet = sheet(ss, "Items", ITEM_HEADERS);
    d.items.forEach(function (it) {
      itemSheet.appendRow([when, d.orderNumber, it.category, safe(it.item), safe(it.choices),
        safe(it.special), it.qty, it.unit, it.price, it.priceUnit, it.estimate]);
    });

    // An update to an order already sent doesn't count as a new order
    if (phone && !d.update) updateCustomer(sheet(ss, "Customers", CUSTOMER_HEADERS), phone, d, when);

    // Email alert for every order (website, WhatsApp, and text) as a backup
    if (d.notify && NOTIFY_EMAIL) {
      try { emailOrder(d, phone); return reply("ok emailed"); }
      catch (mailErr) { return reply("ok email-failed"); }
    }
    return reply("ok");
  } catch (err) {
    return reply("error");
  } finally {
    lock.releaseLock();
  }
}

function emailOrder(d, phone) {
  var digits = phone.replace(/\D/g, "");
  var name = String(d.name || "").slice(0, 80);
  var via = d.channel === "WhatsApp" ? "WhatsApp" : d.channel === "Text" ? "text" : "website";
  var subject = (d.update ? "UPDATED " + via + " order " : "New " + via + " order ") + d.orderNumber + " – " + name + " (" +
    (d.mode === "delivery" ? "Delivery" : "Pickup") + " " + (d.day || "") + ", " + (d.time || "") + ")";
  var body = String(d.message || "").slice(0, 6000);
  if (d.update) body = "This REPLACES the earlier version of order " + d.orderNumber + ". Use this one.\n\n" + body;
  if (via !== "website") body = "The customer chose to send this order by " + via + ". It should also arrive on the store " +
    (via === "WhatsApp" ? "WhatsApp" : "phone as a text") + ". If it doesn't, the customer may not have pressed send, so please call them to check.\n\n" + body;
  var links = phone ? '<p style="font-size:16px">Contact ' + esc(name) + ': ' +
    '<a href="tel:' + phone + '">Call</a> &nbsp;·&nbsp; ' +
    '<a href="sms:' + phone + '">Text</a> &nbsp;·&nbsp; ' +
    '<a href="https://wa.me/' + digits + '">WhatsApp</a></p>' : "";
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: subject,
    body: body + (phone ? "\n\nCustomer phone: " + phone : ""),
    htmlBody: links + '<pre style="font-family:inherit;font-size:15px;white-space:pre-wrap">' + esc(body) + "</pre>" +
      '<p style="color:#666;font-size:13px">Saved to the Orders tab of your order sheet.</p>',
    name: "Super Al-Amin Website"
  });
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// A quick check that the link works: opening it in a browser shows this.
function doGet() { return reply("Super Al-Amin order log is running."); }

function updateCustomer(sh, phone, d, when) {
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).replace(/^'/, "") === phone) {
      var row = r + 1;
      sh.getRange(row, 2).setValue(safe(d.name));
      if (!values[r][2]) sh.getRange(row, 3).setValue(when);   // signed up for deals before ordering
      sh.getRange(row, 4).setValue(when);
      sh.getRange(row, 5).setValue((Number(values[r][4]) || 0) + 1);
      // Opting in is recorded; it is never switched off here. Remove a number
      // by hand (change "Yes" to "No") when someone replies STOP.
      if (d.marketingOptIn && values[r][5] !== "Yes") {
        sh.getRange(row, 6, 1, 3).setValues([["Yes", when, safe(d.optInText)]]);
        welcomeText(phone);
      }
      return;
    }
  }
  sh.appendRow([asText(phone), safe(d.name), when, when, 1, d.marketingOptIn ? "Yes" : "No",
    d.marketingOptIn ? when : "", d.marketingOptIn ? safe(d.optInText) : ""]);
  if (d.marketingOptIn) welcomeText(phone);
}

function sheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  return sh;
}

// Phone numbers stored as text like +13105550123 so Sheets doesn't turn them into math
function cleanPhone(p) {
  var digits = String(p || "").replace(/\D/g, "");
  if (digits.length === 10) digits = "1" + digits;
  return digits ? "+" + digits : "";
}

function asText(phone) { return phone ? "'" + phone : ""; }

// Stop text that starts with = + - @ from being treated as a formula
function safe(v) {
  var s = v == null ? "" : String(v).slice(0, 1000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(text) { return ContentService.createTextOutput(text); }

// Older sheets: add any new column titles (like Status) to the end of the header row
function ensureHeaders(sh, headers) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var have = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var missing = headers.filter(function (h) { return have.indexOf(h) === -1; });
  if (missing.length) {
    sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight("bold");
  }
}

/* ---------------- Staff order page (alaminmarket.com/admin/) ---------------- */

function jsonReply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function adminRequest(d) {
  if (!ADMIN_PASSCODE || ADMIN_PASSCODE.length < 8) return jsonReply({ ok: false, error: "not_set" });
  // After 10 wrong passcodes, the page is locked for 15 minutes
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get("adminFails") || 0);
  if (fails >= 10) return jsonReply({ ok: false, error: "locked" });
  if (String(d.passcode || "") !== ADMIN_PASSCODE) {
    cache.put("adminFails", String(fails + 1), 900);
    return jsonReply({ ok: false, error: "wrong_passcode" });
  }
  try {
    if (d.action === "list") return jsonReply({ ok: true, orders: listOrders(Number(d.days) || 14), statuses: STATUSES });
    if (d.action === "status") return jsonReply(setStatus(d));
    if (d.action === "chats") return jsonReply({ ok: true, chats: listChats(Number(d.days) || 3) });
    if (d.action === "chatReply") return jsonReply(chatReply(d));
    if (d.action === "dealInfo") return jsonReply(dealInfo());
    if (d.action === "sendDeal") return jsonReply(sendDeal(d));
    return jsonReply({ ok: true });
  } catch (err) {
    return jsonReply({ ok: false, error: "server", detail: String(err).slice(0, 200) });
  }
}

function colMap(sh) {
  var head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  var m = {};
  head.forEach(function (h, i) { m[h] = i; });
  return m;
}

function isoDay(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, "yyyy-MM-dd");
  var s = String(v || "");
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : "";
}

// Recent orders (newest version of each order number), for the staff page
function listOrders(days) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Orders");
  if (!sh || sh.getLastRow() < 2) return [];
  ensureHeaders(sh, ORDER_HEADERS);
  var tz = ss.getSpreadsheetTimeZone() || "America/Los_Angeles";
  var c = colMap(sh);
  var first = Math.max(2, sh.getLastRow() - 1500);
  var rows = sh.getRange(first, 1, sh.getLastRow() - first + 1, sh.getLastColumn()).getValues();
  var today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var since = new Date(Date.now() - Math.min(Math.max(days, 1), 60) * 86400000);
  var byNum = {}, order = [];
  rows.forEach(function (r) {
    var num = String(r[c["Order #"]] || "");
    if (!num) return;
    var sent = r[c["Sent at"]] instanceof Date ? r[c["Sent at"]] : new Date(r[c["Sent at"]]);
    var pickup = isoDay(r[c["Pickup date"]], tz);
    if (!(sent >= since) && !(pickup && pickup >= today)) return;
    var channel = String(r[c["Channel"]] || "");
    var prev = byNum[num];
    var o = {
      num: num,
      sentAt: isNaN(sent) ? "" : sent.toISOString(),
      channel: channel.replace(" (UPDATE)", ""),
      updated: (prev ? prev.updated : false) || channel.indexOf("(UPDATE)") > -1,
      mode: String(r[c["Pickup/Delivery"]] || ""),
      date: pickup,
      dayText: pickup ? "" : String(r[c["Pickup date"]] || ""),
      time: String(r[c["Time"]] || ""),
      name: String(r[c["Name"]] || ""),
      phone: String(r[c["Phone"]] || "").replace(/^'/, ""),
      address: String(r[c["Address"]] || ""),
      items: String(r[c["Items"]] || ""),
      itemCount: r[c["Item count"]],
      estimate: r[c["Estimated total"]],
      notes: String(r[c["Notes"]] || ""),
      status: String(r[c["Status"]] || "") || "New",
      finalTotal: r[c["Final total"]] === "" || r[c["Final total"]] == null ? "" : r[c["Final total"]],
      statusAt: r[c["Status updated"]] instanceof Date ? r[c["Status updated"]].toISOString() : "",
      callStatus: String(r[c["Call status"]] || "")
    };
    // A later "UPDATE" row replaces the earlier one and needs a fresh look
    if (prev && channel.indexOf("(UPDATE)") > -1 && !String(r[c["Status"]] || "")) o.status = "New";
    if (!prev) order.push(num);
    byNum[num] = o;
  });
  return order.map(function (n) { return byNum[n]; }).reverse();
}

function setStatus(d) {
  var status = String(d.status || "");
  if (STATUSES.indexOf(status) === -1) return { ok: false, error: "bad_status" };
  var num = String(d.order || "");
  if (!/^[A-Z]{0,3}\d{4}-\d{3}$/.test(num)) return { ok: false, error: "bad_order" };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName("Orders");
    if (!sh) return { ok: false, error: "no_sheet" };
    ensureHeaders(sh, ORDER_HEADERS);
    var c = colMap(sh), last = sh.getLastRow(), found = 0, now = new Date();
    var nums = sh.getRange(2, c["Order #"] + 1, Math.max(last - 1, 1), 1).getValues();
    var total = d.finalTotal === "" || d.finalTotal == null ? null : Number(d.finalTotal);
    for (var i = 0; i < nums.length; i++) {
      if (String(nums[i][0]) !== num) continue;
      var row = i + 2;
      sh.getRange(row, c["Status"] + 1).setValue(status);
      sh.getRange(row, c["Status updated"] + 1).setValue(now);
      if (total != null && !isNaN(total)) sh.getRange(row, c["Final total"] + 1).setValue(total);
      // Staff looked at it on the order page: no more reminder calls
      if (status !== "New" && String(sh.getRange(row, c["Call status"] + 1).getValue()) === "Calling") {
        sh.getRange(row, c["Call status"] + 1).setValue("Seen on order page");
      }
      found++;
    }
    return found ? { ok: true, status: status, statusAt: now.toISOString() } : { ok: false, error: "not_found" };
  } finally {
    lock.releaseLock();
  }
}


/* ---------------- Phone call reminders for new orders ---------------- */
/* How it works: a new website order is marked "Calling". checkCalls() runs
   every minute (set up once with setupCallReminders). While the store is open
   it rings the landline every few minutes, then the backup cell, until someone
   presses 1 on the call or marks the order on the staff page. */

function startCalls(sh, num) {
  ensureHeaders(sh, ORDER_HEADERS);
  var c = colMap(sh), last = sh.getLastRow();
  // An updated order replaces any earlier call for the same order number
  var nums = sh.getRange(2, c["Order #"] + 1, Math.max(last - 2, 1), 1).getValues();
  for (var i = 0; i < nums.length && i + 2 < last; i++) {
    if (String(nums[i][0]) === String(num) && String(sh.getRange(i + 2, c["Call status"] + 1).getValue()) === "Calling") {
      sh.getRange(i + 2, c["Call status"] + 1).setValue("Replaced by update");
    }
  }
  sh.getRange(last, c["Call status"] + 1, 1, 2).setValues([["Calling", 0]]);
  PropertiesService.getScriptProperties().setProperty("callsPending", "1");
}

function callAck(d) {
  if (!CALL_SECRET || String(d.secret || "") !== CALL_SECRET) return reply("forbidden");
  var num = String(d.order || "");
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");
    if (!sh) return reply("ok none");
    ensureHeaders(sh, ORDER_HEADERS);
    var c = colMap(sh), last = sh.getLastRow(), found = 0;
    var nums = sh.getRange(2, c["Order #"] + 1, Math.max(last - 1, 1), 1).getValues();
    for (var i = 0; i < nums.length; i++) {
      if (String(nums[i][0]) !== num) continue;
      if (String(sh.getRange(i + 2, c["Call status"] + 1).getValue()) === "Calling") {
        sh.getRange(i + 2, c["Call status"] + 1).setValue("Confirmed by phone");
        sh.getRange(i + 2, c["Last call"] + 1).setValue(new Date());
      }
      found++;
    }
    return reply(found ? "ok call-confirmed" : "ok none");
  } finally {
    lock.releaseLock();
  }
}

function storeOpenNow(now) {
  now = now || new Date();
  var parts = Utilities.formatDate(now, "America/Los_Angeles", "u HH:mm").split(" ");
  var dayNum = Number(parts[0]) % 7;           // 1=Mon ... 7=Sun -> 0=Sun
  var hm = parts[1].split(":"), mins = Number(hm[0]) * 60 + Number(hm[1]);
  var DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return CALL_HOURS.some(function (line) {
    var m = /^([A-Z][a-z])(?:-([A-Z][a-z]))?\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(line);
    if (!m) return false;
    var a = DAYS.indexOf(m[1]), b = m[2] ? DAYS.indexOf(m[2]) : a, inDays = false;
    for (var d = a; ; d = (d + 1) % 7) { if (d === dayNum) inDays = true; if (d === b) break; }
    var open = Number(m[3]) * 60 + Number(m[4]), close = Number(m[5]) * 60 + Number(m[6]);
    return inDays && mins >= open && mins < close;
  });
}

function spokenDay(v) {
  var tz = "America/Los_Angeles";
  var iso = isoDay(v, tz);
  if (!iso) return String(v || "");
  var today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var tomorrow = Utilities.formatDate(new Date(Date.now() + 86400000), tz, "yyyy-MM-dd");
  if (iso === today) return "today";
  if (iso === tomorrow) return "tomorrow";
  var p = iso.split("-");
  return Utilities.formatDate(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12), tz, "EEEE, MMMM d");
}

// Runs every minute (see setupCallReminders)
function checkCalls() {
  if (!CALL_SECRET) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("callsPending") !== "1") return;   // nothing waiting: quick exit
  if (!storeOpenNow()) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");
    if (!sh || sh.getLastRow() < 2) { props.deleteProperty("callsPending"); return; }
    ensureHeaders(sh, ORDER_HEADERS);
    var c = colMap(sh), first = Math.max(2, sh.getLastRow() - 500);
    var rows = sh.getRange(first, 1, sh.getLastRow() - first + 1, sh.getLastColumn()).getValues();
    var now = new Date(), waiting = 0, placed = false, maxTries = CALL_LANDLINE_TRIES + CALL_CELL_TRIES;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], row = first + i;
      if (String(r[c["Call status"]]) !== "Calling") continue;
      var tries = Number(r[c["Call tries"]]) || 0;
      var lastCall = r[c["Last call"]] instanceof Date ? r[c["Last call"]] : null;
      var sent = r[c["Sent at"]] instanceof Date ? r[c["Sent at"]] : new Date(r[c["Sent at"]]);
      var staffStatus = String(r[c["Status"]] || "");
      if (staffStatus && staffStatus !== "New") { sh.getRange(row, c["Call status"] + 1).setValue("Seen on order page"); continue; }
      if (now - sent > 24 * 3600000) { sh.getRange(row, c["Call status"] + 1).setValue("Expired"); continue; }
      if (tries >= maxTries) { sh.getRange(row, c["Call status"] + 1).setValue("No answer"); continue; }
      waiting++;
      if (lastCall && now - lastCall < CALL_EVERY_MINUTES * 60000 - 20000) continue;
      if (placed) continue;   // one call per minute, so calls don't hit a busy line
      placed = true;
      var res = UrlFetchApp.fetch(CALL_URL, {
        method: "post", contentType: "application/json", muteHttpExceptions: true,
        payload: JSON.stringify({
          secret: CALL_SECRET, order: String(r[c["Order #"]]), name: String(r[c["Name"]] || ""),
          mode: String(r[c["Pickup/Delivery"]] || ""), day: spokenDay(r[c["Pickup date"]]), time: String(r[c["Time"]] || ""),
          update: String(r[c["Channel"]] || "").indexOf("(UPDATE)") > -1,
          channel: String(r[c["Channel"]] || "").replace(" (UPDATE)", ""),
          attempt: tries + 1, to: tries < CALL_LANDLINE_TRIES ? "landline" : "cell"
        })
      });
      sh.getRange(row, c["Call tries"] + 1, 1, 2).setValues([[tries + 1, now]]);
      if (res.getResponseCode() === 503) { sh.getRange(row, c["Call status"] + 1).setValue("Calls not set up"); waiting--; }
    }
    if (!waiting) props.deleteProperty("callsPending");
  } finally {
    lock.releaseLock();
  }
}

// Run this ONCE from the Apps Script editor (select it, click Run, approve).
function setupCallReminders() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "checkCalls") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("checkCalls").timeBased().everyMinutes(1).create();
  return "Call reminders are on.";
}

// Optional: run from the editor to ring the store landline once with a test order.
function testCall() {
  var res = UrlFetchApp.fetch(CALL_URL, {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({ secret: CALL_SECRET, order: "T0000-123", name: "Test customer", mode: "pickup", day: "today", time: "3–5 PM", attempt: 1, to: "landline" })
  });
  Logger.log(res.getResponseCode() + " " + res.getContentText());
}

/* ---------------------------------------------------------------------
   LIVE CHAT
   Customers' questions from the website chat box are saved in the "Chats"
   tab. The staff page shows them and staff replies are saved there too.
   The website answers common questions by itself; only questions for a
   person reach this sheet.
   --------------------------------------------------------------------- */
var CHAT_ID_RE = /^[a-z0-9]{20,40}$/;

function chatSheet() { return sheet(SpreadsheetApp.getActiveSpreadsheet(), "Chats", CHAT_HEADERS); }

// Rows for one chat, oldest first
function chatRows(sh, id) {
  if (sh.getLastRow() < 2) return [];
  var found = sh.getRange(2, 2, sh.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findAll();
  return found.map(function (cell) { return sh.getRange(cell.getRow(), 1, 1, CHAT_HEADERS.length).getValues()[0]; });
}

function chatMessage(r) {
  return { at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), from: String(r[2]), text: String(r[5]).replace(/^'/, "") };
}

// From the website (through /api/chat): send a message or check for replies
function chatRequest(d) {
  var id = String(d.chatId || "");
  if (!CHAT_ID_RE.test(id)) return jsonReply({ ok: false, error: "bad_chat" });
  var sh = chatSheet();
  if (d.action === "send") {
    var text = String(d.text || "").trim().slice(0, 1000);
    if (!text) return jsonReply({ ok: false, error: "empty" });
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var phone = cleanPhone(d.phone);
      sh.appendRow([new Date(), id, "Customer", safe(String(d.name || "").slice(0, 60)), asText(phone), safe(text), safe(String(d.page || "").slice(0, 100))]);
    } finally { lock.releaseLock(); }
    emailChat(id, d, text);
  }
  var rows = chatRows(sh, id), after = Math.max(Number(d.after) || 0, 0);
  return jsonReply({ ok: true, count: rows.length, messages: rows.slice(after).map(chatMessage) });
}

// One email per chat every CHAT_EMAIL_EVERY_MINUTES, so a back-and-forth doesn't flood the inbox
function emailChat(id, d, text) {
  if (!NOTIFY_EMAIL) return;
  var cache = CacheService.getScriptCache(), key = "chatMail" + id;
  if (cache.get(key)) return;
  cache.put(key, "1", CHAT_EMAIL_EVERY_MINUTES * 60);
  var name = String(d.name || "").slice(0, 60) || "A customer", phone = cleanPhone(d.phone);
  try {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: "New chat question from " + name,
      body: name + " asked on the website chat:\n\n" + text + "\n\n" + (phone ? "Phone: " + phone + "\n\n" : "") +
        "Reply on the staff page: https://alaminmarket.com/admin/ (Chats tab)",
      htmlBody: "<p><strong>" + esc(name) + "</strong> asked on the website chat:</p>" +
        '<p style="font-size:16px;white-space:pre-wrap">' + esc(text) + "</p>" +
        (phone ? '<p>Phone: <a href="tel:' + phone + '">' + phone + "</a> · <a href=\"sms:" + phone + '">Text</a></p>' : "") +
        '<p><a href="https://alaminmarket.com/admin/">Reply on the staff page</a> (Chats tab)</p>',
      name: "Super Al-Amin Website"
    });
  } catch (e) { /* email limit reached; the chat is still saved */ }
}

// Staff page: chats from the last few days, newest first
function listChats(days) {
  var sh = chatSheet();
  if (sh.getLastRow() < 2) return [];
  var since = Date.now() - days * 86400000;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, CHAT_HEADERS.length).getValues();
  var byId = {}, order = [];
  rows.forEach(function (r) {
    var t = r[0] instanceof Date ? r[0].getTime() : Date.parse(r[0]);
    if (!(t >= since)) return;
    var id = String(r[1]);
    if (!byId[id]) { byId[id] = { id: id, name: "", phone: "", page: "", messages: [] }; order.push(id); }
    var c = byId[id];
    if (r[2] === "Customer") {
      if (r[3]) c.name = String(r[3]).replace(/^'/, "");
      if (r[4]) c.phone = String(r[4]).replace(/^'/, "");
      if (r[6]) c.page = String(r[6]).replace(/^'/, "");
    }
    c.messages.push(chatMessage(r));
  });
  return order.map(function (id) { return byId[id]; }).sort(function (a, b) {
    return b.messages[b.messages.length - 1].at.localeCompare(a.messages[a.messages.length - 1].at);
  });
}

function chatReply(d) {
  var id = String(d.chatId || ""), text = String(d.text || "").trim().slice(0, 1000);
  if (!CHAT_ID_RE.test(id) || !text) return { ok: false, error: "bad_reply" };
  var sh = chatSheet();
  if (!chatRows(sh, id).length) return { ok: false, error: "no_chat" };
  var smsTo = smsChatPhone(id);
  if (smsTo) {   // the customer texted us: reply by text
    var res = smsSend([smsTo], text);
    if (!res.sent) return { ok: false, error: "sms_failed", detail: (res.failures[0] || {}).error || res.error || "" };
  }
  sh.appendRow([new Date(), id, "Store", "", "", safe(text), ""]);
  return { ok: true, at: new Date().toISOString() };
}

/* ---------------------------------------------------------------------
   DEALS SIGN-UP (alaminmarket.com/deals/)
   Saves the customer to the "Customers" tab with Texts opt-in = Yes, the
   date and the exact wording they agreed to (keep these: Twilio and phone
   carriers can ask for proof of consent). When someone replies STOP, change
   their "Texts opt-in" to "No".
   --------------------------------------------------------------------- */
function subscribe(d) {
  var phone = cleanPhone(d.phone);
  if (phone.replace(/\D/g, "").length !== 11) return jsonReply({ ok: false, error: "bad_phone" });
  if (!d.agree) return jsonReply({ ok: false, error: "no_consent" });
  var email = String(d.email || "").trim().slice(0, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email = "";
  var ss = SpreadsheetApp.getActiveSpreadsheet(), when = new Date();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  var already = false;
  try {
    var sh = sheet(ss, "Customers", CUSTOMER_HEADERS);
    ensureHeaders(sh, CUSTOMER_HEADERS);
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var col = function (h) { return head.indexOf(h) + 1; };
    var values = sh.getDataRange().getValues(), row = 0;
    for (var r = 1; r < values.length; r++) if (String(values[r][0]).replace(/^'/, "") === phone) { row = r + 1; break; }
    if (!row) {
      sh.appendRow([asText(phone), safe(String(d.name || "").slice(0, 60)), "", "", 0]);
      row = sh.getLastRow();
    } else {
      already = values[row - 1][col("Texts opt-in") - 1] === "Yes";
      if (d.name && !values[row - 1][1]) sh.getRange(row, 2).setValue(safe(String(d.name).slice(0, 60)));
    }
    sh.getRange(row, col("Texts opt-in")).setValue("Yes");
    sh.getRange(row, col("Opt-in date")).setValue(when);
    sh.getRange(row, col("Opt-in wording")).setValue(safe(String(d.optInText || "").slice(0, 400)));
    if (email) sh.getRange(row, col("Email")).setValue(safe(email));
    sh.getRange(row, col("Signed up from")).setValue(safe(String(d.source || "Deals page").slice(0, 60)));
  } finally { lock.releaseLock(); }
  if (!already) welcomeText(phone);
  return jsonReply({ ok: true, already: already });
}

/* ---------------------------------------------------------------------
   TEXT MESSAGES (Twilio, through alaminmarket.com/api/sms)
   - Staff page "Send a deal": texts everyone with Texts opt-in = Yes.
   - New opt-ins get one welcome text.
   - STOP / START replies update the Customers tab; other replies show up in
     the staff page Chats tab, and staff replies go back as texts.
   Nothing is sent until Twilio approves the A2P campaign.
   --------------------------------------------------------------------- */
function smsPost(payload) {
  if (!CALL_SECRET) return { ok: false, error: "not_set" };
  payload.secret = CALL_SECRET;
  try {
    var res = UrlFetchApp.fetch(SMS_URL, { method: "post", contentType: "application/json", muteHttpExceptions: true, payload: JSON.stringify(payload) });
    return JSON.parse(res.getContentText());
  } catch (e) { return { ok: false, error: "unreachable" }; }
}
function smsStatus() {
  if (SMS_FORCE_READY) return { ready: true, status: "approved" };
  var cache = CacheService.getScriptCache(), hit = cache.get("smsStatus");
  if (hit) return JSON.parse(hit);
  var r = smsPost({ action: "status" });
  var st = r && r.ok ? { ready: !!r.ready, status: r.status || "unknown" } : { ready: false, status: (r && r.error) || "unknown" };
  cache.put("smsStatus", JSON.stringify(st), st.ready ? 3600 : 300);   // ask Twilio at most every 5 min (hourly once approved)
  return st;
}
function smsStatusUncached() {
  var r = smsPost({ action: "status" });
  return r && r.ok ? { ready: !!r.ready, status: r.status || "unknown" } : { ready: false, status: (r && r.error) || "unknown" };
}
// Sends in batches of 40; returns { sent, failed, failures: [{ to, error }] }
function smsSend(numbers, body) {
  var out = { sent: 0, failed: 0, failures: [] };
  for (var i = 0; i < numbers.length; i += 40) {
    var batch = numbers.slice(i, i + 40);
    var r = smsPost({ action: "send", to: batch, body: body });
    if (!r || !r.ok || !r.results) {
      out.failed += batch.length; out.error = (r && r.error) || "send_failed";
      batch.forEach(function (n) { out.failures.push({ to: n, error: out.error }); });
      continue;
    }
    r.results.forEach(function (x) { if (x.ok) out.sent++; else { out.failed++; out.failures.push({ to: x.to, error: x.error }); } });
  }
  return out;
}
function welcomeText(phone) {
  try { if (phone && smsStatus().ready) smsSend([phone], WELCOME_TEXT); } catch (e) { /* never block a sign-up or order */ }
}

function customersSheet() {
  var sh = sheet(SpreadsheetApp.getActiveSpreadsheet(), "Customers", CUSTOMER_HEADERS);
  ensureHeaders(sh, CUSTOMER_HEADERS);
  return sh;
}
function optedInNumbers() {
  var sh = customersSheet();
  if (sh.getLastRow() < 2) return [];
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String), opt = head.indexOf("Texts opt-in");
  var seen = {}, list = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues().forEach(function (r) {
    var p = String(r[0]).replace(/^'/, "");
    if (r[opt] === "Yes" && /^\+1[2-9]\d{9}$/.test(p) && !seen[p]) { seen[p] = 1; list.push(p); }
  });
  return list;
}

// Every deal starts with the store name and ends with opt-out help (carrier rules)
function dealBody(text) {
  var t = String(text || "").replace(/\s+$/, "");
  if (!/^super al-amin/i.test(t)) t = "Super Al-Amin: " + t;
  if (!/\bstop\b/i.test(t)) t += " Reply STOP to opt out.";
  return t;
}
function dealSheet() { var sh = sheet(SpreadsheetApp.getActiveSpreadsheet(), "Deals", DEAL_HEADERS); ensureHeaders(sh, DEAL_HEADERS); return sh; }
function storeHour() { return Number(Utilities.formatDate(new Date(), "America/Los_Angeles", "H")); }

function dealInfo() {
  var st = SMS_FORCE_READY ? smsStatus() : smsStatusUncached(), sh = dealSheet(), history = [];
  if (!SMS_FORCE_READY) CacheService.getScriptCache().put("smsStatus", JSON.stringify(st), st.ready ? 3600 : 300);
  if (sh.getLastRow() > 1) {
    var n = Math.min(10, sh.getLastRow() - 1);
    history = sh.getRange(sh.getLastRow() - n + 1, 1, n, 6).getValues().reverse().map(function (r) {
      return { at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), text: String(r[1]).replace(/^'/, ""), recipients: r[2], sent: r[3], failed: r[4], test: r[5] === "Yes" };
    });
  }
  var h = storeHour();
  return { ok: true, ready: st.ready, status: st.status, count: optedInNumbers().length, history: history,
    quiet: !(h >= DEAL_HOURS[0] && h < DEAL_HOURS[1]), hours: DEAL_HOURS };
}

function sendDeal(d) {
  var text = String(d.text || "").trim();
  if (text.length < 5) return { ok: false, error: "empty" };
  if (text.length > 480) return { ok: false, error: "too_long" };
  var body = dealBody(text), test = !!d.test;
  var st = smsStatus();
  if (!st.ready) return { ok: false, error: "not_approved", status: st.status };
  var numbers;
  if (test) {
    var tp = cleanPhone(d.testPhone);
    if (!/^\+1[2-9]\d{9}$/.test(tp)) return { ok: false, error: "bad_test_phone" };
    numbers = [tp];
  } else {
    var h = storeHour();
    if (!(h >= DEAL_HOURS[0] && h < DEAL_HOURS[1])) return { ok: false, error: "quiet_hours" };
    numbers = optedInNumbers();
    if (!numbers.length) return { ok: false, error: "no_subscribers" };
    if (Number(d.expect) !== numbers.length) return { ok: false, error: "count_changed", count: numbers.length };
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { ok: false, error: "busy" };
  try {
    var cache = CacheService.getScriptCache(), key = "deal" + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, body));
    if (!test && cache.get(key)) return { ok: false, error: "duplicate" };   // same deal sent in the last 30 minutes
    var res = smsSend(numbers, body);
    if (!test && res.sent) cache.put(key, "1", 1800);
    dealSheet().appendRow([new Date(), safe(body), numbers.length, res.sent, res.failed, test ? "Yes" : "No",
      safe(res.failures.slice(0, 20).map(function (f) { return f.to + " " + f.error; }).join("; "))]);
    return { ok: true, sent: res.sent, failed: res.failed, recipients: numbers.length, body: body };
  } finally { lock.releaseLock(); }
}

// Texts sent to our number (from /api/sms-in)
var STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"];
var START_WORDS = ["START", "YES", "UNSTOP"];
function smsChatId(phone) { return ("sms" + phone.replace(/\D/g, "") + "0000000000").slice(0, 24); }
function smsChatPhone(id) { var m = /^sms(1[2-9]\d{9})0*$/.exec(id); return m ? "+" + m[1] : ""; }

function smsIn(d) {
  if (!CALL_SECRET || String(d.secret || "") !== CALL_SECRET) return reply("forbidden");
  var from = cleanPhone(d.from), body = String(d.body || "").trim().slice(0, 1000), word = body.toUpperCase().replace(/[^A-Z]/g, "");
  if (!/^\+1[2-9]\d{9}$/.test(from) || !body) return reply("ignored");
  if (STOP_WORDS.indexOf(word) > -1 || START_WORDS.indexOf(word) > -1) {
    var yes = START_WORDS.indexOf(word) > -1, sh = customersSheet(), when = new Date();
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String), col = function (h) { return head.indexOf(h) + 1; };
      var values = sh.getDataRange().getValues(), row = 0;
      for (var r = 1; r < values.length; r++) if (String(values[r][0]).replace(/^'/, "") === from) { row = r + 1; break; }
      if (!row && yes) { sh.appendRow([asText(from), "", "", "", 0]); row = sh.getLastRow(); }
      if (row) {
        sh.getRange(row, col("Texts opt-in")).setValue(yes ? "Yes" : "No");
        if (yes) {
          sh.getRange(row, col("Opt-in date")).setValue(when);
          sh.getRange(row, col("Opt-in wording")).setValue("Texted " + word + " to our number");
          sh.getRange(row, col("Signed up from")).setValue("Text message");
        } else sh.getRange(row, col("Opted out")).setValue(when);
      }
    } finally { lock.releaseLock(); }
    return reply("ok");
  }
  if (word === "HELP" || word === "INFO") return reply("ok");   // Twilio already sent the help message
  // Anything else: show it in the staff Chats tab
  var name = "";
  try {
    var cs = customersSheet(), vals = cs.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) if (String(vals[i][0]).replace(/^'/, "") === from) { name = String(vals[i][1] || ""); break; }
  } catch (e) { /* no name */ }
  var id = smsChatId(from), csh = chatSheet();
  csh.appendRow([new Date(), id, "Customer", safe(name), asText(from), safe(body), "Text message"]);
  emailChat(id, { name: name || from, phone: from }, body);
  return reply("ok");
}
