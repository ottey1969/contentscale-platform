'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const files=[
 ['src/index.js',"require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);"],
 ['index.js',"require('./src/staging/safety-gate.cjs').assertAppBootEnvironment(process.env);"]
];
let changed=0;
for(const [path,guard] of files){
 let src=fs.readFileSync(path,'utf8');
 if(src.startsWith(guard+'\n'))continue;
 assert(!src.includes(guard),'Guard exists but is not the very first statement: '+path);
 assert(src.length>1000000,'Unexpectedly small canonical entrypoint');
 fs.writeFileSync(path,guard+'\n'+src);
 changed++;
}
assert(changed===0||changed===2,'Staging entrypoint guard must be installed in both paths');
console.log(JSON.stringify({audit:'staging_boot_fence',entrypoints:2,updated:changed,full_app_boot_allowed:false}));
