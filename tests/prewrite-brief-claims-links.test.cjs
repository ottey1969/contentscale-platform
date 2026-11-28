'use strict';
// Owner 2026-11-29, the new Spanish "seo checker" brief:
// - "más de 100 señales críticas" passed the claims check (it only knew English): an unverified number in any language
//   is removed like an English one.
// - SEO title "… | [Tu Marca]": a bracket placeholder never reaches the brief.
// - Internal anchors were cut mid-phrase ("cómo encontrar la causa y") and the Dutch homepage was linked from a Spanish
//   page: anchors are whole, and content pages from another market are not linked (the own tool may be).
// - Per AI system the brief has citation_needs; the readable brief shows them as "what it takes to be cited".
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const q=require('../src/prewrite-quality.cjs');

test('unverified numbers in Spanish and Dutch are claims too; plain numbers in names are not',()=>{
 for(const s of ['Nuestro SEO checker realiza un análisis de más de 100 señales críticas.','Analiza más de 50 factores.','Wij controleren meer dan 200 punten.',
  'Ayudamos a 300 clientes.','Con 10 años de experiencia.','Ruim 40 bedrijven gebruiken het.','Over 120 checks run on every page.','100+ señales'])
  assert.equal(q.metricRiskAnyLanguage(s),true,s);
 for(const s of ['Encabezados H1-H6 y errores 404.','Core Web Vitals y velocidad.','Paso 1: introduce la URL.','Google PageSpeed Insights.'])
  assert.equal(q.metricRiskAnyLanguage(s),false,s);
 const src=fs.readFileSync(path.join(__dirname,'..','src','index.js'),'utf8');
 assert.match(src,/_pwbQuality\.metricRiskAnyLanguage\(/,'the generator\'s claims check uses it');
});

test('a bracket placeholder such as [Tu Marca] is removed from title, H1 and meta description',()=>{
 const meta={seo_title:'SEO Checker Gratis: Analiza tu Web al Instante | [Tu Marca]',h1:'Análisis SEO con [Your Brand]',meta_description:'Utiliza el SEO checker gratuito de [su empresa] para analizar el SEO on-page y técnico de tu web.'};
 assert.ok(q.metadataIssues(meta,'seo checker',2026).includes('placeholder'));
 q.repairMetadata(meta,'seo checker',2026);
 assert.equal(meta.seo_title,'SEO Checker Gratis: Analiza tu Web al Instante');
 assert.equal(meta.h1,'Análisis SEO');
 assert.doesNotMatch(meta.meta_description,/\[/);
 assert.ok(!q.metadataIssues(meta,'seo checker',2026).includes('placeholder'));
});

test('internal links: whole anchors, same market only for content; the own tool may be in another market',()=>{
 const pages=[
  {url:'https://es.contentscale.site/caida-de-trafico-web/',type:'content',heading:'Caída de tráfico web: cómo encontrar la causa y recuperar las visitas del SEO',h1:'Caída de tráfico web: cómo encontrar la causa y recuperar las visitas del SEO'},
  {url:'https://es.contentscale.site/rastreador-de-posiciones/',type:'content',heading:'Rastreador de posiciones SEO gratuito: comprueba tu posición en Google sin registro web',h1:'Rastreador de posiciones SEO gratuito: comprueba tu posición en Google sin registro web'},
  {url:'https://nl.contentscale.site/',type:'content',heading:'AI Overview optimalisatie voor moderne SEO gratis web',h1:'AI Overview optimalisatie voor moderne SEO gratis web'},
  {url:'https://contentscale.site/seo-guide/',type:'content',heading:'Free SEO guide for your web',h1:'Free SEO guide for your web'},
  {url:'https://app.contentscale.site/',type:'interactive_tool',heading:'Free SEO checker for your website',h1:'Free SEO checker for your website'}];
 // A new page has no URL yet: the market comes from the site (es.contentscale.site).
 const links=q.suggestInternalLinks([],pages,'¿Qué seo checker gratis analiza el SEO de mi web?',undefined,{market:q.marketOfUrl('https://es.contentscale.site/seo-checker/')});
 const urls=links.map(l=>l.link_to);
 assert.ok(!urls.includes('https://nl.contentscale.site/'),'no Dutch page on a Spanish page');
 assert.ok(!urls.includes('https://contentscale.site/seo-guide/'),'no default-market (English) content page');
 assert.ok(urls.includes('https://app.contentscale.site/'),'the own tool');
 const anchor=u=>links.find(l=>l.link_to===u).anchor_text;
 assert.equal(anchor('https://es.contentscale.site/caida-de-trafico-web/'),'Caída de tráfico web');
 assert.equal(anchor('https://es.contentscale.site/rastreador-de-posiciones/'),'Rastreador de posiciones SEO gratuito');
 assert.deepEqual(q.marketOfUrl('https://es.contentscale.site/x/'),'es');
 // The own tool behind a redirect on the same site is read; a redirect to another site is not.
 const html='<html><head><title>Free SEO checker</title></head><body><h1>Free SEO checker for your website</h1><form><input type="url" name="url"><button>Check</button></form></body></html>';
 const tool=q.ownPageFromRead('https://app.contentscale.site/',{status:200,final_url:'https://app.contentscale.site/?lang=en',html});
 assert.equal(tool.type,'interactive_tool');assert.equal(tool.url,'https://app.contentscale.site/?lang=en');
 assert.equal(q.ownPageFromRead('https://app.contentscale.site/',{status:200,final_url:'https://other.example/',html}),null);assert.equal(q.marketOfUrl('https://contentscale.site/es/x/'),'es');assert.equal(q.marketOfUrl('https://contentscale.site/x/'),'');
});

let chromium=null;try{({chromium}=require('playwright'))}catch{}
test('readable brief: per AI system "what it takes to be cited" from its citation_needs',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const express=require('express');const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
 const a=express();a.use(express.json());a.use(express.static(path.join(__dirname,'..','public')));registerFreePrewrite(a,{query:()=>{throw Error('no database')}});
 const srv=a.listen(0),base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  const brief={ai_systems_analysis:{claude:{checked:true,answer_summary:'Claude lists tools.',citation_needs:['Explain the limits of free versions.','List what is analysed on-page.']}}};
  await page.route('**/api/free-pre-write/result',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,status:'open',language:'es',region:'es',website:'https://es.contentscale.site/',keyword:'x',target:{mode:'CREATE',url:'https://es.contentscale.site/x/'},instructions:'CREATE',brief})}));
  await page.route('**/api/free-pre-write/implementation-report',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,history:[],editor_brief:{}})}));
  await page.goto(base+'/free-pre-write/r?lang=en#'+'f'.repeat(64));
  const box=page.locator('#brief-readable');await box.waitFor({state:'visible'});
  const text=await box.innerText();
  assert.match(text,/To be cited by Claude, the page needs:\s*\n?\s*Explain the limits of free versions\./);
  assert.ok(text.includes('List what is analysed on-page.'));
  // Owner 2026-11-28 (review of #628): one list per system, not a second copy of the same needs.
  for(const need of ['Explain the limits of free versions.','List what is analysed on-page.'])assert.equal(text.split(need).length-1,1,need+' shown once');
 }finally{await browser.close();srv.close()}
});
