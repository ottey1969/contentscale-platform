'use strict';
// Enquiries (contact requests) per published change: the owner enters the numbers from their own contact form, CRM or
// e-mail/phone log for the same two 28-day periods as the Search Console comparison. Growth never estimates, models or
// fills in a conversion number; without both periods there is no lead change. Additive table, one row per period.
const SOURCES={own_contact_form:'your contact form',own_crm:'your CRM',own_email_or_phone_log:'your e-mail or phone log'};

let ensured=null;
function ensureTable(pool){
 if(!ensured)ensured=pool.query(`CREATE TABLE IF NOT EXISTS tracker_growth_lead_windows(
   tracker_client_id BIGINT NOT NULL,
   publication_id BIGINT NOT NULL,
   period TEXT NOT NULL CHECK (period IN ('before','after')),
   start_date DATE NOT NULL,
   end_date DATE NOT NULL,
   leads INTEGER NOT NULL CHECK (leads>=0),
   source TEXT NOT NULL,
   recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY (tracker_client_id,publication_id,period))`).catch(e=>{ensured=null;throw e});
 return ensured;
}
function validateLeadInput(body,windows,now=new Date()){
 const period=String(body.period||'');
 if(!['before','after'].includes(period))return 'Select before or after';
 if(body.start_date!==windows[period].start||body.end_date!==windows[period].end)return 'The period must match the exact 28-day comparison window';
 if(Date.parse(body.end_date+'T23:59:59Z')>now.getTime())return 'The period has not finished';
 if(!Number.isSafeInteger(Number(body.leads))||Number(body.leads)<0||String(body.leads).trim()==='')return 'Enquiries must be a whole number of 0 or more';
 if(!SOURCES[body.source])return 'Say where the number comes from (your form, CRM or e-mail/phone log)';
 return null;
}
async function saveLeadWindow(pool,{clientId,publicationId,period,startDate,endDate,leads,source}){
 await ensureTable(pool);
 await pool.query(`INSERT INTO tracker_growth_lead_windows(tracker_client_id,publication_id,period,start_date,end_date,leads,source)
  VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tracker_client_id,publication_id,period) DO UPDATE SET
  start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,leads=EXCLUDED.leads,source=EXCLUDED.source,recorded_at=NOW()`,
  [clientId,publicationId,period,startDate,endDate,Number(leads),source]);
}
async function loadLeadWindows(pool,{clientId}){
 try{return (await pool.query('SELECT publication_id,period,start_date::text,end_date::text,leads,source FROM tracker_growth_lead_windows WHERE tracker_client_id=$1',[clientId])).rows}
 catch(e){if(e.code==='42P01')return [];throw e}
}
// Adds the enquiry comparison to a measurement record when both exact periods were entered; otherwise says what is missing.
function withLeads(record,rows){
 const w=record.required_windows;if(!w)return {...record,leads:{status:'WAITING_FOR_PERIODS',measured_lead_change:null}};
 const match=p=>(rows||[]).find(r=>String(r.publication_id)===String(record.publication_id)&&r.period===p&&r.start_date===w[p].start&&r.end_date===w[p].end);
 const before=match('before'),after=match('after');
 if(!before||!after)return {...record,leads:{status:'ENTER_YOUR_OWN_ENQUIRY_NUMBERS',measured_lead_change:null,before:before?Number(before.leads):null,after:after?Number(after.leads):null,
  note:'Enter the contact requests for this page from your own form, CRM or e-mail/phone log for both periods. Growth does not estimate them.'}};
 return {...record,leads:{status:'COMPARABLE_OWNER_PROVIDED_ENQUIRIES',before:Number(before.leads),after:Number(after.leads),measured_lead_change:Number(after.leads)-Number(before.leads),
  sources:[...new Set([before.source,after.source])].map(s=>SOURCES[s]||s),
  note:'Enquiries as you recorded them for the same two 28-day periods. A change is an observation, not proof that this edit caused it.'}};
}
module.exports={validateLeadInput,saveLeadWindow,loadLeadWindows,withLeads,ensureTable,SOURCES};
