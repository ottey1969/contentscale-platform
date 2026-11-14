'use strict';
// Owner 2026-11-14: every new Pre-Write Brief tells the client that their website is being updated with it, in the Brief's
// language, at most once per keyword per 12 hours, never for a Network placement, and with no internal data in it.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
const a = SRC.indexOf('const _PWB_CLIENT_MAIL={'), b = SRC.indexOf('async function _pwbNotifyClientBriefCreated(');
const text = new Function(SRC.slice(a, b) + ';return _pwbClientMailText;')();

test('the message, per language', () => {
  assert.equal(text('en').p, 'We are working on your website with our Pre-Write Brief, Search Gap Intelligence and AI System Intelligence.');
  assert.match(text('Dutch').p, /^We zijn bezig met het bijwerken van je website met onze Pre-Write Brief, Search Gap Intelligence en AI System Intelligence\.$/);
  assert.match(text('es').s, /Estamos actualizando tu sitio web/);
  assert.equal(text('').s, 'We are updating your website', 'English when the language is unknown');
  for (const L of ['en', 'nl', 'es']) assert.doesNotMatch(JSON.stringify(text(L)), /token|gemini|score|blocker|competitor/i, 'no internal data');
});

test('sent after both save paths, once per keyword per 12 hours, never for a Network placement', () => {
  assert.match(SRC, /if\(!savedBriefId\)throw new Error\('Pre-Write Brief persistence returned no id\.'\);\s*await _saveConn\.query\('COMMIT'\);\s*if\(!_pwbNetworkPlacementId\)_pwbNotifyClientBriefCreated\(client\.id,keyword,language,savedBriefId,_pwbBriefPageUrl\(brief,client\.domain\)\);/);
  assert.match(SRC, /await conn\.query\('COMMIT'\);if\(!placementId\)_pwbNotifyClientBriefCreated\(client\.id,saveKeyword,saveLanguage,savedBriefId,_pwbBriefPageUrl\(brief,client\.domain\)\);\}catch\(e\)/);
  assert.match(SRC, /lower\(keyword\)=lower\(\$2\) AND id<>\$3 AND created_at>NOW\(\)-INTERVAL '12 hours'/);
  assert.match(SRC, /await sendTrackerEmail\(clientId,L\.s,body,false\);/, 'unsubscribe and pause rules of sendTrackerEmail apply');
});

test('the e-mail names the page: the existing URL to expand, or the planned URL of a new page (owner 2026-11-14)', () => {
  const a2 = SRC.indexOf('function _pwbBriefPageUrl('), b2 = SRC.indexOf('function _pwbClientMailText(');
  const pageUrl = new Function(SRC.slice(a2, b2) + ';return _pwbBriefPageUrl;')();
  assert.deepEqual(pageUrl({ content_decision: { recommended_treatment: 'EXPAND_EXISTING_PAGE', closest_existing_url: 'https://perfectroofingteam.com/roof-repair/' } }, 'perfectroofingteam.com'),
    { url: 'https://perfectroofingteam.com/roof-repair/', isNew: false });
  assert.deepEqual(pageUrl({ content_decision: { recommended_treatment: 'CREATE_NEW_PAGE' }, meta_package: { url_slug: '/roof-repair-lodi-nj' } }, 'https://www.perfectroofingteam.com'),
    { url: 'https://perfectroofingteam.com/roof-repair-lodi-nj/', isNew: true });
  assert.deepEqual(pageUrl({ content_decision: { recommended_treatment: 'EXPAND_EXISTING_PAGE', closest_existing_url: 'https://competitor.example/x/' }, meta_package: { url_slug: 'x' } }, 'perfectroofingteam.com'),
    { url: 'https://perfectroofingteam.com/x/', isNew: true }, 'never another site\'s URL');
  assert.equal(pageUrl({}, 'perfectroofingteam.com'), null);
  assert.equal(text('nl').u, 'Pagina'); assert.equal(text('es').nu, 'Página nueva (prevista)');
  assert.match(SRC, /\(page&&page\.url\?'<p style="font-size:14px;color:#334155;word-break:break-all;"><strong>'\+esc\(page\.isNew\?L\.nu:L\.u\)/);
});
