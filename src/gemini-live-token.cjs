'use strict';

const TOKEN_ENDPOINT = 'https://generativelanguage.googleapis.com/v1alpha/auth_tokens';
const LIVE_ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

function createLiveTokenHandler({ env = process.env, fetchToken = global.fetch } = {}) {
  const attempts = new Map();
  let currentDay;
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const apiKey = env.GEMINI_KEY_LIVE;
    if (!apiKey) return res.status(503).json({ error: 'Live conversations are unavailable' });

    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    if (currentDay !== day) {
      attempts.clear();
      currentDay = day;
    }
    const ip = req.ip || req.socket.remoteAddress;
    const count = attempts.get(ip) || 0;
    if (count >= 2) return res.status(429).json({ error: 'Daily limit reached' });
    attempts.set(ip, count + 1);

    const expires = now + 3 * 60_000;
    try {
      const result = await fetchToken(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          uses: 1,
          newSessionExpireTime: new Date(now + 60_000).toISOString(),
          expireTime: new Date(expires).toISOString()
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(5000)
      });
      if (result.status === 429) return res.status(429).json({ error: 'Live conversations are temporarily limited' });
      if (!result.ok) throw Error('Provider refused token issuance');
      const token = (await result.json())?.name;
      if (typeof token !== 'string' || !/^auth_tokens\/[^/\s]+$/.test(token)) throw Error('Invalid session token');
      const ws = new URL(LIVE_ENDPOINT);
      ws.searchParams.set('access_token', token);
      const model = env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-live-001';
      return res.json({ wsUrl: ws.href, model, expires });
    } catch {
      return res.status(502).json({ error: 'Unable to start a live conversation' });
    }
  };
}

module.exports = { createLiveTokenHandler };
