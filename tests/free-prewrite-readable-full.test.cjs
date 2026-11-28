'use strict';
// Owner 2026-11-29: "er staat niet in welke concurrenten, welke gaps ze hebben op hun page … zelfde voor AI-systemen,
// wat hebben ze, wat zou ik moeten hebben … mooi afgescheiden per onderwerp; een editor of wie dan ook heeft hier meer aan
// en begrijpt wat we doen, nu is het alleen voor een pro of AI." Step 1 shows the whole brief in plain words, one block
// per topic, before Copy brief and Download. Also: in the Tracker the competitor URL showed as "/^https:/".
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const express=require('express');
const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
let chromium=null;try{({chromium}=require('playwright'))}catch{}

test('Tracker brief: the competitor and AI source URL checks survive the page template (no "/^https:/" link)',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','src','index.js'),'utf8');
 const start=src.indexOf('function renderPrewriteBrief(b) {');assert.ok(start>0);
 const body=src.slice(start,src.indexOf('\n}\n',start));
 // Inside the page template "\/\/" becomes "//", which turns the rest of the line into a comment.
 assert.doesNotMatch(body,/\/\^https:\\\/\\\//,'no /^https:\\/\\// regex inside the template');
 assert.match(body,/_safeCu=/);
});

const KEY='e'.repeat(64);
const BRIEF={language:'es',keyword:'cómo saber si chatgpt menciona mi empresa',
 content_decision:{recommended_treatment:'CREATE_NEW_PAGE',reason:'No page covers checking mentions yet.'},
 meta_package:{h1:'Cómo saber si ChatGPT menciona tu empresa',seo_title:'Saber si ChatGPT menciona tu empresa',meta_description:'Un método paso a paso para comprobar si ChatGPT menciona, cita o recomienda tu empresa.',url_slug:'/chatgpt-menciona-mi-empresa/'},
 search_intent:{primary:'informational'},
 opening_passage:{direct_answer:'Para saber si ChatGPT menciona tu empresa, haz las preguntas de un cliente en un chat nuevo.'},
 ai_answer:{key_takeaways:['Prueba en un chat nuevo.'],who_is_it_for:'Dueños de empresas.',why_it_matters:'Los clientes preguntan a la IA.'},
 quick_facts:[{label:'Bot de OpenAI',value:'OAI-SearchBot'}],
 definitive_outline:[{h2:'¿Por qué es importante saber si ChatGPT te menciona?',target_words:300,purpose:'Establecer la relevancia.',cover:['Importancia de la visibilidad en IA','Cambio en los hábitos de búsqueda'],citation_hook:'La forma más fiable es simular las consultas de un cliente.'}],
 competitor_table:[{rank:1,page_title:'Cómo aparecer en ChatGPT',domain:'tumarca.digital',exact_url:'https://tumarca.digital/como-aparecer-en-chatgpt/',what_they_have:'Explica que ChatGPT no indexa.',the_gap:'No da un método para saber si ya te menciona.',what_to_add:'Un método paso a paso de verificación.'}],
 ai_systems_analysis:{chatgpt:{checked:true,evidence_source:'manual',answer_summary:'ChatGPT recomienda hacer pruebas con prompts.',recommended_companies:['Brand X'],citation_sources:[{source_name:'enjoybedigital.com',exact_url:'https://www.enjoybedigital.com/como-saber/'}],domain_citations:['enjoybedigital.com'],exact_page_citations:[]},
  claude:{checked:false}},
 aio_citation_gap:'The AI Overview cites guides with a numbered method; add one.',
 internal_link_targets:[{anchor_text:'Visibilidad en IA',link_to:'https://es.contentscale.site/visibilidad-en-ia/',reason:'Same topic'}],
 external_link_targets:[{anchor_text:'Deep research in ChatGPT',exact_url:'https://chatgpt.com/features/deep-research/',supports_claim:'Cómo ChatGPT usa fuentes.'}],
 entity_strategy:{primary:['ChatGPT','Empresa'],secondary:['OAI-SearchBot'],supporting:['robots.txt'],relationships:[{subject:'OAI-SearchBot',relation:'rastrea',object:'tu web'}]},
 paa_questions:[{q:'¿Cómo saber si ChatGPT menciona mi empresa?',a:'Simula búsquedas de clientes.'}],
 faq_questions:['¿Es lo mismo una mención que una recomendación?'],
 evidence:{trust_signals:['Método paso a paso claro.'],experience_to_include:'Incluye las pruebas que hiciste.'},
 ai_source_leads:[{url:'https://relevantia.ai/como-saber/',system:'chatgpt'}],
 balance:{limitations:['Las respuestas varían entre sesiones.'],who_should_not_use_it:['Quien busca resultados garantizados.'],comparisons:[{a:'Verificar mención',b:'Intentar aparecer',why_it_matters:'Diagnóstico frente a estrategia.'}]},
 use_cases:[{audience:'Pequeña empresa local',scenario:'Quiere saber si aparece para fontanero en su ciudad.',benefit:'Sabrá si debe optimizar.'}],
 conclusion:{recap:'Saber si ChatGPT te menciona requiere pruebas.',outlook:'La visibilidad en IA evoluciona.',recommendation:'Aplica el método paso a paso.'},
 fact_safety:{verify_first:['El nombre exacto del bot.']},
 action_plan:[{step:1,action:'Crea la página con el H1.'}]};
