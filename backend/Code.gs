/**
 * Super Al-Amin: saves online meat orders to this Google Sheet.
 * Setup steps are in backend/README.md. Paste this whole file into
 * Extensions > Apps Script in your orders Google Sheet.
 *
 * Orders placed with the website's "Submit order" button are also emailed
 * to NOTIFY_EMAIL below.
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
var CALL_EVERY_MINUTES = 5;   // wait between calls
var CALL_LANDLINE_TRIES = 5;  // store landline first...
var CALL_CELL_TRIES = 3;      // ...then the backup cell phone
var CALL_CHANNELS = ["Website"]; // WhatsApp and text orders already ring the store phone
// Calls only happen while the store is open (store time, 24-hour clock)
var CALL_HOURS = ["Mo-Th 10:00-20:00", "Fr 10:00-12:15", "Fr 13:15-20:00", "Sa-Su 10:00-20:00"];

var ORDER_HEADERS = ["Sent at", "Order #", "Channel", "Pickup/Delivery", "Pickup date", "Time", "Name", "Phone",
  "Address", "Items", "Item count", "Estimated total", "All items priced", "Notes",
  "Texts opt-in", "Opt-in wording", "Source", "Device", "Status", "Final total", "Status updated",
  "Call status", "Call tries", "Last call"];
// Order statuses used by the staff order page
var STATUSES = ["New", "Confirmed", "Ready", "Out for delivery", "Done", "Cancelled"];
var ITEM_HEADERS = ["Sent at", "Order #", "Category", "Item", "Choices", "Special request",
  "Amount", "Unit", "Price", "Price per", "Estimate"];
var CUSTOMER_HEADERS = ["Phone", "Name", "First order", "Last order", "Orders", "Texts opt-in",
  "Opt-in date", "Opt-in wording"];

function doPost(e) {
  var parsed = null;
  try { parsed = JSON.parse(e.postData.contents); } catch (err) { /* not JSON */ }
  if (parsed && parsed.admin) return adminRequest(parsed);
  if (parsed && parsed.callAck) return callAck(parsed);
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

    // Email alert for orders submitted on the website (not WhatsApp or text,
    // which already arrive on the store phone)
    if (d.notify && d.channel === "Website" && NOTIFY_EMAIL) {
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
  var subject = (d.update ? "UPDATED website order " : "New website order ") + d.orderNumber + " – " + name + " (" +
    (d.mode === "delivery" ? "Delivery" : "Pickup") + " " + (d.day || "") + ", " + (d.time || "") + ")";
  var body = String(d.message || "").slice(0, 6000);
  if (d.update) body = "This REPLACES the earlier version of order " + d.orderNumber + ". Use this one.\n\n" + body;
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
      sh.getRange(row, 4).setValue(when);
      sh.getRange(row, 5).setValue((Number(values[r][4]) || 0) + 1);
      // Opting in is recorded; it is never switched off here. Remove a number
      // by hand (change "Yes" to "No") when someone replies STOP.
      if (d.marketingOptIn && values[r][5] !== "Yes") {
        sh.getRange(row, 6, 1, 3).setValues([["Yes", when, safe(d.optInText)]]);
      }
      return;
    }
  }
  sh.appendRow([asText(phone), safe(d.name), when, when, 1, d.marketingOptIn ? "Yes" : "No",
    d.marketingOptIn ? when : "", d.marketingOptIn ? safe(d.optInText) : ""]);
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
    var now = new Date(), waiting = 0, maxTries = CALL_LANDLINE_TRIES + CALL_CELL_TRIES;
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
      var res = UrlFetchApp.fetch(CALL_URL, {
        method: "post", contentType: "application/json", muteHttpExceptions: true,
        payload: JSON.stringify({
          secret: CALL_SECRET, order: String(r[c["Order #"]]), name: String(r[c["Name"]] || ""),
          mode: String(r[c["Pickup/Delivery"]] || ""), day: spokenDay(r[c["Pickup date"]]), time: String(r[c["Time"]] || ""),
          update: String(r[c["Channel"]] || "").indexOf("(UPDATE)") > -1,
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
