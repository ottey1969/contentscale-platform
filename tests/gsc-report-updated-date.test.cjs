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
 const published=new Map([['https://nl.contentscale.site/ai-zichtbaarheid/','2026-11-21']]);
 const html=reportPage(row,{owner:false,config:{},growthPath:'/free-growth',published});
 const cell=u=>html.slice(html.indexOf('href="'+u+'"'),html.indexOf('</td>',html.indexOf('href="'+u+'"')));
 assert.match(cell('https://nl.contentscale.site/ai-zichtbaarheid/'),/class="chip done">Aangepast op 21 november 2026 \(Growth\)/);
 assert.doesNotMatch(cell('https://nl.contentscale.site/wat-is-een-ai-overview/'),/Aangepast op/);
 assert.match(reportPage({...row,lang:'en'},{owner:false,config:{},growthPath:'/free-growth',published}),/Updated on 21 November 2026 \(Growth\)/);
 assert.match(reportPage({...row,lang:'es'},{owner:false,config:{},growthPath:'/free-growth',published}),/Actualizada el 21 de noviembre de 2026 \(Growth\)/);
});
test('lookup: latest date per page, only explicitly authorized checks with the same page identity',async()=>{
 assert.equal(sameUrl('https://www.x.nl/a/','https://x.nl/a'),false);
 assert.equal(sameUrl('https://x.nl/a?group=1','https://x.nl/a?group=2'),false);
 const calls=[];
 const pool={query:async(sql,params)=>{if(!sql.includes('ORDER BY c.finished_at DESC'))return {rows:[]};calls.push({sql,params});return {rows:[
  {matching_invite:true,url:'https://nl.contentscale.site/ai-zichtbaarheid/',published_on:'2026-11-21'},{matching_invite:true,url:'https://nl.contentscale.site/ai-zichtbaarheid',published_on:'2026-11-10'}]}}};
 const m=await publicationsFor(pool,['https://nl.contentscale.site/ai-zichtbaarheid/'],{invite:'inv-1'});
 assert.equal(m.get('https://nl.contentscale.site/ai-zichtbaarheid/'),'2026-11-21');
 assert.match(calls[0].sql,/url=ANY/);assert.match(calls[0].sql,/c\.invite_id IN/);assert.match(calls[0].sql,/token_hash/);
 // No Free Growth tables yet: no dates, no error.
 const none=await publicationsFor({query:async()=>{throw Object.assign(Error('relation does not exist'),{code:'42P01'})}},['https://a.example/']);
 assert.equal(none.size,0);
});

test('same publication date retains a recorded note without borrowing an older date note',async()=>{
 const {growthFor}=require('../src/gsc-report/published.cjs');
 const url='https://example.com/page/';
 const pool={query:async sql=>({rows:String(sql).includes('ORDER BY c.finished_at DESC')?[
 {url,public_id:'new',access_key:'key',access_label:'admin',published_on:'2026-11-22',published_note:null},
 {url,public_id:'same',access_key:'key',access_label:'admin',published_on:'2026-11-22',published_note:'Recorded work'},
 {url,public_id:'old',access_key:'key',access_label:'admin',published_on:'2026-11-21',published_note:'Old work'}
 ]:[]})};
 const out=await growthFor(pool,[url],{owner:true,reportId:38});
 assert.equal(out.get(url).note,'Recorded work');
});

test('report lists exact pages with more than five audit issues',()=>{
 const audit={issues:['A','B','C','D','E','F'],h1:[],hreflang:[],notes:[],words:100};
 const pages=report.pages.map((p,i)=>({...p,audit:{...audit,issues:audit.issues.slice(0,i?5:6)}}));
 const html=reportPage({...row,report:{...report,pages}},{owner:true,config:{},growthPath:'/free-growth'});
 const section=html.match(/<section[^>]*id="pagesOverFiveIssues"[\s\S]*?<\/section>/);
 assert.ok(section);assert.match(section[0],/wat-is-een-ai-overview/);assert.doesNotMatch(section[0],/ai-zichtbaarheid/);
});

