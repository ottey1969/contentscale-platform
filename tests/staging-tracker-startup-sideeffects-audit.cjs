'use strict';
// Source inventory only: never imports/executes the full ContentScale or Network app.
// Keyword occurrence is NOT proof of eager startup execution; flagged for human review.
const fs=require('node:fs');
const patterns=[
 ['http_listen',/\b(?:app|server)\.listen\s*\(/g],
 ['periodic_timer',/\bsetInterval\s*\(/g],
 ['delayed_timer',/\bsetTimeout\s*\(/g],
 ['cron_registration',/\b(?:cron|scheduler)\.schedule\s*\(/g],
 ['network_register',/\bregisterNetwork\s*\(/g],
 ['database_init',/\b(?:initDatabase|initializeDatabase|ensureTables|ensureDatabaseSchema)\s*\(/g],
 ['network_module_import',/require\s*\(\s*['"](?:\.\/|\.\.\/)?network\/register-network(?:\.js)?['"]\s*\)/g],
 ['provider_sends',/\b(?:sendMail|sendEmail|sendTransactionalEmail|sendBrevoEmail|sendgrid\.send)\s*\(/g]
];
const files=['src/index.js','index.js','src/network/register-network.js'];
for(const file of files){
 const code=fs.readFileSync(file,'utf8');
 const lines=code.split(/\r?\n/);
 for(const [signal,rx] of patterns){
  const occurrences=[];
  rx.lastIndex=0;
  let m;
  while((m=rx.exec(code))!==null){
   const line=code.slice(0,m.index).split('\n').length;
   if(occurrences.length<16){
     const text=lines[line-1]||'';
     occurrences.push({line,expression:m[0],excerpt:text.trim().slice(0,160)});
   }
  }
  if(occurrences.length)console.log(JSON.stringify({audit:'full_app_startup_inventory',
   file,signal,occurrences_recorded:occurrences.length,examples:occurrences}));
 }
 const tail=lines.slice(-42).map((text,i)=>({line:lines.length-41+i,text:text.trim().slice(0,185)}))
  .filter(x=>/listen|start|scheduler|init|ensure|server|cron|migrate|process\.on/i.test(x.text));
 console.log(JSON.stringify({audit:'full_app_boot_tail',file,last_lines:tail.slice(-20)}));
}
