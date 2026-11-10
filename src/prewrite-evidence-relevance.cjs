'use strict';
// Pre-Write evidence must be about the search query, not only exist on a page (owner 2026-11-10:
// a brief for "AI-content en Google" approved statistics about job interviews and an AI survey; a
// brief for "optimizacion de contenido seo" approved voice-search figures). A verified excerpt is
// approved for writing only when its source title plus the text around the excerpt names the topic.
const STOP = new Set(('the and for with from that this into than have has are was were but not your our its how what why who when which '
  + 'een het van voor met door bij naar wat hoe waarom wie wanneer welke zijn wordt worden jouw uw ook '
  + 'los las del para con por una uno que como cual cuando donde sus tus mas '
  + 'der die das und mit fur von wie les des une pour avec dans sur est guide gids guia beste best top complete').split(/\s+/));
const AI = new Set(['ai', 'ia', 'ki']);
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = v => norm(v).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);

// Topic terms of a search query: AI as one cross-language term, other words as a 5-letter stem so
// "content"/"contenido", "optimization"/"optimizacion" and plurals match each other.
function topicTerms(keyword) {
  const out = [];
  for (const w of words(keyword)) {
    if (/^\d+$/.test(w) || STOP.has(w)) continue;
    const t = AI.has(w) ? 'ai' : (w.length < 3 ? '' : w.length > 5 ? w.slice(0, 5) : w);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function topicRelevance({ keyword, title = '', text = '', excerpt = '', radius = 700 } = {}) {
  const terms = topicTerms(keyword);
  if (!terms.length) return { relevant: true, matched: [], missing: [], required: 0 };
  const body = norm(text), ex = norm(excerpt).replace(/\s+/g, ' ').trim();
  const flat = body.replace(/\s+/g, ' ');
  const at = ex ? flat.indexOf(ex) : -1;
  const near = at >= 0 ? flat.slice(Math.max(0, at - radius), at + ex.length + radius) : ex;
  const ws = new Set(words(title + ' ' + near));
  const hit = t => t === 'ai' ? [...AI].some(a => ws.has(a)) : [...ws].some(w => w.startsWith(t));
  const matched = terms.filter(hit), missing = terms.filter(t => !hit(t));
  const required = terms.length <= 3 ? terms.length : terms.length - 1;
  return { relevant: matched.length >= required, matched, missing, required };
}

module.exports = { topicTerms, topicRelevance };
