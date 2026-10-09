'use strict';
const fs=require('node:fs');
const s=fs.readFileSync('src/index.js','utf8');
const a=s.indexOf("app.get('/api/tracker-client/:token', async (req, res) => {");
const b=s.indexOf('\n});',a);
if(a<0||b<a||b-a>50000)throw Error('GET route unexpected');
const p=s.slice(a,b+4), base=s.slice(0,a).split('\n').length;
const lines=p.split('\n');
console.log(JSON.stringify({audit:'get_helper_calls',routes:1,
 calls:lines.map((v,i)=>({line:base+i,code:v.trim().slice(0,250)})).filter(o=>/\bawait\s+_|\bpool\.query\s*\(|\bSELECT\b|\bUPDATE\b|\bINSERT\b|\bALTER\b|\bCREATE\b/.test(o.code)).slice(0,135)}));
