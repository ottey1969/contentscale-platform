'use strict';
// Regressions from the PRT report (2) and the ContentScale report (4). Fixture text is verbatim; where a competitor body
// is needed (reports hold no bodies) the text is SYNTHETIC and mirrors the observed structure.
const test=require('node:test'),assert=require('node:assert/strict');
const fx=require('./fixtures/growth-reports-2-4.json');
const {analyzeReaderTaskCoverage,blocks,groupSections}=require('../src/growth-reader-task-coverage.cjs');
const {isPromotionalSection}=require('../src/growth-derived-reader-tasks.cjs');
const {assessGrowthCompetitorContent}=require('../src/growth-competitor-quality-gate.cjs');
const {assessDraftClaims}=require('../src/growth-draft-claim-guard.cjs');
const {assessSectionClaims}=require('../src/growth-owner-edit-decision.cjs');
const {produceVerifiedEditorialOpportunity}=require('../src/growth-verified-opportunity.cjs');
const {decodeEntities}=require('../src/growth-text.cjs');
const {generateGrowthEditorDraft}=require('../src/growth-source-grounded-editor.cjs');

test('real production heading "&#128218; Related Articles" is decoded and is never a placement anchor',()=>{
 const raw=fx.cs.destination_sections.map(s=>s.heading);
 assert(raw.some(h=>/Related Articles/.test(h)),'the production report contains the closing reading-list section');
 assert.equal(decodeEntities('&#128218; Related Articles'),'📚 Related Articles');assert.equal(decodeEntities('Google&rsquo;s &amp; &#x1F511; Guide'),'Google’s & 🔑 Guide');
 const html='<h1>t</h1>'+fx.cs.destination_sections.map(s=>'<h2>'+s.heading+'</h2><p>'+('Plain filler sentence about nothing in particular here. '.repeat(Math.ceil(Math.max(s.words,40)/9)))+'</p>').join('');
 const sections=groupSections(blocks(html));
 assert(sections.every(s=>!/&#\d+;/.test(s.heading)),'no numeric entity survives in any heading');
 const T='Standardise briefs with shared templates, and keep every template reviewed so writers reuse the templates instead of rewriting each brief. ';
 const comp=(u,h)=>({url:u,html:'<h2>'+h+'</h2><p>'+T.repeat(3)+'</p><h2>Other</h2><p>'+'Something unrelated about budgets and calendars and approvals here. '.repeat(5)+'</p><h2>More</h2><p>'+'Different filler about staffing and meetings and planning. '.repeat(5)+'</p>'});
 const cov=analyzeReaderTaskCoverage({query:'content scaling',serpIntent:'INFORMATIONAL_GUIDE',destination:{url:'https://x.example/p/',html},competitors:[comp('https://a.example/x','Standard templates'),comp('https://b.example/y','Why templates matter')]});
 const t=cov.tasks.find(x=>x.match.key.startsWith('templa'));assert(t,'templates task derived');
 assert(!/Related Articles|Table of Contents/.test(t.placement.section_heading),t.placement.section_heading);
});
test('vendor-promotional and client-story competitor sections are not reader tasks (real sections: "Stellar’s Templates", "Paris Mechanical")',()=>{
 assert.deepEqual(fx.cs.competitor_support.find(x=>x.task==='task_templa').hosts.map(h=>h[1]),['How to scale your content creation','Stellar’s Templates'],'documents the production defect');
 const vendor={heading:'Stellar’s Templates',text:'Stellar gives every writer a library. Stellar templates keep each brief consistent.'},story={heading:'Paris Mechanical',text:'Stellar helped Paris Mechanical rebuild its blog. Stellar editors worked weekly with the team.'};
 const how={heading:'Automation and AI Tools',text:'Content teams use automation to route approvals and reduce manual hand-offs between steps in the workflow.'};
 assert.equal(isPromotionalSection(vendor,'stellarcontent.com','aprimo talks about approvals'),true);assert.equal(isPromotionalSection(story,'stellarcontent.com','aprimo'),true);
 assert.equal(isPromotionalSection(how,'aprimo.com','stellar optimizely'),false);
 // a site name that is simply the topic word (shared by other competitors) is not a brand
 assert.equal(isPromotionalSection({heading:'Does whitening hurt enamel?',text:'The dentist checks enamel. The dentist explains sensitivity.'},'dentist-one.example','the dentist plans sessions'),false);
});
const verbatim=code=>fx.cs.rejections.flatMap(r=>r.claim_violations||[]).find(v=>v.code===code).sentence;
test('real ContentScale rejection: an instruction about automated checks is advice, a statement about what OUR tool does is not',()=>{
 const advice=verbatim('UNSUPPORTED_CAPABILITY_CLAIM');assert.match(advice,/^Integrate automated quality checks that scan/,'verbatim production sentence');
 const dest='The page describes a content workflow with briefs, drafts and reviews before publication.';
 const ok=assessDraftClaims({text:advice,destinationText:dest,query:'content scaling',brandLabel:'contentscale'});
 assert.equal(ok.ok,true,JSON.stringify(ok.violations));assert.equal(ok.claim_review[0].class,'GENERAL_ADVICE');
 for(const t of ['Our tracker shows which AI answers cite your page in real time.','The tool checks whether every draft cites a source.','Once a page passes review, automated citation tracking monitors how generative search platforms cite your passages.'])
  assert.equal(assessDraftClaims({text:t,destinationText:dest,query:'content scaling',brandLabel:'contentscale'}).ok,false,t);
});
test('real ContentScale rejection: "eliminates" and "prevents" are weakened and logged, and the result is still typed as an unverified statement',()=>{
 const sentence=verbatim('ABSOLUTE_CLAIM');assert.match(sentence,/eliminates guesswork/);
 const r=assessDraftClaims({text:sentence,destinationText:'The page lists a five step workflow.',query:'content scaling',brandLabel:'contentscale'});
 assert.equal(r.ok,true,JSON.stringify(r.violations));
 assert.match(r.safe_text,/reduces guesswork/);assert.match(r.safe_text,/helps prevent low-quality drafts/);assert(!/eliminates|prevents /.test(r.safe_text));
 assert.deepEqual(r.safe_rewrites[0].changes.map(c=>c.from+'→'+c.to),['eliminates→reduces','prevents→helps prevent']);
 assert.equal(r.claim_review[0].class,'GENERAL_STATEMENT_UNVERIFIED','weakening does not make it a verified fact; it is listed for the owner to fact-check');
});
test('verified_gap is false until a draft passes; gap_observed records the research finding (report 4 reported verified_gap:true with copy_ready:false)',()=>{
 assert.equal(fx.cs.verified_gap_in_production,true,'documents the contradiction');
 const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
 const task=code=>({code,label:'Competitors teach '+code,match:{key:code.slice(5),co_terms:[],concepts:[code.slice(5)]},supported_by_competitors:true,independent_sources:2,
  competitor_support:[{url:'https://a.example/'+code,heading:code,excerpt:'e'},{url:'https://b.example/'+code,heading:code,excerpt:'e'}],destination:{status:'NOT_OBSERVED',passages:[]},covered_elsewhere_on_site:[],placement:{mode:'ADD_AFTER_SECTION',section_heading:'How to Start',reason:'r'}});
 const args={report:{url:'https://s.example/',growth_decision:{protection:{},primary_next_action:{query:'content scaling'}}},destination:{target_url:'https://s.example/g/',status:'FULL_SECTION_COMPARISON_RESEARCH_ONLY'},
  coverage:{competitors_considered:[{url:'a'},{url:'b'}],destination_truncated:false,tasks:[task('task_alpha')],destination_section_headings:[]},
  serpIntent:{status:'SERP_INTENT_OBSERVED',intent:'INFORMATIONAL_GUIDE',agreeing_leads:3,organic_leads_considered:4,leads:[]},destinationIntent:{verdict:'COMPATIBLE'},attempts:[]};
 const planned=decideGrowthEditorialAction(args);assert.equal(planned.verified_gap,false);assert.equal(planned.gap_observed,true);assert.equal(planned.copy_ready,false);
 const done=decideGrowthEditorialAction({...args,report:{...args.report,verified_editorial_opportunity:{verified:true,type:'IMPROVE_EXISTING',focus_query:'content scaling',target_url:'https://s.example/g/',target_section:'How to Start',task_codes:['task_alpha'],proposed_text:'x'.repeat(90),evidence:[{type:'COMPETITOR',source_url:'https://a.example/task_alpha',heading:'h',excerpt:'q'}]}}});
 assert.equal(done.verified_gap,true);assert.equal(done.copy_ready,true);
});
test('a section labelled with its task_code is judged against THAT task only; a mislabelled section is rejected, not matched to another task',()=>{
 const tk=(code,key,concepts)=>({code,label:code,match:{key,co_terms:[],concepts},placement:{mode:'ADD_AFTER_SECTION',section_heading:'How to Start',reason:'r'},competitor_evidence:[{url:'https://a.example/'+code,heading:code,excerpt:'e'}],destination_evidence:[]});
 const plan={target_url:'https://s.example/g/',tasks:[tk('task_templa','templa',['templa','brief','consis']),tk('task_review','review',['review','approv','sign'])]};
 const report={editorial_decision_gate:{decision:'IMPROVE_EXISTING',focus_query:'content scaling',target_url:'https://s.example/g/',improvement_plan:plan},reader_task_coverage:{}};
 const teaches=(code)=>({task_code:code,h2:'Use shared templates for every brief',paragraphs:['Create one shared template for every brief so writers start from the same structure, and keep each template consistent with the style guide your editors already use.']});
 const good=produceVerifiedEditorialOpportunity({report,completion:{target_url:'https://s.example/g/',draft:{sections:[teaches('task_templa')]}},sources:{destinationHtml:'<p>Short page about the subject for readers who want to learn more here.</p>',competitorHtml:[]}});
 assert.equal(good.opportunity.verified,true);assert.deepEqual(good.opportunity.task_codes,['task_templa']);
 const mislabelled=produceVerifiedEditorialOpportunity({report,completion:{target_url:'https://s.example/g/',draft:{sections:[teaches('task_review')]}},sources:{destinationHtml:'',competitorHtml:[]}});
 assert.equal(mislabelled.opportunity,null);assert(mislabelled.rejections.every(r=>r.task==='task_review'),'only the labelled task was tried');
});
test('business claims about availability, coverage or credentials must be confirmed by the business; unsourced ones are rejected',()=>{
 const dest='Our crew provides 24/7 emergency dispatch and covers all 21 counties across the state.';
 const ok=assessDraftClaims({text:'In practice we provide 24/7 emergency dispatch to homeowners, landlords and property managers, and we cover all 21 counties.',destinationText:dest,query:'emergency roof repair nj',brandLabel:'perfectroofingteam'});
 assert.equal(ok.ok,true,JSON.stringify(ok.violations));assert.equal(ok.claim_review[0].confirm_with_owner,true);
 const bad=assessDraftClaims({text:'We provide 24/7 emergency dispatch and cover all 25 counties across the state.',destinationText:dest,query:'emergency roof repair nj',brandLabel:'perfectroofingteam'});
 assert.equal(bad.ok,false);assert(bad.violations.some(v=>v.code==='UNSOURCED_NUMBER'));
 const {produceVerifiedEditorialOpportunity:produce}=require('../src/growth-verified-opportunity.cjs');
 const tk={code:'task_dispat',label:'t',match:{key:'dispat',co_terms:[],concepts:['dispat','emergenc']},placement:{mode:'ADD_AFTER_SECTION',section_heading:'x',reason:'r'},competitor_evidence:[{url:'https://a.example/x',heading:'h',excerpt:'e'}],destination_evidence:[]};
 const res=produce({report:{editorial_decision_gate:{decision:'IMPROVE_EXISTING',focus_query:'emergency roof repair nj',target_url:'https://p.example/e/',improvement_plan:{target_url:'https://p.example/e/',tasks:[tk]}},reader_task_coverage:{}},
  completion:{target_url:'https://p.example/e/',draft:{sections:[{task_code:'task_dispat',h2:'How emergency dispatch works',paragraphs:['Emergency dispatch starts with a phone call that describes the damage and the address. In practice we provide 24/7 emergency dispatch to homeowners, landlords and property managers, and we cover all 21 counties.']}]}},sources:{destinationHtml:'<p>'+dest+'</p>',competitorHtml:[],brandLabel:'perfectroofingteam'}});
 assert.equal(res.opportunity.verified,true);assert(res.opportunity.claim_review.needs_owner_confirmation.length>=1);
 assert(res.opportunity.claim_review.requirements.some(x=>/confirm each with the business/.test(x)));
});
test('one definition of "readable competitor": pages without h2/h3, JS shells and off-topic pages get a named reason',()=>{
 const body=t=>'<p>'+t.repeat(4)+'</p>';
 const flat='<html><head><title>Emergency roof repair in Bergen County NJ</title></head><body><h1>Emergency roof repair</h1>'+body('A crew should tarp the damaged area first and photograph the damage before any repair begins on the property. ')+'</body></html>';
 assert.equal(assessGrowthCompetitorContent({html:flat,query:'emergency roof repair nj'}).eligible,true,'a landing page without sub-headings is readable');
 const shell='<html><body><div id="app"></div>'+'<script>window.__x=1;</script>'.repeat(900)+'</body></html>';
 assert.equal(assessGrowthCompetitorContent({html:shell,query:'emergency roof repair nj'}).reason_code,'JS_RENDERED_PAGE_NO_STATIC_TEXT');
 const off='<html><head><title>Cooking pasta</title></head><body><h1>Cooking pasta</h1>'+body('Boil water, add salt and stir the pasta until it is tender and ready to serve with sauce. ')+'</body></html>';
 assert.equal(assessGrowthCompetitorContent({html:off,query:'emergency roof repair nj'}).reason_code,'NO_QUERY_TERM_IN_READABLE_TEXT');
 assert.equal(assessGrowthCompetitorContent({html:'<p>Hello</p>',query:'x'}).reason_code,'NO_PARAGRAPH_TEXT');
});
test('the draft prompt asks for one section per task with task_code, core words, and reader advice instead of product claims',async()=>{
 let prompt='';
 const fetchImpl=async(url,opts)=>{prompt=JSON.parse(opts.body).contents[0].parts[0].text;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"sections":[]}'}]}}]})}};
 await generateGrowthEditorDraft({sourceHtml:'<h1>Guide</h1><p>'+'This page explains how a team plans content and reviews drafts before publication. '.repeat(4)+'</p>',pageUrl:'https://s.example/g/',focusQuery:'content scaling',
  readerTask:{mode:'SECTION_IMPROVEMENT',tasks:[{code:'task_templa',label:'Competitors teach “Standard templates”',core_words:['templates','brief'],placement_mode:'ADD_AFTER_SECTION',placement_heading:'How to Start'}],existing_headings:['How to Start']}},{apiKey:'k',model:'gemini-test-model',fetchImpl});
 assert.match(prompt,/exactly ONE H2 section per task/);assert.match(prompt,/task_code/);assert.match(prompt,/"core_words":\["templates","brief"\]/);
 assert.match(prompt,/never state what any tool, tracker or software does/);assert.match(prompt,/eliminates, prevents, ensures/);
});
test('report 2 evidence: the production run tried 6 pages and reported only aggregate codes (403, timeout, 3x not readable)',()=>{
 assert.equal(fx.prt.summary.competitors_live_reviewed,1);assert(fx.prt.warnings.includes('COMPETITOR_LIVE_HTTP_403')&&fx.prt.warnings.includes('COMPETITOR_LIVE_FETCH_TIMEOUT'));
 assert.equal(fx.prt.warnings.filter(x=>/INSUFFICIENT_READABLE/.test(x)).length,3);assert.equal(fx.prt.serp_leads.length,7);assert.equal(fx.prt.decision,'DATA_BLOCKED');
});
