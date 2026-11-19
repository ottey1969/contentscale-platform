'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
const {ROWS}=require('../src/growth-free/ui-texts.cjs');
test('One compact Growth result gives one optional evidence-backed brief and one action',()=>{
 assert.match(ui,/function growthBriefHtml\(s,d\)/);
 assert.match(ui,/ONE RESEARCH · ONE RESULT/);
 assert.match(ui,/id="growthOneBrief"/);
 assert.match(ui,/id="growthBriefDetails"/);
 for(const heading of ['What:','Where:','How:','Why:'])assert.ok(ui.includes(heading),heading);
 assert.match(ui,/h\+=growthBriefHtml\(s,d\)/);
 assert.match(ui,/cockpitInner\(NOW_CTX,chosen\)/);
});
test('Five system answers are consolidated and their detail collapsed unless explicitly opened',()=>{
 assert.match(ui,/id="freeAiResearch"/);
 assert.match(ui,/<details class="card growth-ai-prominent"/);
 assert.match(ui,/AI research · /);
 assert.match(ui,/\/5 saved answers/);
 assert.match(ui,/if\(el\.matches\('details'\)\)el\.open=true/);
 assert.match(ui,/if\(aiPanel\)aiPanel\.open=true/);
});
test('Brief only proposes evidence-supported topics, with source links and safe blocked-state messages',()=>{
 assert.match(ui,/x\.recommended&&x\.writable!==false/);
 assert.match(ui,/Do not publish new content based on these observations yet/);
 assert.match(ui,/Verified editorial priorities/);
 assert.match(ui,/Other observations for editorial review/);
 assert.match(ui,/Copy full editor \/ external AI brief/);
 assert.match(ui,/wireCompleteBrief\(s\.gaps,s,d\)/);
 assert.match(ui,/function gapBrief\(g,s,all\)/);
 assert.match(ui,/esc\(e\.url\)/);
 assert.match(ui,/No verified content improvement/);
 assert.match(ui,/No verified content change yet/);
 assert.match(ui,/Keep the page unchanged for now/);
});
test('Result brief labels have EN/NL/ES translations',()=>{
 const keys=['ONE RESEARCH · ONE RESULT','Open the Growth brief','What, where, how and why','AI research'];
 for(const k of keys){const row=ROWS.find(r=>r[0]===k);assert.ok(row,k);assert.equal(row.length,3);assert.ok(row.slice(1).every(Boolean))}
});
