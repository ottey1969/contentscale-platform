'use strict';
// Pre-Write: the question to ask the AI systems (owner 2026-11-11). Not the bare keyword but the best real customer
// question for it: Google's own questions for the market (People also ask, related searches), AI ideas only when Google has
// none. The same helper as the free Growth check and Tracker Growth (src/growth-customer-questions.cjs). The keyword stays
// the research subject; the question is what the owner pastes into Google, ChatGPT, Perplexity, Claude and Copilot.
const { discoverCustomerQuestions } = require('./growth-customer-questions.cjs');
const { validLanguage } = require('./growth-search-locale.cjs');

const DAY = 86400000;

function readMarket(regionRaw, languageRaw) {
  const code = (String(regionRaw || '').match(/^\s*([a-z]{2})\b/i) || [])[1];
  const gl = code ? (code.toLowerCase() === 'gb' ? 'uk' : code.toLowerCase()) : 'us';
  const hl = validLanguage(languageRaw) || 'en';
  return { gl, hl };
}

function registerPrewriteCustomerQuestion(app, pool, { discover = discoverCustomerQuestions, model, now = () => Date.now(), perHour = 40 } = {}) {
  const cache = new Map(), used = new Map();
  app.get('/api/tracker-client/:token/prewrite-customer-question', async (req, res) => {
    try {
      const cr = await pool.query('SELECT id FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status != $2)', [req.params.token, 'deleted']);
      if (!cr.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
      const keyword = String(req.query.keyword || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
      if (!keyword) return res.status(400).json({ success: false, error: 'Enter the keyword first.' });
      const { gl, hl } = readMarket(req.query.region, req.query.language);
      const key = gl + '|' + hl + '|' + keyword.toLowerCase(), hit = cache.get(key);
      if (hit && now() - hit.at < DAY) return res.set('Cache-Control', 'no-store').json({ success: true, cached: true, ...hit.value });
      // A fresh lookup costs one Google search (and one AI call when Google has nothing): bounded per tracker per hour.
      const bucket = (used.get(cr.rows[0].id) || []).filter(t => now() - t < 3600000);
      if (bucket.length >= perHour) return res.status(429).json({ success: false, error: 'Too many lookups this hour; the keyword is used for now.' });
      bucket.push(now()); used.set(cr.rows[0].id, bucket);
      const out = await discover({ keyword, gl, hl, model: model !== undefined ? model : require('./growth-task-meaning.cjs').geminiModel() });
      // Questions of people who want to do the job (salary, course, how to become) are never offered as the customer question.
      const questions = (out.questions || []).filter(q => q.priority !== 'NOT_A_CUSTOMER_QUESTION').slice(0, 8).map(q => ({ text: q.text, label: q.label || null, source: q.source || null }));
      const best = questions.find(q => q.text === out.best_question) || null;
      const value = { keyword, market: { gl, hl }, best_question: best ? best.text : null, best_label: best ? best.label : null, questions,
        selection_source: out.selection_source || 'NONE', google_status: (out.google && out.google.status) || null, ai_status: (out.ai && out.ai.status) || null, ai_error: (out.ai && out.ai.error) || null };
      // Only a found question is kept for a day: an empty or failed lookup is tried again next time (owner 2026-11-12).
      if (value.best_question) cache.set(key, { at: now(), value }); if (cache.size > 2000) cache.delete(cache.keys().next().value);
      res.set('Cache-Control', 'no-store').json({ success: true, ...value });
    } catch (e) { console.warn('[prewrite-customer-question]', String(e && (e.code || e.message)).slice(0, 80)); res.status(503).json({ success: false, error: 'Questions unavailable; the keyword is used.' }); }
  });
}

module.exports = { registerPrewriteCustomerQuestion, readMarket };
