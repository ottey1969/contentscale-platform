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
const SOFTEN=[[/\b(?:completely|fully|totally|entirely)\s+eliminates\b/gi,'reduces'],[/\beliminates\b/gi,'reduces'],[/\bprevents\b/gi,'helps prevent'],[/\balways\b/gi,'usually'],[/\bnever\b/gi,'rarely'],[/\bensures\b/gi,'helps ensure'],[/(?<!helping )\bensuring\b/gi,'helping ensure'],
 [/\bdefinitely\b/gi,'often'],[/\bcertainly\b/gi,'often'],[/\bwill (?=(?:help|make|let|give|allow|save|reduce|improve)\b)/gi,'can '],
 [/\bmaximi[sz]es (?=(?:the |your |its |their )?(?:value|impact|reach|efficiency|output)\b)/gi,'can increase '],[/\bmaximi[sz]e (?=(?:the |your |its |their )?(?:value|impact|reach|efficiency|output)\b)/gi,'increase ']];
const ABSOLUTE=/\b(guarantee[sd]?|guaranteeing|proven|prove[sn]?|100\s?%|foolproof|risk[- ]free|flawless|perfect results?|unmatched|unbeatable|number one|#\s?1|best[- ]in[- ]class|the best|only way|no risk|instantly|overnight|without fail|eliminates?|(?:the|a) complete (?:picture|context|view|solution|answer|performance \\w+)|completely (?:removes?|solves?|prevents?)|(?:exact|exactly|precisely)\s+(?:\w+\s+){0,2}(?:return|results?|impact|roi|numbers?|figures?|performance|value|gain)s?)\b/i;
// 1a. Voice: the site speaks as the service, never as a person or founder (owner rule 2026-11-01). First person singular
// in English, Dutch, French and German, and founder words, are flagged wherever they appear.
const PERSONAL_VOICE=/(?:^|[^A-Za-z'’])(I|I'm|I’m|I've|I’ve|I'd|I’d|I'll|I’ll)(?![A-Za-z'’])|\b(me|my|mine|myself|ik|mijn|mij|mezelf|moi|mon|ma|mes|ich|mein|meine|meinen|mir|mich|founder|co-founder|oprichter|medeoprichter|fondateur|fondatrice|gründer|gründerin)\b/i;
function personalVoice(sentence){
 const m=String(sentence).match(PERSONAL_VOICE);if(!m)return null;
 const w=m[1]||m[2];
 // A lowercase "i" is not the pronoun; "me" and "ma" only as words (Dutch "me", French "ma"), checked case-insensitively.
 if(m[1]&&!/^I/.test(m[1]))return null;
 return w;
}
// 1b. Unsupported superlatives about a service or product (allowed only if the destination page uses the same word).
const SUPERLATIVE=/\b(safest|fastest|cheapest|easiest|most (?:comfortable|effective|reliable|trusted|popular|affordable|durable|accurate|efficient|powerful)|best (?!practices?\b))\b/i;
// 2. Outcome promises about rankings, traffic, leads or revenue.
const OUTCOME=/\b(rank(?:s|ed|ing|ings)?\s+(?:higher|better|first|#?\s?1|on page one)|(?:improv\w*|boost\w*|increas\w*|grow\w*|lift\w*|skyrocket\w*|doubl\w*|triple\w*)\s+(?:your\s+|the\s+|its\s+)?(?:search\s+)?(?:rank\w*|seo|visibility|traffic|clicks|conversions?|leads|sales|revenue|bookings|calls|enquiries|inquiries|ctr)|(?:more|higher|extra)\s+(?:organic\s+)?(?:traffic|clicks|conversions?|leads|sales|revenue|bookings|calls|enquiries|inquiries)|(?:higher|better|top|first)\s+(?:search\s+)?(?:rankings?|positions?|placements?)|maximi[sz]\w*\s+(?:your\s+|the\s+|its\s+|their\s+|our\s+|a\s+|an\s+|overall\s+|total\s+|content\s+)*(?:roi|returns?|revenue|traffic|results|conversions?|leads|sales|visibility|performance)|(?:expand|extend|grow|increas|boost|improv|build|strengthen)\w*\s+(?:your\s+|the\s+|its\s+|their\s+|overall\s+)*(?:brand\s+)?(?:reach|awareness|authority|reputation|engagement)|page one|first page of google|top of google|top (?:\d+|three|ten) results?|get(?:ting)?\s+(?:more\s+)?(?:customers|clients|leads|jobs))\b/i;
// 2b. Declarative comparative performance claims ("X demonstrate higher engagement than Y"). Advice about how to
// measure or compare is allowed, so sentences built around check/compare/measure/track are skipped.
const COMPARATIVE=/\b(?:higher|better|greater|stronger|improved|increased|superior|more)\s+(?:search\s+|organic\s+|user\s+|audience\s+|long[- ]term\s+)?(?:engagement|performance|results?|conversion rates?|retention|visibility|roi|returns?|citation rates?|click[- ]through)\b/i;
const MEASURING_ADVICE=/\b(whether|if you|check|compare|measure|track|monitor|evaluate|review|correlate|identify|look at)\b/i;
// 2c. Internal process text that leaked into reader-facing copy (instructions to the editor, placeholders).
const EDITOR_NOTE=/\b(?:for (?:internal )?editor(?:ial)? (?:verification|review|check)\b|internal editor\b|mark (?:those|these|that|this)\b[^.]*\b(?:verification|review)\b|submit (?:those|these)\b[^.]*\bverification\b|verify (?:those|these) (?:items|figures|numbers|claims)\b)|\[(?:verify|todo|tbd|insert)[^\]]*\]|\bTODO\b|lorem ipsum|\bplaceholder\b/i;
// 2d. Capability claims: a tool, tracker, platform or system is said to DO something. Generic advice about choosing or
// using tools is fine; an assertion about what a tool does must be stated on the destination page or it is unverified.
const CAP_SUBJECT='(?:tools?|trackers?|tracking|monitoring|platforms?|software|dashboards?|systems?|scoring|automation|analytics|(?:automated|ai[- ]powered|ai)\\s+\\w+)';
const CAP_VERB_S='(?:monitors|tracks|identifies|confirms|provides|detects|verifies|analy[sz]es|generates|reveals|highlights|captures|compares|predicts|automates|ensures|guarantees|discovers|finds|pinpoints|validates|delivers|shows)';
// Plural nouns that are also verbs ("quality checks", "monthly reports"): only a verb when a SINGULAR tool noun is the subject.
const CAP_VERB_AMBIGUOUS='(?:checks|reports|scores|records|flags|alerts|measures|shows|surfaces)';
const CAP_SINGULAR_SUBJECT='(?:tool|tracker|tracking|monitoring|platform|software|dashboard|system|scoring|automation|analytics)';
const CAP_VERB_BASE='(?:monitor|track|identify|confirm|show|provide|detect|measure|alert|report|score|verify|flag|record|analy[sz]e|generate|deliver|reveal|surface|check|validate|highlight|capture|compare|predict|automate|pinpoint)';
const CAP_AMB=new RegExp('\\b'+CAP_SINGULAR_SUBJECT+'\\b(?:\\s+\\w+){0,2}?\\s+'+CAP_VERB_AMBIGUOUS+'\\b','i');
const CAP_S=new RegExp('\\b'+CAP_SUBJECT+'\\b[^.;,]{0,70}?\\b'+CAP_VERB_S+'\\b','i');
const CAP_PLURAL=new RegExp('\\b(?:tools|trackers|platforms|systems|dashboards|analytics)\\b\\s+(?:\\w+\\s+){0,2}?'+CAP_VERB_BASE+'\\b','i');
const CAP_ADVICE_LEAD=/\b(?:use|using|with|choose|select|pick|adopt|implement|integrate|run|consider|when|if|should|need|needs|want|ask)\b[^.]{0,40}\b(?:tools|trackers|platforms|systems|dashboards|analytics)\b/i;
const PRECISION=/\b(?:exactly|precisely|real[- ]time|in real time|directly quoted|every single|each and every|automatically)\b/i;
function capabilityClaim(sentence){
 // Advice to the reader ("Integrate automated quality checks that scan…") describes a practice, not what OUR tool does.
 if(IMPERATIVE_VERB.test(withoutLead(sentence))&&!FIRST_PERSON.test(sentence))return null;
 const m=sentence.match(CAP_S)||sentence.match(CAP_AMB);if(m)return m[0];
 const p=sentence.match(CAP_PLURAL);
 if(p&&!CAP_ADVICE_LEAD.test(sentence)&&!/\bto\s+(?:\w+\s+){0,1}$/i.test(sentence.slice(0,sentence.indexOf(p[0]))))return p[0];
 return null;
}
// 2e. Safety. Telling a reader that a problem is safe, harmless or can wait is a risk-bearing factual claim: unconditional
// assurances need a source (the destination page itself); hedged "can typically wait" statements and any hazard guidance are
// kept but flagged for professional safety review. Wording is cross-industry (home, health, electrical, vehicles...).
const SAFETY_ASSURANCE_HARD=/\b(?:safe(?:ly)?\s+to\s+(?:wait|ignore|delay|leave|postpone)|can\s+safely\s+(?:wait|be\s+ignored|be\s+left|be\s+delayed)|(?:no|not\s+any)\s+(?:immediate\s+|real\s+|serious\s+)?(?:danger|risk|hazard)|nothing\s+to\s+worry|is\s+not\s+(?:an?\s+)?(?:emergency|dangerous)|no\s+need\s+to\s+(?:worry|hurry|rush|call)|(?:won['’]t|will\s+not)\s+(?:cause|get\s+worse|spread)|harmless)\b/i;
const SAFETY_ASSURANCE_SOFT=/\b(?:can|may|could|might)\s+(?:typically\s+|usually\s+|often\s+|generally\s+|normally\s+)?(?:safely\s+)?(?:wait|be\s+(?:delayed|postponed|left|deferred))\b|\b(?:not\s+urgent|non[- ]urgent|no\s+urgency)\b/i;
// Words with an everyday non-physical sense ("structural gaps", "falling rankings", "unstable results") count only
// in their physical-damage sense; every other hazard word counts on its own.
const SAFETY_HAZARD=/\b(?:collaps\w*|structural(?:ly)?\s+(?:\w+\s+)?(?:damage[ds]?|failures?|integrity|cracks?|cracking|collapse|unsound|compromised|weak(?:ness|ened)?|engineers?|movement|defects?)|sagg\w*|electric\w*|electrocut\w*|live\s+wires?|power\s+lines?|gas\s+(?:leak|line|smell)|carbon\s+monoxide|fires?|smoke|flood\w*|mold|mould|asbestos|toxic|poison\w*|injur\w*|dangerous|hazards?|hazardous|evacuat\w*|911|emergency\s+services|unstable\s+(?:\w+\s+)?(?:ground|structures?|walls?|roofs?|ceilings?|floors?|ladders?|trees?|surfaces?|footing|chimneys?|buildings?|scaffold\w*|slopes?)|falling\s+(?:debris|objects?|trees?|branch(?:es)?|limbs?|ice|glass|tiles?|bricks?|from|off)|fallen\s+(?:tree|limb|debris)|chest\s+pain|bleeding)\b/i;
// 3. Claims about AI assistants / AI search citing or recommending content.
const AI_TERMS='chatgpt|gemini|perplexity|claude|copilot|ai overviews?|ai search|llms?|ai assistants?|generative (?:ai|engines?|search (?:platforms?|engines?))|answer engines?|ai answers?|generated answers?|ai responses?|ai surfaces|ai engines?';
// 3b. Mechanism claims: why AI or search systems pick, verify or cite content, stated as a reason for a page change
// ("…markup so generative engines can easily reference your content", "…tables that prevent retrieval algorithms from
// verifying your claims", "…to align with retrieval requirements"). Also inside reader instructions: the instruction is
// advice, the reason given for it is an unproven claim about how those systems work.
const MECH_AGENT='(?:'+AI_TERMS+'|generative (?:models?|systems?)|retrieval (?:systems?|algorithms?|models?|engines?|pipelines?)|(?:search )?algorithms?|search engines?|language models?|crawlers?)';
const MECH_VERB='(?:cite|reference|retrieve|verify|understand|trust|extract|select|pick|surface|rank|recommend|parse|interpret|quote|synthesi[sz]e|find|index|use)';
const AI_MECHANISM=new RegExp('\\b(?:so(?:\\s+that)?|to\\s+help|helps?|helping|allows?|allowing|enabl\\w*|lets?|making\\s+it\\s+easier\\s+for)\\s+(?:the\\s+|these\\s+|modern\\s+)?'+MECH_AGENT+'\\s+(?:can\\s+|to\\s+|will\\s+|could\\s+)?(?:\\w+ly\\s+)?'+MECH_VERB+'\\w*'+
 '|\\b(?:prevent\\w*|stop\\w*|block\\w*|keep\\w*)\\s+(?:the\\s+|these\\s+|modern\\s+)?'+MECH_AGENT+'\\s+from\\b'+
 '|\\b(?:align\\w*|match\\w*|meet\\w*|satisf\\w*)\\s+(?:with\\s+)?[^.;]{0,30}\\b(?:retrieval|ranking|algorithm\\w*|ai|generative|citation)\\s+(?:requirements|signals|preferences|criteria|standards)\\b','i');
const AI_CITE=new RegExp('\\b(?:(?:cited|cite|cites|citing|citations?|recommended|recommends?|mentioned|surfaced|quoted|referenced|picked up|trusted)\\b[^.]{0,60}\\b(?:'+AI_TERMS+')|(?:'+AI_TERMS+')\\b[^.]{0,60}\\b(?:cites?|recommends?|prefers?|favou?rs?|trusts?|ranks?|surfaces?|quotes?|picks|quoted|cited))','i');
// 4. Credentials / reputation about the business. Verifiable only if the destination page itself states them.
const CREDENTIAL=/\b(licen[sc]ed|insured|bonded|certified|accredited|warrant(?:y|ies)|award[- ]winning|years of experience|family[- ]owned|family[- ]operated|top[- ]rated|trusted by|leading|premier|specialists?|experts?|\d+[- ]star|a\+ rating|locally owned)\b/ig;
const FIRST_PERSON=/\b(we|our|ours|us|we're|we've|i|my)\b/i;
const CLAIM_VERB=/\b(is|are|was|were|has|have|had|offers?|provides?|uses?|supports?|detects?|scores?|ranks?|guarantees?|delivers?|includes?|serves?|covers?|specializ\w+|works? with|installs?|repairs?|charges?|costs?|lasts?)\b/i;

// Technical notation is not a statistic: HTTP status codes in their context ("non-200", "HTTP 404", "301 redirects",
// "status code 503") and tokens where letters and digits form one name (UTF-8, IPv4, H2, ISO-3166). Percentages, money,
// counts and years stay checked: a year next to a figure is a source claim ("(March 2025), 68% ...").
const TECHNICAL_NUMBER=[/\bnon-?[1-5]\d\d\b/gi,/\b(?:HTTP|status(?:\s+codes?)?|response(?:\s+codes?)?|error(?:\s+codes?)?)\s+[1-5]\d\d\b/gi,
 /\b[1-5]\d\d(?:s|\s*(?:\/|or|and|,)\s*[1-5]\d\d)*\s+(?:status(?:\s+codes?)?|redirects?|errors?|responses?|codes?)\b/gi,/\b[45]\d\d\s+pages?\b/gi,
 /\b[A-Za-z]+(?:-[A-Za-z]+)*-?\d+[A-Za-z]*\b/g];
const withoutTechnicalNumbers=t=>TECHNICAL_NUMBER.reduce((x,re)=>x.replace(re,' '),String(t||''));
function numbersIn(text){text=withoutTechnicalNumbers(text);return (String(text||'').match(/[$€£]\s?\d[\d,.]*|\d[\d,.]*\s?%|\b\d[\d,.]*\b/g)||[]).map(x=>x.replace(/[\s,]/g,'').replace(/\.$/,''))}
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
// Conjunctions such as once/then/if/before do not by themselves make advice imperative.
const IMPERATIVE_VERB=/^(?:integrate|implement|adopt|introduce|establish|include|route|standardi[sz]e|automate|schedule|train|organi[sz]e|centrali[sz]e|use|start|begin|list|ask|check|compare|review|add|create|build|keep|make|choose|track|measure|record|map|decide|identify|turn|connect|run|test|document|update|define|set|write|plan|prioriti[sz]e|focus|avoid|ensure|confirm|assign|audit|extract|apply|maintain|feed|note|open|enter|save|repeat|look|search|inspect|export|copy|paste|select|pick|log|test|spot|verify|watch)\b/i;
// An instruction often opens with a sequence word ("Finally, compare …", "Next, open …"): the verb after it is still
// addressed to the reader. Only content-free sequence words are skipped; a leading clause ("When the tracker confirms …,
// apply …") can itself carry a claim and is never skipped.
const LEAD=/^(?:(?:and|then|next|finally|lastly|first(?:ly)?|second(?:ly)?|third(?:ly)?|also|afterwards|after that|in addition|meanwhile|now)\b,?\s+)+/i;
const withoutLead=s=>String(s).trim().replace(LEAD,'');
// The H2 promises what the section delivers. A "Why …" heading needs reasons: when more than a third of its sentences
// are instructions it is a how-to under the wrong heading.
// (Counting only: a leading purpose clause "To begin tracking, assemble …" still makes an instruction.)
const PURPOSE_LEAD=/^to\s+[^,.;]{1,60},\s+/i;
function headingMismatch(h2,text){
 const head=String(h2||'').replace(/^[^\p{L}\p{N}]+/u,'').trim();
 const list=sentencesOf(text);if(!list.length)return null;
 const instructions=list.filter(t=>IMPERATIVE_VERB.test(withoutLead(t).replace(PURPOSE_LEAD,''))).length;
 if(/^why\b/i.test(head)&&instructions*3>list.length)
  return {code:'HEADING_PROMISES_REASONS_BUT_GIVES_STEPS',instructions,sentences:list.length,
   reason:'The heading asks “why”, but '+instructions+' of '+list.length+' sentences are instructions. Give the reasons, or use a “How to” heading for the steps.'};
 return null;
}
const IMPERATIVE=/^(?:integrate|implement|adopt|introduce|establish|include|route|standardi[sz]e|automate|schedule|train|organi[sz]e|centrali[sz]e|use|start|begin|list|ask|check|compare|review|add|create|build|keep|make|choose|track|measure|record|map|decide|identify|turn|connect|run|test|document|update|define|set|write|plan|prioritis?e|focus|avoid|ensure|confirm|schedule|assign|audit|extract|apply|maintain|continuously|then|first|next|once|before|after|if)\b/i;
const ADVICE_MODAL=/\b(?:should|can|could|may|might|consider|try|helps?|allows?|lets?)\b/i;
// "do not guarantee", "cannot prove", "is never risk-free" are disclaimers, not claims: an absolute word counts only
// when no negation precedes it within the same clause (up to six words before it).
const NEGATION=/\b(?:not|never|no|nor|cannot|can['’]t|don['’]t|doesn['’]t|didn['’]t|won['’]t|isn['’]t|aren['’]t|wasn['’]t|without)\b(?:\s+[\w'’-]+){0,6}\s*$/i;
function affirmed(sentence,re){
 const g=new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g');
 for(const m of sentence.matchAll(g)){
  const before=sentence.slice(0,m.index).split(/[,;:()—–]|\bbut\b/i).pop();
  if(!NEGATION.test(before))return m;
 }
 return null;
}
// A named source ("According to Search Engine Journal", "(Semrush State of SEO, 2025)", "a study by X") is a factual claim
// about that source: the name must be on the destination page, or the sentence is an invented citation.
const ATTRIBUTION=/\b(?:[Aa]ccording\s+to|[Aa]s\s+reported\s+by|[Dd]ata\s+from|[Rr]esearch\s+(?:by|from)|(?:[Aa]|[Tt]he)\s+(?:\d{4}\s+)?(?:study|survey|report|analysis)\s+(?:by|from))\s+((?:the\s+)?[A-Z][\w&'’.-]*(?:\s+(?:of\s+)?[A-Z][\w&'’.-]*){0,5})|\(\s*([A-Z][\w&'’.-]*(?:\s+[A-Z][\w&'’.-]*){0,5})\s*,\s*(?:[A-Z][a-z]+\s+)?\d{4}\s*\)/;
function assessDraftClaims({text='',destinationText='',query='',brandLabel=''}={}){
 const dest=lower(destinationText),destRoots=new Set(contentRoots(destinationText)),destNums=new Set(numbersIn(destinationText));
 // A figure counts as sourced only where the page states it in the same context: a destination sentence that contains
 // the figure AND shares most of the draft sentence's content words. The same digits elsewhere on the page (a year in
 // another citation, a count in a case study) do not source a new statistic.
 // A trailing citation ("… differently. ( Ahrefs, 2025 )") belongs to the sentence before it, so that sentence counts too.
 const destList=sentencesOf(destinationText);
 const destNumberSentences=destList.map((t,i)=>({nums:new Set(numbersIn(t)),roots:new Set(contentRoots((destList[i-1]||'')+' '+t))})).filter(x=>x.nums.size);
 const figureInContext=(n,sentence)=>{const r=contentRoots(sentence).filter(x=>!/^\d/.test(x));if(!r.length)return destNums.has(n);
  return destNumberSentences.some(d=>d.nums.has(n)&&r.filter(x=>d.roots.has(x)).length/r.length>=0.5)};
 const queryRoots=new Set(contentRoots(query));
 const destSentences=sentencesOf(destinationText).map(s=>contentRoots(s)).filter(r=>r.length>=5);
 const violations=[],rewrites=[],kept=[],review=[];
 const supportedBy=sentence=>{const r=contentRoots(sentence);if(r.length<4)return false;
  return destSentences.some(d=>{const set=new Set(d);return r.filter(x=>set.has(x)).length/r.length>=0.6})};
 const add=(code,sentence,reason)=>violations.push({code,sentence:sentence.slice(0,220),reason});
 for(let sentence of sentencesOf(text)){
  const original=sentence,local=[];
  if(EDITOR_NOTE.test(sentence)){rewrites.push({before:original,after:'',changes:[{from:'internal note addressed to an editor',to:'(sentence removed from reader-facing copy)'}]});continue}
  const flag=(code,reason)=>local.push({code,reason});
  // Absolute words that can be weakened safely are weakened first; whatever remains is judged.
  let softened=sentence;const applied=[];
  for(const [re,to] of SOFTEN)softened=softened.replace(re,m=>{applied.push({from:m,to});return /^[A-Z]/.test(m)?to[0].toUpperCase()+to.slice(1):to});
  sentence=softened;
  const m1=affirmed(sentence,ABSOLUTE);if(m1)flag('ABSOLUTE_CLAIM','Contains the unqualified claim “'+m1[0]+'”; the sources do not prove it and it cannot be softened without changing its meaning.');
  const pv=personalVoice(original);if(pv)flag('PERSONAL_OR_FOUNDER_VOICE','Written as a person (“'+pv+'”). The page speaks as the service: name the service or write without a person, never “I”, “my” or a founder.');
  const m1b=sentence.match(SUPERLATIVE);if(m1b&&!dest.includes(lower(m1b[0])))flag('UNSUPPORTED_SUPERLATIVE','Uses the comparative claim “'+m1b[0]+'” without support on the destination page.');
  const m2b=!MEASURING_ADVICE.test(sentence)&&sentence.match(COMPARATIVE);if(m2b)flag('UNPROVEN_OUTCOME_CLAIM','Asserts a comparative performance result (“'+m2b[0]+'”) that no measurement on the page or in the sources supports.');
  const m2=original.match(OUTCOME)||sentence.match(OUTCOME);if(m2)flag('UNPROVEN_OUTCOME_CLAIM','Promises a ranking, traffic, lead or revenue outcome (“'+m2[0]+'”). No measurement supports it.');
  const cap=capabilityClaim(original);
  if(cap&&!supportedBy(original)){flag('UNSUPPORTED_CAPABILITY_CLAIM','States what a tool or system does (“'+cap.trim().slice(0,70)+'”) but the destination page does not say so; generic advice cannot stand in for a verified product capability.');
   const pr=original.match(PRECISION);if(pr)flag('UNSUPPORTED_PRECISION_CLAIM','Adds a precision claim (“'+pr[0]+'”) that no source supports.')}
  const sa=original.match(SAFETY_ASSURANCE_HARD);
  if(sa&&!supportedBy(original))flag('UNSUPPORTED_SAFETY_ASSURANCE','Tells the reader something is safe, harmless or needs no action (“'+sa[0]+'”). That is a safety claim: it needs a source or a qualified professional, not a generated sentence.');
  const m3=(!MEASURING_ADVICE.test(original)||cap)&&!supportedBy(original)&&original.match(AI_CITE);if(m3)flag('UNPROVEN_AI_CITATION_CLAIM','Claims how AI assistants or AI search treat the content. No independent observation supports it.');
  const mech=!supportedBy(original)&&original.match(AI_MECHANISM);
  if(mech)flag('UNPROVEN_AI_MECHANISM_CLAIM','Gives a reason for how AI or search systems select, verify or cite content (“'+mech[0]+'”). No independent observation supports it; describe what the reader can observe instead.');
  const bad=[...new Set(numbersIn(sentence).filter(n=>!destNums.has(n)))];
  if(bad.length)flag('UNSOURCED_NUMBER','The figure(s) '+bad.join(', ')+' do not appear in the destination page, so they are not verifiable from the sources.');
  else{const out=[...new Set(numbersIn(sentence).filter(n=>!figureInContext(n,sentence)))];
   if(out.length)flag('UNSOURCED_NUMBER','The figure(s) '+out.join(', ')+' appear on the destination page only in another context, so this statement is not sourced.')}
  const at=sentence.match(ATTRIBUTION),named=at&&(at[1]||at[2]).trim().replace(/^the\s+/i,'').replace(/[.'’]+$/,'');
  if(named&&!dest.includes(lower(named)))flag('UNSOURCED_ATTRIBUTION','Cites “'+named+'” as a source, but the destination page does not name it; a generated citation cannot be verified.');
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
  else{if(applied.length)rewrites.push({before:original,after:sentence,changes:applied});kept.push(sentence);
   review.push({safety_review:SAFETY_HAZARD.test(original)||SAFETY_ASSURANCE_SOFT.test(original)||SAFETY_ASSURANCE_HARD.test(original),confirm_with_owner:(supportedBy(original)||businessSubject)&&/\b(?:24\/7|24[- ]hours?|around the clock|every|all|licen[sc]ed|insured|bonded|certified|accredited|warrant\w*|guarantee\w*|same[- ]day|\d)/i.test(original),sentence:sentence.slice(0,260),class:supportedBy(original)?'SOURCED_FROM_PAGE':(applied.length?false:(IMPERATIVE.test(original)||ADVICE_MODAL.test(original)))?'GENERAL_ADVICE':'GENERAL_STATEMENT_UNVERIFIED'})}
 }
 return {ok:violations.length===0,violations,safe_rewrites:rewrites,safe_text:kept.join(' '),claim_review:review};
}
module.exports={personalVoice,withoutTechnicalNumbers,assessDraftClaims,sentencesOf,contentRoots,numbersIn,AI_MECHANISM,ATTRIBUTION,headingMismatch};
