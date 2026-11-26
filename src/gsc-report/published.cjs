'use strict';
const {exactUrl}=require('../implementation-report.cjs');
const {relatedChecks}=require('../growth-free/contentscore.cjs');

const norm=url=>{try{return exactUrl(url)}catch{return ''}};
const sameUrl=(a,b)=>!!norm(a)&&norm(a)===norm(b);

async function publicationsFor(pool,urls,scope){
 const results=await growthFor(pool,urls,scope);
 return new Map([...results].filter(([,row])=>row.published_on).map(([url,row])=>[url,row.published_on]));
}

async function growthFor(pool,urls,{invite=null,reportId=null,owner=false}={}){
 const out=new Map(),want=new Set((urls||[]).map(norm).filter(Boolean));
 if(!pool||!want.size||(!invite&&!(owner&&reportId)))return out;
 await require('../growth-free/store.cjs').ensureTables(pool).catch(e=>console.warn('[gsc-report] free growth setup failed',e&&e.message));
 let rows;
 try{rows=await relatedChecks(pool,[...want],{invite,reportId,owner})}catch(e){return out}
 const link=r=>'/r/'+encodeURIComponent(r.public_id)+'?k='+encodeURIComponent(r.access_key);
 for(const r of rows){
  const k=norm(r.url);
  if(!want.has(k)||(!owner&&r.matching_invite!==true))continue;
  const x=out.get(k)||{published_on:null,note:null,owner_result:null,invite_result:null};
  if(owner&&!x.owner_result)x.owner_result=link(r);
  if(r.matching_invite===true&&!x.invite_result)x.invite_result=link(r);
  const d=r.published_on?String(r.published_on).slice(0,10):null;
  if(d&&(!x.published_on||d>x.published_on)){x.published_on=d;x.note=r.published_note?String(r.published_note).slice(0,500):null}
  else if(d&&d===x.published_on&&!x.note&&r.published_note){x.note=String(r.published_note).slice(0,500)}
  out.set(k,x);
 }
 return out;
}
module.exports={publicationsFor,growthFor,sameUrl,norm};
