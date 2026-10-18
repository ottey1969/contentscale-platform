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
  inventory:/\b(?:content audit|inventory|existing (?:pages|content)|audit your content)\b/i.test(text),
  search_data:/\b(?:search console|impressions|click.through rate|ctr)\b/i.test(text),
  decisions:/\b(?:prioriti[sz]|search intent|cannibaliz|overlap|consolidat)\b/i.test(text),
  measurement:/\b(?:measure|clicks|performance|baseline|track results)\b/i.test(text),
  worked_example:/\b(?:for example|example:|worked example|sample plan)\b/i.test(text)
 };
 const present=Object.entries(questions).filter(x=>x[1]).map(x=>x[0]);
 const notObserved=Object.entries(questions).filter(x=>!x[1]).map(x=>x[0]);
 const queryTerms=String(query||'').toLowerCase().split(/\s+/).filter(x=>x.length>3);
 const queryTermsObserved=queryTerms.filter(x=>lower.includes(x));
 return {
  status:truncated?'PARTIAL_HTML_ONLY':'PUBLIC_HTML_CONTENT_OBSERVED',
  source:'PUBLIC_HTML_TEXT_HEURISTIC',
  inspected_text_chars:text.length,source_truncated:!!truncated,
  evidence_checks:questions,observed_elements:present,
  elements_not_detected:notObserved,
  query_terms_observed:queryTermsObserved,
  no_proven_gaps:true,
  conclusion:'Words and patterns are only observations. No absence, reader adequacy, originality, SERP superiority or cannibalization is proven by heuristic checks.',
  next_step:truncated?'Retrieve complete HTML before judging missing elements':'Review actual paragraphs under headings and compare real reader tasks before deciding whether an addition is needed.'
 };
}
module.exports={evaluateExistingBody};
