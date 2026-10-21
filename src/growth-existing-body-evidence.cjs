'use strict';
// Conservative public HTML body evidence, never proof of ranking or missing facts.
function textOf(html){
 return String(html||'').replace(/<(?:script|style|svg|noscript|template|nav|footer|header)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|noscript|template|nav|footer|header)>/gi,' ')
 .replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]+>/g,' ')
 .replace(/&(?:nbsp|amp|quot|lt|gt|#39);/gi,' ').replace(/\s+/g,' ').trim().slice(0,50000);
}
function evaluateExistingBody({html='',truncated=false,query=''}={}){
 const text=textOf(html),lower=text.toLowerCase();
 // Check the actual requested topic. These observations work for any niche.
 // Absence of a matching phrase is never proof of a missing answer.
 const queryTerms=String(query||'').toLowerCase().match(/[a-z]{4,}/g)||[];
 const stem=w=>String(w).replace(/(?:ing|ed|es|s)$/,'').replace(/e$/,'');
 const queryStems=[...new Set(queryTerms.map(stem))];
 const bodyStems=new Set((lower.match(/[a-z]{4,}/g)||[]).map(stem));
 const matchCount=queryStems.filter(x=>bodyStems.has(x)).length;
 const questions={
  query_answer:queryStems.length>0&&matchCount>=Math.min(2,queryStems.length),
  supporting_examples:/\\b(?:for example|example:|case study|worked example|sample plan)\\b/i.test(text)
 };
 // Preserve concise observed source paragraphs for editorial comparison.
 // Excludes page navigation, scripts, and any markup; no gap is inferred.
 const cleaned=String(html||'').replace(/<(?:script|style|svg|noscript|template|nav|footer|header)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|noscript|template|nav|footer|header)>/gi,' ');
 const paragraphs=Array.from(cleaned.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
  .map(x=>textOf(x[1])).filter(x=>x.length>=45).slice(0,80);
 const observed_paragraphs=paragraphs.slice(0,8).map(x=>x.slice(0,460));
 const passageMatch=p=>{
  const stems=new Set((p.toLowerCase().match(/[a-z]{4,}/g)||[]).map(stem));
  return queryStems.length>0&&queryStems.filter(w=>stems.has(w)).length>=Math.min(2,queryStems.length);
 };
 const evidence_passages={
  query_answer:paragraphs.filter(passageMatch).slice(0,3).map(p=>p.slice(0,460)),
  supporting_examples:paragraphs.filter(p=>/\\b(?:for example|example:|case study|worked example|sample plan)\\b/i.test(p))
   .slice(0,2).map(p=>p.slice(0,460))
 };
 const present=Object.entries(questions).filter(x=>x[1]).map(x=>x[0]);
 const notObserved=Object.entries(questions).filter(x=>!x[1]).map(x=>x[0]);
 const observedQueryTerms=String(query||'').toLowerCase().split(/\s+/).filter(x=>x.length>3);
 const queryTermsObserved=observedQueryTerms.filter(x=>lower.includes(x));
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
