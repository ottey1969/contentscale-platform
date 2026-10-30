'use strict';
// One list of every difference between this page and the readable ranking pages, for the editor to choose from.
// Shared by the Tracker (Growth research page) and the standalone check. Research always produces it; AI only labels
// (a judged reader question, an AI-grouped topic) and every item keeps its competitor evidence, so an AI failure
// never removes anything. Writing happens only for items the owner selects (growth-selected-writing.cjs).
//
// One item per information need, and only merged on proof: a section the AI grouped into one topic, or the very same
// competitor section a reader question already uses, joins that item. Shared words are NOT proof of the same need: such
// items stay separate and are marked as possibly overlapping (better two items than one wrong merge). Every supporting
// page and its original fragment is kept with the item (none dropped; the screen shows three and folds the rest).
// Each item carries two separate assessments: research priority (is the difference real and supported) and growth
// potential (search demand from Search Console when available, otherwise "not measured"; business fit is the owner's).
// Up to four are recommended as research priorities; that is advice, not the writing limit. Sections only this page has
// are listed as unique content to review and preserve; uniqueness is not proof of quality.
const {createHash}=require('node:crypto');
const {terms}=require('./growth-one-action-decision.cjs');
const {matchedTerms}=require('./growth-word-match.cjs');
const clip=(x,n)=>String(x==null?'':x).replace(/\s+/g,' ').trim().slice(0,n);
const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return ''}};
const PAGE={NOT_OBSERVED:'Not on your page',PARTIAL:'Partly on your page'};
const TOPIC={NO:'Not on your page',PARTLY:'Partly on your page',UNKNOWN:'Not matched to your page'};
const GROUPS=[['QUESTION','Questions two ranking pages answer'],['MISSING_TOPIC','Not on your page'],['PARTIAL_TOPIC','Partly on your page'],
 ['PAGE_ELEMENT','Page elements the ranking pages have'],['UNMATCHED_TOPIC','Could not be matched to your page'],['COMPETITOR_SECTION','Sections on the ranking pages (not grouped)'],
 ['NOT_RELEVANT','Probably not relevant to this search (no section proposed, not written)']];
// Evidence threshold: fewer readable ranking pages than this and no section is proposed, recommended or written.
const MIN_READABLE_PAGES=2;
const MAX_RECOMMENDED=4;
const stableId=(prefix,parts)=>prefix+createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0,10);
// The owner always sees EVERY difference, verified or not: a "different questions" judgement only labels it. What the
// check finds already on the page is not listed (no duplicate content), and each competitor section appears only once.

const example=(s,positions)=>({site:s.host||s.site,url:s.url||null,heading:clip(s.heading,160),excerpt:clip(s.excerpt,400),position:s.position??positions?.get(s.url)??null});
const words=t=>terms(t);
// Two headings MAY describe the same need when they share at least two core words (word forms count) and the words that
// are not the search term's agree: at least two of them shared, or every such word of the shorter heading is in the
// other. Words of the search term alone never count: every ranking page shares them. This only marks a possible overlap.
const mayOverlap=(a,b,q=[])=>{const A=words(a),B=words(b);if(matchedTerms(A,B).length<2)return false;
 const own=t=>t.filter(w=>!matchedTerms([w],q).length);const x=own(A),y=own(B);if(!x.length||!y.length)return false;
 const shared=matchedTerms(x,y).length,short=Math.min(x.length,y.length);
 return shared>=2||shared>=1&&shared===short};

