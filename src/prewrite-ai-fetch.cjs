'use strict';
// Fetch the answer of each AI system for one customer question (owner 2026-11-28: "per vraag moet ik de search in AI
// kunnen opvragen"). Only real provider answers: the Google AI Overview through SerpApi (Gemini with Google Search when
// Google shows none), ChatGPT through the OpenAI Responses API with web search, Perplexity Sonar, Claude with its web
// search tool, Copilot through SerpApi. The answer text is the model's; the RESOURCES are only the URLs in the
// provider's own citation data, never URLs the model wrote itself. Returned in the paste format the Tracker validates.
const {buildCustomerResearchPrompt}=require('./prewrite-ai-answer-research.cjs');

const ENGINES=['google_aio','chatgpt','perplexity','claude','copilot'];
const URL_RE=/^https:\/\/[^\s<>"]+$/i;
const MODEL_RE=/^[a-zA-Z0-9._-]{3,80}$/;
const TIMEOUT=90000;

function configuredEngines(env=process.env){
 return {google_aio:!!(env.SERPAPI_KEY||env.GEMINI_API_KEY),chatgpt:!!env.OPENAI_API_KEY,perplexity:!!env.PERPLEXITY_API_KEY,
  claude:!!env.ANTHROPIC_API_KEY,copilot:!!env.SERPAPI_KEY};
}
const cleanUrl=u=>{try{const x=new URL(String(u));for(const k of [...x.searchParams.keys()])if(/^utm_/i.test(k))x.searchParams.delete(k);return x.href.replace(/\?$/,'')}catch{return ''}};
function urlsOf(list){const out=[];for(const u of list){const c=cleanUrl(u);if(c&&URL_RE.test(c)&&!out.includes(c))out.push(c)}return out.slice(0,20)}
// The model's own ANSWER section, without a RESOURCES list it wrote itself.
function answerPart(text){
 let t=String(text||'').replace(/\r/g,'').trim();
 const cut=t.search(/(^|\n)\s*\**\s*(RESOURCES|SOURCES|FUENTES|BRONNEN)\s*\**\s*:/i);
 if(cut>=0)t=t.slice(0,cut);
 return t.replace(/^\s*\**\s*ANSWER\s*\**\s*:\s*/i,'').trim();
}
const format=(answer,urls)=>'ANSWER:\n'+answer+'\n\nRESOURCES:\n'+(urls.length?urls.join('\n'):'NO VERIFIED RESOURCES');
const model=(value,fallback)=>MODEL_RE.test(String(value||''))?String(value):fallback;
// A refused call keeps the provider's HTTP code and its own message, so the owner sees why (owner 2026-11-28, live:
// "Could not fetch (PROVIDER_UNAVAILABLE)"). Query strings and every configured key are removed from the message.
const SECRET_KEYS=['SERPAPI_KEY','GEMINI_API_KEY','OPENAI_API_KEY','PERPLEXITY_API_KEY','ANTHROPIC_API_KEY'];
function providerMessage(body,env){
 const raw=body&&(typeof body.error==='string'?body.error:body.error&&body.error.message||body.message||body.detail)||'';
 let text=String(typeof raw==='string'?raw:JSON.stringify(raw)).replace(/\?[^\s]*/g,'');
 for(const k of SECRET_KEYS){const v=String(env&&env[k]||'');if(v.length>=4)text=text.split(v).join('***')}
 return text.replace(/\s+/g,' ').trim().slice(0,240);
}
async function getJson(fetchImpl,url,opt={},env={}){
 const r=await fetchImpl(url,{...opt,signal:AbortSignal.timeout(TIMEOUT)});
 if(!r.ok){
  let body=null;try{body=await r.json()}catch{}
  const e=Error('provider '+r.status);e.provider=r.status;e.detail=providerMessage(body,env);throw e;
 }
 return r.json();
}
// SerpApi text_blocks (Google AI Overview, Copilot) as plain lines; lists as "- " items.
function blocksText(blocks){
 const lines=[];
 const walk=(items,depth)=>{for(const b of items||[]){
  if(!b||typeof b!=='object')continue;
  if(Array.isArray(b.list)){if(b.snippet)lines.push('  '.repeat(depth)+String(b.snippet).trim());for(const i of b.list){if(i&&i.snippet)lines.push('  '.repeat(depth)+'- '+String(i.snippet).trim());if(i&&Array.isArray(i.list))walk(i.list,depth+1)}continue}
  if(b.snippet)lines.push('  '.repeat(depth)+String(b.snippet).trim());
  if(Array.isArray(b.text_blocks))walk(b.text_blocks,depth);
 }};
 walk(blocks,0);return lines.filter(Boolean).join('\n');
}
const serp=(env,params)=>'https://serpapi.com/search.json?'+new URLSearchParams({...params,api_key:env.SERPAPI_KEY}).toString();

async function google({question,env,fetchImpl,language,country}){
 let serpRefused=null;
 if(env.SERPAPI_KEY)try{
  const params={engine:'google',q:question,no_cache:'true'};
  if(/^[a-z]{2}$/.test(language))params.hl=language;
  if(/^[a-z]{2}$/.test(country))params.gl=country==='uk'?'gb':country;
  const data=await getJson(fetchImpl,serp(env,params));
  let aio=data&&data.ai_overview;
  if(aio&&aio.page_token&&!Array.isArray(aio.text_blocks)){
   const more=await getJson(fetchImpl,serp(env,{engine:'google_ai_overview',page_token:aio.page_token}),{},env);
   aio=more&&more.ai_overview;
  }
  const answer=aio?blocksText(aio.text_blocks):'';
  if(answer)return {status:'SUCCESS',google_source:'ai_overview',provider:'Google AI Overview (SerpApi)',
   text:format(answer,urlsOf((aio.references||[]).map(r=>r&&r.link)))};
 }catch(e){if(!env.GEMINI_API_KEY)throw e;serpRefused=e}
 if(env.GEMINI_API_KEY){
  const m=model(env.PREWRITE_GEMINI_MODEL||env.GROWTH_GROUNDED_ANSWER_MODEL,'gemini-2.5-flash');
  const data=await getJson(fetchImpl,'https://generativelanguage.googleapis.com/v1beta/models/'+m+':generateContent?key='+encodeURIComponent(env.GEMINI_API_KEY),{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({contents:[{role:'user',parts:[{text:buildCustomerResearchPrompt(question)}]}],tools:[{google_search:{}}],generationConfig:{temperature:0.2,maxOutputTokens:2500}})},env);
  const c=data&&data.candidates&&data.candidates[0];
  const answer=answerPart((c&&c.content&&c.content.parts||[]).map(p=>p.text||'').join(''));
  if(!answer)return {status:'NO_ANSWER'};
  const urls=urlsOf((c.groundingMetadata&&c.groundingMetadata.groundingChunks||[]).map(x=>x&&x.web&&x.web.uri));
  return {status:'SUCCESS',google_source:'gemini',provider:'Gemini with Google Search ('+m+')',
   note:serpRefused?'SerpApi refused ('+serpRefused.provider+(serpRefused.detail?': '+serpRefused.detail:'')+'); this is the Gemini answer, not the AI Overview.'
    :env.SERPAPI_KEY?'Google showed no AI Overview for this question; this is the Gemini answer.':'Gemini answer (no SerpApi key to read the Google AI Overview).',text:format(answer,urls)};
 }
 return {status:'NO_AI_OVERVIEW',google_source:'no_ai_overview',provider:'Google AI Overview (SerpApi)',note:'Google showed no AI Overview for this question.',text:''};
}
async function perplexity({question,env,fetchImpl}){
 const m=model(env.PREWRITE_PERPLEXITY_MODEL,'sonar');
 const data=await getJson(fetchImpl,'https://api.perplexity.ai/chat/completions',{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PERPLEXITY_API_KEY},
  body:JSON.stringify({model:m,messages:[{role:'user',content:buildCustomerResearchPrompt(question)}],max_tokens:2500})},env);
 const answer=answerPart(data&&data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content);
 if(!answer)return {status:'NO_ANSWER'};
 const cited=Array.isArray(data.citations)?data.citations:(data.search_results||[]).map(r=>r&&r.url);
 return {status:'SUCCESS',provider:'Perplexity API ('+m+')',text:format(answer,urlsOf(cited))};
}
async function claude({question,env,fetchImpl}){
 const m=model(env.PREWRITE_CLAUDE_MODEL,'claude-sonnet-4-6');
 const data=await getJson(fetchImpl,'https://api.anthropic.com/v1/messages',{method:'POST',
  headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
  body:JSON.stringify({model:m,max_tokens:2500,tools:[{type:'web_search_20250305',name:'web_search',max_uses:5}],
   messages:[{role:'user',content:buildCustomerResearchPrompt(question)}]})},env);
 const blocks=(data&&data.content)||[];
 const texts=blocks.filter(b=>b&&b.type==='text');
 const answer=answerPart(texts.map(b=>b.text||'').join(''));
 if(!answer)return {status:'NO_ANSWER'};
 const cited=texts.flatMap(b=>(b.citations||[]).map(c=>c&&c.url));
 return {status:'SUCCESS',provider:'Claude API with web search ('+m+')',text:format(answer,urlsOf(cited))};
}
async function chatgpt({question,env,fetchImpl}){
 const m=model(env.PREWRITE_CHATGPT_MODEL,'gpt-5');
 const data=await getJson(fetchImpl,'https://api.openai.com/v1/responses',{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.OPENAI_API_KEY},
  body:JSON.stringify({model:m,tools:[{type:'web_search'}],input:buildCustomerResearchPrompt(question)})},env);
 const parts=((data&&data.output)||[]).filter(o=>o&&o.type==='message').flatMap(o=>o.content||[]).filter(c=>c&&c.type==='output_text');
 const answer=answerPart(parts.map(p=>p.text||'').join('\n'));
 if(!answer)return {status:'NO_ANSWER'};
 const cited=parts.flatMap(p=>(p.annotations||[]).filter(a=>a&&a.type==='url_citation').map(a=>a.url));
 return {status:'SUCCESS',provider:'OpenAI API with web search ('+m+') — not the ChatGPT app',text:format(answer,urlsOf(cited))};
}
async function copilot({question,env,fetchImpl}){
 const data=await getJson(fetchImpl,serp(env,{engine:'bing_copilot',q:question,no_cache:'true'}),{},env);
 const answer=[data&&data.header,blocksText(data&&data.text_blocks)].filter(Boolean).map(s=>String(s).trim()).join('\n');
 if(!answer)return {status:'NO_ANSWER'};
 return {status:'SUCCESS',provider:'Microsoft Copilot (SerpApi)',text:format(answer,urlsOf((data.references||[]).map(r=>r&&r.link)))};
}
const HANDLERS={google_aio:google,chatgpt,perplexity,claude,copilot};

async function fetchAiAnswer(engine,question,{env=process.env,fetchImpl=global.fetch,language='',country=''}={}){
 if(!ENGINES.includes(engine))return {status:'UNKNOWN_ENGINE'};
 const q=String(question||'').replace(/\s+/g,' ').trim().slice(0,300);
 if(!q)return {status:'NO_QUESTION'};
 if(!configuredEngines(env)[engine]||typeof fetchImpl!=='function')return {status:'NOT_CONFIGURED'};
 try{
  const out=await HANDLERS[engine]({question:q,env,fetchImpl,language:String(language||'').toLowerCase(),country:String(country||'').toLowerCase()});
  return {engine,...out};
 }catch(e){return {engine,status:'PROVIDER_UNAVAILABLE',code:e&&e.provider||(e&&e.name==='TimeoutError'?'TIMEOUT':'FAILED'),detail:e&&e.detail||''}}
}
module.exports={ENGINES,configuredEngines,fetchAiAnswer,answerPart,blocksText};
