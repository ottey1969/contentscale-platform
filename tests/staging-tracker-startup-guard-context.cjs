'use strict';
const fs=require('node:fs');
const cases=[
 {file:'src/index.js',line:919,tag:'network_module_import'},
 {file:'src/index.js',line:10725,tag:'network_registration'},
 {file:'src/index.js',line:1818,tag:'database_migration_timer_1'},
 {file:'src/index.js',line:1846,tag:'database_reconnect_timer'},
 {file:'src/index.js',line:1973,tag:'database_migration_timer_2'},
 {file:'src/index.js',line:14958,tag:'cleanup_timer'},
 {file:'src/index.js',line:24066,tag:'followup_mail_timer'}
];
for(const c of cases){
 const lines=fs.readFileSync(c.file,'utf8').split(/\r?\n/);
 const from=Math.max(0,c.line-10),to=Math.min(lines.length,c.line+10);
 const context=lines.slice(from,to).map((s,i)=>({line:from+i+1,code:s.trim().slice(0,280)}));
 console.log(JSON.stringify({audit:'startup_side_effect_narrow_context',tag:c.tag,context}));
}
