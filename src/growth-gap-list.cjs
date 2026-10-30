'use strict';
// One list of every difference between this page and the readable ranking pages, for the editor to choose from.
// Shared by the Tracker (Growth research page) and the standalone check. Research always produces it; AI only labels
// (a judged reader question, an AI-grouped topic) and every item keeps its competitor evidence, so an AI failure
// never removes anything. Writing happens only for items the owner selects (growth-selected-writing.cjs).
//
// One item per information need, not per heading: competitor sections that the AI grouped into one topic, that a reader
// question already covers, or (without AI) that share their core words, become ONE item listing every supporting page
// and its original fragment. Each item says why it is in the list (sources, coverage, link with the search term,
// confidence) and what to do with it; up to four are marked "recommended". The page's own strengths, sections none of
// the ranking pages read has, are listed apart so they are kept, not rewritten.
const {terms}=require('./growth-one-action-decision.cjs');
const {matchedTerms}=require('./growth-word-match.cjs');
const clip=(x,n)=>String(x==null?'':x).replace(/\s+/g,' ').trim().slice(0,n);
const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return ''}};
const PAGE={NOT_OBSERVED:'Not on your page',PARTIAL:'Partly on your page'};
const TOPIC={NO:'Not on your page',PARTLY:'Partly on your page',UNKNOWN:'Not matched to your page'};
const GROUPS=[['QUESTION','Questions two ranking pages answer'],['MISSING_TOPIC','Not on your page'],['PARTIAL_TOPIC','Partly on your page'],
 ['PAGE_ELEMENT','Page elements the ranking pages have'],['UNMATCHED_TOPIC','Could not be matched to your page'],['COMPETITOR_SECTION','Sections on the ranking pages (not grouped)']];
const MAX_EXAMPLES=8,MAX_RECOMMENDED=4;
// The owner always sees EVERY difference, verified or not: a "different questions" judgement only labels it. What the
// check finds already on the page is not listed (no duplicate content), and each competitor section appears only once.

const example=(s,positions)=>({site:s.host||s.site,url:s.url||null,heading:clip(s.heading,160),excerpt:clip(s.excerpt,400),position:s.position??positions?.get(s.url)??null});
const words=t=>terms(t);
// Two headings describe the same need when they share at least two core words (word forms count) and the words that are
// not the search term's agree: at least two of them shared, or every such word of the shorter heading is in the other.
// Words of the search term alone never join headings: every ranking page shares them.
const sameNeed=(a,b,q=[])=>{const A=words(a),B=words(b);if(matchedTerms(A,B).length<2)return false;
 const own=t=>t.filter(w=>!matchedTerms([w],q).length);const x=own(A),y=own(B);if(!x.length||!y.length)return false;
 const shared=matchedTerms(x,y).length,short=Math.min(x.length,y.length);
 return shared>=2||shared>=1&&shared===short};

