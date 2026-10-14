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
// Continue into the existing canonical server. No shell && chaining required.
require('./src/index.js');
