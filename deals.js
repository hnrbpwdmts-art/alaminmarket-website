/* Deals sign-up page (alaminmarket.com/deals/): sends the form to /api/subscribe */
(function () {
  "use strict";
  var form = document.getElementById("deals-form");
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var err = $("deals-error"), btn = $("deals-submit");
  function show(msg, field) { err.textContent = msg; err.hidden = false; if (field) field.focus(); }
  function track(n, p) { try { if (window.alaminTrack) window.alaminTrack(n, p); } catch (e) { /* ignore */ } }
  var params = new URLSearchParams(location.search);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.hidden = true;
    var digits = $("deals-phone").value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    if (digits.length !== 10) return show("Please enter your 10-digit mobile number.", $("deals-phone"));
    if (/^[01]/.test(digits) || digits.slice(3, 6) === "555" || /^(\d)\1{9}$/.test(digits))
      return show("That number doesn't look right. Please check it.", $("deals-phone"));
    var email = $("deals-email").value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show("Please check your email, or leave it blank.", $("deals-email"));
    if (!$("deals-agree").checked) return show("Please tick the box to agree to receive texts.", $("deals-agree"));

    btn.disabled = true; btn.textContent = "Signing you up…";
    fetch("/api/subscribe", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $("deals-name").value.trim(), phone: digits, email: email, agree: true,
        optInText: $("deals-agree-text").textContent.replace(/\s+/g, " ").trim(),
        source: params.get("from") ? "Deals page (" + params.get("from").slice(0, 30) + ")" : "Deals page",
        website: $("deals-website").value
      })
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (res) {
        if (!res || !res.ok) {
          var m = res && res.error === "too_many" ? "Too many tries. Please wait a few minutes." :
            res && res.error === "bad_phone" ? "That number doesn't look right. Please check it." :
            "Sorry, that didn't go through. Please try again, or call (310) 538-1188.";
          throw new Error(m);
        }
        form.hidden = true;
        var pretty = "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
        $("deals-done-text").textContent = (res.already ? "You were already signed up. " : "") +
          "We'll text our next deal to " + pretty + ". Reply STOP anytime to unsubscribe.";
        $("deals-done").hidden = false; $("deals-done").focus();
        track("deals_signup", { already: !!res.already });
      })
      .catch(function (e2) { btn.disabled = false; btn.textContent = "Sign me up"; show(e2.message); });
  });
})();
