'use strict';
const fs=require('node:fs');
const path=process.argv[2]||'src/index.js';
let source=fs.readFileSync(path,'utf8');
const marker="app.post('/api/prospect-quick-scan/:token/tracker-interest'";
const start=source.indexOf(marker);
if(start<0)throw Error('Tracker interest handler not found');
const end=source.indexOf('\n',start);
if(end<0||end-start>2500)throw Error('Tracker interest handler layout changed; refuse unsafe patch');
const old=source.slice(start,end);
if(old.includes('tracker_interested IS DISTINCT FROM TRUE')){
 console.log('Tracker interest route already guarded');process.exit(0);
}
if(!old.includes("tracker_interested=TRUE")||!old.includes("_pqsNotifyOwner")||!old.includes('RETURNING *'))
 throw Error('Tracker interest handler changed; refuse patch');
const before="WHERE token=$1 AND revoked_at IS NULL RETURNING *";
if(!old.includes(before))throw Error('Tracker interest SQL predicate changed');
let next=old.replace(before,"WHERE token=$1 AND revoked_at IS NULL AND tracker_interested IS DISTINCT FROM TRUE RETURNING *");
const missing="if(!q.rows.length)return res.status(404).json({success:false,error:'Prospect not found'});";
const guarded="if(!q.rows.length){const existing=await pool.query('SELECT tracker_interested FROM prospect_quick_scans WHERE token=$1 AND revoked_at IS NULL LIMIT 1',[token]);if(!existing.rows.length)return res.status(404).json({success:false,error:'Prospect not found'});return res.json({success:true,status:'tracker_interested',already_interested:true});}";
if(!next.includes(missing))throw Error('Tracker interest empty-update route changed');
next=next.replace(missing,guarded);
source=source.slice(0,start)+next+source.slice(end);
fs.writeFileSync(path,source);
console.log('Guarded first Tracker interest transition against replay');
