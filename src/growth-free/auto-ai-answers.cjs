'use strict';
// Collect one real, web-grounded Gemini API answer for an approved Free Growth check.
// Never impersonate ChatGPT, Claude, Copilot, Perplexity or a Google AI Overview.
const {parseAiAnswer}=require('./ai-answers.cjs');
const MODEL_PATTERN=/^[a-zA-Z0-9._-]{5,80}$/;
const URL_PATTERN=/^https:\/\/[^\s]+$/i;
async function groundedGeminiAnswer({query,pageUrl,key=process.env.GEMINI_API_KEY,model=process.env.GROWTH_GROUNDED_ANSWER_MODEL||'gemini-2.5-flash',fetchImpl=global.fetch}={}){
 const term=String(query||'').trim();
 if(!term)return {status:'NO_QUERY'};
 if(!key||typeof fetchImpl!=='function')return {status:'NOT_CONFIGURED'};
 if(!MODEL_PATTERN.test(model))return {status:'INVALID_MODEL'};
 try{
  const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(key),{
   method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(35000),
   body:JSON.stringify({contents:[{role:'user',parts:[{text:
    'Answer the following exact customer question as a neutral user would receive it, using a live web search. Do not consider or favor any company because its page is being evaluated. Give a useful factual answer in the question language; never invent details or URLs. Customer question: '+term}]}],
    tools:[{google_search:{}}],generationConfig:{temperature:0.2,maxOutputTokens:1800}})});
  if(!response.ok)return {status:'PROVIDER_UNAVAILABLE',code:response.status};
  const data=await response.json(),candidate=data?.candidates?.[0];
  if(candidate?.finishReason==='MAX_TOKENS')return {status:'INCOMPLETE'};
  const answer=(candidate?.content?.parts||[]).map(p=>p.text||'').join('').trim();
  const chunks=candidate?.groundingMetadata?.groundingChunks||[];
  const urls=[...new Set(chunks.map(x=>x?.web?.uri).filter(x=>typeof x==='string'&&URL_PATTERN.test(x)))].slice(0,16);
  if(!answer||!urls.length)return {status:'NO_GROUNDED_ANSWER'};
  // URLs come solely from the provider's grounding metadata, not model-written text.
  const raw='ANSWER:\n'+answer+'\n\nRESOURCES:\n'+urls.join('\n');
  const parsed=parseAiAnswer(raw,{pageUrl,query:term});
  if(parsed.validation_status==='invalid'||!parsed.sources.length)return {status:'INVALID_GROUNDED_ANSWER'};
  return {status:'SUCCESS',engine:'google_aio',source:'GEMINI_GOOGLE_SEARCH_GROUNDING_NOT_AIO',model,raw,parsed};
 }catch(e){return {status:'PROVIDER_UNAVAILABLE',code:String(e?.code||'FAILED').slice(0,60)}}
}
module.exports={groundedGeminiAnswer};