test('problem KPI links to every affected page, including pages with only one issue',()=>{
 const pages=report.pages.map((p,i)=>({...p,audit:{issues:i?['A']:['A','B','C'],h1:[],hreflang:[],notes:[],words:100}}));
 for(const scope of ['CRAWL','SITE']){
  const html=reportPage({...row,report:{...report,scope,pages,kpis:{audit:{with_issues:2,pages_read:2,blocked:0}}}},{owner:true,config:{},growthPath:'/free-growth'});
  assert.match(html,/href="\?view=problems"/);
  assert.doesNotMatch(html,/id="pagesWithProblems"/);
  const filtered=reportPage({...row,report:{...report,scope,pages,kpis:{audit:{with_issues:2,pages_read:2,blocked:0}}}},{owner:true,config:{},growthPath:"/free-growth",problemsOnly:true});
  assert.match(filtered,/href="\?"/);
  const section=filtered.match(/<section[^>]*id="pagesWithProblems"[\s\S]*?<\/section>/);
  assert.ok(section);assert.match(section[0],/wat-is-een-ai-overview/);assert.match(section[0],/ai-zichtbaarheid/);
  assert.match(section[0],/\/free-growth\?/);
  assert.doesNotMatch(html,/id="pagesOverFiveIssues"/);
 }
});

test('issue views share one table, filter categories, and never duplicate overlapping pages',()=>{
 const a={issues:['NOINDEX','H1_MISSING'],h1:[],hreflang:[],notes:[],words:100};
 const pages=[{...report.pages[0],action:'BLOCKED',audit:a},{...report.pages[1],action:'REDIRECT',live:{hops:1,status:301,final_url:'https://nl.contentscale.site/'}}];
 const input={...row,report:{...report,pages,kpis:{audit:{with_issues:1,blocked:1},urls_checked:2,redirects:1,gone:0}}};
 const options={owner:true,config:{},growthPath:'/free-growth'};
 const main=reportPage(input,options);assert.doesNotMatch(main,/href="https:\/\/nl\.contentscale\.site\/wat-is-een-ai-overview\/"/);assert.doesNotMatch(main,/href="https:\/\/nl\.contentscale\.site\/ai-zichtbaarheid\/"/);assert.match(main,/href="\?view=blocked"/);assert.match(main,/href="\?view=redirects"/);assert.doesNotMatch(main,/href="\?view=gone"/);
 const all=reportPage(input,{...options,issueView:'all'});assert.match(all,/id="issueTable"/);assert.equal((all.match(/<tr data-issue-page=/g)||[]).length,2);
 const blocked=reportPage(input,{...options,issueView:'blocked'});assert.equal((blocked.match(/<tr data-issue-page=/g)||[]).length,1);
 assert.match(blocked,/wat-is-een-ai-overview/);assert.doesNotMatch(blocked,/ai-zichtbaarheid/);
});

test('owner finds completed research linked through its source report; recipient cannot borrow it',async()=>{
 const {growthFor}=require('../src/gsc-report/published.cjs');
 const url='https://example.com/page/';
 const calls=[];
 const pool={query:async(sql,args)=>{if(!String(sql).includes('ORDER BY c.finished_at DESC'))return {rows:[]};calls.push({sql,args});return {rows:[{url,public_id:'saved',access_key:'secret',access_label:'public',invite_id:null}]}}};
 const owner=await growthFor(pool,[url],{owner:true,reportId:38});
 assert.equal(owner.get(url).owner_result,'/r/saved?k=secret');
 assert.equal(calls[0].args[2],38);assert.match(calls[0].sql,/u\.gsc_report_id=\$3/);
 const recipient=await growthFor(pool,[url],{owner:false});
 assert.equal(recipient.get(url)?.owner_result||null,null);
});

test('existing research has a direct result link and a separate explicitly fresh research link',()=>{
 const url=report.pages[0].url;
 const growth=new Map([[require('../src/gsc-report/published.cjs').norm(url),{owner_result:'/r/saved?k=key'}]]);
 const html=reportPage({...row,lang:'en'},{owner:true,config:{},growthPath:'/free-growth',growth});
 assert.match(html,/href="\/free-growth\/r\/saved\?k=key&amp;lang=en"/);
 assert.match(html,/href="\/free-growth\?[^"]*fresh=1[^"]*"[^>]*>Research<\/a>/);
});
