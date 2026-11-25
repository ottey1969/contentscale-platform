'use strict';
// Shared external-editor report contract. An editor declaration is not live verification.
const VERSION='contentscale.implementation.v1';
function exactUrl(value){
 if(typeof value!=='string'||value.length>2048)throw Error('Invalid page URL');
 const u=new URL(value);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash)throw Error('Invalid page URL');
 return u.href;
}
function parseImplementationReport(raw,expectedUrl,now=new Date()){
 if(typeof raw==='string'){
  if(raw.length>16000)throw Error('Report is too long');
  raw=JSON.parse(raw.trim());
 }
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.schema!==VERSION)throw Error('Invalid implementation report schema');
 if(exactUrl(raw.url)!==exactUrl(expectedUrl))throw Error('Report belongs to a different page');
 if(!['published','implemented','not_published'].includes(raw.status))throw Error('Invalid publication status');
 if(typeof raw.summary!=='string'||!raw.summary.trim()||raw.summary.trim().length>500)throw Error('Provide an actual change summary of 1–500 characters');
 let date=null;
 if(raw.status==='published'){
  const t=raw.published_at;
  if(typeof t!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(t))throw Error('Provide actual publication time in UTC');
  const d=new Date(t);
  if(!Number.isFinite(d.getTime())||d.toISOString().replace('.000Z','Z')!==t||d>now)throw Error('Invalid or future publication time');
  date=t.slice(0,10);
 }else if(raw.published_at!=null)throw Error('Unpublished reports must not contain a publication time');
 const types=['content','technical_seo','schema','geo','ux','general'];
 if(!Array.isArray(raw.change_types)||!raw.change_types.length||raw.change_types.some(t=>!types.includes(t)))throw Error('Invalid change types');
 if(raw.evidence!=null&&(typeof raw.evidence!=='string'||raw.evidence.length>1000))throw Error('Invalid implementation evidence');
 return {schema:VERSION,url:exactUrl(raw.url),status:raw.status,published_at:date?raw.published_at:null,summary:raw.summary.trim(),change_types:[...new Set(raw.change_types)],evidence:raw.evidence||null,published_on:date,verified:false};
}
module.exports={VERSION,parseImplementationReport};
