'use strict';
// Owner 2026-11-22: "als ik een pagina gedaan heb en in Growth een datum heb aangegeven, dan moet er een datum verschijnen,
// zodat ik en anderen die me inhuren weten dat het gedaan is." The report shows, per page, the publication date set in
// Free Growth (by the owner, or through the report's own invitation), looked up when the report is opened.
const test=require('node:test'),assert=require('node:assert/strict');
const {reportPage}=require('../src/gsc-report/routes.cjs');
const {publicationsFor,sameUrl}=require('../src/gsc-report/published.cjs');
const report={pages:[{rank:1,url:'https://nl.contentscale.site/wat-is-een-ai-overview/',action:'NO_CLICKS',clicks:0,impressions:1227,ctr:0,position:64.2,basis:'TOO_FEW'},
 {rank:2,url:'https://nl.contentscale.site/ai-zichtbaarheid/',action:'NO_CLICKS',clicks:0,impressions:544,ctr:0,position:30.4,basis:'TOO_FEW'}],
 bands:[],queries:{},files:[],notes:[],kpis:{}};
const row={title:'x',lang:'nl',created_at:new Date('2026-11-21'),expires_at:new Date(Date.now()+864e5),views:0,report,growth_invite:'inv-1'};
test('a page with a Growth publication date shows "Aangepast op …"; other pages show nothing',()=>{
 const published=new Map([['https://nl.contentscale.site/ai-zichtbaarheid','2026-11-21']]);
 const html=reportPage(row,{owner:false,config:{},growthPath:'/free-growth',published});
 const cell=u=>html.slice(html.indexOf('href="'+u+'"'),html.indexOf('</td>',html.indexOf('href="'+u+'"')));
 assert.match(cell('https://nl.contentscale.site/ai-zichtbaarheid/'),/class="chip done">Aangepast op 21 november 2026 \(Growth\)/);
 assert.doesNotMatch(cell('https://nl.contentscale.site/wat-is-een-ai-overview/'),/Aangepast op/);
 assert.match(reportPage({...row,lang:'en'},{owner:false,config:{},growthPath:'/free-growth',published}),/Updated on 21 November 2026 \(Growth\)/);
 assert.match(reportPage({...row,lang:'es'},{owner:false,config:{},growthPath:'/free-growth',published}),/Actualizada el 21 de noviembre de 2026 \(Growth\)/);
});
test('lookup: latest date per page, only checks of the owner or of this report invitation, trailing slash and www ignored',async()=>{
 assert.ok(sameUrl('https://www.x.nl/a/','https://x.nl/a'));
 const calls=[];
 const pool={query:async(sql,params)=>{calls.push({sql,params});return {rows:[
  {url:'https://nl.contentscale.site/ai-zichtbaarheid/',published_on:'2026-11-21'},{url:'https://nl.contentscale.site/ai-zichtbaarheid',published_on:'2026-11-10'}]}}};
 const m=await publicationsFor(pool,['https://nl.contentscale.site/ai-zichtbaarheid/'],{invite:'inv-1'});
 assert.equal(m.get('https://nl.contentscale.site/ai-zichtbaarheid'),'2026-11-21');
 assert.match(calls[0].sql,/published_on IS NOT NULL/);assert.match(calls[0].sql,/access_label='admin'/);assert.match(calls[0].sql,/token_hash/);
 // No Free Growth tables yet: no dates, no error.
 const none=await publicationsFor({query:async()=>{throw Object.assign(Error('relation does not exist'),{code:'42P01'})}},['https://a.example/']);
 assert.equal(none.size,0);
});
