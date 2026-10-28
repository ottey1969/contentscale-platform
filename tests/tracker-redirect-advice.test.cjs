'use strict';
// Tracker side of redirect identity. The Tracker client is an inline script inside src/index.js, so this test extracts that
// template, compiles every inline <script>, and checks the redirect card: permanent redirects are advised as one page with
// no website change and no deletion; dead URLs keep their own (separate) controls.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require.resolve('../src/index.js'),'utf8');
function clientHtml(){
 const head='const _CLIENT_TRACKER_HTML = `',start=src.indexOf(head);assert(start>0,'tracker client template present');
 let i=start+head.length,depth=0;
 for(;i<src.length;i++){const c=src[i];if(c==='\\'){i++;continue}if(c==='$'&&src[i+1]==='{'){depth++;i++;continue}if(c==='}'&&depth>0){depth--;continue}if(c==='`'&&depth===0)break}
 return vm.runInNewContext(src.slice(start+head.length-1,i+1).replace(/\$\{[^}]*\}/g,''),{});
}
test('tracker client script compiles and the redirect card gives the one-page advice without delete buttons',()=>{
 const html=clientHtml(),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 assert(scripts.length>=1);for(const s of scripts)new vm.Script(s);
 const card=html.slice(html.indexOf('var _head = isDead404'),html.indexOf("return '<div style=\"background:' + _bg"));
 assert.match(card,/Permanent redirect detected:/);
 assert.match(card,/This is one page, not duplicate content\. Keep the working redirect; no website change is required\./);
 const redirectBranch=card.slice(card.indexOf('}else if(destTracked){'));
 assert(!/removeRedirectedPage/.test(redirectBranch),'no delete action is offered for a redirected URL');
 assert.match(redirectBranch,/trackRedirectDestination/);
 assert.match(html,/async function trackRedirectDestination\(pageId, addUrl\)[\s\S]{0,200}api\('\/pages', 'POST'/);
 assert(!/async function trackRedirectDestination[\s\S]{0,300}'DELETE'/.test(html),'adding the destination never deletes the old row');
});
test('tracker scan verifies aliases only through the shared SSRF-safe reader and never deletes a page',()=>{
 const at=src.indexOf('// Verify the hop statuses with the shared SSRF-safe reader');assert(at>0);
 const scan=src.slice(at,at+2400);
 assert.match(scan,/require\('\.\/growth-url-identity\.cjs'\)\.verifyPermanentAlias\(page\.url, \{ expectedFinal: liveResp\.url \}\)/);
 assert(!/redirect: ?'manual'/.test(src.slice(at-200,at+2400)),'no unvalidated manual redirect crawl');
 assert.match(scan,/UPDATE tracker_pages SET redirects_to=NULL/,'anything not proven permanent clears the alias flag');
 assert(!/DELETE FROM tracker_pages/.test(scan),'the scan never deletes a tracked page');
});
// SYNTHETIC HTTPS per URL ({status, location} or HTML) and DNS (public unless the host is listed as private).
const {EventEmitter}=require('node:events');
const {fetchPublicGrowthHtml}=require('../src/growth-public-html-reader.cjs');
const {verifyPermanentAlias}=require('../src/growth-url-identity.cjs');
const routed=routes=>({request(url,opts,cb){const req=new EventEmitter();req.end=()=>{const r=routes[url.href]||{status:404};const res=new EventEmitter();
 res.statusCode=r.status;res.headers=r.location?{location:r.location}:{'content-type':'text/html'};res.resume=()=>{};res.destroy=()=>{};cb(res);
 if(r.status===200){res.emit('data',Buffer.from('<h1>x</h1>'));res.emit('end')}};req.destroy=()=>{};return req}});
const dns=privateHosts=>async h=>privateHosts.includes(h)?[{address:'192.168.1.10',family:4}]:[{address:'93.184.216.34',family:4}];
const check=(routes,{expectedFinal=null,priv=[]}={})=>verifyPermanentAlias('https://shop.example/old/',{expectedFinal,
 fetchHtml:(u,o)=>fetchPublicGrowthHtml(u,{...o,lookup:dns(priv),httpsModule:routed(routes)})});
const OLD='https://shop.example/old/',NEW='https://shop.example/new/';
test('verifyPermanentAlias: 301/308 to the URL the scan saw is an alias; everything else fails closed',async()=>{
 const ok=await check({[OLD]:{status:301,location:NEW},[NEW]:{status:200}},{expectedFinal:NEW});
 assert.equal(ok.permanent,true);assert.deepEqual(ok.hops,[301]);
 assert.equal((await check({[OLD]:{status:308,location:NEW},[NEW]:{status:200}},{expectedFinal:NEW})).permanent,true);
 const cases={
  'redirect to 127.0.0.1':[{[OLD]:{status:301,location:'https://127.0.0.1/admin'}},{}],
  'redirect to an RFC1918 host':[{[OLD]:{status:301,location:'https://intranet.example/'}},{priv:['intranet.example']}],
  'HTTP downgrade':[{[OLD]:{status:301,location:'http://shop.example/new/'}},{}],
  'redirect loop':[{[OLD]:{status:301,location:NEW},[NEW]:{status:301,location:OLD}},{}],
  'mixed 301 then 302':[{[OLD]:{status:301,location:'https://shop.example/mid/'},'https://shop.example/mid/':{status:302,location:NEW},[NEW]:{status:200}},{expectedFinal:NEW}],
  'unreachable target':[{[OLD]:{status:301,location:NEW},[NEW]:{status:503}},{}],
  'final URL differs from what the scan saw':[{[OLD]:{status:301,location:NEW},[NEW]:{status:200}},{expectedFinal:'https://shop.example/other/'}],
  'no redirect at all':[{[OLD]:{status:200}},{expectedFinal:NEW}]
 };
 for(const [name,[routes,opts]] of Object.entries(cases)){
  const r=await check(routes,opts);
  assert.equal(r.permanent,false,name+' must fail closed ('+r.kind+')');
 }
 const priv=await check({[OLD]:{status:301,location:'https://intranet.example/'}},{priv:['intranet.example']});
 assert.equal(priv.error,'PUBLIC_IPV4_UNAVAILABLE','the private host is refused before any request is sent');
});
