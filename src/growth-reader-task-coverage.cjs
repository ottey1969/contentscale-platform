'use strict';
// Deterministic reader-task coverage for Growth decisions.
// It records which reader tasks several independent competitor articles teach and whether the
// COMPLETE captured destination body already teaches the same task. A lexicon match is an
// observation with quoted evidence, never proof of ranking, quality or SERP superiority.
// No external service, no AI, no GSC requirement.

const CLEAN=/<(script|style|nav|footer|noscript|template|svg|form|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const CTA=/\b(?:book a demo|register now|get a demo|request (?:a )?demo|contact sales|subscribe|sign up|free trial|our customers|related posts|recommended articles|share this|newsletter)\b/i;
const plain=x=>String(x||'').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|#160);/gi,' ').replace(/&amp;/gi,'&')
 .replace(/&(?:quot|#8220|#8221);/gi,'"').replace(/&(?:#39|#8217);/gi,"'").replace(/\s+/g,' ').trim();
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'').toLowerCase()}catch{return ''}};

// Each task has an ANCHOR (the defining concept) and supporting terms. A block teaches the task only
// when the anchor and at least one more distinct term are present.
const TASK_SETS={
 INFORMATIONAL_PROCESS:{
  audit_inventory:{label:'Audit and inventory existing content before producing more',
   anchor:/\baudits?\b|\binventor(?:y|ies)\b|content gaps?/,
   terms:[/\baudits?\b/,/\binventor(?:y|ies)\b/,/content gaps?/,/existing content|current content|every piece of content/,/stale|outdated|underperform/,/overlap|cannibali[sz]/,/spreadsheet|list of/]},
  repurposing_refresh:{label:'Reuse, refresh and repurpose content you already have',
   anchor:/repurpos|recycl|refresh|\breus(?:e|ing)\b/,
   terms:[/repurpos/,/recycl/,/refresh/,/\breus(?:e|ing)\b/,/update (?:your |existing |old )/,/evergreen/,/content blocks?|components?/]},
  planning_workflow:{label:'Plan a repeatable workflow, calendar and briefs',
   anchor:/workflow|calendar|agile|\bplanning\b|repeatable process|\bbriefs?\b/,
   terms:[/workflow/,/(?:editorial|content) calendar/,/\bplanning\b|\bplan\b/,/repeatable|systemati[sz]/,/\bsteps?\b|step \d/,/agile|sprint|iterat/,/\bbriefs?\b/,/roles?|responsibilit|approval/]},
  measurement_roi:{label:'Measure results with KPIs and ROI',
   anchor:/\bkpis?\b|\broi\b|return on invest|\bmetrics?\b|\bmeasur|conversions?|bounce|click.?through|\bctr\b/,
   terms:[/\bkpis?\b/,/\broi\b|return on invest/,/\bmetrics?\b/,/conversions?/,/bounce/,/click.?through|\bctr\b/,/\bmeasur/,/\btrack/,/performance (?:data|report|review)/]},
  quality_consistency:{label:'Keep quality and brand voice consistent as volume grows',
   anchor:/style guide|brand voice|tone of voice|fact.?check|guidelines?|consisten/,
   terms:[/style guide|brand voice|tone of voice/,/consisten/,/fact.?check/,/\bediting\b|\beditor(?:ial)?\b|\breview process/,/guidelines?/,/quality (?:control|check|standard|bar|signal)/]},
  tooling_automation:{label:'Choose tools and automation that fit the workflow',
   anchor:/\btools?\b|software|platform/,
   terms:[/\btools?\b|software|platform/,/automat/,/templates?/,/project management/,/\bcms\b|content management/]},
  audience_intent:{label:'Start from the audience and search intent',
   anchor:/personas?|\baudience|search intent|reader (?:task|question)/,
   terms:[/personas?/,/\baudience/,/customer (?:journey|need|question)|buyer journey/,/segment/,/search intent|reader (?:task|question)/]}
 },
 LOCAL_SERVICE:{
  cost_factors:{label:'Explain what drives the cost and how quotes are built',
   anchor:/\bcosts?\b|\bpric(?:e|es|ing)\b|estimate|\bquote/,
   terms:[/\bcosts?\b/,/\bpric(?:e|es|ing)\b/,/estimate|\bquote/,/per square|square (?:foot|feet)|\bsq\.? ?ft/,/materials?/,/labou?r/,/\bsize\b|\bpitch\b|access/]},
  inspection_process:{label:'Show the inspection and repair process step by step',
   anchor:/inspect|assessment|\bprocess\b|\bsteps?\b/,
   terms:[/inspect/,/assessment|evaluat/,/\bprocess\b/,/\bsteps?\b|step \d/,/timeline|how long|schedule/,/documentat|photos?/]},
  damage_signs:{label:'Help the reader recognise signs of damage or a leak',
   anchor:/\bsigns?\b|symptoms?|warning/,
   terms:[/\bsigns?\b/,/symptoms?|warning/,/\bleaks?\b/,/stains?|water damage/,/missing|cracked|curling|damaged/]},
  material_options:{label:'Compare repair or replacement material options',
   anchor:/shingles?|\bmetal\b|\bflat roof|\btpo\b|\bepdm\b|slate|\btile\b|materials?/,
   terms:[/shingles?/,/\bmetal\b/,/flat roof|\btpo\b|\bepdm\b/,/slate|\btile\b/,/materials?/,/lifespan|durab|life expectancy/]},
  warranty_permits:{label:'Explain warranty, licensing and permits',
   anchor:/warrant|licen[sc]|insur|permit|certif/,
   terms:[/warrant/,/licen[sc]/,/insur/,/permit/,/certif/,/code (?:requirement|compliance)/]},
  emergency_response:{label:'Say what to do right away in an emergency or storm',
   anchor:/emergenc|storm|\btarp|temporary/,
   terms:[/emergenc/,/storm/,/\btarp/,/temporary/,/same.?day|24.?hour|immediate/,/insurance claim/]}
 }
};
const STEMS=w=>String(w||'').toLowerCase().replace(/[^a-z]/g,'').replace(/(?:ing|ed|es|s|e)$/,'');
const GENERIC_ROOTS=new Set(['content','page','best','guide','service','services']);
function queryRoots(query){
 const all=[...new Set((String(query||'').toLowerCase().match(/[a-z]{4,}/g)||[]).map(STEMS).filter(x=>x.length>=3))];
 const distinct=all.filter(x=>!GENERIC_ROOTS.has(x));
 return {all,distinct:distinct.length?distinct:all};
}
function blocks(html){
 const safe=String(html||'').slice(0,250000).replace(CLEAN,' ');
 const out=[];let heading='';
 for(const m of safe.matchAll(/<(h[1-4]|p|li)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)){
  const tag=m[1].toLowerCase(),text=plain(m[2]);
  if(!text)continue;
  if(tag[0]==='h'){heading=text.slice(0,180);continue}
  if(text.split(/\s+/).length>=8&&!CTA.test(text))out.push({heading,text:text.slice(0,1400),tag});
 }
 return out;
}
function groupSections(list){
 const map=new Map();
 for(const b of list){
  const key=b.heading||'(introduction)';
  if(!map.has(key))map.set(key,{heading:key,texts:[]});
  map.get(key).texts.push(b.text);
 }
 return [...map.values()].map(s=>({heading:s.heading,text:s.texts.join(' '),words:s.texts.join(' ').split(/\s+/).filter(Boolean).length,paragraphs:s.texts}));
}
function taskHits(task,text){
 const lower=String(text||'').toLowerCase();
 if(!task.anchor.test(lower))return [];
 return task.terms.map((re,i)=>re.test(lower)?i:-1).filter(i=>i>=0);
}
const termNames=(task,idx)=>idx.map(i=>String(task.terms[i]).replace(/^\/|\/[a-z]*$/g,'').replace(/\\b/g,'').slice(0,40));

