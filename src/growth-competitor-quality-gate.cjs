'use strict';
// ONE definition of a "readable competitor article", shared by eligibility and by the reader-task coverage:
// the same block/section extraction (h1-h4 headings; p/li text; entities decoded). A page is eligible when at least
// one section of 40+ words is on topic (it mentions one of the query's own words in its heading or opening) or when
// the page title/H1 is on topic and a 40+ word section exists. Otherwise the reason is returned, never a bare "no".
const {blocks,groupSections}=require('./growth-reader-task-coverage.cjs');
const {isEditorialHeading,tokens}=require('./growth-full-section-comparison.cjs');
const {decodeEntities}=require('./growth-text.cjs');
function assessGrowthCompetitorContent({html='',query='',truncated=false}={}){
 const raw=String(html||'');
 const secs=groupSections(blocks(raw));
 const need=tokens(query);
 const head=decodeEntities((raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'')+' '+(raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'')).replace(/<[^>]+>/g,' ');
 const headOnTopic=!need.length||tokens(head).some(t=>need.includes(t));
 const substantive=secs.filter(s=>s.words>=40&&(s.heading==='(introduction)'||isEditorialHeading(s.heading,query)));
 const onTopic=substantive.filter(s=>!need.length||tokens(s.heading+' '+s.text.slice(0,600)).some(t=>need.includes(t)));
 const totalWords=secs.reduce((n,s)=>n+s.words,0);
 let reason=null;
 if(totalWords<40)reason=/<script\b/i.test(raw)&&raw.length>20000?'JS_RENDERED_PAGE_NO_STATIC_TEXT':'NO_PARAGRAPH_TEXT';
 else if(!substantive.length)reason='NO_SECTION_WITH_40_WORDS';
 else if(!onTopic.length&&!headOnTopic)reason='NO_QUERY_TERM_IN_READABLE_TEXT';
 const eligible=!reason;
 return {eligible,status:eligible?'SUBSTANTIVE_EDITORIAL_SECTION_OBSERVED':'INSUFFICIENT_READABLE_EDITORIAL_CONTENT',reason_code:reason,
  observed_sections:secs.length,relevant_sections:onTopic.length||(headOnTopic?substantive.length:0),readable_words:totalWords,truncated:truncated===true};
}
module.exports={assessGrowthCompetitorContent};
