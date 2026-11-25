'use strict';
// Serve only exact supported hosts. Translated pages are independent HTML documents.
const path=require('node:path');
const fs=require('node:fs');
const publicDir=path.join(__dirname,'..','public');
function hideLanguageDiscovery(html){
 return html.replace(/<link\b[^>]*\bhreflang="[^"]+"[^>]*>/gi,'').replace(/<nav\b[^>]*aria-label="Language"[^>]*>[\s\S]*?<\/nav>/gi,'');
}
const hosts={en:'app.contentscale.site',nl:'nl.app.contentscale.site',es:'es.app.contentscale.site'};
function homeLanguage(host){const h=String(host||'').toLowerCase().replace(/:\d+$/,'');return Object.keys(hosts).find(k=>hosts[k]===h)||null}
function homeRoute(req,res,next){
 const lang=homeLanguage(req.get('host'));
 if(!lang||!['GET','HEAD'].includes(req.method))return next();
 if(lang==='en'){
  if(process.env.LOCALIZED_HOME_ENABLED==='true'||!['/','/index.html'].includes(req.path))return next();
  fs.readFile(path.join(publicDir,'index.html'),'utf8',(err,html)=>{
   if(err)return next(err);
   res.set('Cache-Control','no-cache');
   res.set('Content-Language','en');
   return res.type('html').send(hideLanguageDiscovery(html));
  });
  return;
 }
 if(req.path!=='/')return next();
 if(process.env.LOCALIZED_HOME_ENABLED!=='true')return next();
 res.set('Cache-Control','no-cache');
 res.set('Content-Language',lang);
 return res.sendFile(path.join(__dirname,'..','public',lang,'index.html'));
}
module.exports={hosts,homeLanguage,homeRoute};
