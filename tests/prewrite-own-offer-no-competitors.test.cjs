'use strict';
// Owner 2026-11-28 (Spanish "seo checker" brief): the brief turned a tool query into a "best free SEO checkers" list that
// named Seobility, Semrush, Ahrefs and Rank Math, left the site's own checker out, chose "commercial" on one signal while
// the top results are tool pages, and gave two different H1s. Fixed in the generator for Free and Tracker Pre-Write.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Q=require('../src/prewrite-quality.cjs');

const serpUrls=['https://www.seobility.net/es/seocheck/','https://es.semrush.com/siteaudit/','https://rankmath.com/tools/seo-analyzer/','https://www.ionos.es/tools/analisis-web','https://www.acens.com/analisis-seo/'];
const aiLeads=['https://ahrefs.com/seo-checker','https://backlinko.com/tools/seo-checker','https://developers.google.com/search/docs'];
const brands=Q.competitorBrands({serpUrls,aiLeads,competitorTable:[{domain:'seigoo.com',company_or_publisher:'Seigoo'}],ownUrl:'https://es.contentscale.site/'});

test('competitor brands come from the live results, the AI answers and the competitor table; never the own site or official sources',()=>{
 const names=brands.map(b=>b.name).sort();
 for(const n of ['acens','ahrefs','backlinko','ionos','rankmath','semrush','seobility','seigoo'])assert.ok(names.includes(n),n);
 assert.ok(!names.includes('contentscale'));assert.ok(!names.includes('google'),'official documentation is not a competitor');
});

test('named competitors are found in any spelling ("Rank Math", "rank-math", "SEMrush"), not inside other words',()=>{
 const text='Herramientas como Seobility, Semrush Site Audit, Ahrefs SEO Checker y Rank Math SEO Analyzer ofrecen análisis. Estas funciones y opiniones ayudan; Google Search Console también.';
 assert.deepEqual(Q.namedCompetitors(text,brands).sort(),['ahrefs','rankmath','semrush','seobility']);
 assert.deepEqual(Q.namedCompetitors('Las funciones y opiniones de Google Search Console.',brands),[],'no false hits');
 assert.deepEqual(Q.namedCompetitors('Usa rank-math o SEMrush.',brands).sort(),['rankmath','semrush']);
});

test('reader-facing fields are checked; a last-resort scrub removes only the sentences that name a competitor',()=>{
 const brief={opening_passage:{direct_answer:'Un SEO checker gratis analiza tu web en segundos. Herramientas como Seobility y Semrush ofrecen análisis. El checker de ContentScale puntúa sobre 100.'},
  page_blueprint:[{h2:'Los mejores checkers (Seobility vs Semrush)',cover:['Qué mide Ahrefs','Qué mide un buen checker'],purpose:'Comparar criterios.'},{h2:'Cómo leer tu puntuación',cover:['Las tres partes del score']}],
  ai_answer:{direct_answer:'Usa un checker que mire contenido, técnica y citabilidad en IA.',key_takeaways:['Rank Math solo sirve en WordPress.','Mira la puntuación por partes.']},
  paa_questions:[{q:'¿Es fiable Semrush gratis?',a:'Semrush limita los análisis gratuitos. Un buen checker explica cada punto.'}],
  faq_questions:['¿Qué es un SEO checker?'],competitor_table:[{domain:'seobility.net',the_gap:'Seobility no mide la IA.'}]};
 const flagged=Q.competitorFields(brief,brands);
 assert.deepEqual(flagged.sort(),['ai_answer','opening_passage','page_blueprint','paa_questions'].sort());
 const removed=Q.scrubCompetitorSentences(brief,brands);
 assert.ok(removed>=4);
 assert.equal(brief.opening_passage.direct_answer,'Un SEO checker gratis analiza tu web en segundos. El checker de ContentScale puntúa sobre 100.');
 assert.deepEqual(brief.page_blueprint.map(x=>x.h2),['Cómo leer tu puntuación'],'a heading that names competitors goes');
 assert.deepEqual(brief.ai_answer.key_takeaways,['Mira la puntuación por partes.']);
 assert.equal(brief.paa_questions[0].q,'¿Es fiable Semrush gratis?','a real Google question stays verbatim');
 assert.equal(brief.paa_questions[0].a,'Un buen checker explica cada punto.');
 assert.equal(brief.competitor_table[0].the_gap,'Seobility no mide la IA.','research stays untouched');
 assert.deepEqual(Q.competitorFields(brief,brands),[]);
});

