'use strict';
// Design review of PR #221 (after report 56): one item per information need, priorities with their reasons, the page's
// own unique content to review, the basis of every concept shown, the target market set by the owner and research per market.
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

test('without AI: shared words are not proof; the items stay separate, marked as possibly overlapping, and only one is recommended',()=>{
 const g=list(fresh(),overview());
 const a=g.items.find(x=>x.title==='How to Track AI Engine Citations'),b=g.items.find(x=>/^How to Track AI Search Engine Citations/.test(x.title));
 assert(a&&b&&a!==b,'two items');
 assert.deepEqual([a.need.status,b.need.status],['SINGLE_SECTION','SINGLE_SECTION']);
 assert.equal(a.possible_overlap[0].id,b.id);assert.match(a.possible_overlap[0].reason,/not confirmed as the same need/);
 assert(!(a.recommended&&b.recommended));
 assert.equal(g.items.find(x=>x.title==='Why AI Citation Tracking Matters Now').possible_overlap,undefined,'search-term words alone never mark an overlap');
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

test('unique content: real sections of page 2294 no ranking page has are listed to review and preserve, not as proven strong',()=>{
 const g=list(fresh(),overview());
 const kept=g.unique_content.map(s=>s.heading);
 assert(g.unique_content.every(s=>s.uniqueness==='UNIQUE_BY_HEADING_WORDS'&&s.value==='NOT_ASSESSED'&&s.proven_strength==='NOT_MEASURED'));
 assert(g.unique_content.every(s=>/unique is not proof/i.test(s.note)));
 assert(kept.includes('Case Study: Local Service (NL Market)'),'its own case study');
 assert(!kept.some(h=>/Table of Contents|Frequently Asked|People Also Ask/i.test(h)),'navigation and FAQ blocks are not listed');
 assert(!kept.includes('⚙️ How AI Citation Trackers Actually Work'),'a section the ranking pages also have (beyond the search term) is not');
 assert(!g.items.some(x=>kept.includes(x.title)),'unique content is never a gap');
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

// Independent review of 382f31e: evidence kept whole, growth potential apart from research priority, a reproducible
// evidence record per writing run.
test('every source stays with its item: none is dropped from the stored list, however many there are',()=>{
 const report=fresh();
 // MODEL_ANSWER: the AI grouped ALL 16 real ranking-page headings of report 55 into one topic.
 const all=td.hosts.flatMap(h=>h.headings.map(x=>({host:h.host,heading:x,excerpt:''})));
 const g=list(report,overview({topics_status:'GROUPED',topics:[{topic:'Tracking AI citations',this_page:'NO',this_page_heading:null,ranking_pages:2,sections:all}],ungrouped_sections:[]}));
 const keys=g.items.flatMap(x=>x.examples).map(e=>e.site+'|'+e.heading);
 assert.deepEqual(all.map(x=>x.host+'|'+x.heading).filter(k=>!keys.includes(k)),[],'all 16 sections are in the list');
 assert(g.items.some(x=>x.examples.length>8),'more than eight sources on one item are kept, not counted away');
 assert(!g.items.some(x=>'more_examples' in x));
});

test('growth potential is separate from research priority: without Search Console it is "not measured", never low',()=>{
 const g=list(fresh(),overview());
 const it=g.items.find(x=>x.writable);
 assert.equal(it.growth_potential.search_demand.status,'NOT_MEASURED');
 assert.equal(it.growth_potential.business_fit,'YOUR_DECISION');
 assert.equal(g.recommendation_basis,'RESEARCH_PRIORITY_NOT_A_GROWTH_FORECAST');
 // LABELLED SYNTHETIC Search Console rows (report 55 has none): only page-verified rows sharing the item's own words count.
 const report={...fresh(),destination_gsc_queries:[{query:'how to manually search keywords in chatgpt',impressions:40,clicks:1},{query:'unrelated query',impressions:900,clicks:9}]};
 applyTaskMeaning(report.reader_task_coverage,{status:'JUDGE_NOT_CONFIGURED',verdicts:{}});
 const q=list(report,overview()).items.find(x=>x.id==='q-task_manual');
 assert.equal(q.growth_potential.search_demand.status,'GSC_QUERIES_OBSERVED');
 assert.equal(q.growth_potential.search_demand.impressions,40,'only the matching query, observed, not a forecast');
});

test('evidence record per writing run: research, market, date, page version, AI judgement and every source passage',async()=>{
 const {writeForSelection}=require('../src/growth-selected-writing.cjs');
 const report=fresh();applyTaskMeaning(report.reader_task_coverage,{status:'JUDGE_NOT_CONFIGURED',verdicts:{}});
 report.search_discovery={...report.search_discovery,target_query:'ai citation tracker',search_locale:{country:'NL',hl:'en',source:'SET_IN_TRACKER',confirmed:true},
  market_coverage:{status:'ALL_TARGET_MARKETS_RESEARCHED',markets:[{country:'NL',researched:true,provider:'BING_PUBLIC_RSS',usable_results:6}]}};
 const g=buildGapList({...report,competitor_overview:overview({this_page_fingerprint:'abc123'})});
 const item=g.items.find(x=>x.id==='q-task_manual');
 const out=await writeForSelection({items:[item],targetUrl:r55.url,focusQuery:'ai citation tracker',research:g.research,sourceFingerprint:g.source_fingerprint,
  generate:async ctx=>({status:'AI_DRAFT_REVIEW_REQUIRED',draft:{sections:[{task_code:ctx.reader_task.tasks[0].code,h2:'Check citations by hand',paragraphs:['A concept paragraph that the editor reviews and rewrites in their own words before anything is used.']}]}})});
 const d=out.dossier;
 assert.equal(d.version,1);assert.equal(d.research.focus_query,'ai citation tracker');assert.equal(d.research.researched_at,r55.generated_at);
 assert.deepEqual(d.research.market,{country:'NL',language:'en',source:'SET_IN_TRACKER',confirmed:true});
 assert.equal(d.research.market_coverage.status,'ALL_TARGET_MARKETS_RESEARCHED');assert.equal(d.research.page_fingerprint,'abc123');
 assert.equal(d.items[0].item_id,'q-task_manual');assert.match(d.items[0].ai_judgement,/not judged|Shared words/);
 assert.deepEqual(d.items[0].sources.map(s=>s.url),item.examples.map(e=>e.url));
 assert(d.items[0].sources.every(s=>s.passage&&s.passage.length>=75),'the real competitor passages of report 55');
});

// Code audit of 95e576c: an earlier selection is carried over only when the new research shows the same need.
test('carry-over checks identity: same id, title and section is ticked; partial agreement asks to confirm; other content needs remapping',()=>{
 const {remapSelection}=require('../src/growth-selected-writing.cjs');
 const g=list(fresh(),overview());
 const a=g.items.find(x=>x.title==='Understand the Attribution Gaps'),b=g.items.find(x=>x.title==='Extract AI-Relevant Queries');
 const c=g.items.find(x=>x.title==='Create a Custom AI Search Channel');
 const src=it=>it.examples.map(e=>e.site+'|'+e.heading.toLowerCase());
 const out=remapSelection([
  {id:a.id,title:a.title,sources:src(a)},                                  // same id, title and section: ticked
  {id:c.id,title:'An earlier title',sources:src(c)},                       // same item, title changed: confirm
  {id:b.id,title:'A different need',sources:src(a)},                       // id now names other content: remap to a
  {id:'s-gone',title:'A section no ranking page has any more',sources:['gone.example|x']}],g.items);
 assert.deepEqual(out.carried,[a.id]);
 assert.deepEqual(out.needs_confirmation.map(x=>[x.old_id,x.candidate.id]),[[c.id,c.id]]);assert.match(out.needs_confirmation[0].reason,/title changed/);
 assert.deepEqual(out.needs_remapping.map(x=>[x.old_id,x.candidates.map(k=>k.id)]),[[b.id,[a.id]]]);
 assert.deepEqual(out.no_longer_found.map(x=>x.old_id),['s-gone']);
});

