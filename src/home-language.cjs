'use strict';
// Serve only exact supported hosts. Translated pages are independent HTML documents.
const path=require('node:path');
const hosts={en:'app.contentscale.site',nl:'nl.app.contentscale.site',es:'es.app.contentscale.site'};
function homeLanguage(host){const h=String(host||'').toLowerCase().split(':')[0];return Object.keys(hosts).find(k=>hosts[k]===h)||null}
function homeRoute(req,res,next){
 const lang=homeLanguage(req.get('host'));
 if(!lang||!['GET','HEAD'].includes(req.method)||req.path!=='/')return next();
 if(lang==='en')return next();
 if(process.env.LOCALIZED_HOME_ENABLED!=='true')return next();
 return res.sendFile(path.join(__dirname,'..','public',lang,'index.html'));
}
module.exports={hosts,homeLanguage,homeRoute};
