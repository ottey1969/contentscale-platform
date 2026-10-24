'use strict';
// Regressions for defects found independently in REAL production report 17 (e6ecc96). See fixture provenance.
const test=require('node:test'),assert=require('node:assert/strict');
const fx=require('./fixtures/growth-review-17-production.json');
const {analyzeReaderTaskCoverage}=require('../src/growth-reader-task-coverage.cjs');
const {assessSectionClaims}=require('../src/growth-owner-edit-decision.cjs');
const {buildOwnerHandoffPackage}=require('../src/growth-owner-handoff-package.cjs');
const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
// Real headings and word counts from the report; body text is SYNTHETIC filler (the report does not contain it).
const destHtml='<h1>'+esc(fx.destination_sections[0].heading)+'</h1>'+fx.destination_sections.map(s=>'<h2>'+esc(s.heading)+'</h2><p>'+'Plain filler sentence about nothing in particular here. '.repeat(Math.ceil(s.words/9))+'</p>').join('');
const T='Repurpose existing guides into social posts, newsletters and slide decks, and recycle the strongest repurposed formats across channels. ';
const filler=(w)=>'<h2>Other</h2><p>'+(w+' ').repeat(6)+'</p><h2>More</h2><p>'+('Different filler about budgets calendars approvals and staffing. ').repeat(6)+'</p>';
const comp=(u,h)=>({url:u,html:'<h2>'+esc(h)+'</h2><p>'+T.repeat(3)+'</p>'+filler('Something else entirely about unrelated planning matters here and there.')});