function buildGapList(report={}){
 const ov=report.competitor_overview,coverage=report.reader_task_coverage||{};
 // A new page (from a Pre-Write brief): nothing is on the page yet, so every item is something to cover on it.
 const newPage=report.new_page===true||ov?.new_page===true;
 const positions=new Map((report.search_discovery?.competitor_fetch_log||[]).map(x=>[x.url,x.serp_position]));
 const focus=clip(report.editorial_decision_gate?.focus_query||report.search_discovery?.target_query||'',160)||null,qWords=words(focus||'');
 const items=[],seen=new Set(),key=(host,heading)=>String(host||'')+'\u0000'+clip(heading,160).toLowerCase();
 const addEvidence=(it,secs,how)=>{let added=0;for(const s of secs){const e=example(s,positions);const k=key(e.site,e.heading);if(seen.has(k))continue;seen.add(k);
  it.examples.push(e);added++}
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
   need:{status:confirmed?'AI_CONFIRMED_SAME_QUESTION':different?'AI_SAYS_DIFFERENT_QUESTIONS':'WORD_MATCHED_NOT_CONFIRMED'},
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
    if(owner){addEvidence(owner,secs,'AI topic “'+clip(t.topic,100)+'” (shares a section with this question)');return}
    const it={id:stableId('t-',['topic',...secs.map(x=>key(x.host,x.heading))]),need:{status:'AI_TOPIC'},group:t.this_page==='NO'?'MISSING_TOPIC':t.this_page==='PARTLY'?'PARTIAL_TOPIC':'UNMATCHED_TOPIC',writable:true,
     title:clip(t.topic,200),reader_question:null,status:TOPIC[t.this_page]||TOPIC.UNKNOWN,
     coverage:t.this_page==='NO'?'MISSING':t.this_page==='PARTLY'?'PARTIAL':'NOT_COMPARED',confidence:'AI_GROUPED',ai:'AI-grouped topic',
     your_section:t.this_page_heading||null,...(t.fits_search?{fits_search:t.fits_search}:{}),...(t.fits_reason?{fits_reason:t.fits_reason}:{}),
     placement:t.this_page==='PARTLY'&&t.this_page_heading?{mode:'EXTEND_SECTION',section_heading:t.this_page_heading}:null,examples:[],merged:[]};
    if(addEvidence(it,secs))items.push(it);
   });
  }
  // 3. Sections not in any topic: each its own item. Shared words with another item mark a possible overlap, never a merge.
  const rest=(ov.ungrouped_sections||[]).filter(x=>!seen.has(key(x.host,x.heading)));
  const label=ov.topics_status==='GROUPED'?'Not placed in a topic by AI':'Not grouped ('+String(ov.topics_status||'').toLowerCase().replace(/_/g,' ')+')';
  const loose=[];
  for(const x of rest){
   const it={id:stableId('s-',['section',key(x.host,x.heading)]),need:{status:'SINGLE_SECTION'},group:'COMPETITOR_SECTION',writable:true,title:clip(x.heading,200),reader_question:null,
    status:'Not compared with your page',coverage:'NOT_COMPARED',confidence:'NOT_GROUPED',ai:label,your_section:null,placement:null,examples:[],merged:[]};
   if(addEvidence(it,[x]))loose.push(it);
  }
  items.push(...loose);
  markOverlaps(items,qWords);
  // 4. Page elements most ranking pages have (deterministic); the editor adds these, they are not written.
  for(const f of ov.elements_they_have_and_this_page_lacks||[])
   items.push({id:'e-'+f.key,group:'PAGE_ELEMENT',writable:false,title:f.label,status:'Not on your page',ai:null,ranking_pages:f.ranking_pages_with_it,of:f.of,examples:[]});
  for(const f of ov.structured_data_they_have_and_this_page_lacks||[])
   items.push({id:'e-schema-'+f.type,group:'PAGE_ELEMENT',writable:false,title:'Structured data: '+f.type,status:'Not on your page',ai:null,ranking_pages:f.ranking_pages_with_it,of:f.of,examples:[]});
  const L=ov.length||{};
  if(newPage&&L.ranking_pages_median_words)
   items.push({id:'e-length',group:'PAGE_ELEMENT',writable:false,title:'Length',status:'The ranking pages have about '+L.ranking_pages_median_words+' words',ai:null,ranking_pages:null,examples:[]});
  else if(L.ranking_pages_median_words&&L.this_page_words<L.ranking_pages_median_words*0.6)
   items.push({id:'e-length',group:'PAGE_ELEMENT',writable:false,title:'Length',status:'Your page has '+L.this_page_words+' words; ranking pages have about '+L.ranking_pages_median_words,ai:null,ranking_pages:null,examples:[]});
 }
 if(newPage)for(const it of items){if(it.status==='Not on your page'||it.status==='Not compared with your page'||it.status==='Not matched to your page')it.status='To cover on the new page';
  if(it.coverage==='NOT_COMPARED')it.coverage='MISSING'}
 const readable=ov?.ranking_pages_read??0;
 // One outcome for the whole report: when the research decision itself is "data blocked", the list proposes nothing either.
 const gateBlocked=report.editorial_decision_gate?.decision==='DATA_BLOCKED';
 const insufficient=(ov?.status==='OBSERVED'&&readable<MIN_READABLE_PAGES)||(gateBlocked&&items.some(x=>x.writable));
 prioritise(items,focus,{newPage,insufficient,readable,gateBlocked});
 growthPotential(items,report,qWords);
 const status=items.length||ov?.status==='OBSERVED'?'OBSERVED':(ov?.status||'NOT_AVAILABLE');
 const NEW_LABEL={MISSING_TOPIC:'Topics the ranking pages cover',UNMATCHED_TOPIC:'Other topics the ranking pages cover'};
 return {status,page_kind:newPage?'NEW_PAGE':'EXISTING_PAGE',
  // One outcome: without enough evidence nothing is proposed and the writer is not offered (the brief still is).
  evidence:insufficient?{status:'INSUFFICIENT_EVIDENCE',readable_ranking_pages:readable,
   reason:readable<MIN_READABLE_PAGES?'Only '+readable+' readable ranking page'+(readable===1?'':'s')+': not enough evidence to propose or write a section. The list is shown for information.':
    'The research decision is "data blocked"'+(report.editorial_decision_gate?.blocker_code?' ('+String(report.editorial_decision_gate.blocker_code).toLowerCase().replace(/_/g,' ')+')':'')+': no section is proposed or written. The list is shown for information.'}:
   {status:'ENOUGH_EVIDENCE',readable_ranking_pages:readable},
  writing_allowed:!insufficient,groups:GROUPS.map(([id,label])=>({id,label:newPage&&NEW_LABEL[id]||label})),items,
  recommended:items.filter(x=>x.recommended).map(x=>x.id),
  recommendation_basis:'RESEARCH_PRIORITY_NOT_A_GROWTH_FORECAST',
  // Unique content to review and preserve (see uniqueContent): never written, never a gap.
  unique_content:uniqueContent(ov,qWords,items),
  ranking_pages_read:ov?.ranking_pages_read??(coverage.competitors_considered||[]).length,
  ranking_pages:(ov?.ranking_pages||[]).map(p=>({url:p.url,position:p.serp_position??null})),
  // The page as researched: writing refuses when the live page no longer matches (re-run the research instead).
  source_fingerprint:ov?.this_page_fingerprint||null,
  focus_query:focus,
  // What this research rested on, kept with the list so a later concept can show it (evidence dossier).
  research:{evidence_status:insufficient?'INSUFFICIENT_EVIDENCE':'ENOUGH_EVIDENCE',focus_query:focus,researched_at:report.generated_at||null,page_url:report.url||null,
   market:report.search_discovery?.search_locale?{country:report.search_discovery.search_locale.country,language:report.search_discovery.search_locale.hl,
    source:report.search_discovery.search_locale.source,confirmed:report.search_discovery.search_locale.confirmed===true}:null,
   market_coverage:report.search_discovery?.market_coverage||null,search_source:report.search_discovery?.source||null,
   ranking_pages:(ov?.ranking_pages||[]).map(p=>({url:p.url,position:p.serp_position??null})),page_fingerprint:ov?.this_page_fingerprint||null},
  note:newPage?'What the readable ranking pages contain, to choose from for the new page. Not a fact check and not a ranking promise: you choose what goes on the new page; text is only written for what you select.':
   'What the readable ranking pages contain and your page does not. Not a fact check and not a ranking promise: you choose what goes on your site; text is only written for what you select.'};
}

