// Canonical production entry. Source repairs belong to the Docker build, not server startup.
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'src','index.js'),'utf8');
if(!source.includes("const _canonicalBrowserManager = require('./browser-manager.cjs')")||
   !source.includes('function isCeoDomainInput(value)'))
 throw Error('CANONICAL_BUILD_ARTIFACT_REQUIRED: run node scripts/prepare-canonical-production.cjs at build time');
// The acquisition admin page must exist in the canonical Express app regardless
// of optional Network feature registration. API endpoints retain their own auth.
const express=require('express');
const originalInit=express.application.init;
express.application.init=function(...args){
  originalInit.apply(this,args);
  // Minimal runtime fingerprint to correlate GitHub and Railway builds.
  // Do not expose credentials, environment dumps, or server paths.
  this.get('/api/version',(req,res)=>{
    res.set('Cache-Control','no-store');
    res.json({service:'contentscale-platform',commit:process.env.RAILWAY_GIT_COMMIT_SHA||process.env.GIT_SHA||null,
      branch:process.env.RAILWAY_GIT_BRANCH||null});
  });
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
