'use strict';
// Pre-Write expert research (owner 2026-11-13: "expert quotes can be researched"). Briefs kept saying "No verified
// expert quote" because the searches were the full customer question plus English words, e.g.
// '"hoe weet ik of chatgpt mijn bedrijf noemt" expert interview quote': nobody gives an interview with that sentence, so
// only agency blogs came back. Now: the topic (question words removed), in the language of the Brief, plus one search
// on official sources (Google Search Central, Google's blog, OpenAI), whose statements can be attributed and verified.
const STOP = {
  nl: 'hoe wat wie waar waarom welke welk wanneer weet weten ik je jij jouw mijn ons onze of de het een is zijn kan kun kunnen moet zorg dat er voor van in op met te om',
  es: 'cómo como qué que quién dónde por cuál cuáles cuándo saber sé si mi mis tu tus su el la los las un una es son puedo puede hacer para de del en con por',
  en: 'how what who where why which when to do does i you my your our if the a an is are can should check know get make for of in on with',
};
const WORDS = {
  nl: { expert: 'expert', interview: 'interview', says: 'zegt', researcher: 'onderzoeker', talk: 'podcast OR webinar' },
  es: { expert: 'experto', interview: 'entrevista', says: 'dice', researcher: 'investigador', talk: 'podcast OR webinar' },
  en: { expert: 'expert', interview: 'interview', says: 'says', researcher: 'researcher', talk: 'podcast OR conference talk' },
};
const OFFICIAL = 'site:developers.google.com OR site:blog.google OR site:openai.com';

function langOf(language) {
  const x = String(language || '').trim().toLowerCase();
  if (/^(nl|dutch|nederlands)/.test(x)) return 'nl';
  if (/^(es|spanish|español|espanol)/.test(x)) return 'es';
  return 'en';
}
function topicOf(keyword, lang) {
  const stop = new Set((STOP[lang] || STOP.en).split(/\s+/));
  const words = String(keyword || '').toLowerCase().replace(/[¿?¡!.,:;"“”]/g, ' ').split(/\s+/).filter(Boolean);
  const kept = words.filter(w => !stop.has(w));
  return (kept.length >= 2 ? kept : words).slice(0, 6).join(' ');
}
function expertQueries(keyword, language) {
  const lang = langOf(language), w = WORDS[lang], t = topicOf(keyword, lang);
  return [
    '"' + t + '" ' + w.expert + ' ' + w.interview,
    t + ' ' + w.expert + ' ' + w.says,
    t + ' ' + w.researcher + ' ' + w.interview,
    t + ' ' + w.talk,
    t + ' ' + OFFICIAL,
    keyword + ' ' + w.expert,
  ];
}
module.exports = { expertQueries, topicOf, langOf, OFFICIAL };
