'use strict';
// The checked Growth proposal (text, H2, placement, fact-check list) is stored when the owner research produces it, so the
// CMS handoff uses exactly that proposal instead of generating or retyping another text. Additive table; nothing else changes.
const clip=(x,n)=>String(x==null?'':x).slice(0,n);

let ensured=null;
function ensureTable(pool){
 if(!ensured)ensured=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_proposals(
   id BIGSERIAL PRIMARY KEY,
   tracker_client_id BIGINT NOT NULL,
   research_page_id BIGINT,
   target_page_id BIGINT NOT NULL,
   target_url TEXT NOT NULL,
   focus_query TEXT,
   decision TEXT NOT NULL,
   sections JSONB NOT NULL,
   review JSONB NOT NULL DEFAULT '{}'::jsonb,
   evidence_label TEXT,
   intent_note TEXT,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(e=>{ensured=null;throw e});
 return ensured;
}

// Only a checked edit of an existing page becomes a handoff proposal (copy_ready means every section passed the checks).
function proposalFromDecision(d){
 if(!d||d.decision!=='IMPROVE_EXISTING'||d.copy_ready!==true||!d.proposed_text||!d.draft_heading)return null;
 const plan=(d.improvement_plan&&d.improvement_plan.tasks)||[];
 const label=code=>plan.find(t=>t.code===code)?.label||null;
 // The plan's placement carries the chain order (after_task_code) when several sections share one anchor.
 const placement=(p,code)=>{const q=plan.find(t=>t.code===code)?.placement||p;
  return p&&p.section_heading?{mode:p.mode==='EXTEND_SECTION'?'EXTEND_SECTION':'ADD_AFTER_SECTION',section_heading:clip(p.section_heading,200),
   ...(q&&q.after_task_code&&q.section_heading===p.section_heading?{after_task_code:String(q.after_task_code).slice(0,40)}:{})}:null};
 const mainCode=(d.draft_validation||[])[0]?.task;
 const unordered=[{h2:clip(d.draft_heading,200),text:clip(d.proposed_text,8000),placement:placement(d.placement,mainCode),task:label(mainCode),task_code:mainCode||null},
  ...(d.additional_sections||[]).map(a=>({h2:clip(a.heading,200),text:clip(a.text,8000),placement:placement(a.placement,a.task),task:label(a.task),task_code:a.task||null}))]
  .filter(s=>s.h2&&s.text);
 // Page order: a section that must follow another proposed section comes right after it.
 const sections=[];
 const place=s=>{if(sections.includes(s))return;const before=s.placement&&s.placement.after_task_code&&unordered.find(x=>x.task_code===s.placement.after_task_code&&x!==s);
  if(before&&!sections.includes(before))place(before);sections.push(s)};
 unordered.forEach(place);
 if(!sections.length)return null;
 const cr=d.claim_review||{};
 const list=x=>(Array.isArray(x)?x:[]).slice(0,20).map(v=>clip(v,400));
 return {target_url:d.target_url,focus_query:clip(d.focus_query,200)||null,decision:d.decision,sections,
  review:{needs_fact_check:list(cr.needs_fact_check),needs_owner_confirmation:list(cr.needs_owner_confirmation),
   needs_safety_review:list(cr.needs_safety_review),requirements:list(cr.requirements),
   competitor_sources:(d.evidence||[]).filter(e=>e.type==='COMPETITOR').slice(0,4).map(e=>({url:e.source_url,heading:clip(e.heading,200)}))},
  evidence_label:d.evidence_status?.label||null,intent_note:d.intent_scope?.note||null};
}

// A concept written for the owner's selection: stored like a checked proposal so the CMS handoff uses it unchanged,
// but labelled as a selection concept and carrying the flagged sentences the editor must rewrite or remove.
async function saveSelectionProposal(pool,{clientId,researchPageId=null,targetPageId,targetUrl,focusQuery,written}){
 const sections=(written?.sections||[]).map(s=>({h2:clip(s.h2,200),text:clip((s.paragraphs||[]).join('\n\n'),8000),
  placement:s.placement&&s.placement.section_heading?{mode:s.placement.mode==='EXTEND_SECTION'?'EXTEND_SECTION':'ADD_AFTER_SECTION',section_heading:clip(s.placement.section_heading,200)}:null,
  task:clip(s.item_title,200)||null,item_id:s.item_id||null})).filter(s=>s.h2&&s.text);
 if(!sections.length||!Number.isSafeInteger(Number(targetPageId)))return null;
 const all=k=>[...new Set((written.sections||[]).flatMap(s=>s[k]||[]))].slice(0,20).map(v=>clip(v,400));
 const review={needs_fact_check:all('needs_fact_check'),needs_owner_confirmation:all('needs_owner_confirmation'),needs_safety_review:all('needs_safety_review'),
  flagged:(written.sections||[]).flatMap(s=>(s.flags||[]).map(f=>({h2:clip(s.h2,200),sentence:f.sentence?clip(f.sentence,400):null,code:clip(f.code,60),reason:clip(f.reason,300)}))).slice(0,30),
  // What each section rests on (question, competitor sources, warning when only headings were behind it).
  basis:(written.sections||[]).filter(s=>s.basis).map(s=>({h2:clip(s.h2,200),answers:clip(s.basis.answers,200),evidence_level:clip(s.basis.evidence_level,40),
   sources:(s.basis.competitor_evidence||[]).slice(0,8).map(e=>clip(e.site+(e.heading?': “'+e.heading+'”':''),220)),warning:s.basis.warning?clip(s.basis.warning,300):null})).slice(0,10),
  // The versioned evidence record of this run (growth-selected-writing evidenceDossier).
  dossier:written.dossier&&typeof written.dossier==='object'?written.dossier:null,
  // Whether current AI answers for the search term were there when this was written, or the editor chose to go on without.
  ai_check:written.ai_check&&typeof written.ai_check==='object'?{choice:clip(written.ai_check.choice,40),answers_counted:Number(written.ai_check.answers_counted)||0}:null,
  requirements:['Rewrite or remove every flagged sentence.','Fact-check every statement against your own knowledge and sources before publishing.','Owner approval is required; nothing is published automatically.'],
  competitor_sources:[]};
 await ensureTable(pool);
 return (await pool.query(`INSERT INTO tracker_growth_proposals
   (tracker_client_id,research_page_id,target_page_id,target_url,focus_query,decision,sections,review,evidence_label,intent_note)
   VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10) RETURNING id,created_at`,
  [clientId,researchPageId,Number(targetPageId),targetUrl,clip(focusQuery,200)||null,'IMPROVE_EXISTING',JSON.stringify(sections),JSON.stringify(review),
   review.flagged.length?'SELECTION_CONCEPT_WITH_FLAGGED_SENTENCES':'SELECTION_CONCEPT_FOR_REVIEW',null])).rows[0];
}
async function saveProposal(pool,{clientId,researchPageId=null,targetPageId,decision}){
 const p=proposalFromDecision(decision);
 if(!p||!Number.isSafeInteger(Number(targetPageId))||Number(targetPageId)<1)return null;
 await ensureTable(pool);
 return (await pool.query(`INSERT INTO tracker_growth_proposals
   (tracker_client_id,research_page_id,target_page_id,target_url,focus_query,decision,sections,review,evidence_label,intent_note)
   VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10) RETURNING id,created_at`,
  [clientId,researchPageId,Number(targetPageId),p.target_url,p.focus_query,p.decision,JSON.stringify(p.sections),JSON.stringify(p.review),p.evidence_label,p.intent_note])).rows[0];
}

// Latest proposal for this page and URL (a proposal for an older URL of the page is never reused).
async function latestProposal(pool,{clientId,targetPageId,targetUrl,maxDays=30}){
 try{
  return (await pool.query(`SELECT id,target_page_id,target_url,focus_query,decision,sections,review,evidence_label,intent_note,created_at
    FROM tracker_growth_proposals WHERE tracker_client_id=$1 AND target_page_id=$2 AND target_url=$3
    AND created_at>NOW()-make_interval(days=>$4) ORDER BY id DESC LIMIT 1`,[clientId,Number(targetPageId),targetUrl,maxDays])).rows[0]||null;
 }catch(e){if(e.code==='42P01')return null;throw e}
}
// Every proposal for this page and URL in the window, newest first: the main research proposal and each concept the owner
// had written for a chosen improvement are separate rows, and the CMS handoff lets the editor combine them.
async function recentProposals(pool,{clientId,targetPageId,targetUrl,maxDays=30,limit=10}){
 try{
  return (await pool.query(`SELECT id,target_page_id,target_url,focus_query,decision,sections,review,evidence_label,intent_note,created_at
    FROM tracker_growth_proposals WHERE tracker_client_id=$1 AND target_page_id=$2 AND target_url=$3
    AND created_at>NOW()-make_interval(days=>$4) ORDER BY id DESC LIMIT $5`,[clientId,Number(targetPageId),targetUrl,maxDays,limit])).rows;
 }catch(e){if(e.code==='42P01')return [];throw e}
}
// The newest proposal plus the other stored ones, each reduced to the sections that a newer one does not already contain.
// "Already contains" is judged by the task (task code or selected item), the task label, and the heading's core words:
// every research run stores a new proposal whose AI wording of the same heading differs (owner 2026-11-01: nine
// "other concepts" that were the same four tasks). Older research proposals are marked as earlier versions; concepts
// the owner had written for a selection stay concepts.
const CORE_STOP=new Set(['how','what','why','when','with','your','that','this','from','into','helps','help','using','content','scale','scaling','scaled','production','produce','strategy','across','every','existing','parts','part','for','the','and','to','of','a','an','in','while','keeping']);
function coreWords(h){return new Set(String(h||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w.length>=4&&!CORE_STOP.has(w)).map(w=>w.slice(0,6)))}
function combineProposals(rows){
 const norm=h=>String(h||'').toLowerCase().replace(/\s+/g,' ').trim();
 const taskKeys=x=>[x.task_code&&'t:'+String(x.task_code).replace(/^q-/,''),x.item_id&&'t:'+String(x.item_id).replace(/^q-/,''),x.task&&'l:'+norm(x.task),'h:'+norm(x.h2)].filter(Boolean);
 const seenKeys=new Set(),seenCores=[],out=[];
 const isSeen=x=>taskKeys(x).some(k=>seenKeys.has(k))||(()=>{const c=coreWords(x.h2);return c.size>0&&seenCores.some(o=>{let n=0;c.forEach(w=>{if(o.has(w))n++});return n/Math.min(c.size,o.size)>=0.5})})();
 const remember=x=>{taskKeys(x).forEach(k=>seenKeys.add(k));seenCores.push(coreWords(x.h2))};
 for(const r of rows||[]){
  const all=(r.sections||[]).filter(x=>x&&x.h2),sections=out.length?all.filter(x=>!isSeen(x)):all;
  all.forEach(remember);
  if(sections.length||!out.length)out.push({...r,sections,kind:!out.length?'LATEST':/^SELECTION_CONCEPT/.test(String(r.evidence_label||''))?'SELECTION_CONCEPT':'EARLIER_RESEARCH_VERSION'});
 }
 return {latest:out[0]||null,earlier:out.slice(1)};
}
async function proposalById(pool,{clientId,id}){
 try{return (await pool.query('SELECT id,target_page_id,target_url,focus_query,sections FROM tracker_growth_proposals WHERE tracker_client_id=$1 AND id=$2',[clientId,Number(id)])).rows[0]||null}
 catch(e){if(e.code==='42P01')return null;throw e}
}

module.exports={proposalFromDecision,saveProposal,saveSelectionProposal,latestProposal,recentProposals,combineProposals,proposalById,ensureTable};
