'use strict';
// Regressions for the two blockers seen in the 27 October production runs:
//  - ContentScale: AI_DRAFT_OFF_TOPIC_SECTION (the generator's own topic check contradicted the task-aligned prompt)
//  - PRT: SHARED_COMPETITOR_REQUIREMENTS with two readable sites and no explanation
// (The 27 October report files themselves were not available to the author; the error codes come from the owner's summary.)
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeDraft,generateGrowthEditorDraft}=require('../src/growth-source-grounded-editor.cjs');
const {analyzeReaderTaskCoverage}=require('../src/growth-reader-task-coverage.cjs');
const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
const {buildOwnerHandoffPackage}=require('../src/growth-owner-handoff-package.cjs');
const SOURCE='The page explains how a team plans content, writes briefs, reviews drafts and publishes pages after a final check by an editor.';
const para='Create one shared template for every brief so each writer starts from the same structure, and review the template whenever the style guide changes for the whole team.';
const json=sections=>JSON.stringify({sections});
test('task mode: a section may carry the task core word instead of the focus-query word; a section with neither is rejected by name',()=>{
 const sec=h2=>({h2,paragraphs:[para,para.replace('shared','reusable')]});
 const onlyTask=normalizeDraft(json([sec('Use shared brief templates')]),SOURCE,'content scaling',{requireTitle:false,taskTerms:['templates']});
 assert.equal(onlyTask.status,'AI_DRAFT_REVIEW_REQUIRED','core word "templates" is enough in task mode');
 const legacy=normalizeDraft(json([sec('Use shared brief templates')]),SOURCE,'content scaling',{requireTitle:false});
 assert.equal(legacy.status,'AI_DRAFT_OFF_TOPIC_SECTION','without task terms the original rule is unchanged');
 const neither=normalizeDraft(json([{h2:'Pasta cooking basics',paragraphs:['Boil water and add salt before adding the pasta, then stir it from time to time until tender.','Drain the pasta and serve it with a sauce that you prepared while the water was heating up.']}]),SOURCE,'content scaling',{requireTitle:false,taskTerms:['templates']});
 assert.equal(neither.status,'AI_DRAFT_OFF_TOPIC_SECTION');assert.deepEqual(neither.rejected_sections.map(x=>x.h2),['Pasta cooking basics']);assert.equal(neither.rejected_sections[0].reason,'NO_FOCUS_QUERY_TERM_AND_NO_TASK_CORE_WORD');
});
test('the retry in task mode names the failed section, keeps the task_code contract and never asks for an SEO title',async()=>{
 const prompts=[];const bad=json([{h2:'Pasta cooking basics',paragraphs:['Boil water and add salt before adding the pasta, then stir it from time to time until tender.','Drain the pasta and serve it with a sauce that you prepared while the water was heating up.']}]);
 const good=json([{task_code:'task_templa',h2:'Use shared brief templates',paragraphs:[para,para.replace('shared','reusable')]}]);
 const reply=text=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text}]}}]})});
 let n=0;const fetchImpl=async(url,opts)=>{prompts.push(JSON.parse(opts.body).contents[0].parts[0].text);return reply(n++===0?bad:good)};
 const task={mode:'SECTION_IMPROVEMENT',tasks:[{code:'task_templa',label:'Competitors teach “Standard templates”',core_words:['templates','brief'],placement_mode:'ADD_AFTER_SECTION',placement_heading:'How to Start'}],existing_headings:[]};
 const out=await generateGrowthEditorDraft({sourceHtml:'<h1>Guide</h1><p>'+SOURCE.repeat(3)+'</p>',pageUrl:'https://s.example/g/',focusQuery:'content scaling',readerTask:task},{apiKey:'k',model:'gemini-test',fetchImpl});
 assert.equal(out.status,'AI_DRAFT_REVIEW_REQUIRED');assert.equal(out.draft.sections[0].task_code,'task_templa');assert.equal(prompts.length,2);
 assert.match(prompts[1],/STRICT RETRY/);assert.match(prompts[1],/Pasta cooking basics/);assert.match(prompts[1],/task_code/);assert(!/SEO title/.test(prompts[1]),'no title requirement in task mode');
 // two failures: the generator's rejection is reported with section names, not swallowed
 const failing=async()=>reply(bad);const fail=await generateGrowthEditorDraft({sourceHtml:'<h1>Guide</h1><p>'+SOURCE.repeat(3)+'</p>',pageUrl:'https://s.example/g/',focusQuery:'content scaling',readerTask:task},{apiKey:'k',model:'gemini-test',fetchImpl:failing});
 assert.equal(fail.status,'AI_DRAFT_OFF_TOPIC_SECTION');assert.equal(fail.draft,null);assert.equal(fail.rejected_sections[0].h2,'Pasta cooking basics');
});
const page=(rows)=>'<html><body>'+rows.map(([h,t])=>'<h2>'+h+'</h2><p>'+t+'</p>').join('')+'</body></html>';
const F='The crew arrives, inspects the property and explains the findings to the owner before any work starts on the building. ';
const destHtml='<h1>Emergency roof repair</h1><h2>Our work</h2><p>'+F.repeat(4)+'</p>';
const cov=(a,b)=>analyzeReaderTaskCoverage({query:'emergency roof repair nj',serpIntent:'LOCAL_SERVICE',destination:{url:'https://own.example/e/',html:destHtml},
 competitors:[{url:'https://a.example/x',html:page(a)},{url:'https://b.example/y',html:page(b)}]});
