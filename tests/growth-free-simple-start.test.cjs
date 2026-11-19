'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const routes=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
const {FORM_TEXTS}=require('../src/growth-free/form-texts.cjs');
function inlineStart(){
 const st=routes.indexOf("(function(){\n var u=document.getElementById('url'),btn=document.getElementById('freePrimaryRun')");
 const end=routes.indexOf('// A "new check for this page" link',st);
 assert.ok(st>0&&end>st,'Free Growth public start UI script must be present');
 return routes.slice(st,end);
}
test('Website Growth Check is page-first for existing, unknown URL with genuinely optional extras',()=>{
 assert.match(routes,/id="url" name="url"/);
 assert.match(routes,/id="freePrimaryRun" disabled/);
 assert.match(routes,/id="freeUrlStatus"/);
 assert.match(routes,/id="query" name="query"/);
 assert.match(routes,/id="market" name="market"/);
 assert.match(routes,/id="language" name="language"/);
 assert.match(routes,/<details class="free-simple-optional" id="freeExtraSources">/);
 assert.match(routes,/id="gscFile" name="gscFile"/);
 assert.match(routes,/id="freeSitemapUrl"/);
 assert.match(routes,/id="freeSitemapFile" name="sitemapFile"/);
 assert.match(routes,/sitemap_file:sf/);
 assert.match(routes,/sitemap_url:\(document\.getElementById\('freeSitemapUrl'\)/);
 assert.match(routes,/id="freeSitemapOpen" disabled/);
 assert.match(routes,/\$\{aiStartBlock\(!!owner\.signedIn\|\|!!invite,t,true\)\}/);
 assert.match(routes,/id="freeSitemapSection"/);
 assert.match(routes,/id="freeGscSection"/);
 assert.match(routes,/id="aiStartPrompt"/);
 assert.match(routes,/ai_answers:aiStartAnswers\(\)/);
 assert.match(routes,/gsc_file:gf/);
 assert.match(routes,/url:f\.url\.value/);
 assert.match(routes,/query:f\.query\.value/);
 assert.match(routes,/market:f\.market\.value/);
 assert.match(routes,/language:f\.language\.value/);
 assert.match(routes,/<details class="card free-simple-details">/);
});
test('Sitemap opener is only a browser link; it never claims import or verification',()=>{
 for(const lang of ['en','nl','es']){
  const t=FORM_TEXTS[lang];
  for(const key of ['simpleIntro','simpleStart','simpleChooseUrl','simpleUrlStatus','simpleUrlReady',
   'simpleOptional','simpleOptionalHint','simpleSitemapInfo','simpleSitemap','simpleSitemapOpen',
   'simpleSitemapInvalid','simpleSitemapUnverified'])assert.ok(t[key],lang+' missing '+key);
 }
 assert.match(FORM_TEXTS.en.simpleSitemapInfo,/import URL candidates when you run the check/);
 const s=inlineStart();
 assert.match(s,/window\.open\(target,'_blank','noopener,noreferrer'\)/);
 assert.doesNotMatch(s,/fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
});
test('URL entry controls enablement, prefilled page handling and honest sitemap link',()=>{
 const callbacks={},elements={};
 const element=(id,props={})=>Object.assign({
  id,value:'',disabled:false,textContent:'',
  addEventListener(type,fn){callbacks[id+':'+type]=fn}
 },props);
 elements.url=element('url');
 elements.freePrimaryRun=element('freePrimaryRun',{disabled:true});
 elements.freeUrlStatus=element('freeUrlStatus');
 elements.freeSitemapUrl=element('freeSitemapUrl');
 elements.freeSitemapOpen=element('freeSitemapOpen',{disabled:true});
 elements.freeSitemapStatus=element('freeSitemapStatus');
 const document={getElementById:id=>elements[id],addEventListener(type,fn){callbacks['document:'+type]=fn}};
 let opened=null;
 const window={open:(url,target,features)=>{opened={url,target,features}}};
 const FT=FORM_TEXTS.en;
 new Function('FT','document','window','setTimeout','URL',inlineStart())(FT,document,window,(fn)=>fn(),URL);
 assert.equal(elements.freePrimaryRun.disabled,true);
 elements.url.value='https://example.com/roof-repair/';
 callbacks['url:input']();
 assert.equal(elements.freePrimaryRun.disabled,false);
 assert.equal(elements.freePrimaryRun.textContent,FT.submit);
 callbacks['freeSitemapOpen:click']();
 assert.equal(opened.url,'https://example.com/sitemap.xml');
 assert.equal(elements.freeSitemapStatus.textContent,FT.simpleSitemapUnverified);
 elements.url.value='Not a page URL';
 callbacks['url:input']();
 assert.equal(elements.freePrimaryRun.disabled,true);
 elements.url.value='https://example.com/page/';
 elements.freeSitemapUrl.value='https://example.com/custom-sitemap.xml';
 callbacks['freeSitemapUrl:input']();
 callbacks['freeSitemapOpen:click']();
 assert.equal(opened.url,'https://example.com/custom-sitemap.xml');
});

test('Free Growth sitemap import is optional and is not added to Tracker Growth form',()=>{
 assert.match(routes,/importSitemap\(b\.sitemap_file,url\)/);
 assert.match(routes,/sitemapUrls:job\.sitemap\?\.urls\|\|\[\]/);
 for(const lang of ['en','nl','es']){
  const t=FORM_TEXTS[lang];
  assert.ok(t.simpleSitemapImport&&t.simpleSitemapUploadHelp&&t.sSitemapBig);
 }
});
