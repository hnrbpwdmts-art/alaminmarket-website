/**
 * Super Al-Amin: saves online meat orders to this Google Sheet.
 * Setup steps are in backend/README.md. Paste this whole file into
 * Extensions > Apps Script in your orders Google Sheet.
 *
 * Tabs created automatically:
 *   Orders     one row per order
 *   Items      one row per item (best for "what sells" research)
 *   Customers  one row per phone number: first/last order, order count, opt-in
 */

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
      when, d.orderNumber, d.channel, d.mode, d.date || d.day, d.time, safe(d.name), asText(phone),
      safe(d.address), safe(itemsText), d.itemCount, d.estimatedTotal, d.allPriced ? "Yes" : "No",
      safe(d.notes), d.marketingOptIn ? "Yes" : "No", safe(d.optInText), safe(d.source), d.device
    ]);

    var itemSheet = sheet(ss, "Items", ITEM_HEADERS);
    d.items.forEach(function (it) {
      itemSheet.appendRow([when, d.orderNumber, it.category, safe(it.item), safe(it.choices),
        safe(it.special), it.qty, it.unit, it.price, it.priceUnit, it.estimate]);
    });

    if (phone) updateCustomer(sheet(ss, "Customers", CUSTOMER_HEADERS), phone, d, when);
    return reply("ok");
  } catch (err) {
    return reply("error");
  } finally {
    lock.releaseLock();
  }
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
