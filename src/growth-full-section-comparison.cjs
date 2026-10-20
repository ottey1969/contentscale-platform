'use strict';
// Read-only source comparison. Distinguishes observed text from proven missing facts.
// No generative templates, paid API dependencies or publication rights.
const strip=s=>String(s||'').replace(/<(?:script|style|nav|footer|form|noscript)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|nav|footer|form|noscript)>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:amp|nbsp|quot|#39);/gi,' ').replace(/\s+/g,' ').trim();
const STOP=new Set(['that','this','with','from','your','have','been','will','into','than','their','content','scale','scaling','page','pages','about','which','when','what','where','should','more','before','after','using','also','these']);
const stem=w=>w.endsWith('ies')?w.slice(0,-3)+'y':
 w.endsWith('ing')&&w.length>6?w.slice(0,-3).replace(/e$/,''):
 w.endsWith('ed')&&w.length>5?w.slice(0,-2):
 w.endsWith('s')&&w.length>5?w.slice(0,-1):w;
const tokens=s=>[...new Set((strip(s).toLowerCase().match(/[a-z]{4,}/g)||[])
 .filter(w=>!STOP.has(w)).map(stem))];
function isEditorialHeading(heading,query){
 const h=String(heading||'').trim();
 if(/\b(?:book a demo|register now|get a demo|request demo|contact sales|subscribe|free trial|case study|see how .* keeps .* on.brand|our customers|related posts|recommended articles)\b/i.test(h))return false;
 const q=tokens(query),ht=new Set(tokens(h));
 // A general section heading is useful only when it describes an editorial task
 // or directly names a concept from the chosen search query.
 return q.some(w=>ht.has(w))||/\b(?:strategy|strategies|process|workflow|repurpos|audit|measur|roi|blog|quality|planning|publishing)\w*\b/i.test(h);
}
function topicTerms(query){return [...new Set(String(query||'').toLowerCase().match(/[a-z]{4,}/g)||[])].map(w=>w.replace(/(?:ing|ed|es|s)$/,'')).filter(w=>w.length>=4);}
function sections(html,truncated=false){
 const safe=String(html||'').slice(0,120000).replace(/<(script|style|nav|footer|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
 const heads=[...safe.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]\s*>/gi)].slice(0,50);
 return heads.filter((_,i)=>!truncated||i<heads.length-1).map((m,i)=>{
  const body=strip(safe.slice(m.index+m[0].length,heads[i+1]?.index||safe.length));
  return {heading:strip(m[1]).slice(0,180),text:body.slice(0,2500),words:body.split(/\s+/).filter(Boolean).length};
 }).filter(x=>x.heading&&x.words>=30);
}
function compareFullSections({query='',ownUrl='',ownHtml='',ownTruncated=false,competitors=[]}={}){
 if(!ownHtml)return {status:'OWN_SOURCE_INCOMPLETE',verified_gap:false,copy_ready:false,comparisons:[]};
 const own=sections(ownHtml,ownTruncated),comparison=[];
 const qt=tokens(query),topic=topicTerms(query);
 for(const item of competitors.slice(0,4)){
  if(!item?.live?.html)continue;
  const theirs=sections(item.live.html,item.live.truncated===true);
  for(const section of theirs){
   if(!isEditorialHeading(section.heading,query))continue;
   const st=tokens(section.heading+' '+section.text.slice(0,300));
   if(qt.length&&!qt.some(x=>st.includes(x)))continue;
   // 'content scaling' has zero distinctive tokens after common-word removal.
   // Preserve an explicit topic gate rather than accidentally matching every heading.
   const headline=section.heading.toLowerCase();
   const topicHits=topic.filter(x=>headline.includes(x)).length;
   if(!qt.length&&topic.length>=2&&topicHits===0&&
      !/\b(?:repurpos|audit|measur|planning|strategy|strategies|workflow|publish|creation)\w*\b/i.test(headline))continue;
   const ranked=own.map(o=>{
    const a=tokens(section.text),b=new Set(tokens(o.text)),overlap=a.filter(t=>b.has(t));
    const headingTerms=new Set(tokens(o.heading)),competitorHeadingTerms=tokens(section.heading);
    const headingAgreement=competitorHeadingTerms.filter(t=>headingTerms.has(t)).length;
    const coverage=a.length?Math.round(overlap.length/a.length*100):0;
    return {url:ownUrl,heading:o.heading,excerpt:o.text.slice(0,650),shared_terms:overlap.slice(0,12),lexical_coverage_pct:coverage,
     heading_shared_terms:headingAgreement,eligible_match:(headingAgreement>0&&overlap.length>=1)||
      (coverage>=20&&overlap.length>=4)};
   }).filter(x=>x.eligible_match).sort((a,b)=>(b.heading_shared_terms-a.heading_shared_terms)||
    (b.lexical_coverage_pct-a.lexical_coverage_pct));
   comparison.push({competitor_url:item.url,competitor_heading:section.heading,
    competitor_excerpt:section.text.slice(0,900),competitor_word_count:section.words,
    nearest_existing_section:ranked[0]||null,
    match_status:ranked.length?'POSSIBLE_TOPICAL_MATCH_REVIEW_REQUIRED':'NO_RELIABLE_SECTION_MATCH',
    source_scope:ownTruncated||item.live.truncated?'PARTIAL_HTML_OBSERVATION':'BOUNDED_HTML_OBSERVATION',
    assessment:'UNVERIFIED_READER_NEED',verified_gap:false,
    reason:'Observed full HTML section excerpts and lexical overlap cannot alone prove missing information, improved ranking, or a factual advantage.'});
  }
 }
 comparison.sort((a,b)=>
  Number(!!b.nearest_existing_section)-Number(!!a.nearest_existing_section)||
  (b.nearest_existing_section?.lexical_coverage_pct??0)-(a.nearest_existing_section?.lexical_coverage_pct??0));
 return {status:comparison.length?'FULL_SECTION_COMPARISON_RESEARCH_ONLY':'NO_COMPARABLE_COMPLETE_SECTIONS',
  focus_query:query,own_url:ownUrl,own_sections_observed:own.length,competitor_sections_compared:comparison.length,
  own_html_truncated:ownTruncated,comparison_scope:ownTruncated||competitors.some(x=>x.live?.truncated)?'PARTIAL_SOURCE_NO_ABSENCE_CLAIMS':'BOUNDED_SOURCE_NO_ABSENCE_CLAIMS',
  comparisons:comparison.slice(0,6),verified_gap:false,copy_ready:false,
  editorial_decision:'VERIFY_UNANSWERED_READER_TASK_OR_NO_CHANGE',
  requirement:'Only complete sections wholly present in captured HTML may be compared. Truncated captures never prove absence. Verify actual user task, factual difference and page intent before writing.'};
}
module.exports={compareFullSections,sections,isEditorialHeading,topicTerms};