function buildGapList(report={}){
 const ov=report.competitor_overview,coverage=report.reader_task_coverage||{};
 const positions=new Map((report.search_discovery?.competitor_fetch_log||[]).map(x=>[x.url,x.serp_position]));
 const focus=clip(report.editorial_decision_gate?.focus_query||report.search_discovery?.target_query||'',160)||null,qWords=words(focus||'');
 const items=[],seen=new Set(),key=(host,heading)=>String(host||'')+'\u0000'+clip(heading,160).toLowerCase();
 const addEvidence=(it,secs,how)=>{let added=0;for(const s of secs){const e=example(s,positions);const k=key(e.site,e.heading);if(seen.has(k))continue;seen.add(k);
  if(it.examples.length<MAX_EXAMPLES)it.examples.push(e);else it.more_examples=(it.more_examples||0)+1;added++}
  if(added&&how&&!it.merged.includes(how))it.merged.push(how);return added};
 // 1. Reader questions two ranking pages answer (word-matched candidates; AI label says whether the meaning was confirmed).
 for(const t of coverage.tasks||[]){
  if((!t.supported_by_competitors&&!t.word_match_supported)||t.destination?.status==='COVERED')continue;
  const confirmed=t.meaning?.status==='SAME_QUESTION',different=t.meaning?.status==='DIFFERENT_QUESTIONS';
  const it={id:'q-'+t.code,group:'QUESTION',writable:true,
   title:confirmed?t.reader_question:clip(String(t.label||'').replace(/^Competitors teach\s*/i,'').replace(/^[“"]|[”"]$/g,''),200),
   reader_question:confirmed?t.reader_question:null,
   status:PAGE[t.destination?.status]||'Not on your page',coverage:t.destination?.status==='PARTIAL'?'PARTIAL':'MISSING',
   confidence:confirmed?'AI_CONFIRMED_SAME_QUESTION':different?'AI_SAYS_DIFFERENT_QUESTIONS':'SHARED_WORDS_ONLY',
   ai:confirmed?'AI: same reader question on '+t.independent_sources+' ranking pages':different?'AI: the ranking pages answer different questions here ('+clip(t.meaning.reason,140)+')':t.meaning?'AI: not judged (shared words only)':'Shared words only (no AI check)',
   your_section:t.destination?.judged_heading||null,placement:t.placement||null,examples:[],merged:[]};
  addEvidence(it,(t.competitor_support||[]).map(s=>({...s,position:positions.get(s.url)??null})));
  items.push(it);
 }
 if(ov&&ov.status==='OBSERVED'){
  // 2. Topics of the ranking pages, grouped by AI when available. A topic that shares a section with a question is the
  //    same need: its other sections are added to that question as evidence, never listed as a second item.
  if(ov.topics_status==='GROUPED'){
   (ov.topics||[]).forEach((t,i)=>{if(t.this_page==='YES')return;
    const secs=t.sections||[];
    const owner=items.find(it=>it.group==='QUESTION'&&secs.some(x=>it.examples.some(e=>key(e.site,e.heading)===key(x.host,x.heading))));
    if(owner){addEvidence(owner,secs,'AI topic “'+clip(t.topic,100)+'”');return}
    const it={id:'t-'+i,group:t.this_page==='NO'?'MISSING_TOPIC':t.this_page==='PARTLY'?'PARTIAL_TOPIC':'UNMATCHED_TOPIC',writable:true,
     title:clip(t.topic,200),reader_question:null,status:TOPIC[t.this_page]||TOPIC.UNKNOWN,
     coverage:t.this_page==='NO'?'MISSING':t.this_page==='PARTLY'?'PARTIAL':'NOT_COMPARED',confidence:'AI_GROUPED',ai:'AI-grouped topic',
     your_section:t.this_page_heading||null,
     placement:t.this_page==='PARTLY'&&t.this_page_heading?{mode:'EXTEND_SECTION',section_heading:t.this_page_heading}:null,examples:[],merged:[]};
    if(addEvidence(it,secs))items.push(it);
   });
  }
  // 3. Sections not in any topic. One that shares its core words with an item already listed is added there as evidence;
  //    the rest are grouped with each other the same way. Grouping by words is labelled as such (no AI).
  const rest=(ov.ungrouped_sections||[]).filter(x=>!seen.has(key(x.host,x.heading)));
  const label=ov.topics_status==='GROUPED'?'Not placed in a topic by AI':'Not grouped ('+String(ov.topics_status||'').toLowerCase().replace(/_/g,' ')+')';
  const loose=[];
  for(const x of rest){
   const home=items.find(it=>it.writable&&(sameNeed(it.title,x.heading,qWords)||it.examples.some(e=>sameNeed(e.heading,x.heading,qWords))));
   if(home){addEvidence(home,[x],'sections with the same core words');continue}
   const peer=loose.find(it=>it.examples.some(e=>sameNeed(e.heading,x.heading,qWords)));
   if(peer){addEvidence(peer,[x],'sections with the same core words');peer.confidence='SHARED_WORDS_ONLY';peer.ai=label+'; '+'similar sections grouped by shared words';continue}
   const it={id:'s-'+loose.length,group:'COMPETITOR_SECTION',writable:true,title:clip(x.heading,200),reader_question:null,
    status:'Not compared with your page',coverage:'NOT_COMPARED',confidence:'NOT_GROUPED',ai:label,your_section:null,placement:null,examples:[],merged:[]};
   if(addEvidence(it,[x]))loose.push(it);
  }
  items.push(...loose);
  // 4. Page elements most ranking pages have (deterministic); the editor adds these, they are not written.
  for(const f of ov.elements_they_have_and_this_page_lacks||[])
   items.push({id:'e-'+f.key,group:'PAGE_ELEMENT',writable:false,title:f.label,status:'Not on your page',ai:null,ranking_pages:f.ranking_pages_with_it,of:f.of,examples:[]});
  for(const f of ov.structured_data_they_have_and_this_page_lacks||[])
   items.push({id:'e-schema-'+f.type,group:'PAGE_ELEMENT',writable:false,title:'Structured data: '+f.type,status:'Not on your page',ai:null,ranking_pages:f.ranking_pages_with_it,of:f.of,examples:[]});
  const L=ov.length||{};
  if(L.ranking_pages_median_words&&L.this_page_words<L.ranking_pages_median_words*0.6)
   items.push({id:'e-length',group:'PAGE_ELEMENT',writable:false,title:'Length',status:'Your page has '+L.this_page_words+' words; ranking pages have about '+L.ranking_pages_median_words,ai:null,ranking_pages:null,examples:[]});
 }
 prioritise(items,focus);
 const status=items.length||ov?.status==='OBSERVED'?'OBSERVED':(ov?.status||'NOT_AVAILABLE');
 return {status,groups:GROUPS.map(([id,label])=>({id,label})),items,
  recommended:items.filter(x=>x.recommended).map(x=>x.id),
  strengths:strengths(ov,qWords,items),
  ranking_pages_read:ov?.ranking_pages_read??(coverage.competitors_considered||[]).length,
  ranking_pages:(ov?.ranking_pages||[]).map(p=>({url:p.url,position:p.serp_position??null})),
  // The page as researched: writing refuses when the live page no longer matches (re-run the research instead).
  source_fingerprint:ov?.this_page_fingerprint||null,
  focus_query:focus,
  note:'What the readable ranking pages contain and your page does not. Not a fact check and not a ranking promise: you choose what goes on your site; text is only written for what you select.'};
}