test('two independent sites that each give a heading to the same concept share a task, even in short sections',()=>{
 const c=cov([['Emergency Tarping',F.repeat(2)+'A tarp is fitted over the damaged area quickly.'],['Our Service Area',F.repeat(3)]],[['How Roof Tarping Works',F.repeat(2)+'The tarp keeps rain out until repairs are scheduled.'],['Our Team',F.repeat(3)]]);
 const t=c.tasks.find(x=>x.match.key==='tarp');assert(t,JSON.stringify(c.tasks.map(x=>x.match.key)));assert.equal(t.independent_sources,2);assert.equal(t.destination.status,'NOT_OBSERVED');
});
test('when nothing is shared, DATA_BLOCKED says what each site offered, what was excluded and which concepts stood alone',()=>{
 const c=cov([['Emergency Tarping',F.repeat(2)+'A tarp is fitted over the damaged area quickly.'],['Our Service Area',F.repeat(3)]],[['Insurance Claims Help',F.repeat(3)],['Why Choose Us',F.repeat(3)]]);
 assert.equal(c.tasks.length,0);
 const d=decideGrowthEditorialAction({report:{url:'https://own.example/',growth_decision:{primary_next_action:{query:'emergency roof repair nj'},protection:{}}},destination:{target_url:'https://own.example/e/',status:'FULL_SECTION_COMPARISON_RESEARCH_ONLY'},coverage:c,
  serpIntent:{status:'SERP_INTENT_OBSERVED',intent:'LOCAL_SERVICE',agreeing_leads:3,organic_leads_considered:4,leads:[]},destinationIntent:{verdict:'COMPATIBLE'},attempts:[]});
 assert.equal(d.decision,'DATA_BLOCKED');assert.equal(d.blocker_code,'SHARED_COMPETITOR_REQUIREMENTS');
 const m=d.missing_evidence[0].detail;
 assert.match(m,/a\.example: 2 of 2 sections used/);assert.match(m,/b\.example: 1 of 2 sections used \(1 promotional excluded\)/);assert.match(m,/Concepts taught on only one site: .*tarp \(a\.example\)/);assert.match(m,/insura \(b\.example\)/);
 const md=buildOwnerHandoffPackage({report:{url:'https://own.example/',generated_at:'t'},decision:d,completion:{}}).markdown;assert.match(md,/Missing evidence/);assert.match(md,/Concepts taught on only one site/);
});
test('a promotional or topic-wide section never creates a shared task',()=>{
 const c=cov([['Why Choose Us',F.repeat(3)+' Our customers love us.'],['Our Pricing',F.repeat(3)]],[['Why Choose Us',F.repeat(3)+' Our customers love us.'],['Our Pricing',F.repeat(3)]]);
 assert.equal(c.tasks.length,0,JSON.stringify(c.tasks.map(t=>t.match.key)));
});
