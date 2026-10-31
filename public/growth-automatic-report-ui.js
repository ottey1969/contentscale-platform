(function(){
 'use strict';
 var main=document.querySelector('main[data-page-id]'),container=document.getElementById('growthAutomaticReport');
 if(!main||!container)return;
 var id=main.getAttribute('data-page-id'),token=location.pathname.split('/')[2];
 // A run chosen by the Opportunity Finder carries its market and search term; the page's own setting is not changed.
 var param=function(n){var m=String(location.search||'').match(new RegExp('[?&]'+n+'=([^&]*)'));try{return m?decodeURIComponent(m[1].replace(/\+/g,' ')):''}catch(e){return ''}};
 var runMarket=param('market'),runQuery=param('query');
 var runParams=(runMarket?'&market='+encodeURIComponent(runMarket):'')+(runQuery?'&query='+encodeURIComponent(runQuery):'');
 var endpoint='/api/tracker-client/'+encodeURIComponent(token)+'/growth/auto-research?page_id='+encodeURIComponent(id)+runParams;
 var last=null;
 var trackerGrowthStyle=document.createElement('style');trackerGrowthStyle.textContent="\n/* Tracker Growth guided actions */\n.cs-growth-guidance{padding:12px 14px;border-left:4px solid #2563eb;background:rgba(37,99,235,.06);border-radius:6px}\n.cs-growth-action-list{display:grid;gap:12px;margin:12px 0 18px}.cs-growth-action{border:1px solid #cbd5e1;border-radius:12px;padding:16px;transition:border-color .2s ease,box-shadow .2s ease,opacity .2s ease}.cs-growth-action-head{display:flex;gap:12px;align-items:flex-start}.cs-growth-state{font-size:22px;font-weight:700;line-height:1.2}.cs-growth-action-copy{flex:1}.cs-growth-action-copy p{margin:4px 0 12px}.cs-growth-action-button{border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;transition:transform .15s ease,background .2s ease}.cs-growth-action-button:focus-visible{outline:3px solid #1d4ed8;outline-offset:3px}.cs-growth-action-button:active{transform:scale(.98)}.cs-growth-current{border-color:#2563eb;box-shadow:0 0 0 1px #2563eb}.cs-growth-current .cs-growth-state{color:#2563eb}.cs-growth-current .cs-growth-action-button{background:#2563eb;color:white}.cs-growth-done{border-color:#15803d}.cs-growth-done .cs-growth-state{color:#15803d}.cs-growth-done .cs-growth-action-button{background:#15803d;color:white}.cs-growth-future{opacity:.73}.cs-growth-future .cs-growth-action-button{background:#e2e8f0;color:#475569;cursor:not-allowed}.cs-growth-action-detail{border-top:1px solid #cbd5e1;padding-top:10px;margin-top:12px;animation:csGrowthReveal .24s ease-out}.cs-growth-action-detail[hidden]{display:none}@keyframes csGrowthReveal{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.cs-growth-action,.cs-growth-action-button,.cs-growth-action-detail{animation:none;transition:none}}\n";(document.head||main).appendChild(trackerGrowthStyle);
 function node(tag,text,parent){
  var n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);
  if(parent)parent.appendChild(n);return n;
 }
 function link(url,label,parent){
  try{var u=new URL(url);if(u.protocol!=='https:')return node('span',label,parent);
   var a=node('a',label,parent);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a
  }catch{return node('span',label,parent)}
 }
 var researchDetails=null;
 function section(title){var s=node('section',null,researchDetails||container);node('h2',title,s);return s}
 function table(headers,rows,parent){
  var t=node('table',null,parent),head=node('thead',null,t),tr=node('tr',null,head);
  headers.forEach(h=>node('th',h,tr));
  var body=node('tbody',null,t);
  rows.forEach(row=>{var r=node('tr',null,body);row.forEach(value=>node('td',value===null?'Unknown':value,r))});
  return t;
 }
 function list(data,parent,display){
  if(!Array.isArray(data)||!data.length){node('p','No supported observations in this source.',parent);return}
  var ul=node('ul',null,parent);
  data.forEach(item=>node('li',display(item),ul));
 }
 // Pop-up before writing when no AI answer for this search term is at most 14 days old: the editor chooses.
 // Resolves 'WITH_AI' (answers present), 'WITHOUT_AI' (editor continues) or null (editor checks AI first).
 function aiGate(d){
  var c=d.ai_check;if(!c||(c.summary&&c.summary.checked>0))return Promise.resolve('WITH_AI');
  return new Promise(function(resolve){
   var dlg=document.createElement('dialog');dlg.className='growth-ai-gate';dlg.setAttribute('aria-labelledby','aiGateTitle');
   node('h2','No current AI answers for “'+c.search_term+'”',dlg).id='aiGateTitle';
   node('p',(c.older_answers_not_counted?c.older_answers_not_counted+' AI answer(s) are older than '+c.max_age_days+' days and no longer count. ':'No AI answer was pasted for this search term. ')+
    'Without them, the concepts are based on Google and the ranking pages only; whether AI systems cite your page for this search is unknown.',dlg);
   var row=node('p',null,dlg);
   var first=node('button','Check AI answers first',row);first.type='button';
   var without=node('button','Continue without AI check',row);without.type='button';without.style.marginLeft='8px';without.style.background='#475569';
   var done=function(v){try{dlg.close()}catch(e){}dlg.remove();resolve(v)};
   first.addEventListener('click',function(){done(null);var box=document.getElementById('growthAiCheck');if(box)box.scrollIntoView({behavior:'smooth'})});
   without.addEventListener('click',function(){done('WITHOUT_AI')});
   dlg.addEventListener('cancel',function(e){e.preventDefault();done(null)});
   document.body.appendChild(dlg);if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
   first.focus();
  });
 }
 // After a keep/remove, the readiness is recomputed the same way as on the server (only undecided statements block).
 function applyClaimReviews(ready){
  var total=Math.max(ready.statements.length,Number(ready.total_statements)||0);
  var open=total-ready.statements.filter(function(x){return x.decision!=='UNDECIDED'}).length;
  ready.blockers=(ready.blockers||[]).filter(function(b){return b.code!=='UNVERIFIED_STATEMENTS'});
  if(open>0)ready.blockers.unshift({code:'UNVERIFIED_STATEMENTS',count:open,required:true,detail:open+' statement(s) in the proposed text are not verified by any source and not yet reviewed by you.',action:'Read each statement: keep it when you confirm it is correct for your business, or remove it from the text.'});
  ready.kept=ready.statements.filter(function(x){return x.decision==='KEEP'}).length;ready.removed=ready.statements.filter(function(x){return x.decision==='REMOVE'}).length;
  var req=ready.blockers.some(function(b){return b.required});
  ready.status=req?'NOT_READY_FOR_PUBLICATION':ready.blockers.length?'READY_FOR_OWNER_APPROVAL_WITH_NOTES':'READY_FOR_OWNER_APPROVAL';
 }
 function renderAiCheck(box,d){
  var c=d.ai_check,x=c.summary||{};while(box.childNodes.length>1)box.removeChild(box.lastChild);
  node('p',String(x.headline||'')+'. '+String(x.explanation||''),box);
  var ul=node('ul',null,box);(x.engines||[]).forEach(function(e){node('li',e.label+': '+(!e.checked?'not checked':!e.verifiable?'no RESOURCES list — not verified':e.exact_page_cited?'cites this page':e.own_site_cited?'cites your site':'does not cite you')+(e.checked&&e.verifiable?' ('+e.sources+' sources)':''),ul)});
  if(c.older_answers_not_counted)node('small',c.older_answers_not_counted+' answer(s) older than '+c.max_age_days+' days are not counted. Paste them again to refresh.',box);
  if(!c.can_paste){node('small','Only the Tracker owner can add AI answers.',box);return}
  var form=node('div',null,box);
  node('p','Copy the prompt, paste it into a new chat with web search on, then paste the complete answer (including RESOURCES) at the AI system you used.',form);
  var pr=node('textarea',null,form);pr.rows=5;pr.readOnly=true;pr.value=c.prompt;pr.style.width='100%';
  var cp=node('button','Copy prompt',form);cp.type='button';cp.addEventListener('click',function(){pr.select();if(navigator.clipboard)navigator.clipboard.writeText(pr.value);cp.textContent='Copied ✓'});
  var sel=node('select',null,form);(c.engines||[]).forEach(function(e){var o=node('option',e.label,sel);o.value=e.id});
  var ta=node('textarea',null,form);ta.rows=6;ta.style.width='100%';ta.placeholder='Paste the complete AI answer here';ta.maxLength=c.max_paste||20000;
  var go=node('button','Analyse answer',form);go.type='button';var st=node('small',null,form);st.setAttribute('role','status');
  go.addEventListener('click',async function(){
   if(!ta.value.trim()){st.textContent='Paste the answer first.';return}
   go.disabled=true;st.textContent='Analysing…';
   try{var r=await fetch('/api/tracker-client/'+encodeURIComponent(token)+'/growth/ai-answer?page_id='+encodeURIComponent(id),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({engine:sel.value,text:ta.value,query:c.search_term,page_url:c.page_url,google_urls:((d.search_discovery&&d.search_discovery.leads)||[]).map(function(l){return l.url})})});
    var j=await r.json();if(!j.success)throw Error(j.error||j.code||'Not analysed');
    if(j.ai_check){d.ai_check=j.ai_check;if(last)last.ai_check=j.ai_check;renderAiCheck(box,d)}
   }catch(e){st.textContent=String(e.message||e);go.disabled=false}
  });
 }
 function render(d){
  container.textContent='';researchDetails=null;
  // An answer typed in the early AI box (not analysed yet) moves into the report's AI section.
  var earlyBox=document.getElementById('growthAiEarly'),earlyTa=earlyBox&&earlyBox.querySelector('textarea:not([readonly])'),earlySel=earlyBox&&earlyBox.querySelector('select');
  var keepText=earlyTa&&earlyTa.value,keepEngine=earlySel&&earlySel.value;if(earlyBox)earlyBox.textContent='';
  var decision=d.growth_decision||{},recommendation=decision.primary_next_action;
  var ownerReport=main.getAttribute('data-owner-draft')==='true'&&d.access?.owner_report===true;
  var outcome=ownerReport&&d.editorial_work_packet?.editorial_decision?
   d.editorial_work_packet.editorial_decision:(d.editorial_decision_gate||{});
  var primary=section('Growth result · decision and evidence');
  node('h3',d.outcome_context?d.outcome_context.headline:String(outcome.decision||'DATA_BLOCKED').replace(/_/g,' '),primary);
  if(d.outcome_context){var ocx=d.outcome_context;
   if(ocx.distinction)node('p',ocx.distinction,primary);
   if((ocx.open_checks||[]).length){node('strong','Still open — not a content question',primary);var olist=node('ol',null,primary);
    ocx.open_checks.forEach(function(c){var li=node('li',c.detail,olist);node('div','What to do: '+c.action,li)})}
   var oc=node('p',ocx.note+' ',primary);if((ocx.topics||[]).length){var go=node('a','Go to the list ↓',oc);go.href='#growthGapChoice'}}
  node('p',String(outcome.reason||outcome.next_action||'A verified editorial decision was not available.'),primary);
  if(outcome.target_url){var chosen=node('p','Target page: ',primary);link(outcome.target_url,outcome.target_url,chosen)}
  node('p','Focus query: '+String(outcome.focus_query||d.intent_resolution?.query||d.search?.focus_query||'not verified'),primary);
  node('small','Decision scope: '+String(outcome.decision_scope||'OBSERVED_RESEARCH_ONLY')+
   ' · Verified content gap: '+(outcome.verified_gap===true?'YES':(outcome.gap_observed===true?'NO — task gap observed, verified only after a draft passes the checks':'NO'))+
   ' · Automatic publishing: DISABLED',primary);
  var idNotes=[];[d.destination_identity&&d.destination_identity.advice].concat((d.url_identities||[]).map(function(x){return x.advice})).forEach(function(n){if(n&&idNotes.indexOf(n)<0)idNotes.push(n)});
  if(idNotes.length){node('p','URL identity:',primary);var ids=node('ul',null,primary);idNotes.forEach(function(n){node('li',String(n),ids)})}
  if(outcome.evidence_status){
   var ladder=node('ul',null,primary);
   [['search_intent_confirmed','Search intent confirmed from live results'],['competitor_content_observed','Competitor content read (2+ sites)'],
    ['destination_fully_examined','Target page read completely'],['missing_task_established','Missing reader task established'],
    ['draft_checked','Draft checked (task fit, duplication, wording, claims)'],['factual_claims_confirmed','Factual claims confirmed by the owner'],
    ['publication_approved','Publication approved']].forEach(function(r){node('li',r[1]+': '+(outcome.evidence_status[r[0]]===true?'yes':'no'),ladder)});
  }
  if(outcome.decision==='DATA_BLOCKED'){
   node('p','Missing evidence — what is needed and why:',primary);
   var miss=node('ul',null,primary);
   (outcome.missing_evidence||[{code:outcome.blocker_code||'SPECIFIC_EVIDENCE_NOT_ESTABLISHED',detail:outcome.next_action||''}])
    .forEach(function(m){node('li',String(m.code)+' — '+String(m.detail||''),miss)});
   if((outcome.attempted_sources||[]).length){
    node('p','Automatic sources already tried:',primary);
    var tried=node('ul',null,primary);
    outcome.attempted_sources.forEach(function(a){node('li',String(a.source)+': '+String(a.status)+(a.detail?' ('+String(a.detail)+')':''),tried)});
   }
   // What Google shows by title (all results, also those that could not be opened); explanation only, never evidence.
   if(d.serp_titles&&d.serp_titles.note)node('p','What Google shows, from the titles of '+String(d.serp_titles.titles_seen)+' results (titles only, not evidence for a change): '+String(d.serp_titles.note),primary);
  }
  if(outcome.decision==='NO_CHANGE'&&outcome.closure_report){
   node('p','Closure report — nothing needs to change for the checked reader tasks:',primary);
   var closed=node('ul',null,primary);
   (outcome.closure_report.tasks_checked||[]).forEach(function(t){node('li',String(t.label)+' → '+String(t.destination_status).replace(/_/g,' ').toLowerCase(),closed)});
   if(outcome.closure_report.note)node('small',String(outcome.closure_report.note),primary);
  }
  if(outcome.intent_scope)node('p','What Google shows: compared only with '+String(outcome.intent_scope.compared_with)+' ('+String(outcome.intent_scope.results_of_this_type)+' of '+String(outcome.intent_scope.of)+' results). '+String(outcome.intent_scope.note),primary);
  if(outcome.decision==='NEW_DISTINCT_PAGE'){
   node('p','Distinct search intent verified: '+String(d.serp_intent?.intent||'')+' ('+String(d.serp_intent?.compatible_leads||d.serp_intent?.agreeing_leads||0)+' of '+String(d.serp_intent?.organic_leads_considered||0)+' organic results). No compatible same-site page was found.',primary);
   if(outcome.new_page_plan&&outcome.new_page_plan.page_type==='PRODUCT_OR_TOOL_PAGE')
    node('p','Google shows tool pages for this search. Create a separate tool page only if you offer such a tool, written from your real features, pricing and screenshots; keep the existing page and link to the tool page. Growth does not generate product claims.',primary);
   if(outcome.new_page_draft){
    node('h3','Proposed new page for review',primary);
    outcome.new_page_draft.sections.forEach(function(sec){node('strong',sec.h2,primary);node('pre',sec.paragraphs.join('\n\n'),primary)});
   }else node('p','Draft status: '+String(outcome.copy_status||'not available'),primary);
  }
  var pack=ownerReport&&d.handoff_package?.markdown;
  if(pack){
   var dlPack=node('button','Download owner package (.md)',primary);dlPack.type='button';
   dlPack.addEventListener('click',function(){
    var blob=new Blob([pack],{type:'text/markdown;charset=utf-8'});
    var href=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=href;a.download='contentscale-growth-owner-package.md';document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(href)},2000);
   });
  }
  if(d.page_content?.render_status)
   node('p','Page capture: '+String(d.page_content.render_status),primary);
  if(d.intent_resolution?.status)
   node('p','Search intent: '+String(d.intent_resolution.status)+
    (d.intent_resolution.original_keyword?' · Original tracked term: '+d.intent_resolution.original_keyword:''),primary);
  if(ownerReport&&outcome.decision==='IMPROVE_EXISTING'&&outcome.proposed_text){
   if(d.gap_list)node('p','This is Growth\'s suggestion. You can also choose yourself what goes on the page in “Choose what goes on your site” below.',primary);
   node('h3','Concrete improvement for editorial review'+(outcome.publication_readiness&&outcome.publication_readiness.status==='NOT_READY_FOR_PUBLICATION'?' — draft, not ready for publication':''),primary);
   // Reviewable is not publishable: say what still stands between this proposal and publication.
   var ready=outcome.publication_readiness;
   if(ready&&ready.baseline)node('p','Starting point: '+String(ready.baseline.note||''),primary);
   if(ready&&(ready.blockers||[]).length){
    var rb=node('div',null,primary);rb.className='growth-publication-blockers';
    node('strong',ready.status==='NOT_READY_FOR_PUBLICATION'?'Draft for review — not ready for publication':'Ready for your approval, with notes',rb);
    var bl=node('ul',null,rb);ready.blockers.forEach(function(b){var li=node('li',(b.required?'Required: ':'Recommended: ')+String(b.detail||b.code),bl);node('div','What to do: '+String(b.action||''),li)});
    node('small',String(ready.note||''),rb);
   }
   // Every unverified statement, for the owner to read: keep it (confirmed for your business) or remove it from the text.
   if(ready&&(ready.statements||[]).length&&main.getAttribute('data-owner-draft')==='true'){
    var sb=node('div',null,primary);sb.className='growth-claim-review';
    node('strong','Statements to check before publishing ('+ready.statements.length+')',sb);
    node('p','Growth found no source for these. Keep a statement when you confirm it is correct for your business (it may add useful information for readers); remove it when you cannot stand behind it. Removed statements leave the copied text.',sb);
    var sl=node('ol',null,sb);
    ready.statements.forEach(function(st){
     var li=node('li',null,sl);node('span','“'+st.text+'” ',li);
     var state=node('strong',st.decision==='KEEP'?'Kept — confirmed by you':st.decision==='REMOVE'?'Removed from the text':'Not reviewed yet',li);
     var row=node('div',null,li);
     [['KEEP','Keep (I confirm this)'],['REMOVE','Remove from the text'],['UNDECIDED','Undo']].forEach(function(a){
      if(a[0]==='UNDECIDED'&&st.decision==='UNDECIDED')return;
      var btn=node('button',a[1],row);btn.type='button';if(a[0]!=='KEEP'&&btn.style)btn.style.marginLeft='6px';if(a[0]===st.decision)btn.disabled=true;
      btn.addEventListener('click',async function(){
       btn.disabled=true;state.textContent='Saving…';
       try{var r=await fetch('/api/tracker-client/'+encodeURIComponent(token)+'/growth/claim-review?page_id='+encodeURIComponent(id),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({target_page_id:ready.target_page_id,statement:st.text,decision:a[0]})});var j=await r.json();if(!j.success)throw Error(j.code||'Not saved');
        st.decision=a[0];applyClaimReviews(ready);if(last)render(last);
       }catch(e){state.textContent='Not saved: '+String(e.message||e);btn.disabled=false}
      });
     });
    });
   }
   node('p','Existing section: '+String(outcome.target_section||'unspecified'),primary);
   if(outcome.placement)node('p','Placement: '+String(outcome.placement.mode||'').replace(/_/g,' ').toLowerCase()+' — '+String(outcome.placement.reason||''),primary);
   if(outcome.existing_passage){node('strong','Existing observed passage',primary);node('pre',outcome.existing_passage,primary)}
   var extra=outcome.additional_sections||[];
   node('strong','Change 1 of '+(1+extra.length)+' — proposed replacement/addition, fact-check before approval',primary);
   if(outcome.draft_heading)node('p','New H2: '+String(outcome.draft_heading),primary);
   node('pre',outcome.proposed_text,primary);
   extra.forEach(function(a,i){
    node('strong','Change '+(i+2)+' of '+(1+extra.length)+' — fact-check before approval',primary);
    if(a.placement)node('p','Placement: '+String(a.placement.mode||'').replace(/_/g,' ').toLowerCase()+' “'+String(a.placement.section_heading||'')+'” — '+String(a.placement.reason||''),primary);
    if(a.heading)node('p','New H2: '+String(a.heading),primary);
    node('pre',String(a.text||''),primary);
   });
   if(outcome.source_comparison?.competitor_url){
    var competitor=node('p','Compared with: ',primary);
    link(outcome.source_comparison.competitor_url,outcome.source_comparison.competitor_heading||outcome.source_comparison.competitor_url,competitor);
    if(outcome.source_comparison.competitor_passage)node('pre',outcome.source_comparison.competitor_passage,primary);
   }
   node('p','This is a reviewable proposal, NOT a proven ranking gain or automatically verified missing answer.',primary);
   var notReady=!!(outcome.publication_readiness&&outcome.publication_readiness.status==='NOT_READY_FOR_PUBLICATION');
   var copyEdit=node('button',(notReady?'Copy draft for review — not for publication':'Copy proposed Growth edit')+((outcome.additional_sections||[]).length?' (all '+(1+outcome.additional_sections.length)+' changes)':''),primary);copyEdit.type='button';
   copyEdit.addEventListener('click',async function(){
    var material=window.growthEditCopyText(outcome);
    try{await navigator.clipboard.writeText(material);copyEdit.textContent='Copied'}
    catch(_){copyEdit.textContent='Copy unavailable'}
   });
  }else if(outcome.decision==='IMPROVE_EXISTING'&&outcome.copy_ready!==true){
   // The improvement itself is established; only the text is not. Say both, so the owner knows what is and is not ready.
   node('h3','Improvement identified — no approved publication text yet',primary);
   var tasks=(outcome.improvement_plan?.tasks||[]).map(function(t){return String(t.label||t.code)});
   if(tasks.length)node('p','Missing on '+String(outcome.target_url||'the target page')+': '+tasks.join(' · '),primary);
   node('p','Status: '+String(outcome.copy_status||'DRAFT_NOT_AVAILABLE').replace(/_/g,' ').toLowerCase()+'. '+String(outcome.next_action||'Regenerate the draft or write the missing section by hand; nothing is published.'),primary);
  }else if(ownerReport&&d.editorial_review_draft?.draft?.sections?.length){
   node('p','A draft was generated but a distinct, paired content improvement is not verified. Review the draft and evidence below before approving any edit.',primary);
  }
  // AI answers for this search term: offered right after the decision, read fresh on every load, never re-running research.
  if(d.ai_check){var aiBox=section('AI answers for “'+d.ai_check.search_term+'” — optional');aiBox.id='growthAiCheck';renderAiCheck(aiBox,d);
   if(keepText){var t2=aiBox.querySelector('textarea:not([readonly])'),s2=aiBox.querySelector('select');if(t2)t2.value=keepText;if(s2&&keepEngine)s2.value=keepEngine}}
  // What the ranking pages have and this page does not: the editor chooses what goes on the page (Growth's own proposal
  // above is one suggestion; any item can be ticked here).
  // The editor's choice: every difference, ticked by the owner; text is written only for the selection.
  var renderChecklist=typeof window!=='undefined'&&window.renderGrowthGapChecklist;
  if(d.gap_list&&typeof renderChecklist==='function'){
   var gl=d.gap_list,writeUrl=gl.id&&gl.write_url;
   var choiceBox=node('section',null,container);choiceBox.id='growthGapChoice';
   try{renderChecklist({...gl,target_url:d.url},choiceBox,{write:writeUrl?async function(ids){
    // Without AI answers of the last 14 days the editor decides first: check AI, or continue without it.
    var choice=await aiGate(d);if(!choice)return {success:false,code:'Check the AI answers first (see “AI answers for …” above); your selection is kept.'};
    // The ticks are the owner's selection (saved deliberately first); writing then takes the next items from it.
    var post=function(u,b){return fetch(u,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json()})};
    var sel=await post(writeUrl.replace('/auto-research/write','/auto-research/selection'),{gap_list_id:gl.id,item_ids:ids});
    if(!sel||sel.success===false)return sel;
    return post(writeUrl,{gap_list_id:gl.id,item_ids:ids,ai_check_choice:choice})}:null})}catch(e){}
  }
  var superseded=!!(decision.final_decision&&recommendation&&recommendation.stage==='RESEARCH_STARTING_POINT');
  var s=superseded?section('How the research started'):section('Research context and next check');
  if(superseded)node('p','Starting point only. The decision at the top of this report ('+String(decision.final_decision.decision||'').replace(/_/g,' ')+') replaces this step.',s);
  if(recommendation){
   node('h3',recommendation.title,s);
   node('p',recommendation.reason,s);
   if(!superseded)node('p','Do this: '+recommendation.instruction,s);
   if(recommendation.related_pages_to_check?.length){
    node('strong','Check an existing page before creating a new one:',s);
    recommendation.related_pages_to_check.forEach(u=>{var item=node('p',null,s);link(u,u,item)});
   }
   node('small','Safety: '+recommendation.stop_before,s);
   node('p',decision.protection?.case_study_locked?'Case Study is active: research and review only. No live edits or publishing.':'No automatic publishing. Owner reviews any CMS changes.',s);
   if(decision.protection?.preserve_existing_top_rankings){
    node('strong','Protect already performing queries',s);
    node('p',(decision.protected_queries||[]).map(q=>q.query+' (position '+q.position.toFixed(1)+', '+q.clicks+' clicks)').join(' · '),s);
   }
   node('small',(decision.excluded_queries||[]).length+' off-intent, stale or unverified queries excluded from recommendations. GSC import date is not its measurement period.',s);
   var copy=node('button','Copy this editorial action',s);copy.type='button';if(superseded)copy.hidden=true;
   copy.addEventListener('click',async function(){
    var content=[d.url,recommendation.title,recommendation.reason,recommendation.instruction,
      'Review related pages: '+(recommendation.related_pages_to_check||[]).join(', '),
      recommendation.stop_before,decision.protection?.case_study_locked?'CASE STUDY LOCKED — no edits':'Editorial approval required'].join('\n');
    try{await navigator.clipboard.writeText(content);copy.textContent='Copied — ready for editorial review'}
    catch(_){copy.textContent='Copy unavailable — use Download research report'}
   });
  }else node('p','A single actionable recommendation is not yet available. See supporting evidence.',s);
  var opportunity=d.autonomous_growth_opportunity||{};
  if(opportunity.primary_opportunity){
   s=section(opportunity.superseded_by?'Earlier research step (replaced by the decision at the top)':'Additional search growth opportunity — evidence led');
   if(opportunity.superseded_by)node('p','Kept for traceability only. The leading decision is the one at the top of this report ('+String(opportunity.leading_decision||'').replace(/_/g,' ').toLowerCase()+'); any different advice in this step no longer applies.',s);
   var op=opportunity.primary_opportunity;
   node('h3',op.query,s);
   node('p','Observed exact-page GSC: '+op.observed_impressions+' impressions, '+op.observed_clicks+' clicks, '+op.observed_ctr_pct+'% CTR, average position '+op.observed_average_position+'.',s);
   node('small','GSC import: '+(op.imported_at||'unknown')+'; underlying measurement range not confirmed by this export.',s);
   node('p',op.analysis,s);
   var proposal=opportunity.recommendation||{};
   node('strong','Next researched action',s);
   node('p',proposal.editorial_next||'Verify distinct search intent and existing-site coverage first.',s);
   node('p','Reader outcome: '+(proposal.practical_reader_deliverable||'Useful, verifiable next steps'),s);
   node('p','Internal linking: '+(proposal.internal_link_handoff||'Verify before suggesting a link.'),s);
   if(opportunity.editorial_package){
    var pkg=opportunity.editorial_package;
    node('h3','Prepared editorial next step',s);
    node('p','Decision: '+pkg.decision+(pkg.proposed_target_url?' · Target: '+pkg.proposed_target_url:''),s);
    node('p','Useful outcome for the reader: '+pkg.visitor_outcome,s);
    var steps=node('ol',null,s);
    (pkg.reader_steps||[]).forEach(function(step){
     var li=node('li',null,steps);node('strong',step.heading+': ',li);
     node('span',step.action+' Deliverable: '+step.output,li);
    });
    if(pkg.internal_link_recommendation){
     node('p','Possible contextual link: '+pkg.internal_link_recommendation.suggested_anchor,s);
     link(pkg.internal_link_recommendation.destination,'Review destination page',s);
    }
    node('small',pkg.verification_gate,s);
   }
   var copy=opportunity.evidence_guided_copy||{};
   if(copy.status){
    node('h3','Evidence-guided editorial copy',s);
    node('p','Status: '+copy.status,s);
    if(copy.target_url)link(copy.target_url,'Inspected target URL',s);
    if(copy.one_next_action){
     node('strong','One next action: '+copy.one_next_action.code,s);
     node('p',copy.one_next_action.instruction,s);
    }
    if((copy.held_possible_duplicates||[]).length)
     node('p',(copy.held_possible_duplicates||[]).length+' possible duplicate additions held back pending comparison.',s);

    (copy.proposed_additions||[]).forEach(function(proposal){
     var item=node('div',null,s);
     node('strong',proposal.proposed_heading,item);
     node('p',proposal.reviewable_paragraph,item);
     node('small','Review before use: '+proposal.action,item);
    });
    if(copy.verification)node('small',copy.verification,s);
   }
   node('strong','Related existing pages to investigate',s);
   if(opportunity.existing_destinations?.length)opportunity.existing_destinations.forEach(function(x){
    var item=node('p',null,s);link(x.url,x.url,item);node('small','Not yet verified as matching the intent.',item);
   });else node('p','No relevant same-site page was established from the available Tracker inventory. Do not invent a destination.',s);
   node('small','Remaining verification: '+(opportunity.verification_needed||[]).join(' · '),s);
   node('small','Protection: no homepage title/H1 rewrite, no automatic new page, no Case Study changes or publication.',s);
  }
  if(main.getAttribute('data-owner-draft')!=='true'){
   s=section('Research-only access');
   node('p','This is an evidence report, NOT a complete Growth draft. Use the Tracker owner link to create a full editorial review draft and download the combined JSON. GSC is optional.',s);
  }
  var destinationGsc=d.destination_gsc_evidence||{};
  if(destinationGsc.target_url){
   s=section('Selected page · search evidence');
   node('p','Destination: '+destinationGsc.target_url,s);
   if(destinationGsc.exact_query_verified&&destinationGsc.metrics){
    var dm=destinationGsc.metrics;
    node('p','Verified for this page and query: '+dm.impressions+' impressions, '+dm.clicks+
     ' clicks, average position '+dm.average_position+'.',s);
    node('small','GSC imported: '+(dm.imported_at||'unknown')+
     ' · actual measurement period: unknown. Homepage metrics were not reused.',s);
   }else{
    node('p','No exact-page verified GSC for this destination/query ('+
     String(destinationGsc.status||'not checked')+'). Homepage data will not be assigned to this page.',s);
    node('small','Public-page and competitor research may continue without GSC. No verified Google click gain can be claimed.',s);
   }
  }
  var sample=d.evidence_bound_example||{};
  if(sample.status==='DESTINATION_GSC_EVIDENCE_REQUIRED'){
   s=section('Growth evidence · target page verification needed');
   node('p','GSC clicks and impressions belong to the tracked page, not the proposed destination. No destination-specific GSC example has been prepared; this does NOT block source-grounded editorial drafting.',s);
   if(sample.source_metrics_url)node('p','Measured source: '+sample.source_metrics_url,s);
   if(sample.target_metrics_url)node('p','Destination requiring its own GSC data: '+sample.target_metrics_url,s);
   node('small',sample.one_next_action||'Exact destination GSC is required for click/position claims, not editorial drafting.',s);
  }
  if(sample.status==='EVIDENCE_BOUND_EXAMPLE_FOR_REVIEW'&&sample.proposed_text){
   s=section('Evidence-based example · editorial review');
   node('h3',sample.heading,s);
   node('p',sample.proposed_text,s);
   if(sample.target_url){node('strong','Existing page to review: ',s);link(sample.target_url,sample.target_url,s);}
   node('small','Observed source: '+String(sample.evidence?.source_url||'Unknown')+
    ' · GSC imported: '+String(sample.evidence?.imported_at||'Unknown')+
    ' · actual measurement period: '+String(sample.evidence?.measurement_window||'Unknown'),s);
   node('small',sample.editorial_check||'Check for duplicates before proposing any insertion.',s);
   node('p','This is a grounded candidate example, not a verified content gap and not published.',s);
   var copyExample=node('button','Copy evidence-based example',s);copyExample.type='button';
   copyExample.addEventListener('click',async function(){
    try{await navigator.clipboard.writeText(sample.heading+'\n\n'+sample.proposed_text);
     copyExample.textContent='Copied — ready for editorial review'}
    catch(_){copyExample.textContent='Clipboard unavailable — use report JSON'}
   });
  }
  var discovery=d.search_discovery||{};
  // Optional shared renderer (growth-competitor-overview.js); the report renders fully without it.
  var renderOverview=typeof window!=='undefined'&&window.renderGrowthCompetitorOverview;
  if(d.competitor_overview&&typeof renderOverview==='function'){
   try{renderOverview(d.competitor_overview,node('section',null,researchDetails||container))}catch(e){}
  }
  s=section('Search competitors for this Growth query');
  var liveRivals=(d.competitors?.live_reviewed||[]).filter(x=>
   x.discovery_source==='BING_PUBLIC_RSS'||x.discovery_source==='SERPER_GOOGLE_ORGANIC');
  var googleSource=discovery.source==='SERPER_GOOGLE_ORGANIC';
  node('p','Search topic: '+(discovery.target_query||discovery.query||'Not established')+
   ' · Source: '+(googleSource?'Google organic (optional provider)':'Public Bing RSS')+
   ' · Status: '+(discovery.status||'NOT_CHECKED')+
   ' · '+liveRivals.length+' competitor HTML pages retrieved.',s);
  var sc=discovery.scope||{},loc=discovery.search_locale||{};
  var marketText=(sc.searched_markets||[]).length?sc.searched_markets.join(' + ').toUpperCase()+' / '+String(sc.language||'en'):'US / English';
  node('small',googleSource?'Google organic listings observed through the configured optional Serper.dev ('+marketText+'). These are search-result observations, not verified target-page GSC rankings or traffic.':
    'Free public Bing RSS discovery is optional and may be blocked. This source does not verify Google rankings; an optional configured Google lookup is tried only when free discovery returns no relevant leads.',s);
  // Research per target market: which markets were researched, whether the market was set by the owner or derived.
  var cov=discovery.market_coverage||{};
  if(loc.source||cov.status){
   var mk=node('div',null,s);
   node('small','Search market: '+(loc.country||'US (default)')+(loc.hl?' · language '+loc.hl+(loc.language_source==='SET_IN_TRACKER'?' (set in Growth)':loc.language_source==='FROM_PREWRITE_BRIEF'?' (from the Pre-Write brief)':loc.language_source==='SITE_DEFAULT'?' (site default)':''):'')+(loc.brief?' · Pre-Write brief #'+loc.brief.id:'')+' · '+(loc.source==='SET_IN_TRACKER'?'set in Growth':loc.source==='FROM_PREWRITE_BRIEF'?'from the Pre-Write brief':loc.source==='SITE_DEFAULT'?'site default (Growth Cockpit)':loc.source==='OPPORTUNITY_FINDER'?'this run only (Opportunity Finder)':'derived from the page ('+String(loc.source||'').toLowerCase().replace(/_/g,' ')+'), not confirmed')+
    (loc.priority_confirmed===false?' · the order of the markets is a guess from how often the headings name them':''),mk);
   (cov.markets||[]).forEach(function(m){node('small',' '+m.name+': '+(m.researched?'researched ('+(m.provider||'search')+', '+m.usable_results+' usable result(s))':'not researched'),node('div',null,mk))});
   if(cov.note)node('small',cov.note,node('div',null,mk));
   if(d.market_setting_url&&loc.source!=='SET_IN_TRACKER'&&loc.source!=='FROM_PREWRITE_BRIEF'&&loc.source!=='SITE_DEFAULT')node('small','Set the target markets at the top of this page to research the right countries.',mk);
  }
  if(discovery.free_discovery_status)node('small','Free search: '+discovery.free_discovery_status,s);
  if(discovery.optional_google_status)node('small','Optional Google search: '+discovery.optional_google_status,s);
  if(discovery.reason)node('small','Source status: '+discovery.reason,s);
  if(liveRivals.length){
   liveRivals.forEach(function(c){
    var item=node('div',null,s);link(c.url,c.title||c.url,item);
    node('small','Observed H2 topics: '+(c.h2||[]).slice(0,6).join(' · '),item);
   });
  }else{
   node('p','No newly discovered competitors could be verified for this exact search topic. Historical leads remain in the detailed research, not as substitutes for a verified live comparison.',s);
  }
  var plan=d.practical_growth_plan||{},change=plan.change||{};
  var pairs=plan.competitors?.side_by_side||[];
  if(pairs.length){
   s=section('Side-by-side: what the competitor actually says');
   pairs.forEach(function(pair){
    var block=node('div',null,s);
    node('h3','Competitor: '+pair.competitor_section,block);
    node('p','Observed excerpt: '+(pair.competitor_excerpt||'Not available'),block);
    node('p','Your section: '+(pair.tracked_page_section||'No matching section in inspected HTML'),block);
    if(pair.tracked_page_excerpt)node('p','Your observed excerpt: '+pair.tracked_page_excerpt,block);
    node('small',pair.interpretation,block);
    node('small','What to do: '+pair.editorial_action,block);
    link(pair.competitor_url,'Competitor source',block);
   });
  }
  var questions=plan.competitors?.comparison_questions||[];
  if(questions.length){
   s=section('What the relevant competitors cover');
   node('p','Observed competitor topics to compare with the current page; differences are NOT automatically missing content.',s);
   questions.forEach(function(q){
    var block=node('div',null,s);
    node('strong',q.observed_heading,block);
    node('small',q.editorial_check,block);
    link(q.competitor_url,'Observed source',block);
   });
  }
  s=section('Prepared improvement · review before publishing');
  if(change.target_section)node('p','Keep this existing section: "'+change.target_section+'"',s);
  node('p',change.summary||'A supported content change is not available from the inspected source.',s);
  if(change.ready_to_review_text?.length){
   var formatted=change.ready_to_review_text.join('\n\n');
   node('h3','Proposed copy — not yet published',s);
   change.ready_to_review_text.forEach(p=>node('p',p,s));
   var copyDraft=node('button','Copy proposed text',s);copyDraft.type='button';
   copyDraft.addEventListener('click',async function(){
    try{await navigator.clipboard.writeText(formatted);copyDraft.textContent='Text copied'}
    catch(_){copyDraft.textContent='Copy unavailable on this browser'}
   });
   node('small','Only insert if the original section does not already answer this well. Review claims, accuracy, placement and duplicate content.',s);
   var save=node('button','Download editorial brief (.md)',s);save.type='button';
   save.addEventListener('click',function(){
    var lines=['# ContentScale Growth · Editorial improvement (not published)','',
      'Original URL: '+String(d.url||''),'Working query: '+String(plan.focus_query||'Unknown'),
      'Case Study protected: '+(plan.guard?.case_study_locked?'YES':'NO'),'',
      '## Existing section to review',change.target_section||'Choose the appropriate existing section',
      '','## Proposed improvement',...change.ready_to_review_text,'',
      '## Why this is being reviewed',String(recommendation?.reason||''),'',
      '## Review guard',String(change.summary||''),'',
      'Do not change the original page, live Case Study or publish without editor approval.',
      'GSC imported_at is not a reporting-period boundary; no promised ranking or click uplift.'];
    var blob=new Blob([lines.join('\n\n')],{type:'text/markdown;charset=utf-8'});
    var href=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=href;a.download='contentscale-growth-editorial-brief.md';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),2000);
   });
  }else{
   node('h3','Specific editorial steps',s);
   list(change.steps||[],s,x=>x);
  }
  if(plan.guard?.case_study_locked)node('p','The Case Study remains locked. This is an editorial proposal only; no published content or baseline has changed.',s);
  if(main.getAttribute('data-owner-draft')==='true'){
   s=section('Prepare a full reviewed editorial draft');
   node('p','Owner-only drafting from the selected, observed Growth destination and working query. No CMS connection, new URL or automatic publication. Case Studies stay protected.',s);
   var distinctDestination=!!destinationGsc.target_url&&destinationGsc.target_url!==d.url;
   var draftSourceUrl=distinctDestination?destinationGsc.target_url:d.url;
   var draftPageId=distinctDestination?Number(destinationGsc.target_page_id):Number(id);
   var validDraftPage=Number.isSafeInteger(draftPageId)&&draftPageId>0;
   node('p','Draft source URL: '+String(draftSourceUrl||'Unavailable'),s);
   var prepare=node('button','Prepare detailed draft for review',s);prepare.type='button';
   var output=node('div',null,s),draftStatus=node('small',
    validDraftPage?'Optional AI assistance; a review-only draft does not change any live page.':
     'Selected destination is not a verified Tracker page belonging to this account; drafting the homepage instead is blocked.',s);
   if(!validDraftPage){
    prepare.disabled=true;
    if(!d.report_completion)d.editorial_review_draft={status:'DESTINATION_TRACKER_PAGE_REQUIRED',target_url:draftSourceUrl||null,
     auto_started:false,published:false,case_study_unchanged:true};
   }else if(!d.report_completion){
    d.editorial_review_draft={status:'PREPARING',target_url:draftSourceUrl,
     auto_started:true,published:false,case_study_unchanged:true};
    document.getElementById('downloadResearch').disabled=true;
   }
   var showDraftResult=function(result){
    output.textContent='';
    if(String(result.target_url||'')!==String(draftSourceUrl||'')){
     draftStatus.textContent='Draft URL mismatch · no text displayed.';
     return;
    }
    if(result.status==='WRITING_ON_SELECTION'){
     draftStatus.textContent='No text written yet. Choose what goes on your site in the list above and write only those, or prepare a draft for the automatic plan with the button.';
     return;
    }
    if(result.status!=='AI_DRAFT_REVIEW_REQUIRED'||!result.draft?.sections?.length){
     draftStatus.textContent='Detailed draft status: '+String(result.status||'NO_DRAFT')+
      (result.error_code?' ('+String(result.error_code).slice(0,110)+')':'')+
      '. The researched evidence is available; no page was published.';
     return;
    }
    var draft=result.draft;
    var liveDraftSource=result.source_type==='LIVE_PUBLIC_HTML';
    draftStatus.textContent='Draft prepared · '+(liveDraftSource?'CURRENT PUBLIC HTML':'SAVED TRACKER HTML — CHECK FRESHNESS')+
     ' · editor approval required · NOT published'+(d.case_study_locked?' · active Case Study protected':'');
    node('p','Research questions from current competitor reading: '+
     String(result.competitor_research_passages_used||0)+
     ' · editorial comparison only, not proven gaps or copied competitor text.',output);
    var gsc=result.gsc_context||{},gscStatus=gsc.status||'NO_VERIFIED_GSC';
    node('p','GSC (optional): '+gscStatus+
     '. Source and destination URL measurements are kept separate. Existing successful queries are protected; missing GSC never blocks this draft.',output);
    if(gsc.source_query_metrics&&gsc.source_url)
     node('small','Source-page opportunity for “'+gsc.source_query_metrics.query+
      '”: '+gsc.source_query_metrics.impressions+' impressions, '+
      gsc.source_query_metrics.clicks+' clicks, average position '+
      gsc.source_query_metrics.average_position.toFixed(1)+
      ' — belongs to '+gsc.source_url+', NOT the draft destination.',output);
    node('h3','Draft proposal — editorial review required',output);
    if(draft.seo_title)node('p','Suggested title (do not replace a strong ranking title automatically): '+draft.seo_title,output);
    if(draft.meta_description)node('p','Suggested description: '+draft.meta_description,output);
    // Only sections that passed the checks are presented as a proposal. Rejected provider text is never rendered or copied.
    var acceptedSections=draft.sections.filter(function(sec){return sec.review_status!=='REJECTED_NOT_PART_OF_PROPOSAL'});
    var rejectedSections=draft.sections.filter(function(sec){return sec.review_status==='REJECTED_NOT_PART_OF_PROPOSAL'});
    acceptedSections.forEach(function(section){
     node('h3',section.h2,output);
     (section.paragraphs||[]).forEach(p=>node('p',p,output));
    });
    if(rejectedSections.length){
     node('strong','Generated but rejected — NOT part of the proposal (text withheld):',output);
     rejectedSections.forEach(function(sec){node('p','• '+String(sec.h2)+' — '+(sec.rejection_reasons||[]).map(function(x){return String(x.code)}).join(', '),output)});
    }
    node('small','Only source-supported facts may be published after verification. Preserve original H1, existing useful content, images and URL. No auto publishing.',output);
    var content=['# Growth editorial proposal — not published','',
     'Original URL: '+String(result.target_url||''),'Source: '+String(result.source_type||'UNKNOWN'),
     'Source checked: '+String(result.source_retrieved_at||'Unknown — historical snapshot possible'),
     'Chosen Growth query: '+String(recommendation?.query||plan.focus_query||''),
     'Case Study locked: '+(d.case_study_locked?'YES':'NO'),'', 'Suggested SEO title: '+String(draft.seo_title||''),
     'Suggested description: '+String(draft.meta_description||''),'',
     ...acceptedSections.flatMap(section=>['## '+section.h2,...(section.paragraphs||[]),'']),
     'All claims require owner review. No live content has been modified.'].join('\n\n');
    var copyFull=node('button','Copy complete draft',output);copyFull.type='button';
    copyFull.addEventListener('click',async function(){
     try{await navigator.clipboard.writeText(content);copyFull.textContent='Draft copied'}
     catch(_){copyFull.textContent='Clipboard unavailable'}
    });
    var download=node('button','Download full draft (.md)',output);download.type='button';
    download.addEventListener('click',function(){
     var blob=new Blob([content],{type:'text/markdown;charset=utf-8'});
     var href=URL.createObjectURL(blob),a=document.createElement('a');
     a.href=href;a.download='contentscale-growth-full-editor-draft.md';document.body.appendChild(a);a.click();a.remove();
     setTimeout(()=>URL.revokeObjectURL(href),2000);
    });

   };
   var prepareDraft=async function(){
    prepare.disabled=true;draftStatus.textContent='Preparing a source-grounded draft without publishing…';
    output.textContent='';
    try{
     // Owner completion is composed server-side using the same authenticated
     // editorial-draft handler. The downloaded JSON is the complete server result,
     // never a browser-only mutation of a research-only response.
     var response=await fetch('/api/tracker-client/'+encodeURIComponent(token)+
      '/growth/auto-research/complete?page_id='+encodeURIComponent(id),{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({page_id:Number(id)})
     });
     var composite=await response.json();
     if(!response.ok||composite.success!==true)
      throw Error(composite.code||'Complete Growth report unavailable');
     var result=composite.editorial_review_draft||{};
     if(String(result.target_url||'')!==String(draftSourceUrl||''))
      throw Error('DRAFT_SOURCE_URL_MISMATCH');
     pointHandoff(composite);
     if(last===d){
      last=composite;
      d.editorial_review_draft=result;
     }
     showDraftResult(result);
    }catch(error){
     var errorCode=String(error.message||error||'DRAFT_UNAVAILABLE').slice(0,110);
     if(last===d)d.editorial_review_draft={status:'DRAFT_UNAVAILABLE',error_code:errorCode,
      auto_started:true,target_url:draftSourceUrl,published:false,case_study_unchanged:true};
     draftStatus.textContent='Detailed draft not available: '+errorCode+'. The research remains available.';
    }finally{
     prepare.disabled=false;
     if(last===d||last?.generated_at===d.generated_at){
      document.getElementById('downloadResearch').disabled=false;
      document.getElementById('researchStatus').textContent=
       'Research complete · editorial draft: '+String(d.editorial_review_draft?.status||'UNKNOWN')+' · NOT published.';
     }
    }
   };
   prepare.addEventListener('click',prepareDraft);
   // This page was explicitly opened to perform owner Growth research. Complete
   // the optional second step automatically; do not require another button press.
   // Non-owner sessions and untracked destinations never invoke the AI endpoint.
   if(validDraftPage&&d.report_completion)showDraftResult(d.editorial_review_draft||{status:'NO_DRAFT_RESULT',target_url:draftSourceUrl});
   // No automatic writing: the owner chooses (selection above, or this button for the automatic plan).
  }
  s=section('What happened to the other research?');
  var rows=plan.classifications||[],categories=plan.query_categories||{};
  node('p',rows.length+' GSC queries classified · '+(categories.PROTECT||0)+' protected · '+
   (categories.IMPROVE_EXISTING||0)+' investigated · '+(categories.SEPARATE_OR_UNCONFIRMED_INTENT||0)+' other or unconfirmed intent · '+
   (categories.BRAND_NAVIGATION||0)+' branded',s);
  var other=node('details',null,s);node('summary','See every query and why it was kept or separated',other);
  if(rows.length)table(['Search query','Evidence','Decision'],
    rows.map(q=>[q.query,q.impressions+' impressions · '+q.clicks+' clicks · position '+(q.position===null?'unknown':q.position.toFixed(1)),q.category+': '+q.meaning]),other);
  else node('p','GSC is optional; this plan can still be reviewed without ranking data.',other);
  var rival=plan.competitors||{};
  node('p',(rival.inspected||0)+' competitor pages inspected · '+(rival.relevant_to_action||0)+' relevant to the selected query by topic · '+
   (rival.requiring_separate_intent_review||0)+' kept as other-intent research.',s);
  node('small',rival.warning||'No current SERP ranking claim is established.',s);
  var rivals=node('details',null,s);node('summary','See inspected competitor pages and relevance',rivals);
  (rival.classification||[]).forEach(c=>{var item=node('div',null,rivals);link(c.url,c.title||c.url,item);
   node('small',c.category+' — '+c.reason,item)});
  // Guided Tracker Growth actions: one blue next step; reviewed actions green; future steps neutral.
  var sc=d.spoke_candidates,fn=d.reader_funnel;
  if(sc||fn){
   var beyond=section('Beyond this page · opportunities and next actions');
   var guidance=node('p','Review one evidence-backed opportunity at a time. Nothing is published automatically.',beyond);
   guidance.className='cs-growth-guidance';
   var actionList=node('div',null,beyond);actionList.className='cs-growth-action-list';
   var actions=[];
   function addAction(title,desc,detailLines){
    var card=node('div',null,actionList);card.className='cs-growth-action';
    var head=node('div',null,card);head.className='cs-growth-action-head';
    var state=node('span','○',head);state.className='cs-growth-state';
    var body=node('div',null,head);body.className='cs-growth-action-copy';
    node('strong',title,body);node('p',desc,body);
    var action=node('button','Review evidence',card);action.type='button';action.className='cs-growth-action-button';
    var detail=node('div',null,card);detail.className='cs-growth-action-detail';detail.hidden=true;
    detailLines.forEach(function(line){node('p',line,detail)});
    var status=node('small','Not reviewed',card);status.setAttribute('role','status');
    var item={card:card,state:state,button:action,detail:detail,status:status,reviewed:false};
    actions.push(item);
    action.addEventListener('click',function(){
     if(item.reviewed){item.detail.hidden=!item.detail.hidden;action.textContent=item.detail.hidden?'Show evidence':'Hide evidence';return}
     item.reviewed=true;item.detail.hidden=false;action.textContent='Hide evidence';status.textContent='Reviewed — proposal only. Confirm intent and evidence before making changes.';
     refreshActions();
    });
   }
   function refreshActions(){
    var next=actions.findIndex(function(a){return !a.reviewed});
    actions.forEach(function(a,i){
     a.card.classList.toggle('cs-growth-done',a.reviewed);
     a.card.classList.toggle('cs-growth-current',!a.reviewed&&i===next);
     a.card.classList.toggle('cs-growth-future',!a.reviewed&&i!==next);
     a.state.textContent=a.reviewed?'✓':i===next?'→':'○';
     a.button.disabled=!a.reviewed&&i!==next;
     if(!a.reviewed){a.button.textContent=i===next?'Review next opportunity':'Complete previous step first';a.status.textContent=i===next?'Next action':'Available after the previous step'}
    });
    guidance.textContent=next<0?'All listed opportunities reviewed. No changes have been published.':'Next: review opportunity '+(next+1)+' of '+actions.length+'. Nothing is published automatically.';
   }
   if(sc){
    node('h3','Possible new pages (research first)',beyond);
    if((sc.candidates||[]).length){
     sc.candidates.forEach(function(c){
      addAction('Research: '+c.query, String(c.impressions)+' impressions · '+String(c.clicks)+' clicks · position '+String(c.best_position),
       ['Next step: '+String(c.next||'Start a Pre-Write brief and verify live SERP intent and overlap.'),'Related terms: '+String((c.variants||[]).join(', ')||c.query),'This is a candidate, not approval to publish.']);
     });
    }else node('p',String(sc.note||'No candidates.'),beyond);
    if((sc.belongs_elsewhere||[]).length){
     var other=node('details',null,beyond);node('summary','Queries already served by tracked pages',other);
     (sc.belongs_elsewhere||[]).forEach(function(x){var item=node('p',x.query+' → ',other);link(x.url,x.url,item)});
    }
    if((sc.excluded||[]).length){
     var REASON={OWN_BRAND_TERM:'your own brand',NAMES_A_PLACE_THIS_SITE_DOES_NOT_SERVE:'names a place this site does not serve',
      VARIANT_OF_THIS_PAGE_FOCUS_TERM:'a variant of this page\'s own focus term',NO_TOPIC_WORDS:'no topic words'};
     var ex=node('details',null,beyond);node('summary','Search terms left out, with the reason ('+sc.excluded.length+')',ex);
     sc.excluded.forEach(function(x){node('p',x.query+' — '+(REASON[x.reason]||x.reason)+' ('+x.impressions+' impressions, position '+x.position+')',ex)});
    }
    if(sc.rule)node('small',sc.rule,beyond);
   }
   if(fn){
    node('h3','From information to action',beyond);
    if(fn.for_url){var fu=node('p','For the page that answers this search: ',beyond);link(fn.for_url,fn.for_url,fu)}
    if(fn.status==='FUNNEL_PROPOSAL'){
     var steps=(fn.stages||[]),actionStages=steps.filter(function(st){return st.stage!=='INFORMATION'});
     actionStages.forEach(function(st){
      addAction('Review a relevant next step',String(st.role||st.url||'Relevant page'),
       ['Destination: '+String(st.url||'Not established'),'Topic match: '+String(st.topic_match||'Not established'),
        st.link&&st.link.status==='LINK_CANDIDATE_FOR_REVIEW'?'Suggested context: '+String(st.link.under_heading||'')+' — anchor: '+String(st.link.anchor_text||''):String(st.link&&st.link.action||'Verify a contextual link before editing.'),
        'The informational answer must remain complete; no promotional claims are added.']);
     });
     var rules=node('details',null,beyond);node('summary','Editorial safeguards',rules);
     (fn.rules||[]).forEach(function(rule){node('p',rule,rules)});
    }else node('p',String(fn.note||fn.status),beyond);
   }
   if(actions.length)refreshActions();
   else node('p','No actionable evidence-backed opportunities were found for this page.',beyond);
  }
  researchDetails=node('details',null,container);
  node('summary','Show full technical evidence, Search and AI observations',researchDetails);
  s=section('Automatic research evidence');
  var summary=d.summary||{};
  node('p','Primary page: '+String(summary.primary_source||'UNKNOWN')+
   ' · Checked: '+(summary.live_retrieved_at||'saved snapshot only')+
   ' · Observed competitors: '+(summary.competitors_live_reviewed??0),s);
  node('p','Case Study: '+(d.case_study_locked?'Protected — research only; no publishing':'Research / editor review permitted'),s);
  if(d.evidence_warnings&&d.evidence_warnings.length)node('small','Evidence warnings: '+d.evidence_warnings.join('; '),s);
  s=section('Page analysis — observed facts');
  var sig=d.page_content?.signals||{},headings=d.page_content?.headings||{};
  if(sig.available){
   table(['Signal','Observation'],[
    ['Title',headings.title||'Not found in inspected HTML'],
    ['Meta description',headings.description||'Not found in inspected HTML'],
    ['H1 / H2 counts',(sig.h1_count_observed??'Unknown')+' / '+(sig.h2_count_observed??'Unknown')],
    ['Canonical / noindex',(sig.canonical_tag_observed?'canonical observed':'canonical not observed')+'; '+(sig.noindex_directive_observed?'noindex observed':'noindex not observed')],
    ['Internal / external links',(sig.internal_links_observed??'Unknown')+' / '+(sig.external_links_observed??'Unknown')],
    ['Images missing alt',(sig.images_missing_alt_observed??'Unknown')+' of '+(sig.images_observed??'Unknown')],
    ['Approx. excerpt words',sig.approx_excerpt_words]
   ],s);
   node('h3','Existing section headings',s);list(headings.h2||[],s,x=>x);
  }else node('p','Live page and saved HTML are unavailable. No page structure conclusions are being invented.',s);
  node('small',sig.caution||'Page evidence is source-specific, not guaranteed current.',s);
  s=section('Google Search Intelligence');
  var search=d.search||{},qs=search.verified_queries||[];
  node('p','Working topic: '+(search.focus_query||'Unknown')+' · '+(qs.length?'Exact-page GSC records available':'GSC is optional; query clicks and rankings are UNKNOWN'),s);
  if(qs.length)table(['Verified query','Clicks','Impressions','Average position'],qs.map(q=>[q.query,q.clicks,q.impressions,q.position]),s);
  if(search.observed_opportunities?.length){
   node('h3','Evidence-based opportunities',s);
   list(search.observed_opportunities,s,x=>x.type+': '+x.evidence+' — '+x.next_action);
  }
  s=section('Search intent and internal site architecture');
  var intent=search.intent||{};
  node('p','Detected intent: '+(intent.intent||'UNKNOWN')+' — heuristic; verify the actual SERP before editing.',s);
  node('p','Recommended page response: '+(intent.suggested_page_action||'Verify search intent'),s);
  var graph=d.site_architecture||{};
  node('h3','Relevant existing pages — contextual internal link candidates',s);
  var links=graph.candidates||[];
  if(!links.length)node('p','No grounded related-page recommendation found in the available Tracker inventory.',s);
  links.forEach(x=>{var block=node('div',null,s);link(x.url,x.url,block);
   node('small','Shared topic terms: '+(x.overlapping_terms||[]).join(', ')+'. '+x.action,block)});
  node('h3','Possible overlapping intent — not confirmed cannibalization',s);
  var overlaps=graph.intent_overlap_risks||[];
  if(!overlaps.length)node('p','No strong keyword overlap identified in the available inventory.',s);
  overlaps.forEach(x=>{var block=node('div',null,s);link(x.url,x.url,block);
   node('small','Shared keyword: '+(x.keyword||'Unknown')+' · Manual SERP/page-intent confirmation required',block)});
  s=section('Search and AI competitor research');
  var competitors=d.competitors||{};
  node('p','Historical search results: '+(competitors.snapshot_checked_at||'No snapshot timestamp')+
   ' · showing '+(competitors.leads||[]).length+' of '+(competitors.total_leads??(competitors.leads||[]).length)+' competitor leads · '+(competitors.live_reviewed||[]).length+' inspected HTML documents',s);
  if(competitors.excluded_unaligned_topics)node('small',competitors.excluded_unaligned_topics+' competitor headings excluded: they do not match this page subject.',s);
  var leads=competitors.leads||[];
  var ul=node('ul',null,s);
  leads.forEach(x=>{var li=node('li',x.source+' · '+(x.serp_title||'Observed URL')+' · ',ul);link(x.url,x.url,li)});
  var live=competitors.live_reviewed||[];
  if(live.length){
   node('h3','Automatically inspected public competitor pages',s);
   live.forEach(x=>{var block=node('div',null,s);link(x.url,x.title||x.url,block);
    node('small','Read at '+(x.retrieved_at||'unknown')+' · observed H1: '+(x.h1||[]).join(' / '),block);
    node('small','Observed H2: '+(x.h2||[]).slice(0,6).join(' · '),block)});
  }
  node('h3','Candidate differences — confirm before editing',s);
  list(competitors.topic_candidates||[],s,x=>x.heading+' — source: '+x.source_url+' (not a proven content gap)');
  var ai=d.ai_visibility||{};
  node('h3','Saved AI visibility observations (not a new automated AI test)',s);
  list(ai.engines||[],s,e=>e.engine+' ('+(e.method==='manual'?'collected by hand, not an automatic check':(e.method||'historical'))+'): recommended '+(e.recommended?'Yes':'Not observed')+
   '; domain cited '+(e.domain_cited?'Yes':'Not observed')+
   '; exact page cited '+(e.exact_page_cited?'Yes':'Not observed')+
   '; checked '+(e.verified_at||'date unknown')+(e.relevance?' — '+e.relevance.text+(e.relevance.usable?'':' Not used for this research.'):''));
  if(ai.relevance_note)node('p',ai.relevance_note,s);
  var past=d.previous_brief||{};
  if(past.status==='HISTORICAL_BRIEF_NOT_CURRENT_LIVE_EVIDENCE'){
   s=section('Previously saved Tracker Brief — historical context');
   node('p','Generated: '+(past.generated_at||'date unknown')+' · '+
    (past.implementation_complete?'Previously completed cycle':'Completion is not assumed')+
    ' · historical recommendations are NOT new publication tasks.',s);
   node('small',past.warning,s);
   node('h3','Previous AI/content recommendations',s);
   list(past.items||[],s,x=>x.priority+' · '+x.title+' — '+x.action);
   node('h3','Previous GSC/SEO recommendations',s);
   list(past.gsc_items||[],s,x=>x.priority+' · '+x.title+' — '+x.action);
  }
  s=section('Prioritized, source-grounded improvement decisions');
  var findings=d.findings||[];
  list(findings,s,f=>f.priority+' · '+f.code+': '+f.action+' (basis: '+f.evidence+')');
  s=section('Editor-ready Growth plan — preserve the original URL');
  var draft=d.editorial||{};
  node('p','Search intent candidate: '+(draft.focus_query?.text||'Unknown')+
   ' · Evidence: '+(draft.focus_query?.status||'UNVERIFIED'),s);
  if(draft.suggested_title_if_missing)node('p','Title to review: '+draft.suggested_title_if_missing,s);
  node('h3','Proposed sections from observed sources',s);
  list(draft.candidate_sections||[],s,x=>x.proposed_topic+' — inspect: '+x.derived_from+'; facts and originality require review');
  node('p','Next action: review the ranked findings, compare source evidence, and prepare the verified content on the existing page. No unsupported competitor claims, auto-publishing or artificial click forecasts.',s);
  if(d.case_study_locked)node('p','Active Case Study protection: DO NOT implement changes during the locked measurement cycle.',s);
  document.getElementById('downloadResearch').hidden=false;
  document.getElementById('researchStatus').textContent=
   d.report_completion?.owner_only?
    'Owner Growth report · editorial draft: '+String(d.editorial_review_draft?.status||'UNKNOWN')+
     ' · no automatic publication.':
   d.editorial_review_draft?.status==='PREPARING'?
    'Automatic research complete · preparing owner-only editorial review draft (NOT publishing)…':
    'Research-only report · a full editorial draft requires the Tracker owner link.';
 }
 // A checked edit proposal is stored for the page that should change (not this research page): the CMS package opens there.
 function pointHandoff(r){
  var a=document.getElementById('growthEditorHandoff'),h=r&&r.cms_handoff;
  if(!a||!h||typeof h.url!=='string'||h.url.indexOf('/track/')!==0)return;
  a.href=h.url;a.textContent='Prepare the CMS package with the checked Growth text';
 }
 // While the research runs, the optional AI check for the page's keyword (no research is started for it).
 async function showAiEarly(){
  var early=document.getElementById('growthAiEarly');if(!early||early.childNodes.length)return;
  try{var r=await fetch('/api/tracker-client/'+encodeURIComponent(token)+'/growth/ai-check?page_id='+encodeURIComponent(id)+runParams,{credentials:'same-origin',cache:'no-store'});
   var j=await r.json();if(!j.success||!j.ai_check||container.childNodes.length)return;
   var box=node('section',null,early);node('h2','AI answers for “'+j.ai_check.search_term+'” — optional',box);
   renderAiCheck(box,{ai_check:j.ai_check});
  }catch(e){}
 }
 async function run(){
  var status=document.getElementById('researchStatus');
  status.className='';status.textContent=(runMarket||runQuery?'This run, chosen by the Opportunity Finder: '+(runQuery?'“'+runQuery+'”':'')+(runMarket?' in '+runMarket.toUpperCase():'')+' (your page setting is not changed). ':'')+'Analyzing the page, Search Console queries and the ranking pages… AI answers are optional: you can paste them below while this runs.';
  showAiEarly();
  document.getElementById('retryResearch').disabled=true;
  try{
   var owner=main.getAttribute('data-owner-draft')==='true';
   var completeEndpoint='/api/tracker-client/'+encodeURIComponent(token)+
    '/growth/auto-research/complete?page_id='+encodeURIComponent(id)+runParams;
   var response=await fetch(owner?completeEndpoint:endpoint,{
    method:owner?'POST':'GET',credentials:'same-origin',cache:'no-store',
    ...(owner?{headers:{'Content-Type':'application/json'},body:JSON.stringify({page_id:Number(id),write:false})}:{})
   });
   var result=await response.json();
   if(!response.ok||result.success!==true)throw Error(result.code||'Research unavailable');
   last=result;render(result);pointHandoff(result);
  }catch(e){status.textContent='Research could not complete: '+String(e.message||e);status.className='error';
   document.getElementById('retryResearch').hidden=false
  }finally{document.getElementById('retryResearch').disabled=false}
 }
 document.getElementById('retryResearch').addEventListener('click',run);
 // Market save is isolated in /growth-market-controls.js so a report-rendering failure cannot disable it.
 document.getElementById('downloadResearch').addEventListener('click',function(){
  if(!last)return;
  var blob=new Blob([JSON.stringify(last,null,2)],{type:'application/json'});
  var href=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=href;a.download=main.getAttribute('data-owner-draft')==='true'?
   'contentscale-growth-complete-review.json':'contentscale-growth-research-only.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(href),2000);
 });
 run();
})();