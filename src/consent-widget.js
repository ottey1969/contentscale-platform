// ── ContentScale Consent Widget ──────────────────────────────────────────────
// Route: app.get('/consent-widget.js', ...)
// Injected via global middleware alongside badge-loader.js
// Stores: localStorage['cs_consent'] = { analytics: bool, functional: bool, ts: number }
// GDPR-compliant: no analytics/functional cookies fire before consent
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  var STORAGE_KEY = 'cs_consent';
  var WIDGET_ID   = 'cs-consent-widget';

  // ── Already consented? ──────────────────────────────────────────────────────
  try {
    var existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    // Valid consent = has a timestamp less than 365 days old
    if (existing && existing.ts && (Date.now() - existing.ts) < 365 * 24 * 3600 * 1000) {
      return; // Already consented — do nothing
    }
  } catch (e) {}

  // ── Styles ──────────────────────────────────────────────────────────────────
  var css = `
#cs-consent-widget *{box-sizing:border-box;margin:0;padding:0;}
#cs-consent-widget{
  position:fixed;bottom:20px;left:20px;z-index:99999;
  background:#0f0f0f;border:1px solid #1e1e1e;border-radius:12px;
  font-family:'JetBrains Mono',monospace,system-ui,sans-serif;
  width:340px;max-width:calc(100vw - 32px);
  box-shadow:0 8px 32px rgba(0,0,0,.6);
  animation:cs-slide-in .3s cubic-bezier(.16,1,.3,1);
}
@keyframes cs-slide-in{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
#cs-consent-widget .cs-top{padding:18px 18px 14px;}
#cs-consent-widget .cs-badge{
  display:inline-flex;align-items:center;gap:6px;
  background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.3);
  border-radius:20px;padding:3px 10px 3px 7px;margin-bottom:12px;
}
#cs-consent-widget .cs-badge-dot{
  width:5px;height:5px;border-radius:50%;background:#a855f7;
}
#cs-consent-widget .cs-badge-text{
  font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#a855f7;
}
#cs-consent-widget .cs-title{
  font-size:13px;font-weight:700;color:#f0ede8;margin-bottom:6px;
  font-family:system-ui,sans-serif;
}
#cs-consent-widget .cs-body{
  font-size:11px;color:#6b6560;line-height:1.6;
  font-family:system-ui,sans-serif;
}
#cs-consent-widget .cs-body a{color:#a855f7;text-decoration:none;}
#cs-consent-widget .cs-toggles{
  border-top:1px solid #1e1e1e;padding:14px 18px;display:flex;flex-direction:column;gap:10px;
}
#cs-consent-widget .cs-row{
  display:flex;align-items:center;justify-content:space-between;gap:12px;
}
#cs-consent-widget .cs-row-info{flex:1;}
#cs-consent-widget .cs-row-label{
  font-size:11px;font-weight:600;color:#d4d0ca;margin-bottom:2px;
}
#cs-consent-widget .cs-row-sub{
  font-size:10px;color:#6b6560;font-family:system-ui,sans-serif;
}
#cs-consent-widget .cs-switch{
  position:relative;width:36px;height:20px;flex-shrink:0;
}
#cs-consent-widget .cs-switch input{opacity:0;width:0;height:0;position:absolute;}
#cs-consent-widget .cs-slider{
  position:absolute;inset:0;background:#1e1e1e;border:1px solid #2a2a2a;
  border-radius:20px;cursor:pointer;transition:background .2s;
}
#cs-consent-widget .cs-slider:before{
  content:'';position:absolute;width:14px;height:14px;
  background:#4b5563;border-radius:50%;top:2px;left:2px;transition:.2s;
}
#cs-consent-widget .cs-switch input:checked + .cs-slider{background:#7c3aed;border-color:#7c3aed;}
#cs-consent-widget .cs-switch input:checked + .cs-slider:before{transform:translateX(16px);background:#fff;}
#cs-consent-widget .cs-switch input:disabled + .cs-slider{opacity:.5;cursor:not-allowed;}
#cs-consent-widget .cs-actions{
  border-top:1px solid #1e1e1e;padding:14px 18px;
  display:flex;flex-direction:column;gap:8px;
}
#cs-consent-widget .cs-btn{
  width:100%;padding:10px;border:none;border-radius:6px;
  font-family:'JetBrains Mono',monospace;font-size:10px;
  letter-spacing:.1em;text-transform:uppercase;font-weight:700;
  cursor:pointer;transition:opacity .15s;
}
#cs-consent-widget .cs-btn-accept{background:#a855f7;color:#fff;}
#cs-consent-widget .cs-btn-accept:hover{opacity:.88;}
#cs-consent-widget .cs-btn-save{background:#1e1e1e;color:#d4d0ca;border:1px solid #2a2a2a;}
#cs-consent-widget .cs-btn-save:hover{background:#2a2a2a;}
#cs-consent-widget .cs-btn-reject{
  background:transparent;color:#4b5563;border:none;
  font-size:10px;letter-spacing:.08em;text-transform:uppercase;
  font-family:'JetBrains Mono',monospace;cursor:pointer;padding:4px;
  text-align:center;width:100%;
}
#cs-consent-widget .cs-btn-reject:hover{color:#6b6560;}
@media(max-width:400px){
  #cs-consent-widget{left:12px;bottom:12px;width:calc(100vw - 24px);}
}
`;

  // ── Inject styles ───────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── Build HTML ──────────────────────────────────────────────────────────────
  var widget = document.createElement('div');
  widget.id = WIDGET_ID;
  widget.innerHTML = `
    <div class="cs-top">
      <div class="cs-badge">
        <div class="cs-badge-dot"></div>
        <span class="cs-badge-text">Cookie Notice</span>
      </div>
      <div class="cs-title">We respect your privacy</div>
      <p class="cs-body">
        ContentScale uses cookies to improve your experience, analyse usage, and remember your preferences.
        You can choose which cookies to allow below.
        <a href="https://contentscale.site/privacy" target="_blank" rel="noopener">Privacy Policy</a>
      </p>
    </div>

    <div class="cs-toggles">
      <div class="cs-row">
        <div class="cs-row-info">
          <div class="cs-row-label">Necessary</div>
          <div class="cs-row-sub">Session, authentication, security. Always active.</div>
        </div>
        <label class="cs-switch">
          <input type="checkbox" checked disabled>
          <span class="cs-slider"></span>
        </label>
      </div>
      <div class="cs-row">
        <div class="cs-row-info">
          <div class="cs-row-label">Analytics</div>
          <div class="cs-row-sub">Usage patterns, page views, performance data.</div>
        </div>
        <label class="cs-switch">
          <input type="checkbox" id="cs-toggle-analytics" checked>
          <span class="cs-slider"></span>
        </label>
      </div>
      <div class="cs-row">
        <div class="cs-row-info">
          <div class="cs-row-label">Functional</div>
          <div class="cs-row-sub">Preferences, scan history, saved settings.</div>
        </div>
        <label class="cs-switch">
          <input type="checkbox" id="cs-toggle-functional" checked>
          <span class="cs-slider"></span>
        </label>
      </div>
    </div>

    <div class="cs-actions">
      <button class="cs-btn cs-btn-accept" id="cs-accept-all">Accept All</button>
      <button class="cs-btn cs-btn-save"   id="cs-save-prefs">Save My Preferences</button>
      <button class="cs-btn-reject"        id="cs-reject-all">Reject Non-Essential</button>
    </div>
  `;

  document.body.appendChild(widget);

  // ── Save & dismiss ──────────────────────────────────────────────────────────
  function saveConsent(analytics, functional) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        necessary:  true,
        analytics:  analytics,
        functional: functional,
        ts:         Date.now()
      }));
    } catch (e) {}
    // Animate out
    widget.style.transition = 'opacity .25s,transform .25s';
    widget.style.opacity    = '0';
    widget.style.transform  = 'translateY(12px)';
    setTimeout(function () {
      widget.remove();
      style.remove();
    }, 280);
  }

  document.getElementById('cs-accept-all').addEventListener('click', function () {
    saveConsent(true, true);
  });

  document.getElementById('cs-save-prefs').addEventListener('click', function () {
    var analytics  = document.getElementById('cs-toggle-analytics').checked;
    var functional = document.getElementById('cs-toggle-functional').checked;
    saveConsent(analytics, functional);
  });

  document.getElementById('cs-reject-all').addEventListener('click', function () {
    saveConsent(false, false);
  });

})();
