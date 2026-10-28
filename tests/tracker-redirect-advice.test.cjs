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
test('tracker scan marks only a fully permanent (301/308) chain as an alias; temporary redirects stay their own page',()=>{
 const scan=src.slice(src.indexOf('// Record the real hop statuses (bounded, manual).'),src.indexOf("// Record the real hop statuses (bounded, manual).")+2600);
 assert.match(scan,/redirect: 'manual'/);assert.match(scan,/_i < 4/,'bounded number of hops');
 assert.match(scan,/_hops\.every\(c => c === 301 \|\| c === 308\)/);
 assert.match(scan,/UPDATE tracker_pages SET redirects_to=NULL/,'a temporary redirect clears the alias flag');
 assert(!/DELETE FROM tracker_pages/.test(scan),'the scan never deletes a tracked page');
});
