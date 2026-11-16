'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {openChecks}=require('../src/growth-outcome.cjs');
const ui=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
const page='https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/';
function checks(pos=40.5){
 const report={
  url:page,growth_decision:{primary_next_action:{query:'How urgent is roof repair?',metrics:{
   average_position:pos,clicks:2,impressions:350,imported_at:'2026-11-15T10:00:00Z'
  }}},
  destination_gsc_evidence:{status:'NOT_MEASURED'}
 };
 const decision={focus_query:'How urgent is roof repair?',target_url:page};
 return openChecks({report,decision,aiCheck:{summary:{checked:1,verifiable:0},max_age_days:14},now:Date.parse('2026-11-17T12:00:00Z')});
}
test('average position 40.5 is not a causal explanation for clicks',()=>{
 const all=checks();
 const position=all.find(x=>x.code==='MOSTLY_BEYOND_PAGE_ONE');
 assert.ok(position);assert.match(position.detail,/40\.5/);
 assert.match(position.detail,/not establish/);
 assert.match(position.detail,/title, description, intent/);
 assert.doesNotMatch(position.detail,/most impressions are beyond page one|clicks are limited by the position/);
});
test('no GSC rows means unknown, not zero impressions; Google grounding does not supply private GSC rows',()=>{
 const no=checks().find(x=>x.code==='TARGET_PAGE_NOT_MEASURED');
 assert.ok(no);assert.match(no.detail,/No verified Search Console record/);
 assert.match(no.detail,/does not mean zero impressions/);
 assert.match(no.action,/Optional: import/);
});
test('no AI source lists means citations unknown, never zero citations',()=>{
 const x=checks().find(x=>x.code==='AI_SOURCES_NOT_VERIFIED');
 assert.ok(x);assert.match(x.detail,/citation status is unknown/i);
 assert.match(x.detail,/does not establish that your website is not cited/);
});
test('missing position cannot silently turn into page one',()=>{
 const x=checks(null);
 assert.ok(!x.some(v=>v.code==='MOSTLY_BEYOND_PAGE_ONE'||v.code==='LOW_CLICK_RATE_ON_PAGE_ONE'));
});
test('same-page GSC optional import is reachable inline, and access failure stays explicit',()=>{
 assert.match(ui,/Import Google Search Console \(optional\)/);
 assert.match(ui,/async function refreshGscForPage\(display,trigger\)/);
 assert.match(ui,/gsc-autofetch-page/);
 assert.match(ui,/Growth using imported GSC data/);
 assert.match(ui,/Exact-page and exact-query coverage must be checked/);
 assert.match(ui,/Grounding does not provide private Search Console data/);
 assert.match(ui,/AI citation evidence: NOT VERIFIED/);
 assert.match(ui,/whether your website is cited is UNKNOWN/);
 assert.match(ui,/TARGET_PAGE_NOT_MEASURED/);
});