function app(){const a=express();a.use(express.json());a.use(express.static(path.join(__dirname,'..','public')));registerFreePrewrite(a,{query:()=>{throw Error('no database')}});return a}

test('Step 1: the whole brief in plain words, one block per topic, before Copy brief',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const srv=app().listen(0),base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/free-pre-write/result',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,status:'open',language:'es',region:'es',
   website:'https://es.contentscale.site/',keyword:BRIEF.keyword,target:{mode:'CREATE',url:'https://es.contentscale.site/chatgpt-menciona-mi-empresa/'},instructions:'CREATE',brief:BRIEF})}));
  await page.route('**/api/free-pre-write/implementation-report',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,history:[],editor_brief:{meta_package:BRIEF.meta_package}})}));
  await page.goto(base+'/free-pre-write/r?lang=en#'+KEY);
  const box=page.locator('#brief-readable');await box.waitFor({state:'visible'});
  assert.ok((await box.boundingBox()).y<(await page.locator('#copy-brief').boundingBox()).y);
  const headings=await box.locator('h3').allInnerTexts();
  const want=['What to do','Page','Start the page with this answer','Quick facts','Page plan: sections in this order','Competitors: what they have, what they miss, what you add',
   'AI systems: what they answer and cite','Link to these own pages','External sources (verified)','Entities','Questions to answer on the page','Evidence and trust (E-E-A-T)',
   'Balanced view','Use cases','Conclusion','Check before you write it down','Steps'];
  let at=-1;for(const h of want){const i=headings.indexOf(h);assert.ok(i>at,'"'+h+'" in order in '+JSON.stringify(headings));at=i;}
  const text=await box.innerText();
  for(const s of ['Cómo aparecer en ChatGPT','https://tumarca.digital/como-aparecer-en-chatgpt/','Explica que ChatGPT no indexa.','No da un método para saber si ya te menciona.','Un método paso a paso de verificación.',
   'ChatGPT Search','ChatGPT recomienda hacer pruebas con prompts.','https://www.enjoybedigital.com/como-saber/','Your site cited: no','Claude','not researched',
   'The AI Overview cites guides with a numbered method; add one.','Importancia de la visibilidad en IA','La forma más fiable es simular las consultas de un cliente.',
   'https://chatgpt.com/features/deep-research/','Cómo ChatGPT usa fuentes.','OAI-SearchBot → rastrea → tu web','Simula búsquedas de clientes.','¿Es lo mismo una mención que una recomendación?',
   'Método paso a paso claro.','Incluye las pruebas que hiciste.','https://relevantia.ai/como-saber/','Las respuestas varían entre sesiones.','Quien busca resultados garantizados.',
   'Verificar mención vs Intentar aparecer','Pequeña empresa local','Saber si ChatGPT te menciona requiere pruebas.','Aplica el método paso a paso.','Research only: never link to these pages.']) assert.ok(text.includes(s),s);
  assert.equal(await box.locator('a[href^="https://tumarca.digital"]').count(),0,'a competitor is never a link');
  assert.doesNotMatch(text,/[{}]|"\w+":/,'no JSON');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();srv.close()}
});
