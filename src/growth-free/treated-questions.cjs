'use strict';
const questionKey=q=>String(q||'').normalize('NFKC').toLowerCase().trim().replace(/[?!.]+$/,'').trim().replace(/\s+/g,' ');
function filterTreated(result,treated){
 const keys=new Set((treated||[]).map(questionKey).filter(Boolean));
 const questions=(result.questions||[]).filter(q=>!keys.has(questionKey(q.text)));
 const best=questions.find(q=>q.text===result.best_question)||questions.find(q=>q.priority==='OBSERVED_GOOGLE')||questions[0];
 return {...result,questions,best_question:best?.text||null,excluded_treated:(result.questions||[]).length-questions.length};
}
module.exports={questionKey,filterTreated};
