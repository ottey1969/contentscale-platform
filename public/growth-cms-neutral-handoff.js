(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const token=String(location.pathname.split('/')[2]||'');
 const pageId=Number(new URLSearchParams(location.search).get('page_id'));
 const base='/api/tracker-client/'+encodeURIComponent(token)+'/growth/cms-export';
 const safe={source:null,proposal:null,added:[],exported:false,publicationRecorded:false,loadingSource:false};
 // Local persistence per client/page; source text and approvals remain server-authoritative.
 const removalKey='growth-removed:'+encodeURIComponent(token)+':'+pageId;
 // Removals are remembered on the server per page (any browser or device) and, as a fallback, in this browser.
 var serverRemoved=[];
 function removedSentences(){var local=[];try{var v=JSON.parse(localStorage.getItem(removalKey)||'[]');local=Array.isArray(v)?v:[]}catch(e){}
  return local.concat(serverRemoved.filter(function(x){return local.indexOf(x)<0}))}
 function saveRemoval(sentence,how){
  try{var all=removedSentences();if(!all.includes(sentence)){all.push(sentence);localStorage.setItem(removalKey,JSON.stringify(all))}}catch(e){}
  if(serverRemoved.indexOf(sentence)<0)serverRemoved.push(sentence);
  return fetch(base+'/removals',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({page_id:pageId,sentence:sentence,how:how||'REMOVED_BY_BUTTON'})}).then(function(r){return r.ok}).catch(function(){return false});
 }
 function loadServerRemovals(){
  return fetch(base+'/removals?page_id='+encodeURIComponent(pageId),{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.json()})
   .then(function(d){if(d&&d.success)serverRemoved=(d.removed||[]).map(function(x){return x.sentence});reapplyRemovals()}).catch(function(){});
 }
 var flagRows=[];
 function reapplyRemovals(){removedSentences().forEach(removeFlaggedSentence);flagRows.forEach(function(f){f.refresh()})}
 var sourceButtonStates=[];
 function lockWhileLoading(on){
  safe.loadingSource=on;
  if(on){
   status('sourceStatus','⏳ Loading original page, scanned text and Growth evidence… please wait.',false);
   $('checkSource').textContent='⏳ Loading… please wait';
   sourceButtonStates=[...document.querySelectorAll('button')].map(function(b){return {button:b,disabled:b.disabled}});
   sourceButtonStates.forEach(function(s){s.button.disabled=true});
   // The download button tells the same story while loading (owner 2026-11-02): spinner and "Loading… please wait".
   var dl=$('download');if(dl){dl.dataset.loadingText=dl.textContent;dl.textContent='⏳ Loading… please wait';dl.dataset.busy='true';dl.setAttribute('aria-busy','true')}
  }else{
   var dl2=$('download');if(dl2&&dl2.dataset.loadingText!==undefined){delete dl2.dataset.busy;dl2.removeAttribute('aria-busy');delete dl2.dataset.loadingText}
   // Buttons that existed before loading get their state back; buttons created DURING loading (the flagged-sentence
   // removal, "Add to this package") were switched off by ready() and must come back on too (owner 2026-11-02: the
   // removal button stayed grey and did nothing). Their own state is then set by their refresh.
   var known=new Set(sourceButtonStates.map(function(s){return s.button}));
   sourceButtonStates.forEach(function(s){s.button.disabled=s.disabled});
   document.querySelectorAll('button').forEach(function(b){if(!known.has(b))b.disabled=false});
   sourceButtonStates=[];
   $('generateEditorialDraft').disabled=!safe.source;
   flagRows.forEach(function(f){f.refresh()});
   ready();
  }
 }
 $('backToGrowth').href='/track/'+encodeURIComponent(token)+'/growth';
 $('researchReviewLink').href='/track/'+encodeURIComponent(token)+'/growth/auto-research?page_id='+encodeURIComponent(pageId);
 function status(id,msg,error){
  const el=$(id);el.textContent=msg;el.style.color=error?'#b91c1c':'#166534';
 }
 function buttonProgress(button,on,successful){
  if(!button)return;
  if(on){button.dataset.busy='true';button.dataset.busyStarted=String(Date.now());button.setAttribute('aria-busy','true');delete button.dataset.done;return}
  // Keep the busy indicator visible for at least one perceptible beat on quick cached checks.
  var begun=Number(button.dataset.busyStarted||0);var elapsed=Date.now()-begun;
  var finish=function(){delete button.dataset.busy;delete button.dataset.busyStarted;button.removeAttribute('aria-busy');if(successful){button.dataset.done='true';setTimeout(function(){delete button.dataset.done},1800)}};
  if(begun&&elapsed<650)setTimeout(finish,650-elapsed);else finish();
 }
 // A pressed state applies to optional synchronous actions too; async tasks hold a spinner until they finish.
 document.addEventListener('click',function(event){
  var button=event.target.closest&&event.target.closest('button');
  if(!button||button.disabled)return;
  button.classList.add('growth-pressed');
  setTimeout(function(){button.classList.remove('growth-pressed')},350);
 },true);
 function ready(){
  if(safe.loadingSource){
   document.querySelectorAll('button').forEach(function(b){b.disabled=true});
   return;
  }
  var hasManual=safe.source&&safe.source.manual_source_required;
  var manualReady=!hasManual||($('manualAcknowledged').checked&&$('manualOriginalHtml').value.trim().length>=120);
  var facts=[...document.querySelectorAll('.fact-item')],open=facts.filter(x=>!x.checked),factsChecked=!open.length;
  $('download').disabled=!!safe.exported||!(safe.source&&$('approved').checked&&manualReady&&factsChecked);
  $('download').textContent=safe.exported?'4. CMS handoff ZIP downloaded':'4. Download reviewed CMS handoff ZIP';
  $('download').style.background=safe.exported?'#94a3b8':'';
  // Owner 2026-11-01: a grey button without a reason. Say exactly what is still missing.
  var missing=[];
  if(!safe.source)missing.push('check the original page first (step 1)');
  if(hasManual&&!manualReady)missing.push('paste the original page HTML and tick that it is not live-verified');
  if(open.length)missing.push('confirm the '+facts.length+' statement'+(facts.length===1?'':'s')+' (one tick “I checked all …” above, or each one; '+open.length+' open, marked in yellow)');
  if(!$('approved').checked)missing.push('tick “I reviewed the actual page…” at the end of step 3');
  facts.forEach(function(x){var l=x.closest&&x.closest('label');if(l)l.style.background=x.checked?'':'#fef9c3'});
  // One confirmation for all statements (owner 2026-11-01): same meaning as ticking each one, one click.
  // With no statement to confirm, the tick is hidden (an empty "I checked all 0" cannot be ticked) and the page says why.
  var none=$('noStatementsNote');if(none)none.hidden=!!facts.length||!safe.source;
  var all=$('confirmAll');if(all){$('confirmAllWrap').hidden=!facts.length;all.checked=facts.length>0&&!open.length;
   $('confirmAllText').textContent='I checked all '+facts.length+' statement'+(facts.length===1?'':'s')+' listed above: true, confirmed with the business and safety-reviewed where marked.'}
  var why=$('downloadWhy');if(why){why.textContent=safe.exported?'ZIP prepared and downloaded. Next: publish the reviewed changes in your CMS, then record the actual publication.':missing.length?'To download: '+missing.join('; ')+'.':'';why.hidden=!!safe.exported?false:!missing.length}
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
  return group;
 }
 // A review checkbox is not a removal action. Remove only an exact flagged sentence
 // from editable proposed copy; never alter the original page, and never approve facts automatically.
 function removeFlaggedSentence(sentence){
  if(!sentence)return 0;
  // Scanner text and editor fields can differ in whitespace and typographic quotation marks.
  // Remove the exact flagged sentence, not an entire section or unflagged neighboring claims.
  var canonical=function(s){return String(s).replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\u00a0/g,' ')};
  var target=canonical(sentence).trim().replace(/\s+/g,' ');
  if(!target)return 0;
  var fields=[$('copy')].concat([...document.querySelectorAll('.draft-copy')]);
  var changed=0;
  fields.forEach(function(field){
   if(!field||!field.value)return;
   var original=field.value,normalized=canonical(original);
   var words=target.split(' ').map(function(w){return w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')});
   var pattern=new RegExp(words.join('\\s+'),'g');
   var matches=[...normalized.matchAll(pattern)];
   if(!matches.length)return;
   // Identical code-point length after punctuation normalization lets us safely use match offsets.
   var next=original;
   for(var i=matches.length-1;i>=0;i--){var m=matches[i];next=next.slice(0,m.index)+next.slice(m.index+m[0].length)}
   next=next.replace(/ {2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
   if(next!==original){field.value=next;field.dispatchEvent(new Event('input',{bubbles:true}));changed++}
  });
  return changed;
 }
 // Draft text as sentences, to find a changed version of a flagged sentence (same words for the most part).
 function draftSentences(){
  return [$('copy')].concat([...document.querySelectorAll('.draft-copy')]).filter(Boolean).flatMap(function(f){
   return (String(f.value||'').replace(/\s+/g,' ').match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)||[]).map(function(x){return x.trim()})}).filter(Boolean)}
 function wordsOf(t){return (String(t).toLowerCase().match(/[a-z0-9]{3,}/g)||[])}
 function closestSentence(sentence){
  var want=wordsOf(sentence),best=null,score=0;if(!want.length)return null;
  draftSentences().forEach(function(x){var w=new Set(wordsOf(x)),n=want.filter(function(v){return w.has(v)}).length/want.length;if(n>score){score=n;best=x}});
  return score>=0.6?{text:best,share:score}:null;
 }
 function inDraft(sentence){var t=String(sentence).replace(/\s+/g,' ').trim().toLowerCase();return draftSentences().some(function(x){return x.toLowerCase()===t})}
 // One button per flagged sentence, also when it was flagged for several reasons; plus one "Remove all" for the page.
 function flaggedRemoveAll(anchor){
  var old=document.getElementById('growthFlaggedRemoveAll');if(old){old.disabled=false;old.textContent='Remove all flagged sentences from draft';return}
  var all=document.createElement('button');all.type='button';all.id='growthFlaggedRemoveAll';all.textContent='Remove all flagged sentences from draft';
  all.onclick=function(){var n=0;document.querySelectorAll('.growth-flagged-remove > button:first-child').forEach(function(b){if(!b.disabled&&/Remove this flagged sentence/.test(b.textContent)){b.click();n++}});
   all.textContent=n?'Removed '+n+' flagged sentence(s)':'Nothing left to remove';all.disabled=true};
  anchor.parentNode.insertBefore(all,anchor);
 }
 function flaggedReviewAction(box,flag){
  var sentence=String(flag&&flag.sentence||'').trim();
  if(!sentence)return;
  // Already a button for this sentence in this box (it was flagged for another reason too): one is enough.
  if(box&&Array.prototype.some.call(box.querySelectorAll('.growth-flagged-remove'),function(x){return x.getAttribute('data-sentence')===sentence}))return;
  var row=document.createElement('div');row.className='growth-flagged-remove';row.setAttribute('data-sentence',sentence);
  var action=document.createElement('button');action.type='button';
  action.textContent='Remove this flagged sentence from draft';row.appendChild(action);
  var result=document.createElement('small');result.setAttribute('role','status');row.appendChild(result);
  var alt=document.createElement('button');alt.type='button';alt.hidden=true;row.appendChild(alt);
  var done=function(text,label){action.disabled=true;action.textContent=label||'Removed — saved';result.textContent=text;alt.hidden=true;ready()};
  // State of this sentence in the draft right now: removed earlier, gone from the text, changed, or still there.
  var refresh=function(){
   if(removedSentences().includes(sentence)&&!inDraft(sentence))return done('Removed earlier — remembered for this page.');
   if(inDraft(sentence)){action.disabled=false;action.textContent='Remove this flagged sentence from draft';alt.hidden=true;result.textContent='';return}
   var near=closestSentence(sentence);
   if(near){action.disabled=true;action.textContent='Not removed automatically';
    result.textContent='Why not: your text no longer has this exact sentence, but a changed version of it ('+Math.round(near.share*100)+'% the same words): “'+near.text+'”. It can still carry the same problem.';
    alt.hidden=false;alt.textContent='Remove the changed sentence';
    alt.onclick=function(){var n=removeFlaggedSentence(near.text);if(n){saveRemoval(sentence,'REMOVED_BY_BUTTON');done('Changed version removed — remembered for this page.')}
     else result.textContent='Why not: the changed sentence could not be found as one piece (it may run across lines). Delete it by hand in the text field.'};
    return}
   // Not in the text at all: nothing to remove, no click needed. Shown as resolved; only an owner's click is remembered,
   // and the package itself still checks the final text.
   done('Not in your text anymore — nothing to remove; the package checks the final text again.','Resolved — not in text');
  };
  action.addEventListener('click',function(){
   var n=removeFlaggedSentence(sentence);
   if(n){saveRemoval(sentence,'REMOVED_BY_BUTTON');done('Removed from '+n+' draft text field(s) — remembered for this page. Review the remaining paragraph before downloading.')}
   else refresh();
  });
  flagRows.push({refresh:refresh});
  box.appendChild(row);
  // The first flagged sentence brings the page-wide "Remove all" button with it (placed above that box).
  if(box.parentNode)flaggedRemoveAll(box);
  setTimeout(refresh,0);
 }
 // One tickable line per sentence to check, in the proposal box (the download waits until each is ticked).
 function checkItem(box,item){
  var l=document.createElement('label');l.className='check';
  var c=document.createElement('input');c.type='checkbox';c.className='fact-item';c.addEventListener('change',ready);
  var sp=document.createElement('span');sp.textContent=item;l.appendChild(c);l.appendChild(sp);box.appendChild(l);
 }
 // Other proposals and written concepts stored for this page (for example improvements the owner chose on the research
 // page). Each one is added only when the editor clicks it; its checks come with it and the package records its id.
 function renderEarlier(list){
  var box=$('growthEarlier');if(!box)return;box.textContent='';
  if(!list||!list.length){box.hidden=true;return}
  box.hidden=false;
  // Concepts the owner had written for a selection are offered; earlier research runs of the same page are older wordings
  // of the same tasks and stay folded away (owner 2026-11-01: nine "other concepts" were mostly earlier versions).
  var concepts=list.filter(function(p){return p.kind!=='EARLIER_RESEARCH_VERSION'}),older=list.filter(function(p){return p.kind==='EARLIER_RESEARCH_VERSION'});
  var row=function(p,into){
   var r0=document.createElement('div');r0.className='earlier-concept';
   var t=document.createElement('p');
   t.textContent='#'+p.id+' · '+String(p.created_at||'').slice(0,10)+(p.focus_query?' · “'+p.focus_query+'”':'')+': '+p.sections.map(function(x){return '“'+x.h2+'”'}).join(', ');
   r0.appendChild(t);
   var b=document.createElement('button');b.type='button';b.textContent='Add to this package';
   b.addEventListener('click',function(){
    if(safe.added.some(function(a){return a.id===p.id}))return;
    var r=p.review||{};safe.added.push({id:p.id,review:r});
    p.sections.forEach(function(x){var g=addSection(x.h2,x.text,'Concept #'+p.id+': '+x.h2,x.placement);g.dataset.proposalId=String(p.id)});
    reapplyRemovals();
    var seen=new Set();
    (r.flagged||[]).forEach(function(f){checkItem(r0,'Rewrite or remove: '+(f.sentence?'“'+f.sentence+'”':'section “'+f.h2+'”')+' — '+f.reason);flaggedReviewAction(r0,f)});
    ['needs_fact_check','needs_owner_confirmation','needs_safety_review'].forEach(function(k){(r[k]||[]).forEach(function(item){if(seen.has(item))return;seen.add(item);checkItem(r0,'Check: '+item)})});
    b.disabled=true;b.textContent='Added — review the sections above';
    $('approved').checked=false;ready();
   });
   r0.appendChild(b);into.appendChild(r0);
  };
  if(concepts.length){
   var h=document.createElement('strong');h.textContent='Also written for this page: '+concepts.length+' other concept'+(concepts.length===1?'':'s');box.appendChild(h);
   var intro=document.createElement('p');intro.className='small';
   intro.textContent='Written in the last 30 days for improvements you chose, on topics not already in the text above. Add the ones you want; each still needs your review.';
   box.appendChild(intro);concepts.forEach(function(p){row(p,box)});
  }
  if(older.length){
   var d=document.createElement('details');var sm=document.createElement('summary');
   sm.textContent='Earlier versions from previous research runs ('+older.length+') — usually not needed';d.appendChild(sm);
   var n=document.createElement('p');n.className='small';n.textContent='Each research run stores its own proposal. These are older wordings of the same or similar topics; the text above is the newest. Open only if you want an older wording.';
   d.appendChild(n);older.forEach(function(p){row(p,d)});box.appendChild(d);
  }
 }
 // The review notes of the main proposal plus those of every added concept, so the package checks all flagged sentences.
 function mergedReview(main){
  var out={},keys=['needs_fact_check','needs_owner_confirmation','needs_safety_review','requirements','flagged','basis','competitor_sources'];
  [main||{}].concat(safe.added.map(function(a){return a.review||{}})).forEach(function(r){
   keys.forEach(function(k){if(Array.isArray(r[k]))out[k]=(out[k]||[]).concat(r[k])});
   if(r.dossier&&!out.dossier)out.dossier=r.dossier});
  return out;
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
    var t=document.createElement('p');t.textContent=g[1]+' (confirm them all at once at the end of step 3, or one by one):';box.appendChild(t);
    items.forEach(function(item){checkItem(box,item)});
    if(g[0]==='flagged_text')(r.flagged||[]).forEach(function(f){flaggedReviewAction(box,f)});
   });
   if((r.competitor_sources||[]).length){
    var cs=document.createElement('p');cs.className='small';
    cs.textContent='Compared with: '+r.competitor_sources.map(x=>x.url).join(' · ');box.appendChild(cs);
   }
   renderEarlier(d.earlier);
   reapplyRemovals();
   $('approved').checked=false;ready();
  }catch(e){/* no proposal: manual or AI-assisted text stays available */}
 }
 function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 // AI proposal for title, meta description and link text: filled in for review; the current values stay one click away.
 async function loadSeoProposal(target,linkUrl){
  try{
   var res=await fetch(base+'/seo-proposal?page_id='+encodeURIComponent(pageId)+(linkUrl?'&link='+encodeURIComponent(linkUrl):''),{cache:'no-store',credentials:'same-origin'});
   var d=await res.json();if(!res.ok||d.success!==true)return;
   var old=target.querySelector&&target.querySelector('.seo-proposal');if(old)old.remove();
   var box=document.createElement('div');box.className='note seo-proposal';target.appendChild(box);
   if(d.status!=='AI_PROPOSAL_FOR_REVIEW'){var n=document.createElement('p');n.textContent='No AI proposal for the title and description ('+String(d.status||'').toLowerCase().replace(/_/g,' ')+'): the current values are used; edit them if needed.';box.appendChild(n);return}
   // The owner's own values are kept from the first time only (a second source check must not keep the AI text as "current").
   if(!safe.seoOriginal)safe.seoOriginal={title:$('title').value,meta:$('meta').value,link:$('linkText').value};
   var cur=d.current||{},prev=safe.seoOriginal;
   $('title').value=d.title;$('meta').value=d.meta_description;if(d.link_text&&$('linkUrl').value)$('linkText').value=d.link_text;
   var h=document.createElement('strong');h.textContent='SEO title, description'+(d.link_text?' and link text':'')+' proposed by AI — review before you download';box.appendChild(h);
   var w=document.createElement('p');w.className='small';w.textContent=(d.why?d.why+' ':'')+'Checked: length, the search term in the title, no number, superlative or promise that is not already on your page. Current title: “'+(cur.title||prev.title)+'”.';box.appendChild(w);
   var back=document.createElement('button');back.type='button';back.textContent='Use my current title and description';
   back.addEventListener('click',function(){$('title').value=prev.title||cur.title||'';$('meta').value=prev.meta||cur.description||'';if(prev.link)$('linkText').value=prev.link;ready()});
   box.appendChild(back);ready();
  }catch(e){}
 }
 async function loadResearchSuggestions(src){
  var target=$('growthResearchHints');
  try{
   var url='/api/tracker-client/'+encodeURIComponent(token)+'/growth/auto-research?page_id='+encodeURIComponent(pageId);
   var res=await fetch(url,{cache:'no-store',credentials:'same-origin'});
   if(!res.ok)throw Error('Research unavailable');
   var d=await res.json(),x=d.handoff_suggestions||{};
   if(d.success!==true||Number(d.page_id)!==pageId||d.url!==src.canonical_url||x.safe!==true)throw Error('Source identity changed');
   if(d.competitor_overview&&typeof window.renderGrowthCompetitorOverview==='function'){var ov=$('growthCompetitorOverview');ov.textContent='';try{ov.hidden=!window.renderGrowthCompetitorOverview(d.competitor_overview,ov)}catch(e){ov.hidden=true}}
   try{$('linkUrl').placeholder=new URL(src.canonical_url).origin+'/a-related-page/';$('linkText').placeholder='Words that say where the link goes'}catch(e){}
   if(!$('query').value&&x.query)$('query').value=x.query;
   if(!$('title').value&&x.title)$('title').value=x.title;
   if(!$('meta').value&&x.meta)$('meta').value=x.meta;
   // "Verified" only when Search Console has a verified row for the working query in the field (not for any query).
   var wq=$('query').value.trim().toLowerCase();
   if((x.verified_queries?x.verified_queries.indexOf(wq)>=0:x.verified_query)&&$('evidence').value==='needs_access')$('evidence').value='verified';
   else if(x.source_type!=='NO_PAGE_HTML'&&$('evidence').value==='needs_access')$('evidence').value='observed';
   target.hidden=false;target.textContent='';
   // The site speaks as the service: a current title or description in the first person must be rewritten.
   if(/(?:^|[^A-Za-z'’])I(?![A-Za-z'’])|\b(?:my|me|mine|ik|mijn|mij|founder|oprichter)\b/i.test($('title').value+' '+$('meta').value)){
    var pvn=document.createElement('p');pvn.className='error';pvn.textContent='Your current SEO title or description is written as a person (I, my, founder). Write it as the service before you download; the package refuses it otherwise.';target.appendChild(pvn)}
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
    // Filled in automatically for review (the editor approves the whole package; the fields stay editable).
    if(!$('linkUrl').value)$('linkUrl').value=x.internal_url;
    if(!$('linkText').value&&x.internal_label)$('linkText').value=x.internal_label;
    var sug=document.createElement('p');sug.textContent='Internal link filled in by Growth: '+x.internal_url+(x.internal_reason?'. '+x.internal_reason:'')+' Check it, change it or clear both fields.';target.appendChild(sug);
   }
   else{var none=document.createElement('p');none.textContent='No internal link suggested by the research. The link is optional: leave both fields empty, or add a page of your own site that helps this reader next.';target.appendChild(none)}
   void loadSeoProposal(target,x.internal_url||'');
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
 if($('confirmAll'))$('confirmAll').addEventListener('change',function(){var on=this.checked;document.querySelectorAll('.fact-item').forEach(function(x){x.checked=on});ready()});
 $('manualAcknowledged').addEventListener('change',ready);
 $('manualOriginalHtml').addEventListener('input',ready);
 $('checkSource').addEventListener('click',async function(){
  this.disabled=true;buttonProgress(this,true);safe.source=null;lockWhileLoading(true);
  try{
   const response=await fetch(base+'/source?page_id='+encodeURIComponent(pageId),{cache:'no-store',credentials:'same-origin'});
   const data=await response.json();
   if(!response.ok||!data.success)throw Error(data.code||'Source unavailable');
   safe.source=data;
   await Promise.allSettled([loadResearchSuggestions(data),loadProposal(data),loadServerRemovals()]);reapplyRemovals();
   // Not enabled here: the AI-assisted draft becomes available only when loading has finished (lockWhileLoading(false)).
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
  finally{lockWhileLoading(false);var verified=!!safe.source;buttonProgress(this,false,verified);this.disabled=verified;this.textContent=verified?'1. Original Tracker page checked':'1. Check original Tracker page';if(verified){this.style.background='#94a3b8';this.style.color='#fff'}else{this.style.background='';this.style.color=''}ready()}
 });
 $('generateEditorialDraft').addEventListener('click',async function(){
  if(!safe.source)return;
  var btn=this;
  if(btn.dataset.requestPending==='true')return;
  btn.dataset.requestPending='true';
  var originalLabel=btn.textContent;
  // Keep the running task unmistakable, and prevent competing actions or duplicate requests.
  var lockedButtons=[...document.querySelectorAll('button')].filter(b=>b!==btn);
  var previousButtonStates=lockedButtons.map(b=>({button:b,disabled:b.disabled}));
  lockedButtons.forEach(b=>{b.disabled=true;b.dataset.growthDraftLocked='true'});
  btn.disabled=true;
  btn.textContent='⏳ Generating draft… please wait';
  buttonProgress(btn,true);
  status('aiDraftStatus','Generating your draft from the original page. Please wait; other actions are temporarily unavailable.',false);
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
   safe.proposal=null;safe.added=[];if($('growthEarlier')){$('growthEarlier').hidden=true;$('growthEarlier').textContent=''}$('growthProposal').hidden=true;$('growthProposal').textContent='';$('mainPlacement').textContent='';
   $('growthAdditionalSections').textContent='';
   parts.slice(1,5).forEach(function(section,i){addSection(section.h2,(section.paragraphs||[]).join('\n\n'),'AI draft section '+(i+2)+' · verify facts',null)});
   reapplyRemovals();
   $('approved').checked=false;ready();
   status('aiDraftStatus','Editable AI draft prepared from the original page. All claims and each section still require your review and explicit approval.',false);
  }catch(err){status('aiDraftStatus',String(err.message||err),true)}
  finally{
   buttonProgress(btn,false,false);
   delete btn.dataset.requestPending;
   btn.textContent=originalLabel;
   btn.disabled=!safe.source;
   previousButtonStates.forEach(item=>{if(item.button.dataset.growthDraftLocked==='true'){item.button.disabled=item.disabled;delete item.button.dataset.growthDraftLocked}});
   ready();
  }
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
  const html='<section><h2>'+esc(heading)+'</h2>'+paragraphs+'</section>';
  const proposal=safe.proposal;
  const reviewedSections=[{approved:true,evidence_ref:proposal?'growth_proposal:'+proposal.id:'editor_reviewed:'+($('query').value.trim()||'original_page'),
   html,placement:placementOf($('mainPlacement'))}];
  document.querySelectorAll('[data-growth-draft-section]').forEach(function(group){
   var h2=group.querySelector('.draft-h2')?.value.trim()||'';
   var body=group.querySelector('.draft-copy')?.value.trim()||'';
   if(!h2||body.length<30)throw Error('Review every AI section or remove empty suggestions');
   var markup='<section><h2>'+esc(h2)+'</h2>'+body.split(/\n\s*\n/).filter(Boolean).map(t=>'<p>'+esc(t.trim()).replace(/\n/g,' ')+'</p>').join('\n')+'</section>';
   var ref=group.dataset.proposalId?'growth_proposal:'+group.dataset.proposalId:proposal?'growth_proposal:'+proposal.id:'editor_reviewed:AI_source_review';
   reviewedSections.push({approved:true,evidence_ref:ref,html:markup,placement:placementOf(group)});
  });
  // The internal link goes into the section that talks most about where it leads (words of its text and its address),
  // not always into the first one (owner 2026-11-01: the quality-checker link landed under the repurposing section).
  if(linkHtml){
   var STOP={to:1,of:1,in:1,on:1,an:1,and:1,the:1,for:1,with:1,your:1,is:1,it:1,at:1,by:1,or:1,be:1,as:1,we:1,us:1,our:1};
   var words=function(t){return new Set((String(t).toLowerCase().match(/[a-z]{2,}/g)||[]).filter(function(w){return !STOP[w]}).map(function(w){return w.slice(0,5)}))};
   var texts=reviewedSections.map(function(x){return words(x.html.replace(/<[^>]+>/g,' '))});
   // Words found in every section (the topic itself, such as "content") say nothing about where the link belongs.
   var want=[...words(label+' '+new URL(link).pathname.replace(/[-_/]+/g,' '))].filter(function(w){return !texts.every(function(t){return t.has(w)})});
   var best=0,score=0;
   texts.forEach(function(t,i){var n=want.filter(function(w){return t.has(w)}).length;if(n>score){score=n;best=i}});
   reviewedSections[best].html=reviewedSections[best].html.replace(/<\/section>$/,linkHtml+'</section>');
  }
  var manual=src.manual_source_required===true;
  if(manual&&(!$('manualAcknowledged').checked||$('manualOriginalHtml').value.trim().length<120))
   throw Error('Provide historical original-page HTML and acknowledge that it is not live-verified');
  return {page_id:pageId,source_sha256:src.source_sha256,editor_approved:true,
   ...(manual?{original_html_override:$('manualOriginalHtml').value,
    manual_source_acknowledged:true,source_provenance:'OWNER_SUPPLIED_UNVERIFIED'}:{}),
   cms:$('cms').value,evidence_scope:$('evidence').value,focus_query:$('query').value.trim(),
   seo_title:$('title').value.trim(),meta_description:$('meta').value.trim(),personal_voice:$('personalVoice').checked===true,
   ...(proposal?{growth_proposal_id:proposal.id,review_notes:mergedReview(proposal.review)}:{}),
   ...(proposal&&safe.added.length?{added_growth_proposal_ids:safe.added.map(function(a){return a.id})}:{}),
   approved_changes:reviewedSections};
 }
 async function post(body,format){
  const response=await fetch(base,{method:'POST',cache:'no-store',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,format})});
  if(!response.ok){const d=await response.json().catch(()=>({}));
   // Flagged content still in the text: name each sentence so the editor knows exactly what to rewrite or remove.
   if((d.blocked_details||[]).length)throw Error('Not packaged — still in your text: '+d.blocked_details.map(function(b){return (b.sentence?'“'+b.sentence+'”':'')+' ('+b.reason+')'}).join(' · ')+(d.blocked_details.some(function(b){return /PERSONAL_OR_FOUNDER_VOICE/.test(b.code||'')})?' If this page presents you as a person, tick “This page presents me as a person” and download again.':''));
   throw Object.assign(Error((d.issues||[]).join(', ')||d.code||'Export failed'),{code:d.code||null})}
  return format==='zip'?response.blob():response.json();
 }
 $('handoffForm').addEventListener('submit',async function(ev){
  ev.preventDefault();const btn=$('download');btn.disabled=true;buttonProgress(btn,true);
  status('downloadStatus','Validating evidence and approved content…',false);
  try{
   // Owner removals must be applied to the actual export fields, even after an async proposal refill.
   reapplyRemovals();
   let payload=build(),preview,downgraded=false;
   try{preview=await post(payload,'json')}
   catch(e){
    // No Search Console row for this exact page and search term: package it as "Observed" instead (a smaller claim),
    // and say so; never as verified.
    if(!['VERIFIED_GSC_EVIDENCE_NOT_FOUND','VERIFIED_PAGE_QUERY_REQUIRED','VERIFIED_GSC_EVIDENCE_UNAVAILABLE'].includes(e.code))throw e;
    $('evidence').value='observed';payload=build();downgraded=true;preview=await post(payload,'json');
   }
   if(!preview.success||preview.manifest?.publication_allowed!==false)throw Error('Editor safety check failed');
   const zip=await post(payload,'zip');
   const file=new Blob([zip],{type:'application/zip'});
   const href=URL.createObjectURL(file),a=document.createElement('a');
   a.href=href;a.download='contentscale-growth-cms-neutral.zip';document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(href),3000);
   status('downloadStatus','ZIP ready. The ZIP download does not publish your page. If the change is already live, confirm its publication in step 5 below.'+
    (downgraded?' Research evidence set to “Observed”: Search Console has no verified row for this page and “'+payload.focus_query+'”, so the package makes no Search Console claim.':'')+
    (preview.manifest?.growth_proposal?(preview.manifest.growth_proposal.editor_changed_text?' The text differs from Growth proposal #'+preview.manifest.growth_proposal.id+' (recorded in the package).':' Text exactly as in Growth proposal #'+preview.manifest.growth_proposal.id+'.'):'')+
    ((preview.warnings||[]).length?' Review: '+preview.warnings.join(', '):''),false);
   safe.exported=true;showPublicationForm(payload);
  }catch(err){status('downloadStatus',err.message||'Download failed',true)}
  finally{buttonProgress(btn,false,!!safe.exported);ready()}
 });
 // Only after the package exists: the owner records when the editor actually published it (starts the 28-day measurement).
 function localNow(){var d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
 function showPublicationForm(payload){
  try{var pa=$('publishedAt');pa.max=localNow();if(!pa.value)pa.value=localNow()}catch(e){}
  safe.published={page_id:pageId,query:payload.focus_query,growth_proposal_id:payload.growth_proposal_id};
  var heads=payload.approved_changes.map(c=>(/<h2>([\s\S]*?)<\/h2>/.exec(c.html)||[])[1]).filter(Boolean).map(h=>h.replace(/&[^;]+;/g,' ').trim());
  if(!$('publicationNotes').value)$('publicationNotes').value='Added to '+safe.source.canonical_url+': '+heads.join('; ')+(payload.growth_proposal_id?' (Growth proposal #'+payload.growth_proposal_id+')':'');
  $('publicationWrap').hidden=false;
 }
 // Record the publication; afterwards the same form corrects it (text, date, reminder addresses), it never locks
 // (owner 2026-11-02: "after the download I changed it, so I must be able to edit").
 $('publicationForm').addEventListener('submit',async function(ev){
  ev.preventDefault();var btn=$('recordPublication');btn.disabled=true;buttonProgress(btn,true);
  var editing=!!safe.publicationId;
  try{
   if(!safe.published)throw Error('Download the reviewed package first');
   if(!$('confirmPublished').checked)throw Error('Confirm that the change was actually published on the live website before recording its date.');
   if(!safe.published.query)throw Error('A working query is required to measure the change');
   var at=new Date($('publishedAt').value);if(!Number.isFinite(at.getTime()))throw Error('Enter the actual publication date and time');
   // A time later than now cannot be the publication time (owner 2026-11-02: an unclear refusal); say it in local time.
   if(at.getTime()>Date.now()+300000)throw Error('This time ('+at.toLocaleString()+') is later than now ('+new Date().toLocaleString()+'). Enter when the change actually went live (check AM/PM).');
   var body={notes:$('publicationNotes').value.trim(),published_at:at.toISOString(),reminder_emails:$('reminderEmails')?$('reminderEmails').value:''};
   var url='/api/tracker-client/'+encodeURIComponent(token)+'/growth/publication'+(editing?'/'+encodeURIComponent(safe.publicationId):'');
   var r=await fetch(url,{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(editing?body:{...safe.published,...body})});
   var d=await r.json();
   if(!r.ok||d.success!==true)throw Error(d.error||'Not saved');
   safe.publicationRecorded=true;safe.publicationId=d.publication&&d.publication.id||safe.publicationId;
   status('downloadStatus','Website publication recorded for this page. The ZIP itself did not publish the change; your confirmed live publication is saved separately.',false);
   var cf=d.reminder&&d.reminder.confirmation;
   var rem=d.reminder&&d.reminder.error?' The reminder could not be saved; try again.':d.reminder?' Reminder e-mail to '+d.reminder.emails.join(', ')+' on '+String(d.reminder.due_at).slice(0,10)+'.'+
    (cf?(cf.sent?' A confirmation e-mail was sent just now'+(cf.translation&&cf.translation!=='AI_CHECKED'?' in English (no checked translation into the page language was available)':cf.language&&cf.language!=='en'?' in the page language ('+cf.language+')':'')+'; check your inbox (and spam).':cf.reason==='EMAIL_NOT_CONFIGURED'?' Warning: e-mail sending is not configured on the server (BREVO_API_KEY), so no confirmation and no reminder can be sent.':' Warning: the confirmation e-mail was not accepted by the mail service; the reminder may not arrive.'):''):' No reminder e-mail set.';
   status('publicationStatus',(editing?'Changes saved.':'Recorded. Growth reads the Search Console numbers of both periods itself when they are final; at the end of the test period you enter your enquiries from the e-mail link (or on the measurement page). You can close this page.')+rem+' You can still correct this record here while this page is open.',false);
  }catch(err){status('publicationStatus',err.message||'Not saved',true)}
  finally{buttonProgress(btn,false,false);btn.disabled=false;btn.textContent=safe.publicationId?'Save changes to this publication':'Save publication checkpoint'}
 });
 // An edited package is a new candidate and can be exported again; no silent duplicate downloads.
 $('handoffForm').addEventListener('input',function(ev){
  if(!safe.exported)return;
  if(ev.target&&ev.target.matches('input,textarea,select')){safe.exported=false;ready()}
 });
 $('handoffForm').addEventListener('change',function(ev){
  if(!safe.exported)return;
  if(ev.target&&ev.target.matches('input,textarea,select')){safe.exported=false;ready()}
 });
 // Direct from Growth: verify owner, source and research automatically; never approve or publish.
 if(Number.isSafeInteger(pageId)&&pageId>0)Promise.resolve().then(()=>{if(!$('checkSource').disabled)$('checkSource').click()});
})();