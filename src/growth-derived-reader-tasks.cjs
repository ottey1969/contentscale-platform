'use strict';
// Industry-neutral reader tasks. A "task" is a concept that at least two INDEPENDENT competitor sites each teach
// in a substantive section (it appears in a heading on at least one of them). Concepts are word roots taken from the
// competitor pages themselves, not from a hand-written vocabulary, so the same code serves roofing, law, SaaS, retail...
// Language function words and web boilerplate are ignored; no industry, brand or product word is listed anywhere.
const STEM=w=>String(w||'').toLowerCase().replace(/[^a-z]/g,'').replace(/(?:ing|ed|es|s|e)$/,'');
const root=w=>STEM(w).slice(0,6);
const IGNORED=new Set(('about above after again against also always another because been before being below between both cannot could doing does done during each '+
 'either every find from further have having here however into just keep know like make makes making many more most much must need needs never often only other '+
 'over same should since some such take than that their them then there these they this those through under until upon very want were what when where which '+
 'while will with within without would your yours yourself best guide guides tips ways steps step everything complete ultimate online website websites page pages '+
 'read learn example examples list free today important main good great better right several common simple easy quick first next final conclusion introduction '+
 'overview summary benefit benefits work works working help helps helping start started build building create creating used using time times thing things '+
 'people really actually often usually well make sure also still even much while these those might likely based include includes including '+
 'process processes approach approaches strategy strategies method methods solution solutions result results '+
 // Time words ('a recent storm', 'the latest update') name when, not what; they never define a reader task.
 'recent recently latest anyway lately '+
 // Words that structure a page (question/answer blocks, contact forms) rather than name its subject.
 'question questions answer answers answered frequently asked contact contacts').split(/\s+/));
const wordsOf=(text,skip)=>(String(text||'').toLowerCase().match(/[a-z]{5,}/g)||[]).filter(w=>!IGNORED.has(w)&&!IGNORED.has(STEM(w))).map(root).filter(r=>r.length>=4&&!skip.has(r));
const countMap=(arr)=>{const m=new Map();for(const r of arr)m.set(r,(m.get(r)||0)+1);return m};

