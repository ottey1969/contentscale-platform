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
// furniture are never proposed. A table of contents counts in Dutch and Spanish too (owner 2026-11-22: "In dit artikel"). The advice is to shorten or move, never to delete without checking.
const PROTECT=/(contact|about us|author|review|testimonial|customers? say|why choose|reviews?|call us|free quote|get (?:a )?quote|estimate|get started|book|schedule|table of contents|related|privacy|terms|want to|ready to|let us|talk to|in this guide|in this article|contents|overview|summary|key takeaways|in dit artikel|in deze gids|inhoudsopgave|op deze pagina|en este art[ií]culo|en esta gu[ií]a|^\s*[ií]ndice\s*$|tabla de contenidos?|en esta p[aá]gina)/i;
// The page's own offer, contact and proof (owner 2026-11-20, contentscale.site homepage): "Done-For-You", "Team Handoff",
// "Ask your question", "See the Live Tracker", a case-study baseline… No competitor has these headings, and that is the
// point: they sell, invite or prove. Never proposed for shortening, in English, Dutch or Spanish.
const OWN_OFFER=/(done[- ]for[- ]you|do it yourself|\bdiy\b|hand-?off|ask (?:your|a|me|us)\b|your question|work (?:directly )?with|\bhire\b|pricing|\bprices?\b|\bplans?\b|packages?|free (?:scan|check|trial|audit|tool)|\btry\b|\bdemo\b|live tracker|tracker view|new here|start here|^new\s*[–—-]|starting point|before[- ]and[- ]after|case study|guarantee|warranty|tarifa|precio|presupuesto|contacto|cont[aá]ctame|hazlo|lo hago|lo hacemos|prijs|tarief|tarieven|offerte|uit handen|zelf doen|neem contact|direct contact)/i;
// A numbered step belongs to a process the page explains; one step is never trimmed on its own.
const STEP=/^\s*(?:step\s*)?\d+\s*[.):-]/i;
function trimCandidates({report,aiGap,items,queryWords,summaryGaps}){
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
 // A section listed as unique content to preserve is never also advised to shorten (owner 2026-11-20: "Voice Search
 // Optimisation" appeared under both). Adding is the safer advice.
 const unique=new Set(((summaryGaps&&summaryGaps.unique_content)||[]).map(x=>String(x&&x.heading||'').trim()).filter(Boolean));
 ov.this_page_sections.forEach((sec,i)=>{
  const h=String(sec.heading||'').trim();
  if(!h||i===0||sec.furniture||covered.has(h)||unique.has(h)||PROTECT.test(h)||OWN_OFFER.test(h)||STEP.test(h))return;
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

// Loose competitor sections that are no topic (owner 2026-11-21, /ai-zichtbaarheid/ brief): calls to action ("Ontvang je
// eerste maandplan…", "Bekijk voorbeeld"), self-check teasers ("Weet jij hoe zichtbaar je bent…?"), a paragraph caught
// as a heading, the rival's own brand line ("Jouw coo mpagnon…" on coodigital.nl) or its own way of working ("Zo werken
// wij"). They stay visible as research observations, never as content advice. Brand and "we" lines only when a single
// site has them: a way of working that several pages describe is a topic.
const CTA=/\b(?:bekijk (?:een |het )?voorbeeld|ontvang (?:je|jouw|direct|gratis)|vraag (?:je|jouw|een|direct|gratis)\b.*\baan|download|neem contact|plan (?:een|je|jouw) |boek (?:een|je)|bel (?:ons|direct)|gratis (?:scan|check|adviesgesprek|analyse|audit)|aanmelden|schrijf je in|request (?:a|your)|get your|book (?:a|your)|contact us|sign up|subscribe|free (?:scan|audit|check|consultation)|solicita|cont[aá]ctanos|descarga|reserva (?:una|tu)|pide (?:tu|una))\b/i;
const SELF_CHECK=/\b(?:weet jij|jouw website|je website|your website|tu (?:sitio|web)|sabes)\b[^?]*\?\s*$/i;
const GENERIC=/^\s*(?:de |la |el |the )?(?:korte )?(?:samenvatting|conclusie|inleiding|summary|conclusion|introduction|resumen|conclusi[oó]n|introducci[oó]n|tl;?dr|in het kort|in short|en resumen)\s*[:.!]?\s*$/i;
const WE=/\b(?:wij|we|ons|onze|our|us|nosotros|nuestr[oa]s?)\b/i;
const paragraph=t=>String(t).split(/\s+/).length>16||/[.!?]\s+\p{Lu}/u.test(String(t));
function brandLine(title,sites){
 const tw=String(title).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=3);
 return sites.some(s=>{const label=String(s).toLowerCase().replace(/^www\./,'').split('.')[0];return label.length>=5&&tw.some(w=>w!==label&&label.startsWith(w)&&w.length<=label.length-3)||tw.includes(label)});
}
function noiseReason(x){
 if(x.kind!=='TOPIC')return null;
 const t=String(x.title||'');
 if(CTA.test(t))return 'A call to action on a competitor page, not a topic.';
 if(SELF_CHECK.test(t))return 'An invitation to check your own site on a competitor page, not a topic.';
 if(paragraph(t))return 'A paragraph that was read as a heading, not a topic.';
 if(GENERIC.test(t))return 'A summary or introduction heading, not a topic.';
 const single=x.rankingPages+x.aiSites.length<=1&&!x.evidenceCheck;
 if(single&&brandLine(t,x.sites||[]))return 'The competitor’s own brand line, not a topic.';
 if(single&&WE.test(t))return 'How one competitor describes itself, not a topic.';
 // One competitor page, not even compared with this page: too little to call it advice (owner 2026-11-21: "zo veel punten").
 if(single&&(x.coverage==='UNKNOWN'||x.coverage==='NOT_COMPARED'))return 'Only one competitor page has this, and it was not compared with your page.';
 return null;
}
// A price topic or price fact is answered on the own page that already states the price (see best-own-page.cjs).
// Hiring the service (choosing a specialist, outsourcing, way of working, working together): from a guide page these
// belong on the service page found for this question, not on the guide.
const HIRE_TOPIC=/\b(?:specialist\w*|consultant\w*|consultancy|bureau\w*|agency|agencies|agencia\w*|uitbested\w*|inhuren|outsourc\w*|contratar|samenwerk\w*|werkwijze|aanpak|kiezen|kies|choose|choosing|hire|hiring)\b|GEO-(?:specialist|bureau|consultant|traject)/i;
// A hire topic counts as answered on the service page when a section there shares two meaningful words with it
// (heading and the start of its text), or half of the topic's words.
// Words compare on their first six letters ("samenwerking" and "samenwerken").
const stems=t=>new Set([...words(t)].map(w=>w.slice(0,6)));
const sectionFor=(title,sections)=>{const t=[...stems(title)];if(!t.length)return null;
 let bestS=null,bestN=0;for(const s of sections||[]){const w=stems(s.heading+' '+(s.excerpt||''));const n=t.filter(x=>w.has(x)).length;if(n>bestN){bestN=n;bestS=s}}
 return bestS&&(bestN>=2||bestN/t.length>=0.5)?bestS:null};
const PRICE_TOPIC=/\b(?:prijs|prijzen|kost|kosten|tarie[fv]\w*|price|prices|pricing|costs?|precios?|tarifas?|coste|costo)\b|prijzen|tarieven/i;

function buildContentPriorities({summary,aiGap,report,bestOwnPage=null}={}){
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
   factText:[it.title,...(it.examples||[]).map(e=>e.heading)].join(' '),sites,
   evidence:evidenceOf([...(it.examples||[]),...(match?match.t.examples||[]:[])],aiGap)});
 }
 // Topics only the pages AI systems cited cover: not lost because no ranking page has them.
 for(const a of aiTopics.filter(x=>!x.used)){
  const t=a.t,fr=(t.examples||[]).filter(e=>String(e.excerpt||'').length>=TEXT_MIN).length;
  items.push({kind:'TOPIC',id:'ai-'+a.i,title:t.topic,coverage:t.coverage==='PARTLY'?'PARTIAL':t.coverage==='MISSING'?'MISSING':'UNKNOWN',
   rankingPages:0,aiSites:a.sites,fragments:fr,searchWords:[...words(t.topic)].some(w=>queryWords.has(w)),evidenceCheck:false,confidence:null,
   where:'Where it answers the customer question best',factText:[t.topic,...(t.examples||[]).map(e=>e.heading)].join(' '),sites:a.sites,evidence:evidenceOf(t.examples,aiGap)});
 }
 // Facts the AI-cited pages state and this page does not: only the owner's own fact may be added.
 for(const f of (aiGap&&aiGap.missing_facts)||[]){
  items.push({kind:'FACT',id:'fact-'+f.key,title:f.label,coverage:'MISSING',rankingPages:0,aiSites:(f.sites||[]).slice(),fragments:0,searchWords:false,
   evidenceCheck:false,confidence:null,where:'Where a customer looks for it (for example near the contact details)',factText:f.label,forceFact:true,
   evidence:evidenceOf(f.example?[{site:f.example.site}]:[],aiGap)});
 }
 const observations=[];
 const kept=items.filter(x=>{const why=noiseReason(x);if(why){observations.push({title:x.title,reason:why,sources:x.evidence.map(e=>e.url)});return false}return true});
 const best=bestOwnPage&&bestOwnPage.status==='FOUND'&&bestOwnPage.url?bestOwnPage:null;
 // The live page states a price now (for example added after this research ran): the price items are checks, not open work.
 const onPage=bestOwnPage&&bestOwnPage.status==='THIS_PAGE_HAS_PRICE'?bestOwnPage:null;
 const scored=kept.map(x=>{
  const points=[];
  const add=(k,n=1)=>{if(n)points.push(WEIGHT[k]*n)};
  add('ranking_page',x.rankingPages);add('ai_cited_site',x.aiSites.length);
  if(x.coverage==='MISSING')add('missing');else if(x.coverage==='PARTIAL')add('partial');
  if(x.fragments>=2)add('text_fragments');if(x.searchWords)add('search_words');if(x.evidenceCheck)add('evidence_check');
  if(x.confidence==='AI_CONFIRMED_SAME_QUESTION')add('ai_confirmed');if(x.confidence==='AI_SAYS_DIFFERENT_QUESTIONS')add('ai_disagrees');
  const score=points.reduce((a,b)=>a+b,0);
  const needsFact=!!x.forceFact||BUSINESS_FACT.test(x.factText);
  const systems=aiSystemsFor(x.aiSites,aiGap);
  const priceItem=(!!best||!!onPage)&&(x.id==='fact-price'||(x.kind==='TOPIC'&&PRICE_TOPIC.test(x.title)));
  const hireItem=!priceItem&&!!best&&x.kind==='TOPIC'&&HIRE_TOPIC.test(x.title);
  const there=hireItem?sectionFor(x.title,best.service_sections):null;
  const action=priceItem?(best?(best.also_on_this_page?'PRICE_LINKED':'LINK_OWN_PRICE'):'PRICE_ON_PAGE'):hireItem?(there?'ON_SERVICE_PAGE_DONE':'ON_SERVICE_PAGE'):x.kind==='PAGE_ELEMENT'?'ADD_ELEMENT':x.kind==='FACT'?'ADD_OWN_FACT':x.coverage==='PARTIAL'?'IMPROVE':'ADD';
  const why=[];
  if(x.rankingPages)why.push(x.rankingPages+' ranking page'+(x.rankingPages===1?' covers':'s cover')+' it');
  if(x.aiSites.length)why.push(x.aiSites.length+' page'+(x.aiSites.length===1?' cited by AI systems covers':'s cited by AI systems cover')+' it');
  if(systems.length)why.push('Cited by: '+systems.join(', '));
  why.push(x.coverage==='MISSING'?'Not on your page':x.coverage==='PARTIAL'?'Only partly on your page':'Not compared with your page');
  if(x.searchWords)why.push('Shares words with the search term');
  if(x.fragments>=2)why.push(x.fragments+' fragments of competitor text to work from');
  if(x.kind==='TOPIC')why.push(x.evidenceCheck?'Passed the evidence check (two ranking pages)':'Not confirmed by the evidence check');
  // Separate sentences, with the topic in quotes, so the page can show each sentence in Dutch or Spanish.
  const parts=action==='PRICE_LINKED'?['Done: this page already names your price and links to '+best.url,'Nothing to add here; keep the price on that page up to date.']:
   action==='ON_SERVICE_PAGE_DONE'?['Already on your service page under “'+there.heading+'”: '+best.url,'Check that section answers “'+x.title+'”; nothing to add on this page.']:
   action==='ON_SERVICE_PAGE'?['This is about hiring you, so it belongs on your service page: '+best.url,'Add “'+x.title+'” there, not on this page (check that page with this search term).']:action==='PRICE_ON_PAGE'?['Your page now states a price: “'+String(onPage.excerpt||'').trim()+'”.','Check that it answers “'+x.title+'” fully; add only what is still missing, with your own confirmed facts.']:action==='LINK_OWN_PRICE'?['Your price page: '+best.url,'Answer “'+x.title+'” there, not on this page.','On this page, add one short line that links to it.']:[action==='IMPROVE'?'Extend your existing section with a clear answer about “'+x.title+'”.':
   action==='ADD_ELEMENT'?'Add this page element yourself: “'+x.title+'”.':
   action==='ADD_OWN_FACT'?'Add your own “'+x.title+'” only if you can confirm it.':
   'Add a section that answers “'+x.title+'” in your own words.'];
  const elsewhere=['LINK_OWN_PRICE','PRICE_ON_PAGE','PRICE_LINKED','ON_SERVICE_PAGE','ON_SERVICE_PAGE_DONE'].includes(action);
  if(needsFact&&action!=='ADD_OWN_FACT'&&!elsewhere)parts.push('Only if this is true for your business: use your own confirmed facts, never the numbers or claims of other sites.');
  parts.push('Do not copy the example pages.');
  const instruction=parts.join(' ');
  return {kind:x.kind,id:x.id,title:x.title,action,where:action==='LINK_OWN_PRICE'?'Where the price question comes up on this page':(action==='ON_SERVICE_PAGE'||action==='ON_SERVICE_PAGE_DONE')?'On your service page':x.where,score,tier:tierOf(score),verified:!researchOnly&&x.evidenceCheck,
   needs_business_fact:needsFact&&!['PRICE_LINKED','PRICE_ON_PAGE','ON_SERVICE_PAGE_DONE'].includes(action),instruction,instruction_parts:parts,why,
   signals:{ranking_pages:x.rankingPages,ai_cited_sites:x.aiSites.length,ai_systems:systems,coverage:x.coverage,competitor_text_fragments:x.fragments,
    shares_search_words:x.searchWords,passed_evidence_check:x.evidenceCheck},
   evidence:x.evidence};
 });
 // A question that belongs on another own page says nothing about which sections of this page are needed (owner
 // 2026-11-21: the guide's own tool features and GEO pillars were advised to shorten for a hire question).
 const trim=best?[]:trimCandidates({report,aiGap,items:gaps.items||[],queryWords,summaryGaps:gaps});
 const trim_note=best?'Nothing is advised to shorten: this page was not checked against its own question. This search question belongs on '+best.url:null;
 const later=x=>({ON_SERVICE_PAGE:1,PRICE_ON_PAGE:2,PRICE_LINKED:2,ON_SERVICE_PAGE_DONE:2})[x.action]||0;
 scored.sort((a,b)=>later(a)-later(b)||b.score-a.score||Number(b.verified)-Number(a.verified)||a.title.localeCompare(b.title));
 scored.forEach((x,i)=>{x.rank=i+1});
 return {status:!scored.length&&!trim.length?'NOTHING_FOUND':researchOnly?'RESEARCH_ONLY':'READY_FOR_EDITORIAL_REVIEW',publish_allowed:false,decision,
  method:'Score = 3 × ranking pages that cover it + 2 × pages cited by AI systems that cover it + 2 if missing on your page (1 if partly) '+
   '+ 1 with competitor text to work from + 1 if it shares words with the search term + 2 if it passed the evidence check. '+
   'A count of observed research signals, not a traffic prediction.',
  best_own_page:best?{url:best.url,excerpt:best.excerpt||null,
   line:'Best match on your site for this question: '+best.url+' (it already states your price). Answer the price there; on this page, add one short line that links to it.'+(scored.some(x=>x.action==='ON_SERVICE_PAGE')?' Topics about hiring you are marked “Belongs on your service page”: add them there.':'')}:null,
  items:scored.map(({rank,...x})=>({rank,...x})),observations,trim,trim_note,keep:(gaps.unique_content||[]).filter(x=>!trim.some(t=>t.heading===x.heading)).map(x=>({heading:x.heading}))};
}

// Tracker Growth uses the same list from its own report (owner 2026-11-19: "Growth has the same set-up as Free").
function prioritiesForTrackerReport(report){
 if(!report||!report.gap_list||!Array.isArray(report.gap_list.items))return null;
 const gate=report.editorial_decision_gate||{};
 return buildContentPriorities({summary:{decision:gate.decision||null,query:report.gap_list.focus_query||gate.focus_query||null,gaps:report.gap_list},
  aiGap:report.ai_check&&report.ai_check.gap||null,report});
}

module.exports={buildContentPriorities,prioritiesForTrackerReport,WEIGHT};
