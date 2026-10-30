'use strict';
// One list of every difference between this page and the readable ranking pages, for the editor to choose from.
// Shared by the Tracker (Growth research page) and the standalone check. Research always produces it; AI only labels
// (a judged reader question, an AI-grouped topic) and every item keeps its competitor evidence, so an AI failure
// never removes anything. Writing happens only for items the owner selects (growth-selected-writing.cjs).
const clip=(x,n)=>String(x==null?'':x).replace(/\s+/g,' ').trim().slice(0,n);
const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return ''}};
const PAGE={NOT_OBSERVED:'Not on your page',PARTIAL:'Partly on your page'};
const TOPIC={NO:'Not on your page',PARTLY:'Partly on your page',UNKNOWN:'Not matched to your page'};
const GROUPS=[['QUESTION','Questions two ranking pages answer'],['MISSING_TOPIC','Not on your page'],['PARTIAL_TOPIC','Partly on your page'],
 ['PAGE_ELEMENT','Page elements the ranking pages have'],['UNMATCHED_TOPIC','Could not be matched to your page'],['COMPETITOR_SECTION','Sections on the ranking pages (not grouped)']];

function buildGapList(report={}){
 const ov=report.competitor_overview,coverage=report.reader_task_coverage||{};
 const positions=new Map((report.search_discovery?.competitor_fetch_log||[]).map(x=>[x.url,x.serp_position]));
 const items=[];
 // 1. Reader questions two ranking pages answer (word-matched candidates; AI label says whether the meaning was confirmed).
 for(const t of coverage.tasks||[]){
  if(!t.supported_by_competitors||t.destination?.status==='COVERED')continue;
  const confirmed=t.meaning?.status==='SAME_QUESTION';
  items.push({id:'q-'+t.code,group:'QUESTION',writable:true,
   title:confirmed?t.reader_question:clip(String(t.label||'').replace(/^Competitors teach\s*/i,'').replace(/^[“"]|[”"]$/g,''),200),
   reader_question:confirmed?t.reader_question:null,
   status:PAGE[t.destination?.status]||'Not on your page',
   ai:confirmed?'AI: same reader question on '+t.independent_sources+' ranking pages':t.meaning?'AI: not judged (shared words only)':'Shared words only (no AI check)',
   your_section:t.destination?.judged_heading||null,placement:t.placement||null,ranking_pages:t.independent_sources||null,
   examples:(t.competitor_support||[]).slice(0,4).map(s=>({site:s.host,url:s.url||null,heading:clip(s.heading,160),excerpt:clip(s.excerpt,400),position:positions.get(s.url)??null}))});
 }
 if(ov&&ov.status==='OBSERVED'){
  // 2. Topics of the ranking pages, grouped by AI when available; without it every section is listed on its own.
  if(ov.topics_status==='GROUPED'){
   (ov.topics||[]).forEach((t,i)=>{if(t.this_page==='YES')return;
    items.push({id:'t-'+i,group:t.this_page==='NO'?'MISSING_TOPIC':t.this_page==='PARTLY'?'PARTIAL_TOPIC':'UNMATCHED_TOPIC',writable:true,
     title:clip(t.topic,200),reader_question:null,status:TOPIC[t.this_page]||TOPIC.UNKNOWN,ai:'AI-grouped topic',
     your_section:t.this_page_heading||null,ranking_pages:t.ranking_pages,
     placement:t.this_page==='PARTLY'&&t.this_page_heading?{mode:'EXTEND_SECTION',section_heading:t.this_page_heading}:null,
     examples:(t.sections||[]).slice(0,4).map(s=>({site:s.host,url:s.url||null,heading:s.heading,excerpt:clip(s.excerpt,400),position:s.position??null}))})});
  }
  (ov.ungrouped_sections||[]).forEach((x,i)=>items.push({id:'s-'+i,group:'COMPETITOR_SECTION',writable:true,
   title:clip(x.heading,200),reader_question:null,status:'Not compared with your page',ai:ov.topics_status==='GROUPED'?'Not placed in a topic by AI':'Not grouped ('+String(ov.topics_status||'').toLowerCase().replace(/_/g,' ')+')',
   your_section:null,placement:null,ranking_pages:1,examples:[{site:x.host,url:x.url||null,heading:x.heading,excerpt:clip(x.excerpt,400),position:x.position??null}]}));
  // 3. Page elements most ranking pages have (deterministic); the editor adds these, they are not written.
  for(const f of ov.elements_they_have_and_this_page_lacks||[])
   items.push({id:'e-'+f.key,group:'PAGE_ELEMENT',writable:false,title:f.label,status:'Not on your page',ai:null,ranking_pages:f.ranking_pages_with_it,of:f.of,examples:[]});
  for(const f of ov.structured_data_they_have_and_this_page_lacks||[])
   items.push({id:'e-schema-'+f.type,group:'PAGE_ELEMENT',writable:false,title:'Structured data: '+f.type,status:'Not on your page',ai:null,ranking_pages:f.ranking_pages_with_it,of:f.of,examples:[]});
  const L=ov.length||{};
  if(L.ranking_pages_median_words&&L.this_page_words<L.ranking_pages_median_words*0.6)
   items.push({id:'e-length',group:'PAGE_ELEMENT',writable:false,title:'Length',status:'Your page has '+L.this_page_words+' words; ranking pages have about '+L.ranking_pages_median_words,ai:null,ranking_pages:null,examples:[]});
 }
 const status=items.length||ov?.status==='OBSERVED'?'OBSERVED':(ov?.status||'NOT_AVAILABLE');
 return {status,groups:GROUPS.map(([id,label])=>({id,label})),items,
  ranking_pages_read:ov?.ranking_pages_read??(coverage.competitors_considered||[]).length,
  ranking_pages:(ov?.ranking_pages||[]).map(p=>({url:p.url,position:p.serp_position??null})),
  // The page as researched: writing refuses when the live page no longer matches (re-run the research instead).
  source_fingerprint:ov?.this_page_fingerprint||null,
  focus_query:clip(report.editorial_decision_gate?.focus_query||report.search_discovery?.target_query||'',160)||null,
  note:'What the readable ranking pages contain and your page does not. Not a fact check and not a ranking promise: you choose what goes on your site; text is only written for what you select.'};
}

module.exports={buildGapList,GROUPS,hostOf};
