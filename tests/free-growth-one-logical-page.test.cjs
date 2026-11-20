'use strict';
// Owner 2026-11-20: the Free Growth result showed the same findings five times, put the brief buttons at the top, called
// the research outcome "DATA_BLOCKED" and asked "is dit nodig: Optional: select topics for automatic drafting".
// "Je moet kijken of dit niet logischer kan en zaken die er niet toe doen weg kunnen" and "alles in normale taal".
// One page, one order: outcome in plain words → what to put in your content → choose what AI writes → Write with AI →
// publish & measure → done for you → do it yourself → evidence (collapsed) with the brief copy/download at the bottom.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
const {ROWS}=require('../src/growth-free/ui-texts.cjs');
const {competitorsOf}=require('../src/growth-free/routes.cjs');
const prt=require('./fixtures/free-growth-prt-emergency/check.json');
const renderSrc=src.slice(src.indexOf('function render(d){'),src.indexOf('// While Google is researched'));

test('the result page has one logical order',()=>{
 const order=['h+=growthBriefHtml(s,d)','id="freeAiResearch"','h+=gapsHtml(s.gaps,d.writing,d)','id="stepPublish"','id="hire"',
  'h+=selfHtml(LAST_SELF)','id="stepResearch"','h+=briefSourcesHtml(s,d)','id="briefExport"','id="data"'];
 let last=-1;
 for(const k of order){const i=renderSrc.indexOf(k);assert.ok(i>last,'in order: '+k+' ('+i+' after '+last+')');last=i}
});

test('what does not matter is gone: no duplicate lists, no second AI block, no export of a selection',()=>{
 for(const gone of ['What the check found','Export only selected topics','Optional: select topics for automatic drafting',
  'data-tab="ai"','Editorial instructions and sources','Continue to the complete editor brief','id="gapDownload"'])
  assert.ok(!src.includes(gone),'removed: '+gone);
 // The brief buttons are at the bottom, not in the head of the result.
 const brief=src.slice(src.indexOf('function growthBriefHtml(s,d){'),src.indexOf('function briefSourcesHtml(s,d){'));
 assert.ok(!brief.includes('briefCopyAll'),'copy button not in the head');
 assert.match(renderSrc,/id="briefExport"[^]*id="briefCopyAll"[^]*id="briefDownloadAll"/);
});

