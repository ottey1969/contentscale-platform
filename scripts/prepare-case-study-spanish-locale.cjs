'use strict';
// Source-only, surgical Spanish subdomain locale fix for the canonical Tracker scanner.
// No runtime imports, network calls, DB writes or Railway deployment.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'src/index.js');
let src=fs.readFileSync(file,'utf8');
if(Buffer.byteLength(src)<6000000)throw Error('STOP: incomplete canonical source');
const a=src.indexOf('async function runTrackerCheck(');
const b=src.indexOf('  // ── 1. Fetch live HTML',a);
if(a<0||b<a||b-a>12000)throw Error('STOP: Tracker scanner locale block drift');
let chunk=src.slice(a,b);
const anchor="  else if (_domainTld.endsWith('.no')) { _scanLocale = 'no'; _scanLang = 'no'; _bingMkt = 'nb-NO'; }";
const needle="  // Explicit Spanish ContentScale subdomain has .site TLD; never classify it as US/English.";
const patch=needle+"\n  if (_domainTld === 'es.contentscale.site') { _scanLocale = 'es'; _scanLang = 'es'; _bingMkt = 'es-ES'; }";
if(!chunk.includes(needle)){
 if(chunk.split(anchor).length!==2)throw Error('STOP: Tracker locale anchor changed');
 chunk=chunk.replace(anchor,anchor+'\n'+patch);
}
if(!chunk.includes(patch))throw Error('STOP: Spanish host locale patch incomplete');
src=src.slice(0,a)+chunk+src.slice(b);
fs.writeFileSync(file,src);
console.log('Spanish ContentScale subdomain resolves to es/es-ES; no provider or scheduler changes');
