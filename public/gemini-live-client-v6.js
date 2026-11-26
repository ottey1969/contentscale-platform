// ContentScale — Otto AI — Gemini Live v6 (FIXED)
// ✅ v1alpha endpoint (fixes 1007 error)
// ✅ Fenrir male voice
// ✅ Auto-hangup 2s after goodbye detected
// ✅ Uses wsUrl from server token (never falls back to v1beta)

(function () {
  'use strict';

  var _ws             = null;
  var _active         = false;
  var _micCtx         = null;
  var _stream         = null;
  var _processor      = null;
  var _playCtx        = null;
  var _nextStart      = 0;
  var _killTimer      = null;
  var _audioChunks    = [];
  var _hangupScheduled = false;
  var _sessionId      = null;
  var _sessionStart   = null;
  var _sessionModel   = null;
  var _transcript     = [];
  var _turnCount      = 0;

  // ✅ v1alpha — v1beta causes 1007 errors
  var V1ALPHA_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

  var OTTO_SCRIPT = "You are Otto, a male AI voice assistant of ContentScale. You are NOT a salesperson — you are helpful and honest. Follow this exact script step by step: 1. Say: Hey! I am Otto, an AI assistant of ContentScale. I have about 1 minute for you — is that okay or would you rather I hang up? 2a. If no: say No problem, have a great day! Goodbye! Then STOP. 2b. If yes: say Great! And great timing — this month you can win 250 euros in free SEO services just by sharing this conversation. But first, may I have your name? Wait for answer. 3. Say: Hey [name]! We help businesses recover lost Google traffic with a free GRAAF Framework scan and PULSE+NEXUS SEO audit. We also do outbound calls and lead generation so you never miss a client again. 4. Ask: Would that be interesting for you? Wait for answer. 5a. If not interested: say No worries, maybe another time. Have a great day! Goodbye! Then STOP. 5b. If interested: say Wonderful! Ottmar, our founder, will personally call you back. And to be eligible for our 250 euro prize this month, I just need your mobile number with country code. What is it? Wait for answer. Repeat the number back digit by digit to confirm. Then say: Perfect! Ottmar will be in touch soon. Have a great day! Goodbye! Then STOP. Always say goodbye before stopping. Never add extra information. Never continue after goodbye.";

  var GOODBYE_RE = /\b(goodbye|have a great day|speak to you soon|talk soon|take care|cheers|bye)\b/i;

  // ── UI helpers ─────────────────────────────────────────────────────────────

  function setStatus(msg) {
    if (window._ottoStatusOverride) { window._ottoStatusOverride(msg); return; }
    var el = document.getElementById('gl-status');
    if (!el) return;
    el.textContent = msg;
    el.className = '';
    if (/speaking|saying/i.test(msg))                                    el.className = 'speaking';
    else if (/listen|speak now|your turn|ready|connecting/i.test(msg))   el.className = 'listening';
    else if (/error|denied|limit|disconnect|failed|timeout/i.test(msg))  el.className = 'error';
  }

  function addTranscript(who, msg) {
    if (window._ottoTranscriptOverride) { window._ottoTranscriptOverride(who, msg); return; }
    var el = document.getElementById('gl-transcript');
    if (!el) return;
    el.style.display = 'block';
    var label = who === 'model' ? 'Otto' : 'You';
    var cls   = who === 'model' ? 't-otto' : 't-you';
    el.innerHTML += '<div class="' + cls + '"><span class="t-label">' + label + '&nbsp;</span><span class="t-text">' + msg + '</span></div>';
    el.scrollTop = el.scrollHeight;
  }

  function setBtnActive(on) {
    if (window._ottoActiveOverride) window._ottoActiveOverride(on);
    var btn  = document.getElementById('gl-call-btn');
    var wrap = document.getElementById('avatarWrap');
    if (btn)  btn.classList.toggle('active', on);
    if (wrap) wrap.classList.toggle('active', on);
  }

  // ── Session teardown ───────────────────────────────────────────────────────

  function forceCleanup() {
    _active = false;
    clearTimeout(_killTimer);
    _killTimer = null;
    if (_ws && _ws.readyState < 2) { try { _ws.close(); } catch(e) {} }
    _ws = null;
    setBtnActive(false);
    setStatus('Click to start a live conversation');
  }

  function saveSession() {
    if (!_sessionId || !_transcript.length) return;
    var duration = Math.round((Date.now() - (_sessionStart || Date.now())) / 1000);
    fetch('https://app.contentscale.site/api/otto/save-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: _sessionId,
        transcript: _transcript,
        durationSeconds: duration,
        model: _sessionModel
      })
    }).catch(function(e) { console.warn('[otto] save error:', e.message); });
  }

  function hangup(reason) {
    if (!_active) return;
    console.log('[otto] hangup:', reason);
    if (window._ottoOnSessionEnd) window._ottoOnSessionEnd();
    saveSession();
    stopAudio();
    stopMic();
    forceCleanup();
  }

  function stopMic() {
    if (_processor) { try { _processor.disconnect(); } catch(e) {} _processor = null; }
    if (_stream)    { _stream.getTracks().forEach(function(t) { t.stop(); }); _stream = null; }
    if (_micCtx)    { try { _micCtx.close(); } catch(e) {} _micCtx = null; }
  }

  function stopAudio() {
    if (_playCtx) { try { _playCtx.close(); } catch(e) {} _playCtx = null; }
    _nextStart = 0;
  }

  function stopSession() {
    saveSession();
    stopMic();
    stopAudio();
    forceCleanup();
  }

  // ── Audio playback ─────────────────────────────────────────────────────────

  function ensurePlayCtx() {
    if (!_playCtx || _playCtx.state === 'closed') {
      _playCtx   = new AudioContext({ sampleRate: 24000 });
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
      var src  = _playCtx.createBufferSource();
      src.buffer = buf;
      src.connect(_playCtx.destination);
      var now  = _playCtx.currentTime;
      var when = Math.max(now, _nextStart);
      src.start(when);
      _nextStart = when + buf.duration;
    } catch(e) { console.warn('[otto] audio chunk error:', e.message); }
  }

  // ── Mic capture ────────────────────────────────────────────────────────────

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
      _ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } } }));
    };

    src.connect(_processor);
    _processor.connect(_micCtx.destination);
    setStatus('Your turn — speak now...');

    // Hard kill after 2 minutes
    _killTimer = setTimeout(function() { hangup('2-min limit'); }, 120000);
  }

  // ── Main session ───────────────────────────────────────────────────────────

  async function startSession() {
    if (_active) { stopSession(); return; }

    _active          = true;
    _hangupScheduled = false;
    _turnCount       = 0;
    _sessionId       = 'otto-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    _sessionStart    = Date.now();
    _transcript      = [];
    setBtnActive(true);
    setStatus('Getting key...');

    // ── Fetch token from server ──────────────────────────────────────────────
    var keyData;
    try {
      var params   = new URLSearchParams();
      var adminKey = new URLSearchParams(location.search).get('admin');
      if (adminKey) params.set('admin', adminKey);
      if (window._ottoRefCode) params.set('ref', window._ottoRefCode);
      var qs = params.toString() ? '?' + params.toString() : '';

      var r = await fetch('https://app.contentscale.site/api/gemini-live-token' + qs);
      keyData = await r.json();

      if (r.status === 429) {
        setStatus('Daily limit reached — come back tomorrow!');
        if (window._ottoLimitOverride) window._ottoLimitOverride();
        _active = false; setBtnActive(false); return;
      }
      if (!r.ok || (!keyData.wsUrl && !keyData.key)) {
        setStatus('Error: ' + (keyData.error || 'No connection details'));
        stopSession(); return;
      }
    } catch(e) {
      setStatus('Server error: ' + e.message);
      _active = false; setBtnActive(false); return;
    }

    var model     = keyData.model || 'gemini-2.0-flash-exp';
    _sessionModel = model;
    console.log('[otto] model:', model);

    // ✅ Always use v1alpha wsUrl from server — never fall back to v1beta
    var wsUrl = keyData.wsUrl
      ? keyData.wsUrl
      : (V1ALPHA_WS + '?key=' + encodeURIComponent(keyData.key));

    console.log('[otto] connecting via:', wsUrl.split('?')[0]); // log path only, not key
    setStatus('Connecting...');

    // ── Open WebSocket ───────────────────────────────────────────────────────
    try { _ws = new WebSocket(wsUrl); _ws.binaryType = 'arraybuffer'; }
    catch(e) { setStatus('WS error: ' + e.message); stopSession(); return; }

    _ws.onopen = function() {
      setStatus('Connected...');
      var setup = {
        setup: {
          model: 'models/' + model,
          generation_config: {
            response_modalities: ['AUDIO'],
            output_audio_transcription: {},
            speech_config: {
              voice_config: {
                prebuilt_voice_config: { voice_name: 'Fenrir' }
              }
            }
          },
          input_audio_transcription: {},
          system_instruction: { parts: [{ text: OTTO_SCRIPT }] }
        }
      };
      console.log('[otto] sending setup — model:', model, '| voice: Fenrir');
      _ws.send(JSON.stringify(setup));
    };

    _ws.onmessage = function(evt) {
      try {
        var raw = evt.data instanceof ArrayBuffer
          ? new TextDecoder().decode(new Uint8Array(evt.data))
          : evt.data;
        var msg = JSON.parse(raw);

        // ── Setup complete → start mic ─────────────────────────────────────
        if (msg.setupComplete) {
          setStatus('Otto is speaking...');
          startMic().catch(function(e) { setStatus('Mic: ' + e.message); stopSession(); });
          return;
        }

        if (msg.serverContent) {
          var sc = msg.serverContent;

          // ── Play audio ───────────────────────────────────────────────────
          if (sc.modelTurn && sc.modelTurn.parts) {
            sc.modelTurn.parts.forEach(function(p) {
              if (p.inlineData && p.inlineData.data) {
                scheduleAudioChunk(p.inlineData.data);
                _audioChunks.push(p.inlineData.data);
              }
              // Text part goodbye detection
              if (p.text && !_hangupScheduled && GOODBYE_RE.test(p.text)) {
                _hangupScheduled = true;
                console.log('[otto] goodbye in text — hanging up in 2s');
                setTimeout(function() { hangup('goodbye (text)'); }, 2000);
              }
            });
          }

          // ── User transcript ──────────────────────────────────────────────
          if (sc.inputTranscription && sc.inputTranscription.text) {
            addTranscript('you', sc.inputTranscription.text);
            _transcript.push({ role: 'user', text: sc.inputTranscription.text, t: Date.now() });
          }

          // ── Otto transcript + goodbye detection ──────────────────────────
          if (sc.outputTranscription && sc.outputTranscription.text) {
            var txt = sc.outputTranscription.text;
            addTranscript('model', txt);
            _transcript.push({ role: 'otto', text: txt, t: Date.now() });
            if (!_hangupScheduled && GOODBYE_RE.test(txt)) {
              _hangupScheduled = true;
              console.log('[otto] goodbye in transcript — hanging up in 2s');
              setTimeout(function() { hangup('goodbye (transcript)'); }, 2000);
            }
          }

          // ── Turn complete ────────────────────────────────────────────────
          if (sc.turnComplete) {
            _turnCount++;
            setStatus('Your turn — speak now...');
            // Hard cutoff after 10 turns if goodbye wasn't said
            if (_turnCount >= 10 && !_hangupScheduled) {
              _hangupScheduled = true;
              setTimeout(function() { hangup('max turns reached'); }, 5000);
            }
          }
        }
      } catch(e) { console.warn('[otto] parse error:', e.message); }
    };

    _ws.onerror = function() {
      setStatus('Connection error');
      stopSession();
    };

    _ws.onclose = function(evt) {
      console.log('[otto] closed code=' + evt.code);
      if (_active) {
        if (evt.code === 1007) setStatus('Model unavailable — contact support');
        else if (evt.code === 1008) setStatus('API key needs Gemini Live access');
        else setStatus('Disconnected');
        stopSession();
      }
    };
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_API.triggerEvent    = window.Tawk_API.triggerEvent    || function() {};
  window.Tawk_API.addQuickReplies = window.Tawk_API.addQuickReplies || function() {};

  function attach() {
    var btn = document.getElementById('gl-call-btn');
    if (!btn) { setTimeout(attach, 150); return; }
    btn.addEventListener('click', startSession);
    console.log('[otto] v6 READY — v1alpha | Fenrir | goodbye 2s hangup');
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', attach)
    : attach();

})();
