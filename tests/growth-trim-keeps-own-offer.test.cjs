'use strict';
// Owner 2026-11-20 (contentscale.site homepage brief, "content scaling"): "Voice Search Optimisation" was advised to shorten
// AND listed as unique content worth preserving; and the page's own offer and proof sections ("Done-For-You", "Do It
// Yourself", "Team Handoff", "Ask your question", "See the Live Tracker", "NEW – PRE WRITE BRIEF", "Work Directly With…",
// "This Is the Starting Point — Not the Result") were advised to shorten because no competitor has such a heading.
const test=require('node:test'),assert=require('node:assert/strict');
const {buildContentPriorities}=require('../src/growth-free/content-priorities.cjs');
const {isFurnitureHeading}=require('../src/growth-derived-reader-tasks.cjs');

const SECTIONS=[['Beyond Content at Scale Track Your AI Citations & Rankings in 2026',300],['This Is the Starting Point — Not the Result',186],
 ['What the Data Shows About AI Search (2025-2026)',140],['Second Live Tracker View',131],['What is the Difference Between Ranking and Being Cited in AI Search?',116],
 ['Voice Search Optimisation',70],['NEW – PRE WRITE BRIEF',69],['New here? Follow the 48-Hour Plan to get cited',51],['See the Live Tracker',40],
 ['Team Handoff',23],['Done-For-You',18],['Do It Yourself',17],['Ask your question',10],['Work Directly With an Independent SEO & AI Search Specialist',146],
 ['Mi tarifa y presupuesto',60],['Laat het uit handen nemen',40]];
function run(unique){
 const secs=SECTIONS.map(([heading,words])=>({heading,words,excerpt:'',furniture:isFurnitureHeading(heading)}));
 const report={competitor_overview:{status:'OBSERVED',ranking_pages_read:3,this_page_sections:secs,topics:[],ungrouped_sections:[],
  ranking_pages:[{content_headings:['Outsource content creation','Agile content planning','Batch tasks together']}]}};
 return buildContentPriorities({summary:{query:'content scaling',gaps:{items:[],unique_content:unique.map(h=>({heading:h}))}},report});
}

test('a section listed as unique content to preserve is never also advised to shorten',()=>{
 const out=run(['Voice Search Optimisation','What the Data Shows About AI Search (2025-2026)']);
 const trimmed=out.trim.map(t=>t.heading),kept=out.keep.map(k=>k.heading);
 for(const h of ['Voice Search Optimisation','What the Data Shows About AI Search (2025-2026)']){
  assert.ok(!trimmed.includes(h),'not advised to shorten: '+h);
  assert.ok(kept.includes(h),'kept: '+h);
 }
});

test("the page's own offer, contact and proof sections are never advised to shorten, in English, Dutch and Spanish",()=>{
 const trimmed=run([]).trim.map(t=>t.heading);
 for(const h of ['This Is the Starting Point — Not the Result','Second Live Tracker View','NEW – PRE WRITE BRIEF','New here? Follow the 48-Hour Plan to get cited',
  'See the Live Tracker','Team Handoff','Done-For-You','Do It Yourself','Ask your question','Work Directly With an Independent SEO & AI Search Specialist',
  'Mi tarifa y presupuesto','Laat het uit handen nemen'])
  assert.ok(!trimmed.includes(h),'not advised to shorten: '+h);
 // Real content that does not answer this search is still offered for review.
 assert.ok(trimmed.includes('What is the Difference Between Ranking and Being Cited in AI Search?'),trimmed.join(' | '));
});
