// ContentScale — Otto AI Voice Client
// Uses Web Speech API (browser speech recognition) + Gemini REST API
// No WebSocket, no special API access needed — works with standard Gemini key

(function() {
  'use strict';

  var _active   = false;
  var _recogn   = null;
  var _synth    = window.speechSynthesis;
  var _history  = []; // conversation history for context

  var SYSTEM_PROMPT = 'You are Otto, ContentScale AI assistant. You help visitors understand the GRAAF Framework (content scoring 0-100), ContentScore SEO audits, and AI-driven B2B lead generation. Be concise — max 3 sentences per answer. Always disclose you are an AI. ContentScale is based in Amsterdam.';

  // ── DOM helpers ──────────────────────────────────────────
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

  // ── Check browser support ─────────────────────────────────
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    // Fallback: show text input if speech not supported
    console.warn('[otto] Speech recognition not supported — showing text input');
    var ti = document.getElementById('otto-text-input');
    if (ti) ti.style.display = 'flex';
    setStatus('Type to talk to Otto (voice not supported in this browser)');
  }

  // ── Stop everything ───────────────────────────────────────
  function stopSession() {
    _active = false;
    if (_recogn) { try { _recogn.stop(); } catch(e){} _recogn = null; }
    if (_synth)  { _synth.cancel(); }
    setBtnActive(false);
    setStatus('Click to start a conversation');
  }

  // ── Send text to Gemini REST API ──────────────────────────
  async function askGemini(userText) {
    setStatus('Otto is thinking...');
    addTranscript('you', userText);

    _history.push({ role: 'user', parts: [{ text: userText }] });

    try {
      var r = await fetch('https://app.contentscale.site/api/gemini-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-2.0-flash',
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: _history.map(function(m) {
            return { role: m.role, content: m.parts[0].text };
          })
        })
      });

      var d = await r.json();

      // Extract text from response
      var reply = '';
      if (d.content && d.content[0] && d.content[0].text) {
        reply = d.content[0].text;
      } else if (d.candidates && d.candidates[0]) {
        var parts = d.candidates[0].content && d.candidates[0].content.parts;
        if (parts) reply = parts.map(function(p){ return p.text||''; }).join('');
      } else if (d.error) {
        reply = 'Sorry, I had a problem: ' + (d.error.message || d.error);
      }

      if (!reply) reply = 'Sorry, I did not get a response. Please try again.';

      _history.push({ role: 'assistant', parts: [{ text: reply }] });
      addTranscript('otto', reply);
      speakReply(reply);

    } catch(e) {
      setStatus('Error: ' + e.message);
      console.error('[otto] API error:', e);
      setBtnActive(false);
    }
  }

  // ── Text-to-speech ────────────────────────────────────────
  function speakReply(text) {
    if (!_synth || !_active) return;
    setStatus('Otto is speaking...');
    _synth.cancel();
    var utt = new SpeechSynthesisUtterance(text);
    utt.lang  = 'en-US';
    utt.rate  = 1.05;
    utt.pitch = 1.0;

    // Prefer a natural voice if available
    var voices = _synth.getVoices();
    var preferred = voices.find(function(v){
      return /Google|Microsoft|Alex|Samantha/i.test(v.name) && v.lang.startsWith('en');
    }) || voices.find(function(v){ return v.lang.startsWith('en'); });
    if (preferred) utt.voice = preferred;

    utt.onend = function() {
      if (_active) {
        setStatus('Listening...');
        startListening();
      }
    };
    utt.onerror = function() {
      if (_active) startListening();
    };
    _synth.speak(utt);
  }

  // ── Speech recognition ────────────────────────────────────
  function startListening() {
    if (!_active || !SpeechRecognition) return;
    setStatus('Listening — speak now...');

    _recogn = new SpeechRecognition();
    _recogn.lang        = 'en-US';
    _recogn.interimResults = false;
    _recogn.maxAlternatives = 1;

    _recogn.onresult = function(evt) {
      var text = evt.results[0][0].transcript.trim();
      if (text) askGemini(text);
    };

    _recogn.onerror = function(evt) {
      console.warn('[otto] speech error:', evt.error);
      if (evt.error === 'no-speech') {
        if (_active) startListening(); // keep listening
      } else if (evt.error === 'not-allowed') {
        setStatus('Mic access denied — allow microphone in browser');
        stopSession();
      } else {
        if (_active) startListening();
      }
    };

    _recogn.onend = function() {
      // Will restart in onresult → askGemini → speakReply → onend chain
    };

    try { _recogn.start(); } catch(e) { console.warn('[otto] recogn start:', e); }
  }

  // ── Start session ─────────────────────────────────────────
  function startSession() {
    if (_active) { stopSession(); return; }
    if (!SpeechRecognition) {
      setStatus('Voice not supported — use text input below');
      var ti = document.getElementById('otto-text-input');
      if (ti) ti.style.display = 'flex';
      return;
    }
    _active  = true;
    _history = [];
    setBtnActive(true);
    setStatus('Starting...');

    // Greet first
    var greeting = 'Hi! I am Otto, ContentScale AI assistant. Ask me anything about SEO, the GRAAF Framework, or B2B lead generation.';
    addTranscript('otto', greeting);
    speakReply(greeting);
  }

  // ── Text input fallback (already in HTML) ─────────────────
  function handleTextSend() {
    var field = document.getElementById('otto-text-field');
    if (!field || !field.value.trim()) return;
    var text = field.value.trim();
    field.value = '';
    _active = true;
    askGemini(text);
  }

  // ── Attach everything ─────────────────────────────────────
  function attach() {
    var callBtn  = document.getElementById('gl-call-btn');
    var sendBtn  = document.getElementById('otto-send-btn');
    var textFld  = document.getElementById('otto-text-field');

    if (callBtn) {
      callBtn.addEventListener('click', startSession);
      console.log('[otto] voice button ready');
    } else {
      setTimeout(attach, 150);
      return;
    }

    if (sendBtn) sendBtn.addEventListener('click', handleTextSend);
    if (textFld) textFld.addEventListener('keydown', function(e){
      if (e.key === 'Enter') handleTextSend();
    });

    // Show text input always as fallback
    var ti = document.getElementById('otto-text-input');
    if (ti) ti.style.display = 'flex';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }

})();
