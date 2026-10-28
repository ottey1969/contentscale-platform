'use strict';
// The initial Tracker scan must not follow unvalidated redirects into private networks.
// Match the minimal Response surface used by the legacy scan while using the DNS-pinned public HTTPS reader.
const {fetchPublicGrowthHtml}=require('./growth-public-html-reader.cjs');
async function fetchInitialTrackerPage(url,opts={}){
 const read=await fetchPublicGrowthHtml(url,{limit:2_500_000,redirects:4,timeout:8000,
  ...opts});
 const headers=new Headers({'content-type':'text/html; charset=utf-8'});
 return {
  ok:true,status:200,url:read.final_url||url,headers,
  redirected:Array.isArray(read.redirect_chain)&&read.redirect_chain.length>0,
  async text(){return read.html},
  async arrayBuffer(){return Buffer.from(read.html,'utf8').buffer.slice(0)},
  redirect_chain:read.redirect_chain||[]
 };
}
module.exports={fetchInitialTrackerPage};
