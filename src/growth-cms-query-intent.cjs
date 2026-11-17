'use strict';
// The searched customer question and the editorial focus term may use different
// wording. Match their meaningful roof-repair intent, not byte-for-byte strings.
// A leak-information topic must not silently inherit emergency repair proposals.
function tokens(input){
 const stop=new Set(['a','an','the','and','or','is','are','how','what','why','when','does','do','to','for','my','your','you','in','of','on','at','with','near','me','nj','new','jersey','hours','hour','hrs','hr','24','7','service','services','right','now']);
 return String(input||'').toLowerCase().replace(/\burgent\b/g,'emergency').replace(/\brepairs\b/g,'repair').replace(/\bleaking\b/g,'leak').replace(/[^a-z0-9]+/g,' ')
  .split(/\s+/).filter(x=>x&&!stop.has(x));
}
function sameIntent(stored,chosen){
 const a=[...new Set(tokens(stored))],b=new Set(tokens(chosen));
 if(!a.length||!b.size)return false;
 if(a.join(' ')===[...b].join(' '))return true;
 const common=a.filter(x=>b.has(x));
 return common.length>=2&&common.length/a.length>=0.75&&common.length/b.size>=0.6;
}
module.exports={sameIntent,tokens};
