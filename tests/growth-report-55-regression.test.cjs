'use strict';
// Production report 55 (page 2294): two new sections share one anchor ("⚙️ How AI Citation Trackers Actually Work").
// The plan said in prose that the "prioritize" section goes after the "manual" section, but the proposal listed it
// first and the CMS package told the editor to put BOTH "directly after" the same heading. Real data only.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {proposalFromDecision}=require('../src/growth-proposal-store.cjs');
const {prepareGrowthCmsHandoff}=require('../src/growth-cms-handoff.cjs');
const r55=require('./fixtures/growth-report-55/decision.json');
const ANCHOR='⚙️ How AI Citation Trackers Actually Work';
const withOrderField=()=>{const d=JSON.parse(JSON.stringify(r55.editorial_decision_gate));
 const t=d.improvement_plan.tasks.find(x=>x.code==='task_priori');
 assert.match(t.placement.reason,/Place it after the section proposed for “Competitors teach “Manually search/,'the order report 55 states in prose');
 t.placement.after_task_code='task_manual';return d};

test('report 55: the proposal is stored in page order (manual first, then the section that follows it)',()=>{
 const p=proposalFromDecision(withOrderField());
 assert.deepEqual(p.sections.map(s=>s.task_code),['task_manual','task_priori']);
 assert.equal(p.sections[1].placement.after_task_code,'task_manual');
 assert(p.sections.every(s=>s.placement.section_heading===ANCHOR));
});

test('report 55: the CMS package tells the editor to put Change 2 directly after Change 1',()=>{
 const p=proposalFromDecision(withOrderField());
 const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 // Headings only (real); no body sentences are invented for the page.
 const original='<main><h1>What Is an AI Citation Tracker?</h1><h2>'+ANCHOR+'</h2><p>'+ANCHOR+'</p></main>';
 const out=prepareGrowthCmsHandoff({canonicalUrl:r55.url,originalHtml:original,sourceExpectedSha256:createHash('sha256').update(original).digest('hex'),
  editorApproved:true,cms:'wordpress',pageTitle:'What Is An AI Citation Tracker?',metaDescription:'What an AI citation tracker checks.',evidenceScope:'observed',
  changes:p.sections.map(s=>({approved:true,evidence_ref:'growth_proposal:5',placement:s.placement,
   html:'<section><h2>'+esc(s.h2)+'</h2>'+s.text.split(/\n\s*\n/).map(t=>'<p>'+esc(t)+'</p>').join('')+'</section>'}))});
 assert.equal(out.status,'HANDOFF_READY_FOR_EDITOR',JSON.stringify(out.issues));
 const impl=out.files.find(f=>f.name==='01-implementation.md').content;
 assert.match(impl,/Change 1: Add as a new section directly after “⚙️ How AI Citation Trackers Actually Work”/);
 assert.match(impl,/Change 2: Add as a new section directly after Change 1 \(both follow “⚙️ How AI Citation Trackers Actually Work”\)/);
});
