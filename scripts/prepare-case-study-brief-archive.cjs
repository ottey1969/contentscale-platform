'use strict';
// Archive prior Brief and ranking state in the existing Case Study event log
// before the canonical start-cycle method clears page-local workflow fields.
// Text transform only: never imports app, connects to DB or sends mail.
const fs=require('node:fs'),path=require('node:path');
const file=process.argv[2]||path.resolve(__dirname,'../src/index.js');
let s=fs.readFileSync(file,'utf8');
const a=s.indexOf('async function _caseStudyOpenFreshStartCycle(');
const b=s.indexOf('\n// v229: case-study URL pre-flight',a);
if(a<0||b<=a||b-a>11000||Buffer.byteLength(s)<6000000)
 throw Error('STOP: canonical start-cycle boundaries or source size changed');
let chunk=s.slice(a,b);
const marker='  await pool.query(`UPDATE tracker_pages SET';
const eventType='case_study_prior_brief_archived';
const injection=[
 '  // Archive complete pre-existing Brief state BEFORE the destructive new-cycle reset.',
 '  // Existing canonical Case Study event storage is the history source; no new table.',
 '  const _priorBriefPresent=page.brief_content!==null&&page.brief_content!==undefined;',
 '  const _priorRankingPresent=page.ranking_brief!==null&&page.ranking_brief!==undefined;',
 '  if(_priorBriefPresent||_priorRankingPresent){',
 '    const _oldBriefArchive=Object.assign({},historicalState,{',
 '      previous_brief_content:page.brief_content==null?null:page.brief_content,',
 '      previous_ranking_brief:page.ranking_brief==null?null:page.ranking_brief,',
 '      previous_brief_status:page.brief_status||null,',
 '      previous_brief_started_at:page.brief_started_at||null,',
 '      previous_brief_done_at:page.brief_done_at||null,',
 '      captured_before_reset_at:new Date().toISOString()',
 '    });',
 '    // If archival fails, fail closed: never clear the only remaining Brief copy.',
 '    await pool.query(`INSERT INTO tracker_case_study_events',
 '      (case_study_id,tracker_page_id,event_type,source,event_data,content_hash)',
 '      SELECT $1,$2,\'case_study_prior_brief_archived\',\'tracker_case_study_start\',$3::jsonb,NULL',
 '      WHERE NOT EXISTS(SELECT 1 FROM tracker_case_study_events',
 '        WHERE case_study_id=$1 AND event_type=\'case_study_prior_brief_archived\')`,',
 '      [cs.id,page.id,JSON.stringify(_oldBriefArchive)]);',
 '  }',
 ''
].join('\n');
if(!chunk.includes(eventType)){
 if(chunk.split(marker).length!==2)throw Error('STOP: first new-cycle UPDATE anchor changed');
 chunk=chunk.replace(marker,injection+marker);
}
if(!chunk.includes("case_study_prior_brief_archived")||
   chunk.indexOf("case_study_prior_brief_archived")>chunk.indexOf(marker))
 throw Error('STOP: archive was not secured ahead of reset');
s=s.slice(0,a)+chunk+s.slice(b);
fs.writeFileSync(file,s);
console.log('Preserves complete old Brief + ranking JSON in canonical events ahead of case cycle reset');
