'use strict';
// One outcome. The editorial decision rests on the reader-task check; the choice list rests on the topic comparison.
// When the task check closes with NO_CHANGE but the topic comparison finds topics on two or more ranking pages that are
// missing or only partly on the page, both are said in one sentence: no change is required, these topics can be chosen.
// Nothing is written or proposed by itself.
function reconcileOutcome({decision={},gapList=null}={}){
 if(decision.decision!=='NO_CHANGE'||!gapList||gapList.writing_allowed===false)return null;
 const topics=(gapList.items||[]).filter(x=>x.recommended&&x.writable!==false&&Number(x.priority?.sources)>=2);
 if(!topics.length)return null;
 const checked=(decision.closure_report?.tasks_checked||[]).length;
 return {status:'NO_REQUIRED_CHANGE_TOPICS_TO_CONSIDER',count:topics.length,topics:topics.map(x=>({id:x.id,title:x.title,coverage:x.coverage,sources:Number(x.priority.sources)})),
  headline:'No change required — '+topics.length+' topic'+(topics.length===1?'':'s')+' from the ranking pages to consider',
  note:'The reader-task check found no missing task shared by two or more ranking pages (it checked '+checked+' task'+(checked===1?'':'s')+'). '+
   'The topic comparison found '+topics.length+' topic'+(topics.length===1?'':'s')+' on two or more ranking pages that '+(topics.length===1?'is':'are')+' missing or only partly on this page: '+
   topics.slice(0,5).map(x=>'“'+x.title+'”').join(', ')+'. Growth writes no proposal by itself; choose them in the list only if they belong on your page.'};
}
module.exports={reconcileOutcome};
