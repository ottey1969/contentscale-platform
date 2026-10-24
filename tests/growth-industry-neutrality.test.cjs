'use strict';
// Growth decision code must not depend on any industry, brand or client vocabulary.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {deriveReaderTasks,destinationStatus,draftTeachesTask}=require('../src/growth-derived-reader-tasks.cjs');
const {analyzeReaderTaskCoverage,inferSerpIntent,classifyDestinationIntent,classifyTitle,queryRoots}=require('../src/growth-reader-task-coverage.cjs');
const {differsFromQuery,navDiffersFromQuery}=require('../src/growth-intent-signals.cjs');
const FILES=['growth-derived-reader-tasks','growth-reader-task-coverage','growth-draft-claim-guard','growth-verified-opportunity','growth-owner-edit-decision','growth-owner-handoff-package','growth-editorial-decision-gate','growth-intent-signals','growth-full-section-comparison','growth-competitor-quality-gate','growth-public-search-discovery','growth-live-routes','growth-practical-brief','growth-autonomous-opportunity','growth-research-handoff-suggestions','growth-automatic-analysis','growth-one-action-decision','tracker-growth-cms-export','tracker-growth-automatic-routes'];
test('no brand, client, trade or content-marketing vocabulary in decision code (comments excluded)',()=>{
 const banned=/\b(brandwell|contentatscale|content at scale|perfect\s?roofing|perfectroofingteam|roofing|roofer|shingles?|tpo|epdm|content marketing|repurpos\w*|detector|plagiarism|lodi|moonachie)\b/i;
 for(const f of FILES){
  const code=fs.readFileSync(__dirname+'/../src/'+f+'.cjs','utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"\\])\/\/.*$/gm,'$1');
  code.split('\n').forEach((l,i)=>assert(!banned.test(l),f+':'+(i+1)+' contains industry/brand vocabulary: '+l.trim().slice(0,100)));
 }
});
test('Growth reads only SERPER_API_KEY and never serpapi.com',()=>{
 const src=fs.readFileSync(__dirname+'/../src/growth-public-search-discovery.cjs','utf8');
 assert(!/serpapi/i.test(src.replace(/\/\/.*$/gm,'')));assert(/process\.env\.SERPER_API_KEY(?!\|\|)/.test(src));
});
const page=(h,paras)=>'<html><body><h1>'+h+'</h1>'+paras.map(([hd,t])=>(hd?'<h2>'+hd+'</h2>':'')+'<p>'+t+'</p>').join('')+'</body></html>';
// SYNTHETIC pages for two unrelated industries; the same code must derive each industry's own tasks.
const dental=[
 {url:'https://dentist-one.example/whitening',html:page('Teeth whitening',[['Does whitening damage enamel?','Professional whitening uses a controlled peroxide gel, and the dentist checks enamel and gum health first. Whitening sensitivity is common for a few days, so the dentist may suggest a desensitising gel and a gentler whitening schedule for patients with thin enamel.'],['Aftercare for whitened teeth','After whitening, avoid dark drinks for two days because whitened enamel is porous. Aftercare also means brushing gently, using a desensitising toothpaste and keeping whitening touch ups to the schedule your dentist recommends.']])},
 {url:'https://dentist-two.example/guide',html:page('Whitening guide',[['Whitening sensitivity and enamel','Many patients notice whitening sensitivity because the gel passes through enamel. Your dentist can adjust the whitening strength, recommend desensitising products and plan shorter sessions so enamel and gums stay comfortable throughout the treatment, and any lasting sensitivity should be reported at the next visit so the whitening plan can be changed.'],['What to eat after whitening','Aftercare matters: dark drinks and acidic food can stain newly whitened teeth for the first days. Keep the aftercare simple, rinse with water, brush gently with a desensitising toothpaste and follow the touch up plan that you agreed with the clinic after the whitening session ended.']])}
];
const roofing=[
 {url:'https://roofer-a.example/repair',html:page('Roof repair',[['How a repair estimate is built','A repair estimate lists materials, labour and access. The estimate should explain how hidden decking damage changes the estimate, and a written estimate lets you compare quotes from different crews before you approve any work on the property, which is why each estimate should be itemised clearly.'],['Warning signs of roof damage','Look for stained ceilings, curling tiles and loose material in the gutters. Each warning sign should be photographed during the inspection so the crew can match the damage to the estimate, and the photos help you compare what each contractor says about the same damage on the same roof.']])},
 {url:'https://roofer-b.example/services',html:page('Repairs',[['What goes into an estimate','Ask the contractor for a written estimate that separates materials from labour. A clear estimate also states what happens if hidden damage appears, so the final invoice never surprises you after the old layer is removed from the roof, and an itemised estimate makes that comparison easy.'],['Signs you need a repair','Water stains, missing tiles and daylight in the attic are common warning signs of damage. Document each sign with a photo and bring the photos to the inspection and the estimate discussion, so that the contractor can point to the exact damage when explaining each line of the estimate to you.']])}
];
test('tasks are derived from competitor sections for any industry, without a vocabulary',()=>{
 for(const [name,query,comps,destText,expectKey] of [['dental','teeth whitening',dental,'Our clinic offers whitening treatments. Book a visit to learn more about the service.','enamel'],['roofing','roof repair',roofing,'We repair roofs. Contact us to book a visit and see our service list.','estima']]){
  const skip=new Set(queryRoots(query).all.map(x=>x.slice(0,6)));
  const cov=analyzeReaderTaskCoverage({query,serpIntent:name==='roofing'?'LOCAL_SERVICE':'INFORMATIONAL_GUIDE',destination:{url:'https://own.example/p/',html:page('Service',[['Our service',destText]])},competitors:comps});
  assert.equal(cov.task_set,'DERIVED_FROM_COMPETITOR_SECTIONS');
  assert(cov.tasks.length>=1,name+' tasks: '+JSON.stringify(cov.competitor_diagnostics));
  assert(cov.tasks.every(t=>t.independent_sources>=2),'every task is taught by two independent sites');
  assert(cov.tasks.some(t=>t.match.key.startsWith(expectKey)),name+' keys '+cov.tasks.map(t=>t.match.key));
  const t=cov.tasks.find(x=>x.match.key.startsWith(expectKey));
  assert.equal(t.destination.status,'NOT_OBSERVED');assert(t.placement.section_heading);
 }
});
test('a task already taught on the destination is reported as covered, not as a gap',()=>{
 const query='roof repair',skip=new Set(queryRoots(query).all.map(x=>x.slice(0,6)));
 const dest=page('Repairs',[['Your repair estimate','Every written estimate lists materials, labour and access. A good estimate also explains how hidden damage changes the estimate before work starts.'],['Estimate questions','Ask which line of the estimate covers disposal and whether the estimate expires, because a clear estimate prevents disputes later.']]);
 const cov=analyzeReaderTaskCoverage({query,serpIntent:'LOCAL_SERVICE',destination:{url:'https://own.example/p/',html:dest},competitors:roofing});
 const t=cov.tasks.find(x=>x.match.key.startsWith('estima'));
 assert.equal(t.destination.status,'COVERED');assert(!cov.gap_task_codes.includes(t.code));
});
test('local service intent is recognised without any state or trade list; pricing and cost words stay legitimate',()=>{
 for(const title of ['Roof Repair in Lodi, NJ | Acme','Emergency Plumber Near Me - Free Estimate','Dentist in Austin TX 78701','Electrician Near Me - Same Day Service','Boiler Repair Services in Reading, PA'])
  assert.equal(classifyTitle(title),'LOCAL_SERVICE',title);
 assert.equal(classifyTitle('What Is Invoice Automation?'),'INFORMATIONAL_GUIDE');assert.equal(classifyTitle('Best CRM Software vs Rivals'),'COMMERCIAL_COMPARISON');
 const leads=['Roof Repair in Paterson, NJ','Roof Repair Contractors in Bergen County NJ','Emergency Roof Repair Near Me','Roof repair cost and pricing guide'].map((title,i)=>({url:'https://s'+i+'.example/',title}));
 const serp=inferSerpIntent({query:'roof repair nj',leads});
 assert.equal(serp.status,'SERP_INTENT_OBSERVED');assert.equal(serp.intent,'LOCAL_SERVICE');
 const dest=classifyDestinationIntent({query:'roof repair',title:'Roof Repair Pricing and Services | Acme',h1:['Roof Repair'],url:'https://acme.example/roof-repair/',serpIntent:serp.intent});
 assert.equal(dest.verdict,'COMPATIBLE','a service page that mentions pricing is not a different intent for a local query');
 assert.deepEqual(navDiffersFromQuery('Roof repair cost and pricing reviews','roof repair'),[]);
 assert.deepEqual(differsFromQuery('Acme alternatives and pricing','acme').sort(),['alternatives','pricing']);
});
