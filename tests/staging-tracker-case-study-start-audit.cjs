'use strict';
const fs=require('node:fs');const s=fs.readFileSync('src/index.js','utf8');
const symbols=[
 {tag:'legacy_PRT_attach',start:"async function _ensurePerfectRoofingCaseStudy(",end:"async function _caseStudyEventForPage("},
 {tag:'explicit_case_study_start',start:"app.post('/api/tracker-client/:token/pages/:pageId/case-study/start'",end:"app.post('/api/tracker-client/:token/pages/:pageId/baseline-gsc'"}
];
for(const item of symbols){
 const at=s.indexOf(item.start),end=s.indexOf(item.end,at+item.start.length);
 if(at<0||end<at||end-at>25000)throw Error('Unexpected case study source boundaries '+item.tag);
 const startLine=s.slice(0,at).split('\n').length;
 const lines=s.slice(at,end).split('\n');
 console.log('BEGIN '+item.tag+' @'+startLine+' lines '+lines.length);
 const keep=/(SELECT |INSERT |UPDATE |DELETE |CASE |return |if\(|if\s*\(|status|baseline|revision|token|canonical|snapshot|CREATE TABLE|_ensureCaseStudySchema|_caseStudyOpenFreshStartCycle|verified|next_check|email|ai_|GSC|lock)/i;
 for(let i=0;i<lines.length;i++)if(keep.test(lines[i]))console.log((startLine+i)+': '+lines[i].slice(0,350));
 console.log('END '+item.tag);
}
