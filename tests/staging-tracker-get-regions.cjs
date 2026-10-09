'use strict';
const fs=require('node:fs');
const s=fs.readFileSync('src/index.js','utf8');
const begin=s.indexOf("app.get('/api/tracker-client/:token', async (req, res) => {");
const end=s.indexOf('\n});',begin);
if(begin<0||end<begin||end-begin>50000)throw Error('Unexpected canonical GET');
const offset=s.slice(0,begin).split('\n').length;
const lines=s.slice(begin,end+4).split('\n');
for(const [start,endLine] of [[3073,3085],[3163,3190],[3209,3245],[3240,3297],[3400,3436]]){
 const l=lines.slice(start-offset,endLine-offset+1).map((line,n)=>(start+n)+': '+line);
 console.log('SOURCE REGION '+start+'-'+endLine);
 console.log(l.join('\n'));
 console.log('END SOURCE REGION');
}
