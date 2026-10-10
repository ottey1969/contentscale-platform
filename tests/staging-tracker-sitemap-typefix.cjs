'use strict';
// Exact, repeatable SQL type patch. Generates candidate without starting app or contacting DB.
const fs=require('node:fs'),assert=require('node:assert/strict');
const input=process.argv[2]||'src/index.js';
const output=process.argv[3]||'/tmp/contentscale-sitemap-types-candidate.js';
let s=fs.readFileSync(input,'utf8');
const old="jsonb_build_object('source_url',$1,'urls_count'";
const fixed="jsonb_build_object('source_url',$1::text,'urls_count'";
const exactCount=(str)=>s.split(str).length-1;
assert(s.includes('async function _trackerFetchAndSaveSitemap('),'Expected shared canonical sitemap handler');
assert(s.includes('INSERT INTO tracker_workflow_sitemap_events'),'Expected canonical snapshot event table');
if(exactCount(old)===1 && exactCount(fixed)===0) s=s.replace(old,fixed);
else assert(exactCount(old)===0 && exactCount(fixed)===1,'Sitemap event SQL changed unexpectedly');
assert(exactCount(fixed)===1);
fs.writeFileSync(output,s);
console.log(JSON.stringify({test:'canonical_sitemap_parameter_type',result:'candidate_generated',requires_explicit_text_cast:true,output,source_bytes:Buffer.byteLength(s)}));
