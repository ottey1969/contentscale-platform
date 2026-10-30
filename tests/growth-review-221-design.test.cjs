'use strict';
// Design review of PR #221 (after report 56): one item per information need, priorities with their reasons, the page's
// own strengths kept, the basis of every concept shown, the target market set by the owner and research per market.
// Real data: the research of production report 55 (HubSpot and Otterly vs page 2294: real headings, real reader tasks,
// real page sections). LABELLED SYNTHETIC: the market tests use minimal hand-written HTML and empty search responses
// (report 56's page HTML was not available); the AI topic answer is a hand-written MODEL_ANSWER that tests merging,
// not the model's judgement.
const test=require('node:test'),assert=require('node:assert/strict');
const {buildGapList}=require('../src/growth-gap-list.cjs');
const {applyTaskMeaning}=require('../src/growth-task-meaning.cjs');
const {reviewWritten}=require('../src/growth-selected-writing.cjs');
const {isFurnitureHeading}=require('../src/growth-derived-reader-tasks.cjs');
const {deriveSearchLocale,validCountries}=require('../src/growth-search-locale.cjs');
const {discoverGrowthCompetitorsWithFallback}=require('../src/growth-public-search-discovery.cjs');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const r55=require('./fixtures/growth-report-55/research.json');
const td=r55.reader_task_coverage.task_derivation;
const fresh=()=>JSON.parse(JSON.stringify(r55));
const overview=(extra={})=>({status:'OBSERVED',ranking_pages_read:2,topics_status:'NOT_GROUPED_NO_MODEL',topics:null,
 ungrouped_sections:td.hosts.flatMap(h=>h.headings.map(x=>({host:h.host,url:'https://'+h.host+'/',heading:x,excerpt:''}))),
 ranking_pages:td.hosts.map(h=>({url:'https://'+h.host+'/',content_headings:h.headings})),
 this_page_sections:r55.reader_task_coverage.destination_sections.map(s=>({heading:s.heading,excerpt:'',words:s.words,furniture:isFurnitureHeading(s.heading)})),
 elements_they_have_and_this_page_lacks:[],structured_data_they_have_and_this_page_lacks:[],length:{},...extra});
const list=(report,ov)=>buildGapList({...report,competitor_overview:ov,search_discovery:{...report.search_discovery,target_query:'ai citation tracker'}});

test('one item per need: an AI topic that shares a section with a question is merged into it, with every fragment kept',()=>{
 const report=fresh();applyTaskMeaning(report.reader_task_coverage,{status:'JUDGE_NOT_CONFIGURED',verdicts:{}});
 const manual=report.reader_task_coverage.tasks.find(t=>t.code==='task_manual');
 const shared=manual.competitor_support[0];
 // MODEL_ANSWER: the AI put one of the question's sections in a topic together with another real heading.
 const other=td.hosts.flatMap(h=>h.headings.map(x=>({host:h.host,heading:x}))).find(x=>!manual.competitor_support.some(s=>s.heading===x.heading));
 const ov=overview({topics_status:'GROUPED',topics:[{topic:'Checking AI citations by hand',this_page:'NO',this_page_heading:null,ranking_pages:2,
  sections:[{host:shared.host,heading:shared.heading,excerpt:shared.excerpt},{host:other.host,heading:other.heading,excerpt:''}]}],
  ungrouped_sections:[]});
 const g=list(report,ov);
 assert.equal(g.items.filter(x=>x.group==='MISSING_TOPIC').length,0,'not listed as a second item');
 const q=g.items.find(x=>x.id==='q-task_manual');
 assert(q.examples.some(e=>e.heading===other.heading),'the topic\'s other section is evidence under the question');
 assert.match(q.merged.join(' '),/AI topic “Checking AI citations by hand”/);
});

test('without AI: sections with the same words beyond the search term become one item; the search term alone never joins',()=>{
 const g=list(fresh(),overview());
 const track=g.items.find(x=>x.examples.some(e=>e.heading==='How to Track AI Engine Citations'));
 assert.deepEqual(track.examples.map(e=>e.site).sort(),['blog.hubspot.com','otterly.ai']);
 assert.equal(track.priority.sources,2);
 assert.equal(g.items.find(x=>x.title==='Why AI Citation Tracking Matters Now').examples.length,1);
 const keys=g.items.flatMap(x=>x.examples||[]).map(e=>e.site+'|'+e.heading);
 assert.equal(new Set(keys).size,keys.length,'every competitor section once');
});

