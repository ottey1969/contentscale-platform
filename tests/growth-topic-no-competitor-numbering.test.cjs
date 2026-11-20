'use strict';
// Owner 2026-11-20 (es.contentscale.site/optimizacion-de-contenido-seo/ brief): the topic "2. Find semantically related
// keywords" carried the step number of a competitor's list ("2. Encuentra palabras clave…"). A topic in the brief is our
// own label for a reader need; the competitor's numbering means nothing on the owner's page.
const test=require('node:test'),assert=require('node:assert/strict');
const {validateTopics}=require('../src/growth-competitor-overview.cjs');
const {buildGapList}=require('../src/growth-gap-list.cjs');

const competitors=[{host:'es.semrush.com',serp_position:3,sections:[{heading:'2. Encuentra palabras clave semánticamente relacionadas',excerpt:''},{heading:'Step 6) Internal links',excerpt:''},{heading:'24/7 soporte',excerpt:''},{heading:'1.500 techos al año',excerpt:''}]}];
const page=[{heading:'Contenido SEO y búsqueda con IA'}];

test('topic titles never carry a competitor list number',()=>{
 const raw=JSON.stringify({topics:[
  {topic:'2. Find semantically related keywords',sections:[{host:'es.semrush.com',heading:'2. Encuentra palabras clave semánticamente relacionadas'}],page_covers:'NO',page_heading:null},
  {topic:'Step 6) Internal links',sections:[{host:'es.semrush.com',heading:'Step 6) Internal links'}],page_covers:'NO',page_heading:null},
  {topic:'24/7 support',sections:[{host:'es.semrush.com',heading:'24/7 soporte'}],page_covers:'NO',page_heading:null}]});
 const v=validateTopics(raw,competitors,page);
 assert.deepEqual(v.topics.map(t=>t.topic).sort(),['24/7 support','Find semantically related keywords','Internal links']);
 // The competitor's own heading stays exactly as it was: it is the evidence, quoted.
 assert.ok(v.topics.some(t=>t.sections.some(s=>s.heading==='2. Encuentra palabras clave semánticamente relacionadas')));
});

test('a single ranking-page section used as an item title loses the list number too; numbers that are content stay',()=>{
 const ov={status:'OBSERVED',ranking_pages_read:1,topics:[],topics_status:'GROUPED',this_page_sections:[],
  ungrouped_sections:competitors[0].sections.map(s=>({host:'es.semrush.com',heading:s.heading,excerpt:'',url:'https://es.semrush.com/x'}))};
 const titles=buildGapList({competitor_overview:ov}).items.map(i=>i.title);
 assert.ok(titles.includes('Encuentra palabras clave semánticamente relacionadas'),titles.join(' | '));
 assert.ok(titles.includes('Internal links'));
 assert.ok(titles.includes('24/7 soporte'));
 assert.ok(titles.includes('1.500 techos al año'));
});
