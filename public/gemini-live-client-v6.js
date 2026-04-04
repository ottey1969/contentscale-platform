// ContentScale — Otto AI — Gemini Live v6
// Male voice (Fenrir) + auto-hangup 3s after conversation ends

(function() {
  'use strict';

  var _ws          = null;
  var _active      = false;
  var _micCtx      = null;
  var _stream      = null;
  var _processor   = null;
  var _playCtx     = null;
  var _nextStart   = 0;
  var _hangupTimer    = null;
  var _maxTimer       = null;  // hard cutoff regardless of conversation
  var _turnCount      = 0;     // count Otto's turns
  var _sessionId   = null;
  var _sessionStart = null;
  var _transcript  = [];
  var _sessionModel = null;

  var WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

  var OTTO_SCRIPT = "You are Otto, a male AI voice assistant of ContentScale. Use a deep, warm, natural male voice. Follow this script exactly and do not deviate. 1. Say immediately: Hey! I am Otto, the AI assistant of ContentScale. May I have your name? 2. Wait for their answer. 3. Then say: Hey [name]! We help you recover lost SEO traffic with our free GRAAF Framework scan and our Google Search Console PULSE+NEXUS SEO audit framework. We can also help you with leads, call for you, and make sure you never miss any clients again. If you like how I sound, contact Ottmar via WhatsApp at plus 31 6 28 07 39 96. Cheers! 4. Then ask: Are you able to send Ottmar a message today? 5a. If yes: say: Okay, I will let him know! Speak to you soon! Then say goodbye and stop talking. 5b. If no: say: May I know why not? Wait for their answer. Then say: Okay, maybe next time! Take care! Then say goodbye and stop talking. Keep it exactly like this script. Do not add extra information.";

  function setStatus(msg) {
    var el = document.getElementById('gl-status');
    if (el) el.textContent = msg;
  }

  function addTranscript(who, msg) {
    var el = document.getElementById('gl-transcript');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML += '<div style="color:' + (who === 'model' ? '#4ade80' : '#f9fafb') + ';margin-bottom:5px;line-height:1.6;"><strong>' + (who === 'model' ? 'Otto:' : 'You:') + '</strong> ' + msg + '</div>';
    el.scrollTop = el.scrollHeight;
  }

  function setBtnActive(on) {
    var btn = document.getElementById('gl-call-btn');
    var r1  = document.getElementById('gl-ring1');
    if (!btn) return;
    if (on) {
      btn.style.background = 'linear-gradient(135deg,#dc2626,#f87171)';
      btn.style.boxShadow  = '0 0 0 8px rgba(239,68,68,.2),0 0 32px rgba(239,68,68,.4)';
      if (r1) r1.style.animation = 'rp 1s ease-in-out infinite';
    } else {
      btn.style.background = 'linear-gradient(135deg,#166534,#4ade80)';
      btn.style.boxShadow  = '0 0 0 8px rgba(74,222,128,.15),0 0 32px rgba(74,222,128,.3)';
      if (r1) r1.style.animation = '';
    }
  }

  function scheduleHangup(delayMs) {
    clearTimeout(_hangupTimer);
    clearTimeout(_maxTimer);
    _maxTimer = null;
    _hangupTimer = setTimeout(function() {
      if (_active) {
        setStatus('Call ended');
        stopSession();
      }
    }, delayMs || 3000);
  }

  function cancelHangup() {
    clearTimeout(_hangupTimer);
    _hangupTimer = null;
  }

  function ensurePlayCtx() {
    if (!_playCtx || _playCtx.state === 'closed') {
      _playCtx  = new AudioContext({ sampleRate: 24000 });
      _nextStart = 0;
    }
    if (_playCtx.state === 'suspended') _playCtx.resume();
  }

  function scheduleAudioChunk(b64) {
    ensurePlayCtx();
    try {
      var raw   = atob(b64);
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      var pcm16   = new Int16Array(bytes.buffer);
      var float32 = new Float32Array(pcm16.length);
      for (var j = 0; j < pcm16.length; j++) float32[j] = pcm16[j] / 32768.0;
      var buf = _playCtx.createBuffer(1, float32.length, 24000);
      buf.copyToChannel(float32, 0);
      var src = _playCtx.createBufferSource();
      src.buffer = buf;
      src.connect(_playCtx.destination);
      var now  = _playCtx.currentTime;
      var when = Math.max(now, _nextStart);
      src.start(when);
      _nextStart = when + buf.duration;
    } catch(e) { console.warn('[otto] audio error:', e.message); }
  }

  function saveSession() {
    if (!_sessionId || !_transcript.length) return;
    var duration = Math.round((Date.now() - _sessionStart) / 1000);
    fetch('https://app.contentscale.site/api/otto/save-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: _sessionId,
        transcript: _transcript,
        durationSeconds: duration,
        model: _sessionModel
      })
    }).then(function(r){ console.log('[otto] session saved, duration:', duration + 's'); })
      .catch(function(e){ console.warn('[otto] save session error:', e.message); });
  }

  function stopSession() {
    saveSession();
    _active = false;
    clearTimeout(_hangupTimer);
    if (_processor) { try { _processor.disconnect(); } catch(e) {} _processor = null; }
    if (_stream)    { _stream.getTracks().forEach(function(t) { t.stop(); }); _stream = null; }
    if (_micCtx)    { try { _micCtx.close(); } catch(e) {} _micCtx = null; }
    if (_playCtx)   { try { _playCtx.close(); } catch(e) {} _playCtx = null; }
    if (_ws && _ws.readyState < 2) { try { _ws.close(); } catch(e) {} }
    _ws = null;
    _nextStart = 0;
    setBtnActive(false);
    setStatus('Click to start a live conversation');
  }

  async function startMic() {
    _stream    = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
    _micCtx    = new AudioContext({ sampleRate: 16000 });
    var src    = _micCtx.createMediaStreamSource(_stream);
    _processor = _micCtx.createScriptProcessor(2048, 1, 1);

    _processor.onaudioprocess = function(e) {
      if (!_ws || _ws.readyState !== 1 || !_active) return;
      var input = e.inputBuffer.getChannelData(0);
      var pcm   = new Int16Array(input.length);
      for (var i = 0; i < input.length; i++) {
        var s = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      var b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm.buffer)));
      _ws.send(JSON.stringify({
        realtimeInput: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } }
      }));
    };

    src.connect(_processor);
    _processor.connect(_micCtx.destination);
    setStatus('Listening...');
  }

  async function startSession() {
    if (_active) { stopSession(); return; }
    setStatus('Getting key...');
    _active = true;
    setBtnActive(true);
    _sessionId    = 'otto-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);
    _sessionStart = Date.now();
    _transcript   = [];

    var keyData;
    try {
      var r = await fetch('https://app.contentscale.site/api/gemini-live-token');
      keyData = await r.json();
      if (!r.ok || !keyData.key) {
        setStatus('Error: ' + (keyData.error || 'No key returned'));
        stopSession();
        return;
      }
    } catch(e) {
      setStatus('Server error: ' + e.message);
      stopSession();
      return;
    }

    var model = keyData.model || 'gemini-3.1-flash-live-preview';
    console.log('[otto] model:', model);
    _sessionModel = model;

    var wsUrl = WS_BASE + '?key=' + encodeURIComponent(keyData.key);
    setStatus('Connecting...');

    try {
      _ws = new WebSocket(wsUrl);
      _ws.binaryType = 'arraybuffer';
    } catch(e) {
      setStatus('WebSocket error: ' + e.message);
      stopSession();
      return;
    }

    _ws.onopen = function() {
      setStatus('Connected...');
      var setupMsg = {
        setup: {
          model: 'models/' + model,
          generation_config: {
            response_modalities: ['AUDIO'],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: { voice_name: 'Fenrir' }
              }
            }
          },
          system_instruction: {
            parts: [{ text: OTTO_SCRIPT }]
          }
        }
      };
      console.log('[otto] sending setup:', JSON.stringify(setupMsg));
      _ws.send(JSON.stringify(setupMsg));
    };

    _ws.onmessage = function(evt) {
      try {
        var rawData = evt.data;
        if (rawData instanceof ArrayBuffer) {
          rawData = new TextDecoder('utf-8').decode(new Uint8Array(rawData));
        }
        var msg = JSON.parse(rawData);

        if (msg.setupComplete) {
          setStatus('Otto is speaking...');
          startMic().catch(function(e) {
            setStatus('Mic error: ' + e.message);
            stopSession();
          });
          return;
        }

        if (msg.serverContent) {
          var sc = msg.serverContent;

          // Play audio chunks
          if (sc.modelTurn && sc.modelTurn.parts) {
            sc.modelTurn.parts.forEach(function(p) {
              if (p.inlineData && p.inlineData.data) {
                scheduleAudioChunk(p.inlineData.data);
              }
            });
          }

          // Show transcripts
          if (sc.inputTranscription) {
            // Only cancel hangup if we're early in conversation (< 4 turns)
            if (_turnCount < 4) cancelHangup();
            addTranscript('you', sc.inputTranscription.text);
            _transcript.push({ role: 'user', text: sc.inputTranscription.text, t: Date.now() });
          }
          if (sc.outputTranscription) {
            var oText = sc.outputTranscription.text || '';
            addTranscript('model', oText);
            _transcript.push({ role: 'otto', text: oText, t: Date.now() });
            // Detect goodbye → hang up fast
            var goodbyeWords = ['goodbye','cheers','take care','speak to you soon','good luck','bye'];
            var isGoodbye = goodbyeWords.some(function(w){ return oText.toLowerCase().indexOf(w) > -1; });
            if (isGoodbye) {
              console.log('[otto] goodbye detected — hanging up in 2s');
              scheduleHangup(2000);
            }
          }

          if (sc.turnComplete) {
            _turnCount++;
            setStatus('Listening...');
            // After 4+ turns always hang up within 5s
            var delay = _turnCount >= 4 ? 3000 : 5000;
            scheduleHangup(delay);
          }
        }
      } catch(e) { console.warn('[otto] parse error:', e.message); }
    };

    _ws.onerror = function(e) {
      console.error('[otto] ws error', e);
      setStatus('Connection error');
      stopSession();
    };

    _ws.onclose = function(evt) {
      console.log('[otto] closed code=' + evt.code);
      if (_active) {
        setStatus(evt.code === 1008 ? 'API key needs Gemini Live access' : 'Disconnected');
        stopSession();
      }
    };
  }

  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_API.triggerEvent    = window.Tawk_API.triggerEvent    || function() {};
  window.Tawk_API.addQuickReplies = window.Tawk_API.addQuickReplies || function() {};

  function attach() {
    var btn = document.getElementById('gl-call-btn');
    if (!btn) { setTimeout(attach, 150); return; }
    btn.addEventListener('click', startSession);
    console.log('[otto] v6 loaded — Gemini Live ready | Fenrir male voice');
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', attach)
    : attach();

})();
