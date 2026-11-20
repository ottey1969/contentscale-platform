'use strict';
// Owner 2026-11-20 (contentscale.site, search term "content scaling"): the AI systems were asked Google's "What is content at
// scale?" because it shared the word "content". "als de antwoorden content at scale is en er staat nergens content scaling
// is het wel verwarrend". The question asked must hold every core word of the search term, or the term itself is asked; and
// the brief says which question the AI systems were asked.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {aiQuestionForTerm}=require('../src/growth-customer-questions.cjs');
const serper=payload=>async()=>({ok:true,json:async()=>payload});

test('a Google question about another term is not asked: the search term itself is',async()=>{
 const q=await aiQuestionForTerm({term:'content scaling',gl:'us',hl:'en',key:'TEST',now:101,fetchImpl:serper({
  peopleAlsoAsk:[{question:'What is content at scale?'},{question:'What is content marketing?'}]})});
 assert.equal(q,null,'"content at scale" is another term than "content scaling"');
});

test('a question that holds every core word of the term is still chosen, also with small words in between',async()=>{
 const a=await aiQuestionForTerm({term:'content scaling',gl:'uk',hl:'en',key:'TEST',now:102,fetchImpl:serper({
  peopleAlsoAsk:[{question:'What is content at scale?'},{question:'What is content scaling in marketing?'}]})});
 assert.equal(a&&a.text,'What is content scaling in marketing?');
 const b=await aiQuestionForTerm({term:'content at scale',gl:'us',hl:'en',key:'TEST',now:103,fetchImpl:serper({
  peopleAlsoAsk:[{question:'What is content at scale?'}]})});
 assert.equal(b&&b.text,'What is content at scale?');
 const c=await aiQuestionForTerm({term:'consultor geo',gl:'es',hl:'es',key:'TEST',now:104,fetchImpl:serper({
  peopleAlsoAsk:[{question:'¿Cuánto gana un consultor GEO?'},{question:'¿Qué hace un consultor GEO?'}]})});
 assert.ok(c&&/consultor GEO/.test(c.text));
});

test('the brief names the question the AI systems were asked when it is not the search term itself',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
 const brief=src.slice(src.indexOf('function gapBrief(g,s,all,d){'),src.indexOf('function gapBrief(g,s,all,d){')+1600);
 assert.match(brief,/AI systems were asked: “/);
});
