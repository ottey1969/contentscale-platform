'use strict';
// Official documentation for the topic of a Pre-Write brief (owner 2026-11-28: a "seo checker gratis" brief found no
// official source because the research only searched for statistics and expert interviews). A few searches on the topic
// (question words removed, as for the expert searches), in the language of the brief:
// - SEO and search topics: Google Search Central (developers.google.com/search, support.google.com/webmasters);
// - AI search topics (ChatGPT, Gemini, Claude, Copilot, Perplexity, AI Overviews): the vendors' own documentation;
// - every topic: "official documentation" and the government sources of the market.
// The pages found are candidates only: the brief still uses a page only when its claim is on that page.
const { topicOf, langOf } = require('./prewrite-expert-queries.cjs');

const SEARCH = /\b(seo|serp|google|search console|posicionamiento|zoekmachine\w*|vindbaarheid|indexa\w*|rastreo|crawl\w*|ranking|rich results?|schema|sitemap|robots)\b/i;
const AI_SEARCH = /\b(chatgpt|openai|gemini|claude|anthropic|copilot|bing|perplexity|ai overviews?|ai-overzicht\w*|geo|llm\w*|ia|ai)\b/i;
const GOOGLE_DOCS = 'site:developers.google.com/search OR site:support.google.com/webmasters';
const AI_DOCS = 'site:help.openai.com OR site:platform.openai.com OR site:support.anthropic.com OR site:learn.microsoft.com OR site:blog.google';
const GENERAL = {
  en: 'official documentation OR site:.gov OR site:europa.eu',
  nl: 'officiële documentatie OR site:rijksoverheid.nl OR site:overheid.nl OR site:europa.eu',
  es: 'documentación oficial OR site:gob.es OR site:boe.es OR site:europa.eu',
};

function officialQueries(keyword, language) {
  const lang = langOf(language), topic = topicOf(keyword, lang), text = String(keyword || '');
  const out = [];
  if (SEARCH.test(text)) out.push(topic + ' ' + GOOGLE_DOCS);
  if (AI_SEARCH.test(text)) out.push(topic + ' ' + AI_DOCS);
  out.push(topic + ' ' + GENERAL[lang]);
  return out.slice(0, 3);
}

module.exports = { officialQueries, GOOGLE_DOCS, AI_DOCS, GENERAL };
