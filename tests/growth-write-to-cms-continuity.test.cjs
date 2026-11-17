'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const report=fs.readFileSync(path.join(__dirname,'../public/growth-automatic-report-ui.js'),'utf8');
const checklist=fs.readFileSync(path.join(__dirname,'../public/growth-gap-checklist.js'),'utf8');
const cms=fs.readFileSync(path.join(__dirname,'../public/growth-cms-neutral-handoff.js'),'utf8');
const {sameIntent,intentClass}=require('../src/growth-cms-query-intent.cjs');

test('saved Growth writing immediately exposes the exact-query CMS action',()=>{
 assert.match(report,/written&&written\.success===true&&written\.stored===true&&written\.cms_handoff\?\.url/);
 assert.match(report,/d\.cms_handoff=written\.cms_handoff/);
 assert.match(report,/pointHandoff\(d\)/);
 assert.match(report,/handoff\.parentNode\.hidden=false/);
 assert.match(report,/The stored writing result is authoritative/);
 assert.match(report,/target\.searchParams\.get\('query'\)/);
 assert.doesNotMatch(report,/if\(selectedQuestion\)target\.searchParams\.set\('query',selectedQuestion\)/);
 assert.match(checklist,/Review saved Growth draft → Open CMS handoff/);
 assert.match(checklist,/dest\.searchParams\.get\('query'\)/);
});

test('no proposal stays blocked and routes to actual selection, not a placeholder CMS ZIP',()=>{
 assert.match(cms,/safe\.proposalState==='READY'&&safe\.proposal/);
 assert.match(cms,/href\+'#growthGapChoice'/);
 assert.match(cms,/Growth content proposal missing for this customer question/);
 assert.match(cms,/A saved Growth content proposal for this exact customer question is required/);
 assert.doesNotMatch(cms,/\/editor-draft/);
});

test('informational urgency question cannot borrow emergency service company writing',()=>{
 assert.equal(intentClass('How urgent is roof repair?'),'INFORMATIONAL');
 assert.equal(intentClass('Who offers 24-hour emergency roof repair in New Jersey?'),'SERVICE');
 assert.equal(sameIntent('emergency roof repair','How urgent is roof repair?'),false);
 assert.equal(sameIntent('emergency roof repair','Who offers 24-hour emergency roof repair in New Jersey?'),true);
});
