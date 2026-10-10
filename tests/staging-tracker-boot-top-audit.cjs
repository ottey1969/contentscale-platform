'use strict';
const fs=require('node:fs');
for(const file of ['src/index.js','index.js','src/network/register-network.js']){
 const lines=fs.readFileSync(file,'utf8').split(/\r?\n/).slice(0,34);
 console.log(JSON.stringify({audit:'bootstrap_first_lines',file,lines:lines.map((s,i)=>({line:i+1,text:s.slice(0,230)}))}));
}