function sectionProfile(sec,skip){
 const head=new Set(wordsOf(sec.heading,skip)),counts=countMap(wordsOf(sec.text,skip));
 for(const r of head)counts.set(r,(counts.get(r)||0)+2); // a heading mention outweighs a body mention
 return {counts,head};
}
// competitors: [{host,url,sections:[{heading,text,words}]}]  ->  up to `limit` tasks
// A competitor section that sells the competitor itself (its product, its client story) describes THEIR offer,
// not a task the reader must learn. Detected from the competitor's own name and from case-study / possessive headings.
// otherHostsText: the lower-cased text of the OTHER competitors. A site name that is also an ordinary word the other sites use
// ("dentist-one.example" talking about dentists) is the topic, not a brand.
// Page furniture: contact/quote blocks, FAQ containers and navigation headings frame a page; they are not something the reader
// must learn. Industry-neutral, heading-level only (an individual question heading such as "Is wind damage covered?" stays).
const FURNITURE_HEADING=/^(?:contact(?: us| information)?(?: today| now)?|get in touch|reach us|call us(?: today| now)?|request (?:a |your )?(?:free )?(?:quote|estimate|inspection|consultation|demo)|get (?:a |your )?(?:free )?(?:quote|estimate)|book (?:a|an|your)\b.*|schedule (?:a|an|your)\b.*|faqs?|frequently asked(?: questions)?|common questions|questions(?: and answers)?|q ?& ?a|related (?:posts|articles|services|pages)|our (?:team|services|locations)|service areas?|areas we serve|about us|share this|follow us)\s*[?:.!]*$/i;
const isFurnitureHeading=h=>FURNITURE_HEADING.test(String(h||'').replace(/^[^\p{L}\p{N}]+/u,'').trim());
function isPromotionalSection(sec,host,otherHostsText=''){
 if(isFurnitureHeading(sec.heading))return true;
 const label=String(host||'').replace(/^www\./,'').split('.')[0].toLowerCase().replace(/[^a-z0-9]/g,''),root=label.length>=5?label.slice(0,6):'';
 const heading=String(sec.heading||''),hay=(heading+' '+String(sec.text||'')).toLowerCase();
 if(/\b(?:case stud(?:y|ies)|customer stor(?:y|ies)|success stor(?:y|ies)|testimonials?|client stor(?:y|ies)|why (?:choose|work with) us|our (?:clients|customers|pricing|plans))\b/i.test(heading))return true;
 if(/^[A-Z][\w-]+['’]s\s/.test(heading))return true;
 if(root&&!String(otherHostsText).includes(root)){if(heading.toLowerCase().replace(/[^a-z0-9]/g,'').includes(root))return true;const n=hay.split(root).length-1;if(n>=2)return true}
 return false;
}
function surfaceOf(root,texts){
 const count=new Map();
 for(const t of texts)for(const w of String(t||'').toLowerCase().match(/[a-z]{5,}/g)||[])if(!IGNORED.has(w)&&!IGNORED.has(STEM(w))&&root_(w)===root)count.set(w,(count.get(w)||0)+1);
 return [...count].sort((a,b)=>b[1]-a[1])[0]?.[0]||root;
}
const root_=w=>STEM(w).slice(0,6);
function deriveReaderTasks(args){return deriveReaderTasksDetailed(args).tasks}
// Same derivation, plus a plain account of WHY no task was shared when none was (shown in DATA_BLOCKED reports).
function deriveReaderTasksDetailed({query='',competitors=[],queryRootSet=new Set(),limit=4}={}){
 const skip=new Set(queryRootSet);
 const textOf=c=>c.sections.map(s=>s.heading+' '+s.text).join(' ').toLowerCase();
 const profiles=competitors.map(c=>({c,secs:c.sections.filter(sec=>!isPromotionalSection(sec,c.host,competitors.filter(o=>o!==c).map(textOf).join(' '))).map(sec=>({sec,...sectionProfile(sec,skip)}))}));
 // A concept qualifies in a section when it is in that section's HEADING (two independent sites each giving a heading to the same
 // concept is strong evidence even in short sections) or is mentioned at least three times.
 const qualifies=(s,r)=>s.head.has(r)||(s.counts.get(r)||0)>=3;
 const roots=new Set();for(const p of profiles)for(const s of p.secs)for(const [r] of s.counts)if(qualifies(s,r))roots.add(r);
 const droppedTopical=new Set();
 // A root present in most sections of one article is that article's TOPIC (e.g. 'creation' in a guide about content
 // creation), not a task taught in one section. Such roots are dropped so two sites sharing only the topic word are not
 // reported as agreeing on a task.
 const topical=r=>profiles.some(p=>p.secs.length>=3&&p.secs.filter(s=>s.counts.has(r)).length/p.secs.length>=0.35);
 const cands=[];
 for(const r of roots){
  if(topical(r)){droppedTopical.add(r);continue}
  const per=[];
  for(const p of profiles){
   const best=p.secs.filter(s=>qualifies(s,r)).sort((a,b)=>(Number(b.head.has(r))-Number(a.head.has(r)))||(b.counts.get(r)-a.counts.get(r)))[0];
   if(best)per.push({host:p.c.host,url:p.c.url,partial:p.c.partial,best});
  }
  const hosts=new Set(per.map(x=>x.host));
  if(hosts.size<2||!per.some(x=>x.best.head.has(r)))continue;
  // A host whose support is a heading only (fewer than three mentions) must be corroborated: another concept must appear in
  // the best sections of two hosts. Otherwise two sites merely share a word in a heading ("…content creation", "…creation tools").
  if(per.some(x=>(x.best.counts.get(r)||0)<3)){
   const seen=new Map();for(const x of per)for(const [r2] of x.best.counts){if(r2===r||topical(r2))continue;seen.set(r2,(seen.get(r2)||new Set()).add(x.host))}
   if(![...seen.values()].some(h=>h.size>=2))continue;
  }
  // Coherence: other concepts that the sections on different sites share. Without any, the root is likely a stray word.
  const shared=new Map();
  for(const x of per)for(const [r2,n] of x.best.counts){if(r2===r||n<2)continue;shared.set(r2,(shared.get(r2)||[]).concat(x.host))}
  const co=[...shared].filter(([,h])=>new Set(h).size>=2).map(([k,h])=>[k,h.length]).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]);
  // Without shared co-concepts (short excerpts) the core concept alone must carry the task, so it is held to a stricter mention count below.
  const bag=new Map(),bagHosts=new Map();
  for(const x of per)for(const [r2,n] of x.best.counts){if(r2===r||n<2||topical(r2))continue;
   bag.set(r2,(bag.get(r2)||0)+n);(bagHosts.get(r2)||bagHosts.set(r2,new Set()).get(r2)).add(x.host)}
  // A supporting concept must be taught on two sites or be clearly frequent; a word seen twice in one heading is noise.
  const concepts=[r,...[...bag].filter(([k,n])=>n>=3||bagHosts.get(k).size>=2).sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0])];
  const score=hosts.size*10+per.filter(x=>x.best.head.has(r)).length*5+per.reduce((n,x)=>n+x.best.counts.get(r),0);
  cands.push({root:r,per,co,concepts,score});
 }
 cands.sort((a,b)=>b.score-a.score||a.root.localeCompare(b.root));
 const used=new Set(),tasks=[];
 for(const c of cands){
  const keys=c.per.map(x=>x.host+'|'+x.best.sec.heading);
  if(keys.some(k=>used.has(k)))continue; // one task per competitor section
  keys.forEach(k=>used.add(k));
  const lead=c.per.find(x=>x.best.head.has(c.root))||c.per[0];
  const texts=c.per.map(x=>x.best.sec.heading+' '+x.best.sec.text);
  tasks.push({code:'task_'+c.root,key:c.root,co_terms:c.co,concepts:c.concepts,core_words:[surfaceOf(c.root,texts),...c.concepts.slice(1,4).map(r=>surfaceOf(r,texts))],
   label:'Competitors teach “'+lead.best.sec.heading.slice(0,90)+'”',
   support:c.per.map(x=>({url:x.url,host:x.host,heading:x.best.sec.heading,excerpt:x.best.sec.text.slice(0,420),concepts:[c.root,...c.co].slice(0,4),partial:!!x.partial}))});
  if(tasks.length>=limit)break;
 }

 const single=new Map();
 for(const p of profiles)for(const sec of p.secs)for(const [r] of sec.counts)if(qualifies(sec,r)&&!topical(r)){const m=single.get(r)||{hosts:new Set(),n:0};m.hosts.add(p.c.host);m.n+=sec.counts.get(r);single.set(r,m)}
 const diagnostics={hosts:profiles.map(p=>({host:p.c.host,sections_read:p.c.sections.length,sections_used:p.secs.length,sections_excluded_as_promotional:p.c.sections.length-p.secs.length,
   headings:p.secs.slice(0,8).map(x=>x.sec.heading.slice(0,60))})),
  concepts_on_one_site_only:[...single].filter(([,m])=>m.hosts.size===1).sort((a,b)=>b[1].n-a[1].n).slice(0,8).map(([r,m])=>({concept:r,site:[...m.hosts][0]})),
  topic_wide_words_ignored:[...droppedTopical].slice(0,8)};
 return {tasks,diagnostics};
}
// How much of a task a block of destination text covers, and whether free text (a draft) is on that task.
function taskHitsInText(task,text,skip=new Set()){
 const rs=wordsOf(text,skip),key=rs.filter(r=>r===task.key).length,co=new Set(rs.filter(r=>task.co_terms.includes(r))).size;
 return {key,co};
}
// A draft teaches the task when its core concept appears and it covers enough of the concepts the competitors' sections
// use for that task. Matching on a bag of concepts (not one fixed co-term) keeps a good section from failing on one word.
function draftTeachesTask(task,text,skip=new Set()){
 const rs=wordsOf(text,skip),set=new Set(rs),key=rs.filter(r=>r===task.key).length;
 const concepts=Array.isArray(task.concepts)&&task.concepts.length?task.concepts:[task.key,...(task.co_terms||[])];
 const hit=concepts.filter(c=>set.has(c)).length,need=concepts.length>=3?3:concepts.length;
 // With fewer than three supporting concepts the core concept itself must carry the section (at least twice).
 return {ok:key>=1&&(concepts.length>=3?hit>=3:key>=2),key_mentions:key,co_terms_hit:Math.max(0,hit-(key?1:0)),concepts_hit:hit,concepts_needed:need};
}
function destinationStatus(task,blocksList,skip=new Set()){
 const per=blocksList.map(b=>({b,...taskHitsInText(task,b.text,skip)})).filter(x=>x.key>=1);
 const lone=task.co_terms.length===0;
 const strong=per.filter(x=>lone?x.key>=2:x.co>=1);
 const status=strong.length>=2||strong.some(x=>x.key>=2)?'COVERED':per.length?'PARTIAL':'NOT_OBSERVED';
 return {status,passages:(strong.length?strong:per).slice(0,2).map(x=>({heading:x.b.heading||null,text:x.b.text.slice(0,300),concepts:[task.key,...task.co_terms].slice(0,4)}))};
}
module.exports={isPromotionalSection,isFurnitureHeading,deriveReaderTasks,deriveReaderTasksDetailed,draftTeachesTask,destinationStatus,taskHitsInText,wordsOf,root,STEM,IGNORED};
