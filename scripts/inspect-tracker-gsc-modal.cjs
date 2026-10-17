'use strict';
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../src/index.js'),s=fs.readFileSync(file,'utf8');
if(s.length<5_000_000)throw Error('Canonical source missing');
const keys=[
 'REQUIRED BEFORE TRACKER CAN CONTINUE',
 'GSC is mandatory in Tracker',
 'Nothing else in Tracker needs to be configured first',
 'I added access',
 'Check connection',
 'checks the connection automatically and unlocks Tracker',
 'tracker-gsc-access@',
 'gscAccessModal',
 'gscGate',
 'gscRequired',
 'Connect Google Search Console'
];
let found=0;
for(const k of keys){
 let start=0,i=0; 
 while((i=s.toLowerCase().indexOf(k.toLowerCase(),start))>=0&&found<25){
  const line=s.slice(0,i).split('\n').length;
  console.log('\n=== MATCH '+JSON.stringify(k)+' LINE '+line+' OFFSET '+i+' ===');
  console.log(s.slice(Math.max(0,i-1800),Math.min(s.length,i+3200)).replace(/\\n/g,'\n').slice(0,6500));
  found++;start=i+k.length;
  if(start>=s.length)break;
 }
}
console.log('TOTAL MATCHES '+found);
if(found===0)process.exitCode=1;
