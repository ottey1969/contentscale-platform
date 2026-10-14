'use strict';
// The canonical server injects this Audit 20 button into /lead-crawler.
// In browser-rendered JS the escaped apostrophe splits a quoted HTML literal.
// The narrow runtime patch preserves the canonical routes and state machine.
const fs=require('node:fs');
function patch(source){
 const marker='audit20-interest-btn';
 const at=source.indexOf(marker);
 if(at<0)throw Error('Audit 20 interest button not found: refusing to patch');
 const start=source.indexOf('Yes — I',at);
 const endText='m interested in the 20-Page Audit';
 const end=start<0?-1:source.indexOf(endText,start);
 if(start<0||end<0||start-at>500||end-start>80)throw Error('Audit 20 label shape changed: refusing to patch');
 const original=source.slice(start,end+endText.length);
 if(!original.includes("'"))throw Error('Expected broken apostrophe missing');
 return source.slice(0,start)+'Yes — Interested in the 20-Page Audit'+source.slice(end+endText.length);
}
if(require.main===module){
 const path=process.argv[2]||'src/index.js';
 const src=fs.readFileSync(path,'utf8');
 const changed=patch(src);
 fs.writeFileSync(path,changed);
 console.log('Fixed Audit 20 invitation button string before server startup');
}
module.exports={patch};
