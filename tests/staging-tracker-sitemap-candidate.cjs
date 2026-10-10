'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const input=process.argv[2]||'src/index.js',out=process.argv[3]||'/tmp/contentscale-sitemap-candidate.js';
let source=fs.readFileSync(input,'utf8');
const route="/api/tracker-client/:token/fetch-sitemap";
const marker="app.get('"+route+"', async (req, res) => {";
const start=source.indexOf(marker),end=source.indexOf('\n});',start);
assert(start>=0&&end>start&&end-start<5500,'Unexpected fetch-sitemap handler shape');
let body=source.slice(start,end+4);
assert(!source.includes("async function _trackerFetchAndSaveSitemap("),'Only one canonical sitemap handler allowed');
function replaceOne(a,b){
 assert(body.includes(a)&&body.split(a).length===2,'Cannot patch sitemap token: '+a.slice(0,90));
 body=body.replace(a,b);
}
replaceOne(marker,"async function _trackerFetchAndSaveSitemap(req, res, persist) {");
assert(body.endsWith('\n});'),'Unexpected route close');
body=body.slice(0,-4)+'\n}';
replaceOne("const cr = await pool.query('SELECT domain FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status != $2)', [req.params.token, 'deleted']);",
 "const cr = await pool.query('SELECT domain,status FROM tracker_clients WHERE token=$1 AND (status IS NULL OR status != $2)', [req.params.token, 'deleted']);");
replaceOne("    const sitemapUrl = req.query.url;",
[
"    if (persist && ['disabled','paused','deleted'].includes(cr.rows[0].status))",
"      return res.status(403).json({success:false,error:'Tracker access paused'});",
"    const sitemapUrl = String(persist ? (req.body && req.body.url) : req.query.url || '').trim();",
"    let _requested;",
"    try {_requested=new URL(sitemapUrl);} catch (_) {return res.status(400).json({success:false,error:'Valid sitemap URL required'});}",
"    const _siteDomain=String(cr.rows[0].domain||'').replace(/^https?:\\/\\//i,'').split('/')[0].replace(/^www\\./i,'').toLowerCase();",
"    const _allowedHost=(host)=>{const h=String(host||'').replace(/^www\\./i,'').toLowerCase();return !!_siteDomain && (h===_siteDomain || h.endsWith('.'+_siteDomain));};",
"    if(!['https:','http:'].includes(_requested.protocol)||!_allowedHost(_requested.hostname)||_requested.username||_requested.password)",
"      return res.status(400).json({success:false,error:'Sitemap URL must be on the tracked business domain'});"
].join('\n'));
replaceOne("      const c = new AbortController();",
[
"      let parsed;",
"      try {parsed=new URL(u);} catch (_) {return '';}",
"      if(!['https:','http:'].includes(parsed.protocol)||!_allowedHost(parsed.hostname)||parsed.username||parsed.password) return '';",
"      const c = new AbortController();"
].join('\n'));
replaceOne("const rr = await fetch(u, { headers: { 'User-Agent': 'ContentScale-Bot/1.0' }, signal: c.signal });",
"const rr = await fetch(u, { headers: { 'User-Agent': 'ContentScale-Bot/1.0' }, signal: c.signal, redirect:'error' });");
const saveSQL=[
"WITH event AS (",
"INSERT INTO tracker_workflow_sitemap_events",
"(tracker_client_id,idempotency_key,snapshot_hash,event_payload)",
"SELECT id,$5,$4,jsonb_build_object('source_url',$1,'urls_count',jsonb_array_length($2::jsonb),'source','tracker_sitemap_fetch')",
"FROM tracker_clients WHERE token=$3",
"ON CONFLICT (tracker_client_id,idempotency_key) DO NOTHING",
"RETURNING tracker_client_id",
") UPDATE tracker_clients SET sitemap_url=$1,sitemap_urls=$2",
"WHERE token=$3 AND EXISTS(SELECT 1 FROM event) RETURNING id"
].join(' ');
const sqlString=String.fromCharCode(96)+saveSQL+String.fromCharCode(96);
replaceOne("    if (urls.length) { try { await pool.query('UPDATE tracker_clients SET sitemap_url=$1, sitemap_urls=$2 WHERE token=$3', [sitemapUrl, JSON.stringify(urls), req.params.token]); } catch(e){} }",
[
"    let persisted=false;",
"    if(persist && urls.length){",
"      const _canonicalUrlSet=[...urls].sort();",
"      const snapshot_hash=require('node:crypto').createHash('sha256').update(sitemapUrl+'\\n'+_canonicalUrlSet.join('\\n')).digest('hex');",
"      const idempotency_key='sitemap:v1:'+snapshot_hash;",
"      const _saved=await pool.query("+sqlString+",[sitemapUrl,JSON.stringify(urls),req.params.token,snapshot_hash,idempotency_key]);",
"      persisted=(_saved.rowCount||0)>0;",
"    }"
].join('\n'));
replaceOne("res.json({ success: true, urls, count: urls.length, complete: urls.length < MAX_URLS });",
"res.json({ success: true, urls, count: urls.length, complete: urls.length < MAX_URLS, persisted });");
const wrappers=[
"app.get('"+route+"', async (req, res) => {",
"  return _trackerFetchAndSaveSitemap(req, res, false);",
"});",
"app.post('"+route+"', async (req, res) => {",
"  return _trackerFetchAndSaveSitemap(req, res, true);",
"});"
].join('\n');
source=source.slice(0,start)+body+'\n'+wrappers+source.slice(end+4);
fs.writeFileSync(out,source);
console.log(JSON.stringify({result:'sitemap_get_post_candidate',bytes:Buffer.byteLength(source),database_writes_in_get:false,legacy_get_kept:true}));
