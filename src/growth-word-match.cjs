'use strict';
// One rule for "is this the same word?" when Growth compares a search term with titles and headings.
// English word forms only (no topic, industry or brand vocabulary):
//  - inflections: track / tracks / tracked / tracking, citation / citations, scale / scaling;
//  - agent nouns: track ↔ tracker(s), roof ↔ roofer(s), edit ↔ editor(s).
// The agent-noun rule needs a base of at least 4 letters, so short words never match by accident.
// An ending is only removed when at least 4 letters remain, so "care" and "car" stay different words.
const stem=w=>{const x=String(w||'').toLowerCase().replace(/[^a-z0-9]/g,''),m=x.match(/^(.{4,}?)(?:ing|ed|es|s|e)$/);return m?m[1]:x};
function sameWord(a,b){
 const x=stem(a),y=stem(b);
 if(!x||!y)return false;
 if(x===y)return true;
 const [short,long]=x.length<=y.length?[x,y]:[y,x];
 return short.length>=4&&long.startsWith(short)&&/^(?:er|or)$/.test(long.slice(short.length));
}
// Terms of `needles` that occur, in any of these word forms, among `words`.
const matchedTerms=(needles,words)=>needles.filter(n=>words.some(w=>sameWord(n,w)));
module.exports={sameWord,matchedTerms,stem};
