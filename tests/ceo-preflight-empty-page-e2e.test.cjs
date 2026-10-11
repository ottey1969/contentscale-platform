'use strict';
// Actual canonical CEO score and QuickScan run route, using only isolated mocked IO.
// Never touches a live prospect, remote website, Neon, AI provider, or email.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const a=source.indexOf('// Existing CEO and QuickScan scanners share a cheap content-readiness preflight.');
const b=source.indexOf('function _pqsSelectorScore(',a);
const c=source.indexOf('async function _pqsSelectBestScanPage(',b);
assert(a>0&&b>a&&b-a<6000&&c>b,'Canonical eligibility helper or score moved');
const home='https://fixture.example/',product=home+'product/roof-sealant/',service=home+'services/roof-repair/';
const words='Our roof sealant is formulated for residential repairs and protects flashing and roof joints against rain and seasonal damage. The flexible application works with asphalt and metal roofing. Contractors use it for detailed maintenance, and our technical team can advise customers about installation methods and realistic service life. '.repeat(3);
function html(title,body,extra=''){
 return '<!doctype html><html lang="en"><head><title>'+title+'</title>'+extra+'</head><body><header><nav>'+('Menu About Blog Contact Shop '.repeat(40))+'</nav></header><main><h1>'+title+'</h1>'+body+'</main><footer>'+('Copyright Refund Privacy Legal '.repeat(50))+'</footer></body></html>';
}
const good=html('Roof Sealant Product','<p>'+words+'</p><p>Specifications: weather-resistant coating for commercial roof maintenance, exterior installations and repair.</p>');
const serviceHtml=html('Roof Repair Service','<p>'+words+'</p><p>Our roof repair inspection covers flashing, leak detection and maintenance planning for local homeowners.</p>');
const empty=html('Roof Sealant Product','<div class="price">$29.00</div><button>Add to cart</button><p>SKU: 1234</p>');
const shell='<!doctype html><html><head><title>Roof Sealant Product</title></head><body><div id="root"></div><script>window.__INITIAL__={}</script></body></html>';
const scenario=(url,markup)=>({url,html:markup});
const ctx={URL,JSON,console:{log(){},warn(){},error(){}},
 _audit20SameHost:(x,y)=>new URL(x).hostname.replace(/^www\./,'')===new URL(y).hostname.replace(/^www\./,''),
 _pqsSelectorText:x=>String(x||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z0-9#]+;/gi,' ').replace(/\s+/g,' ').trim(),
 _pqsSelectorMeta:(x,t)=>{const m=String(x||'').match(new RegExp('<'+t+'\\b[^>]*>([\\s\\S]*?)<\\/'+t+'>','i'));return m?String(m[1]).replace(/<[^>]+>/g,' ').trim():''},
 _pqsSelectorTitle:x=>{const m=String(x||'').match(/<title[^>]*>([\s\S]*?)<\/title>/i);return m?m[1].trim():''},
 _pqsSelectorUrlEligible:()=>true,_ceoUtilityPage:()=>false,_pqsSelectorLooksArchive:()=>false
};
vm.runInNewContext(source.slice(a,c)+'\nglobalThis.inspect=_pqsPageReadiness;globalThis.score=_pqsSelectorScore;',ctx,{timeout:10000});
function inspect(url,markup){return JSON.parse(JSON.stringify(ctx.inspect(markup===null?null:scenario(url,markup),url)))}
test('empty product template is refused even with hundreds of nav/footer words',()=>{
 const d=inspect(product,empty);assert.equal(d.ok,false);assert.equal(d.code,'INSUFFICIENT_CONTENT');
 assert.equal(ctx.score(scenario(product,empty),home),null);
});
test('real product and service pages remain selectable; no blanket product-page exclusion',()=>{
 assert.equal(inspect(product,good).ok,true);
 assert(ctx.score(scenario(product,good),home));
 assert.equal(inspect(service,serviceHtml).ok,true);
 assert(ctx.score(scenario(service,serviceHtml),home));
});
test('JS-only product shell, failed HTML fetch and repeating boilerplate are refused',()=>{
 assert.equal(inspect(product,shell).code,'INSUFFICIENT_CONTENT');
 assert.equal(inspect(product,null).code,'PAGE_UNAVAILABLE');
 const repeated=html('Roof Product','<p>'+('same item click buy today '.repeat(50))+'</p><p>'+('same item click buy today '.repeat(30))+'</p>');
 assert.equal(inspect(product,repeated).code,'REPEATED_BOILERPLATE');
});
test('placeholder, soft-404, noindex and wrong-page redirects are blocked',()=>{
 assert.equal(inspect(product,html('Product not found','<p>'+words+'</p>')).code,'ERROR_OR_PLACEHOLDER');
 assert.equal(inspect(product,html('Roof Product','<p>Lorem ipsum dolor sit amet '+words+'</p>')).code,'PLACEHOLDER_COPY');
 assert.equal(inspect(product,html('Roof Product','<p>'+words+'</p>','<meta name="robots" content="noindex,follow">')).code,'NOT_INDEXABLE');
 assert.equal(JSON.parse(JSON.stringify(ctx.inspect(scenario(home,good),product))).code,'REDIRECTED_PAGE');
 assert.equal(JSON.parse(JSON.stringify(ctx.inspect(scenario('https://other.example/product/roof-sealant/',good),product))).code,'FOREIGN_REDIRECT');
});
test('readiness stays independent of ranking: useful content may have missing schema, meta and FAQ',()=>{
 const lean=html('Roof Repair','<p>'+words+'</p>');
 assert.equal(inspect(service,lean).ok,true);
});
const r0=source.indexOf("app.post('/api/prospect-quick-scan/:token/run',");
const r1=source.indexOf('\nfunction _pqsPageHtml(',r0);
assert(r0>0&&r1>r0&&r1-r0<11000,'Actual QuickScan route moved');
async function quick(page,mode='manual'){
 const state={scans:0,notices:0,updates:[],chosen:0},row={token:'fixture',url:product,status:'pending',page_selection_mode:mode,domain:'fixture.example'};
 let handler;
 const pool={async query(sql,args=[]){
  if(/^SELECT \* FROM prospect_quick_scans/.test(sql))return{rows:[row]};
  if(/^UPDATE prospect_quick_scans/.test(sql)){state.updates.push(sql);return{rows:[row]}};
  throw Error('Unexpected SQL: '+sql.slice(0,100));
 }};
 const m={...ctx,app:{post(_url,...args){handler=args[args.length-1]}},pool,_pqsPublicLimit:(_req,_res,next)=>next(),
 _ensureProspectQuickScanTable:async()=>true,
 _pqsSelectBestScanPage:async()=>{state.chosen++;return {selected_url:product,mode:'auto',selected:{}};},
 _pqsFetchPublicEmailPage:async()=>page,
 _pqsNotifyOwner:()=>{state.notices++;return Promise.resolve()},
 _canonicalContentScoreScan:async()=>{state.scans++;return {success:true,score:73}},
 _pqsPublicRow:x=>x,_pqsMaybeSendCompletion:()=>{},
 _resolveSitemapUrls:async()=>[],process:{env:{}},setImmediate:()=>{},
 };
 vm.runInNewContext(source.slice(r0,r1),m,{timeout:10000});
 const res={code:200,status(n){this.code=n;return this},json(x){this.data=JSON.parse(JSON.stringify(x));return this}};
 await handler({params:{token:'fixture'},body:{}},res);
 return {res,state};
}
test('manual QuickScan rejects empty Page B BEFORE scanning state, report cost or notifications',async()=>{
 const x=await quick(scenario(product,empty));
 assert.equal(x.res.code,422);
 assert.equal(x.res.data.reason,'INSUFFICIENT_CONTENT');
 assert.equal(x.state.scans,0);assert.equal(x.state.notices,0);assert.equal(x.state.updates.length,0);
});
test('verified product Page B calls original scanner once',async()=>{
 const x=await quick(scenario(product,good));
 assert.equal(x.res.code,200,JSON.stringify(x.res.data));
 assert.equal(x.state.scans,1);assert.equal(x.state.notices,1);
 assert(x.state.updates.some(x=>x.includes("status='scanning'")));
});
test('automatic QuickScan selection cannot fall back to unverified seed URL',async()=>{
 const x=await quick(null,'auto');assert.equal(x.res.code,422);
 assert.equal(x.state.scans,0);assert.equal(x.state.notices,0);
});
