(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const token=String(location.pathname.split('/')[2]||'');
 const pageId=Number(new URLSearchParams(location.search).get('page_id'));
 const base='/api/tracker-client/'+encodeURIComponent(token)+'/growth/cms-export';
 const safe={source:null,proposal:null};
 $('backToGrowth').href='/track/'+encodeURIComponent(token)+'/growth';
 $('researchReviewLink').href='/track/'+encodeURIComponent(token)+'/growth/auto-research?page_id='+encodeURIComponent(pageId);
 function status(id,msg,error){
  const el=$(id);el.textContent=msg;el.style.color=error?'#b91c1c':'#166534';
 }
 function ready(){
  var hasManual=safe.source&&safe.source.manual_source_required;
  var manualReady=!hasManual||($('manualAcknowledged').checked&&$('manualOriginalHtml').value.trim().length>=120);
  var factsChecked=[...document.querySelectorAll('.fact-item')].every(x=>x.checked);
  $('download').disabled=!(safe.source&&$('approved').checked&&manualReady&&factsChecked);
 }
 // Placement of a section on the existing page: proposed by Growth, adjustable by the owner, never guessed.
 function placementSelect(p){
  var label=document.createElement('label');label.textContent='Where on the page';
  var sel=document.createElement('select');sel.className='placement';sel.dataset.heading=p.section_heading;
  [['ADD_AFTER_SECTION','As a new section after “'+p.section_heading+'”'],['EXTEND_SECTION','Inside the existing section “'+p.section_heading+'”'],['','Let the editor choose a suitable position']]
   .forEach(function(o){var opt=document.createElement('option');opt.value=o[0];opt.textContent=o[1];sel.appendChild(opt)});
  sel.value=p.mode;label.appendChild(sel);return label;
 }
 function placementOf(container){
  var sel=container&&container.querySelector('select.placement');
  return sel&&sel.value?{mode:sel.value,section_heading:sel.dataset.heading}:null;
 }
 function addSection(h2,text,legendText,placement){
  var group=document.createElement('fieldset');group.dataset.growthDraftSection='1';
  var legend=document.createElement('legend');legend.textContent=legendText;group.appendChild(legend);
  if(placement)group.appendChild(placementSelect(placement));
  var title=document.createElement('input');title.className='draft-h2';title.value=h2;title.setAttribute('aria-label','Reviewed H2: '+legendText);group.appendChild(title);
  var body=document.createElement('textarea');body.className='draft-copy';body.value=text;body.setAttribute('aria-label','Reviewed copy: '+legendText);group.appendChild(body);
  $('growthAdditionalSections').appendChild(group);
 }
 // The checked Growth proposal for this page is used as-is: same H2s, text, placement and fact-check list.
 async function loadProposal(src){
  try{
   var res=await fetch(base+'/proposal?page_id='+encodeURIComponent(pageId),{cache:'no-store',credentials:'same-origin'});
   var d=await res.json();
   if(!res.ok||d.success!==true||!d.proposal||!(d.proposal.sections||[]).length||safe.source!==src)return;
   if($('heading').value.trim()||$('copy').value.trim()||document.querySelector('[data-growth-draft-section]'))return;
   var p=d.proposal,first=p.sections[0];
   safe.proposal=p;
   $('heading').value=first.h2;$('copy').value=first.text;
   $('mainPlacement').textContent='';if(first.placement)$('mainPlacement').appendChild(placementSelect(first.placement));
   p.sections.slice(1,5).forEach(function(x,i){addSection(x.h2,x.text,'Growth proposal section '+(i+2),x.placement)});
   if(!$('query').value&&p.focus_query)$('query').value=p.focus_query;
   var box=$('growthProposal');box.textContent='';box.hidden=false;
   var h=document.createElement('strong');h.textContent='Checked Growth proposal #'+p.id+' · '+String(p.created_at||'').slice(0,10);box.appendChild(h);
   var intro=document.createElement('p');
   intro.textContent='This is the text Growth checked against the ranking pages'+(p.focus_query?' for “'+p.focus_query+'”':'')+'. You may still edit it; the package records whether you did. Nothing is published.';
   var scope=document.createElement('p');scope.className='small';
   scope.textContent='Checked automatically: it teaches the missing reader task, does not repeat your page or copy competitors, and has no unsourced figures, named sources or promises. Not checked: whether the statements are true. That is your review below; this is not a fact-checked or publication-approved text.';
   box.appendChild(intro);box.appendChild(scope);
   if(p.evidence_label){var ev=document.createElement('p');ev.className='small';ev.textContent='Evidence: '+p.evidence_label;box.appendChild(ev)}
   if(p.intent_note){var inote=document.createElement('p');inote.className='small';inote.textContent=p.intent_note;box.appendChild(inote)}
   var r=p.review||{},groups=[['flagged_text','Flagged by Growth: rewrite or remove these sentences (the package is refused while one is still in your text)'],['needs_fact_check','Check that these sentences are true'],['needs_owner_confirmation','Confirm with the business'],['needs_safety_review','Safety review by a qualified professional']];
   r.flagged_text=(r.flagged||[]).map(function(f){return (f.sentence?'“'+f.sentence+'”':'Section “'+f.h2+'”')+' — '+f.reason});
   var seen=new Set();
   groups.forEach(function(g){
    // One tick per sentence, under the first (strictest-listed) check that names it.
    var items=(r[g[0]]||[]).filter(function(x){if(seen.has(x))return false;seen.add(x);return true});if(!items.length)return;
    var t=document.createElement('p');t.textContent=g[1]+' (tick each one before downloading):';box.appendChild(t);
    items.forEach(function(item){
     var l=document.createElement('label');l.className='check';
     var c=document.createElement('input');c.type='checkbox';c.className='fact-item';c.addEventListener('change',ready);
     var sp=document.createElement('span');sp.textContent=item;l.appendChild(c);l.appendChild(sp);box.appendChild(l);
    });
   });
   if((r.competitor_sources||[]).length){
    var cs=document.createElement('p');cs.className='small';
    cs.textContent='Compared with: '+r.competitor_sources.map(x=>x.url).join(' · ');box.appendChild(cs);
   }
   $('approved').checked=false;ready();
  }catch(e){/* no proposal: manual or AI-assisted text stays available */}
 }
 function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 async function loadResearchSuggestions(src){
  var target=$('growthResearchHints');
  try{
   var url='/api/tracker-client/'+encodeURIComponent(token)+'/growth/auto-research?page_id='+encodeURIComponent(pageId);
   var res=await fetch(url,{cache:'no-store',credentials:'same-origin'});
   if(!res.ok)throw Error('Research unavailable');
   var d=await res.json(),x=d.handoff_suggestions||{};
   if(d.success!==true||Number(d.page_id)!==pageId||d.url!==src.canonical_url||x.safe!==true)throw Error('Source identity changed');
   if(d.competitor_overview&&typeof window.renderGrowthCompetitorOverview==='function'){var ov=$('growthCompetitorOverview');ov.textContent='';try{ov.hidden=!window.renderGrowthCompetitorOverview(d.competitor_overview,ov)}catch(e){ov.hidden=true}}
   if(!$('query').value&&x.query)$('query').value=x.query;
   if(!$('title').value&&x.title)$('title').value=x.title;
   if(!$('meta').value&&x.meta)$('meta').value=x.meta;
   if(x.verified_query&&$('evidence').value==='needs_access')$('evidence').value='verified';
   else if(x.source_type!=='NO_PAGE_HTML'&&$('evidence').value==='needs_access')$('evidence').value='observed';
   target.hidden=false;target.textContent='';
   var label=document.createElement('strong');label.textContent='Automatic Growth research: editor review';target.appendChild(label);
   var note=document.createElement('p');
   note.textContent='Existing metadata and observed exact-page evidence were copied where available. New facts, content and publication approval are never invented.';
   target.appendChild(note);
   for(var item of (x.findings||[]).slice(0,5)){
    var p=document.createElement('p');p.textContent=item.priority+' · '+item.action;target.appendChild(p);
   }
   if(x.candidate_headings?.length){
    var topics=document.createElement('p');
    topics.textContent='Topics observed in competitor pages (NOT verified page gaps): '+x.candidate_headings.slice(0,3).map(a=>a.text).join(' · ');
    target.appendChild(topics);
   }
   if(x.internal_url){
    var use=document.createElement('button');use.type='button';
    use.textContent='Review contextual same-site link';
    use.addEventListener('click',function(){
     if(!$('linkUrl').value)$('linkUrl').value=x.internal_url;
     if(!$('linkText').value&&x.internal_label)$('linkText').value=x.internal_label;
     var caution=document.createElement('p');
     caution.textContent='Verify the destination and context before approving the handoff.';
     target.appendChild(caution);
    });
    target.appendChild(use);
   }
   if(!x.meta||!x.title){
    var missing=document.createElement('p');
    missing.textContent='Missing SEO metadata requires an editor-written, source-checked proposal.';
    target.appendChild(missing);
   }
   ready();
  }catch(e){target.hidden=false;target.textContent='Research could not be loaded. Manual review stays available without GSC.';}
 }
 if(!Number.isSafeInteger(pageId)||pageId<1){
  status('sourceStatus','A valid tracked page ID is required. Return to Growth and select a page.',true);
  $('checkSource').disabled=true;
 }
 $('approved').addEventListener('change',ready);
 $('manualAcknowledged').addEventListener('change',ready);
 $('manualOriginalHtml').addEventListener('input',ready);
 $('checkSource').addEventListener('click',async function(){
  this.disabled=true;safe.source=null;ready();status('sourceStatus','Checking the saved original page…',false);
  try{
   const response=await fetch(base+'/source?page_id='+encodeURIComponent(pageId),{cache:'no-store',credentials:'same-origin'});
   const data=await response.json();
   if(!response.ok||!data.success)throw Error(data.code||'Source unavailable');
   safe.source=data;
   void loadResearchSuggestions(data);
   void loadProposal(data);
   $('generateEditorialDraft').disabled=false;
   var needsManual=data.manual_source_required===true;
   $('manualSourceWrap').hidden=!needsManual;
   $('canonicalUrl').textContent='Original URL: '+data.canonical_url+
    (needsManual?' · No saved page HTML — manually supply unverified original source.':
     ' · revision fingerprint saved · nothing was changed.');
   if(!$('query').value) $('query').value=data.working_keyword||'';
   if(needsManual){
    status('sourceStatus','No saved Tracker HTML. Retrieving public original URL automatically…',false);
    try{
     const liveResponse=await fetch(base+'/public-source?page_id='+encodeURIComponent(pageId),
      {cache:'no-store',credentials:'same-origin'});
     const liveData=await liveResponse.json();
     if(!liveResponse.ok||liveData.success!==true)throw Error(liveData.code||'Public HTML unavailable');
     $('manualOriginalHtml').value=liveData.html;
     const title=/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(liveData.html);
     if(title&&!$('title').value)$('title').value=title[1].replace(/<[^>]*>/g,' ').trim().slice(0,100);
     const desc=(liveData.html.match(/<meta\b[^>]*>/gi)||[]).find(x=>/\bname\s*=\s*["']description["']/i.test(x));
     const meta=desc&&/\bcontent\s*=\s*["']([^"']+)["']/i.exec(desc);
     if(meta&&!$('meta').value)$('meta').value=meta[1].slice(0,220);
     $('canonicalUrl').textContent='Original URL: '+data.canonical_url+
      ' · public HTML retrieved '+(liveData.retrieved_at||'')+
      ' · not browser-rendered, not saved, publication still needs editor approval.';
     status('sourceStatus','Original public page fetched. Review the HTML and approve its historical, unverified source status before creating the package.',false);
    }catch(err){
     status('sourceStatus','Public URL could not be read automatically ('+
      String(err.message||'Unavailable')+'). Paste the original HTML manually to continue.',true);
    }
   }else{
    status('sourceStatus','Saved original Tracker source verified. Review content before preparing the handoff.',false);
   }
  }catch(err){status('sourceStatus',err.message||'Could not verify original source',true)}
  finally{this.disabled=false;ready()}
 });
 $('generateEditorialDraft').addEventListener('click',async function(){
  if(!safe.source)return;
  var btn=this;btn.disabled=true;status('aiDraftStatus','Preparing a source-bounded editorial draft…',false);
  try{
   var r=await fetch(base+'/editor-draft',{method:'POST',credentials:'same-origin',
    cache:'no-store',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({page_id:pageId,focus_query:$('query').value.trim()})});
   var output=await r.json();
   if(!r.ok||output.success!==true)throw Error(output.code||'Draft not available');
   if(output.status!=='AI_DRAFT_REVIEW_REQUIRED'||!output.draft){
    status('aiDraftStatus','AI is optional: '+(output.status||'Unconfigured')+'. You can continue with the regular reviewed CMS handoff.',true);
    return;
   }
   if(output.canonical_url!==safe.source.canonical_url||Number(output.page_id)!==pageId)
    throw Error('Source identity changed');
   var draft=output.draft;
   if(draft.seo_title)$('title').value=draft.seo_title;
   if(draft.meta_description)$('meta').value=draft.meta_description;
   var parts=draft.sections||[];
   if(parts.length){
    $('heading').value=parts[0].h2;
    $('copy').value=(parts[0].paragraphs||[]).join('\n\n');
   }
   // An AI draft replaces the checked Growth proposal; the package then no longer claims to come from it.
   safe.proposal=null;$('growthProposal').hidden=true;$('growthProposal').textContent='';$('mainPlacement').textContent='';
   $('growthAdditionalSections').textContent='';
   parts.slice(1,5).forEach(function(section,i){addSection(section.h2,(section.paragraphs||[]).join('\n\n'),'AI draft section '+(i+2)+' · verify facts',null)});
   $('approved').checked=false;ready();
   status('aiDraftStatus','Editable AI draft prepared from the original page. All claims and each section still require your review and explicit approval.',false);
  }catch(err){status('aiDraftStatus',String(err.message||err),true)}
  finally{btn.disabled=!safe.source}
 });
 function build(){
  const src=safe.source;if(!src)throw Error('Check the saved original page first');
  if(!$('approved').checked)throw Error('Editorial approval is required');
  const heading=$('heading').value.trim(),copy=$('copy').value.trim();
  if(!heading||copy.length<30)throw Error('Provide a useful H2 and at least 30 characters of approved copy');
  const link=$('linkUrl').value.trim(),label=$('linkText').value.trim();
  let linkHtml='';
  if(link){
   const target=new URL(link),home=new URL(src.canonical_url);
   if(target.protocol!=='https:'||target.origin!==home.origin||!label)
    throw Error('Use a working HTTPS internal link on the same website with descriptive text');
   linkHtml='<p><a href="'+esc(link)+'">'+esc(label)+'</a></p>';
  }
  const paragraphs=copy.split(/\n\s*\n/).filter(Boolean).map(t=>'<p>'+esc(t.trim()).replace(/\n/g,' ')+'</p>').join('\n');
  const html='<section><h2>'+esc(heading)+'</h2>'+paragraphs+linkHtml+'</section>';
  const proposal=safe.proposal;
  const reviewedSections=[{approved:true,evidence_ref:proposal?'growth_proposal:'+proposal.id:'editor_reviewed:'+($('query').value.trim()||'original_page'),
   html,placement:placementOf($('mainPlacement'))}];
  document.querySelectorAll('[data-growth-draft-section]').forEach(function(group){
   var h2=group.querySelector('.draft-h2')?.value.trim()||'';
   var body=group.querySelector('.draft-copy')?.value.trim()||'';
   if(!h2||body.length<30)throw Error('Review every AI section or remove empty suggestions');
   var markup='<section><h2>'+esc(h2)+'</h2>'+body.split(/\n\s*\n/).filter(Boolean).map(t=>'<p>'+esc(t.trim()).replace(/\n/g,' ')+'</p>').join('\n')+'</section>';
   reviewedSections.push({approved:true,evidence_ref:proposal?'growth_proposal:'+proposal.id:'editor_reviewed:AI_source_review',html:markup,placement:placementOf(group)});
  });
  var manual=src.manual_source_required===true;
  if(manual&&(!$('manualAcknowledged').checked||$('manualOriginalHtml').value.trim().length<120))
   throw Error('Provide historical original-page HTML and acknowledge that it is not live-verified');
  return {page_id:pageId,source_sha256:src.source_sha256,editor_approved:true,
   ...(manual?{original_html_override:$('manualOriginalHtml').value,
    manual_source_acknowledged:true,source_provenance:'OWNER_SUPPLIED_UNVERIFIED'}:{}),
   cms:$('cms').value,evidence_scope:$('evidence').value,focus_query:$('query').value.trim(),
   seo_title:$('title').value.trim(),meta_description:$('meta').value.trim(),
   ...(proposal?{growth_proposal_id:proposal.id,review_notes:proposal.review||null}:{}),
   approved_changes:reviewedSections};
 }
 async function post(body,format){
  const response=await fetch(base,{method:'POST',cache:'no-store',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,format})});
  if(!response.ok){const d=await response.json().catch(()=>({}));
   // Flagged content still in the text: name each sentence so the editor knows exactly what to rewrite or remove.
   if((d.blocked_details||[]).length)throw Error('Not packaged — still in your text: '+d.blocked_details.map(function(b){return (b.sentence?'“'+b.sentence+'”':'')+' ('+b.reason+')'}).join(' · '));
   throw Error((d.issues||[]).join(', ')||d.code||'Export failed')}
  return format==='zip'?response.blob():response.json();
 }
 $('handoffForm').addEventListener('submit',async function(ev){
  ev.preventDefault();const btn=$('download');btn.disabled=true;
  status('downloadStatus','Validating evidence and approved content…',false);
  try{
   const payload=build();
   const preview=await post(payload,'json');
   if(!preview.success||preview.manifest?.publication_allowed!==false)throw Error('Editor safety check failed');
   const zip=await post(payload,'zip');
   const file=new Blob([zip],{type:'application/zip'});
   const href=URL.createObjectURL(file),a=document.createElement('a');
   a.href=href;a.download='contentscale-growth-cms-neutral.zip';document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(href),3000);
   status('downloadStatus','ZIP ready. No site change or publication performed.'+
    (preview.manifest?.growth_proposal?(preview.manifest.growth_proposal.editor_changed_text?' The text differs from Growth proposal #'+preview.manifest.growth_proposal.id+' (recorded in the package).':' Text exactly as in Growth proposal #'+preview.manifest.growth_proposal.id+'.'):'')+
    ((preview.warnings||[]).length?' Review: '+preview.warnings.join(', '):''),false);
   showPublicationForm(payload);
  }catch(err){status('downloadStatus',err.message||'Download failed',true)}
  finally{ready()}
 });
 // Only after the package exists: the owner records when the editor actually published it (starts the 28-day measurement).
 function showPublicationForm(payload){
  safe.published={page_id:pageId,query:payload.focus_query,growth_proposal_id:payload.growth_proposal_id};
  var heads=payload.approved_changes.map(c=>(/<h2>([\s\S]*?)<\/h2>/.exec(c.html)||[])[1]).filter(Boolean).map(h=>h.replace(/&[^;]+;/g,' ').trim());
  if(!$('publicationNotes').value)$('publicationNotes').value='Added to '+safe.source.canonical_url+': '+heads.join('; ')+(payload.growth_proposal_id?' (Growth proposal #'+payload.growth_proposal_id+')':'');
  $('publicationWrap').hidden=false;
 }
 $('publicationForm').addEventListener('submit',async function(ev){
  ev.preventDefault();var btn=$('recordPublication');btn.disabled=true;
  try{
   if(!safe.published)throw Error('Download the reviewed package first');
   if(!safe.published.query)throw Error('A working query is required to measure the change');
   var at=new Date($('publishedAt').value);if(!Number.isFinite(at.getTime()))throw Error('Enter the actual publication date and time');
   var r=await fetch('/api/tracker-client/'+encodeURIComponent(token)+'/growth/publication',{method:'POST',cache:'no-store',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({...safe.published,notes:$('publicationNotes').value.trim(),published_at:at.toISOString()})});
   var d=await r.json();
   if(!r.ok||d.success!==true)throw Error(d.error||'Not saved');
   status('publicationStatus',d.gsc_evidence==='VERIFIED'?'Recorded. Measurement compares the 28 days before and after publication with Search Console data.':
    'Recorded. Without Search Console access the result is not measured yet: add the 28-day before/after numbers from Search Console on the measurement page.',false);
  }catch(err){status('publicationStatus',err.message||'Not saved',true)}
  finally{btn.disabled=false}
 });
 // Direct from Growth: verify owner, source and research automatically; never approve or publish.
 if(Number.isSafeInteger(pageId)&&pageId>0)Promise.resolve().then(()=>{if(!$('checkSource').disabled)$('checkSource').click()});
})();