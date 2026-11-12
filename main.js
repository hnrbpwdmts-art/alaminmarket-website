/* Fills the page from site-config.js. You normally don't need to edit this file. */
(function () {
  "use strict";
  var S = window.SITE;
  if (!S) return;
  var store = S.store;
  // Pages in sub-folders set <html data-root="../"> so photo paths still work
  var ROOT = document.documentElement.getAttribute("data-root") || "";
  function asset(path) { return !path || /^(https?:|\/|data:)/.test(path) ? path : ROOT + path; }
  var address = store.street + ", " + store.city + ", " + store.state + " " + store.zip;

  function whatsappUrl(key) {
    var msg = (S.whatsappMessages && S.whatsappMessages[key]) || "";
    var url = "https://wa.me/" + store.whatsappNumber;
    return msg ? url + "?text=" + encodeURIComponent(msg) : url;
  }

  function linkFor(type, messageKey) {
    if (type === "call") return store.phoneLink;
    if (type === "directions") return store.directionsLink;
    if (type === "whatsapp") return whatsappUrl(messageKey || "general");
    return type; // a full web address
  }

  // Links
  document.querySelectorAll("[data-link]").forEach(function (el) {
    el.setAttribute("href", linkFor(el.dataset.link, el.dataset.message));
  });

  // Text
  var texts = {
    name: store.name,
    address: address,
    phone: store.phoneDisplay,
    whatsapp: store.whatsappDisplay,
    hoursSummary: store.hoursSummary || "",
    fridayNote: store.fridayNote || ""
  };
  document.querySelectorAll("[data-text]").forEach(function (el) {
    el.textContent = texts[el.dataset.text] || "";
  });

  // Photos
  document.querySelectorAll("img[data-photo]").forEach(function (img) {
    var p = S.photos[img.dataset.photo];
    if (!p) return;
    img.src = asset(p.src);
    img.alt = p.alt;
  });

  // Videos (muted, looping; play only while on screen; respect reduced-motion)
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var videoObserver = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { if (v.preload === "none") v.preload = "auto"; var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
      else v.pause();
    });
  }, { threshold: 0.25 }) : null;
  function setupVideo(v, src, poster, label) {
    v.src = asset(src);
    if (poster) v.poster = asset(poster);
    v.setAttribute("aria-label", label || "");
    v.muted = true;
    if (reduceMotion) { v.controls = true; return; }
    if (videoObserver) videoObserver.observe(v); else v.autoplay = true;
  }
  document.querySelectorAll("video[data-video]").forEach(function (v) {
    var p = S.photos[v.dataset.video];
    if (!p || !p.video) return;
    var img = v.parentNode.querySelector("img");
    v.hidden = false;
    if (img) img.hidden = true;
    setupVideo(v, p.video, p.src, p.alt);
  });

  // Grocery category cards (homepage). Each card opens its tab on the Groceries page.
  (function categoryCards() {
    var grid = document.getElementById("grocery-grid");
    if (!grid) return;
    (S.groceryCategories || []).forEach(function (cat) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.className = "category-card";
      a.href = ROOT + "groceries/#" + (cat.tab || "");
      var img = document.createElement("img");
      img.src = asset(cat.image); img.alt = ""; img.width = 400; img.height = 300; img.loading = "lazy"; img.decoding = "async";
      var body = document.createElement("span"); body.className = "category-body";
      var h = document.createElement("span"); h.className = "category-name"; h.textContent = cat.name;
      var t = document.createElement("span"); t.className = "category-text"; t.textContent = cat.text || "";
      var go = document.createElement("span"); go.className = "category-go"; go.setAttribute("aria-hidden", "true"); go.textContent = "Browse →";
      body.appendChild(h); body.appendChild(t); body.appendChild(go);
      a.appendChild(img); a.appendChild(body);
      li.appendChild(a); grid.appendChild(li);
    });
  })();

  // Groceries page: one tab per gallery in "showcases"
  (function groceryTabs() {
    var bar = document.getElementById("grocery-tabs");
    var panels = document.getElementById("grocery-panels");
    if (!bar || !panels) return;
    panels.innerHTML = ""; // replace the plain product list with the tabbed version
    var items = (S.showcases || []).filter(function (sc) { return sc && sc.id && sc.title; });
    var tabs = [];

    function makeItem(it) {
      var li = document.createElement("li"); li.className = "showcase-item";
      var img = document.createElement("img"); img.src = asset(it.image); img.alt = it.alt || it.name || "";
      img.loading = "lazy"; img.width = 300; img.height = 300; img.decoding = "async";
      var cap = document.createElement("span"); cap.textContent = it.name || "";
      li.appendChild(img); li.appendChild(cap);
      return li;
    }
    function askCard(sc) {
      var li = document.createElement("li"); li.className = "ask-card";
      var a = document.createElement("a");
      a.href = "https://wa.me/" + store.whatsappNumber + "?text=" + encodeURIComponent(S.whatsappMessages.grocery || "");
      a.target = "_blank"; a.rel = "noopener";
      a.innerHTML = '<span class="ask-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.3-.5.1-1 .1-1.7-.1a15 15 0 0 1-6.3-5.5c-.5-.7-1-1.7-1-2.8 0-1.1.6-1.6.8-1.9.2-.2.5-.3.6-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.1.1.6-.1 1.2z"/></svg></span>' +
        '<span class="ask-title"></span><span class="ask-text">Message us on WhatsApp and we\'ll check the shelf.</span>';
      a.querySelector(".ask-title").textContent = sc.askTitle || "Looking for something else?";
      li.appendChild(a);
      return li;
    }

    items.forEach(function (sc, i) {
      var tab = document.createElement("button");
      tab.type = "button"; tab.className = "grocery-tab"; tab.id = "tab-" + sc.id;
      tab.setAttribute("role", "tab"); tab.setAttribute("aria-controls", "panel-" + sc.id);
      tab.textContent = sc.tab || sc.title;
      bar.appendChild(tab);

      var panel = document.createElement("section");
      panel.className = "grocery-panel"; panel.id = "panel-" + sc.id;
      panel.setAttribute("role", "tabpanel"); panel.setAttribute("aria-labelledby", "tab-" + sc.id);
      panel.tabIndex = 0;
      var head = document.createElement("div"); head.className = "panel-head";
      var h = document.createElement("h2"); h.textContent = sc.title; head.appendChild(h);
      if (sc.text) { var p = document.createElement("p"); p.textContent = sc.text; head.appendChild(p); }
      panel.appendChild(head);
      if (sc.video) {
        var fig = document.createElement("figure"); fig.className = "panel-video";
        var v = document.createElement("video"); v.loop = true; v.playsInline = true; v.preload = "none";
        v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
        fig.appendChild(v); panel.appendChild(fig);
        setupVideo(v, sc.video, sc.poster, sc.alt);
      }
      var ul = document.createElement("ul"); ul.className = "showcase-grid";
      ul.setAttribute("aria-label", sc.title);
      (sc.items || []).forEach(function (it) { ul.appendChild(makeItem(it)); });
      ul.appendChild(askCard(sc));
      panel.appendChild(ul);
      panels.appendChild(panel);
      tabs.push({ tab: tab, panel: panel, id: sc.id });
      tab.addEventListener("click", function () { select(i, true); });
    });

    function select(i, fromClick) {
      tabs.forEach(function (t, n) {
        var on = n === i;
        t.tab.setAttribute("aria-selected", String(on));
        t.tab.tabIndex = on ? 0 : -1;
        t.panel.hidden = !on;
        if (on) {
          // pause videos in hidden panels, keep the active tab visible in the scrolling bar
          t.tab.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
        } else {
          t.panel.querySelectorAll("video").forEach(function (v) { v.pause(); });
        }
      });
      if (fromClick) {
        history.replaceState(null, "", "#" + tabs[i].id);
        // If the products start above the sticky tab bar, bring them back into view
        var wrap = bar.closest(".tabs-wrap") || bar;
        var barBottom = wrap.getBoundingClientRect().bottom;
        var top = panels.getBoundingClientRect().top;
        if (top < barBottom) window.scrollBy({ top: top - barBottom - 4, left: 0, behavior: "instant" });
      }
    }
    bar.addEventListener("keydown", function (e) {
      var cur = tabs.findIndex(function (t) { return t.tab === document.activeElement; });
      if (cur < 0) return;
      var next = null;
      if (e.key === "ArrowRight") next = (cur + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (cur - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault(); select(next, true); tabs[next].tab.focus();
    });
    function fromHash() {
      var id = (location.hash || "").replace("#", "");
      var i = tabs.findIndex(function (t) { return t.id === id; });
      select(i < 0 ? 0 : i, false);
    }
    window.addEventListener("hashchange", fromHash);
    fromHash();
  })();

  // Social media links
  (function social() {
    var so = S.social || {};
    var nets = [
      { key: "instagram", label: "Instagram" },
      { key: "tiktok", label: "TikTok" },
      { key: "facebook", label: "Facebook" }
    ].filter(function (n) { return /^https?:\/\//.test((so[n.key] || "").trim()); });
    if (!nets.length) return;
    var list = document.getElementById("social-list");
    var foot = document.getElementById("footer-social");
    if (!foot) return;
    nets.forEach(function (n) {
      var url = so[n.key].trim();
      [list, foot].forEach(function (ul, i) {
        if (!ul) return;
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = url; a.target = "_blank"; a.rel = "noopener";
        a.className = i === 0 ? "social-link" : "";
        a.textContent = n.label;
        a.setAttribute("aria-label", "Super Al-Amin on " + n.label + " (opens in a new tab)");
        li.appendChild(a); ul.appendChild(li);
      });
    });
    if (document.getElementById("social")) document.getElementById("social").hidden = false;
  })();

  // Announcement banner
  var a = S.announcement;
  if (a && a.show && a.text) {
    var bar = document.getElementById("announcement");
    var p = document.createElement("p");
    p.className = "container";
    p.textContent = a.text + " ";
    if (a.linkText) {
      var link = document.createElement("a");
      link.textContent = a.linkText;
      link.href = linkFor(a.linkTo || "whatsapp", "general");
      if (/^https?:/.test(link.href)) { link.target = "_blank"; link.rel = "noopener"; }
      p.appendChild(link);
    }
    bar.appendChild(p);
    bar.hidden = false;
  }

  // What's New & Deals
  // Deals come from your Google Sheet (dealsSheetUrl in site-config.js) if one is set,
  // otherwise from the "deals" list in site-config.js.
  (function deals() {
    if (!(S.dealsSection && S.dealsSection.show) || !document.getElementById("deals")) return; // section stays hidden
    document.getElementById("deals").hidden = false;
    document.querySelector("[data-deals-nav]").hidden = false;
    var list = document.getElementById("deals-list");
    var today = new Date(); today.setHours(0, 0, 0, 0);

    function parseDate(str) {
      str = String(str || "").trim();
      var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);          // 2027-07-31
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
      m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(str);            // 7/31/2027
      if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]);
      var d = str ? new Date(str) : null;                              // "Jul 31, 2027"
      return d && !isNaN(d) ? d : null;
    }

    function render(items) {
      list.innerHTML = "";
      items.forEach(function (d) {
        if (!d || !d.title) return;
        var end = parseDate(d.ends);
        if (end && end < today) return; // expired: hides automatically
        var li = document.createElement("li");
        li.className = "deal-card";
        if (d.image) {
          var img = document.createElement("img");
          img.src = asset(d.image); img.alt = d.alt || ""; img.loading = "lazy"; img.width = 640; img.height = 400;
          li.appendChild(img);
        }
        var body = document.createElement("div");
        body.className = "deal-body";
        if (d.badge) { var b = document.createElement("span"); b.className = "deal-badge"; b.textContent = d.badge; body.appendChild(b); }
        var h = document.createElement("h3"); h.textContent = d.title; body.appendChild(h);
        if (d.text) { var t = document.createElement("p"); t.textContent = d.text; body.appendChild(t); }
        if (end) {
          var e = document.createElement("p"); e.className = "deal-ends";
          e.textContent = "Until " + end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          body.appendChild(e);
        }
        var a = document.createElement("a");
        a.className = "btn btn-whatsapp";
        a.target = "_blank"; a.rel = "noopener";
        a.href = "https://wa.me/" + store.whatsappNumber + "?text=" +
          encodeURIComponent("Hi Super Al-Amin! I'm interested in: " + d.title);
        a.textContent = "Ask about this";
        a.setAttribute("aria-label", "Ask about " + d.title + " on WhatsApp");
        var wrap = document.createElement("div"); wrap.className = "deal-actions"; wrap.appendChild(a);
        body.appendChild(wrap);
        li.appendChild(body);
        list.appendChild(li);
      });
      var has = list.children.length > 0;
      list.hidden = !has;
      document.getElementById("deals-empty").hidden = has;
    }

    // Small CSV reader for a published Google Sheet
    function parseCSV(text) {
      var rows = [], row = [], field = "", q = false;
      for (var i = 0; i < text.length; i++) {
        var c = text[i];
        if (q) {
          if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
          else if (c === '"') q = false;
          else field += c;
        } else if (c === '"') q = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n" || c === "\r") {
          if (c === "\r" && text[i + 1] === "\n") i++;
          row.push(field); rows.push(row); row = []; field = "";
        } else field += c;
      }
      if (field || row.length) { row.push(field); rows.push(row); }
      return rows;
    }

    function fromSheet(text) {
      var rows = parseCSV(text).filter(function (r) { return r.some(function (c) { return c.trim(); }); });
      if (!rows.length) return [];
      var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
      function col(names) { for (var i = 0; i < names.length; i++) { var k = head.indexOf(names[i]); if (k > -1) return k; } return -1; }
      var cShow = col(["show"]), cTitle = col(["title", "headline"]), cText = col(["details", "text", "description"]),
          cBadge = col(["label", "badge"]), cEnds = col(["ends", "end date", "until"]),
          cImg = col(["photo link", "image", "photo"]), cAlt = col(["photo description", "alt"]);
      return rows.slice(1).filter(function (r) {
        return cShow < 0 || /^(y|yes|true|1|show)$/i.test((r[cShow] || "").trim());
      }).map(function (r) {
        function v(k) { return k > -1 ? (r[k] || "").trim() : ""; }
        return { title: v(cTitle), text: v(cText), badge: v(cBadge), ends: v(cEnds), image: v(cImg), alt: v(cAlt) };
      });
    }

    var sheet = (S.dealsSheetUrl || "").trim();
    if (sheet) {
      fetch(sheet + (sheet.indexOf("?") > -1 ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (text) { render(fromSheet(text)); })
        .catch(function (err) { console.warn("Deals sheet could not load:", err); render(S.deals || []); });
    } else {
      render(S.deals || []);
    }
  })();

  // WhatsApp sign-up form (submissions go to Netlify > Forms)
  (function signup() {
    var form = document.getElementById("signup-form");
    if (!form || !(S.dealsSection && S.dealsSection.show)) return;
    var phone = document.getElementById("su-phone");
    var errorBox = document.getElementById("signup-error");
    var btn = form.querySelector('button[type="submit"]');

    function showError(msg, field) {
      errorBox.textContent = msg;
      errorBox.hidden = false;
      if (field) { field.setAttribute("aria-invalid", "true"); field.focus(); }
    }
    form.addEventListener("input", function (e) {
      e.target.removeAttribute("aria-invalid");
      errorBox.hidden = true;
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.elements.name;
      var consent = form.elements.consent;
      if (!name.value.trim()) return showError("Please enter your name.", name);
      if (phone.value.replace(/\D/g, "").length < 10) return showError("Please enter your full WhatsApp number, including area code.", phone);
      if (!consent.checked) return showError("Please tick the box to agree to receive WhatsApp messages.", consent);

      btn.disabled = true;
      btn.textContent = "Signing up…";
      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)).toString()
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        form.hidden = true;
        var ok = document.getElementById("signup-success");
        ok.hidden = false;
        ok.focus();
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = "Sign up";
        showError("Sorry, that didn't go through. Please try again, or message us on WhatsApp.");
      });
    });
  })();

  // Google reviews
  (function reviews() {
    var R = S.reviews || {};
    if (!R.show || !document.getElementById("reviews")) return; // section stays hidden
    document.getElementById("reviews").hidden = false;
    document.querySelector("[data-reviews-nav]").hidden = false;
    var placeId = (R.googlePlaceId || "").trim();
    var apiKey = (R.googleApiKey || "").trim();
    var listingUrl = "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(store.name + ", " + address) +
      (placeId ? "&query_place_id=" + encodeURIComponent(placeId) : "");
    document.getElementById("reviews-google").href = listingUrl;
    if (placeId) {
      var write = document.getElementById("reviews-write");
      write.href = "https://search.google.com/local/writereview?placeid=" + encodeURIComponent(placeId);
      write.hidden = false;
    }
    if (!apiKey || !placeId) return; // button-only mode until both are set

    function stars(n) {
      var r = Math.round(n || 0);
      var span = document.createElement("span");
      span.className = "stars";
      span.setAttribute("role", "img");
      span.setAttribute("aria-label", "Rated " + (Math.round((n || 0) * 10) / 10) + " out of 5");
      span.textContent = "★★★★★".slice(0, r) + "☆☆☆☆☆".slice(0, 5 - r);
      return span;
    }

    function render(place) {
      if (place.googleMapsURI) document.getElementById("reviews-google").href = place.googleMapsURI;
      if (place.rating) {
        var sum = document.getElementById("reviews-summary");
        var score = document.createElement("span");
        score.className = "reviews-score";
        score.textContent = place.rating.toFixed(1);
        var count = document.createElement("span");
        count.className = "reviews-count";
        count.textContent = (place.userRatingCount || 0).toLocaleString() + " reviews on Google";
        sum.appendChild(score); sum.appendChild(stars(place.rating)); sum.appendChild(count);
        sum.hidden = false;
      }
      var list = document.getElementById("reviews-list");
      (place.reviews || []).filter(function (rv) { return rv.text; })
        .slice(0, R.maxReviews || 3).forEach(function (rv) {
          var li = document.createElement("li");
          li.className = "review-card";
          li.appendChild(stars(rv.rating));
          var t = document.createElement("p");
          t.className = "review-text";
          t.textContent = rv.text;
          li.appendChild(t);
          var meta = document.createElement("p");
          meta.className = "review-meta";
          var who = rv.authorAttribution || {};
          var name = document.createElement(who.uri ? "a" : "span");
          name.textContent = who.displayName || "Google user";
          if (who.uri) { name.href = who.uri; name.target = "_blank"; name.rel = "noopener"; }
          meta.appendChild(name);
          if (rv.relativePublishTimeDescription) meta.appendChild(document.createTextNode(" · " + rv.relativePublishTimeDescription));
          li.appendChild(meta);
          list.appendChild(li);
        });
      if (list.children.length) list.hidden = false;
      if (place.rating || list.children.length) {
        document.getElementById("reviews-attrib").hidden = false;
        document.getElementById("reviews-intro").hidden = true;
        document.getElementById("reviews-google").textContent = "See all reviews on Google";
      }
    }

    window.__superAlAminReviews = function () {
      google.maps.importLibrary("places").then(function (lib) {
        var place = new lib.Place({ id: placeId });
        return place.fetchFields({ fields: ["rating", "userRatingCount", "reviews", "googleMapsURI"] })
          .then(function () { render(place); });
      }).catch(function (err) { console.warn("Google reviews could not load:", err); });
    };

    function load() {
      var sc = document.createElement("script");
      sc.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(apiKey) +
        "&v=weekly&loading=async&callback=__superAlAminReviews";
      sc.async = true;
      document.head.appendChild(sc);
    }

    // Only contact Google when the reviews section is close to being seen (keeps API use low)
    var section = document.getElementById("reviews");
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); }
      }, { rootMargin: "600px 0px" });
      io.observe(section);
    } else { load(); }
  })();

  // Footer year
  document.getElementById("year").textContent = new Date().getFullYear();

  // Mobile menu
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  function setMenu(open) {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  }
  toggle.addEventListener("click", function () {
    setMenu(toggle.getAttribute("aria-expanded") !== "true");
  });
  nav.addEventListener("click", function (e) {
    if (e.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("is-open")) { setMenu(false); toggle.focus(); }
  });

  // Structured data for search engines is written directly in index.html
})();
