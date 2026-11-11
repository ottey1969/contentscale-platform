'use strict';
// AI answers for the free Growth check. The visitor runs ONE prompt for the exact
// search term in each AI system and pastes the answer back — the same
// "Keyword / question" mode as the Quick Scan admin (src/index.js, directPrompt).
// No AI API is called: nothing here costs money, and only what was pasted is used.

const ENGINES=[
 {id:'google_aio',label:'Gemini / Google AI Overview (identify exact source)'},
 {id:'chatgpt',label:'ChatGPT Search'},
 {id:'perplexity',label:'Perplexity'},
 {id:'claude',label:'Claude'},
 {id:'copilot',label:'Microsoft Copilot'}
];
const ENGINE_IDS=new Set(ENGINES.map(e=>e.id));
const MAX_PASTE=40000;

// Identical to the Quick Scan direct prompt (parity is tested); QUERY_SLOT is the search term.
const QUERY_SLOT='[ENTER EXACT KEYWORD OR QUESTION]';
const DIRECT_PROMPT_LINES=[
 'Answer this exact user query as a real user would receive the answer:',
 'QUERY:',
 QUERY_SLOT,
 'Instructions:',
 '- Use the query EXACTLY as written. Do not rewrite, broaden or replace it.',
 '- Actually answer the query. Do not explain these instructions and do not return a template.',
 '- Use current live web/search capabilities when available.',
 '- Research the current web before answering when web search is available.',
 '- Use multiple independent relevant sources when genuinely available; do not invent extra sources just to reach a number.',
 '- Do not invent facts, citations or URLs.',
 '- Preserve every exact cited/source page URL as a complete https:// URL.',
 '- Never replace an exact page URL with only a root domain when the exact page is available.',
 '- Never invent, reconstruct, guess or repair URLs.',
 '- If the interface renders a URL as a clickable Markdown link, that is acceptable, but the underlying exact https:// URL must remain visible and complete.',
 'Return ONLY these two sections:',
 'ANSWER:',
 '[the actual complete answer to the exact query]',
 'RESOURCES:',
 'https://exact-source-page-1',
 'https://exact-source-page-2',
 '[continue with every real source actually used or shown; if none, write NO VERIFIED RESOURCES]',
 'Do NOT add MENTIONED, RECOMMENDED, company lists, brand lists, summaries, classifications or any other section.',
 'Final validation: answer the query, preserve exact https:// source URLs, include no invented URLs, and return only ANSWER and RESOURCES.'
];
const directPrompt=query=>DIRECT_PROMPT_LINES.map(l=>l===QUERY_SLOT?(String(query||'').trim()||QUERY_SLOT):l).join('\n\n');