// ---------- SERP intent (from fresh organic leads, discussions excluded) ----------
const DISCUSSION=/(^|\.)(reddit\.com|quora\.com|stackexchange\.com|news\.ycombinator\.com)$/;
function classifyTitle(title,snippet=''){
 const t=(String(title||'')+' '+String(snippet||'')).toLowerCase();
 if(/\b(near me|contractors?|companies|company|installers?|repair services?|free estimate|emergency)\b|\bin [a-z]+,? (?:nj|ny|ca|tx|fl|pa)\b/.test(t))return 'LOCAL_SERVICE';
 if(/\b(best|top \d+|reviews?|vs\.?|versus|alternatives?|compared|pricing|plans?)\b/.test(t))return 'COMMERCIAL_COMPARISON';
 if(/\b(what is|what are|how to|how do|guide|tips|ways|steps|strateg(?:y|ies)|explained|everything you need|best practices|checklist|examples)\b|\b\d+ (?:tips|ways|steps|strategies|best practices)\b/.test(t))return 'INFORMATIONAL_GUIDE';
 return 'UNCLASSIFIED';
}
function inferSerpIntent({query='',leads=[]}={}){
 const usable=(Array.isArray(leads)?leads:[]).filter(l=>l&&l.url&&!DISCUSSION.test(host(l.url)));
 const votes={};const rows=usable.map(l=>{const c=classifyTitle(l.title,l.snippet);votes[c]=(votes[c]||0)+1;return {url:l.url,title:String(l.title||'').slice(0,140),class:c}});
 const ranked=Object.entries(votes).filter(([k])=>k!=='UNCLASSIFIED').sort((a,b)=>b[1]-a[1]);
 const [top,count]=ranked[0]||[null,0];
 const verified=usable.length>=3&&top&&count/usable.length>=0.6;
 return {status:verified?'SERP_INTENT_OBSERVED':'SERP_INTENT_NOT_ESTABLISHED',
  intent:verified?top:'MIXED_OR_INSUFFICIENT',query:String(query||''),
  organic_leads_considered:usable.length,agreeing_leads:count,leads:rows.slice(0,8),
  method:'TITLE_AND_SNIPPET_PATTERNS_ON_FRESH_ORGANIC_LEADS',
  scope:'One lookup; observed placement is not a tracked-page ranking.'};
}
// ---------- Destination page intent ----------
function classifyDestinationIntent({query='',title='',h1=[],url='',serpIntent='MIXED_OR_INSUFFICIENT'}={}){
 const head=[title,...(Array.isArray(h1)?h1:[h1])].map(plain).join(' | ').toLowerCase();
 const roots=queryRoots(query).distinct,headRoots=new Set((head.match(/[a-z]{4,}/g)||[]).map(STEMS));
 const overlap=roots.filter(r=>headRoots.has(r));
 let cls='UNCLASSIFIED';
 if(/\b(is now|alternative|alternatives|review|reviews|pricing|login|coupon|vs\.?|versus|compared?)\b/.test(head))cls='PRODUCT_OR_COMPARISON';
 else if(/\b(what is|what are|how to|guide|tips|ways|steps|explained|strateg(?:y|ies)|checklist)\b/.test(head))cls='INFORMATIONAL_GUIDE';
 else if(/\b(services?|near me|company|contractors?)\b/.test(head))cls='LOCAL_SERVICE';
 const compatible=serpIntent==='INFORMATIONAL_GUIDE'?cls==='INFORMATIONAL_GUIDE'
  :serpIntent==='LOCAL_SERVICE'?cls==='LOCAL_SERVICE'||cls==='INFORMATIONAL_GUIDE'
  :serpIntent==='COMMERCIAL_COMPARISON'?cls==='PRODUCT_OR_COMPARISON':false;
 const different=cls!=='UNCLASSIFIED'&&!compatible&&serpIntent!=='MIXED_OR_INSUFFICIENT';
 return {url,class:cls,query_root_overlap:overlap,
  verdict:different?'DIFFERENT':compatible&&overlap.length?'COMPATIBLE':'UNVERIFIED',
  basis:'TITLE_AND_H1_PATTERNS_NOT_FULL_BODY_PROOF',observed_head:head.slice(0,220)};
}

