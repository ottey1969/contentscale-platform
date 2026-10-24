'use strict';
// A retrieved HTTP page is not automatically a readable editorial competitor.
// Check that at least one on-topic section includes substantive observed text.
const {sections,isEditorialHeading,tokens}=require('./growth-full-section-comparison.cjs');
function assessGrowthCompetitorContent({html='',query='',truncated=false}={}){
 const observed=sections(html,truncated===true);
 // On topic = the section mentions at least one of the query's own distinctive words (no industry vocabulary).
 const need=tokens(query);
 const relevant=observed.filter(s=>s.words>=40&&isEditorialHeading(s.heading,query)&&
  (!need.length||tokens(s.heading+' '+s.text.slice(0,600)).some(t=>need.includes(t))));
 return {eligible:relevant.length>0,
  status:relevant.length?'SUBSTANTIVE_EDITORIAL_SECTION_OBSERVED':'INSUFFICIENT_READABLE_EDITORIAL_CONTENT',
  observed_sections:observed.length,relevant_sections:relevant.length};
}
module.exports={assessGrowthCompetitorContent};
