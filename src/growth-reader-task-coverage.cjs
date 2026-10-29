'use strict';
// Deterministic reader-task coverage for Growth decisions.
// It records which reader tasks several independent competitor articles teach and whether the
// COMPLETE captured destination body already teaches the same task. A lexicon match is an
// observation with quoted evidence, never proof of ranking, quality or SERP superiority.
// No external service, no AI, no GSC requirement.

const CLEAN=/<(script|style|nav|footer|noscript|template|svg|form|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const CTA=/\b(?:book a demo|register now|get a demo|request (?:a )?demo|contact sales|subscribe|sign up|free trial|our customers|related posts|recommended articles|share this|newsletter)\b/i;
const {decodeEntities}=require('./growth-text.cjs');
const {RESEARCH_HTML_LIMIT}=require('./growth-public-html-reader.cjs');
const {statesIn}=require('./growth-serp-quality.cjs');
const {sameWord}=require('./growth-word-match.cjs');
const plain=x=>decodeEntities(String(x||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'').toLowerCase()}catch{return ''}};

const STEMS=w=>String(w||'').toLowerCase().replace(/[^a-z]/g,'').replace(/(?:ing|ed|es|s|e)$/,'');
const GENERIC_ROOTS=new Set(['content','page','best','guide','service','services']);
function queryRoots(query){
 const all=[...new Set((String(query||'').toLowerCase().match(/[a-z]{4,}/g)||[]).map(STEMS).filter(x=>x.length>=3))];
 const distinct=all.filter(x=>!GENERIC_ROOTS.has(x));
 return {all,distinct:distinct.length?distinct:all};
}
function blocks(html){
 const safe=String(html||'').slice(0,RESEARCH_HTML_LIMIT).replace(CLEAN,' ');
 const out=[];let heading='',level=0;
 for(const m of safe.matchAll(/<(h[1-4]|p|li)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)){
  const tag=m[1].toLowerCase(),text=plain(m[2]);
  if(!text)continue;
  if(tag[0]==='h'){heading=text.slice(0,180);level=Number(tag[1]);continue}
  if(text.split(/\s+/).length>=8&&!CTA.test(text))out.push({heading,text:text.slice(0,1400),tag,level});
 }
 return out;
}
function groupSections(list){
 const map=new Map();
 for(const b of list){
  const key=b.heading||'(introduction)';
  if(!map.has(key))map.set(key,{heading:key,texts:[],level:b.level||0});
  map.get(key).texts.push(b.text);
 }
 return [...map.values()].map(s=>({heading:s.heading,level:s.level,text:s.texts.join(' '),words:s.texts.join(' ').split(/\s+/).filter(Boolean).length,paragraphs:s.texts}));
}
// ---------- SERP intent (from fresh organic leads, discussions excluded) ----------
const DISCUSSION=/(^|\.)(reddit\.com|quora\.com|stackexchange\.com|news\.ycombinator\.com)$/;
// 'Best practices', 'best way' and 'best time' are instructional phrases, not a product comparison.
// Words that name a software product (generic product nouns, no category or brand list).
const TOOL_PAGE=/\b(?:tool|software|platform|app|checker|tracker|generator|analy[sz]er|calculator|plugin|extension|dashboard|free trial|sign up)\b/;
const NON_COMMERCIAL_BEST=/\bbest\s+(?:practices?|ways?|time|approach|method)\b/gi;
// A title phrased as a question ("WTF is AI citation tracking?") is an explainer; a page under a product path
// (/features/, /solutions/, /tools/, /pricing) is the product's own page. Both only decide titles nothing else classifies.
const QUESTION_TITLE=/^\s*(?:what|what's|whats|wtf|who|why|how|when|which|where|is|are|can|does|do|should)\b[^?]{0,120}\?/i;
const PRODUCT_PATH=/\/(?:features?|solutions?|products?|tools?|platform|pricing|app)(?:\/|$)/i;
function classifyTitle(title,snippet='',url=''){
 const c=classifyTitleText(title,snippet);
 if(c!=='UNCLASSIFIED')return c;
 if(QUESTION_TITLE.test(String(title||'')))return 'INFORMATIONAL_GUIDE';
 try{if(url&&PRODUCT_PATH.test(new URL(url).pathname))return 'PRODUCT_TOOL'}catch{}
 return 'UNCLASSIFIED';
}
function classifyTitleText(title,snippet=''){
 const raw=String(title||'')+' '+String(snippet||''),t=raw.toLowerCase();
 // Local service: an explicit local marker (near me, 'City, ST', ZIP), a company/provider listing, or a US state named in
 // the TITLE (a snippet names places in passing). Never a list of trades.
 const cityState=/\b[A-Z][a-z]+(?: [A-Z][a-z]+)?,? (?:[A-Z]{2})\b(?! [a-z])/.test(raw)&&!/\b(?:AI|SEO|PDF|USA|FAQ|CEO|ROI|KPI|CMS|API)\b/.test(raw.match(/\b[A-Z][a-z]+(?: [A-Z][a-z]+)?,? [A-Z]{2}\b/)?.[0]||'');
 const stateInTitle=statesIn(String(title||'')).length>0;
 if(/\b(near me|near you|nearby|free estimate|free quote|call now|serving|service area|open now|licensed and insured|same.?day service|emergency service)\b|\b\d{5}\b|\b24\/7\b/.test(t)||cityState||stateInTitle||/\b(contractors?|companies|company|providers?|installers?|specialists?)\b.{0,20}\b(in|near)\b/.test(t))return 'LOCAL_SERVICE';
 // A snippet often contains 'plans' or 'best' in passing; only the title decides comparison vs guide.
 const tt=String(title||'').toLowerCase(),commercialTitle=tt.replace(NON_COMMERCIAL_BEST,' ');
 if(/\b(best|top \d+|reviews?|vs\.?|versus|alternatives?|compared|pricing|plans?)\b/.test(commercialTitle))return 'COMMERCIAL_COMPARISON';
 if(/\b(what is|what are|what to do|how to|how do|how much|how long|how many|why|when to|guide|tips|ways|steps|strateg(?:y|ies)|explained|everything you need|need to know|what you need|what [a-z ]{0,30}need to|best practices?|checklist|examples|getting started|quick reference|introduction to|beginner'?s?|basics|overview|tutorial|faqs?|signs of|causes of)\b|\b\d+ (?:tips|ways|steps|strategies|best practices)\b/.test(tt))return 'INFORMATIONAL_GUIDE';
 // A software product's own page: the title names the tool itself, not a guide about it or a list of tools.
 if(TOOL_PAGE.test(tt))return 'PRODUCT_TOOL';
 return 'UNCLASSIFIED';
}
// Local-service results routinely share the first page with homeowner/buyer guides; for a local query the two are one
// intent family (the destination check treats a guide as compatible with a local SERP for the same reason).
// Someone looking for a tool reads tool pages and "best tools" comparisons alike; both serve choosing a product.
const COMPATIBLE_FAMILY={LOCAL_SERVICE:['INFORMATIONAL_GUIDE'],PRODUCT_TOOL:['COMMERCIAL_COMPARISON']};
const MIN_LEADS=3,MIN_AGREEMENT=0.6;
// pages: competitor pages actually read [{url,html}]. A result whose title/snippet is unclassifiable is classified a second
// time from the H1 of its own page, so a terse title does not make an otherwise clear SERP "mixed".
function inferSerpIntent({query='',leads=[],pages=[]}={}){
 const usable=(Array.isArray(leads)?leads:[]).filter(l=>l&&l.url&&!DISCUSSION.test(host(l.url)));
 const byUrl=new Map((Array.isArray(pages)?pages:[]).filter(p=>p&&p.url&&p.html).map(p=>[p.url,p.html]));
 const votes={};
 const rows=usable.map(l=>{
  let c=classifyTitle(l.title,l.snippet,l.url),basis='TITLE_AND_SNIPPET';
  if(c==='UNCLASSIFIED'&&byUrl.has(l.url)){
   const h1=(byUrl.get(l.url).match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)||[])[1];
   const fromPage=h1?classifyTitle(plain(h1)):'UNCLASSIFIED';
   if(fromPage!=='UNCLASSIFIED'){c=fromPage;basis='READ_PAGE_H1'}
  }
  votes[c]=(votes[c]||0)+1;
  return {url:l.url,title:String(l.title||'').slice(0,140),class:c,basis};
 });
 const ranked=Object.entries(votes).filter(([k])=>k!=='UNCLASSIFIED').sort((a,b)=>b[1]-a[1]);
 const [top,count]=ranked[0]||[null,0];
 const family=top?(COMPATIBLE_FAMILY[top]||[]):[];
 const compatible=count+family.reduce((n,k)=>n+(votes[k]||0),0);
 const direct=usable.length>=MIN_LEADS&&top&&count/usable.length>=MIN_AGREEMENT;
 const viaFamily=!direct&&usable.length>=MIN_LEADS&&top&&family.length>0&&count>=2&&count>=Math.max(0,...family.map(k=>votes[k]||0))&&compatible/usable.length>=MIN_AGREEMENT;
 const verified=!!(direct||viaFamily);
 const classes=Object.entries(votes).sort((a,b)=>b[1]-a[1]).map(([k,n])=>k+' '+n).join(', ');
 return {status:verified?'SERP_INTENT_OBSERVED':'SERP_INTENT_NOT_ESTABLISHED',
  intent:verified?top:'MIXED_OR_INSUFFICIENT',query:String(query||''),
  organic_leads_considered:usable.length,agreeing_leads:count,compatible_leads:compatible,
  agreement_basis:direct?'SINGLE_INTENT':viaFamily?(top==='PRODUCT_TOOL'?'TOOL_PAGES_WITH_COMPARISONS':'LOCAL_SERVICE_WITH_GUIDES'):null,
  class_counts:votes,
  reason:verified?null:usable.length<MIN_LEADS?'Only '+usable.length+' usable organic result(s) after excluding discussion sites; at least '+MIN_LEADS+' are needed to read an intent.':
   'No intent reaches '+Math.round(MIN_AGREEMENT*100)+'% of '+usable.length+' usable organic results (classes: '+classes+').',
  pages_used_for_classification:rows.filter(r=>r.basis==='READ_PAGE_H1').length,
  leads:rows.slice(0,10),
  method:byUrl.size?'TITLE_AND_SNIPPET_PATTERNS_PLUS_H1_OF_READ_PAGES':'TITLE_AND_SNIPPET_PATTERNS_ON_FRESH_ORGANIC_LEADS',
  scope:'One lookup; observed placement is not a tracked-page ranking.'};
}
// ---------- Destination page intent ----------
function classifyDestinationIntent({query='',title='',h1=[],url='',serpIntent='MIXED_OR_INSUFFICIENT'}={}){
 const head=[title,...(Array.isArray(h1)?h1:[h1])].map(plain).join(' | ').toLowerCase();
 const roots=queryRoots(query).distinct,headRoots=new Set((head.match(/[a-z]{4,}/g)||[]).map(STEMS));
 const hasRoot=(set,r)=>set.has(r)||[...set].some(w=>sameWord(r,w));
 const overlap=roots.filter(r=>hasRoot(headRoots,r));
 let cls='UNCLASSIFIED';
 const productish=/\b(is now|alternatives?|reviews?|login|coupon|vs\.?|versus|compared?)\b/.test(head)||(serpIntent!=='LOCAL_SERVICE'&&/\bpricing\b/.test(head));
 if(productish)cls='PRODUCT_OR_COMPARISON';
 else if(/\b(what is|what are|how to|guide|tips|ways|steps|explained|strateg(?:y|ies)|checklist)\b/.test(head))cls='INFORMATIONAL_GUIDE';
 else if(/\b(services?|near me|company|contractors?|serving)\b/.test(head)||classifyTitle(title)==='LOCAL_SERVICE')cls='LOCAL_SERVICE';
 else if(TOOL_PAGE.test(head))cls='PRODUCT_TOOL';
 const compatible=serpIntent==='INFORMATIONAL_GUIDE'?cls==='INFORMATIONAL_GUIDE'
  :serpIntent==='LOCAL_SERVICE'?(cls==='LOCAL_SERVICE'||cls==='INFORMATIONAL_GUIDE'||(cls==='UNCLASSIFIED'&&overlap.length>0))
  :serpIntent==='COMMERCIAL_COMPARISON'?cls==='PRODUCT_OR_COMPARISON'
  // A tool search is served by the tool's own page (or its pricing/comparison page), never by a guide about the topic.
  :serpIntent==='PRODUCT_TOOL'?(cls==='PRODUCT_TOOL'||cls==='PRODUCT_OR_COMPARISON'):false;
 const different=cls!=='UNCLASSIFIED'&&!compatible&&serpIntent!=='MIXED_OR_INSUFFICIENT';
 // Topic completeness: every distinct query root must appear in the title/H1 or the URL slug. A page that shares only the
 // generic part of the query ("roof … damage repair" without "wind") is about a different topic, whatever its page type.
 let slug='';try{slug=decodeURIComponent(new URL(url).pathname).toLowerCase()}catch{}
 const topicRoots=new Set([...headRoots,...(slug.match(/[a-z]{4,}/g)||[]).map(STEMS)]);
 const missing=roots.filter(r=>!hasRoot(topicRoots,r));
 return {url,class:cls,query_root_overlap:overlap,missing_query_roots:missing,
  verdict:different?'DIFFERENT':compatible&&overlap.length?'COMPATIBLE':'UNVERIFIED',
  basis:'TITLE_AND_H1_PATTERNS_NOT_FULL_BODY_PROOF',observed_head:head.slice(0,220)};
}


const {deriveReaderTasksDetailed,destinationStatus,taskHitsInText,wordsOf}=require('./growth-derived-reader-tasks.cjs');
// Page furniture is never a placement anchor: navigation, closing reading lists, FAQ and calls to action.
const FURNITURE=/^(?:table of contents|contents|related(?: reading| posts| articles| content)?|further reading|read more|see also|sources?|references|faq|frequently asked|conclusion|summary|about(?: the author)?|share|comments?|newsletter|subscribe|contact|get started|book|want to|ready to|looking to|interested in)\b/i;
const headClean=h=>String(h||'').replace(/^[^\p{L}\p{N}]+/u,'').trim();
const FAQ_LIKE=/\bfaqs?\b|\bq&a\b|\bpeople also ask\b|\bquestions?\b[^.]{0,30}\b(?:ask|asked|answered|answers)\b|\b(?:ask|asked)\b[^.]{0,20}\bquestions?\b/i;
const isFurniture=s=>s.heading==='(introduction)'||s.words<30||FURNITURE.test(headClean(s.heading))||FAQ_LIKE.test(headClean(s.heading));
// A numbered heading ("1. …", "3b) …") is one item of a list of reasons or features when the page has a run of them;
// new instructions inside or between those items would break the list, so list items are never an anchor.
const LIST_ITEM=/^\d{1,2}[a-z]?[.)]\s/i;
// A heading that presents the concept as something to remove ("Eliminates the manual entry", "Avoid …", "Instead of …")
// argues against the task: teaching that task inside it contradicts the section.
// A comparison task ("citation tracking vs. backlink monitoring") belongs exactly in a section that contrasts the two
// ("Why citations replace backlinks"), so the rule only applies to tasks that teach the concept itself.
const COMPARISON_TASK=/\b(?:vs\.?|versus|compared?|comparison|comparing|differ\w*|instead\s+of|replac\w*)\b/i;
const AGAINST=/\b(?:eliminat\w*|avoid\w*|stop\w*|no\s+more|without|replac\w*|instead\s+of|get\s+rid\s+of|remov\w*|ditch\w*|myths?|mistakes?)\b/i;
function pickPlacement(destSections,task,skip){
 const against=COMPARISON_TASK.test(String(task.label||''))?null:AGAINST;
 // The opening section under the H1 introduces the page; a new reader task never goes inside it.
 const opening=destSections.find(s=>s.level===1);
 const numbered=destSections.filter(s=>LIST_ITEM.test(headClean(s.heading))).length>=2;
 const body=destSections.filter(s=>!isFurniture(s)&&!(numbered&&LIST_ITEM.test(headClean(s.heading))));
 // 1) the section already mentions the task's core concept: deepen it instead of adding a duplicate
 // A single passing mention of a generic word is not a touch; the concept must be in the heading or recur in the section.
 const touching=body.map(s=>({s,h:taskHitsInText(task,s.heading+' '+s.text,skip),inHead:taskHitsInText(task,s.heading,skip).key>=1}))
  .filter(x=>(x.inHead||x.h.key>=2)&&x.s!==opening&&!(against&&against.test(headClean(x.s.heading)))).sort((a,b)=>(Number(b.inHead)-Number(a.inHead))||b.h.key-a.h.key)[0];
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
 const derivation=compInfo.length>=2?deriveReaderTasksDetailed({query,competitors:compInfo,queryRootSet:skip}):{tasks:[],diagnostics:null};
 const derived=derivation.tasks;
 const result=[];
 for(const task of derived){
  const dest=destinationStatus(task,destBlocks,skip);
  const elsewhere=[];
  for(const p of Array.isArray(sitePages)?sitePages:[]){
   if(!p?.html||p.truncated===true||p.url===destination.url)continue;
   const st=destinationStatus(task,blocks(p.html),skip);
   if(st.status==='COVERED')elsewhere.push({url:p.url,heading:st.passages[0]?.heading||null,excerpt:st.passages[0]?.text.slice(0,260)||''});
  }
  result.push({code:task.code,label:task.label,match:{key:task.key,co_terms:task.co_terms,concepts:task.concepts,core_words:task.core_words},
   supported_by_competitors:new Set(task.support.map(x=>x.host)).size>=2,
   independent_sources:new Set(task.support.map(x=>x.host)).size,competitor_support:task.support,
   destination:dest,covered_elsewhere_on_site:elsewhere.slice(0,2),
   placement:dest.status==='COVERED'?null:pickPlacement(destSections,task,skip)});
 }
 const seenAnchor=new Map();
 for(const t of result){if(!t.placement)continue;const k=t.placement.mode+'|'+t.placement.section_heading;
  // Several new sections at one anchor form a chain in this order; after_task_code makes the order explicit for the handoff.
  if(seenAnchor.has(k)){const prev=seenAnchor.get(k);t.placement={...t.placement,after_task_code:prev.code,reason:t.placement.reason+' Place it after the section proposed for “'+prev.label+'”.'}}
  seenAnchor.set(k,{code:t.code,label:t.label})}
 const supported=result.filter(t=>t.supported_by_competitors);
 return {status:compInfo.length>=2&&new Set(compInfo.map(c=>c.host)).size>=2?'READER_TASK_COVERAGE_OBSERVED':'INSUFFICIENT_READABLE_COMPETITORS',
  method:'TASKS_DERIVED_FROM_SECTIONS_OF_2_PLUS_INDEPENDENT_COMPETITORS_NO_INDUSTRY_VOCABULARY_NOT_SEMANTIC_PROOF',
  task_set:'DERIVED_FROM_COMPETITOR_SECTIONS',serp_intent:serpIntent,
  destination_url:destination.url||null,destination_truncated:destination.truncated===true,destination_capture:destination.capture||null,
  destination_sections:destSections.map(s=>({heading:s.heading,words:s.words})),
  competitors_considered:compInfo.map(c=>({url:c.url,host:c.host,partial:c.partial,sections:c.sections.length})),
  competitor_diagnostics:competitorDiagnostics,task_derivation:derivation.diagnostics,
  unverifiable_site_pages:(Array.isArray(sitePages)?sitePages:[]).filter(p=>p&&p.url!==destination.url&&(p.truncated===true||!p.html)).map(p=>p.url),
  tasks:result,
  supported_task_codes:supported.map(t=>t.code),
  gap_task_codes:supported.filter(t=>t.destination.status!=='COVERED'&&!t.covered_elsewhere_on_site.length).map(t=>t.code),
  covered_task_codes:supported.filter(t=>t.destination.status==='COVERED').map(t=>t.code),
  linked_elsewhere_task_codes:supported.filter(t=>t.destination.status!=='COVERED'&&t.covered_elsewhere_on_site.length).map(t=>t.code),
  destination_section_headings:destSections.map(s=>s.heading)};
}

// Mixed results: when Google shows several page types and the selected page's own type is clearly among them (2+ results and
// 25%+ of the usable ones), the page is compared with the results of its own type only. The dominant intent is kept as a fact,
// never as a reason to compare a guide with tool pages. The 60% rule for a single intent is unchanged.
const PAGE_TYPE_MIN_RESULTS=2,PAGE_TYPE_MIN_SHARE=0.25;
function pageTypeScope({serpIntent,destinationClass}={}){
 if(!serpIntent||!destinationClass||destinationClass==='UNCLASSIFIED')return null;
 const family=[destinationClass,...(COMPATIBLE_FAMILY[destinationClass]||[])];
 const same=(serpIntent.leads||[]).filter(l=>family.includes(l.class));
 const of=Number(serpIntent.organic_leads_considered)||0;
 if(same.length<PAGE_TYPE_MIN_RESULTS||!of||same.length/of<PAGE_TYPE_MIN_SHARE)return null;
 return {page_type:destinationClass,results_of_this_type:same.length,of,urls:same.map(l=>l.url),titles:same.map(l=>l.title),
  overall_intent:serpIntent.intent,overall_status:serpIntent.status,class_counts:serpIntent.class_counts||{},
  rule:'Mixed results: the page is compared only with the '+same.length+' of '+of+' results of its own type.'};
}
module.exports={analyzeReaderTaskCoverage,pickPlacement,inferSerpIntent,classifyDestinationIntent,classifyTitle,blocks,groupSections,queryRoots,STEMS,pageTypeScope,COMPATIBLE_FAMILY};