function chooseTaskSet(serpIntent){return serpIntent==='LOCAL_SERVICE'?'LOCAL_SERVICE':'INFORMATIONAL_PROCESS'}

function pickPlacement(destSections,taskCode,tasks){
 const task=tasks[taskCode];
 const scored=destSections.map((s,i)=>({i,s,h:taskHits(task,s.heading+' '+s.text).length})).filter(x=>x.h>0).sort((a,b)=>b.h-a.h);
 if(scored.length&&scored[0].h>=2)return {mode:'EXTEND_SECTION',section_heading:scored[0].s.heading,
  reason:'This existing section already touches the task ('+scored[0].h+' matching concepts); deepen it instead of adding a duplicate.'};
 const END=/\b(where to go next|next steps?|faq|frequently|conclusion|alternative|get started|try|cta|summary|sources?)\b/i;
 const body=destSections.filter(s=>s.words>=30&&!END.test(s.heading)&&s.heading!=='(introduction)');
 const anchor=body[body.length-1]||destSections.find(s=>s.words>=30)||destSections[0];
 return anchor?{mode:'ADD_AFTER_SECTION',section_heading:anchor.heading,
  reason:'No existing section teaches this task; add it after the last substantive body section and before any closing, FAQ or call-to-action block.'}:
  {mode:'ADD_AFTER_SECTION',section_heading:null,reason:'No substantive destination section was readable.'};
}

