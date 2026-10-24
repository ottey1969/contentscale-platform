'use strict';
// Editorial claim guard for generated drafts. It decides whether a text may be offered to the OWNER for review.
// It never writes new facts and never publishes. A sentence passes only when it is procedural/explanatory advice,
// or when every factual element it carries is present in the destination page's own text.
// Rules are industry-neutral: no trade, brand or product vocabulary. Concrete reasons are returned for every rejection.
const sentencesOf=text=>String(text||'').replace(/\s+/g,' ').match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)?.map(x=>x.trim()).filter(Boolean)||[];
const lower=s=>String(s||'').toLowerCase();
const STEM=w=>lower(w).replace(/[^a-z0-9]/g,'').replace(/(?:ing|ed|es|s|e)$/,'');
const contentRoots=t=>[...new Set((lower(t).match(/[a-z]{5,}/g)||[]).map(STEM).filter(x=>x.length>=4))];

// 1. Absolute / guarantee language. SOFTENABLE words are weakened (never strengthened); the rest is rejected.
const SOFTEN=[[/\balways\b/gi,'usually'],[/\bnever\b/gi,'rarely'],[/\bensures\b/gi,'helps ensure'],[/(?<!help )(?<!helps )\bensure\b/gi,'help ensure'],[/(?<!helping )\bensuring\b/gi,'helping ensure'],
 [/\bdefinitely\b/gi,'often'],[/\bcertainly\b/gi,'often'],[/\bwill (?=(?:help|make|let|give|allow|save|reduce|improve)\b)/gi,'can ']];
