'use strict';
// One list for the editor (owner 2026-11-19): what to put into the content, from most to least important.
// It is built only from what the research observed — ranking pages that cover a topic, pages AI systems cited, and
// whether this page already covers it. The score is a transparent count of those signals, not a prediction: the
// weights are fixed and every item says which signals placed it there. Nothing is published and no business fact is
// written: topics that need the owner's own facts (prices, service area, 24/7, licences, guarantees) are marked.

const STOP=new Set(['about','after','again','also','and','any','are','before','being','best','both','can','does','doing','each','for','from',
 'have','here','how','into','its','just','more','most','much','near','not','only','other','our','out','over','own','same','should','some',
 'such','than','that','the','their','them','then','there','these','they','this','those','through','under','very','was','were','what',
 'when','where','which','while','who','why','will','with','would','you','your']);
const words=t=>new Set(String(t||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').split(/[^a-z0-9]+/)
 .filter(w=>w.length>3&&!STOP.has(w)).map(w=>w.replace(/ings?$/,'').replace(/([^s])s$/,'$1')));
// Business facts the owner must confirm before they are written (never taken from competitors).
const BUSINESS_FACT=/(service area|\bserv(?:e|es|ing)\b|all\s+\d+\s+counties|\bcounties\b|24\s*\/?\s*7|\blicen[sc]|\binsured\b|warrant|guarantee|years?\s+(?:of\s+)?experience|\bcosts?\b|\bprices?\b|\bpricing\b|[$€£]\s?\d|free\s+(?:quote|estimate|inspection)|response time|arrival time|within\s+\d+\s+(?:minutes|hours))/i;
const WEIGHT={ranking_page:3,ai_cited_site:2,missing:2,partial:1,text_fragments:1,search_words:1,evidence_check:2,ai_confirmed:1,ai_disagrees:-3};
const TIERS=[[14,'MOST_IMPORTANT'],[9,'IMPORTANT'],[5,'USEFUL'],[-Infinity,'OPTIONAL']];
const tierOf=score=>TIERS.find(([min])=>score>=min)[1];
const TEXT_MIN=75;

function aiSystemsFor(sites,aiGap){
 const out=[];
 for(const p of (aiGap&&aiGap.pages)||[])if(sites.includes(p.site))for(const s of p.cited_by||[])if(!out.includes(s))out.push(s);
 return out;
}
function aiUrlFor(site,aiGap){const p=((aiGap&&aiGap.pages)||[]).find(x=>x.site===site);return p&&p.url||null}
function whereOf(it){
 const h=it.placement&&it.placement.section_heading;
 if(h)return (it.placement.mode==='EXTEND_SECTION'?'In your section “':'After your section “')+h+'”';
 if(it.your_section)return 'In your section “'+it.your_section+'”';
 return 'Where it answers the customer question best';
}
function evidenceOf(examples,aiGap){
 const seen=new Set(),out=[];
 for(const e of examples||[]){const url=e.url||aiUrlFor(e.site,aiGap);if(!url||seen.has(url))continue;seen.add(url);
  out.push({url,site:e.site||null,heading:e.heading||null})}
 return out;
}
// A Google topic and an AI topic are the same need when they share a meaningful word beyond the search term and either
// come from the same site or share at least half of their words.
function sameNeed(a,b,queryWords){
 const A=new Set([...words(a.text)].filter(w=>!queryWords.has(w))),B=new Set([...words(b.text)].filter(w=>!queryWords.has(w)));
 const shared=[...A].filter(w=>B.has(w)).length;if(!shared)return false;
 const ratio=shared/Math.max(1,Math.min(A.size,B.size));
 return ratio>=0.5||a.sites.some(s=>b.sites.includes(s));
}

// Sections of this page that do not serve this search (owner 2026-11-19): not only what to add, but what makes the page
// long without answering the searcher. Proposed only from the page comparison: no ranking page and no AI-cited page
// covers the section, and it shares no word with the search term. Introductions, trust and contact sections and page
// furniture are never proposed. The advice is to shorten or move, never to delete without checking.
const PROTECT=/(contact|about us|author|review|testimonial|customers? say|why choose|reviews?|call us|free quote|get (?:a )?quote|estimate|get started|book|schedule|table of contents|related|privacy|terms|want to|ready to|let us|talk to|in this guide|in this article|contents|overview|summary|key takeaways)/i;
// A numbered step belongs to a process the page explains; one step is never trimmed on its own.
const STEP=/^\s*(?:step\s*)?\d+\s*[.):-]/i;
function trimCandidates({report,aiGap,items,queryWords}){
 const ov=report&&report.competitor_overview;
 if(!ov||ov.status!=='OBSERVED'||!Array.isArray(ov.this_page_sections))return [];
 const covered=new Set();
 for(const t of ov.topics||[])if((t.this_page==='YES'||t.this_page==='PARTLY')&&t.this_page_heading)covered.add(t.this_page_heading);
 for(const it of items)for(const h of [it.your_section,it.placement&&it.placement.section_heading])if(h)covered.add(h);
 const otherWords=new Set();
 const addWords=t=>{for(const w of words(t))otherWords.add(w)};
 for(const pg of ov.ranking_pages||[])for(const h of pg.content_headings||[])addWords(h);
 for(const t of ov.topics||[]){addWords(t.topic);for(const sec of t.sections||[])addWords(sec.heading)}
 for(const sec of ov.ungrouped_sections||[])addWords(sec.heading);
 for(const pg of (aiGap&&aiGap.pages)||[])for(const h of pg.headings||[])addWords(h.text);
 for(const t of (aiGap&&aiGap.missing_topics)||[])addWords(t.topic);
 const aiTexts=((aiGap&&aiGap.missing_topics)||[]).map(t=>({text:[t.topic,...(t.examples||[]).map(e=>e.heading)].join(' '),sites:[]}));
 const out=[];
 ov.this_page_sections.forEach((sec,i)=>{
  const h=String(sec.heading||'').trim();
  if(!h||i===0||sec.furniture||covered.has(h)||PROTECT.test(h)||STEP.test(h))return;
  const hw=words(h);
  if([...hw].some(w=>queryWords.has(w)))return;
  // Something ranking or AI-cited pages also write about (any shared meaningful word in their headings) is in scope
  // for this search; word matching is too crude to call it off-topic (owner 2026-11-19, PRT emergency page).
  if([...hw].some(w=>otherWords.has(w)))return;
  if(aiTexts.some(a=>sameNeed({text:h,sites:[]},a,queryWords)))return;
  out.push({heading:h,words:Number(sec.words)||null,action:'SHORTEN_OR_MOVE',
   reason:'No ranking page or AI-cited page covers this, and it shares no word with the search term.',
   instruction:'Check whether someone searching this term needs it. Shorten it, or move it to a page where it belongs and link to it. Do not delete it before checking its own Search Console clicks.'});
 });
 return out.sort((a,b)=>(b.words||0)-(a.words||0)||a.heading.localeCompare(b.heading));
}

