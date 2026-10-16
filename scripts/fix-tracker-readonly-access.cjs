'use strict';
// Exact, idempotent change to the existing canonical Tracker GET route.
// GSC remains optional for reading; client disabled/paused states remain enforced.
// Read-only share links already render /track/:token, but the page's initial
// GET /api/tracker-client/:token previously rejected that same token.
const fs=require('node:fs');
const path=require('node:path');
const anchor="app.get('/api/tracker-client/:token', async (req, res) => {";
const next="app.get('/api/tracker-client/:token/briefs/:pageId'";
const old="const cr = await pool.query('SELECT * FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status != $2)', [req.params.token, 'deleted']);";
const changed="const cr = await pool.query('SELECT * FROM tracker_clients WHERE (token=$1 OR readonly_token=$1) AND (status IS NULL OR status != $2)', [req.params.token, 'deleted']);";
function patch(src){
 if(typeof src!=='string'||src.length<5_000_000)throw Error('CANONICAL_TRACKER_SOURCE_REQUIRED');
 const start=src.indexOf(anchor),end=src.indexOf(next,start);
 if(start<0||end<=start)throw Error('CANONICAL_CLIENT_API_ROUTE_MISSING');
 const section=src.slice(start,end);
 if(section.includes(changed)){
  if(section.includes(old))throw Error('AMBIGUOUS_CLIENT_AUTH_ROUTE');
  return {source:src,changed:false};
 }
 if(section.split(old).length!==2)throw Error('CLIENT_READ_AUTH_SIGNATURE_CHANGED');
 // No POST or admin route is modified. Status disabled/paused still blocks reads.
 if(!section.includes("client.status === 'disabled' || cr.rows[0].status === 'paused'") && !section.includes("cr.rows[0].status === 'disabled' || cr.rows[0].status === 'paused'"))
  throw Error('CLIENT_STATUS_GUARD_MISSING');
 if(!src.includes("(token=$1 OR readonly_token=$1) AND (status IS NULL OR status != $2)"))
  throw Error('SHARE_TOKEN_PAGE_ROUTE_MISSING');
 return {source:src.slice(0,start)+section.replace(old,changed)+src.slice(end),changed:true};
}
if(require.main===module){
 const file=path.resolve(__dirname,'../src/index.js');
 const result=patch(fs.readFileSync(file,'utf8'));
 if(process.argv.includes('--write')){
  if(result.changed)fs.writeFileSync(file,result.source);
  console.log(result.changed?'TRACKER_READONLY_API_ACCESS_APPLIED':'TRACKER_READONLY_API_ACCESS_ALREADY_PRESENT');
 } else console.log(result.changed?'DRY_RUN_READONLY_API_PATCH_AVAILABLE':'DRY_RUN_ALREADY_PRESENT');
}
module.exports={patch,anchor,changed};
