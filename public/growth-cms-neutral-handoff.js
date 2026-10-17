(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const token=String(location.pathname.split('/')[2]||'');
 const pageId=Number(new URLSearchParams(location.search).get('page_id'));
 const base='/api/tracker-client/'+encodeURIComponent(token)+'/growth/cms-export';
 const safe={source:null};
 $('backToGrowth').href='/track/'+encodeURIComponent(token)+'/growth';
 $('researchReviewLink').href='/track/'+encodeURIComponent(token)+'/growth/auto-research?page_id='+encodeURIComponent(pageId);
 function status(id,msg,error){
  const el=$(id);el.textContent=msg;el.style.color=error?'#b91c1c':'#166534';
 }
 function ready(){
  var hasManual=safe.source&&safe.source.manual_source_required;
  var manualReady=!hasManual||($('manualAcknowledged').checked&&$('manualOriginalHtml').value.trim().length>=120);
  $('download').disabled=!(safe.source&&$('approved').checked&&manualReady);
 }
 function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 async function loadResearchSuggestions(src){
  var target=$('growthResearchHints');
  try{
   var url='/api/tracker-client/'+encodeURIComponent(token)+'/growth/auto-research?page_id='+encodeURIComponent(pageId);
   var res=await fetch(url,{cache:'no-store',credentials:'same-origin'});
   if(!res.ok)throw Error('Research unavailable');
   var d=await res.json(),x=d.handoff_suggestions||{};
   if(d.success!==true||d.page_id!==pageId||d.url!==src.canonical_url||x.safe!==true)throw Error('Source identity changed');
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
  var manual=src.manual_source_required===true;
  if(manual&&(!$('manualAcknowledged').checked||$('manualOriginalHtml').value.trim().length<120))
   throw Error('Provide historical original-page HTML and acknowledge that it is not live-verified');
  return {page_id:pageId,source_sha256:src.source_sha256,editor_approved:true,
   ...(manual?{original_html_override:$('manualOriginalHtml').value,
    manual_source_acknowledged:true,source_provenance:'OWNER_SUPPLIED_UNVERIFIED'}:{}),
   cms:$('cms').value,evidence_scope:$('evidence').value,focus_query:$('query').value.trim(),
   seo_title:$('title').value.trim(),meta_description:$('meta').value.trim(),
   approved_changes:[{approved:true,evidence_ref:($('evidence').value==='verified'?'gsc:':'editor_reviewed:')+($('query').value.trim()||'original_page'),html}]};
 }
 async function post(body,format){
  const response=await fetch(base,{method:'POST',cache:'no-store',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,format})});
  if(!response.ok){const d=await response.json().catch(()=>({}));throw Error((d.issues||[]).join(', ')||d.code||'Export failed')}
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
    ((preview.warnings||[]).length?' Review: '+preview.warnings.join(', '):''),false);
  }catch(err){status('downloadStatus',err.message||'Download failed',true)}
  finally{ready()}
 });
})();