'use strict';
const assert=require('node:assert/strict');
const {patch}=require('./repair-canonical-browser.cjs');
const before=[
"   // Puppeteer Browser",
"   let browserInstance = null;",
"   async function getBrowser() {",
"   return puppeteer.launch({args:['--single-process','--no-zygote']});",
"   }",
"   process.on('SIGTERM', async () => {",
"   if (browserInstance) await browserInstance.close();",
"   });",
"if(!res.headersSent)return res.status(500).json({success:false,error:msg,stage:lastStage,build:'CS-2026-09-29-CANONICAL-v380'});"
].join('\n');
const after=patch(before);
assert.ok(after.includes("require('./browser-manager.cjs')"));
assert.ok(after.includes("startup preflight:"));
assert.ok(after.includes("browserDown?503:500"));
assert.ok(!after.includes("'--single-process'"));
assert.equal(patch(after),after,'startup transform must be idempotent');
assert.throws(()=>patch('wrong source'), /anchor/);
console.log('canonical browser patch: idempotence, safe launch, CEO 503 OK');
