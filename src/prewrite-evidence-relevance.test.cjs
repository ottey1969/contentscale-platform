'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { topicTerms, topicRelevance } = require('./prewrite-evidence-relevance.cjs');
test('topic terms are cross-language stems', () => {
  assert.deepEqual(topicTerms('AI-content en Google'), ['ai', 'conte', 'googl']);
  assert.deepEqual(topicTerms('optimizacion de contenido seo'), ['optim', 'conte', 'seo']);
});
test('off-topic statistics from the AI-content brief are rejected', () => {
  const kw = 'AI-content en Google';
  assert.equal(topicRelevance({ keyword: kw, title: 'What 81,000 people want from AI \\ Anthropic', text: 'We interviewed people. 80,508 people, across 159 countries and 70 languages, took the interview. They told us about work and family.', excerpt: '80,508 people, across 159 countries and 70 languages, took the interview.' }).relevant, false);
  assert.equal(topicRelevance({ keyword: kw, title: 'Study finds AI matches humans in conducting job interviews | Erasmus University Rotterdam', text: 'Applicants interviewed by the AI are 12% more likely to receive a job offer.', excerpt: 'Applicants interviewed by the AI are 12% more likely to receive a job offer' }).relevant, false);
  assert.equal(topicRelevance({ keyword: kw, title: 'expert reaction to Geoffrey Hinton quits google over risks posed by AI', text: 'The risks from the current generative AI technologies largely relate to their ability to generate convincing text and images.', excerpt: 'The risks from the current generative AI technologies largely relate to their ability to generate convincing text and images.' }).relevant, false);
});
test('on-topic evidence is kept, also across languages and plurals', () => {
  assert.equal(topicRelevance({ keyword: 'AI-content en Google', title: 'Google Search and AI-generated content', text: 'Appropriate use of AI or automation is not against our guidelines. 40% of pages reviewed used generated content.', excerpt: '40% of pages reviewed used generated content.' }).relevant, true);
  assert.equal(topicRelevance({ keyword: 'optimizacion de contenido seo', title: 'Guía de optimización de contenidos SEO', text: 'El 60 % de las páginas mejoró tras revisar el contenido.', excerpt: 'El 60 % de las páginas mejoró' }).relevant, true);
});
test('a longer query allows one missing term; an empty query blocks nothing', () => {
  assert.equal(topicRelevance({ keyword: 'lokale seo voor tandartsen amsterdam', title: 'Lokale SEO voor tandartsen', text: 'x 30% y', excerpt: '30%' }).relevant, true);
  assert.equal(topicRelevance({ keyword: '', title: 'x', text: 'y', excerpt: 'y' }).relevant, true);
});
