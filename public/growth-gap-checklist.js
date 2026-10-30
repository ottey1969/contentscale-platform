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
   sel.forEach(function(x){L.push('- [ ] **'+x.title+'**'+(x.recommended?' (recommended)':'')+' ('+x.status+(x.your_section?'; closest on the page: “'+x.your_section+'”':'')+(x.ai?'; '+x.ai:'')+')');
    if(x.priority&&x.priority.suggested_action)L.push('  - Action: '+x.priority.suggested_action);
    if(x.priority&&x.priority.why)L.push('  - Why: '+x.priority.why.join('; '));
    (x.examples||[]).forEach(function(e){L.push('  - '+(e.position?'#'+e.position+' ':'')+e.site+(e.heading?': “'+e.heading+'”':''))})});L.push('')});
  if((list.unique_content||[]).length){L.push('## Unique content worth reviewing and preserving','','Only on your page among the ranking pages read. Unique is not proof that it is correct, current or strong: review it.','');list.unique_content.forEach(function(s){L.push('- '+s.heading)});L.push('')}
  return L.join('\n');
 }
 function demand(g){var d=g&&g.search_demand;if(!d)return null;
  return d.status==='GSC_QUERIES_OBSERVED'?'Search Console: '+d.impressions+' impressions for '+d.queries.map(function(q){return '“'+q.query+'”'}).join(', ')+' (observed, not a forecast)':
   d.status==='NO_MATCHING_GSC_QUERY'?'Search Console: no query with these words':'Search demand: not measured (no Search Console data; not low)'}
 function save(name,text){var url=URL.createObjectURL(new Blob([text],{type:'text/markdown'})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},2000)}
 // options: {write: async(ids)=>result|null} — null when writing is not available for this viewer.
 window.renderGrowthGapChecklist=function(list,parent,options){
  if(!list||!parent)return false;options=options||{};
  var box=el('div',null,parent,'growth-gap-checklist');
  el('h2',list.page_kind==='NEW_PAGE'?'Choose what goes on the new page':'Choose what goes on your site',box);
  el('p',list.note||'',box,'small');
  if(list.status!=='OBSERVED'||!(list.items||[]).length){el('p','No difference with the readable ranking pages was found.',box);return true}
  var np=list.page_kind==='NEW_PAGE',here=np?'missing on the new page':'missing or partly on your page';
  el('p',list.items.length+(np?' topic(s) and element(s) from ':' difference(s) with ')+(list.ranking_pages_read||0)+' readable ranking page(s).',box);
  var rec=list.items.filter(function(x){return x.recommended});
  if(rec.length)el('p','Recommended first ('+rec.length+'): '+rec.map(function(x){return x.title}).join(' · ')+'. A research priority (supported by at least two ranking pages, '+here+', not contradicted by the AI), not a growth forecast. You decide; you can select more.',box,'small');
  else el('p','No item is recommended: none is supported by two ranking pages'+(np?'':' and missing on your page')+'. You can still choose any item.',box,'small');
  var carried=list.carried_over&&list.carried_over.pending_ids||[];
  var co=list.carried_over||{};
  if(carried.length)el('p',carried.length+' item(s) from your earlier selection are not written yet and are ticked again (the new research still shows the same need).',box,'small');
  (co.needs_confirmation||[]).forEach(function(x){el('p','Confirm topic match: your earlier item “'+x.title+'” may be “'+x.candidate.title+'” now ('+x.reason+') Tick it yourself if it is the same.',box,'small')});
  (co.needs_remapping||[]).forEach(function(x){el('p','Check the link: your earlier item “'+x.title+'” is not clearly the same need in this research. Possibly: '+x.candidates.map(function(c){return '“'+c.title+'”'}).join(', ')+'. Not ticked.',box,'small')});
  if((co.no_longer_found||[]).length)el('p','No longer in this research: '+co.no_longer_found.map(function(x){return '“'+x.title+'”'}).join(', ')+'.',box,'small');
  var boxes=[];
  (list.groups||[]).forEach(function(g){var items=list.items.filter(function(x){return x.group===g.id});if(!items.length)return;
   el('h3',g.label+' ('+items.length+')',box);
   items.forEach(function(x){var row=el('label',null,box,'check');var c=el('input',null,row);c.type='checkbox';c.value=x.id;if(carried.indexOf(x.id)>=0)c.checked=true;boxes.push({c:c,x:x});
    var t=el('span',null,row);if(x.recommended)el('mark','Recommended ',t);el('strong',x.title,t);
    el('small',' — '+x.status+(x.ranking_pages?' · '+x.ranking_pages+(x.of?' of '+x.of:'')+' ranking page(s)':'')+(x.your_section?' · closest here: “'+x.your_section+'”':'')+(x.ai?' · '+x.ai:'')+(x.writable?'':' · added by the editor, not written'),t);
    if(x.priority&&x.priority.suggested_action)el('small','Action: '+x.priority.suggested_action,el('div',null,t));
    if(x.priority&&x.priority.why)el('small','Why: '+x.priority.why.join(' · '),el('div',null,t));
    if(demand(x.growth_potential))el('small',demand(x.growth_potential)+' · business fit: your decision',el('div',null,t));
    (x.possible_overlap||[]).forEach(function(o){el('small','May overlap with “'+o.title+'”: '+o.reason,el('div',null,t))});
    // Every source is kept; three are shown, the rest folds out.
    var ex=x.examples||[],show=function(e,into){el('small',(e.position?'#'+e.position+' ':'')+e.site+(e.heading&&e.heading!==x.title?': “'+e.heading+'”':''),el('div',null,into))};
    ex.slice(0,3).forEach(function(e){show(e,t)});
    if(ex.length>3){var more=el('details',null,t);el('summary',ex.length-3+' more source(s)',more);ex.slice(3).forEach(function(e){show(e,more)})}})});
  if((list.unique_content||[]).length){el('h3','Unique content worth reviewing and preserving ('+list.unique_content.length+')',box);
   var ks=el('ul',null,box);list.unique_content.forEach(function(s){el('li',s.heading,ks)});
   el('p','Only on your page among the ranking pages read (compared by heading words). Unique is not proof that it is correct, current or strong: value not assessed, strength not measured. It is not rewritten.',box,'small')}
  // Owner guidance follows actual checklist state; no synthetic completion badges.
  var guide=el('section',null,box,'growth-selection-guide');
  guide.style.cssText='border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px;padding:14px;margin:14px 0';
  var guideTitle=el('strong','Next action: choose the improvements you want',guide);
  var guideHelp=el('p','Tick one or more topics above. Growth writes only what you select, in rounds of four. Nothing is published.',guide);
  guideHelp.style.margin='6px 0';
  var count=el('p',(carried.length?carried.length:0)+' selected',box);
  var picked=function(){return boxes.filter(function(b){return b.c.checked}).map(function(b){return b.x})};
  boxes.forEach(function(b){b.c.addEventListener('change',function(){var p=picked();count.textContent=p.length+' selected'+(p.length&&!p.some(function(x){return x.writable})?' (page elements only: nothing to write)':'');
    guideTitle.textContent=p.some(function(x){return x.writable})?'Next action: write selected topics':'Next action: choose at least one writable topic';
    guideHelp.textContent=p.some(function(x){return x.writable})?'Your selection contains '+p.filter(function(x){return x.writable}).length+' topic(s). Writing saves concepts for review; it never publishes.':'Choose a topic or question first. Page elements cannot be AI-written.';})});
  var actions=el('p',null,box),status=el('p',null,box,'small'),out=el('div',null,box);
  var dl=el('button','Download selection as editor brief',actions);dl.type='button';
  dl.style.cssText='background:#e2e8f0;color:#334155;border:1px solid #cbd5e1;margin-right:8px';
  dl.addEventListener('click',function(){var p=picked();if(!p.length){status.textContent='Select at least one item.';return}save('editor-brief.md',brief(list,p));status.textContent=p.length+' item(s) in the brief.'});
  if(typeof options.write==='function'){
   var w=el('button','Write selected with AI (concepts for review)',actions);w.type='button';w.style.cssText='background:#2563eb;color:white;font-weight:700';
   el('small',' Your whole selection is kept; each run writes the next 4 not written yet. Page elements are added by the editor. Nothing is published.',actions);
   w.addEventListener('click',async function(){
    var p=picked().filter(function(x){return x.writable});if(!p.length){status.textContent='Select at least one topic or question.';return}
    w.disabled=true;status.textContent='Writing concepts for '+Math.min(4,p.length)+' item(s)'+(p.length>4?' (the other '+(p.length-4)+' are kept for the next run)':'')+'…';out.textContent='';
    try{var r=await options.write(p.map(function(x){return x.id}));
     if(r&&r.code==='WRITING_IN_PROGRESS'){status.textContent='Concepts for this list are being written right now (started '+(r.run&&r.run.started_at||'')+'). Wait a moment and reload; nothing is written twice.';return}
     if(r&&r.code==='SELECTION_ALREADY_WRITTEN'){status.textContent='Everything you selected has been written already.'+(r.last_run&&r.last_run.cms_url?' The latest concepts are in the CMS package.':'');if(r.last_run&&r.last_run.cms_url){var l=el('a','Open the CMS package',el('p',null,out));l.href=r.last_run.cms_url}return}
     if(!r||r.success===false)throw Error((r&&(r.code||r.reason))||'Writing not available');
     if(r.storage_error)el('p','These concepts could not be stored, so nothing is marked as written and the items stay selected. Copy what you need and try again.',out,'error');
     status.textContent=r.sections&&r.sections.length?'Concepts written. Flagged sentences must be rewritten or removed; every statement still needs your check. Nothing is published.':(r.reason||'No text was written. Write these items yourself; your selection is kept.');
     (r.sections||[]).forEach(function(s){var card=el('div',null,out,'note');el('h3',s.h2,card);
      el('small',(s.status==='FLAGGED_FOR_EDITOR'?'Flagged: '+s.flags.length+' item(s) to rewrite or remove':s.status==='MARKED_NO_SOURCE_TEXT'?'Marked: no competitor text behind it':'Concept for review')+(s.item_title?' · for “'+s.item_title+'”':'')+(s.placement&&s.placement.section_heading?' · place '+(s.placement.mode==='EXTEND_SECTION'?'inside':'after')+' “'+s.placement.section_heading+'”':' · editor chooses the place'),card);
      if(s.basis){var bs=el('div',null,card,'small');el('small','Answers: “'+s.basis.answers+'” · basis: '+String(s.basis.evidence_level||'').toLowerCase().replace(/_/g,' ')+((s.basis.competitor_evidence||[]).length?' · sources: '+s.basis.competitor_evidence.map(function(e){return e.site+(e.heading?' (“'+e.heading+'”)':'')}).join(', '):''),bs);
       if(s.basis.warning)el('p',s.basis.warning,card,'small')}
      var flagged=(s.flags||[]).map(function(f){return f.sentence}).filter(Boolean);
      (s.paragraphs||[]).forEach(function(para){var pnode=el('p',null,card);
       para.split(/(?<=[.!?])\s+/).forEach(function(sentence){var span=el('span',sentence+' ',pnode);if(flagged.indexOf(sentence)>=0){span.style.background='#fde68a';span.title='Flagged: rewrite or remove'}})});
      if((s.flags||[]).length){var ul=el('ul',null,card);s.flags.forEach(function(f){el('li',(f.sentence?'“'+f.sentence+'” — ':'Whole section — ')+f.reason,ul)})}});
     (r.not_written||[]).forEach(function(x){el('p','Not written: '+x.title+' — kept for the next run, or write it yourself.',out,'small')});
     if((r.pending||[]).length)el('p','Still to write from your selection ('+r.pending.length+'): '+r.pending.map(function(x){return x.title}).join(' · ')+'. Click again to write the next ones.',out,'small');
     (r.unlinked_sections||[]).forEach(function(x){el('p','Not linked to a selected item and not used: “'+x.h2+'” — '+x.reason,out,'small')});
     if(r.new_page_package&&r.new_page_package.url){var np=el('a','Download the new page package (Markdown with the evidence dossier)',el('p',null,out));np.href=r.new_page_package.url}
     if(r.cms_handoff&&r.cms_handoff.url){var a=el('a','Prepare the CMS package with these concepts',el('p',null,out));a.href=r.cms_handoff.url}
    }catch(e){status.textContent='Not written: '+String(e.message||e)+'. Your selection and the research are kept; you can download the brief.'}
    finally{w.disabled=false}
   });
  }
  return true;
 };
})();
