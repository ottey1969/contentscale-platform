'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const start=source.indexOf('async function _audit20Discover(');
const end=source.indexOf('\n// Admin/internal discovery endpoint',start);
assert(start>=0&&end>start&&end-start<14000,'Canonical Audit20 function markers changed');
const text=Array(35).fill('Verified service information').join(' ');
const wrap=body=>'<html><body><main>'+body+'</main></body></html>';
function runFixture(items){
  const pages=new Map(items.map(x=>[x.url,x.html]));
  pages.set('https://fixture.test/',wrap(text));
  const ctx={
    URL,Map,Set,Number,String,console,
    require:moduleName=>{
      assert.equal(moduleName,'./prospect/page-quality.cjs');
      return require('../src/prospect/page-quality.cjs');
    },
    fetch:async()=>({ok:false}),
    _audit20NormalizeUrl:(u,base)=>new URL(u,base).href,
    _audit20SameHost:(u,base)=>new URL(u).host===new URL(base).host,
    _audit20LooksUtility:u=>/\/privacy|\/disclaimer/.test(u),
    _audit20Classify:u=>u.includes('product')?'product':'service',
    _audit20Priority:()=>50,
    _audit20ExtractLinks:(_html,current)=>current==='https://fixture.test/'?items.map(x=>({url:x.url,source:'navigation',anchor_text:'Service'})):[],
    _audit20FetchHtmlInternal:async(_req,u)=>({ok:pages.has(u),html:pages.get(u)||''})
  };
  vm.runInNewContext(source.slice(start,end)+'\nglobalThis.discover=_audit20Discover;',ctx,{timeout:6000});
  return ctx.discover({},'https://fixture.test/',20);
}
test('Audit20 excludes empty product, privacy and unavailable pages without padding',async()=>{
 const cases=[
  {url:'https://fixture.test/product-blank',html:wrap('<form>'+Array(45).fill('<button>Add to cart</button>').join('')+'</form>')},
  {url:'https://fixture.test/product-useful',html:wrap(text)},
  {url:'https://fixture.test/privacy',html:wrap(text)},
  {url:'https://fixture.test/service-unavailable',html:''}
 ];
 const r=await runFixture(cases);
 const urls=r.selected.map(x=>x.url);
 assert(urls.some(u=>u.endsWith('product-useful')));
 assert(urls.some(u=>u==='https://fixture.test/'));
 assert(!urls.some(u=>u.includes('blank')||u.includes('privacy')||u.includes('unavailable')));
 assert.equal(r.selected_count,2);
 assert.equal(r.candidates.length,2,'unverified candidates must not be promoted as eligible');
 assert(r.excluded_content.some(x=>x.reason==='thin_or_empty'));
 assert(r.excluded_content.some(x=>x.reason==='html_unavailable'));
});
test('Audit20 caps at 20 unique pages based on verified content',async()=>{
 const items=Array.from({length:32},(_,i)=>({url:'https://fixture.test/service-'+i,html:wrap(text)}));
 const r=await runFixture(items);
 assert.equal(r.selected_count,20);
 assert.equal(new Set(r.selected.map(x=>x.url)).size,20);
});