test('placement never lands on closing furniture; with no related section it follows the last how-to section',()=>{
 const cov=analyzeReaderTaskCoverage({query:fx.query,serpIntent:'INFORMATIONAL_GUIDE',destination:{url:fx.destination_url,html:destHtml},
  competitors:[comp('https://a.example/x','Content Repurposing'),comp('https://b.example/y','Can I recycle or repurpose content?')]});
 const t=cov.tasks.find(x=>x.match.key==='repurp');assert(t);
 const heading=t.placement.section_heading;
 assert.equal(heading,'How to Start Today');
 for(const bad of ['Related Reading','Table of Contents','Want to scale content','Dutch B2B'])assert(!heading.includes(bad),heading);
 assert.match(t.placement.reason,/instructional/);
 // The real production report placed this after “📚 Related Reading”:
 assert(fx.plan_tasks.every(p=>/Related Reading/.test(p.placement.section_heading)),'documents the production defect');
});
test('a section that already contains the concept is extended, and a related section is preferred over the fallback',()=>{
 const dest='<h1>Guide</h1><h2>Reuse and refresh</h2><p>Teams often repurpose their strongest guide, and the same notes about newsletters and slides help them avoid starting again whenever a new channel needs material, so this short section keeps a list of formats the group already knows well.</p><h2>How to start</h2><p>'+'Filler words describing a general introduction to the topic for readers. '.repeat(6)+'</p>';
 const cov=analyzeReaderTaskCoverage({query:fx.query,serpIntent:'INFORMATIONAL_GUIDE',destination:{url:'https://s.example/g/',html:dest},competitors:[comp('https://a.example/x','Content Repurposing'),comp('https://b.example/y','Can I recycle or repurpose content?')]});
 const t=cov.tasks.find(x=>x.match.key==='repurp');assert.equal(t.placement.mode,'EXTEND_SECTION');assert.equal(t.placement.section_heading,'Reuse and refresh');
});
test('a word that is the TOPIC of an article ("creation") is not reported as a reader task two sites agree on',()=>{
 const topicPara=n=>'Content creation depends on clear briefs, a steady cadence and a review habit that the whole team follows. '.repeat(n);
 const site=(u,heads)=>({url:u,html:heads.map(h=>'<h2>'+h+'</h2><p>'+topicPara(3)+'</p>').join('')});
 const cov=analyzeReaderTaskCoverage({query:'content scaling',serpIntent:'INFORMATIONAL_GUIDE',destination:{url:'https://s.example/g/',html:'<h1>g</h1><p>'+'Short intro text about the subject of this page for readers. '.repeat(5)+'</p>'},
  competitors:[site('https://a.example/x',['Collaborative Content Creation','Planning the calendar','Measuring results','Tooling']),site('https://b.example/y',['How to scale your content creation','Briefs and reviews','Habits'])]});
 assert(!cov.tasks.some(t=>t.match.key==='creati'),'topic word must not become a task: '+cov.tasks.map(t=>t.match.key));
});
test('"maximizes the value" is softened and logged; maximising ROI or traffic is still rejected',()=>{
 const raw=fx.raw_draft_sections.find(s=>/Repurposing/.test(s.h2));
 const r=assessSectionClaims(raw,{destinationText:'',query:fx.query,brandLabel:'contentscale'});
 assert.equal(r.ok,true,JSON.stringify(r.violations));
 assert.match(r.paragraphs[0],/can increase the value of existing published assets/);assert(!/maximizes the value/.test(r.paragraphs[0]));
 assert(r.safe_rewrites.some(w=>w.changes.some(c=>/maximizes/i.test(c.from))));assert(r.safe_rewrites.some(w=>w.changes.some(c=>c.to==='helping ensure')));
 const roi=assessSectionClaims({h2:'x',paragraphs:['Repurposing helps you maximize content ROI and maximize your traffic across every channel you publish on.']},{destinationText:'',query:fx.query});
 assert.equal(roi.ok,false);
});
test('owner package: the text is attributed to ITS task and sources, rejected sections are named but not shown, partial captures are not called "in full"',()=>{
 const plan={target_url:fx.destination_url,preserve:['existing title'],tasks:[
  {code:'task_repurp',label:'Competitors teach “Content Repurposing”',destination_status:'NOT_OBSERVED',placement:{mode:'ADD_AFTER_SECTION',section_heading:'How to Start Today',reason:'r'},
   competitor_evidence:[{url:'https://a.example/x',heading:'Content Repurposing',excerpt:'Repurpose existing guides into social posts.'}],destination_evidence:[]}]};
 const rewritten='Updating facts helps teams refresh dependent formats, ensuring accuracy and consistency across all touchpoints today.';
 const decision={decision:'IMPROVE_EXISTING',copy_ready:true,focus_query:fx.query,target_url:fx.destination_url,improvement_plan:plan,draft_heading:'How to Scale Distribution Through Content Repurposing',
  proposed_text:'Accepted text about repurposing.',placement:plan.tasks[0].placement,draft_validation:[{task:'task_repurp'}],
  safe_rewrites:[{before:rewritten,after:rewritten.replace('ensuring','helping ensure'),changes:[{from:'ensuring',to:'helping ensure'}]}]};
 const completion={draft:{sections:[{h2:'Accepted',paragraphs:['x'],review_status:'ACCEPTED_FOR_OWNER_REVIEW'},
  {h2:'How to Implement Collaborative Content Creation',paragraphs:['SECRET REJECTED BODY TEXT'],review_status:'REJECTED_NOT_PART_OF_PROPOSAL',rejection_reasons:[{code:'DRAFT_OFF_TASK'}]}]}};
 const report={url:'https://contentscale.site/',generated_at:'t',reader_task_coverage:{competitors_considered:[{url:'https://a.example/x',partial:true},{url:'https://b.example/y',partial:false}],method:'m',tasks:[
  {code:'task_creati',label:'Competitors teach “Collaborative Content Creation”',independent_sources:2,destination:{status:'NOT_OBSERVED'}},
  {code:'task_repurp',label:'Competitors teach “Content Repurposing”',independent_sources:2,destination:{status:'NOT_OBSERVED'}}]}};
 const md=buildOwnerHandoffPackage({report,decision,completion}).markdown;
 assert.match(md,/### Change 1: Competitors teach “Content Repurposing”/);assert(!/### Change 1: .*Collaborative/.test(md));
 assert.match(md,/Content Repurposing\W[^\n]*Repurpose existing guides/,'evidence belongs to the accepted task');
 assert.match(md,/Generated but rejected[\s\S]*Collaborative Content Creation[\s\S]*DRAFT_OFF_TASK/);assert(!md.includes('SECRET REJECTED BODY TEXT'));
 assert.match(md,/captured partially/);assert(!/read in full/.test(md));
 assert.match(md,/draft verified/);assert.match(md,/“ensuring” → “helping ensure”/);assert.match(md,/directly after “How to Start Today”/);
});
test('final decision keeps only the verified task, says so, and lists the evidence once',()=>{
 const task=(code,label)=>({code,label,match:{key:code.slice(5),co_terms:[],concepts:[code.slice(5)]},supported_by_competitors:true,independent_sources:2,
  competitor_support:[{url:'https://a.example/'+code,heading:label,excerpt:'e'},{url:'https://b.example/'+code,heading:label,excerpt:'e'}],destination:{status:'NOT_OBSERVED',passages:[]},covered_elsewhere_on_site:[],placement:{mode:'ADD_AFTER_SECTION',section_heading:'How to Start Today',reason:'r'}});
 const args={report:{url:'https://s.example/',growth_decision:{protection:{},primary_next_action:{query:'content scaling'}}},destination:{target_url:'https://s.example/g/',status:'FULL_SECTION_COMPARISON_RESEARCH_ONLY'},
  coverage:{competitors_considered:[{url:'a'},{url:'b'}],destination_truncated:false,tasks:[task('task_alpha','Alpha'),task('task_beta','Beta')],destination_section_headings:[]},
  serpIntent:{status:'SERP_INTENT_OBSERVED',intent:'INFORMATIONAL_GUIDE',agreeing_leads:3,organic_leads_considered:4,leads:[]},destinationIntent:{verdict:'COMPATIBLE'},attempts:[]};
 const planned=decideGrowthEditorialAction(args);assert.equal(planned.improvement_plan.tasks.length,2);assert.doesNotMatch(planned.reason,/not\/not/);
 const opp={verified:true,type:'IMPROVE_EXISTING',producer:'P',focus_query:'content scaling',target_url:'https://s.example/g/',target_section:'How to Start Today',task_codes:['task_beta'],
  proposed_text:'x'.repeat(90),evidence:[{type:'COMPETITOR',source_url:'https://a.example/task_beta',heading:'Beta',excerpt:'q'},{type:'COMPETITOR',source_url:'https://a.example/task_beta',heading:'Beta',excerpt:'q'}]};
 const done=decideGrowthEditorialAction({...args,report:{...args.report,verified_editorial_opportunity:opp}});
 assert.deepEqual(done.improvement_plan.tasks.map(t=>t.code),['task_beta']);assert.deepEqual(done.improvement_plan.unverified_task_codes,['task_alpha']);
 assert.equal(done.evidence.length,1);assert.match(done.reason,/1 reader task\(s\)/);assert.equal(done.copy_ready,true);
});
