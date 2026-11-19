'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const routes=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
const {FORM_TEXTS}=require('../src/growth-free/form-texts.cjs');
test('The in-progress Free Growth screen shows only animated research steps, not pre-result AI answer editor',()=>{
 const poll=routes.slice(routes.indexOf('async function poll(n)'),routes.indexOf('poll(0);'));
 assert.ok(poll.includes('updateResearchProgress(d,n)'));
 assert.ok(!poll.includes('showAiFirst(d)'));
 assert.match(routes,/var RESEARCH_STEPS=\{en:/);
 assert.match(routes,/nl:\['Je pagina uitlezen'/);
 assert.match(routes,/es:\['Leyendo tu página'/);
 assert.match(routes,/id="freeResearchLiveStatus"/);
 assert.match(routes,/existing\.innerHTML=steps\.map/);
 assert.ok(!routes.includes("i<idx?'complete'"),'No stage should be marked complete based only on number of polling requests');
});
test('Evidence blocked means observations, not a recommendation to add unrelated general topics',()=>{
 assert.match(routes,/reviewOnly=!!\(d&&d\.summary&&d\.summary\.decision==='DATA_BLOCKED'\)/);
 assert.match(routes,/Research observations, not recommendations:/);
 assert.match(routes,/x\.recommended&&!reviewOnly/);
 assert.match(routes,/s\.decision!=='DATA_BLOCKED'&&s\.gaps/);
});
test('AI results remain on completed result screen with legible text in dark mode',()=>{
 assert.match(routes,/id="freeAiResearch"/);
 assert.match(routes,/\.growth-ai-prominent\{--ink:#172337;--muted:#475569/);
 assert.match(routes,/color:var\(--ink\)!important/);
});
test('Form supports three existing languages',()=>{
 for(const language of ['en','nl','es'])assert.ok(FORM_TEXTS[language]?.title);
});
