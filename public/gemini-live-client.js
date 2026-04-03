// ContentScale — Otto AI Voice Client v2
// Web Speech API (recognition) + Gemini REST + Web Speech Synthesis

(function() {
  'use strict';

  var _active   = false;
  var _recogn   = null;
  var _synth    = window.speechSynthesis;
  var _history  = [];
  var _speaking = false;

  var SYSTEM_PROMPT = 'You are Otto, ContentScale AI assistant. Help visitors understand the GRAAF Framework (content scoring 0-100), ContentScore SEO audits, and B2B lead generation. Be concise — max 2-3 sentences per answer. Always disclose you are an AI. ContentScale is based in Amsterdam.';

  function setStatus(msg) {
    var el = document.getElementById('gl-status');
    if (el) el.textContent = msg;
  }

  function addTranscript(who, msg) {
    var el = document.getElementById('gl-transcript');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML += '<div style="color:' + (who === 'otto' ? '#4ade80' : '#f9fafb') + ';margin-bottom:6px;line-height:1.5;"><strong>' + (who === 'otto' ? 'Otto:' : 'You:') + '</strong> ' + msg + '</div>';
    el.scrollTop = el.scrollHeight;
  }

  function setBtnActive(active) {
    var btn = document.getElementById('gl-call-btn');
    var r1  = document.getElementById('gl-ring1');
    if (!btn) return;
    if (active) {
      btn.style.background = 'linear-gradient(135deg,#dc2626,#f87171)';
      btn.style.boxShadow  = '0 0 0 8px rgba(239,68,68,.2),0 0 32px rgba(239,68,68,.4)';
      if (r1) r1.style.animation = 'rp 1.2s ease-in-out infinite';
    } else {
      btn.style.background = 'linear-gradient(135deg,#166534,#4ade80)';
      btn.style.boxShadow  = '0 0 0 8px rgba(74,222,128,.15),0 0 32px rgba(74,222,128,.3)';
      if (r1) r1.style.animation = '';
    }
  }

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function stopSession() {
    _active  = false;
    _speaking = false;
    if (_recogn) { try { _recogn.abort(); } catch(e){} _recogn = null; }
    if (_synth)  _synth.cancel();
    setBtnActive(false);
    setStatus('Click to start a conversation');
  }

  // ── Gemini REST call — correct Gemini API format ──────────
  async function askGemini(userText) {
    setStatus('Otto is thinking...');
    addTranscript('you', userText);
    _history.push({ role: 'user', parts: [{ text: userText }] });

    // Build Gemini-format request
    var body = {
      contents: _history,
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { maxOutputTokens: 200, temperature: 0.7 }
    };

    try {
      var r = await fetch(
        'https://app.contentscale.site/api/gemini-proxy?model=gemini-2.0-flash-lite',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      var d = await r.json();

      var reply = '';
      if (d.candidates && d.candidates[0] && d.candidates[0].content) {
        reply = d.candidates[0].content.parts.map(function(p){ return p.text||''; }).join('');
      } else if (d.error) {
        reply = 'Sorry, I had a problem connecting. Please try again.';
        console.error('[otto] Gemini error:', d.error);
      }

      if (!reply) reply = 'Sorry, no response. Please try again.';

      _history.push({ role: 'model', parts: [{ text: reply }] });
      addTranscript('otto', reply);
      speakReply(reply);

    } catch(e) {
      setStatus('Error: ' + e.message);
      console.error('[otto] fetch error:', e);
      if (_active) startListening();
    }
  }

  // ── Text-to-speech ────────────────────────────────────────
  function speakReply(text) {
    if (!_synth || !_active) { if (_active) startListening(); return; }
    _speaking = true;
    setStatus('Otto is speaking...');
    _synth.cancel();

    var utt = new SpeechSynthesisUtterance(text);
    utt.lang  = 'en-GB';
    utt.rate  = 0.95;
    utt.pitch = 1.0;
    utt.volume = 1.0;

    // Pick best available voice
    function pickVoice() {
      var voices = _synth.getVoices();
      // Prefer premium/natural-sounding voices
      var preferred = voices.find(function(v){
        return /Daniel|Google UK|Microsoft Ryan|Rishi/i.test(v.name) && v.lang.startsWith('en');
      }) || voices.find(function(v){
        return v.lang === 'en-GB' && !v.name.includes('compact');
      }) || voices.find(function(v){
        return v.lang.startsWith('en-') && v.localService === false;
      }) || voices.find(function(v){
        return v.lang.startsWith('en');
      });
      if (preferred) utt.voice = preferred;
    }

    if (_synth.getVoices().length) {
      pickVoice();
    } else {
      _synth.addEventListener('voiceschanged', pickVoice, { once: true });
    }

    utt.onend = function() {
      _speaking = false;
      if (_active) { setStatus('Listening...'); startListening(); }
    };
    utt.onerror = function(e) {
      _speaking = false;
      console.warn('[otto] speech synth error:', e.error);
      if (_active) startListening();
    };

    _synth.speak(utt);
  }

  // ── Speech recognition ────────────────────────────────────
  function startListening() {
    if (!_active || !SpeechRecognition || _speaking) return;
    setStatus('Listening — speak now...');

    _recogn = new SpeechRecognition();
    _recogn.lang            = 'en-US';
    _recogn.continuous      = false;
    _recogn.interimResults  = false;
    _recogn.maxAlternatives = 1;

    _recogn.onresult = function(evt) {
      var text = evt.results[0][0].transcript.trim();
      if (text) { if (_recogn) { try{_recogn.stop();}catch(e){} _recogn=null; } askGemini(text); }
    };

    _recogn.onerror = function(evt) {
      if (evt.error === 'aborted') return; // normal stop
      console.warn('[otto] speech error:', evt.error);
      if (evt.error === 'not-allowed') {
        setStatus('Microphone blocked — allow in browser settings');
        stopSession();
      } else if (_active && !_speaking) {
        setTimeout(startListening, 500);
      }
    };

    try { _recogn.start(); } catch(e) { console.warn('[otto]', e); }
  }

  // ── Start ─────────────────────────────────────────────────
  function startSession() {
    if (_active) { stopSession(); return; }

    if (!SpeechRecognition) {
      setStatus('Voice not supported — type below');
      var ti = document.getElementById('otto-text-input');
      if (ti) ti.style.display = 'flex';
      return;
    }

    _active  = true;
    _history = [];
    setBtnActive(true);

    var greeting = 'Hi, I am Otto, ContentScale AI assistant. Ask me about SEO, content scoring, or lead generation.';
    addTranscript('otto', greeting);
    speakReply(greeting);
  }

  // ── Text fallback ─────────────────────────────────────────
  function handleTextSend() {
    var field = document.getElementById('otto-text-field');
    if (!field || !field.value.trim()) return;
    var text = field.value.trim();
    field.value = '';
    _active = true;
    askGemini(text);
  }

  // ── Tawk safety shim ──────────────────────────────────────
  window.Tawk_API = window.Tawk_API || {};
  if (!window.Tawk_API.triggerEvent) {
    window.Tawk_API.triggerEvent = function() {};
  }

  // ── Attach ────────────────────────────────────────────────
  function attach() {
    var callBtn = document.getElementById('gl-call-btn');
    if (!callBtn) { setTimeout(attach, 150); return; }

    callBtn.addEventListener('click', startSession);

    var sendBtn = document.getElementById('otto-send-btn');
    var textFld = document.getElementById('otto-text-field');
    if (sendBtn) sendBtn.addEventListener('click', handleTextSend);
    if (textFld) textFld.addEventListener('keydown', function(e){ if(e.key==='Enter') handleTextSend(); });

    var ti = document.getElementById('otto-text-input');
    if (ti) ti.style.display = 'flex';

    console.log('[otto] voice button ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }

})();
