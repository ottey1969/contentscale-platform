'use strict';
const fs=require('node:fs');const s=fs.readFileSync('src/index.js','utf8');
if(s.length<5000000)throw Error('canonical source missing');
// No client tokens are printed; only source code and static UI hooks.
const terms=['const _CLIENT_TRACKER_HTML','_CLIENT_TRACKER_HTML =','_tourMaybeAutoStart','_tourStart','showWelcome','gscSetupBanner','<header','<nav','<body','Growth Cockpit','/growth','language','langToggle','langSelect','selectLanguage','\'cs_lang\'','cs_language','location.search','</body>'];
for(const q of terms){let from=0,hits=0;while((from=s.indexOf(q,from))>=0&&hits<7){const before=s.slice(Math.max(0,from-250),from).replace(/\n/g,' ');const after=s.slice(from,Math.min(s.length,from+750)).replace(/\n/g,' ');console.log('SOURCE '+JSON.stringify(q)+' #'+(++hits)+' LINE '+(s.slice(0,from).split('\n').length)+' : '+before+'[MATCH]'+after);from+=q.length;}}

const start=s.indexOf('const _CLIENT_TRACKER_HTML = `');
if(start<0)throw Error('canonical template missing');
const view=s.slice(start,start+290000);
for(const term of ['<body>','<div class="cs-header','cs-toolbar','toolbar','startTour(','id="tour','lang="en"','<script>','cs-container','__TOKEN__','Tracker','Growth']){
 let i=0,seen=0;
 while((i=view.indexOf(term,i))>=0&&seen++<9){console.log('TEMPLATE '+JSON.stringify(term)+' OFFSET '+i+' CONTEXT '+view.slice(Math.max(0,i-230),i+700).replace(/\n/g,' ').slice(0,950));i+=term.length;}
}