function analyzeReaderTaskCoverage({query='',serpIntent='INFORMATIONAL_GUIDE',destination={},competitors=[],sitePages=[]}={}){
 const setName=chooseTaskSet(serpIntent),tasks=TASK_SETS[setName];
 const destBlocks=blocks(destination.html),destSections=groupSections(destBlocks);
 const usable=(Array.isArray(competitors)?competitors:[]).filter(c=>c&&c.url&&c.html&&c.truncated!==true);
 const compInfo=usable.map(c=>({url:c.url,host:host(c.url),sections:groupSections(blocks(c.html)).filter(s=>s.words>=40)}));
 const result=[];
 for(const [code,task] of Object.entries(tasks)){
  const support=[];
  for(const c of compInfo){
   const hit=c.sections.map(s=>{const head=taskHits(task,s.heading),all=taskHits(task,s.heading+' '+s.text);
     return {s,head:head.length,all:all.length,idx:all}})
    .filter(x=>x.all>=3||(x.head>=1&&x.all>=2)).sort((a,b)=>b.all-a.all)[0];
   if(hit)support.push({url:c.url,host:c.host,heading:hit.s.heading,excerpt:hit.s.text.slice(0,420),concepts:termNames(task,hit.idx)});
  }
  const independent=new Set(support.map(x=>x.host)).size;
  const paragraphHits=destBlocks.map(b=>({b,idx:taskHits(task,b.text)})).filter(x=>x.idx.length>=2);
  const totalDistinct=new Set(destBlocks.flatMap(b=>taskHits(task,b.text))).size;
  const status=paragraphHits.length>=2||paragraphHits.some(x=>x.idx.length>=3)?'COVERED':
   paragraphHits.length===1||totalDistinct>=3?'PARTIAL':'NOT_OBSERVED';
  // Other same-site pages: a task already taught there is a link target, not a duplicate to write.
  const elsewhere=[];
  for(const p of Array.isArray(sitePages)?sitePages:[]){
   if(!p?.html||p.truncated===true||p.url===destination.url)continue;
   const pb=blocks(p.html).filter(b=>taskHits(task,b.text).length>=2);
   if(pb.length>=2)elsewhere.push({url:p.url,heading:pb[0].heading||null,excerpt:pb[0].text.slice(0,260)});
  }
  result.push({code,label:task.label,supported_by_competitors:independent>=2,independent_sources:independent,
   competitor_support:support,
   destination:{status,passages:paragraphHits.slice(0,2).map(x=>({heading:x.b.heading||null,text:x.b.text.slice(0,300),concepts:termNames(task,x.idx)}))},
   covered_elsewhere_on_site:elsewhere.slice(0,2),
   placement:status==='COVERED'?null:pickPlacement(destSections,code,tasks)});
 }
 const supported=result.filter(t=>t.supported_by_competitors);
 return {status:compInfo.length>=2?'READER_TASK_COVERAGE_OBSERVED':'INSUFFICIENT_READABLE_COMPETITORS',
  method:'ANCHORED_CONCEPT_GROUPS_ON_COMPLETE_CAPTURED_HTML_NOT_SEMANTIC_PROOF',
  task_set:setName,destination_url:destination.url||null,destination_truncated:destination.truncated===true,
  destination_sections:destSections.map(s=>({heading:s.heading,words:s.words})),
  competitors_considered:compInfo.map(c=>({url:c.url,host:c.host,sections:c.sections.length})),
  tasks:result,
  supported_task_codes:supported.map(t=>t.code),
  gap_task_codes:supported.filter(t=>t.destination.status!=='COVERED'&&!t.covered_elsewhere_on_site.length).map(t=>t.code),
  covered_task_codes:supported.filter(t=>t.destination.status==='COVERED').map(t=>t.code),
  linked_elsewhere_task_codes:supported.filter(t=>t.destination.status!=='COVERED'&&t.covered_elsewhere_on_site.length).map(t=>t.code),
  destination_section_headings:destSections.map(s=>s.heading)};
}
module.exports={analyzeReaderTaskCoverage,inferSerpIntent,classifyDestinationIntent,classifyTitle,blocks,groupSections,queryRoots,TASK_SETS,STEMS};
