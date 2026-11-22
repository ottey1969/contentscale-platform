'use strict';
// Owner 2026-11-19: Free Growth must be simple — enter the page, get a brief as complete as Pre-Write, and ONE list of
// what to put into the content, from most to least important. Every position in that list is explained by research
// signals that were actually observed (ranking pages, AI-cited pages, coverage on this page); nothing is estimated.
const test=require('node:test'),assert=require('node:assert/strict');
const {buildContentPriorities}=require('../src/growth-free/content-priorities.cjs');

const ex=(site,heading,excerpt)=>({site,url:'https://'+site+'/page',heading,excerpt});
const LONG=' explains what happens step by step, what the homeowner has to do and how long it usually takes on site.';
function summary(decision='IMPROVE_EXISTING'){
 return {decision,query:'24 hour emergency roof repair nj',gaps:{status:'OBSERVED',items:[
  {id:'t-tarp',group:'MISSING_TOPIC',writable:true,recommended:true,title:'Emergency tarping before the permanent repair',coverage:'MISSING',
   confidence:'AI_GROUPED',placement:{mode:'NEW_SECTION',section_heading:'What Happens After You Call'},
   priority:{sources:3,competitor_text_fragments:3,search_relevance:'SHARES_WORDS_WITH_SEARCH_TERM'},
   examples:[ex('a.example','Emergency tarping','Tarping'+LONG),ex('b.example','Temporary tarp','A tarp'+LONG),ex('c.example','Tarp first','First'+LONG)]},
  {id:'t-cost',group:'PARTIAL_TOPIC',writable:true,recommended:true,title:'What emergency roof repair costs',coverage:'PARTIAL',your_section:'What Does Emergency Roof Repair Cost in NJ?',
   confidence:'AI_GROUPED',placement:{mode:'EXTEND_SECTION',section_heading:'What Does Emergency Roof Repair Cost in NJ?'},
   priority:{sources:2,competitor_text_fragments:2,search_relevance:'SHARES_WORDS_WITH_SEARCH_TERM'},
   examples:[ex('a.example','Cost','The cost'+LONG),ex('d.example','Pricing','Pricing'+LONG)]},
  {id:'t-area',group:'MISSING_TOPIC',writable:true,recommended:false,title:'24/7 service across all 21 counties',coverage:'MISSING',
   confidence:'AI_GROUPED',priority:{sources:2,competitor_text_fragments:1,search_relevance:'SHARES_WORDS_WITH_SEARCH_TERM'},
   examples:[ex('b.example','Service area','We serve'+LONG),ex('e.example','Coverage','All counties')]},
  {id:'t-gutters',group:'MISSING_TOPIC',writable:true,recommended:false,title:'Gutter guards',coverage:'MISSING',
   confidence:'NOT_GROUPED',priority:{sources:1,competitor_text_fragments:0,search_relevance:'NO_WORD_IN_COMMON'},examples:[ex('f.example','Gutter guards','x')]},
  {id:'t-junk',group:'NOT_RELEVANT',writable:false,title:'Roofing guides',coverage:'MISSING',priority:{sources:2},examples:[]},
  {id:'e-faq',group:'PAGE_ELEMENT',writable:false,title:'FAQ section (FAQPage structured data)',coverage:'MISSING',priority:{sources:2},
   examples:[ex('a.example','FAQ',''),ex('c.example','FAQ','')]}
 ],unique_content:[{heading:'Choosing a 24 Hour Emergency Roof Repair NJ Contractor'}]}};
}
const aiGap={status:'READ',missing_topics:[
 {topic:'Emergency tarping and temporary protection',coverage:'MISSING',sites:['a.example','g.example'],examples:[{site:'g.example',heading:'Tarping',excerpt:'Tarp'+LONG}]},
 {topic:'Insurance claim documentation',coverage:'MISSING',sites:['g.example','h.example'],examples:[{site:'h.example',heading:'Insurance',excerpt:'Photos'+LONG}]}],
 missing_facts:[{key:'license',label:'License number',sites:['g.example','h.example'],example:{site:'g.example',excerpt:'NJ HIC #13VH0000'}}],
 pages:[{url:'https://g.example/page',site:'g.example',cited_by:['Perplexity','ChatGPT Search'],read:true},{url:'https://h.example/page',site:'h.example',cited_by:['Microsoft Copilot'],read:true}]};