test('priorities: each item says why and what to do; at most four recommended, never one the AI contradicts',()=>{
 const report=fresh();
 applyTaskMeaning(report.reader_task_coverage,{status:'JUDGED',verdicts:{task_priori:{same_question:false,reason:'different questions'}}});
 const g=list(report,overview());
 const writable=g.items.filter(x=>x.writable);
 assert(writable.every(x=>x.priority&&x.priority.why.length>=3&&x.priority.suggested_action),'reasons and an action for every item');
 const rec=g.items.filter(x=>x.recommended);
 assert(rec.length>=1&&rec.length<=4);
 assert(rec.every(x=>x.priority.sources>=2&&x.coverage!=='NOT_COMPARED'));
 assert.equal(g.items.find(x=>x.id==='q-task_priori').recommended,undefined,'"different questions" stays choosable, not recommended');
 assert.deepEqual(g.recommended,rec.map(x=>x.id));
 assert(!writable.some(x=>'rank' in x.priority),'no score is shown');
 // Partly on the page with a known section: extend that section.
 const partial=writable.find(x=>x.coverage==='PARTIAL'&&x.your_section);
 if(partial)assert.match(partial.priority.suggested_action,/^Extend your section/);
});

test('the page\'s own strengths: real sections of page 2294 no ranking page has are listed to keep, furniture is not',()=>{
 const g=list(fresh(),overview());
 const kept=g.strengths.map(s=>s.heading);
 assert(kept.includes('Case Study: Local Service (NL Market)'),'its own case study');
 assert(!kept.some(h=>/Table of Contents|Frequently Asked|People Also Ask/i.test(h)),'navigation and FAQ blocks are not strengths');
 assert(!kept.includes('⚙️ How AI Citation Trackers Actually Work'),'a section the ranking pages also have (beyond the search term) is not');
 assert(!g.items.some(x=>kept.includes(x.title)),'a strength is never a gap');
});

test('every concept shows its basis; competitor headings only = a marked concept with a fact-check note',()=>{
 const heading={id:'s-1',title:'Look for parameters in URLs.',writable:true,examples:[{site:'blog.hubspot.com',url:'https://blog.hubspot.com/',heading:'Look for parameters in URLs.',excerpt:''}]};
 const report=fresh();applyTaskMeaning(report.reader_task_coverage,{status:'JUDGE_NOT_CONFIGURED',verdicts:{}});
 const q=list(report,overview()).items.find(x=>x.id==='q-task_manual');
 const request={items:[heading,q],codeOf:new Map([['task_sel0',heading],['task_sel1',q]])};
 const para='A concept paragraph that the editor reviews and rewrites in their own words before anything is used.';
 const out=reviewWritten({draft:{sections:[{task_code:'task_sel0',h2:'Look for parameters in URLs',paragraphs:[para]},{task_code:'task_sel1',h2:'Check citations by hand',paragraphs:[para]}]}},request,{});
 const [a,b]=out.sections;
 assert.equal(a.status,'MARKED_NO_SOURCE_TEXT');assert.equal(a.basis.evidence_level,'COMPETITOR_HEADINGS_ONLY');
 assert.match(a.needs_fact_check[0],/whole section/);
 assert.equal(b.basis.evidence_level,'COMPETITOR_TEXT','report 55 has real competitor text for this question');
 assert(b.basis.competitor_evidence.length>=2&&b.basis.why_in_list.length>=3);
 assert.equal(b.basis.warning,undefined);
});

test('markets: real country domains (.it, .in) count, Google\'s generic ones (.io, .co) do not',()=>{
 assert.equal(deriveSearchLocale({html:'<h1>x</h1>',url:'https://example.it/'}).country,'IT');
 assert.equal(deriveSearchLocale({html:'<h1>x</h1>',url:'https://example.in/'}).country,'IN');
 assert.equal(deriveSearchLocale({html:'<h1>x</h1>',url:'https://example.io/'}).country,null);
 assert.equal(deriveSearchLocale({html:'<h1>x</h1>',url:'https://example.co/'}).country,null);
});

