// ContentScale — Otto AI — Gemini Live
// Correct implementation based on official Google documentation
// https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket

(function() {
  'use strict';

  var _ws        = null;
  var _active    = false;
  var _micCtx    = null;
  var _stream    = null;
  var _processor = null;
  var _playCtx   = null;
  var _nextStart = 0;

  // v1beta direct API key endpoint (no ephemeral token needed)
  var WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
  var MODEL   = 'gemini-3.1-flash-live-preview';

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
    } catch(e) { console.warn('[otto] audio chunk error:', e.message); }
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
  // Correct audio format per docs: realtimeInput.audio.data + mimeType
  async function startMic() {
    _stream    = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 }, video: false });
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

      // ✅ CORRECT format per official docs
      _ws.send(JSON.stringify({
        realtimeInput: {
          audio: {
            data: b64,
            mimeType: 'audio/pcm;rate=16000'
          }
        }
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

    // Get ephemeral token from our server
    var tokenData;
    try {
      var r = await fetch('https://app.contentscale.site/api/gemini-live-token');
      tokenData = await r.json();
      if (!r.ok || !tokenData.token) {
        setStatus('Token error: ' + (tokenData.error || 'unknown'));
        console.error('[otto] token error:', tokenData);
        stopSession();
        return;
      }
    } catch(e) {
      setStatus('Server error: ' + e.message);
      stopSession();
      return;
    }

    // ✅ CORRECT ephemeral token endpoint:
    // v1alpha + BidiGenerateContentConstrained + access_token param
    var wsUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained'
      + '?access_token=' + encodeURIComponent(tokenData.token);

    console.log('[otto] connecting with ephemeral token...');
    setStatus('Connecting...');

    try {
      _ws = new WebSocket(wsUrl);
    } catch(e) {
      setStatus('WebSocket error: ' + e.message);
      stopSession();
      return;
    }

    _ws.onopen = function() {
      setStatus('Connected — sending config...');

      // ✅ CORRECT first message format per official docs: "config" not "setup"
      _ws.send(JSON.stringify({
        config: {
          model: 'models/' + MODEL,
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Fenrir' }
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
        var msg = JSON.parse(evt.data);

        // Setup complete → start mic
        if (msg.setupComplete) {
          setStatus('Ready — speak now');
          startMic().catch(function(e) {
            setStatus('Mic: ' + e.message);
            stopSession();
          });
          return;
        }

        // Server content: audio + transcript
        if (msg.serverContent) {
          var sc = msg.serverContent;

          // Audio response
          if (sc.modelTurn && sc.modelTurn.parts) {
            sc.modelTurn.parts.forEach(function(p) {
              if (p.inlineData && p.inlineData.data) {
                scheduleAudioChunk(p.inlineData.data);
              }
            });
          }

          // Text transcriptions
          if (sc.inputTranscription)  addTranscript('you',   sc.inputTranscription.text);
          if (sc.outputTranscription) addTranscript('model', sc.outputTranscription.text);

          if (sc.turnComplete) setStatus('Listening...');
        }

      } catch(e) { console.warn('[otto] parse error:', e.message); }
    };

    _ws.onerror = function(e) {
      console.error('[otto] ws error', e);
      setStatus('Connection error');
      stopSession();
    };

    _ws.onclose = function(evt) {
      console.log('[otto] closed code=' + evt.code + ' reason=' + evt.reason);
      var msgs = {
        1008: 'Rejected — key needs Gemini Live access at aistudio.google.com',
        1006: 'Dropped unexpectedly'
      };
      if (_active) {
        setStatus(msgs[evt.code] || 'Disconnected (code ' + evt.code + ')');
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
    console.log('[otto] Gemini Live ready — model:', MODEL, '| voice: Fenrir');
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', attach)
    : attach();

})();
