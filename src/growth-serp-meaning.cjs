'use strict';
// Does Google use the search term for the same subject as the page? Most result titles naming a word that the page never
// uses at all means the term has another meaning there ("CRAFT framework" = an AI prompting framework in the results,
// a content framework on the page). Growth then compares nothing and never rewrites the page toward the other subject.
// Words come from the results and the page themselves; no topic, industry or brand vocabulary.
const {IGNORED,STEM}=require('./growth-derived-reader-tasks.cjs');
const {sameWord}=require('./growth-word-match.cjs');
const {decodeEntities}=require('./growth-text.cjs');

const MIN_RESULTS=3,MIN_SHARE=0.6;
// A word belongs to the page's SUBJECT when it is in the title or a heading (H1-H3), or is frequent in the body
// (5+ times and 0.5%+ of the words). One passing mention in a long page does not make it the page's subject.
const BODY_MIN_COUNT=5,BODY_MIN_SHARE=0.005;
const plain=html=>decodeEntities(String(html||'').replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ');
const words=t=>[...new Set((String(t||'').toLowerCase().match(/[a-z]{4,}/g)||[]).filter(w=>!IGNORED.has(w)&&!IGNORED.has(STEM(w))))];
const hostLabel=u=>{try{return new URL(u).hostname.replace(/^www\./,'').split('.')[0].toLowerCase()}catch{return ''}};

function checkQueryMeaning({query='',leads=[],destinationHtml=''}={}){
 const usable=(Array.isArray(leads)?leads:[]).filter(l=>l&&l.title);
 if(usable.length<MIN_RESULTS||!String(destinationHtml||'').trim())
  return {status:'NOT_CHECKED',reason:usable.length<MIN_RESULTS?'FEWER_THAN_'+MIN_RESULTS+'_RESULTS':'NO_PAGE_TEXT',results_considered:usable.length};
 const queryWords=words(query);
 // Count each word once per title; word forms are one word (prompt/prompts/prompting); a result's own site name is its brand.
 const clusters=[];
 for(const l of usable){
  const brand=hostLabel(l.url);
  for(const w of words(l.title)){
   if(queryWords.some(q=>sameWord(q,w))||(brand&&brand.includes(w)))continue;
   let c=clusters.find(x=>sameWord(x.word,w));
   if(!c){c={word:w,titles:[]};clusters.push(c)}
   if(!c.titles.includes(l.title))c.titles.push(l.title);
  }
 }
 const dominant=clusters.filter(c=>c.titles.length>=MIN_RESULTS&&c.titles.length/usable.length>=MIN_SHARE);
 const html=String(destinationHtml||'');
 const headText=[...html.matchAll(/<(title|h[1-3])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map(m=>plain(m[2])).join(' ');
 const headWords=words(headText);
 const bodyTokens=(plain(html).toLowerCase().match(/[a-z]{4,}/g)||[]);
 const bodyCount=w=>bodyTokens.filter(t=>sameWord(t,w)).length;
 const onSubject=w=>headWords.some(h=>sameWord(h,w))||(()=>{const n=bodyCount(w);return n>=BODY_MIN_COUNT&&n/Math.max(1,bodyTokens.length)>=BODY_MIN_SHARE})();
 const absent=dominant.filter(c=>!onSubject(c.word));
 return {status:absent.length?'DIFFERENT_MEANING':'SAME_MEANING',query:String(query||''),results_considered:usable.length,
  dominant_words:dominant.map(c=>({word:c.word,in_titles:c.titles.length})),
  absent_on_page:absent.map(c=>({word:c.word,in_titles:c.titles.length,example_titles:c.titles.slice(0,3),mentions_in_page_body:bodyCount(c.word)})),
  basis:'Words in at least '+Math.round(MIN_SHARE*100)+'% of result titles (min. '+MIN_RESULTS+') that are not part of the page\'s subject: not in its title or headings, and not frequent in its text.'};
}

module.exports={checkQueryMeaning};
