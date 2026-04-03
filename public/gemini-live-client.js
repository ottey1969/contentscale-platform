// ContentScale — Otto AI — Gemini Live
// Uses ephemeral tokens (Google recommended) — browser connects DIRECTLY to Google
// No audio proxy — lower latency, natural Fenrir voice

(function() {
  'use strict';

  var _ws        = null;
  var _active    = false;
  var _micCtx    = null;
  var _stream    = null;
  var _processor = null;
  var _playCtx   = null;
  var _nextStart = 0;

  var WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

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

  // ── Gapless PCM16 audio playback ─────────────────────────
  function ensurePlayCtx() {
    if (!_playCtx || _playCtx.state === 'closed') {
      _playCtx = new AudioContext({ sampleRate: 24000 });
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
      var pcm16  = new Int16Array(bytes.buffer);
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

  // ── Stop ─────────────────────────────────────────────────
  function stopSession() {
    _active = false;
    if (_processor) { try{_processor.disconnect();}catch(e){} _processor = null; }
    if (_stream)    { _stream.getTracks().forEach(function(t){t.stop();}); _stream = null; }
    if (_micCtx)    { try{_micCtx.close();}catch(e){} _micCtx = null; }
    if (_playCtx)   { try{_playCtx.close();}catch(e){} _playCtx = null; }
    if (_ws && _ws.readyState < 2) { try{_ws.close();}catch(e){} }
    _ws = null;
    _nextStart = 0;
    setBtnActive(false);
    setStatus('Click to start a live conversation');
  }

  // ── Mic → PCM16 → WebSocket ───────────────────────────────
  async function startMic() {
    _stream  = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 }, video: false });
    _micCtx  = new AudioContext({ sampleRate: 16000 });
    var src  = _micCtx.createMediaStreamSource(_stream);
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
        realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: b64 }] }
      }));
    };

    src.connect(_processor);
    _processor.connect(_micCtx.destination);
    setStatus('Listening — speak now');
  }

  // ── Start session ─────────────────────────────────────────
  async function startSession() {
    if (_active) { stopSession(); return; }
    setStatus('Getting token...');
    _active = true;
    setBtnActive(true);

    // Step 1: get ephemeral token from our server
    var token;
    try {
      var r = await fetch('https://app.contentscale.site/api/gemini-live-token');
      var d = await r.json();
      if (!r.ok || !d.token) {
        setStatus('Token error: ' + (d.error || 'unknown'));
        console.error('[otto] token error:', d);
        stopSession();
        return;
      }
      token = d.token;
      console.log('[otto] token received, connecting to Google...');
    } catch(e) {
      setStatus('Server error: ' + e.message);
      stopSession();
      return;
    }

    // Step 2: connect DIRECTLY to Google using ephemeral token
    setStatus('Connecting to Gemini...');
    var wsUrl = WS_BASE + '?key=' + encodeURIComponent(token);

    try {
      _ws = new WebSocket(wsUrl);
    } catch(e) {
      setStatus('WebSocket error: ' + e.message);
      stopSession();
      return;
    }

    _ws.onopen = function() {
      setStatus('Connected — sending setup...');
      // Send setup — model and config already locked in the ephemeral token
      // but we can still send setup to confirm
      _ws.send(JSON.stringify({
        setup: {
          model: 'models/gemini-3.1-flash-live-preview',
          generationConfig: {
            responseModalities: ['AUDIO', 'TEXT'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Fenrir' }
              }
            }
          },
          systemInstruction: {
            parts: [{ text: 'You are Otto, the AI assistant of ContentScale — an Amsterdam-based SEO platform. Help visitors understand ContentScore (0-100 content quality score), the GRAAF Framework, PULSE+NEXUS audits, and B2B lead generation with AI. Be warm, concise, and always disclose you are an AI. Max 2-3 sentences per response for voice.' }]
          }
        }
      }));
    };

    _ws.onmessage = function(evt) {
      try {
        var msg = typeof evt.data === 'string' ? JSON.parse(evt.data) : null;
        if (!msg) return;

        if (msg.setupComplete) {
          setStatus('Ready — speak now');
          startMic().catch(function(e) {
            setStatus('Mic: ' + e.message);
            stopSession();
          });
          return;
        }

        if (msg.serverContent) {
          var turn = msg.serverContent.modelTurn;
          if (turn && turn.parts) {
            turn.parts.forEach(function(p) {
              if (p.inlineData && p.inlineData.data) scheduleAudioChunk(p.inlineData.data);
              if (p.text) addTranscript('model', p.text);
            });
          }
          if (msg.serverContent.turnComplete) setStatus('Listening...');
        }
      } catch(e) { console.warn('[otto] parse:', e.message); }
    };

    _ws.onerror = function() {
      setStatus('Connection error — check console');
      stopSession();
    };

    _ws.onclose = function(evt) {
      console.log('[otto] closed code=' + evt.code + ' reason=' + evt.reason);
      var msgs = {
        1008: 'Key/token rejected by Google. Try aistudio.google.com/live to verify key has Live access.',
        1006: 'Connection dropped unexpectedly'
      };
      if (_active) {
        var m = msgs[evt.code] || 'Disconnected (code ' + evt.code + ')';
        setStatus(m);
        if (msgs[evt.code]) addTranscript('model', m);
        stopSession();
      }
    };
  }

  // Tawk safety shim
  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_API.triggerEvent = window.Tawk_API.triggerEvent || function(){};

  function attach() {
    var btn = document.getElementById('gl-call-btn');
    if (!btn) { setTimeout(attach, 150); return; }
    btn.addEventListener('click', startSession);
    console.log('[otto] Gemini Live ready (ephemeral tokens) voice: Fenrir');
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', attach)
    : attach();

})();
