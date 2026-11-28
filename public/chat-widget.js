/* ContentScale — chat with Ottmar (chat-widget.js)
   Self-contained; works on app.contentscale.site and on WordPress with one line:
   <script src="https://app.contentscale.site/chat-widget.js?v=1" defer></script>
   Shows a "Chat with Ottmar" launcher. Tawk.to (third party, sets cookies) loads only after Functional consent in the
   ContentScale cookie widget (cs_cookie_consent_v1); a click without consent opens the cookie choice. */
(function () {
  'use strict';
  if (window.__csChatLoaded) return;
  window.__csChatLoaded = true;
  var TAWK = 'https://embed.tawk.to/68cac7f84318b419244f3308/default';
  var me = document.currentScript;
  var origin = 'https://app.contentscale.site';
  try { if (me && me.src) origin = new URL(me.src, location.href).origin; } catch (e) {}
  var lang = String(document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  var label = { nl: 'Chat met Ottmar', es: 'Chatea con Ottmar' }[lang] || 'Chat with Ottmar';
  var pendingOpen = false, launcher = null;

  function functional() { try { var p = JSON.parse(localStorage.getItem('cs_cookie_consent_v1') || 'null'); return !!(p && p.functional); } catch (e) { return false; } }
  function hideLauncher() { if (launcher) launcher.style.display = 'none'; }
  function maximize() {
    var tries = 0;
    (function go() {
      tries++;
      if (window.Tawk_API && typeof window.Tawk_API.maximize === 'function') { pendingOpen = false; window.Tawk_API.maximize(); return; }
      if (pendingOpen && tries < 40) setTimeout(go, 200);
    })();
  }
  function loadTawk() {
    if (!functional()) return;
    if (window.__pqsTawkLoading || document.querySelector('script[src*="embed.tawk.to"]')) { hideLauncher(); if (pendingOpen) maximize(); return; }
    window.__pqsTawkLoading = true;
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();
    var previous = window.Tawk_API.onLoad;
    window.Tawk_API.onLoad = function () { hideLauncher(); if (pendingOpen) maximize(); if (typeof previous === 'function') previous(); };
    var s = document.createElement('script');
    s.async = true; s.src = TAWK; s.charset = 'UTF-8'; s.crossOrigin = 'anonymous'; s.setAttribute('data-cs-tawk', '1');
    s.onerror = function () { window.__pqsTawkLoading = false; if (launcher) launcher.style.display = ''; };
    document.head.appendChild(s);
  }
  function open() {
    pendingOpen = true;
    if (!functional()) { if (window.csConsent && typeof window.csConsent.open === 'function') window.csConsent.open(); return; }
    loadTawk(); maximize();
  }
  if (typeof window.openChat !== 'function') window.openChat = open;
  if (typeof window.openOttmarChat !== 'function') window.openOttmarChat = open;

  function build() {
    if (document.getElementById('cs-chat-launcher')) return;
    launcher = document.createElement('button');
    launcher.type = 'button'; launcher.id = 'cs-chat-launcher'; launcher.setAttribute('aria-label', label);
    launcher.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9998;display:flex;align-items:center;gap:10px;padding:6px 16px 6px 6px;border:0;border-radius:999px;background:#7c3aed;color:#fff;font:700 14px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer';
    var img = document.createElement('img');
    img.src = origin + '/blog/images/ottmar-francisca.jpg'; img.alt = ''; img.width = 40; img.height = 40;
    img.style.cssText = 'width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #fff';
    img.onerror = function () { img.style.display = 'none'; };
    var text = document.createElement('span'); text.textContent = label;
    launcher.appendChild(img); launcher.appendChild(text);
    launcher.addEventListener('click', open);
    document.body.appendChild(launcher);
    if (window.Tawk_API && window.Tawk_API.maximize) hideLauncher();
  }
  document.addEventListener('cs:consent', function (e) { if (e.detail && e.detail.functional) { loadTawk(); if (pendingOpen) maximize(); } });
  function start() { build(); loadTawk(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
