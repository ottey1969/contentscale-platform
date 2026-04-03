// ContentScale — Otto AI — Gemini Live (real WebSocket, real voice)
// Audio in → Gemini Live → Audio out — no browser TTS

(function() {
  'use strict';

  var _ws        = null;
  var _active    = false;
  var _audioCtx  = null;
  var _stream    = null;
  var _processor = null;
  var _audioQueue = [];
  var _playing   = false;

  function setStatus(msg) {
    var el = document.getElementById('gl-status');
    if (el) el.textContent = msg;
  }

  function addTranscript(who, msg) {
    var el = document.getElementById('gl-transcript');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML += '<div style="color:' + (who === 'model' ? '#4ade80' : '#f9fafb') + ';margin-bottom:5px;"><strong>' + (who === 'model' ? 'Otto:' : 'You:') + '</strong> ' + msg + '</div>';
    el.scrollTop = el.scrollHeight;
  }

  function setBtnActive(on) {
    var btn = document.getElementById('gl-call-btn');
    var r1  = document.getElementById('gl-ring1');
    if (!btn) return;
    if (on) {
      btn.style.background = 'linear-gradient(135deg,#dc2626,#f87171)';
      btn.style.boxShadow  = '0 0 0 8px rgba(239,68,68,.2),0 0 32px rgba(239,68,68,.4)';
      if (r1) r1.style.animation = 'rp 1.2s ease-in-out infinite';
    } else {
      btn.style.background = 'linear-gradient(135deg,#166534,#4ade80)';
      btn.style.boxShadow  = '0 0 0 8px rgba(74,222,128,.15),0 0 32px rgba(74,222,128,.3)';
      if (r1) r1.style.animation = '';
    }
  }

  // ── Play audio chunk from Gemini (base64 PCM16 → WebAudio) ──
  async function playAudioChunk(b64data) {
    if (!_audioCtx) _audioCtx = new AudioContext({ sampleRate: 24000 });
    try {
      var raw = atob(b64data);
      var buf = new ArrayBuffer(raw.length);
      var view = new Uint8Array(buf);
      for (var i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

      // PCM16 → Float32
      var pcm = new Int16Array(buf);
      var float = new Float32Array(pcm.length);
      for (var j = 0; j < pcm.length; j++) float[j] = pcm[j] / 32768;

      var audioBuf = _audioCtx.createBuffer(1, float.length, 24000);
      audioBuf.copyToChannel(float, 0);

      var source = _audioCtx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(_audioCtx.destination);
      source.start();
    } catch(e) { console.warn('[otto] audio play error:', e); }
  }

  // ── Stop everything ───────────────────────────────────────
  function stopSession() {
    _active = false;
    if (_processor) { try{_processor.disconnect();}catch(e){} _processor = null; }
    if (_stream)    { _stream.getTracks().forEach(function(t){t.stop();}); _stream = null; }
    if (_audioCtx)  { try{_audioCtx.close();}catch(e){} _audioCtx = null; }
    if (_ws && (_ws.readyState < 2)) { try{_ws.close();}catch(e){} }
    _ws = null;
    _audioQueue = [];
    setBtnActive(false);
    setStatus('Click to start a live conversation');
  }

  // ── Start mic input ───────────────────────────────────────
  async function startMic() {
    _stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    var micCtx  = new AudioContext({ sampleRate: 16000 });
    var source  = micCtx.createMediaStreamSource(_stream);
    _processor  = micCtx.createScriptProcessor(2048, 1, 1);

    _processor.onaudioprocess = function(e) {
      if (!_ws || _ws.readyState !== 1) return;
      var input = e.inputBuffer.getChannelData(0);
      var pcm16 = new Int16Array(input.length);
      for (var i = 0; i < input.length; i++) {
        var s = Math.max(-1, Math.min(1, input[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      var b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm16.buffer)));
      _ws.send(JSON.stringify({
        realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: b64 }] }
      }));
    };

    source.connect(_processor);
    _processor.connect(micCtx.destination);
    setStatus('Listening — speak now');
  }

  // ── Connect to server WebSocket proxy ─────────────────────
  async function startSession() {
    if (_active) { stopSession(); return; }

    setStatus('Checking server...');

    // Verify API key + live model access
    try {
      var sr = await fetch('https://app.contentscale.site/api/gemini-live-status');
      var sd = await sr.json();
      if (!sd.keyWorks) {
        setStatus('Error: ' + (sd.error || 'API key issue'));
        return;
      }
      if (!sd.hasLiveAccess) {
        setStatus('Gemini Live not available on this key — see hint below');
        addTranscript('model', 'Note: ' + (sd.hint || 'Live API access needed. Visit aistudio.google.com and enable Gemini Live for your key.'));
        return;
      }
    } catch(e) {
      setStatus('Cannot reach server');
      return;
    }

    _active = true;
    setBtnActive(true);
    setStatus('Connecting...');

    _ws = new WebSocket('wss://app.contentscale.site/api/gemini-live-ws');

    _ws.onopen = function() {
      setStatus('Connected — sending setup...');
      _ws.send(JSON.stringify({
        setup: {
          model: 'models/gemini-2.0-flash-live-001',
          generationConfig: {
            responseModalities: ['AUDIO', 'TEXT'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Puck' }
              }
            }
          },
          systemInstruction: {
            parts: [{ text: 'You are Otto, ContentScale AI assistant. Help with GRAAF Framework, SEO content scoring, and B2B lead generation. Be concise and friendly. Always say you are an AI.' }]
          }
        }
      }));
    };

    _ws.onmessage = function(evt) {
      try {
        var msg = typeof evt.data === 'string' ? JSON.parse(evt.data) : null;
        if (!msg) return;

        // Server proxy ready signal
        if (msg.type === 'server_ready') { setStatus('Initialising...'); return; }

        // Error from server
        if (msg.error) {
          setStatus('Error: ' + (msg.hint || msg.msg || msg.error));
          console.error('[otto] server error:', msg);
          stopSession();
          return;
        }

        // Setup complete → start mic
        if (msg.setupComplete) {
          setStatus('Ready — speak now');
          startMic().catch(function(e){
            setStatus('Mic error: ' + e.message);
            stopSession();
          });
          return;
        }

        // Audio response from Gemini
        if (msg.serverContent) {
          var turn = msg.serverContent.modelTurn;
          if (turn && turn.parts) {
            turn.parts.forEach(function(p) {
              if (p.inlineData && p.inlineData.data) {
                playAudioChunk(p.inlineData.data);
              }
              if (p.text) {
                addTranscript('model', p.text);
              }
            });
          }
          if (msg.serverContent.turnComplete) {
            setStatus('Listening...');
          }
        }

      } catch(e) { console.warn('[otto] parse error:', e); }
    };

    _ws.onerror = function(e) {
      console.error('[otto] ws error', e);
      setStatus('Connection error — check Railway logs');
      stopSession();
    };

    _ws.onclose = function(evt) {
      console.log('[otto] ws closed code=' + evt.code + ' reason=' + evt.reason);
      var reasons = {
        1008: 'API key rejected by Google. Visit aistudio.google.com to enable Gemini Live.',
        1011: 'Server error — check Railway logs',
        1006: 'Connection dropped unexpectedly'
      };
      if (_active) {
        setStatus(reasons[evt.code] || 'Disconnected (code ' + evt.code + ')');
        if (reasons[evt.code]) addTranscript('model', reasons[evt.code]);
        stopSession();
      }
    };
  }

  // Tawk safety shim
  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_API.triggerEvent = window.Tawk_API.triggerEvent || function(){};

  // Attach button
  function attach() {
    var btn = document.getElementById('gl-call-btn');
    if (!btn) { setTimeout(attach, 150); return; }
    btn.addEventListener('click', startSession);
    console.log('[otto] Gemini Live button ready');
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', attach)
    : attach();

})();