const international='<html lang="en"><title>International SEO for the Netherlands, the UK, Belgium and Luxembourg</title><h2>SEO in the Netherlands</h2><h2>SEO in the UK</h2></html>';
test('markets: headings are evidence, the owner\'s Tracker setting decides; a derived order is marked unconfirmed',()=>{
 const derived=deriveSearchLocale({html:international,url:'https://contentscale.site/international-seo'});
 assert.deepEqual([derived.confirmed,derived.priority_confirmed],[false,false]);
 const set=deriveSearchLocale({html:international,url:'https://contentscale.site/international-seo',configured:{countries:['gb','NL','be','lu'],language:'en'}});
 assert.deepEqual([set.country,set.other_countries,set.source,set.confirmed],['GB',['NL','BE','LU'],'SET_IN_TRACKER',true]);
 assert.deepEqual(set.suggested,['NL','GB','BE','LU'],'what the page suggests stays visible');
 assert.deepEqual(validCountries(['UK','nl','XX','EU','nl']),['GB','NL']);
});

test('research per market whichever source answers: free Bing results cover two markets, the rest is reported as not researched',async()=>{
 const asked=[];let paid=0;
 const fetchFree=async({locale})=>{asked.push(locale.country);return {status:'FRESH_PUBLIC_SEARCH_LEADS',source:'BING_PUBLIC_RSS',
  leads:[{url:'https://'+locale.country.toLowerCase()+'-a.example/x',title:'t'},{url:'https://'+locale.country.toLowerCase()+'-b.example/x',title:'t'}]}};
 const locale=deriveSearchLocale({html:international,url:'https://contentscale.site/international-seo'});
 const r=await discoverGrowthCompetitorsWithFallback({query:'international seo',ownUrl:'https://contentscale.site/international-seo',locale,fetchFree,fetchGoogle:async()=>{paid++;return {leads:[]}}});
 assert.deepEqual(asked,['NL','GB']);assert.equal(paid,0,'no paid call when the free source answered');
 assert.deepEqual(r.leads.map(l=>l.search_market),['NL','GB','NL','GB'],'both markets reach the pages that are read');
 assert.equal(r.market_coverage.status,'PARTIAL_MARKET_RESEARCH');
 assert.deepEqual(r.market_coverage.markets.map(m=>[m.country,m.researched]),[['NL',true],['GB',true],['BE',false],['LU',false]]);
 assert.match(r.market_coverage.note,/Not researched: Belgium, Luxembourg\. This is partial market research\./);
 assert.equal(r.market_coverage.confirmed,false);
});

test('the market setting route: owner only, two-letter codes, and the next research uses it',async()=>{
 const route={},saved=[];
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){route[p]=h}},{query:async()=>({rows:[]})},(req,res,next)=>{
  req.growthTrackerClientId=4;req.growth={can_edit:req.query.owner==='1',pages:[{id:2324,url:'https://contentscale.site/international-seo',case_study_active:false}]};next()},
  {savePageMarkets:async a=>{saved.push(a);return {countries:validCountries(a.countries),language:null}}});
 const post=async(body,owner='1')=>{const req={params:{token:'t'},query:{page_id:'2324',owner},body},
  res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},json(x){this.body=x;return this}};
  const stack=route['/api/tracker-client/:token/growth/markets'];
  await new Promise(ok=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()})};at(0)});return res};
 assert.equal((await post({countries:'NL, UK'},'0')).statusCode,403);
 assert.equal((await post({countries:'Netherlands'})).body.code,'USE_TWO_LETTER_COUNTRY_CODES');
 const ok=await post({countries:'NL, UK, BE, LU'});
 assert.equal(ok.statusCode,200);assert.deepEqual(ok.body.markets.countries,['NL','GB','BE','LU']);assert.equal(ok.body.research_rerun_required,true);
 assert.deepEqual(saved.at(-1).countries,['NL','GB','BE','LU']);
});
