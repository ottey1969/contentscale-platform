'use strict';
const assert=require('node:assert/strict');
// Preserve the canonical server and all routes; replace only shared browser
// launcher and CEO error contract during the normal canonical startup.
function patch(source){
 const oldStart="   // Puppeteer Browser\n   let browserInstance = null;\n   async function getBrowser() {";
 const finish="   process.on('SIGTERM', async () => {";
 const installed="const _canonicalBrowserManager = require('./browser-manager.cjs')";
 let s=source;
 if(!s.includes(installed)){
  const start=s.indexOf(oldStart), end=s.indexOf(finish,start+oldStart.length);
  assert.ok(start>=0 && end>start && s.indexOf(oldStart,start+1)<0,'single canonical Puppeteer getBrowser anchor required');
  const replacement=[
    "   // One shared browser manager across CEO, QuickScan, Audit and Tracker.",
    "   let browserInstance = null;",
    "   const _canonicalBrowserManager = require('./browser-manager.cjs').createBrowserManager({",
    "     puppeteer, fs: require('node:fs'), env: process.env, logger: console,",
    "     getCurrent: () => browserInstance,",
    "     setCurrent: browser => { browserInstance = browser; }",
    "   });",
    "   async function getBrowser() { return _canonicalBrowserManager.getBrowser(); }",
    "   // Check browser installation on boot without crawling, DB writes or email.",
    "   setTimeout(() => {",
    "     getBrowser().then(browser => console.log('[browser] startup preflight:',browser?'READY':'FAILED'))",
    "       .catch(err => console.error('[browser] startup preflight failed:',String(err&&err.message||err)));",
    "   },2000);",
    ""
  ].join('\n');
  s=s.slice(0,start)+replacement+s.slice(end);
 }
 const old="if(!res.headersSent)return res.status(500).json({success:false,error:msg,stage:lastStage,build:'CS-2026-09-29-CANONICAL-v380'});";
 const newer="if(!res.headersSent){const browserDown=/Browser unavailable|Failed to launch the browser process/i.test(msg);return res.status(browserDown?503:500).json({success:false,code:browserDown?'BROWSER_UNAVAILABLE':'CEO_REPORT_FAILED',error:browserDown?'Website scanner temporarily unavailable':msg,stage:lastStage,build:'CS-2026-09-29-CANONICAL-v380'});}";
 if(!s.includes(newer)){
  assert.equal(s.split(old).length,2,'one canonical CEO error response anchor required');
  s=s.replace(old,newer);
 }
 return s;
}
module.exports={patch};
