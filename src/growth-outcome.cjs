'use strict';
// One outcome. The editorial decision rests on the reader-task check; the choice list rests on the topic comparison.
// When the task check closes with NO_CHANGE but the topic comparison finds topics on two or more ranking pages that are
// missing or only partly on the page, both are said in one sentence: no change is required, these topics can be chosen.
// Nothing is written or proposed by itself.
// "No content gap" is not "nothing to improve": with Search Console signals still unexplained (a page shown deep in the
// results, few clicks, the meant page not measured, AI not checked), those checks stay open. Owner data only.
function openChecks({decision={},report=null,aiCheck=null,now=Date.now()}={}){
 if(!report)return [];
 const out=[],focus=String(decision.focus_query||'').trim().toLowerCase(),target=decision.target_url||null,source=report.url||null;
 const next=report.growth_decision?.primary_next_action||{},m=String(next.query||'').trim().toLowerCase()===focus?next.metrics:null;
 const dest=report.destination_gsc_evidence||{},destMeasured=dest.status==='EXACT_QUERY_VERIFIED'||!!dest.metrics;
 const pos=m?Math.round(Number(m.average_position)*10)/10:null,imported=m&&m.imported_at?String(m.imported_at).slice(0,10):null;
 if(m&&target&&source&&target!==source)out.push({code:'GOOGLE_SHOWS_ANOTHER_PAGE',
  detail:'Search Console (imported '+imported+') shows '+source+' for “'+decision.focus_query+'”: '+m.impressions+' impressions, '+m.clicks+' clicks, average position '+pos+'. The page meant for this search is '+target+(destMeasured?'.':', which has no Search Console rows of its own.'),
  action:'Check in Search Console that '+target+' is indexed and shown for this term; give '+source+' one descriptive link to '+target+' (see the internal links); keep the title and main heading of '+target+' on the term.'});
 else if(target&&!destMeasured)out.push({code:'TARGET_PAGE_NOT_MEASURED',detail:'There are no Search Console rows for '+target+' and this term.',action:'Import Search Console for '+target+' (28 days).'});
 if(m&&pos>10)out.push({code:'MOSTLY_BEYOND_PAGE_ONE',detail:'The average position is '+pos+': most impressions are beyond page one, so clicks are limited by the position, not by the title or description.',
  action:'Work on what moves the position (the page Google should show, internal links, the completeness of the answer); a new title alone will not bring these clicks.'});
 else if(m&&pos<=10&&Number(m.impressions)>0&&100*Number(m.clicks)/Number(m.impressions)<2)out.push({code:'LOW_CLICK_RATE_ON_PAGE_ONE',detail:'On page one (position '+pos+') only '+m.clicks+' of '+m.impressions+' impressions became clicks.',
  action:'Compare your title and description with the results around you for this term.'});
 if(m&&imported&&new Date(now).getTime()-Date.parse(imported)>28*86400000)out.push({code:'SEARCH_CONSOLE_DATA_OLD',detail:'These Search Console rows were imported on '+imported+'.',action:'Import the last 28 days before deciding.'});
 if(aiCheck&&aiCheck.summary&&!aiCheck.summary.checked)out.push({code:'AI_NOT_CHECKED',detail:'No AI answer for “'+decision.focus_query+'” from the last '+(aiCheck.max_age_days||14)+' days.',action:'Paste AI answers in “AI answers for …” above.'});
 return out;
}
// The word-based task check closed the research (NO_CHANGE) or found no task two pages share (a task-check block after the
// pages were read): the topic comparison and the open performance checks are then the rest of the one outcome.
const TASK_CHECK_BLOCKERS=new Set(['SHARED_COMPETITOR_REQUIREMENTS','TASK_MEANING_NOT_VERIFIED','SUBSTANTIVE_GAP_NOT_VERIFIED']);
function reconcileOutcome({decision={},gapList=null,report=null,aiCheck=null,now=Date.now()}={}){
 const taskBlock=decision.decision==='DATA_BLOCKED'&&TASK_CHECK_BLOCKERS.has(decision.blocker_code);
 if(decision.decision!=='NO_CHANGE'&&!taskBlock)return null;
 const topics=gapList&&gapList.writing_allowed!==false?(gapList.items||[]).filter(x=>x.recommended&&x.writable!==false&&Number(x.priority?.sources)>=2):[];
 const open=openChecks({decision,report,aiCheck,now});
 if(!topics.length&&!open.length)return null;
 const checked=(decision.closure_report?.tasks_checked||[]).length;
 const topicNote=topics.length?'The topic comparison found '+topics.length+' topic'+(topics.length===1?'':'s')+' on two or more ranking pages that '+(topics.length===1?'is':'are')+' missing or only partly on this page: '+
   topics.slice(0,5).map(x=>'“'+x.title+'”').join(', ')+'. Growth writes no proposal by itself; choose them in the list only if they belong on your page.':'';
 return {status:taskBlock?'NO_SHARED_TASK_TOPICS_TO_CONSIDER':open.length?'NO_CONTENT_GAP_PERFORMANCE_OPEN':'NO_REQUIRED_CHANGE_TOPICS_TO_CONSIDER',count:topics.length,
  topics:topics.map(x=>({id:x.id,title:x.title,coverage:x.coverage,sources:Number(x.priority.sources)})),open_checks:open,
  headline:taskBlock?'No reader task shared by two ranking pages'+[open.length?open.length+' performance check'+(open.length===1?'':'s')+' still open':'',topics.length?topics.length+' topic'+(topics.length===1?'':'s')+' to consider':''].filter(Boolean).map((x,i)=>(i?' · ':' — ')+x).join(''):
   open.length?'No content gap found — '+open.length+' performance check'+(open.length===1?'':'s')+' still open'+(topics.length?' · '+topics.length+' topic'+(topics.length===1?'':'s')+' to consider':''):
   'No change required — '+topics.length+' topic'+(topics.length===1?'':'s')+' from the ranking pages to consider',
  distinction:'No content gap (the ranking pages teach nothing this page lacks) is not the same as no improvement needed: the open checks below explain why the page gets few clicks.',
  note:(taskBlock?'The word-based task check found no reader task taught by two of the ranking pages it read. ':
   'The reader-task check found no missing task shared by two or more ranking pages (it checked '+checked+' task'+(checked===1?'':'s')+'). ')+topicNote};
}
module.exports={reconcileOutcome,openChecks};
