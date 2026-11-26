'use strict';
// Owner 2026-11-20 (screenshot of the paid card): "wat de ik en hoe kort en krachtig". The text said "I write…", the button
// "Ask ContentScale to do it" and the translations "wij doen het" / "lo hacemos": three voices in one card, and 31 words.
// One voice (I), short, a button that answers the question, and "en kort uitleg wat en waarom": one line what, one line why.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
const {ROWS}=require('../src/growth-free/ui-texts.cjs');
const card=src.slice(src.indexOf('<div class="card hire-prominent" id="hire">'),src.indexOf('<form id="hf"'));
const {freeGrowthConfig}=require('../src/growth-free/routes.cjs');

test('the paid card speaks in one voice and is short',()=>{
 assert.match(card,/Rather not do it yourself\?/);
 assert.match(card,/id="hireOpen">Yes, do it for me</);
 assert.ok(!/Ask '\+esc\(BRAND\)\+' to do it/.test(card),'no second voice on the button');
 const def=src.match(/serviceText:env\.GROWTH_FREE_SERVICE_TEXT\|\|'([^']+)'/)[1].split('\\n');
 assert.deepEqual(def,['What: I write the missing sections in your voice and check every fact with you.','Why: your page answers what Google and AI look for; after 28 days I measure the result.']);
 assert.ok(def.join(' ').split(/\s+/).length<=32,'short');
 // Inside the page script (a template literal) the newline must stay escaped, or the browser gets a broken string.
 assert.match(card,/split\('\\\\n'\)/,'each line is its own paragraph');
});

test('Dutch and Spanish say "I" too, never "we"',()=>{
 const row=k=>ROWS.find(r=>r[0]===k);
 for(const k of ['Paid · done for you','Rather not do it yourself?','Yes, do it for me',
  'What: I write the missing sections in your voice and check every fact with you.',
  'Why: your page answers what Google and AI look for; after {n} days I measure the result.']){
  const r=row(k);assert.ok(r&&r[1]&&r[2],'nl/es: '+k);
  assert.doesNotMatch(r[1],/\bwij\b|\bwe\b/i,'nl no "wij": '+k);
  assert.doesNotMatch(r[2],/hacemos|hagamos/i,'es no "nosotros": '+k);
 }
});

// Owner 2026-11-20: "author image toevoegen". The card says "I"; the photo and name show who that is.
test('the paid card shows who "I" is: photo and name, never on a key with its own brand',()=>{
 assert.match(card,/class="hire-who"/);
 assert.match(card,/AUTHOR_IMG\?'<img src="'\+esc\(AUTHOR_IMG\)/);
 assert.match(card,/class="hire-name"/);
 const cfg=freeGrowthConfig({GROWTH_FREE_ACCESS_KEYS:JSON.stringify([{key:'agency-key-123',brand:'Agency X'},{key:'own-key-456'}])});
 assert.equal(cfg.authorName,'Ottmar J.G. Francisca');
 assert.equal(cfg.authorImage,'/blog/images/ottmar-francisca.jpg');
 const agency=cfg.accessKeys.find(k=>k.key==='agency-key-123'),own=cfg.accessKeys.find(k=>k.key==='own-key-456');
 assert.equal(agency.authorImage,'');assert.equal(agency.authorName,'');
 assert.equal(own.authorImage,cfg.authorImage);
 const custom=freeGrowthConfig({GROWTH_FREE_AUTHOR_IMAGE:'http://insecure.example/p.png'});
 assert.equal(custom.authorImage,cfg.authorImage,'insecure custom images fall back to the local author photo');
 assert.equal(freeGrowthConfig({GROWTH_FREE_AUTHOR_IMAGE:'https://example.test/photo.jpg'}).authorImage,'https://example.test/photo.jpg');
});
