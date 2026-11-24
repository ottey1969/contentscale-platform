'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/growth-free/routes.cjs'),'utf8');
test('result navigation stays outside collapsed research panels',()=>{
 assert.match(source,/id="growthResearchNav"/);
 assert.match(source,/href="#google"/);
 assert.match(source,/href="#freeAiResearch"/);
 assert.match(source,/href="#stepResearch"/);
 assert.match(source,/h\+=researchNavHtml\(\);/);
});

test('navigation follows light and dark theme tokens',()=>{assert.match(source,/id="growthResearchNav"[^\n]+background:var\(--card\);color:var\(--ink\)/)});
