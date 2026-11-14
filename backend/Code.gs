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

var ORDER_HEADERS = ["Sent at", "Order #", "Channel", "Pickup/Delivery", "Pickup date", "Time", "Name", "Phone",
  "Address", "Items", "Item count", "Estimated total", "All items priced", "Notes",
  "Texts opt-in", "Opt-in wording", "Source", "Device"];
var ITEM_HEADERS = ["Sent at", "Order #", "Category", "Item", "Choices", "Special request",
  "Amount", "Unit", "Price", "Price per", "Estimate"];
var CUSTOMER_HEADERS = ["Phone", "Name", "First order", "Last order", "Orders", "Texts opt-in",
  "Opt-in date", "Opt-in wording"];

function doPost(e) {
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

    sheet(ss, "Orders", ORDER_HEADERS).appendRow([
      when, d.orderNumber, d.channel + (d.update ? " (UPDATE)" : ""), d.mode, d.date || d.day, d.time, safe(d.name), asText(phone),
      safe(d.address), safe(itemsText), d.itemCount, d.estimatedTotal, d.allPriced ? "Yes" : "No",
      safe(d.notes), d.marketingOptIn ? "Yes" : "No", safe(d.optInText), safe(d.source), d.device
    ]);

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
