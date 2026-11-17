'use strict';
// The searched customer question and the editorial focus term may use different
// wording. Match their meaningful roof-repair intent, not byte-for-byte strings.
// A leak-information topic must not silently inherit emergency repair proposals.
function tokens(input){
 const stop=new Set(['a','an','the','and','or','is','are','how','what','why','when','does','do','to','for','my','your','you','in','of','on','at','with','near','me','nj','new','jersey','hours','hour','hrs','hr','24','7','service','services','right','now']);
 return String(input||'').toLowerCase().replace(/\burgent\b/g,'emergency').replace(/\brepairs\b/g,'repair').replace(/\bleaking\b/g,'leak').replace(/[^a-z0-9]+/g,' ')
  .split(/\s+/).filter(x=>x&&!stop.has(x));
}
// The seed "emergency roof repair" names a service. A question about urgency
// is an informational decision task, not the same customer intent. Never reuse
// or approve a stored commercial content concept for that informational answer.
function intentClass(input){
 const q=String(input||'').toLowerCase().trim();
 if(/^(?:how urgent\b|how serious\b|how quickly should\b|when (?:is|should)\b|what (?:is|are)\b|why\b|how (?:do|does|to)\b|should i\b|is it\b)/.test(q))return 'INFORMATIONAL';
 if(/^(?:who (?:offers|provides|does|repairs)\b|where (?:can i|to|do i)\b)/.test(q)||/\b(?:contractors?|companies|providers?|near me|24[- /]?7|24[- ]?hours?|emergency roof repair)\b/.test(q))return 'SERVICE';
 return 'UNSPECIFIED';
}
function sameIntent(stored,chosen){
 const storedClass=intentClass(stored),chosenClass=intentClass(chosen);
 // A service query with no interrogative form is not proof of equivalence to
 // an informational customer question; require a separate reviewed concept.
 if(storedClass!=='UNSPECIFIED'&&chosenClass!=='UNSPECIFIED'&&storedClass!==chosenClass)return false;
 const a=[...new Set(tokens(stored))],b=new Set(tokens(chosen));
 if(!a.length||!b.size)return false;
 if(a.join(' ')===[...b].join(' '))return true;
 const common=a.filter(x=>b.has(x));
 return common.length>=2&&common.length/a.length>=0.75&&common.length/b.size>=0.6;
}
module.exports={sameIntent,tokens,intentClass};
