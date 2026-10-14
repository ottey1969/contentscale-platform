'use strict';
// Repair exactly the malformed Audit 20 CTA label before the canonical server boots.
// The same label may appear in more than one HTML route template; fix every occurrence.
const fs=require('node:fs');
const BROKEN=/Yes — I\\*'m interested in the 20-Page Audit/g;
const SAFE='Yes — Interested in the 20-Page Audit';
function patch(source){
 if(typeof source!=='string'||!source.includes('audit20-interest-btn'))throw Error('Audit 20 interest CTA not found');
 const matches=[...source.matchAll(BROKEN)];
 if(matches.length<1)throw Error('Broken Audit 20 interest CTA text not found (source changed)');
 const changed=source.replace(BROKEN,SAFE);
 if(BROKEN.test(changed))throw Error('Audit 20 malformed CTA remains after patch');
 return changed;
}
if(require.main===module){
 const file=process.argv[2]||'src/index.js';
 const original=fs.readFileSync(file,'utf8');
 const updated=patch(original);
 fs.writeFileSync(file,updated);
 console.log('Audit 20 escaped apostrophe labels replaced: '+(original.match(BROKEN)||[]).length);
}
module.exports={patch};