// Why an item is in the list, from what the research observed; no score is shown and nothing is estimated.
function prioritise(items,focus,{newPage=false,insufficient=false,readable=0,gateBlocked=false}={}){
 const q=words(focus||'');
 const CONF={AI_CONFIRMED_SAME_QUESTION:2,AI_GROUPED:1,SHARED_WORDS_ONLY:0,NOT_GROUPED:0,AI_SAYS_DIFFERENT_QUESTIONS:-3};
 for(const it of items){
  if(!it.writable){it.priority={sources:it.ranking_pages??null,suggested_action:'Add this element yourself (it is not written by Growth).'};continue}
  const sources=new Set(it.examples.map(e=>e.site).filter(Boolean)).size;
  const text=it.examples.filter(e=>String(e.excerpt||'').length>=75).length;
  const related=q.length?matchedTerms(q,words([it.title,it.reader_question,...it.examples.map(e=>e.heading)].join(' '))).length>0:null;
  it.ranking_pages=sources;
  const action=newPage?'Write a section for the new page.':it.coverage==='PARTIAL'&&it.your_section?'Extend your section “'+it.your_section+'”.':
   it.placement?.mode==='EXTEND_SECTION'&&it.placement.section_heading?'Extend your section “'+it.placement.section_heading+'”.':
   it.placement?.section_heading?'Add a new section after “'+it.placement.section_heading+'”.':
   it.coverage==='NOT_COMPARED'?'Check your page first: this section was not compared with it.':'Add a new section; you choose where.';
  const why=[sources+' ranking page'+(sources===1?'':'s')+' cover'+(sources===1?'s':'')+' it',
   newPage?'not on the new page yet':it.coverage==='MISSING'?'not on your page':it.coverage==='PARTIAL'?'only partly on your page':'not compared with your page',
   related===true?'shares words with the search term':related===false?'no word in common with the search term':null,
   it.confidence==='AI_CONFIRMED_SAME_QUESTION'?'AI confirmed the same reader question':it.confidence==='AI_GROUPED'?'AI grouped these sections as one topic':
    it.confidence==='AI_SAYS_DIFFERENT_QUESTIONS'?'AI says the pages answer different questions':it.confidence==='NOT_GROUPED'?'a single competitor section, not grouped':'matched by shared words only, meaning not confirmed',
   text?text+' fragment'+(text===1?'':'s')+' of competitor text to work from':'competitor headings only, no text to work from'].filter(Boolean);
  it.priority={sources,coverage:it.coverage,search_relevance:related===true?'SHARES_WORDS_WITH_SEARCH_TERM':related===false?'NO_WORD_IN_COMMON':'NO_SEARCH_TERM',
   confidence:it.confidence,competitor_text_fragments:text,why,suggested_action:action,
   rank:sources*3+(it.coverage==='NOT_COMPARED'?0:2)+(related===false?-1:related?1:0)+CONF[it.confidence]+(text?1:0)};
 }
 // Relevance. Word overlap is too crude to call a topic irrelevant (on report 55, "Understand the Attribution Gaps"
 // shares no word with "ai citation tracker" and still belongs to it), so:
 //  - the AI meaning check judging that a topic does not serve this search: "probably not relevant", not written;
 //  - one ranking page only and no word in common with the search term: weak evidence, no section proposed and not
 //    recommended; it stays choosable (the owner sees and may choose every difference).
 for(const it of items){
  if(!it.writable)continue;
  if(it.fits_search==='NO'){
   const reason='the AI judged that this topic does not serve someone searching this term'+(it.fits_reason?' ('+clip(it.fits_reason,140)+')':'');
   it.group='NOT_RELEVANT';it.writable=false;it.relevance={status:'PROBABLY_NOT_RELEVANT',reason};
   it.priority.suggested_action='No section proposed: '+reason+'. Add it yourself only if you know it belongs on this page.';
   continue;
  }
  if(it.priority.sources<=1&&it.priority.search_relevance==='NO_WORD_IN_COMMON'&&it.confidence!=='AI_CONFIRMED_SAME_QUESTION'){
   it.relevance={status:'WEAK_EVIDENCE',reason:'only one ranking page covers it and it shares no word with the search term'};
   it.priority.suggested_action='No section proposed: only one ranking page covers it and it shares no word with the search term. Choose it only if you know it belongs on this page.';
  }
 }
 // Too little evidence (fewer than two readable ranking pages): nothing is recommended or written; the list stays visible.
 if(insufficient)for(const it of items)if(it.writable){
  it.priority.suggested_action=readable<MIN_READABLE_PAGES?'No section proposed: only '+readable+' readable ranking page'+(readable===1?'':'s')+', not enough evidence. Run the research again later.':
   'No section proposed: the research decision is "data blocked" (see the decision at the top).';
 }
 // Recommended: supported by at least two ranking pages, missing or partial, not contradicted by the AI. The link with the
 // search term is word-based, so it orders but never excludes.
 if(!insufficient)items.filter(it=>it.writable&&!it.relevance&&it.priority.sources>=2&&it.coverage!=='NOT_COMPARED'&&it.confidence!=='AI_SAYS_DIFFERENT_QUESTIONS')
  .sort((a,b)=>b.priority.rank-a.priority.rank).forEach(it=>{
   // Two items that may describe the same need are not both recommended: the better-supported one is.
   const n=items.filter(x=>x.recommended).length;
   if(n<MAX_RECOMMENDED&&!(it.possible_overlap||[]).some(o=>items.find(x=>x.id===o.id)?.recommended))it.recommended=true});
 // Within each group the recommended and best-supported items first; groups keep the order in which they were built.
 const order=new Map();items.forEach(it=>{if(!order.has(it.group))order.set(it.group,order.size)});
 items.sort((a,b)=>order.get(a.group)-order.get(b.group)||(b.recommended?1:0)-(a.recommended?1:0)||(b.priority?.rank||0)-(a.priority?.rank||0));
 for(const it of items){if(it.priority)delete it.priority.rank;if(it.merged&&!it.merged.length)delete it.merged}
}

