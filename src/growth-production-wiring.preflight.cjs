'use strict';
// Static production-wiring preflight. This never starts or mutates the running app.
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'index.js'),'utf8');
const failures=[];
if(!/registerGrowthLiveRoutes/.test(source))failures.push('CANONICAL_GROWTH_ROUTER_NOT_REFERENCED');
const growthRoutes=fs.readFileSync(require('node:path').join(__dirname,'growth-live-routes.cjs'),'utf8');
if(!(/resolveGrowthGscToken/.test(source)||(/growthServiceAccountToken/.test(growthRoutes)&&/GSC_SERVICE_ACCOUNT_JSON/.test(growthRoutes))))
 failures.push('GSC_AUTHORIZED_TOKEN_RESOLVER_NOT_WIRED');
if(failures.length){console.error('Growth production wiring still missing:',failures.join(', '));process.exitCode=1;}
else{console.log('PASS: canonical server references Growth live routes and existing authorized GSC service-account fallback');}
