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
// ---------- SERP intent (from fresh organic leads, discussions excluded) ----------
const DISCUSSION=/(^|\.)(reddit\.com|quora\.com|stackexchange\.com|news\.ycombinator\.com)$/;
function classifyTitle(title,snippet=''){
 const raw=String(title||'')+' '+String(snippet||''),t=raw.toLowerCase();
 // Local service: an explicit local marker (near me, 'City, ST', ZIP) or a company/provider listing, never a state list.
 const cityState=/\b[A-Z][a-z]+(?: [A-Z][a-z]+)?,? (?:[A-Z]{2})\b(?! [a-z])/.test(raw)&&!/\b(?:AI|SEO|PDF|USA|FAQ|CEO|ROI|KPI|CMS|API)\b/.test(raw.match(/\b[A-Z][a-z]+(?: [A-Z][a-z]+)?,? [A-Z]{2}\b/)?.[0]||'');
 if(/\b(near me|nearby|free estimate|free quote|call now|serving|service area|open now|licensed and insured|same.?day service|emergency service)\b|\b\d{5}\b/.test(t)||cityState||/\b(contractors?|companies|company|providers?|installers?|specialists?)\b.{0,20}\b(in|near)\b/.test(t))return 'LOCAL_SERVICE';
 // A snippet often contains 'plans' or 'best' in passing; only the title decides comparison vs guide.
 const tt=String(title||'').toLowerCase();
 if(/\b(best|top \d+|reviews?|vs\.?|versus|alternatives?|compared|pricing|plans?)\b/.test(tt))return 'COMMERCIAL_COMPARISON';
 if(/\b(what is|what are|how to|how do|how much|how long|how many|guide|tips|ways|steps|strateg(?:y|ies)|explained|everything you need|best practices|checklist|examples)\b|\b\d+ (?:tips|ways|steps|strategies|best practices)\b/.test(tt))return 'INFORMATIONAL_GUIDE';
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
 const productish=/\b(is now|alternatives?|reviews?|login|coupon|vs\.?|versus|compared?)\b/.test(head)||(serpIntent!=='LOCAL_SERVICE'&&/\bpricing\b/.test(head));
 if(productish)cls='PRODUCT_OR_COMPARISON';
 else if(/\b(what is|what are|how to|guide|tips|ways|steps|explained|strateg(?:y|ies)|checklist)\b/.test(head))cls='INFORMATIONAL_GUIDE';
 else if(/\b(services?|near me|company|contractors?|serving)\b/.test(head)||classifyTitle(title)==='LOCAL_SERVICE')cls='LOCAL_SERVICE';
 const compatible=serpIntent==='INFORMATIONAL_GUIDE'?cls==='INFORMATIONAL_GUIDE'
  :serpIntent==='LOCAL_SERVICE'?(cls==='LOCAL_SERVICE'||cls==='INFORMATIONAL_GUIDE'||(cls==='UNCLASSIFIED'&&overlap.length>0))
  :serpIntent==='COMMERCIAL_COMPARISON'?cls==='PRODUCT_OR_COMPARISON':false;
 const different=cls!=='UNCLASSIFIED'&&!compatible&&serpIntent!=='MIXED_OR_INSUFFICIENT';
 return {url,class:cls,query_root_overlap:overlap,
  verdict:different?'DIFFERENT':compatible&&overlap.length?'COMPATIBLE':'UNVERIFIED',
  basis:'TITLE_AND_H1_PATTERNS_NOT_FULL_BODY_PROOF',observed_head:head.slice(0,220)};
}


const {deriveReaderTasks,destinationStatus,taskHitsInText,wordsOf}=require('./growth-derived-reader-tasks.cjs');
// Page furniture is never a placement anchor: navigation, closing reading lists, FAQ and calls to action.
const FURNITURE=/^(?:table of contents|contents|related(?: reading| posts| articles| content)?|further reading|read more|see also|sources?|references|faq|frequently asked|conclusion|summary|about(?: the author)?|share|comments?|newsletter|subscribe|contact|get started|book|want to|ready to|looking to|interested in)\b/i;
const headClean=h=>String(h||'').replace(/^[^\p{L}\p{N}]+/u,'').trim();
const isFurniture=s=>s.heading==='(introduction)'||s.words<30||FURNITURE.test(headClean(s.heading));
function pickPlacement(destSections,task,skip){
 const body=destSections.filter(s=>!isFurniture(s));
 // 1) the section already mentions the task's core concept: deepen it instead of adding a duplicate
 const touching=body.map(s=>({s,h:taskHitsInText(task,s.heading+' '+s.text,skip)})).filter(x=>x.h.key>=1).sort((a,b)=>b.h.key-a.h.key)[0];
 if(touching)return {mode:'EXTEND_SECTION',section_heading:touching.s.heading,
  reason:'This existing section already mentions the task’s core concept ('+touching.h.key+'×); deepen it instead of adding a duplicate.'};
 // 2) otherwise add it right after the existing section whose concepts are closest to what the competitors teach
 const taskRoots=new Set(wordsOf(task.support.map(x=>x.heading+' '+x.excerpt).join(' '),skip));
 const related=body.map(s=>({s,shared:[...new Set(wordsOf(s.heading+' '+s.text,skip))].filter(r=>taskRoots.has(r)&&r!==task.key)}))
  .filter(x=>x.shared.length>=3).sort((a,b)=>b.shared.length-a.shared.length)[0];
 if(related)return {mode:'ADD_AFTER_SECTION',section_heading:related.s.heading,
  reason:'Closest existing section by shared concepts ('+related.shared.slice(0,4).join(', ')+'); the new section continues that explanation.'};
 // 3) no related section: after the last instructional body section, never after closing or call-to-action blocks
 const instructional=[...body].reverse().find(s=>/^(?:how|steps?|guide)\b/i.test(headClean(s.heading)));
 const anchor=instructional||body[body.length-1];
 return anchor?{mode:'ADD_AFTER_SECTION',section_heading:anchor.heading,
  reason:instructional?'No section is closely related; placed after the last instructional section and before closing, reading-list or call-to-action blocks.':
   'No section is closely related; placed after the last substantive body section and before closing blocks.'}:
  {mode:'ADD_AFTER_SECTION',section_heading:null,reason:'No substantive destination section was readable.'};
}

