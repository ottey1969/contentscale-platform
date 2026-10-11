'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const a=s.indexOf("app.post('/api/tracker-client/:token/check/:pageId', async (req, res) => {");
const b=s.indexOf('\n// Exact client-side scan status',a);
assert(a>0&&b>a&&b-a<22000,'Manual route changed: review required');
const route=s.slice(a,b);
test('manual scan endpoint cannot mutate schema directly or through monitoring helper',()=>{
 assert.doesNotMatch(route,/\b(?:ALTER|CREATE|DROP|TRUNCATE)\s+TABLE\b/i);
 assert.doesNotMatch(route,/_ensureMonitoringGateSchema\s*\(/);
 assert.match(route,/Manual scan route uses migrated canonical schema/);
});
test('manual scan keeps client ownership, baseline, publication and checkpoint guards',()=>{
 assert.match(route,/SELECT id,claims_facts_updated_at FROM tracker_clients/);
 assert.match(route,/SELECT \* FROM tracker_pages WHERE id=/);
 assert.match(route,/case_study_fresh_cycle_initialized/);
 assert.match(route,/current_revision_published_at/);
 assert.match(route,/monitoring_waiting_input/);
 assert.match(route,/await runTrackerCheck\(/);
});
