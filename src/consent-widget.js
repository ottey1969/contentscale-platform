/* ============================================================================
   ContentScale — Cookie Consent Widget  (consent-widget.js)
   Self-contained. No dependencies. Works on any page (WordPress + app.contentscale.site).
   - Injects the "We respect your privacy" banner
   - Necessary (locked on) / Analytics / Functional toggles
   - ACCEPT ALL · SAVE MY PREFERENCES · REJECT NON-ESSENTIAL  (all wired)
   - Stores choice in localStorage; banner stays closed after a choice
   - Re-open anytime via  window.csConsent.open()
   ========================================================================== */
(function () {
  "use strict";

  // Guard: never initialise twice on the same page.
  if (window.__csConsentLoaded) return;
  window.__csConsentLoaded = true;

  var STORAGE_KEY = "cs_cookie_consent_v1";
  var ACCENT = "#7c3aed";

  // ---- storage helpers (localStorage with in-memory fallback) --------------
  var mem = null;
  function save(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }
    catch (e) { mem = obj; }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : mem;
    } catch (e) { return mem; }
  }

  // ---- expose a tiny API ---------------------------------------------------
  window.csConsent = {
    get: function () { return load(); },
    open: function () { show(true); },
    reset: function () { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} mem = null; show(true); }
  };

  // ---- build + show the banner --------------------------------------------
  function show(force) {
    if (!force && load()) return;                 // already chose → do nothing
    if (document.getElementById("cs-consent-root")) return; // already on screen

    var wrap = document.createElement("div");
    wrap.id = "cs-consent-root";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Cookie consent");
    wrap.style.cssText =
      "position:fixed;left:16px;bottom:16px;z-index:2147483647;width:340px;max-width:calc(100vw - 32px);" +
      "background:#0f1115;color:#e5e7eb;border:1px solid #2a2f3a;border-radius:14px;" +
      "box-shadow:0 12px 40px rgba(0,0,0,.45);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
      "font-size:13px;line-height:1.55;overflow:hidden";

    wrap.innerHTML =
      '<div style="padding:16px 18px 8px">' +
        '<div style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:.08em;color:' + ACCENT + ';border:1px solid ' + ACCENT + ';border-radius:20px;padding:2px 10px;margin-bottom:10px">COOKIE NOTICE</div>' +
        '<div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:6px">We respect your privacy</div>' +
        '<div style="color:#9ca3af;margin-bottom:12px">ContentScale uses cookies to improve your experience, analyse usage, and remember your preferences. You can choose which cookies to allow below. ' +
          '<a href="https://contentscale.site/privacy-policy/" target="_blank" rel="noopener" style="color:' + ACCENT + ';text-decoration:none">Privacy Policy</a>' +
        '</div>' +
        row("Necessary", "Session, authentication, security. Always active.", "necessary", true, true) +
        row("Analytics", "Usage patterns, page views, performance data.", "analytics", false, false) +
        row("Functional", "Preferences, scan history, saved settings.", "functional", false, false) +
      '</div>' +
      '<div style="padding:4px 18px 16px;display:flex;flex-direction:column;gap:8px">' +
        btn("cs-accept-all", "ACCEPT ALL", "solid") +
        btn("cs-save", "SAVE MY PREFERENCES", "outline") +
        btn("cs-reject", "REJECT NON-ESSENTIAL", "ghost") +
      '</div>';

    document.body.appendChild(wrap);

    // wire toggles
    ["analytics", "functional"].forEach(function (k) {
      var el = document.getElementById("cs-tg-" + k);
      if (el) el.addEventListener("click", function () { toggle(el); });
    });

    // wire buttons
    on("cs-accept-all", function () { commit({ analytics: true,  functional: true  }); });
    on("cs-reject",     function () { commit({ analytics: false, functional: false }); });
    on("cs-save",       function () {
      commit({
        analytics:  isOn(document.getElementById("cs-tg-analytics")),
        functional: isOn(document.getElementById("cs-tg-functional"))
      });
    });
  }

  // ---- a preference row with a toggle -------------------------------------
  function row(title, desc, key, on, locked) {
    var track = locked
      ? "background:" + ACCENT + ";opacity:.5;cursor:not-allowed"
      : (on ? "background:" + ACCENT : "background:#374151") + ";cursor:pointer";
    var knobX = (locked || on) ? "18px" : "2px";
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #1f242e">' +
      '<div style="flex:1">' +
        '<div style="font-weight:600;color:#e5e7eb">' + title + '</div>' +
        '<div style="color:#8b93a1;font-size:11.5px">' + desc + '</div>' +
      '</div>' +
      '<div id="cs-tg-' + key + '" data-on="' + (on || locked ? "1" : "0") + '" data-locked="' + (locked ? "1" : "0") + '" ' +
        'style="flex-shrink:0;width:38px;height:22px;border-radius:22px;position:relative;transition:background .15s;' + track + '">' +
        '<div style="position:absolute;top:2px;left:' + knobX + ';width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s"></div>' +
      '</div>' +
    '</div>';
  }

  function toggle(el) {
    if (el.getAttribute("data-locked") === "1") return;
    var on = el.getAttribute("data-on") === "1";
    on = !on;
    el.setAttribute("data-on", on ? "1" : "0");
    el.style.background = on ? ACCENT : "#374151";
    var knob = el.firstChild;
    if (knob) knob.style.left = on ? "18px" : "2px";
  }
  function isOn(el) { return !!el && el.getAttribute("data-on") === "1"; }

  // ---- a button ------------------------------------------------------------
  function btn(id, label, kind) {
    var base = "width:100%;padding:11px 14px;border-radius:9px;font-weight:700;font-size:12px;letter-spacing:.04em;cursor:pointer;border:1px solid transparent;transition:opacity .15s";
    var style =
      kind === "solid"   ? base + ";background:" + ACCENT + ";color:#fff" :
      kind === "outline" ? base + ";background:transparent;color:#e5e7eb;border-color:#3a4150" :
                           base + ";background:transparent;color:#8b93a1";
    return '<button type="button" id="' + id + '" style="' + style + '">' + label + '</button>';
  }
  function on(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }

  // ---- commit a choice, apply, close --------------------------------------
  function commit(prefs) {
    var record = {
      necessary: true,
      analytics: !!prefs.analytics,
      functional: !!prefs.functional,
      ts: new Date().toISOString()
    };
    save(record);
    apply(record);
    close();
  }

  function close() {
    var el = document.getElementById("cs-consent-root");
    if (!el) return;
    el.style.transition = "opacity .2s, transform .2s";
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 220);
  }

  // ---- apply consent: fire a hook others can listen to --------------------
  function apply(record) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "cs_consent_update", consent: record });
    } catch (e) {}
    try {
      document.dispatchEvent(new CustomEvent("cs:consent", { detail: record }));
    } catch (e) {}
  }

  // ---- boot ----------------------------------------------------------------
  function boot() {
    var existing = load();
    if (existing) { apply(existing); return; } // respect prior choice, no banner
    show(false);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