// Possible overlaps between writable items (shared words beyond the search term), both ways, with the shared headings.
function markOverlaps(items,q){
 const w=items.filter(it=>it.writable);
 for(let i=0;i<w.length;i++)for(let j=i+1;j<w.length;j++){
  const a=w[i],b=w[j];
  const hit=[a.title,...a.examples.map(e=>e.heading)].some(x=>[b.title,...b.examples.map(e=>e.heading)].some(y=>mayOverlap(x,y,q)));
  if(!hit)continue;
  (a.possible_overlap=a.possible_overlap||[]).push({id:b.id,title:b.title,reason:'Shares words beyond the search term; not confirmed as the same need. Check before writing both.'});
  (b.possible_overlap=b.possible_overlap||[]).push({id:a.id,title:a.title,reason:'Shares words beyond the search term; not confirmed as the same need. Check before writing both.'});
 }
}

// Growth potential, apart from research priority. Search demand comes only from page-verified Search Console rows of this
// page (queries that share the item's own words, beyond the search term); without them it is "not measured", never low.
// Business fit is the owner's decision; nothing is estimated or forecast.
function growthPotential(items,report,q){
 const rows=(Array.isArray(report.destination_gsc_queries)?report.destination_gsc_queries:[]).filter(r=>r&&r.query&&Number(r.impressions)>=0);
 for(const it of items){
  if(!it.writable)continue;
  const own=words([it.title,it.reader_question].filter(Boolean).join(' ')).filter(x=>!matchedTerms([x],q).length);
  const hits=rows.length&&own.length?rows.filter(r=>matchedTerms(own,words(r.query)).length>=Math.min(2,own.length)):[];
  it.growth_potential={
   search_demand:!rows.length?{status:'NOT_MEASURED',note:'No page-verified Search Console data for this page; demand is not measured (not low).'}:
    hits.length?{status:'GSC_QUERIES_OBSERVED',queries:hits.slice(0,5).map(r=>({query:clip(r.query,120),impressions:Number(r.impressions),clicks:Number(r.clicks)||0})),
     impressions:hits.reduce((n,r)=>n+Number(r.impressions||0),0),note:'Queries this page already appears for in Search Console that share the item\'s words. Observed, not a forecast.'}:
    {status:'NO_MATCHING_GSC_QUERY',note:'Search Console has data for this page, but no query shares the item\'s own words.'},
   search_intent_link:it.priority?.search_relevance||'NO_SEARCH_TERM',
   adds_without_overlap:it.coverage==='MISSING'?(it.possible_overlap?.length?'MAY_OVERLAP_ANOTHER_ITEM':'NEW_TO_THE_PAGE'):it.coverage==='PARTIAL'?'EXTENDS_AN_EXISTING_SECTION':'NOT_COMPARED_WITH_THE_PAGE',
   business_fit:'YOUR_DECISION'};
 }
}

