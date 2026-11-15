'use strict';
// Owner 2026-11-15: the cookie banner on nl.contentscale.site and es.contentscale.site showed English text
// ("We respect your privacy"). Dutch and Spanish pages must not mix languages: the widget follows the page language.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'consent-widget.js'), 'utf8');

function render({ lang = '', host = 'contentscale.site' } = {}) {
  const appended = [];
  const el = () => ({ style: {}, setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, innerHTML: '' });
  const document = {
    readyState: 'complete', documentElement: { lang }, body: { appendChild: n => appended.push(n) },
    createElement: el, getElementById: () => null, addEventListener() {}, dispatchEvent() {},
  };
  const window = { location: { hostname: host } };
  const ctx = { window, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, CustomEvent: function () {}, setTimeout };
  vm.runInNewContext(SRC, ctx);
  assert.equal(appended.length, 1, 'banner is shown once');
  return appended[0].innerHTML + ' ' + JSON.stringify(appended[0]);
}

test('English pages keep the English banner', () => {
  const h = render({ lang: 'en-US', host: 'contentscale.site' });
  assert.match(h, /We respect your privacy/);
  assert.match(h, /ACCEPT ALL/);
});

test('Dutch pages get a Dutch banner, no English text', () => {
  const h = render({ lang: 'nl-NL', host: 'nl.contentscale.site' });
  assert.match(h, /We respecteren je privacy/);
  assert.match(h, /ALLES ACCEPTEREN/);
  assert.doesNotMatch(h, /We respect your privacy|ACCEPT ALL|REJECT NON-ESSENTIAL|Necessary/);
});

test('Spanish pages get a Spanish banner, no English or Dutch text', () => {
  const h = render({ lang: 'es', host: 'es.contentscale.site' });
  assert.match(h, /Respetamos tu privacidad/);
  assert.match(h, /ACEPTAR TODO/);
  assert.doesNotMatch(h, /We respect your privacy|ACCEPT ALL|respecteren|ACCEPTEREN/);
});

test('the language also follows the subdomain when the page has no lang attribute', () => {
  assert.match(render({ lang: '', host: 'nl.contentscale.site' }), /We respecteren je privacy/);
  assert.match(render({ lang: '', host: 'es.contentscale.site' }), /Respetamos tu privacidad/);
});