// Same clean-up as the Quick Scan: AI apps / clipboards escape Markdown punctuation.
function cleanAiPaste(v){
 const s=String(v||'');let o='';
 for(let i=0;i<s.length;i++){
  if(s.charCodeAt(i)===92&&i+1<s.length&&'*_{}[]()#+-.!>:|/'.indexOf(s.charAt(i+1))>=0){i++;o+=s.charAt(i)}else o+=s.charAt(i);
 }
 return o;
}
const MULTI_TLD=['co.uk','org.uk','gov.uk','ac.uk','com.au','net.au','org.au','co.nz','com.br','com.mx','com.sg','com.ph','com.sa','com.ar','co.za','co.in'];
function hostOf(u){try{return new URL(u).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}
function rootOf(h){
 const a=String(h||'').split('.').filter(Boolean);if(a.length<=2)return a.join('.');
 const last2=a.slice(-2).join('.');return MULTI_TLD.includes(last2)?a.slice(-3).join('.'):last2;
}
function normUrl(u){
 try{const x=new URL(u);x.hash='';for(const k of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'])x.searchParams.delete(k);
  return x.hostname.toLowerCase().replace(/^www\./,'')+(x.pathname.replace(/\/+$/,'')||'/')+(x.search||'')}catch{return ''}
}
// Links that are interface plumbing, not sources (same idea as the Tracker parser): maps and search links, the favicon
// service and image hosts that chat apps copy along (google.com/s2/favicons, images.openai.com), and image files.
function noiseUrl(u){
 const h=hostOf(u);let p='';try{p=new URL(u).pathname.toLowerCase()}catch{}
 return h==='maps.app.goo.gl'||((h==='google.com'||h.endsWith('.google.com'))&&(p.startsWith('/maps')||p==='/goto'||p==='/search'||p.startsWith('/search/')||p.startsWith('/searchviewer')||p.startsWith('/s2/')))||
  h.endsWith('gstatic.com')||h.endsWith('googleusercontent.com')||h==='support.google.com'||h==='accounts.google.com'||h==='gemini.google.com'||
  h==='images.openai.com'||h.endsWith('.oaiusercontent.com')||h==='cdn.openai.com'||/\.(?:png|jpe?g|gif|webp|svg|ico|avif)$/.test(p);
}
const TRACKING_PARAMS=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','msclkid','srsltid'];
function withoutTracking(href){try{const x=new URL(href);TRACKING_PARAMS.forEach(k=>x.searchParams.delete(k));return x.href}catch{return href}}

function extractUrls(text){
 const out=[],seen=new Set(),re=/https?:\/\/[^\s<>\][()"']+/gi;let m;
 while((m=re.exec(text))){
  const u=m[0].replace(/[.,;:!?*_]+$/,'');
  let href;try{const p=new URL(u);if(!/^https?:$/.test(p.protocol))continue;href=p.href}catch{continue}
  if(noiseUrl(href))continue;
  const key=normUrl(href);if(key&&!seen.has(key)){seen.add(key);out.push(withoutTracking(href))}
 }
 return out;
}
// The RESOURCES heading the prompt asks for, on its own line (markdown bold/heading allowed).
const RESOURCES_HEADING=/^[ \t>*_#-]*RESOURCES[ \t*_]*:?[ \t*_]*/gim;
const NONE_DECLARED=/^\W*(?:NO VERIFIED RESOURCES|NONE|N\/A|NO SOURCES?)\W*$/i;

// Only links listed under an explicit RESOURCES section count as sources.
// An answer to another ContentScale prompt (the company quick scan: profile, four customer questions) has no RESOURCES
// list for this search term; it is refused with a clear reason instead of being stored as "no sources".
const OTHER_PROMPT_MARKS=[/^[\s#*>_-]*QUESTION\s*1\b/im,/^[\s#*>_-]*QUESTION\s*2\b/im,/AI SEARCH QUESTIONS\s*:/i,/COMPANY NAMES\s*:/i,/BUSINESS PROFILE\s*:/i,/FINAL CROSS-QUESTION SUMMARY/i];
function otherPrompt(raw){
 const text=String(raw||'');
 if(sourceListStart(text))return null;
 RESOURCES_HEADING.lastIndex=0;
 return OTHER_PROMPT_MARKS.filter(r=>r.test(text)).length>=2?'QUICK_SCAN_PROMPT':null;
}
// Validation contract, shared with the Pre-Write Brief (public/prewrite-ai-answer-research.js): an answer counts only when
// it is an actual answer. INVALID (not stored on paste, never counted when read): this prompt or another research prompt
// pasted back, an answer written in a conversation that knew the ContentScale task, a placeholder, the search term alone,
// fewer than three words. An answer that shares no word with the search term still counts (synonyms), with a warning.
const contract=require('../prewrite-ai-answer-research.cjs');
const GROWTH_ECHO=['answer this exact user query as a real user would receive the answer','use the query exactly as written',
 'return only these two sections','do not add mentioned, recommended','final validation: answer the query','actually answer the query. do not explain these instructions'];
function validateGrowthAnswer(answerText,query){
 const low=String(answerText||'').toLowerCase();
 if(GROWTH_ECHO.filter(m=>low.includes(m)).length>=2)return {valid:false,status:'invalid',reason:'prompt_echo',message:'This is the prompt itself, not the answer of the AI system. Paste the prompt into the AI system and paste its answer here.',warnings:[]};
 return contract.validateAnswer(answerText,query);
}
// A URL mentioned in the answer text is never a citation.
// Copilot (and others when asked in another language) list their sources in their own way: a heading "Sources",
// "Bronnen", "References", ... on its own line, or numbered link references at the end ("[1]: https://..."). Both are
// an explicit source list of the AI system, so they count like RESOURCES. Links inside the answer text still never do.
const OTHER_SOURCE_HEADING=/^[ \t>*_#-]*(?:SOURCES|BRONNEN|REFERENCES|CITATIONS|QUELLEN|FUENTES|SOURCES CITED|GERAADPLEEGDE BRONNEN)[ \t*_]*:?[ \t*_]*$/gim;
const NUMBERED_LINK=/^[ \t]*\[\d{1,3}\][ \t]*:?[ \t]*<?https?:\/\//m;
function sourceListStart(text){
 let m,last=null;RESOURCES_HEADING.lastIndex=0;
 while((m=RESOURCES_HEADING.exec(text)))last={index:m.index,end:m.index+m[0].length,form:'RESOURCES'};
 RESOURCES_HEADING.lastIndex=0;if(last)return last;
 OTHER_SOURCE_HEADING.lastIndex=0;
 while((m=OTHER_SOURCE_HEADING.exec(text)))last={index:m.index,end:m.index+m[0].length,form:'SOURCES_HEADING'};
 OTHER_SOURCE_HEADING.lastIndex=0;if(last)return last;
 const n=NUMBERED_LINK.exec(text);
 return n?{index:n.index,end:n.index,form:'NUMBERED_LINKS'}:null;
}
function parseAiAnswer(raw,{pageUrl,query}={}){
 const text=cleanAiPaste(String(raw||'').slice(0,MAX_PASTE));
 const last=sourceListStart(text);
 const answerPart=last?text.slice(0,last.index):text;
 const resourcesPart=last?text.slice(last.end):'';
 const listed=last?extractUrls(resourcesPart):[];
 const resources_status=!last?'MISSING':listed.length?'LISTED':
  (NONE_DECLARED.test(resourcesPart.trim())||!resourcesPart.trim())?'NONE_DECLARED':'NO_VALID_URLS';
 const sources=listed;
 const mentioned=extractUrls(answerPart).filter(u=>!sources.some(s=>normUrl(s)===normUrl(u)));
 const answer=answerPart.replace(/\*\*/g,'').replace(/^\s*ANSWER\s*:\s*/i,'').trim().slice(0,6000);
 const ownHost=hostOf(pageUrl),ownRoot=rootOf(ownHost),ownPage=normUrl(pageUrl);
 const isOwn=u=>{const h=hostOf(u);return !!ownRoot&&(h===ownRoot||h.endsWith('.'+ownRoot))};
 const own=sources.filter(isOwn);
 const name=ownRoot.split('.')[0];
 return {
  answer,sources,resources_status,resources_form:last?last.form:null,
  sources_verifiable:resources_status==='LISTED'||resources_status==='NONE_DECLARED',
  source_sites:[...new Set(sources.map(u=>rootOf(hostOf(u))).filter(Boolean))],
  own_site_cited:own.length>0,
  exact_page_cited:own.some(u=>normUrl(u)===ownPage),
  own_cited_urls:own,
  // Mentions are reported separately and never counted as citations.
  mentioned_urls_not_sources:mentioned,
  own_url_mentioned_not_cited:mentioned.some(isOwn),
  site_name_mentioned:name.length>=4&&new RegExp('\\b'+name.replace(/[^a-z0-9]/g,'.?')+'\\b','i').test(answer),
  no_sources:sources.length===0,
  ...(()=>{const v=validateGrowthAnswer(answer,query);return {validation_status:v.status,error_reason:v.reason||null,error_message:v.message||null,warnings:v.warnings||[]}})()
 };
}

// Next steps when AI systems with a verifiable source list do not cite the site. Shown automatically, so the owner
// does not have to ask what to do next. Only answers with a source list count; nothing is shown without one.
const BING_ENGINES=new Set(['chatgpt','copilot']);
function aiVisibilityActions({verifiable=[],topSites=[]}={}){
 const missing=verifiable.filter(e=>!e.own_site_cited);
 if(!missing.length)return [];
 const out=[];
 const bing=missing.filter(e=>BING_ENGINES.has(e.id));
 if(bing.length)out.push({id:'bing_webmaster_tools',title:'Get the page into Bing',
  why:`${bing.map(e=>e.label).join(' and ')} ${bing.length===1?'does':'do'} not cite you. ChatGPT Search and Microsoft Copilot find pages through the Bing index.`,
  steps:['Open Bing Webmaster Tools (bing.com/webmasters) and import your site from Google Search Console.','Submit your XML sitemap.','Submit this page URL with URL Submission, and again after every important change.']});
 out.push({id:'consistent_listings',title:'Make your business listings consistent',
  why:`${missing.map(e=>e.label).join(', ')} ${missing.length===1?'does':'do'} not cite you. AI systems often rely on directories and review sites to confirm a business.`,
  steps:['Check the directories that matter in your market (for local services, for example Yelp, BBB, Angi, Houzz, Nextdoor and your local chamber of commerce).','Use exactly the same business name, address, phone number and website URL everywhere, matching your website.','Link to this page where a listing allows a service URL.']});
 if(topSites.length){const names=topSites.slice(0,3).map(t=>t.site);
  out.push({id:'compare_cited_pages',title:'Compare the pages AI does cite',
   why:`AI cites ${names.join(', ')} for this search instead of your page.`,
   steps:[`Open the cited pages of ${names.join(', ')}.`,'Note what they state directly: price or price range, arrival or response time, service area (counties or cities), insurance and licence, and the process steps.','Add each point that is true for your business and missing from your page. Never copy claims you cannot back up.']});}
 out.push({id:'choose_ai_topics',title:'Choose the AI topics in Step 2',
  why:'The topics and questions in Step 2 include what the cited pages answer.',
  steps:['In Step 2, select the topics and questions AI answers with other sites and your page does not cover yet.','Write or update those sections, publish, then check the AI answers again after the page is re-crawled.']});
 return out;
}

function summarizeAiAnswers(rows,{pageUrl,googleUrls=[],query}={}){
 // Stored answers are re-read with the current rules, so a parser fix also corrects older pastes. An answer that fails
 // the validation contract is reported as INVALID with its reason and is not counted anywhere.
 rows=rows.map(r=>r&&typeof r.raw_text==='string'?{...r,parsed:parseAiAnswer(r.raw_text,{pageUrl,query:query||r.query})}:r);
 const invalidRows=rows.filter(r=>r&&r.parsed&&r.parsed.validation_status==='invalid');
 const invalid=ENGINES.filter(e=>invalidRows.some(r=>r.engine===e.id)).map(e=>{const r=invalidRows.find(x=>x.engine===e.id);return {id:e.id,label:e.label,reason:r.parsed.error_reason,message:r.parsed.error_message,checked_at:r.created_at||null}});
 rows=rows.filter(r=>!(r&&r.parsed&&r.parsed.validation_status==='invalid'));
 const byEngine=new Map(rows.map(r=>[r.engine,r]));
 const engines=ENGINES.map(e=>{const r=byEngine.get(e.id);const p=r&&r.parsed;
  return {id:e.id,label:e.label,checked:!!p,invalid:invalid.some(x=>x.id===e.id)&&!p,topic_warning:!!(p&&(p.warnings||[]).includes('topic_unconfirmed')),sources:p?p.sources.length:0,own_site_cited:!!(p&&p.own_site_cited),
   resources_status:p?p.resources_status||'LISTED':null,verifiable:!!(p&&p.sources_verifiable!==false),
   own_url_mentioned_not_cited:!!(p&&p.own_url_mentioned_not_cited),
   exact_page_cited:!!(p&&p.exact_page_cited),site_name_mentioned:!!(p&&p.site_name_mentioned),checked_at:r?r.created_at||null:null}});
 const checked=engines.filter(e=>e.checked);
 // Only answers with an explicit RESOURCES section can show whether AI cites you.
 const verifiable=checked.filter(e=>e.verifiable),unverified=checked.filter(e=>!e.verifiable);
 const ownRoot=rootOf(hostOf(pageUrl));
 const counts=new Map();
 for(const r of rows){if(!r.parsed||r.parsed.sources_verifiable===false)continue;for(const s of r.parsed.source_sites){if(s===ownRoot)continue;counts.set(s,(counts.get(s)||0)+1)}}
 const topSites=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8).map(([site,n])=>({site,ai_systems:n}));
 const googleSites=new Set(googleUrls.map(u=>rootOf(hostOf(u))).filter(Boolean));
 const both=topSites.filter(t=>googleSites.has(t.site)).map(t=>t.site);
 const cited=verifiable.filter(e=>e.own_site_cited),exact=verifiable.filter(e=>e.exact_page_cited);
 const n=verifiable.length,sys=k=>`AI ${k===1?'system':'systems'}`;
 let headline,explanation,steps=[];
 if(!checked.length){
  headline='AI answers not checked yet';
  explanation='Paste the answer of at least one AI system below to see whether AI cites your site for this search.';
 }else if(!n){
  headline='Not verified: no source list in the pasted answers';
  explanation='The answers you pasted have no source list (RESOURCES, Sources, or numbered links like [1]: https://...), so it cannot be verified which sources AI used. Links inside the answer text are not counted as sources. Copy the answer with the copy button of the AI system, so its source links come along.';
 }else if(!cited.length){
  headline=`Not cited by AI: 0 of ${n} ${sys(n)} with a source list`;
  explanation='None of the source lists you pasted contains a page of your website for this search.';
 }else{
  headline=`Cited by ${cited.length} of ${n} ${sys(n)} with a source list`;
  explanation=exact.length?`${exact.map(e=>e.label).join(', ')} ${exact.length===1?'lists':'list'} exactly this page as a source.`
   :'AI lists your website as a source, but a different page than the one checked.';
 }
 if(unverified.length&&n)explanation+=` ${unverified.map(e=>e.label).join(', ')}: no source list in the pasted answer (copy it with the AI system's copy button so the source links come along), not verified.`;
 const warned=checked.filter(e=>e.topic_warning);
 if(invalid.length)steps.unshift(`Not counted: ${invalid.map(x=>x.label+' — '+x.message).join(' ')}`);
 if(warned.length)steps.push(`Check the topic of ${warned.map(e=>e.label).join(', ')}: ${warned.length===1?'this answer shares':'these answers share'} no word with “${String(query||'').trim()}”. ${warned.length===1?'It still counts':'They still count'} (synonyms are fine); remove ${warned.length===1?'it':'them'} if ${warned.length===1?'it answers':'they answer'} a different question.`);
 if(checked.length){
  if(unverified.length)steps.push(`Paste the answer of ${unverified.map(e=>e.label).join(', ')} again from a new chat, using the prompt unchanged, so the answer ends with a RESOURCES list.`);
  if(topSites.length)steps.push(`Open the sites AI cites most (${topSites.slice(0,3).map(t=>t.site).join(', ')}) and compare what they answer directly with your page.`);
  if(both.length)steps.push(`${both.length===1?'This site is cited by AI and also ranks':'These sites are cited by AI and also rank'} in Google for this search: ${both.join(', ')}. The same sites show up in both.`);
  if(cited.length&&!exact.length)steps.push('AI prefers another page of your site for this search. Check whether that page or this one should answer it, so they do not compete.');
  if(checked.length<ENGINES.length)steps.push(`Check the remaining AI systems too (${engines.filter(e=>!e.checked).map(e=>e.label).join(', ')}): answers differ per system.`);
 }
 const visibility_actions=aiVisibilityActions({verifiable,topSites});
 return {checked:checked.length,verifiable:n,unverified:unverified.length,total:ENGINES.length,invalid:invalid.length,invalid_engines:invalid,topic_warnings:warned.map(e=>e.label),engines,cited_by:cited.length,exact_page_by:exact.length,
  top_cited_sites:topSites,also_in_google:both,headline,explanation,steps,visibility_actions,
  caveat:'AI answers differ per user, location, account and time. This shows only the answers you pasted, at the moment you ran them.'};
}

module.exports={validateGrowthAnswer,noiseUrl,withoutTracking,otherPrompt,ENGINES,ENGINE_IDS,MAX_PASTE,DIRECT_PROMPT_LINES,QUERY_SLOT,directPrompt,cleanAiPaste,parseAiAnswer,summarizeAiAnswers,aiVisibilityActions,rootOf};
