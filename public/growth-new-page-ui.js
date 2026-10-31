// Growth for a new page (from a Pre-Write brief): runs the research, shows the overlap check with tracked pages, the
// research per market and the same checklist as the existing-page research. Report data is rendered with textContent.
(function(){
 'use strict';
 var status=document.getElementById('newPageStatus'),out=document.getElementById('newPageReport');
 function el(tag,text,parent,cls){var n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;if(parent)parent.appendChild(n);return n}
 function post(url,body){return fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json()})}
 var box=document.getElementById('marketSetting');
 if(box){var save=document.getElementById('marketSave'),said=document.getElementById('marketSaid');
  save.addEventListener('click',async function(){save.disabled=true;said.textContent='Saving…';
   try{var j=await post(box.getAttribute('data-url'),{brief_id:Number(box.getAttribute('data-brief-id')),countries:document.getElementById('marketInput').value,language:document.getElementById('marketLanguage').value});
    if(!j.success){said.textContent='Not saved: '+(j.code==='UNKNOWN_COUNTRY'?'choose markets like nl — Netherlands, separated by commas':j.code==='UNKNOWN_LANGUAGE'?'choose a language like Dutch':j.code);return}
    said.textContent='Saved. Running the research again…';location.reload();
   }catch(e){said.textContent='Not saved.'}finally{save.disabled=false}});
 }
 if(!status||!out)return;
 var last=null;
 async function run(){
  status.className='';status.textContent='Researching the ranking pages for this keyword…';
  try{
   var d=await post(status.getAttribute('data-research-url'),{brief_id:Number(status.getAttribute('data-brief-id'))});
   if(!d||d.success!==true)throw Error(d&&d.code||'Research unavailable');
   last=d;render(d);
  }catch(e){status.className='error';status.textContent='Research could not complete: '+String(e.message||e)}
 }
 function render(d){
  out.textContent='';var r=d.new_page_research||{},disc=d.search_discovery||{},gl=d.gap_list||{};
  status.textContent='Research for a new page · '+((gl.items||[]).length)+' topic(s) and element(s) from '+(gl.ranking_pages_read||0)+' readable ranking page(s). Nothing is published.';
  var dl=document.getElementById('newPageDownload');if(dl){dl.hidden=false;dl.onclick=function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json'}));a.download='contentscale-growth-new-page-research.json';document.body.appendChild(a);a.click();a.remove()}}
  var s=el('section',null,out);el('h2','Does a page for this already exist?',s);
  var ov=r.overlap||{};el('p',ov.note||'',s,ov.status==='EXISTING_PAGE_TARGETS_THIS_KEYWORD'?'error':'');
  (ov.exact||[]).concat(ov.possible||[]).forEach(function(p){var row=el('p',null,s);var a=el('a',p.url,row);a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';if(p.keyword)el('small','Tracked keyword: '+p.keyword,row)});
  if(r.planned_url)el('p','Planned URL: '+r.planned_url+(r.planned_url_taken?' — already a tracked URL: choose another one.':' (you can choose another one when publishing)'),s,r.planned_url_taken?'error':'');
  var cov=disc.market_coverage||{},loc=disc.search_locale||{};
  var m=el('section',null,out);el('h2','Research per market',m);
  el('p','Search market: '+(loc.country||'US (default)')+(loc.hl?' · language '+loc.hl:'')+' · '+(loc.source==='SET_IN_TRACKER'?'set in Growth':loc.source==='FROM_PREWRITE_BRIEF'?'from the Pre-Write brief':loc.source==='SITE_DEFAULT'?'site default (Growth Cockpit)':'not confirmed'),m);
  (cov.markets||[]).forEach(function(x){el('small',x.name+': '+(x.researched?'researched ('+(x.provider||'search')+', '+x.usable_results+' usable result(s))':'not researched'),m)});
  if(cov.note)el('small',cov.note,m);if(disc.fetch_summary)el('small','Ranking pages: '+disc.fetch_summary,m);
  var exact=(ov.exact||[]).length>0;
  if(typeof window.renderGrowthGapChecklist==='function'){
   window.renderGrowthGapChecklist(gl,el('section',null,out),{write:gl.id&&gl.write_url?async function(ids){
    var confirm=false;
    if(exact){confirm=window.confirm('A tracked page already targets this keyword. Write a separate new page anyway?');if(!confirm)return {success:false,code:'NOT_CONFIRMED_IMPROVE_THE_EXISTING_PAGE_INSTEAD'}}
    var sel=await post(gl.selection_url,{gap_list_id:gl.id,item_ids:ids});if(!sel||sel.success===false)return sel;
    return post(gl.write_url,{gap_list_id:gl.id,item_ids:ids,confirm_new_page:confirm});
   }:null});
  }
 }
 run();
})();