// Why an item is in the list, from what the research observed; no score is shown and nothing is estimated.
function prioritise(items,focus){
 const q=words(focus||'');
 const CONF={AI_CONFIRMED_SAME_QUESTION:2,AI_GROUPED:1,SHARED_WORDS_ONLY:0,NOT_GROUPED:0,AI_SAYS_DIFFERENT_QUESTIONS:-3};
 for(const it of items){
  if(!it.writable){it.priority={sources:it.ranking_pages??null,suggested_action:'Add this element yourself (it is not written by Growth).'};continue}
  const sources=new Set(it.examples.map(e=>e.site).filter(Boolean)).size;
  const text=it.examples.filter(e=>String(e.excerpt||'').length>=75).length;
  const related=q.length?matchedTerms(q,words([it.title,it.reader_question,...it.examples.map(e=>e.heading)].join(' '))).length>0:null;
  it.ranking_pages=sources;
  const action=it.coverage==='PARTIAL'&&it.your_section?'Extend your section “'+it.your_section+'”.':
   it.placement?.mode==='EXTEND_SECTION'&&it.placement.section_heading?'Extend your section “'+it.placement.section_heading+'”.':
   it.placement?.section_heading?'Add a new section after “'+it.placement.section_heading+'”.':
   it.coverage==='NOT_COMPARED'?'Check your page first: this section was not compared with it.':'Add a new section; you choose where.';
  const why=[sources+' ranking page'+(sources===1?'':'s')+' cover'+(sources===1?'s':'')+' it',
   it.coverage==='MISSING'?'not on your page':it.coverage==='PARTIAL'?'only partly on your page':'not compared with your page',
   related===true?'shares words with the search term':related===false?'no word in common with the search term':null,
   it.confidence==='AI_CONFIRMED_SAME_QUESTION'?'AI confirmed the same reader question':it.confidence==='AI_GROUPED'?'AI grouped these sections as one topic':
    it.confidence==='AI_SAYS_DIFFERENT_QUESTIONS'?'AI says the pages answer different questions':it.confidence==='NOT_GROUPED'?'a single competitor section, not grouped':'matched by shared words only, meaning not confirmed',
   text?text+' fragment'+(text===1?'':'s')+' of competitor text to work from':'competitor headings only, no text to work from'].filter(Boolean);
  it.priority={sources,coverage:it.coverage,search_relevance:related===true?'SHARES_WORDS_WITH_SEARCH_TERM':related===false?'NO_WORD_IN_COMMON':'NO_SEARCH_TERM',
   confidence:it.confidence,competitor_text_fragments:text,why,suggested_action:action,
   rank:sources*3+(it.coverage==='NOT_COMPARED'?0:2)+(related===false?-1:related?1:0)+CONF[it.confidence]+(text?1:0)};
 }
 // Recommended: supported by at least two ranking pages, missing or partial, not contradicted by the AI. The link with the
 // search term is word-based, so it orders but never excludes.
 items.filter(it=>it.writable&&it.priority.sources>=2&&it.coverage!=='NOT_COMPARED'&&it.confidence!=='AI_SAYS_DIFFERENT_QUESTIONS')
  .sort((a,b)=>b.priority.rank-a.priority.rank).slice(0,MAX_RECOMMENDED).forEach(it=>{it.recommended=true});
 // Within each group the recommended and best-supported items first; groups keep the order in which they were built.
 const order=new Map();items.forEach(it=>{if(!order.has(it.group))order.set(it.group,order.size)});
 items.sort((a,b)=>order.get(a.group)-order.get(b.group)||(b.recommended?1:0)-(a.recommended?1:0)||(b.priority?.rank||0)-(a.priority?.rank||0));
 for(const it of items){if(it.priority)delete it.priority.rank;if(it.merged&&!it.merged.length)delete it.merged}
}

