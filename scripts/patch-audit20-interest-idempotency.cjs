'use strict';
const fs=require('node:fs');
const path=process.argv[2]||'src/index.js';
let src=fs.readFileSync(path,'utf8');
const start=src.indexOf("app.post('/api/prospect-quick-scan/:token/audit20-interest'");
const end=src.indexOf("app.post('/api/prospect-quick-scan/admin/:token/two-page-overview'",start);
if(start<0||end<start||end-start>7000)throw Error('Audit20 interest route boundaries changed');
const original=src.slice(start,end);
if(original.includes('audit20_interested IS DISTINCT FROM TRUE')){console.log('Audit20 interest already guarded');process.exit(0)}
const old="await pool.query(`UPDATE prospect_quick_scans\n      SET audit20_interested=TRUE,audit20_interested_at=COALESCE(audit20_interested_at,NOW()),\n          audit20_interest_note=$1,follow_up_status='audit20_interested',updated_at=NOW()\n      WHERE token=$2`,[note,token]);";
const guarded="const interestWrite=await pool.query(`UPDATE prospect_quick_scans\n      SET audit20_interested=TRUE,audit20_interested_at=COALESCE(audit20_interested_at,NOW()),\n          audit20_interest_note=$1,follow_up_status='audit20_interested',updated_at=NOW()\n      WHERE token=$2 AND revoked_at IS NULL AND audit20_interested IS DISTINCT FROM TRUE RETURNING token`,[note,token]);\n    if(!interestWrite.rows.length){\n      const previous=await pool.query('SELECT audit20_interested FROM prospect_quick_scans WHERE token=$1 AND revoked_at IS NULL LIMIT 1',[token]);\n      if(!previous.rows.length)return res.status(404).json({success:false,error:'Quick Scan not found'});\n      return res.json({success:true,status:'audit20_interested',already_interested:true,email_sent:false,message:'Interest already recorded. The 20-Page Audit has not been started automatically.'});\n    }";
if(original.split(old).length!==2)throw Error('Audit20 update statement no longer unique; refuse patch');
src=src.slice(0,start)+original.replace(old,guarded)+src.slice(end);
fs.writeFileSync(path,src);
console.log('Guarded Audit20 interest against duplicate notifications and concurrent replay');