// Sections of this page with no counterpart on the readable ranking pages, listed to REVIEW and preserve, never written.
// Conservative and word-based: none of the heading's own words (the search term's words aside, at least two) is in any
// ranking-page heading or fragment, and no gap or AI topic points at the section. Unique is not the same as valuable or
// strong: those are separate statuses, "not assessed" until someone judges them (value) or results show it (strength).
const symbols=t=>String(t||'').replace(/[^\p{L}\p{N}\s?&'’.:,()-]/gu,' ').replace(/\s+/g,' ').trim();
function uniqueContent(ov,q=[],items=[]){
 if(!ov||ov.status!=='OBSERVED'||!(ov.ranking_pages_read>0)||!Array.isArray(ov.this_page_sections))return [];
 const theirs=[...(ov.ranking_pages||[]).flatMap(p=>p.content_headings||[]),...(ov.topics||[]).flatMap(t=>(t.sections||[]).map(s=>s.heading+' '+(s.excerpt||''))),
  ...(ov.ungrouped_sections||[]).map(s=>s.heading+' '+(s.excerpt||''))].map(words);
 const pointed=new Set([...(ov.topics||[]).map(t=>t.this_page_heading),...items.map(it=>it.your_section),...items.map(it=>it.placement?.section_heading)].filter(Boolean));
 const furniture=/^(?:table of contents|contents|in short|summary|related\b|frequently asked questions|faqs?|people also ask)/i;
 return ov.this_page_sections.filter(s=>!s.furniture&&!furniture.test(symbols(s.heading))&&!pointed.has(s.heading)&&(s.words==null||s.words>=40))
  .filter(s=>{const w=words(s.heading).filter(x=>!matchedTerms([x],q).length);return w.length>=2&&!theirs.some(t=>matchedTerms(w,t).length>0)})
  .slice(0,12).map(s=>({heading:s.heading,excerpt:clip(s.excerpt,200),
   uniqueness:'UNIQUE_BY_HEADING_WORDS',value:'NOT_ASSESSED',proven_strength:'NOT_MEASURED',
   note:'No ranking page read ('+ov.ranking_pages_read+') has a heading or fragment with these words. Review it: unique is not proof that it is correct, current or strong. It is not rewritten.'}));
}

module.exports={buildGapList,GROUPS,hostOf};
