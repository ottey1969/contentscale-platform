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
 'process processes approach approaches strategy strategies method methods solution solutions result results').split(/\s+/));
const wordsOf=(text,skip)=>(String(text||'').toLowerCase().match(/[a-z]{5,}/g)||[]).filter(w=>!IGNORED.has(w)&&!IGNORED.has(STEM(w))).map(root).filter(r=>r.length>=4&&!skip.has(r));
const countMap=(arr)=>{const m=new Map();for(const r of arr)m.set(r,(m.get(r)||0)+1);return m};

function sectionProfile(sec,skip){
 const head=new Set(wordsOf(sec.heading,skip)),counts=countMap(wordsOf(sec.text,skip));
 for(const r of head)counts.set(r,(counts.get(r)||0)+2); // a heading mention outweighs a body mention
 return {counts,head};
}
// competitors: [{host,url,sections:[{heading,text,words}]}]  ->  up to `limit` tasks
function deriveReaderTasks({query='',competitors=[],queryRootSet=new Set(),limit=4}={}){
 const skip=new Set(queryRootSet);
 const profiles=competitors.map(c=>({c,secs:c.sections.map(sec=>({sec,...sectionProfile(sec,skip)}))}));
 const roots=new Set();for(const p of profiles)for(const s of p.secs)for(const [r,n] of s.counts)if(n>=3)roots.add(r);
 // A root present in most sections of one article is that article's TOPIC (e.g. 'creation' in a guide about content
 // creation), not a task taught in one section. Such roots are dropped so two sites sharing only the topic word are not
 // reported as agreeing on a task.
 const topical=r=>profiles.some(p=>p.secs.length>=3&&p.secs.filter(s=>s.counts.has(r)).length/p.secs.length>=0.6);
 const cands=[];
 for(const r of roots){
  if(topical(r))continue;
  const per=[];
  for(const p of profiles){
   const best=p.secs.filter(s=>(s.counts.get(r)||0)>=3).sort((a,b)=>b.counts.get(r)-a.counts.get(r))[0];
   if(best)per.push({host:p.c.host,url:p.c.url,partial:p.c.partial,best});
  }
  const hosts=new Set(per.map(x=>x.host));
  if(hosts.size<2||!per.some(x=>x.best.head.has(r)))continue;
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
  tasks.push({code:'task_'+c.root,key:c.root,co_terms:c.co,concepts:c.concepts,
   label:'Competitors teach “'+lead.best.sec.heading.slice(0,90)+'”',
   support:c.per.map(x=>({url:x.url,host:x.host,heading:x.best.sec.heading,excerpt:x.best.sec.text.slice(0,420),concepts:[c.root,...c.co].slice(0,4),partial:!!x.partial}))});
  if(tasks.length>=limit)break;
 }
 return tasks;
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
module.exports={deriveReaderTasks,draftTeachesTask,destinationStatus,taskHitsInText,wordsOf,root,STEM,IGNORED};
