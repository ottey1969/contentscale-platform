// ContentScale — Gemini Live Client
// Served from app.contentscale.site/gemini-live-client.js
// Loaded by homepage via <script src="..."> — WordPress cannot corrupt this

(function() {
  'use strict';

  var _glWs      = null;
  var _glActive  = false;
  var _glAudioCtx = null;
  var _glStream  = null;
  var _glProcessor = null;

  function glSetStatus(msg) {
    var el = document.getElementById('gl-status');
    if (el) el.textContent = msg;
  }

  function glAddTranscript(who, msg) {
    var el = document.getElementById('gl-transcript');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML += '<div style="color:' + (who === 'model' ? '#4ade80' : '#f9fafb') + ';margin-bottom:4px;"><strong>' + (who === 'model' ? 'Otto' : 'You') + ':</strong> ' + msg + '</div>';
    el.scrollTop = el.scrollHeight;
  }

  function glStop() {
    _glActive = false;
    if (_glProcessor) { try { _glProcessor.disconnect(); } catch(e){} _glProcessor = null; }
    if (_glStream)    { _glStream.getTracks().forEach(function(t){ t.stop(); }); _glStream = null; }
    if (_glAudioCtx)  { try { _glAudioCtx.close(); } catch(e){} _glAudioCtx = null; }
    if (_glWs && (_glWs.readyState === 0 || _glWs.readyState === 1)) {
      try { _glWs.close(); } catch(e){}
    }
    _glWs = null;

    var btn = document.getElementById('gl-call-btn');
    if (btn) {
      btn.style.background   = 'linear-gradient(135deg,#166534,#4ade80)';
      btn.style.boxShadow    = '0 0 0 8px rgba(74,222,128,.15),0 0 32px rgba(74,222,128,.3)';
      btn.style.transform    = 'scale(1)';
    }
    var r1 = document.getElementById('gl-ring1');
    if (r1) r1.style.animation = '';
    glSetStatus('Click to start a live conversation');
  }

  async function glStart() {
    if (_glActive) { glStop(); return; }
    glSetStatus('Checking server...');

    // Step 1: verify API key is configured
    try {
      var sr = await fetch('https://app.contentscale.site/api/gemini-live-status');
      var sd = await sr.json();
      if (!sd.available || !sd.keyWorks) {
        glSetStatus('Server error: ' + (sd.error || 'API key not configured on server'));
        return;
      }
    } catch(e) {
      glSetStatus('Cannot reach server: ' + e.message);
      return;
    }

    // Step 2: open WebSocket proxy
    glSetStatus('Connecting...');
    var wsUrl = 'wss://app.contentscale.site/api/gemini-live-ws';
    console.log('[gemini-live] opening', wsUrl);

    try {
      _glWs = new WebSocket(wsUrl);
    } catch(e) {
      glSetStatus('WebSocket error: ' + e.message);
      return;
    }

    _glWs.onopen = function() {
      glSetStatus('Connected — sending setup...');
      _glWs.send(JSON.stringify({
        setup: {
          model: 'models/gemini-2.0-flash-exp',
          generation_config: { response_modalities: ['TEXT'] },
          system_instruction: {
            parts: [{ text: 'You are Otto, ContentScale AI assistant. Help visitors understand GRAAF Framework, ContentScore SEO audits and B2B lead generation. Be concise and friendly. Always disclose you are an AI.' }]
          }
        }
      }));
    };

    _glWs.onmessage = function(evt) {
      try {
        var msg = typeof evt.data === 'string' ? JSON.parse(evt.data) : null;
        if (!msg) return;
        if (msg.type === 'server_ready') { glSetStatus('Initialising...'); return; }
        if (msg.error) {
          glSetStatus('Error: ' + (msg.hint || msg.msg || msg.error));
          console.error('[gemini-live] server error:', msg);
          glStop();
          return;
        }
        if (msg.setupComplete) {
          glSetStatus('Ready — speak now');
          glActivateMic();
          return;
        }
        if (msg.serverContent) {
          var parts = msg.serverContent.modelTurn && msg.serverContent.modelTurn.parts;
          if (parts) {
            parts.forEach(function(p) { if (p.text) glAddTranscript('model', p.text); });
          }
          if (msg.serverContent.turnComplete) glSetStatus('Listening...');
        }
      } catch(e) { console.warn('[gemini-live] parse:', e); }
    };

    _glWs.onerror = function(e) {
      console.error('[gemini-live] ws error', e);
      glSetStatus('WebSocket failed — check Railway logs');
      glStop();
    };

    _glWs.onclose = function(evt) {
      console.log('[gemini-live] closed code=' + evt.code);
      if (_glActive) {
        glSetStatus('Disconnected (code ' + evt.code + ')');
        glStop();
      }
    };
  }

  async function glActivateMic() {
    try {
      _glStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _glAudioCtx = new AudioContext({ sampleRate: 16000 });
      var source = _glAudioCtx.createMediaStreamSource(_glStream);
      _glProcessor = _glAudioCtx.createScriptProcessor(4096, 1, 1);

      _glProcessor.onaudioprocess = function(e) {
        if (!_glWs || _glWs.readyState !== 1) return;
        var input = e.inputBuffer.getChannelData(0);
        var pcm = new Int16Array(input.length);
        for (var i = 0; i < input.length; i++) {
          var s = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        var b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm.buffer)));
        _glWs.send(JSON.stringify({
          realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: b64 }] }
        }));
      };

      source.connect(_glProcessor);
      _glProcessor.connect(_glAudioCtx.destination);

      _glActive = true;
      glSetStatus('Listening — speak now');

      var btn = document.getElementById('gl-call-btn');
      if (btn) {
        btn.style.background = 'linear-gradient(135deg,#dc2626,#f87171)';
        btn.style.boxShadow  = '0 0 0 8px rgba(239,68,68,.2),0 0 32px rgba(239,68,68,.4)';
      }
      var r1 = document.getElementById('gl-ring1');
      if (r1) r1.style.animation = 'rp 1.2s ease-in-out infinite';

    } catch(e) {
      glSetStatus('Mic error: ' + e.message);
      glStop();
    }
  }

  // Attach button — retry until DOM has it
  function attachBtn() {
    var btn = document.getElementById('gl-call-btn');
    if (btn) {
      btn.addEventListener('click', function() {
        if (_glActive) { glStop(); } else { glStart(); }
      });
      console.log('[gemini-live] button ready');
    } else {
      setTimeout(attachBtn, 150);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachBtn);
  } else {
    attachBtn();
  }

})();
