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
 const placement=p=>p&&p.section_heading?{mode:p.mode==='EXTEND_SECTION'?'EXTEND_SECTION':'ADD_AFTER_SECTION',section_heading:clip(p.section_heading,200)}:null;
 const label=code=>((d.improvement_plan&&d.improvement_plan.tasks)||[]).find(t=>t.code===code)?.label||null;
 const sections=[{h2:clip(d.draft_heading,200),text:clip(d.proposed_text,8000),placement:placement(d.placement),task:label((d.draft_validation||[])[0]?.task)},
  ...(d.additional_sections||[]).map(a=>({h2:clip(a.heading,200),text:clip(a.text,8000),placement:placement(a.placement),task:label(a.task)}))]
  .filter(s=>s.h2&&s.text);
 if(!sections.length)return null;
 const cr=d.claim_review||{};
 const list=x=>(Array.isArray(x)?x:[]).slice(0,20).map(v=>clip(v,400));
 return {target_url:d.target_url,focus_query:clip(d.focus_query,200)||null,decision:d.decision,sections,
  review:{needs_fact_check:list(cr.needs_fact_check),needs_owner_confirmation:list(cr.needs_owner_confirmation),
   needs_safety_review:list(cr.needs_safety_review),requirements:list(cr.requirements),
   competitor_sources:(d.evidence||[]).filter(e=>e.type==='COMPETITOR').slice(0,4).map(e=>({url:e.source_url,heading:clip(e.heading,200)}))},
  evidence_label:d.evidence_status?.label||null,intent_note:d.intent_scope?.note||null};
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
async function proposalById(pool,{clientId,id}){
 try{return (await pool.query('SELECT id,target_page_id,target_url,focus_query,sections FROM tracker_growth_proposals WHERE tracker_client_id=$1 AND id=$2',[clientId,Number(id)])).rows[0]||null}
 catch(e){if(e.code==='42P01')return null;throw e}
}

module.exports={proposalFromDecision,saveProposal,latestProposal,proposalById,ensureTable};
