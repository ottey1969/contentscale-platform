'use strict';
// AI answers for the free Growth check. The visitor runs ONE prompt for the exact
// search term in each AI system and pastes the answer back — the same
// "Keyword / question" mode as the Quick Scan admin (src/index.js, directPrompt).
// No AI API is called: nothing here costs money, and only what was pasted is used.

const ENGINES=[
 {id:'google_aio',label:'Google AIO / Gemini'},
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
// Links that are interface plumbing, not sources (same idea as the Tracker parser).
function noiseUrl(u){
 const h=hostOf(u);let p='';try{p=new URL(u).pathname.toLowerCase()}catch{}
 return h==='maps.app.goo.gl'||((h==='google.com'||h.endsWith('.google.com'))&&(p.startsWith('/maps')||p==='/goto'||p.startsWith('/search')||p.startsWith('/searchviewer')))||
  h.endsWith('gstatic.com')||h.endsWith('googleusercontent.com')||h==='support.google.com'||h==='accounts.google.com'||h==='gemini.google.com';
}

function parseAiAnswer(raw,{pageUrl}={}){
 const text=cleanAiPaste(String(raw||'').slice(0,MAX_PASTE));
 const sources=[],seen=new Set();
 const re=/https?:\/\/[^\s<>\][()"']+/gi;let m;
 while((m=re.exec(text))){
  const u=m[0].replace(/[.,;:!?*_]+$/,'');
  let href;try{const p=new URL(u);if(!/^https?:$/.test(p.protocol))continue;href=p.href}catch{continue}
  if(noiseUrl(href))continue;
  const key=normUrl(href);if(key&&!seen.has(key)){seen.add(key);sources.push(href)}
 }
 const clean=text.replace(/\*\*/g,'');
 const answer=(clean.split(/RESOURCES\s*:/i)[0]||'').replace(/^\s*ANSWER\s*:\s*/i,'').trim().slice(0,6000);
 const ownHost=hostOf(pageUrl),ownRoot=rootOf(ownHost),ownPage=normUrl(pageUrl);
 const own=sources.filter(u=>{const h=hostOf(u);return ownRoot&&(h===ownRoot||h.endsWith('.'+ownRoot))});
 const name=ownRoot.split('.')[0];
 return {
  answer,sources,
  source_sites:[...new Set(sources.map(u=>rootOf(hostOf(u))).filter(Boolean))],
  own_site_cited:own.length>0,
  exact_page_cited:own.some(u=>normUrl(u)===ownPage),
  own_cited_urls:own,
  // A name in the text is only a mention, never a citation.
  site_name_mentioned:name.length>=4&&new RegExp('\\b'+name.replace(/[^a-z0-9]/g,'.?')+'\\b','i').test(answer),
  no_sources:sources.length===0
 };
}

function summarizeAiAnswers(rows,{pageUrl,googleUrls=[]}={}){
 const byEngine=new Map(rows.map(r=>[r.engine,r]));
 const engines=ENGINES.map(e=>{const r=byEngine.get(e.id);const p=r&&r.parsed;
  return {id:e.id,label:e.label,checked:!!p,sources:p?p.sources.length:0,own_site_cited:!!(p&&p.own_site_cited),
   exact_page_cited:!!(p&&p.exact_page_cited),site_name_mentioned:!!(p&&p.site_name_mentioned),checked_at:r?r.created_at||null:null}});
 const checked=engines.filter(e=>e.checked);
 const ownRoot=rootOf(hostOf(pageUrl));
 const counts=new Map();
 for(const r of rows){if(!r.parsed)continue;for(const s of r.parsed.source_sites){if(s===ownRoot)continue;counts.set(s,(counts.get(s)||0)+1)}}
 const topSites=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8).map(([site,n])=>({site,ai_systems:n}));
 const googleSites=new Set(googleUrls.map(u=>rootOf(hostOf(u))).filter(Boolean));
 const both=topSites.filter(t=>googleSites.has(t.site)).map(t=>t.site);
 const cited=checked.filter(e=>e.own_site_cited),exact=checked.filter(e=>e.exact_page_cited);
 let headline,explanation,steps=[];
 if(!checked.length){
  headline='AI answers not checked yet';
  explanation='Paste the answer of at least one AI system below to see whether AI cites your site for this search.';
 }else if(!cited.length){
  headline=`Not cited by AI: 0 of ${checked.length} AI ${checked.length===1?'system':'systems'} checked`;
  explanation='None of the AI answers you pasted uses a page of your website as a source for this search.';
 }else{
  headline=`Cited by ${cited.length} of ${checked.length} AI ${checked.length===1?'system':'systems'} checked`;
  explanation=exact.length?`${exact.map(e=>e.label).join(', ')} ${exact.length===1?'cites':'cite'} exactly this page.`
   :'AI cites your website, but a different page than the one checked.';
 }
 if(checked.length){
  if(topSites.length)steps.push(`Open the sites AI cites most (${topSites.slice(0,3).map(t=>t.site).join(', ')}) and compare what they answer directly with your page.`);
  if(both.length)steps.push(`${both.length===1?'This site is cited by AI and also ranks':'These sites are cited by AI and also rank'} in Google for this search: ${both.join(', ')}. The same sites show up in both.`);
  if(cited.length&&!exact.length)steps.push('AI prefers another page of your site for this search. Check whether that page or this one should answer it, so they do not compete.');
  if(checked.length<ENGINES.length)steps.push(`Check the remaining AI systems too (${engines.filter(e=>!e.checked).map(e=>e.label).join(', ')}): answers differ per system.`);
 }
 return {checked:checked.length,total:ENGINES.length,engines,cited_by:cited.length,exact_page_by:exact.length,
  top_cited_sites:topSites,also_in_google:both,headline,explanation,steps,
  caveat:'AI answers differ per user, location, account and time. This shows only the answers you pasted, at the moment you ran them.'};
}

module.exports={ENGINES,ENGINE_IDS,MAX_PASTE,DIRECT_PROMPT_LINES,QUERY_SLOT,directPrompt,cleanAiPaste,parseAiAnswer,summarizeAiAnswers,rootOf};
