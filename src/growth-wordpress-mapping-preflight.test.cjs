'use strict';
const assert=require('node:assert/strict');
const {inspectGrowthMappingRollout}=require('./growth-wordpress-mapping-preflight.cjs');
(async()=>{
 const queries=[];
 const db={query:async sql=>{queries.push(sql);return {rows:[{mapping_table_exists:false,tracker_https_pages:90,active_case_studies:22,legacy_mapped_articles:0}]};}};
 let result=await inspectGrowthMappingRollout(db);
 assert.equal(result.schema_ready,false);
 assert.equal(result.next_action,'APPLY_ADDITIVE_SCHEMA_AFTER_REVIEW');
 assert.equal(result.mapping_write_allowed,false);
 assert.equal(result.active_case_studies,22);
 assert.equal(queries.length,1);
 assert.match(queries[0],/to_regclass/);
 assert.doesNotMatch(queries[0],/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+(?:INTO\s+)?\w+/i);
 const ready=await inspectGrowthMappingRollout({query:async()=>({rows:[{mapping_table_exists:true,tracker_https_pages:90,active_case_studies:22,legacy_mapped_articles:0}]})});
 assert.equal(ready.next_action,'VERIFY_REVIEWED_MAPPINGS');
 await assert.rejects(inspectGrowthMappingRollout({query:async()=>({rows:[]})}),/MAPPING_PREFLIGHT_UNAVAILABLE/);
 console.log('PASS: read-only migration preflight');
})().catch(e=>{console.error(e);process.exitCode=1});