// Sections of this page with no counterpart on the readable ranking pages: listed so they are kept, never as something to
// write. Conservative and word-based: none of the heading's own words (the search term's words aside, at least two) is in
// any ranking-page heading or fragment, and no gap or AI topic points at the section. It says what was compared; it does
// not judge quality.
const symbols=t=>String(t||'').replace(/[^\p{L}\p{N}\s?&'’.:,()-]/gu,' ').replace(/\s+/g,' ').trim();
function strengths(ov,q=[],items=[]){
 if(!ov||ov.status!=='OBSERVED'||!(ov.ranking_pages_read>0)||!Array.isArray(ov.this_page_sections))return [];
 const theirs=[...(ov.ranking_pages||[]).flatMap(p=>p.content_headings||[]),...(ov.topics||[]).flatMap(t=>(t.sections||[]).map(s=>s.heading+' '+(s.excerpt||''))),
  ...(ov.ungrouped_sections||[]).map(s=>s.heading+' '+(s.excerpt||''))].map(words);
 const pointed=new Set([...(ov.topics||[]).map(t=>t.this_page_heading),...items.map(it=>it.your_section),...items.map(it=>it.placement?.section_heading)].filter(Boolean));
 const furniture=/^(?:table of contents|contents|in short|summary|related\b|frequently asked questions|faqs?|people also ask)/i;
 return ov.this_page_sections.filter(s=>!s.furniture&&!furniture.test(symbols(s.heading))&&!pointed.has(s.heading)&&(s.words==null||s.words>=40))
  .filter(s=>{const w=words(s.heading).filter(x=>!matchedTerms([x],q).length);return w.length>=2&&!theirs.some(t=>matchedTerms(w,t).length>0)})
  .slice(0,12).map(s=>({heading:s.heading,excerpt:clip(s.excerpt,200),
   note:'No ranking page read ('+ov.ranking_pages_read+') has a heading or fragment with these words. Keep it unless you decide otherwise; it is not rewritten.'}));
}

module.exports={buildGapList,GROUPS,hostOf};