test('one list, most to least important, every position explained by observed signals',()=>{
 const p=buildContentPriorities({summary:summary(),aiGap});
 assert.equal(p.status,'READY_FOR_EDITORIAL_REVIEW');assert.equal(p.publish_allowed,false);
 const titles=p.items.map(x=>x.title);
 assert.equal(titles[0],'Emergency tarping before the permanent repair','3 ranking pages + AI-cited pages + missing comes first');
 assert.ok(titles.indexOf('What emergency roof repair costs')<titles.indexOf('Gutter guards'));
 assert.ok(!titles.includes('Roofing guides'),'topics judged not relevant are left out');
 assert.deepEqual(p.items.map(x=>x.rank),p.items.map((_,i)=>i+1));
 for(let i=1;i<p.items.length;i++)assert.ok(p.items[i-1].score>=p.items[i].score,'sorted by score');
 const first=p.items[0];
 assert.equal(first.action,'ADD');assert.equal(first.tier,'MOST_IMPORTANT');
 assert.equal(first.signals.ranking_pages,3);assert.equal(first.signals.ai_cited_sites,2,'matched to the AI-cited topic on a.example and g.example');
 assert.deepEqual(first.signals.ai_systems,['Perplexity','ChatGPT Search']);
 assert.match(first.where,/What Happens After You Call/);
 assert.ok(first.why.length>=3&&first.why.every(w=>typeof w==='string'));
 assert.ok(first.evidence.length>=3&&first.evidence.every(e=>/^https:\/\//.test(e.url)));
});

test('a partly covered topic improves the existing section; AI-only topics and facts are listed too',()=>{
 const p=buildContentPriorities({summary:summary(),aiGap});
 const cost=p.items.find(x=>x.title==='What emergency roof repair costs');
 assert.equal(cost.action,'IMPROVE');assert.match(cost.where,/What Does Emergency Roof Repair Cost in NJ\?/);
 const ins=p.items.find(x=>x.title==='Insurance claim documentation');
 assert.ok(ins,'a topic only AI-cited pages cover is not lost');assert.equal(ins.signals.ranking_pages,0);assert.equal(ins.signals.ai_cited_sites,2);
 const lic=p.items.find(x=>x.kind==='FACT');
 assert.ok(lic&&lic.needs_business_fact===true,'a fact like a license number needs the owner’s own fact');
 const faq=p.items.find(x=>x.kind==='PAGE_ELEMENT');
 assert.equal(faq.action,'ADD_ELEMENT');
 assert.deepEqual(p.keep.map(x=>x.heading),['Choosing a 24 Hour Emergency Roof Repair NJ Contractor']);
});

test('business claims are never written as facts: they are marked for the owner to confirm',()=>{
 const p=buildContentPriorities({summary:summary(),aiGap});
 const area=p.items.find(x=>x.title==='24/7 service across all 21 counties');
 assert.equal(area.needs_business_fact,true);
 assert.match(area.instruction,/only if/i);
 assert.equal(p.items.find(x=>x.title==='What emergency roof repair costs').needs_business_fact,true,'a price needs real prices');
 assert.equal(p.items.find(x=>x.title==='Emergency tarping before the permanent repair').needs_business_fact,false);
});

test('a blocked research decision keeps the ordered list as research only, never as an instruction to publish',()=>{
 const p=buildContentPriorities({summary:summary('DATA_BLOCKED'),aiGap});
 assert.equal(p.status,'RESEARCH_ONLY');assert.equal(p.publish_allowed,false);
 assert.ok(p.items.length>0,'the observations stay available in order');
 assert.ok(p.items.every(x=>x.verified===false));
 const nothing=buildContentPriorities({summary:{decision:'IMPROVE_EXISTING',gaps:{status:'OBSERVED',items:[]}},aiGap:null});
 assert.equal(nothing.status,'NOTHING_FOUND');assert.deepEqual(nothing.items,[]);
});

test('deterministic: the same research always gives the same order',()=>{
 const a=buildContentPriorities({summary:summary(),aiGap}),b=buildContentPriorities({summary:summary(),aiGap});
 assert.deepEqual(a,b);
});

test('the result page shows the list first in the brief, in order, and the complete brief text starts with it',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const src=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
 const start=src.indexOf('var PRIO_TIER='),end=src.indexOf('function growthBriefHtml(s,d){');
 assert.ok(start>0&&end>start,'client functions present');
 const ctx={esc:t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')};
 vm.runInNewContext(src.slice(start,end),ctx);
 const cp=buildContentPriorities({summary:summary(),aiGap});
 const html=ctx.prioritiesHtml(cp);
 assert.match(html,/What to put in your content — most to least important/);
 const pos=cp.items.map(x=>html.indexOf('<strong>'+ctx.esc(x.title)+'</strong>'));
 assert.ok(pos.every(p=>p>0)&&pos.every((p,i)=>!i||p>pos[i-1]),'every item, in rank order');
 assert.match(html,/Needs your own confirmed fact\./);assert.match(html,/href="https:\/\/a\.example\/page"/);
 const text=ctx.prioritiesText(cp).join('\n');
 assert.match(text,/^## What to put in your content — most to least important/);
 assert.match(text,/1\. Emergency tarping before the permanent repair — Most important · Add a section · score 19/);
 // Wiring: the brief shows the list right under its head and the full export includes it first.
 // Owner 2026-11-20: the outcome in plain words heads the list; the copy/download buttons moved to the bottom of the result.
 // Owner 2026-11-20: one jump link to the downloadable brief may sit between the head and the list, nothing else.
 assert.match(src,/<p>'\+esc\(o\.line\)\+'<\/p><\/div>'\+\n  '<p class="growth-brief-jump">[^\n]*\n  prioritiesHtml\(d\.content_priorities\)\+/);
 assert.match(src,/if\(all&&d&&d\.content_priorities\)prioritiesText\(d\.content_priorities\)\.forEach/);
 assert.match(src,/content_priorities:row\.status==='DONE'\?buildContentPriorities\(\{summary:shown\.summary,aiGap:shown\.aiGap,report:row\.report,bestOwnPage:bestOwn\}\):null/);
 // Every visible label of the list has a Dutch and Spanish translation.
 const {ROWS}=require('../src/growth-free/ui-texts.cjs');
 for(const k of ['What to put in your content — most to least important','Most important','Important','Useful','Optional','Add a section','Improve an existing section',
  'Needs your own confirmed fact.','Why this position · score {n}','How the order is calculated','Do not copy the example pages.','Add a section that answers {q} in your own words.',cp.method])
  assert.ok(ROWS.some(r=>r[0]===k&&r[1]&&r[2]),'translated: '+k);
});

test('search intent also says what can go: sections no ranking or AI-cited page covers and that do not answer the search are marked to shorten or move, never deleted automatically',()=>{
 const report={competitor_overview:{status:'OBSERVED',query:'24 hour emergency roof repair nj',
  topics:[{topic:'Emergency tarping',this_page:'PARTLY',this_page_heading:'What Happens After You Call'},
          {topic:'Response time',this_page:'YES',this_page_heading:'How Fast Can You Get Emergency Roof Repair in NJ?'},
          {topic:'Gutter cleaning',this_page:'NO',this_page_heading:null}],
  this_page_sections:[
   {heading:'24 Hour Emergency Roof Repair NJ',words:120,furniture:false},
   {heading:'What Happens After You Call',words:180,furniture:false},
   {heading:'How Fast Can You Get Emergency Roof Repair in NJ?',words:150,furniture:false},
   {heading:'Our Story: Three Generations of Craftsmen',words:420,furniture:false},
   {heading:'Siding and Window Installation',words:260,furniture:false},
   {heading:'What Our Customers Say',words:200,furniture:false},
   {heading:'Contact Us Today',words:40,furniture:false},
   {heading:'Related Articles',words:90,furniture:true}]}};
 const p=buildContentPriorities({summary:summary(),aiGap,report});
 const heads=p.trim.map(x=>x.heading);
 assert.deepEqual(heads,['Our Story: Three Generations of Craftsmen','Siding and Window Installation'],'longest first; matched, intro, reviews, contact and furniture are never proposed');
 const t=p.trim[0];
 assert.equal(t.action,'SHORTEN_OR_MOVE');assert.equal(t.words,420);
 assert.match(t.reason,/No ranking page or AI-cited page covers this/);assert.match(t.reason,/shares no word with the search term/);
 assert.match(t.instruction,/Do not delete/i);
 // A topic AI-cited pages cover is not proposed for removal.
 const withAi=buildContentPriorities({summary:summary(),aiGap:{...aiGap,missing_topics:[...aiGap.missing_topics,
  {topic:'Siding and window installation after storms',coverage:'PARTLY',sites:['g.example'],examples:[]}]},report});
 assert.ok(!withAi.trim.some(x=>x.heading==='Siding and Window Installation'));
 assert.deepEqual(buildContentPriorities({summary:summary(),aiGap}).trim,[],'without the page comparison nothing is proposed');
});

test('report 67 (real, contentscale.site/content-scaling/): sections about content scaling are never proposed for trimming; the off-topic ones are',()=>{
 const r=require('./fixtures/growth-report-67/report.json').report;
 const {summarizeFreeGrowth}=require('../src/growth-free/summary.cjs');
 const p=buildContentPriorities({summary:summarizeFreeGrowth(r,{query:'content scaling'}),aiGap:null,report:r});
 const heads=p.trim.map(x=>x.heading);
 for(const h of heads)assert.doesNotMatch(h,/content scal/i,'shares the search term: '+h);
 assert.ok(!heads.includes('Want to Scale Content Without Losing Quality?'),'a call to action is never proposed');
 assert.ok(heads.includes('E-commerce Blog (Home Goods, US): 78% Traffic Recovery in 90 Days'));
 assert.deepEqual(p.items.slice(0,2).map(x=>x.title),['Definition of content scaling','Why content scaling matters and its benefits']);
});

test('PRT emergency roof repair (real, owner 2026-11-19): core process sections are never proposed for trimming',()=>{
 const f=require('./fixtures/free-growth-prt-emergency/check.json');
 const p=buildContentPriorities({summary:f.summary,aiGap:f.ai_gap,report:f.report});
 const heads=p.trim.map(x=>x.heading);
 for(const core of ['What Happens After You Call','1. The call and dispatch','2. Rapid assessment','5. Documentation for insurance',
  'Hail damage','Wind damage','Tree limb impact','Flashing failure','Waiting for the crew at night?','📑 In This Guide'])
  assert.ok(!heads.includes(core),'not proposed: '+core);
 assert.deepEqual(heads,[],'every section of this page relates to what ranking or AI-cited pages write about');
 // The one topic the AI-cited page covers that this page only partly covers stays in the list.
 assert.ok(p.items.some(x=>x.title==='Tracing leak entry points from the attic side'&&x.action==='IMPROVE'));
});

test('a table of contents is never advised to shorten, in Dutch and Spanish too (owner 2026-11-22: "In dit artikel")',()=>{
 const {buildContentPriorities}=require('../src/growth-free/content-priorities.cjs');
 const report={competitor_overview:{status:'OBSERVED',ranking_pages:[],topics:[],this_page_sections:[{heading:'Intro',words:40},
  {heading:'In dit artikel',words:17},{heading:'In deze gids',words:36},{heading:'Inhoudsopgave',words:20},{heading:'En este artículo',words:15},{heading:'Índice',words:12},{heading:'Pijler 1 — Entiteitsopbouw',words:33},{heading:'Contenido SEO y búsqueda con IA',words:40}]}};
 const cp=buildContentPriorities({summary:{query:'wat is een ai overview',decision:'IMPROVE_EXISTING',gaps:{items:[]}},aiGap:null,report});
 const h=cp.trim.map(t=>t.heading);
 for(const toc of ['In dit artikel','In deze gids','Inhoudsopgave','En este artículo','Índice'])assert.ok(!h.includes(toc),toc);
 assert.ok(h.includes('Pijler 1 — Entiteitsopbouw'),'other sections can still be advised');
 assert.ok(h.includes('Contenido SEO y búsqueda con IA'),'a heading that only contains the word "contenido" is not a table of contents');
});
