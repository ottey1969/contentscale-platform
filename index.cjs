// Canonical ContentScale production entry. Keep startup inside one Node process.
const fs=require('node:fs');
const path=require('node:path');
const entry=path.join(__dirname,'src','index.js');
const source=fs.readFileSync(entry,'utf8');
if (/Yes — I\\*'m interested in the 20-Page Audit/.test(source)) {
  const {patch}=require('./scripts/fix-audit20-inline-label.cjs');
  fs.writeFileSync(entry,patch(source));
  console.log('[startup] corrected Audit 20 inline CTA text');
}
// Validate CEO website input at the canonical request boundary before any scan starts.
// Keep the repair idempotent across Railway restarts and fail boot if anchors drift.
{
  const source=fs.readFileSync(entry,'utf8');
  const normalize=require('./scripts/fix-ceo-domain-validation.cjs').patch;
  const validateForms=require('./scripts/fix-ceo-form-validation.cjs').patch;
  const corrected=validateForms(normalize(source));
  if(corrected!==source){
    fs.writeFileSync(entry,corrected);
    console.log('[startup] corrected CEO public/private domain intake (HTTP 400 on invalid domain)');
  }
}
// One canonical Chromium lifecycle for all existing scanner routes.
{
  const source=fs.readFileSync(entry,'utf8');
  const corrected=require('./scripts/repair-canonical-browser.cjs').patch(source);
  if(corrected!==source){
    fs.writeFileSync(entry,corrected);
    console.log('[startup] installed shared Chromium lifecycle and CEO 503 recovery');
  }
}
// The acquisition admin page must exist in the canonical Express app regardless
// of optional Network feature registration. API endpoints retain their own auth.
const express=require('express');
const originalInit=express.application.init;
express.application.init=function(...args){
  originalInit.apply(this,args);
  this.get('/network/acquisition',(req,res)=>{
    res.set('Cache-Control','no-store');
    return res.sendFile(path.join(__dirname,'public','network-acquisition.html'));
  });
};
// Preserve actionable file/line diagnostics when optional modules fail registration.
const Module=require('node:module');
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
  try{return originalLoad.apply(this,arguments);}
  catch(err){
    if(err instanceof SyntaxError){
      console.error('[syntax-load-diagnostic] request='+request+' parent='+String(parent?.filename||'unknown')+' stack='+String(err.stack||err));
    }
    throw err;
  }
};
// Continue into the existing canonical server. No shell && chaining required.
require('./src/index.js');
