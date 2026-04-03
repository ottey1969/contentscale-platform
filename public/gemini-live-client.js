// ContentScale — Otto AI — Gemini Live
// Real audio in/out via paid Gemini Live API
// No Web Speech Synthesis — natural Gemini voice

(function() {
  'use strict';

  var _ws        = null;
  var _active    = false;
  var _micCtx    = null;
  var _stream    = null;
  var _processor = null;
  var _playCtx   = null;
  var _nextStart = 0; // for gapless audio scheduling

  // Gemini Live voices: Puck · Charon · Kore · Fenrir · Aoede
  var VOICE = 'Fenrir'; // natural male voice

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
      _playCtx  = new AudioContext({ sampleRate: 24000 });
      _nextStart = 0;
    }
    if (_playCtx.state === 'suspended') _playCtx.resume();
  }

  function scheduleAudioChunk(b64) {
    ensurePlayCtx();
    try {
      var raw  = atob(b64);
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

      var pcm16  = new Int16Array(bytes.buffer);
      var float32 = new Float32Array(pcm16.length);
      for (var j = 0; j < pcm16.length; j++) float32[j] = pcm16[j] / 32768.0;

      var buf    = _playCtx.createBuffer(1, float32.length, 24000);
      buf.copyToChannel(float32, 0);

      var src = _playCtx.createBufferSource();
      src.buffer = buf;
      src.connect(_playCtx.destination);

      var now = _playCtx.currentTime;
      var when = Math.max(now, _nextStart);
      src.start(when);
      _nextStart = when + buf.duration;
    } catch(e) {
      console.warn('[otto] audio chunk error:', e.message);
    }
  }

  // ── Stop everything ───────────────────────────────────────
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

  // ── Microphone → PCM16 → WebSocket ───────────────────────
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

  // ── Connect ───────────────────────────────────────────────
  async function startSession() {
    if (_active) { stopSession(); return; }
    setStatus('Connecting...');
    _active = true;
    setBtnActive(true);

    var wsUrl = (location.protocol === 'https:' ? 'wss' : 'ws') + '://app.contentscale.site/api/gemini-live-ws';
    console.log('[otto] connecting to', wsUrl);

    try {
      _ws = new WebSocket(wsUrl);
    } catch(e) {
      setStatus('WebSocket error: ' + e.message);
      stopSession();
      return;
    }

    _ws.onopen = function() {
      setStatus('Sending setup...');
      _ws.send(JSON.stringify({
        setup: {
          model: 'models/gemini-2.0-flash-live-001',
          generationConfig: {
            responseModalities: ['AUDIO', 'TEXT'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: VOICE }
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

        if (msg.type === 'server_ready') { setStatus('Initialising...'); return; }

        if (msg.error) {
          setStatus('Error: ' + (msg.hint || msg.msg || msg.error));
          console.error('[otto]', msg);
          stopSession();
          return;
        }

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
              // Real Gemini voice audio
              if (p.inlineData && p.inlineData.data) {
                scheduleAudioChunk(p.inlineData.data);
              }
              // Text transcript (optional display)
              if (p.text) addTranscript('model', p.text);
            });
          }
          if (msg.serverContent.turnComplete) setStatus('Listening...');
        }
      } catch(e) { console.warn('[otto] parse:', e.message); }
    };

    _ws.onerror = function() {
      setStatus('Connection error');
      stopSession();
    };

    _ws.onclose = function(evt) {
      var reasons = {
        1008: 'API key rejected — verify GEMINI_KEY_LIVE in Railway has Gemini Live access',
        1011: 'Server error — check Railway deploy logs',
        1006: 'Connection dropped'
      };
      if (_active) {
        var msg = reasons[evt.code] || 'Disconnected (code ' + evt.code + ')';
        setStatus(msg);
        console.error('[otto] closed:', evt.code, evt.reason);
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
    console.log('[otto] Gemini Live ready — voice:', VOICE);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', attach)
    : attach();

})();
