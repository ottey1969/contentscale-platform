'use strict';
const fs=require('node:fs');
const src=fs.readFileSync('src/index.js','utf8');
for(const [method,path] of [
 ['POST','/api/tracker-client/:token/sitemap-links'],
 ['GET','/api/tracker-client/:token/fetch-sitemap'],
 ['GET','/api/tracker-client/:token'],
 ['PATCH','/api/tracker-client/:token/pages/:pageId/manual-done']
]){
 const quote=String.fromCharCode(39);
 const head='app.'+method.toLowerCase()+'('+quote+path+quote+', async (req, res) => {';
 const from=src.indexOf(head),end=src.indexOf('\n});',from);
 if(from<0||end<from||end-from>36000)throw Error('Cannot audit route '+path);
 const body=src.slice(from,end+4),firstLine=src.slice(0,from).split('\n').length;
 const rows=body.split('\n'),limit=path.includes('sitemap')?200:60;
 const select=rows.map((v,i)=>({line:firstLine+i,src:v.trim().slice(0,500)}))
   .filter(x=>/pool\.query|INSERT|UPDATE|DELETE|ON CONFLICT|sitemap|status|snapshot|hash|crypto|tracker_workflow/i.test(x.src))
   .slice(0,limit);
 console.log(JSON.stringify({audit:'sitemap_canonical_source',method,path,bytes:body.length,line:firstLine,selected:select}));
}
