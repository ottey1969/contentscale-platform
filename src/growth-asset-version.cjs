'use strict';
// Version of the Growth browser scripts: a fingerprint of their content, added to every script URL (?v=…). After a
// deploy the browser loads the new script instead of a cached old one (owner report 69: the page still ran an earlier
// script, so the statement review and the AI block did not appear).
const fs=require('fs'),path=require('path'),crypto=require('crypto');
let cached=null;
function assetVersion(){
 if(cached)return cached;
 const dir=path.join(__dirname,'..','public'),h=crypto.createHash('sha256');
 try{for(const f of fs.readdirSync(dir).filter(f=>/^(growth-|tracker-growth-).*\.js$/.test(f)).sort()){h.update(f);h.update(fs.readFileSync(path.join(dir,f)))}}catch{}
 return cached=h.digest('hex').slice(0,12);
}
// Adds ?v= to the Growth script tags of a page.
const versioned=html=>String(html).replace(/(<script\b[^>]*\bsrc="\/(?:growth-|tracker-growth-)[a-z0-9-]+\.js)"/gi,'$1?v='+assetVersion()+'"');
module.exports={assetVersion,versioned};
