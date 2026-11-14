#!/usr/bin/env node
/* Writes a plain-HTML copy of the meat menu into order/index.html (between the
   STATIC-MENU markers), from meat-menu.js. Search engines and visitors without
   JavaScript see the real product names, prices and cutting options; the
   ordering script replaces it with the interactive menu when the page loads.
   Run after editing meat-menu.js:  node tools/build-static-menu.js
   (A GitHub Action also runs it automatically when meat-menu.js changes.) */
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "meat-menu.js"), "utf8"), sandbox);
const M = sandbox.window.MEAT_MENU;
if (!M || !Array.isArray(M.categories)) throw new Error("MEAT_MENU not found in meat-menu.js");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DAY = { Sun: "Sundays", Mon: "Mondays", Tue: "Tuesdays", Wed: "Wednesdays", Thu: "Thursdays", Fri: "Fridays", Sat: "Saturdays" };
const list = (a) => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const LABEL = { Cut: "Cutting", Skin: "Skin", Fat: "Fat", Type: "Type", "BBQ cut": "BBQ cut" };

function priceText(it) {
  const unit = it.priceUnit || it.unit;
  if (it.prices) {   // e.g. boneless beef: one price with fat, one without
    return Object.keys(it.prices).map((k) => k + " $" + Number(it.prices[k]).toFixed(2) + (unit === "lb" ? " per lb" : " each")).join(", ");
  }
  if (it.price == null) return "Priced at the store";
  return "$" + Number(it.price).toFixed(2) + (unit === "lb" ? " per lb" : " each");
}
function optionGroups(it) {
  const groups = {};
  (it.combos || []).forEach((c) => Object.keys(c).forEach((k) => {
    groups[k] = groups[k] || [];
    (c[k] || []).forEach((v) => { if (groups[k].indexOf(v) === -1) groups[k].push(v); });
  }));
  return Object.keys(groups).filter((k) => groups[k].length > 1 || k === "Cut")
    .map((k) => ({ label: LABEL[k] || k, values: groups[k] }));
}

let html = '\n          <div class="order-static">\n' +
  '            <p class="order-static-intro">Our halal meat menu. Prices are estimates by weight; we confirm your exact total by text before you pay.</p>\n';
M.categories.forEach((cat) => {
  html += '            <section class="order-static-cat">\n              <h3>Halal ' + esc(cat.name.toLowerCase()) + "</h3>\n";
  if (cat.note) html += '              <p class="order-static-note">' + esc(cat.note) + "</p>\n";
  html += "              <ul>\n";
  (cat.items || []).forEach((it) => {
    html += '                <li><strong>' + esc(it.name) + "</strong> · " + esc(priceText(it));
    if (it.days && it.days.length) html += " · " + esc(list(it.days.map((d) => DAY[d] || d))) + " only";
    if (it.note) html += "<br><span>" + esc(it.note) + "</span>";
    optionGroups(it).forEach((g) => { html += "<br><span>" + esc(g.label) + ": " + esc(g.values.join(", ")) + "</span>"; });
    if (it.packing && it.packing.length > 1) html += "<br><span>Packing: " + esc(it.packing.join(", ")) + "</span>";
    html += "</li>\n";
  });
  html += "              </ul>\n            </section>\n";
});
html += "          </div>\n          ";

const file = path.join(root, "order", "index.html");
const page = fs.readFileSync(file, "utf8");
const re = /(<!-- STATIC-MENU:START[^>]*-->)[\s\S]*?(<!-- STATIC-MENU:END -->)/;
if (!re.test(page)) throw new Error("STATIC-MENU markers not found in order/index.html");
const out = page.replace(re, (m, start, end) => start + html + end);   // function form: prices contain "$"
if (out !== page) { fs.writeFileSync(file, out); console.log("order/index.html updated"); }
else console.log("order/index.html already up to date");
