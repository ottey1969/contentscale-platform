'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');

test('Free Growth AI research panel uses readable text and muted colors on its light surface even in dark mode',()=>{
 const css=source.match(/\.growth-ai-prominent\{([^}]+)\}/);
 assert.ok(css,'AI research panel must keep explicit theme-independent colors');
 for(const rule of ['--ink:#172337','--muted:#475569','--accent:#1d4ed8','--bg:#f8fafc','--card:#fff','color:var(--ink)!important']){
  assert.ok(css[1].includes(rule),rule+' should be scoped to the AI research panel');
 }
 assert.match(source,/\.growth-ai-prominent h2,\.growth-ai-prominent h3\{color:#1e40af\}/);
 assert.match(source,/\.growth-ai-prominent\{[^}]*animation:growthAiArrive/);
 assert.match(source,/@media\(prefers-reduced-motion:reduce\)\{\.growth-ai-prominent\{animation:none\}/);
 assert.match(source,/id="freeAiResearch"/);
});
