'use strict';
const {readWebsitePage,hostForWebsite,discoverCompanyContact}=require('./network-business-email-fetch.cjs');
const dns=require('node:dns').promises;
(async()=>{
 for(const host of ['jerseycraftroofing.com','penyakroofing.com','example.com']){
  console.log('CHECK',host);
  try{const a=await dns.lookup(host,{all:true,verbatim:true});console.log('DNS',a.map(x=>x.address));}catch(e){console.log('DNS_ERROR',e.code,e.message)}
  try{const html=await readWebsitePage(host,'/');console.log('HTML',html.length,html.slice(0,80));}catch(e){console.log('FETCH_ERROR',e.code,e.message,e.stack?.slice(0,1200));}
  try{const r=await discoverCompanyContact('https://'+host,{maxPages:1});console.log('DISCOVERY',JSON.stringify(r));}catch(e){console.log('DISCOVERY_ERROR',e.code,e.message);}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
