'use strict';
// Conservative public HTML body evidence, never proof of ranking or missing facts.
function textOf(html){
 return String(html||'').replace(/<(?:script|style|svg|noscript|template|nav|footer|header)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|noscript|template|nav|footer|header)>/gi,' ')
 .replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]+>/g,' ')
 .replace(/&(?:nbsp|amp|quot|lt|gt|#39);/gi,' ').replace(/\s+/g,' ').trim().slice(0,50000);
}
function evaluateExistingBody({html='',truncated=false,query=''}={}){
 const text=textOf(html),lower=text.toLowerCase();
 const questions={
  definition:/\b(?:content scaling|scaling content|content at scale|scale content)\b/i.test(text),
  inventory:/\b(?:content audit|inventory|existing (?:pages|content)|audit your content|audit before you add|audit (?:before|first)|fix what you have before publishing)\b/i.test(text),
  search_data:/\b(?:search console|impressions|click.through rate|ctr)\b/i.test(text),
  decisions:/\b(?:prioriti[sz]|search intent|cannibaliz|overlap|consolidat)\b/i.test(text),
  measurement:/\b(?:measure|clicks|performance|baseline|track results)\b/i.test(text),
  worked_example:/\b(?:for example|example:|worked example|sample plan)\b/i.test(text)
 };
 // Preserve concise observed source paragraphs for editorial comparison.
 // Excludes page navigation, scripts, and any markup; no gap is inferred.
 const cleaned=String(html||'').replace(/<(?:script|style|svg|noscript|template|nav|footer|header)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|noscript|template|nav|footer|header)>/gi,' ');
 const paragraphs=Array.from(cleaned.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
  .map(x=>textOf(x[1])).filter(x=>x.length>=45).slice(0,80);
 const observed_paragraphs=paragraphs.slice(0,8).map(x=>x.slice(0,460));
 const evidence_passages=Object.fromEntries(Object.keys(questions).map(k=>{
  const pattern={
   definition:/content (?:scaling|at scale)|scaling content/i,
   inventory:/content audit|inventory|existing (?:pages|content)|audit before you add|audit (?:before|first)|fix what you have before publishing/i,
   search_data:/search console|impressions|click.through rate|\bctr\b/i,
   decisions:/prioriti[sz]|search intent|cannibaliz|overlap|consolidat/i,
   measurement:/measure|clicks|performance|baseline|track results/i,
   worked_example:/for example|example:|worked example|sample plan/i
  }[k];
  return [k,paragraphs.filter(x=>pattern.test(x)).slice(0,2).map(x=>x.slice(0,460))];
 }));
 const present=Object.entries(questions).filter(x=>x[1]).map(x=>x[0]);
 const notObserved=Object.entries(questions).filter(x=>!x[1]).map(x=>x[0]);
 const queryTerms=String(query||'').toLowerCase().split(/\s+/).filter(x=>x.length>3);
 const queryTermsObserved=queryTerms.filter(x=>lower.includes(x));
 return {
  status:truncated?'PARTIAL_HTML_ONLY':'PUBLIC_HTML_CONTENT_OBSERVED',
  source:'PUBLIC_HTML_TEXT_HEURISTIC',
  inspected_text_chars:text.length,source_truncated:!!truncated,
  evidence_checks:questions,observed_elements:present,
  observed_paragraphs,evidence_passages,
  elements_not_detected:notObserved,
  query_terms_observed:queryTermsObserved,
  no_proven_gaps:true,
  conclusion:'Words and patterns are only observations. No absence, reader adequacy, originality, SERP superiority or cannibalization is proven by heuristic checks.',
  next_step:truncated?'Retrieve complete HTML before judging missing elements':'Review actual paragraphs under headings and compare real reader tasks before deciding whether an addition is needed.'
 };
}
module.exports={evaluateExistingBody};