function buildContentPriorities({summary,aiGap,report}={}){
 const s=summary||{},gaps=s.gaps||{},decision=s.decision||null;
 const researchOnly=decision==='DATA_BLOCKED'||decision==='NO_CHANGE';
 const queryWords=words(s.query||(s.checked&&(s.checked.search_term||s.checked.query))||(report&&report.competitor_overview&&report.competitor_overview.query)||'');
 const aiTopics=((aiGap&&aiGap.missing_topics)||[]).map((t,i)=>({i,t,text:t.topic,sites:(t.sites||[]).slice(),used:false}));
 const items=[];
 for(const it of gaps.items||[]){
  if(it.group==='NOT_RELEVANT')continue;
  const element=it.group==='PAGE_ELEMENT';
  const sites=[...new Set((it.examples||[]).map(e=>e.site).filter(Boolean))];
  const match=element?null:aiTopics.find(a=>!a.used&&sameNeed({text:[it.title,...(it.examples||[]).map(e=>e.heading)].join(' '),sites},a,queryWords));
  if(match)match.used=true;
  const aiSites=match?[...new Set([...match.sites])]:[];
  const pr=it.priority||{};
  items.push({kind:element?'PAGE_ELEMENT':'TOPIC',id:String(it.id),title:it.title,coverage:it.coverage||'UNKNOWN',
   rankingPages:Number(pr.sources??sites.length)||0,aiSites,fragments:Number(pr.competitor_text_fragments)||0,
   searchWords:pr.search_relevance==='SHARES_WORDS_WITH_SEARCH_TERM',evidenceCheck:it.recommended===true,confidence:it.confidence||null,
   where:element?'On the page (layout or structured data)':whereOf(it),
   factText:[it.title,...(it.examples||[]).map(e=>e.heading)].join(' '),
   evidence:evidenceOf([...(it.examples||[]),...(match?match.t.examples||[]:[])],aiGap)});
 }
 // Topics only the pages AI systems cited cover: not lost because no ranking page has them.
 for(const a of aiTopics.filter(x=>!x.used)){
  const t=a.t,fr=(t.examples||[]).filter(e=>String(e.excerpt||'').length>=TEXT_MIN).length;
  items.push({kind:'TOPIC',id:'ai-'+a.i,title:t.topic,coverage:t.coverage==='PARTLY'?'PARTIAL':t.coverage==='MISSING'?'MISSING':'UNKNOWN',
   rankingPages:0,aiSites:a.sites,fragments:fr,searchWords:[...words(t.topic)].some(w=>queryWords.has(w)),evidenceCheck:false,confidence:null,
   where:'Where it answers the customer question best',factText:[t.topic,...(t.examples||[]).map(e=>e.heading)].join(' '),evidence:evidenceOf(t.examples,aiGap)});
 }
 // Facts the AI-cited pages state and this page does not: only the owner's own fact may be added.
 for(const f of (aiGap&&aiGap.missing_facts)||[]){
  items.push({kind:'FACT',id:'fact-'+f.key,title:f.label,coverage:'MISSING',rankingPages:0,aiSites:(f.sites||[]).slice(),fragments:0,searchWords:false,
   evidenceCheck:false,confidence:null,where:'Where a customer looks for it (for example near the contact details)',factText:f.label,forceFact:true,
   evidence:evidenceOf(f.example?[{site:f.example.site}]:[],aiGap)});
 }
 const scored=items.map(x=>{
  const points=[];
  const add=(k,n=1)=>{if(n)points.push(WEIGHT[k]*n)};
  add('ranking_page',x.rankingPages);add('ai_cited_site',x.aiSites.length);
  if(x.coverage==='MISSING')add('missing');else if(x.coverage==='PARTIAL')add('partial');
  if(x.fragments>=2)add('text_fragments');if(x.searchWords)add('search_words');if(x.evidenceCheck)add('evidence_check');
  if(x.confidence==='AI_CONFIRMED_SAME_QUESTION')add('ai_confirmed');if(x.confidence==='AI_SAYS_DIFFERENT_QUESTIONS')add('ai_disagrees');
  const score=points.reduce((a,b)=>a+b,0);
  const needsFact=!!x.forceFact||BUSINESS_FACT.test(x.factText);
  const systems=aiSystemsFor(x.aiSites,aiGap);
  const action=x.kind==='PAGE_ELEMENT'?'ADD_ELEMENT':x.kind==='FACT'?'ADD_OWN_FACT':x.coverage==='PARTIAL'?'IMPROVE':'ADD';
  const why=[];
  if(x.rankingPages)why.push(x.rankingPages+' ranking page'+(x.rankingPages===1?' covers':'s cover')+' it');
  if(x.aiSites.length)why.push(x.aiSites.length+' page'+(x.aiSites.length===1?' cited by AI systems covers':'s cited by AI systems cover')+' it');
  if(systems.length)why.push('Cited by: '+systems.join(', '));
  why.push(x.coverage==='MISSING'?'Not on your page':x.coverage==='PARTIAL'?'Only partly on your page':'Not compared with your page');
  if(x.searchWords)why.push('Shares words with the search term');
  if(x.fragments>=2)why.push(x.fragments+' fragments of competitor text to work from');
  if(x.kind==='TOPIC')why.push(x.evidenceCheck?'Passed the evidence check (two ranking pages)':'Not confirmed by the evidence check');
  // Separate sentences, with the topic in quotes, so the page can show each sentence in Dutch or Spanish.
  const parts=[action==='IMPROVE'?'Extend your existing section with a clear answer about “'+x.title+'”.':
   action==='ADD_ELEMENT'?'Add this page element yourself: “'+x.title+'”.':
   action==='ADD_OWN_FACT'?'Add your own “'+x.title+'” only if you can confirm it.':
   'Add a section that answers “'+x.title+'” in your own words.'];
  if(needsFact&&action!=='ADD_OWN_FACT')parts.push('Only if this is true for your business: use your own confirmed facts, never the numbers or claims of other sites.');
  parts.push('Do not copy the example pages.');
  const instruction=parts.join(' ');
  return {kind:x.kind,id:x.id,title:x.title,action,where:x.where,score,tier:tierOf(score),verified:!researchOnly&&x.evidenceCheck,
   needs_business_fact:needsFact,instruction,instruction_parts:parts,why,
   signals:{ranking_pages:x.rankingPages,ai_cited_sites:x.aiSites.length,ai_systems:systems,coverage:x.coverage,competitor_text_fragments:x.fragments,
    shares_search_words:x.searchWords,passed_evidence_check:x.evidenceCheck},
   evidence:x.evidence};
 });
 const trim=trimCandidates({report,aiGap,items:gaps.items||[],queryWords});
 scored.sort((a,b)=>b.score-a.score||Number(b.verified)-Number(a.verified)||a.title.localeCompare(b.title));
 scored.forEach((x,i)=>{x.rank=i+1});
 return {status:!scored.length&&!trim.length?'NOTHING_FOUND':researchOnly?'RESEARCH_ONLY':'READY_FOR_EDITORIAL_REVIEW',publish_allowed:false,decision,
  method:'Score = 3 × ranking pages that cover it + 2 × pages cited by AI systems that cover it + 2 if missing on your page (1 if partly) '+
   '+ 1 with competitor text to work from + 1 if it shares words with the search term + 2 if it passed the evidence check. '+
   'A count of observed research signals, not a traffic prediction.',
  items:scored.map(({rank,...x})=>({rank,...x})),trim,keep:(gaps.unique_content||[]).filter(x=>!trim.some(t=>t.heading===x.heading)).map(x=>({heading:x.heading}))};
}

module.exports={buildContentPriorities,WEIGHT};