function analyzeReaderTaskCoverage({query='',serpIntent='INFORMATIONAL_GUIDE',destination={},competitors=[],sitePages=[]}={}){
 const qr=queryRoots(query),skip=new Set(qr.all.map(x=>x.slice(0,6)));
 const destBlocks=blocks(destination.html),destSections=groupSections(destBlocks);
 // A competitor article is evidence of what it TEACHES (presence). A capture cut at the fetch limit still proves the
 // text captured before the cut; an element cut mid-way never closes and is never read. Truncation never proves ABSENCE.
 const received=Array.isArray(competitors)?competitors.filter(c=>c&&c.url):[];
 const usable=received.filter(c=>c.html);
 const compInfo=usable.map(c=>({url:c.url,host:host(c.url),partial:c.truncated===true,
  sections:groupSections(blocks(c.html)).filter(s=>s.words>=40)})).filter(c=>c.sections.length);
 const competitorDiagnostics={received:received.length,without_html:received.length-usable.length,
  with_no_readable_sections:usable.length-compInfo.length,used:compInfo.length,
  used_partial_capture:compInfo.filter(c=>c.partial).length,used_complete_capture:compInfo.filter(c=>!c.partial).length,
  distinct_hosts:new Set(compInfo.map(c=>c.host)).size};
 const derived=compInfo.length>=2?deriveReaderTasks({query,competitors:compInfo,queryRootSet:skip}):[];
 const result=[];
 for(const task of derived){
  const dest=destinationStatus(task,destBlocks,skip);
  const elsewhere=[];
  for(const p of Array.isArray(sitePages)?sitePages:[]){
   if(!p?.html||p.truncated===true||p.url===destination.url)continue;
   const st=destinationStatus(task,blocks(p.html),skip);
   if(st.status==='COVERED')elsewhere.push({url:p.url,heading:st.passages[0]?.heading||null,excerpt:st.passages[0]?.text.slice(0,260)||''});
  }
  result.push({code:task.code,label:task.label,match:{key:task.key,co_terms:task.co_terms,concepts:task.concepts},
   supported_by_competitors:new Set(task.support.map(x=>x.host)).size>=2,
   independent_sources:new Set(task.support.map(x=>x.host)).size,competitor_support:task.support,
   destination:dest,covered_elsewhere_on_site:elsewhere.slice(0,2),
   placement:dest.status==='COVERED'?null:pickPlacement(destSections,task,skip)});
 }
 const seenAnchor=new Map();
 for(const t of result){if(!t.placement)continue;const k=t.placement.mode+'|'+t.placement.section_heading;
  if(seenAnchor.has(k)){t.placement={...t.placement,reason:t.placement.reason+' Place it after the section proposed for “'+seenAnchor.get(k)+'”.'}}else seenAnchor.set(k,t.label)}
 const supported=result.filter(t=>t.supported_by_competitors);
 return {status:compInfo.length>=2&&new Set(compInfo.map(c=>c.host)).size>=2?'READER_TASK_COVERAGE_OBSERVED':'INSUFFICIENT_READABLE_COMPETITORS',
  method:'TASKS_DERIVED_FROM_SECTIONS_OF_2_PLUS_INDEPENDENT_COMPETITORS_NO_INDUSTRY_VOCABULARY_NOT_SEMANTIC_PROOF',
  task_set:'DERIVED_FROM_COMPETITOR_SECTIONS',serp_intent:serpIntent,
  destination_url:destination.url||null,destination_truncated:destination.truncated===true,
  destination_sections:destSections.map(s=>({heading:s.heading,words:s.words})),
  competitors_considered:compInfo.map(c=>({url:c.url,host:c.host,partial:c.partial,sections:c.sections.length})),
  competitor_diagnostics:competitorDiagnostics,
  unverifiable_site_pages:(Array.isArray(sitePages)?sitePages:[]).filter(p=>p&&p.url!==destination.url&&(p.truncated===true||!p.html)).map(p=>p.url),
  tasks:result,
  supported_task_codes:supported.map(t=>t.code),
  gap_task_codes:supported.filter(t=>t.destination.status!=='COVERED'&&!t.covered_elsewhere_on_site.length).map(t=>t.code),
  covered_task_codes:supported.filter(t=>t.destination.status==='COVERED').map(t=>t.code),
  linked_elsewhere_task_codes:supported.filter(t=>t.destination.status!=='COVERED'&&t.covered_elsewhere_on_site.length).map(t=>t.code),
  destination_section_headings:destSections.map(s=>s.heading)};
}

module.exports={analyzeReaderTaskCoverage,inferSerpIntent,classifyDestinationIntent,classifyTitle,blocks,groupSections,queryRoots,STEMS};
