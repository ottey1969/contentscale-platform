'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Static only. Never require/import any application module.
const routeSpecs = [
  ['GET', '/api/tracker-client/:token'],
  ['PATCH', '/api/tracker-client/:token/pages/manual-done-all'],
  ['PATCH', '/api/tracker-client/:token/pages/:pageId/manual-done'],
  ['PATCH', '/api/tracker-client/:token/pages/:pageId/done'],
  ['POST', '/api/tracker-client/register']
];
const registered = /\bapp\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"\x60])([^'"\x60\r\n]{1,260})\2/g;
for (const name of ['src/index.js','index.js']) {
  const data=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  const routes=[...data.matchAll(registered)].map(m=>({method:m[1].toUpperCase(),route:m[3],start:m.index})).sort((a,b)=>a.start-b.start);
  for (const [method,route] of routeSpecs) {
    const i=routes.findIndex(m=>m.method===method && m.route===route);
    if(i<0){console.log(JSON.stringify({audit:'canonical_handler_safety',file:name,method,route,found:false}));continue}
    const start=routes[i].start,end=Math.min(data.length,routes[i+1]?.start??data.length);
    const fragment=data.slice(start,end);
    const sourceLines=fragment.split(/\r?\n/);
    const lines=sourceLines.map((line,n)=>({relative_line:n+1,text:line.trim()}))
      .filter(({text})=>/manual_done|manual_done_at|UPDATE\s+tracker_pages|SELECT\s+id\s+FROM\s+tracker_clients|SELECT\s+id\s+FROM\s+tracker_pages|ALTER\s+TABLE|CREATE\s+TABLE|idempotency_key|tracker_workflow|on conflict|rowCount|req\.params|status\s*\(/i.test(text))
      .slice(0,55)
      .map(({relative_line,text})=>({relative_line,text:text.replace(/\s+/g,' ').slice(0,230)}));
    console.log(JSON.stringify({
      audit:'canonical_handler_safety',file:name,method,route,found:true,
      start_line:data.slice(0,start).split('\n').length,
      inspected_chars:fragment.length,
      patterns:{
        ddl_in_route:/\b(?:ALTER|CREATE|DROP)\s+TABLE\b/i.test(fragment),
        uses_idempotency_key:/\bidempotency_key\b/i.test(fragment),
        owner_page_query:/SELECT\s+id\s+FROM\s+tracker_pages[\s\S]{0,150}tracker_client_id/i.test(fragment),
        uses_now_timestamp:/\bNOW\s*\(\s*\)/i.test(fragment),
        update_tracker_pages:/\bUPDATE\s+tracker_pages\b/i.test(fragment)
      },
      indicative_lines:lines
    }));
  }
}