test('the steps say what they do, in plain words: choose, Write with AI, publish',()=>{
 assert.match(src,/stepSum\(1,'Choose what AI writes into your page'/);
 assert.match(src,/stepSum\(2,'Write with AI'/);
 assert.match(src,/class="card hire-prominent" id="hire"/);
});

test('the outcome is plain language, never a status code (PRT emergency: 14 of 16 topics already on the page)',()=>{
 const c=competitorsOf(prt.report,prt.summary.gaps);
 assert.deepEqual(c.coverage,{total:16,on_page:14,partly:0,missing:2,one_site:2});
 const start=src.indexOf('function outcomeOf(s,d){'),end=src.indexOf('function prioritiesHtml(cp){');
 assert.ok(start>0&&end>start,'outcomeOf exists before prioritiesHtml');
 const ctx={};vm.runInNewContext(src.slice(start,end),ctx);
 const blocked=ctx.outcomeOf({decision:'DATA_BLOCKED',gaps:{items:[]}},{competitors:c});
 assert.match(blocked.title,/already covers most of what the top Google pages cover/);
 assert.match(blocked.line,/14 of 16 topics/);
 assert.match(blocked.line,/2 remaining/);
 const noCover=ctx.outcomeOf({decision:'DATA_BLOCKED',gaps:{items:[]}},{competitors:{coverage:{total:10,on_page:3,partly:1,missing:6,one_site:2}}});
 assert.match(noCover.title,/no firm advice/i);
 const verified=ctx.outcomeOf({decision:'IMPROVE',gaps:{items:[{id:'1',recommended:true,group:'MISSING_TOPIC'},{id:'2',recommended:true,group:'QUESTION'}]}},{});
 assert.match(verified.title,/2 things to improve/);
 const keep=ctx.outcomeOf({decision:'NO_CHANGE',gaps:{items:[]}},{});
 assert.match(keep.title,/Keep your page as it is/);
 for(const o of [blocked,noCover,verified,keep])assert.doesNotMatch(o.title+' '+o.line,/[A-Z]{2,}_[A-Z]{2,}/,'no status codes');
 // The downloadable brief also says the outcome in words, not the code.
 assert.ok(!src.includes("'Decision: '+(s.decision"),'no "Decision: DATA_BLOCKED" in the brief');
 assert.match(src,/'Outcome: '\+o\.title/);
 // The ordered list says "ideas to check" instead of "Research only".
 assert.ok(!src.includes("'Research only: the evidence check did not confirm a content change. Use this order to review, not to publish.'"));
});

test('every new text has a Dutch and a Spanish translation',()=>{
 const keys=['Choose what AI writes into your page','Write with AI','Your page already covers most of what the top Google pages cover',
  '{n} of {n} topics on the ranking pages are already on your page. The {n} remaining topic(s) each appear on only one site: ideas to consider, not must-haves.',
  'The top Google pages do not agree, so there is no firm advice','{n} things to improve on your page','Keep your page as it is',
  'Ideas to check, most useful first. None of them is a must-have: use one only if it fits your business.',
  'Your brief for an editor or another AI tool','Sources and details per topic','Tick the topics AI should write into your page. The recommended ones are ticked when you start.',
  'Let us do it for you','Paid · done for you'];
 for(const k of keys){const row=ROWS.find(r=>r[0]===k);assert.ok(row,'row: '+k);assert.ok(row[1]&&row[2],'nl/es: '+k)}
});

test('the ordered list is translated: a row written with a bare {q} still matches the quoted text in the page',()=>{
 // The browser translator turns a quoted text into “{q}” (with its quotes) before it looks the sentence up.
 const {table}=require('../src/growth-free/ui-texts.cjs'),nl=table().nl;
 assert.equal(nl['Add a section that answers “{q}” in your own words.'],'Voeg een sectie toe die “{q}” in je eigen woorden beantwoordt.');
 assert.equal(nl['Add this page element yourself: “{q}”.'],'Voeg dit pagina-element zelf toe: “{q}”.');
 assert.equal(nl['On your page (topic comparison: “{q}”)'],'Op je pagina (onderwerpvergelijking: “{q}”)');
});

// Owner 2026-11-20 (PRT emergency check): "ik zie nergens waar ik dit kan downloaden voor external ai of editor". The
// "AI cannot write" card still pointed to the removed "Export your selection, below". Every pointer now leads to the
// complete brief at the bottom (#briefExport), and the result head links to it.
test('the complete brief is findable: a link under the outcome and no pointer to the removed selection export',()=>{
 assert.ok(!src.includes('Export your selection'),'no pointer to the removed export');
 assert.ok(!src.includes('Your editor brief is in step 1'),'the brief is not in step 1 any more');
 assert.ok(!src.includes('step 2 (Write the text)'),'step 2 is called Write with AI');
 const brief=src.slice(src.indexOf('function growthBriefHtml(s,d){'),src.indexOf('function briefSourcesHtml(s,d){'));
 assert.match(brief,/href="#briefExport"[^>]*>↓ Download the brief for an editor or another AI tool<\/a>/);
 const next=src.slice(src.indexOf('function nextWrite('),src.indexOf('function automaticDraftIds('));
 assert.match(next,/Or download the complete brief at the bottom of this page and give it to an editor or another AI tool\./);
 assert.match(next,/href="#briefExport"/);
 for(const k of ['↓ Download the brief for an editor or another AI tool','Or download the complete brief at the bottom of this page and give it to an editor or another AI tool.','Go to the brief ↓','Use the complete brief at the bottom of this page instead.','Your complete brief is at the bottom of this page.'])
  {const row=ROWS.find(r=>r[0]===k);assert.ok(row&&row[1]&&row[2],'nl/es: '+k)}
});
