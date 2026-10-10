'use strict';
const fs=require('node:fs');
const s=fs.readFileSync('src/index.js','utf8');
const markers=[
 "app.get('/api/tracker-client/:token/pages/:pageId/case-study'",
 "app.get('/case-study-report/:reportToken'",
 'async function _caseStudy',
 'async function _trackerCaseStudy',
 'async function _ensurePerfectRoofingCaseStudy'
];
for(const marker of markers){
 const at=s.indexOf(marker);
 if(at<0){console.log(JSON.stringify({audit:'v1_case_study_source',marker,found:false}));continue;}
 const end=s.indexOf('\napp.',at+marker.length);
 const content=s.slice(at,Math.min(end>at?end:s.length,at+13000));
 const loc=s.slice(0,at).split('\n').length;
 const lines=content.split('\n').map((text,i)=>({line:loc+i,text}));
 const relevant=lines.filter(x=>/baseline|evidence|legacy|json|case_stud|SELECT|UPDATE|INSERT|async|await|status\(|return|res\./i.test(x.text));
 console.log(JSON.stringify({audit:'v1_case_study_source',marker,found:true,start_line:loc,
  source_lines:lines.length,relevant:relevant.slice(0,85).map(x=>({line:x.line,text:x.text.slice(0,1150)}))}));
}
