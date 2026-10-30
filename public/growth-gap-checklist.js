// Gap checklist for the editor (Tracker Growth research page): every difference with the ranking pages, grouped, with
// AI labels. The owner ticks items, downloads an editor brief, or asks Growth to write concepts for the selection only.
// Report data is rendered with textContent only.
(function(){
 'use strict';
 function el(tag,text,parent,cls){var n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;if(parent)parent.appendChild(n);return n}
 function brief(list,items){
  var L=['# Editor brief: '+(list.target_url||''),'','Search term: '+(list.focus_query||'—'),
   'Chosen from the comparison with '+(list.ranking_pages_read||0)+' ranking page(s). Write in your own words with facts you can stand behind; do not copy the ranking pages.',''];
  (list.groups||[]).forEach(function(g){var sel=items.filter(function(x){return x.group===g.id});if(!sel.length)return;L.push('## '+g.label,'');
   sel.forEach(function(x){L.push('- [ ] **'+x.title+'** ('+x.status+(x.your_section?'; closest on the page: “'+x.your_section+'”':'')+(x.ai?'; '+x.ai:'')+')');
    (x.examples||[]).forEach(function(e){L.push('  - '+(e.position?'#'+e.position+' ':'')+e.site+(e.heading?': “'+e.heading+'”':''))})});L.push('')});
  return L.join('\n');
 }
 function save(name,text){var url=URL.createObjectURL(new Blob([text],{type:'text/markdown'})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},2000)}
 // options: {write: async(ids)=>result|null} — null when writing is not available for this viewer.
 window.renderGrowthGapChecklist=function(list,parent,options){
  if(!list||!parent)return false;options=options||{};
  var box=el('div',null,parent,'growth-gap-checklist');
  el('h2','Choose what goes on your site',box);
  el('p',list.note||'',box,'small');
  if(list.status!=='OBSERVED'||!(list.items||[]).length){el('p','No difference with the readable ranking pages was found.',box);return true}
  el('p',list.items.length+' difference(s) with '+(list.ranking_pages_read||0)+' readable ranking page(s).',box);
  var boxes=[];
  (list.groups||[]).forEach(function(g){var items=list.items.filter(function(x){return x.group===g.id});if(!items.length)return;
   el('h3',g.label+' ('+items.length+')',box);
   items.forEach(function(x){var row=el('label',null,box,'check');var c=el('input',null,row);c.type='checkbox';c.value=x.id;boxes.push({c:c,x:x});
    var t=el('span',null,row);el('strong',x.title,t);
    el('small',' — '+x.status+(x.ranking_pages?' · '+x.ranking_pages+(x.of?' of '+x.of:'')+' ranking page(s)':'')+(x.your_section?' · closest here: “'+x.your_section+'”':'')+(x.ai?' · '+x.ai:'')+(x.writable?'':' · added by the editor, not written'),t);
    (x.examples||[]).slice(0,3).forEach(function(e){el('small',(e.position?'#'+e.position+' ':'')+e.site+(e.heading&&e.heading!==x.title?': “'+e.heading+'”':''),el('div',null,t))})})});
  var count=el('p','0 selected',box);
  var picked=function(){return boxes.filter(function(b){return b.c.checked}).map(function(b){return b.x})};
  boxes.forEach(function(b){b.c.addEventListener('change',function(){var p=picked();count.textContent=p.length+' selected'+(p.length&&!p.some(function(x){return x.writable})?' (page elements only: nothing to write)':'')})});
  var actions=el('p',null,box),status=el('p',null,box,'small'),out=el('div',null,box);
  var dl=el('button','Download selection as editor brief',actions);dl.type='button';
  dl.addEventListener('click',function(){var p=picked();if(!p.length){status.textContent='Select at least one item.';return}save('editor-brief.md',brief(list,p));status.textContent=p.length+' item(s) in the brief.'});
  if(typeof options.write==='function'){
   var w=el('button','Write selected with AI (concepts for review)',actions);w.type='button';
   el('small',' At most 4 topics per run. Page elements are added by the editor. Nothing is published.',actions);
   w.addEventListener('click',async function(){
    var p=picked().filter(function(x){return x.writable});if(!p.length){status.textContent='Select at least one topic or question.';return}
    if(p.length>4){status.textContent='You selected '+p.length+' topics: write at most 4 per run (untick some), or download the brief for all of them.';return}
    w.disabled=true;status.textContent='Writing concepts for '+p.length+' item(s)…';out.textContent='';
    try{var r=await options.write(p.map(function(x){return x.id}));
     if(!r||r.success===false)throw Error((r&&(r.code||r.reason))||'Writing not available');
     status.textContent=r.sections&&r.sections.length?'Concepts written. Flagged sentences must be rewritten or removed; every statement still needs your check. Nothing is published.':(r.reason||'No text was written. Write these items yourself; your selection is kept.');
     (r.sections||[]).forEach(function(s){var card=el('div',null,out,'note');el('h3',s.h2,card);
      el('small',(s.status==='FLAGGED_FOR_EDITOR'?'Flagged: '+s.flags.length+' item(s) to rewrite or remove':'Concept for review')+(s.item_title?' · for “'+s.item_title+'”':'')+(s.placement&&s.placement.section_heading?' · place '+(s.placement.mode==='EXTEND_SECTION'?'inside':'after')+' “'+s.placement.section_heading+'”':' · editor chooses the place'),card);
      var flagged=(s.flags||[]).map(function(f){return f.sentence}).filter(Boolean);
      (s.paragraphs||[]).forEach(function(para){var pnode=el('p',null,card);
       para.split(/(?<=[.!?])\s+/).forEach(function(sentence){var span=el('span',sentence+' ',pnode);if(flagged.indexOf(sentence)>=0){span.style.background='#fde68a';span.title='Flagged: rewrite or remove'}})});
      if((s.flags||[]).length){var ul=el('ul',null,card);s.flags.forEach(function(f){el('li',(f.sentence?'“'+f.sentence+'” — ':'Whole section — ')+f.reason,ul)})}});
     (r.not_written||[]).forEach(function(x){el('p','Not written: '+x.title+' — write this one yourself.',out,'small')});
     (r.unlinked_sections||[]).forEach(function(x){el('p','Not linked to a selected item and not used: “'+x.h2+'” — '+x.reason,out,'small')});
     if(r.cms_handoff&&r.cms_handoff.url){var a=el('a','Prepare the CMS package with these concepts',el('p',null,out));a.href=r.cms_handoff.url}
    }catch(e){status.textContent='Not written: '+String(e.message||e)+'. Your selection and the research are kept; you can download the brief.'}
    finally{w.disabled=false}
   });
  }
  return true;
 };
})();