const ABSOLUTE=/\b(guarantee[sd]?|guaranteeing|proven|prove[sn]?|100\s?%|foolproof|risk[- ]free|flawless|perfect results?|unmatched|unbeatable|number one|#\s?1|best[- ]in[- ]class|the best|only way|no risk|instantly|overnight|without fail)\b/i;
// 1b. Unsupported superlatives about a service or product (allowed only if the destination page uses the same word).
const SUPERLATIVE=/\b(safest|fastest|cheapest|easiest|most (?:comfortable|effective|reliable|trusted|popular|affordable|durable|accurate|efficient|powerful)|best (?!practices?\b))\b/i;
// 2. Outcome promises about rankings, traffic, leads or revenue.
const OUTCOME=/\b(rank(?:s|ed|ing|ings)?\s+(?:higher|better|first|#?\s?1|on page one)|(?:improv\w*|boost\w*|increas\w*|grow\w*|lift\w*|skyrocket\w*|doubl\w*|triple\w*)\s+(?:your\s+|the\s+|its\s+)?(?:search\s+)?(?:rank\w*|seo|visibility|traffic|clicks|conversions?|leads|sales|revenue|bookings|calls|enquiries|inquiries|ctr)|(?:more|higher|extra)\s+(?:organic\s+)?(?:traffic|clicks|conversions?|leads|sales|revenue|bookings|calls|enquiries|inquiries)|(?:higher|better|top|first)\s+(?:search\s+)?(?:rankings?|positions?|placements?)|page one|first page of google|top of google|top (?:\d+|three|ten) results?|get(?:ting)?\s+(?:more\s+)?(?:customers|clients|leads|jobs))\b/i;
// 3. Claims about AI assistants / AI search citing or recommending content.
const AI_CITE=/\b(?:(?:cited|citations?|recommended|recommends?|mentioned|surfaced|quoted|referenced|picked up|trusted)\b[^.]{0,60}\b(?:chatgpt|gemini|perplexity|claude|copilot|ai overviews?|ai search|llms?|ai assistants?|generative (?:ai|engines?)|answer engines?)|(?:chatgpt|gemini|perplexity|claude|copilot|ai overviews?|ai search|llms?|ai assistants?|generative (?:ai|engines?)|answer engines?)\b[^.]{0,60}\b(?:cites?|recommends?|prefers?|favou?rs?|trusts?|ranks?|surfaces?|quotes?|picks)\b)/i;
// 4. Credentials / reputation about the business. Verifiable only if the destination page itself states them.
const CREDENTIAL=/\b(licen[sc]ed|insured|bonded|certified|accredited|warrant(?:y|ies)|award[- ]winning|years of experience|family[- ]owned|family[- ]operated|top[- ]rated|trusted by|leading|premier|specialists?|experts?|\d+[- ]star|a\+ rating|locally owned)\b/ig;
const FIRST_PERSON=/\b(we|our|ours|us|we're|we've|i|my)\b/i;
const CLAIM_VERB=/\b(is|are|was|were|has|have|had|offers?|provides?|uses?|supports?|detects?|scores?|ranks?|guarantees?|delivers?|includes?|serves?|covers?|specializ\w+|works? with|installs?|repairs?|charges?|costs?|lasts?)\b/i;

function numbersIn(text){return (String(text||'').match(/[$€£]\s?\d[\d,.]*|\d[\d,.]*\s?%|\b\d[\d,.]*\b/g)||[]).map(x=>x.replace(/[\s,]/g,'').replace(/\.$/,''))}
function entitiesIn(sentence){
 // Capitalised words/phrases that are not the first word of the sentence.
 const out=[],words=sentence.split(/\s+/);
 for(let i=1;i<words.length;i++){
  const w=words[i].replace(/^[("'“]+|[.,;:!?)"'”]+$/g,'');
  if(/^[A-Z][A-Za-z0-9&.-]{2,}$/.test(w)&&!/^(?:I|Step|Tip|Note|Example)$/.test(w))out.push(w);
 }
 return out;
}

// text: draft paragraph(s); destinationText: the ONLY factual source; query: the working query.
function assessDraftClaims({text='',destinationText='',query='',brandLabel=''}={}){
 const dest=lower(destinationText),destRoots=new Set(contentRoots(destinationText)),destNums=new Set(numbersIn(destinationText));
 const queryRoots=new Set(contentRoots(query));
 const destSentences=sentencesOf(destinationText).map(s=>contentRoots(s)).filter(r=>r.length>=5);
 const violations=[],rewrites=[],kept=[];
 const add=(code,sentence,reason)=>violations.push({code,sentence:sentence.slice(0,220),reason});
 for(let sentence of sentencesOf(text)){
  const original=sentence,local=[];
  const flag=(code,reason)=>local.push({code,reason});
  // Absolute words that can be weakened safely are weakened first; whatever remains is judged.
  let softened=sentence;const applied=[];
  for(const [re,to] of SOFTEN)softened=softened.replace(re,m=>{applied.push({from:m,to});return /^[A-Z]/.test(m)?to[0].toUpperCase()+to.slice(1):to});
  sentence=softened;
  const m1=sentence.match(ABSOLUTE);if(m1)flag('ABSOLUTE_CLAIM','Contains the unqualified claim “'+m1[0]+'”; the sources do not prove it and it cannot be softened without changing its meaning.');
  const m1b=sentence.match(SUPERLATIVE);if(m1b&&!dest.includes(lower(m1b[0])))flag('UNSUPPORTED_SUPERLATIVE','Uses the comparative claim “'+m1b[0]+'” without support on the destination page.');
  const m2=sentence.match(OUTCOME);if(m2)flag('UNPROVEN_OUTCOME_CLAIM','Promises a ranking, traffic, lead or revenue outcome (“'+m2[0]+'”). No measurement supports it.');
  const m3=sentence.match(AI_CITE);if(m3)flag('UNPROVEN_AI_CITATION_CLAIM','Claims how AI assistants or AI search treat the content. No independent observation supports it.');
  const bad=[...new Set(numbersIn(sentence).filter(n=>!destNums.has(n)))];
  if(bad.length)flag('UNSOURCED_NUMBER','The figure(s) '+bad.join(', ')+' do not appear in the destination page, so they are not verifiable from the sources.');
  const businessSubject=FIRST_PERSON.test(sentence)||(brandLabel&&lower(sentence).replace(/[^a-z0-9]/g,'').includes(brandLabel));
  if(businessSubject){
   const creds=[...new Set((sentence.match(CREDENTIAL)||[]).map(lower))].filter(c=>!dest.includes(c.replace(/s$/,'')));
   if(creds.length)flag('UNSOURCED_CREDENTIAL_CLAIM','States a credential or reputation (“'+creds.join('”, “')+'”) about the business that the destination page does not state.');
   if(CLAIM_VERB.test(sentence)&&FIRST_PERSON.test(sentence)){
    const r=contentRoots(sentence),known=r.filter(x=>destRoots.has(x)||queryRoots.has(x));
    if(r.length>=3&&known.length/r.length<0.5)flag('UNSOURCED_BUSINESS_FACT','Makes a factual statement about the business whose key terms mostly do not appear on the destination page.');
   }
  }
  // A named product/organisation described with a claim verb must be named by the destination page itself.
  const ents=entitiesIn(sentence).filter(e=>!dest.includes(lower(e))&&!queryRoots.has(STEM(e)));
  if(ents.length&&CLAIM_VERB.test(sentence)&&!/\b(open|visit|use|check|search|click|go to|log in|sign in|look at|ask|call|contact|read)\b/i.test(sentence))
   flag('UNSOURCED_NAMED_ENTITY_CLAIM','Makes a factual statement about “'+ents.slice(0,2).join('”, “')+'”, which the destination page does not mention and which has no independent source.');
  // Redundancy: a sentence that restates a sentence already on the destination page adds nothing.
  const norm=x=>lower(x).replace(/[^a-z0-9]+/g,' ').trim();
  if(norm(sentence).split(' ').length>=5&&sentencesOf(destinationText).some(d=>norm(d)===norm(sentence)))flag('DUPLICATES_DESTINATION_SENTENCE','Repeats a sentence that is already on the destination page.');
  const myRoots=contentRoots(sentence);
  if(!local.some(v=>v.code==='DUPLICATES_DESTINATION_SENTENCE')&&myRoots.length>=6){
   for(const d of destSentences){
    const set=new Set(d),shared=myRoots.filter(x=>set.has(x)).length;
    if(shared/Math.max(myRoots.length,d.length)>=0.7){flag('DUPLICATES_DESTINATION_SENTENCE','Restates a sentence already on the destination page.');break}
   }
  }
  if(local.length){for(const v of local)add(v.code,original,v.reason)}
  else{if(applied.length)rewrites.push({before:original,after:sentence,changes:applied});kept.push(sentence)}
 }
 return {ok:violations.length===0,violations,safe_rewrites:rewrites,safe_text:kept.join(' ')};
}
module.exports={assessDraftClaims,sentencesOf,contentRoots,numbersIn};
