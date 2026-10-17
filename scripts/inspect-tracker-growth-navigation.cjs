'use strict';
const fs=require('node:fs');const s=fs.readFileSync('src/index.js','utf8');
if(s.length<5000000)throw Error('canonical source missing');
const terms=['const _CLIENT_TRACKER_HTML','_CLIENT_TRACKER_HTML =','_tourMaybeAutoStart','_tourStart','showWelcome','gscSetupBanner','<header','<nav','<body','Growth Cockpit','/growth','language','langToggle','langSelect','selectLanguage','\'cs_lang\'','cs_language','location.search','</body>'];
for(const q of terms){let from=0,hits=0;while((from=s.indexOf(q,from))>=0&&hits<7){const before=s.slice(Math.max(0,from-250),from).replace(/\n/g,' ');const after=s.slice(from,Math.min(s.length,from+750)).replace(/\n/g,' ');console.log('SOURCE '+JSON.stringify(q)+' #'+(++hits)+' LINE '+(s.slice(0,from).split('\n').length)+' : '+before+'[MATCH]'+after);from+=q.length;}}
