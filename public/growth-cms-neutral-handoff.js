(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const token=String(location.pathname.split('/')[2]||'');
 const pageId=Number(new URLSearchParams(location.search).get('page_id'));
 const base='/api/tracker-client/'+encodeURIComponent(token)+'/growth/cms-export';
 const safe={source:null};
 $('backToGrowth').href='/track/'+encodeURIComponent(token)+'/growth';
 function status(id,msg,error){
  const el=$(id);el.textContent=msg;el.style.color=error?'#b91c1c':'#166534';
 }
 function ready(){
  var hasManual=safe.source&&safe.source.manual_source_required;
  var manualReady=!hasManual||($('manualAcknowledged').checked&&$('manualOriginalHtml').value.trim().length>=120);
  $('download').disabled=!(safe.source&&$('approved').checked&&manualReady);
 }
 function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
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