test('the site\'s own tool is found for a question-shaped tool query, also on a sister subdomain',()=>{
 const html='<html><head><title>SEO Checker gratis: puntuación sobre 100</title></head><body><h1>Analiza el SEO de tu web gratis</h1><form><input type="url" name="url"><button>Analizar</button></form></body></html>';
 const page=Q.websitePage('https://app.contentscale.site/',html);
 assert.equal(page.type,'interactive_tool');
 const offers=Q.firstPartyOffers('¿Qué seo checker gratis analiza el SEO de mi web?',[page]);
 assert.equal(offers.length,1);assert.equal(offers[0].url,'https://app.contentscale.site/');
 assert.equal(Q.firstPartyOffers('cuánto cuesta una auditoría seo',[page]).length,0,'a price question does not get the free tool as its answer');
});

test('one H1: the brief never gives two different H1s',()=>{
 const brief={recommended_title_h1:'Los Mejores SEO Checkers Gratuitos',meta_package:{h1:'SEO checker gratis: analiza tu web',seo_title:'x'}};
 Q.alignH1(brief);
 assert.equal(brief.recommended_title_h1,'SEO checker gratis: analiza tu web');
 const only={recommended_title_h1:'Solo esta',meta_package:{}};Q.alignH1(only);assert.equal(only.meta_package.h1,'Solo esta');
});

function loadIntent(){
 const src=fs.readFileSync(require.resolve('../src/index.js'),'utf8');
 const start=src.indexOf('function detectSearchIntent(');
 const end=src.indexOf('\n}\n',start)+3;
 const ctx={console};vm.createContext(ctx);vm.runInContext(src.slice(start,end)+';this.detect=detectSearchIntent;',ctx);
 return ctx.detect;
}
test('when the top results are free online tools, the intent is "use a tool" (transactional), not a comparison',()=>{
 const detect=loadIntent();
 const org=[{title:'SEO Checker | Test your website for free with Seobility',snippet:'The Seobility SEO checker scans any web page'},
  {title:'Free SEO Checker: Score Any Website in 60 Seconds',snippet:'Check any page SEO in seconds. Get your SEO score'},
  {title:'Free SEO Checker: Check for SEO & AI Search Issues',snippet:'Our free SEO Checker analyzes on-page and technical factors'},
  {title:'Análisis SEO gratis de tu web | IONOS',snippet:'Analiza tu web gratis con nuestra herramienta online'},
  {title:'Las mejores herramientas SEO gratuitas',snippet:'Las 10 mejores herramientas para analizar tu web'},
  {title:'SEO Analyzer - Rank Math',snippet:'Analyze your website SEO for free'}];
 const r=detect('¿Qué seo checker gratis analiza el SEO de mi web?',org,[],false,[]);
 assert.equal(r.primary,'transactional',JSON.stringify(r));
 assert.ok(r.evidence.some(e=>/free online tools/.test(e)));
 // A real comparison SERP (lists, reviews) stays commercial.
 const lists=[{title:'Best SEO tools 2026: reviews',snippet:'We compare the top 10 SEO tools'},{title:'Top 7 SEO platforms compared',snippet:'best alternatives and reviews'},{title:'The best SEO software for agencies',snippet:'reviews and pricing comparison'}];
 assert.equal(detect('best seo software',lists,[],false,[]).primary,'commercial');
});

test('the generator uses all of this (Free and Tracker Pre-Write share it)',()=>{
 const src=fs.readFileSync(require.resolve('../src/index.js'),'utf8');
 assert.match(src,/_pwbQuality\.competitorBrands\(\{serpUrls/);
 assert.match(src,/_pwbQuality\.competitorFields\(brief,_pwbBrands\)/);
 assert.match(src,/_pwbQuality\.scrubCompetitorSentences\(brief,_pwbBrands\)/);
 assert.match(src,/_pwbQuality\.alignH1\(brief\)/);
 assert.match(src,/NEVER NAME THESE COMPANIES OR TOOLS/);
 assert.match(src,/_pwbSisterRoots/);
});
