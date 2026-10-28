'use strict';
// Regressions from production reports 7 (ContentScale) and 8 (PRT), 27 Oct 2026. Fixture text is verbatim; synthetic bodies are labelled.
const test=require('node:test'),assert=require('node:assert/strict');
const fx=require('./fixtures/growth-reports-7-8.json');
const {assessDraftClaims,sentencesOf}=require('../src/growth-draft-claim-guard.cjs');
const {analyzeReaderTaskCoverage,blocks,groupSections}=require('../src/growth-reader-task-coverage.cjs');
const {decodeEntities}=require('../src/growth-text.cjs');
const {buildOwnerHandoffPackage}=require('../src/growth-owner-handoff-package.cjs');
const {produceVerifiedEditorialOpportunity}=require('../src/growth-verified-opportunity.cjs');

test('report evidence: the production packet said evidence_verified:false while the decision said verified_gap:true',()=>{
 for(const k of ['cs','prt']){assert.equal(fx[k].verified_gap,true);assert.equal(fx[k].evidence_verified_in_packet,false);assert.equal(fx[k].copy_ready,true)}
});
const destPrt='The page lists what qualifies as a 24 hour emergency roof repair situation in New Jersey.';
test('real PRT text: hazard and delay guidance is kept but flagged for professional safety review',()=>{
 const rows=sentencesOf(fx.prt.proposed_text).map(x=>assessDraftClaims({text:x,destinationText:destPrt,query:'emergency roof repair nj',brandLabel:'perfectroofingteam'}));
 assert(rows.every(r=>r.ok),'nothing in the real text is a hard safety assurance: it stays reviewable');
 const flagged=rows.flatMap(r=>r.claim_review).filter(x=>x.safety_review).map(x=>x.sentence);
 assert(flagged.some(x=>/ceiling leaks near electrical fixtures/.test(x)),'water near electrical fixtures');
 assert(flagged.some(x=>/structural integrity/.test(x)),'structural integrity');
 assert(flagged.some(x=>/can typically wait for standard business hours/.test(x)),'the "can wait" assurance');
 const opp=produceVerifiedEditorialOpportunity({report:{editorial_decision_gate:{decision:'IMPROVE_EXISTING',focus_query:'emergency roof repair nj',target_url:'https://p.example/e/',improvement_plan:{target_url:'https://p.example/e/',tasks:[{code:'task_count',label:'t',match:{key:'count',co_terms:[],concepts:['count','immedi','storm']},placement:{mode:'ADD_AFTER_SECTION',section_heading:'x',reason:'r'},competitor_evidence:[{url:'https://a.example/x',heading:'What counts as a roof emergency?',excerpt:'e'}],destination_evidence:[]}]}},reader_task_coverage:{}},
  completion:{target_url:'https://p.example/e/',draft:{sections:[{task_code:'task_count',h2:'What Counts as an Immediate Roof Emergency in New Jersey?',paragraphs:fx.prt.proposed_text.split('\n\n')}]}},sources:{destinationHtml:'<p>'+destPrt+'</p>',competitorHtml:[],brandLabel:'perfectroofingteam'}});
 assert.equal(opp.opportunity?.verified,true,JSON.stringify(opp.rejections));
 const cr=opp.opportunity.claim_review;assert(cr.needs_safety_review.length>=3);assert(cr.requirements.some(x=>/qualified professional/.test(x)&&/emergency services/.test(x)));
 const md=buildOwnerHandoffPackage({report:{url:'https://perfectroofingteam.com/',generated_at:'t'},decision:{decision:'IMPROVE_EXISTING',copy_ready:true,claim_review:cr,improvement_plan:{tasks:[]},proposed_text:'x',draft_heading:'h',placement:{mode:'ADD_AFTER_SECTION',section_heading:'s'},draft_validation:[]},completion:{}}).markdown;
 assert.match(md,/Safety review by a qualified professional: “[^”]*electrical fixtures/);
});
test('an unconditional safety assurance is rejected unless the destination page itself says it',()=>{
 for(const t of ['Your roof is safe to ignore until spring.','Minor stains are harmless and there is no danger to your family.','There is nothing to worry about when a ceiling sags a little.']){
  const r=assessDraftClaims({text:t,destinationText:destPrt,query:'x'});assert.equal(r.ok,false,t);assert(r.violations.some(v=>v.code==='UNSUPPORTED_SAFETY_ASSURANCE'));
 }
 const sourced='Minor stains are harmless and there is no danger to your family when the area stays dry.';
 assert(!assessDraftClaims({text:'Minor stains are harmless and there is no danger to your family when the area stays dry.',destinationText:sourced,query:'x'}).violations.some(v=>v.code==='UNSUPPORTED_SAFETY_ASSURANCE'));
});
test('real ContentScale headings: "&rarr;" is decoded and an FAQ-style section ("8 Questions People Ask") is never an insertion anchor',()=>{
 const raw=fx.cs.destination_sections.map(s=>s.heading);
 assert(raw.some(h=>/&rarr;/.test(h)),'the production report carries the raw entity');assert.equal(decodeEntities('(Brief &rarr; Publish)'),'(Brief → Publish)');
 const html='<h1>t</h1>'+fx.cs.destination_sections.map(s=>'<h2>'+s.heading+'</h2><p>'+('Plain filler sentence about nothing in particular here. '.repeat(Math.ceil(Math.max(s.words,40)/9)))+'</p>').join('');
 const heads=groupSections(blocks(html)).map(s=>s.heading);assert(heads.every(h=>!/&\w+;/.test(h)),'no entity remains: '+heads.filter(h=>/&\w+;/.test(h)));
 const T='Repurpose existing guides into social posts, newsletters and slide decks, and recycle the strongest repurposed formats across channels. ';
 const comp=(u,h)=>({url:u,html:'<h2>'+h+'</h2><p>'+T.repeat(3)+'</p><h2>Other</h2><p>'+'Something unrelated about budgets and calendars and approvals here. '.repeat(5)+'</p><h2>More</h2><p>'+'Different filler about staffing and meetings and planning. '.repeat(5)+'</p>'});
 const cov=analyzeReaderTaskCoverage({query:'content scaling',serpIntent:'INFORMATIONAL_GUIDE',destination:{url:'https://x.example/p/',html},competitors:[comp('https://a.example/x','Content Repurposing'),comp('https://b.example/y','Can I recycle or repurpose content?')]});
 const t=cov.tasks.find(x=>x.match.key==='repurp');assert(t);assert(!/Questions People Ask|Related Articles|Table of Contents|Want to Scale/.test(t.placement.section_heading),t.placement.section_heading);
 assert.equal(fx.cs.additional_sections[0].placement.section_heading,'Content Scaling — 8 Questions People Ask','documents the production defect');
});
test('a shared word in two headings ("…content creation") is not a task when one site uses it across many sections',()=>{
 const sec=(h,t)=>'<h2>'+h+'</h2><p>'+t+'</p>';const body='Content creation depends on clear briefs, a steady cadence and a review habit that the whole team follows every week. ';
 const manySections=(heads)=>'<html><body>'+heads.map(h=>sec(h,body.repeat(3))).join('')+'</body></html>';
 const a=manySections(['Collaborative Content Creation','Planning the calendar','Content creation briefs','Measuring results','Content creation reviews','Tooling']);
 const b='<html><body>'+sec('How to scale your content creation',body.repeat(3))+sec('Briefs and reviews','Different words about calendars and approvals and owners and weekly meetings with the editors. '.repeat(3))+sec('Habits','Another unrelated paragraph about staffing and budgets and quarterly planning cycles for the team. '.repeat(3))+'</body></html>';
 const cov=analyzeReaderTaskCoverage({query:'content scaling',serpIntent:'INFORMATIONAL_GUIDE',destination:{url:'https://s.example/g/',html:'<h1>g</h1><p>'+'Short intro text about the subject of this page for readers. '.repeat(5)+'</p>'},competitors:[{url:'https://a.example/x',html:a},{url:'https://b.example/y',html:b}]});
 assert(!cov.tasks.some(t=>t.match.key==='creati'),'topic word: '+cov.tasks.map(t=>t.match.key));
 assert(fx.cs.competitor_support.some(x=>x.task==='task_creati'),'documents the production defect');
});
test('heading-only support must be corroborated by a second shared concept',()=>{
 const F='The crew arrives, inspects the property and explains the findings to the owner before any work starts on the building. ';
 const page=rows=>'<html><body>'+rows.map(([h,t])=>'<h2>'+h+'</h2><p>'+t+'</p>').join('')+'</body></html>';
 const dest='<h1>x</h1><h2>Our work</h2><p>'+F.repeat(4)+'</p>';
 const run=(a,b)=>analyzeReaderTaskCoverage({query:'emergency roof repair nj',serpIntent:'LOCAL_SERVICE',destination:{url:'https://own.example/e/',html:dest},competitors:[{url:'https://a.example/x',html:page(a)},{url:'https://b.example/y',html:page(b)}]});
 const unrelated=run([['Emergency Tarping','Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.']],[['Roof Tarping Basics','Completely different vocabulary about budgets calendars approvals staffing meetings planning quarterly reviews owners editors weekly habits cadence briefs sprints retrospectives dashboards objectives roadmaps milestones.']]);
 assert(!unrelated.tasks.some(t=>t.match.key==='tarp'),'two headings with one shared word and nothing else in common are not a shared task');
 const related=run([['Emergency Tarping',F.repeat(2)+'A tarp is fitted over the damaged area quickly.']],[['How Roof Tarping Works',F.repeat(2)+'The tarp keeps rain out until repairs are scheduled.']]);
 assert(related.tasks.some(t=>t.match.key==='tarp'),'with corroborating shared content it is a task');
});
