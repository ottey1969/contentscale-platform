(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const token=String(location.pathname.split('/')[2]||'');
 const pageId=Number(new URLSearchParams(location.search).get('page_id'));
 const requestedQuestion=String(new URLSearchParams(location.search).get('query')||'').trim();
 const requestedMarket=String(new URLSearchParams(location.search).get('market')||'').trim();
 const base='/api/tracker-client/'+encodeURIComponent(token)+'/growth/cms-export';
 const safe={savedQuestionConfirmed:false,source:null,proposal:null,aiDraftReadyForQuery:null,exported:false,publicationRecorded:false,loadingSource:false,priorPublication:null,publicationChoice:null,newPublication:false,publicationId:null};
 // Local persistence per client/page; source text and approvals remain server-authoritative.
 const removalKey='growth-removed:'+encodeURIComponent(token)+':'+pageId;
 // Removals are remembered on the server per page (any browser or device) and, as a fallback, in this browser.
 var serverRemoved=[],serverKept=[];
 // "It is true — keep it": remembered on the server for this page; the package then no longer blocks that sentence.
 var normS=function(x){return String(x||'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\s+/g,' ').trim().toLowerCase()};
 function isKept(sentence){var n=normS(sentence);return serverKept.some(function(x){return normS(x)===n})}
 function saveDecision(sentence,how){
  if(how==='KEPT_BY_OWNER'){if(!isKept(sentence))serverKept.push(sentence)}else if(how==='UNDONE')serverKept=serverKept.filter(function(x){return normS(x)!==normS(sentence)});
  return fetch(base+'/removals',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({page_id:pageId,sentence:sentence,how:how})}).then(function(r){return r.ok}).catch(function(){return false});
 }
 // Opens the draft field that holds the sentence and selects it, so the owner can rewrite it there.
 function showSentence(sentence){var n=normS(sentence),fields=[$('copy')].concat([...document.querySelectorAll('.draft-copy')]);
  for(var i=0;i<fields.length;i++){var f=fields[i];if(!f||!f.value)continue;var v=f.value,lower=normS(v),at=lower.indexOf(n);if(at<0)continue;
   var d=f.closest('details');while(d){d.open=true;d=d.parentElement&&d.parentElement.closest('details')}
   f.scrollIntoView({block:'center'});f.focus();var raw=v.toLowerCase().indexOf(String(sentence).toLowerCase());try{if(raw>=0)f.setSelectionRange(raw,raw+String(sentence).length)}catch(e){}
   f.style.outline='3px solid #f59e0b';setTimeout(function(){f.style.outline=''},2500);return true}
  return false}
 function removedSentences(){var local=[];try{var v=JSON.parse(localStorage.getItem(removalKey)||'[]');local=Array.isArray(v)?v:[]}catch(e){}
  return local.concat(serverRemoved.filter(function(x){return local.indexOf(x)<0}))}
 function saveRemoval(sentence,how){
  // Do not claim persistence until the server actually acknowledges the decision.
  return fetch(base+'/removals',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({page_id:pageId,sentence:sentence,how:how||'REMOVED_BY_BUTTON'})}).then(function(r){
    if(!r.ok)return false;
    if(serverRemoved.indexOf(sentence)<0)serverRemoved.push(sentence);
    try{var all=removedSentences();if(!all.includes(sentence)){all.push(sentence);localStorage.setItem(removalKey,JSON.stringify(all))}}catch(e){}
    return true;
   }).catch(function(){return false});
 }
 function loadServerRemovals(){
  return fetch(base+'/removals?page_id='+encodeURIComponent(pageId),{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.json()})
   .then(function(d){if(d&&d.success){serverRemoved=(d.removed||[]).filter(function(x){return x.how!=='KEPT_BY_OWNER'}).map(function(x){return x.sentence});
    serverKept=(d.removed||[]).filter(function(x){return x.how==='KEPT_BY_OWNER'}).map(function(x){return x.sentence})}reapplyRemovals()}).catch(function(){});
 }
 var flagRows=[];
 function reapplyRemovals(){removedSentences().filter(function(x){return !isKept(x)}).forEach(removeFlaggedSentence);flagRows.forEach(function(f){f.refresh()})}
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
   // removal) were switched off by ready() and must come back on too (owner 2026-11-02: the
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
 $('researchReviewLink').href='/track/'+encodeURIComponent(token)+'/growth/auto-research?page_id='+encodeURIComponent(pageId)+(requestedQuestion?'&query='+encodeURIComponent(requestedQuestion):'')+(requestedMarket?'&market='+encodeURIComponent(requestedMarket):'');
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
   if($('checkSource')&&!safe.savedQuestionConfirmed&&!safe.loadingSource)$('checkSource').disabled=true;
  if(safe.loadingSource){
   document.querySelectorAll('button').forEach(function(b){b.disabled=true});
   return;
  }
  var hasManual=safe.source&&safe.source.manual_source_required;
  var manualReady=!hasManual||($('manualAcknowledged').checked&&$('manualOriginalHtml').value.trim().length>=120);
  var facts=[...document.querySelectorAll('.fact-item')],open=facts.filter(x=>!x.checked),factsChecked=!open.length;
  $('download').disabled=!!safe.exported||!(safe.source&&safe.aiDraftReadyForQuery===$('query').value.trim()&&$('approved').checked&&manualReady&&factsChecked);
  $('download').textContent=safe.exported?'4. CMS handoff ZIP downloaded':'4. Download reviewed CMS handoff ZIP';
  var hasCurrentDraft=!!safe.source&&safe.aiDraftReadyForQuery===$('query').value.trim();
   var draftBtn=$('generateEditorialDraft');
   draftBtn.dataset.stage=hasCurrentDraft?'done':'first';
   if(draftBtn.dataset.requestPending!=='true')draftBtn.textContent=hasCurrentDraft?'3A. AI draft generated ✓ Generate again':'3A. FIRST · Advanced: Generate a different draft →';
   var unlock=$('cmsUnlockHint');
   if(unlock){
    unlock.dataset.stage=!$('download').disabled&&!safe.exported?'ready':'locked';
    unlock.textContent=safe.exported?'✓ CMS handoff package downloaded. Next: publish and register the real publication date.':
     !hasCurrentDraft?'🔒 Step 3A first: click the orange Advanced button to generate this question’s draft. Then review and approve; the CMS button will turn blue.':
     !$('approved').checked||!factsChecked?'✓ AI draft generated. Next review all claims and approve in step 3C; then the CMS button turns blue.':
     $('download').disabled?'Finish the remaining required checks to unlock the CMS download.':
     '✓ Draft generated and approved. The blue CMS download button is now active.';
   }
  // Owner 2026-11-01: a grey button without a reason. Say exactly what is still missing.
  var missing=[];
  if(!safe.savedQuestionConfirmed)missing.push('select a matching saved Growth research question first');
   if(!safe.source)missing.push('check the original page first (step 1)');
   if(!$('title').value.trim()||!$('meta').value.trim())missing.push('review and enter the new SEO title and description for this exact question');
  if(safe.source&&safe.aiDraftReadyForQuery!==$('query').value.trim())missing.push('generate the required Advanced AI draft for this question in step 3');
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
  all.onclick=function(){var n=0;document.querySelectorAll('.growth-flagged-remove > .growth-flag-remove-btn').forEach(function(b){
   if(!b.disabled&&(/Remove this flagged sentence|Dismiss obsolete warning/.test(b.textContent))&&!isKept(b.parentNode.getAttribute('data-sentence'))){b.click();n++}
  });
   all.textContent=n?'Processing '+n+' sentence decision(s) — check results below':'Nothing in the editable draft to remove; review any obsolete warnings below';
   all.disabled=true};
  anchor.parentNode.insertBefore(all,anchor);
 }
 // A warning for text which is no longer in the editable package is not a
 // statement the owner must mark true. Dismiss its obsolete check persistently.
 function retireAbsentFlag(box,sentence){
  var key=normS(sentence);
  [...(box||document).querySelectorAll('.growth-flag-fact')].forEach(function(label){
   if(label.dataset.flaggedSentence===key)label.remove();
  });
  ready();
 }
 function goToCmsDownload(){
  var target=$('download'),reason=$('downloadWhy');
  if(!target)return;
  ready();
  var el=target.disabled&&reason&&!reason.hidden?reason:target;
  el.style.scrollMarginTop='110px';
  el.scrollIntoView({block:'center',behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  if(target.disabled&&reason){reason.style.outline='2px solid #f59e0b';reason.style.padding='8px';reason.style.borderRadius='6px';reason.textContent='CMS package not ready: '+reason.textContent}
  else target.focus();
 }
 function flaggedReviewAction(box,flag){
  var sentence=String(flag&&flag.sentence||'').trim();
  if(!sentence)return;
  // Already a button for this sentence in this box (it was flagged for another reason too): one is enough.
  if(box&&Array.prototype.some.call(box.querySelectorAll('.growth-flagged-remove'),function(x){return x.getAttribute('data-sentence')===sentence}))return;
  var row=document.createElement('div');row.className='growth-flagged-remove';row.setAttribute('data-sentence',sentence);
  var action=document.createElement('button');action.type='button';action.className='growth-flag-remove-btn';
  action.textContent='Remove this flagged sentence from draft';row.appendChild(action);
  var result=document.createElement('small');result.setAttribute('role','status');row.appendChild(result);
  var alt=document.createElement('button');alt.type='button';alt.hidden=true;row.appendChild(alt);
  var safety=flag&&(flag.code==='UNSUPPORTED_SAFETY_ASSURANCE'||/safe to wait|safety assurance/i.test(String(flag.reason||''))||/^\s*\[/.test(sentence));
  var show=document.createElement('button');show.type='button';show.className='growth-flag-show';show.textContent='Show in the text';row.insertBefore(show,action);
  show.addEventListener('click',function(){if(!showSentence(sentence))result.textContent='This exact sentence is not in your text anymore.'});
  var keep=document.createElement('button');keep.type='button';keep.className='growth-flag-keep';keep.textContent='It is true — keep it';if(!safety)row.insertBefore(keep,action);
  keep.addEventListener('click',async function(){keep.disabled=true;await saveDecision(sentence,'KEPT_BY_OWNER');refresh()});
  var undoKeep=document.createElement('button');undoKeep.type='button';undoKeep.className='growth-flag-unkeep';undoKeep.textContent='Undo';undoKeep.hidden=true;row.appendChild(undoKeep);
  undoKeep.addEventListener('click',async function(){undoKeep.disabled=true;await saveDecision(sentence,'UNDONE');undoKeep.disabled=false;refresh()});
  var done=function(text,label){action.disabled=true;action.textContent=label||'Removed — saved';result.textContent=text;alt.hidden=true;keep.hidden=true;show.hidden=true;undoKeep.hidden=true;ready()};
  // State of this sentence in the draft right now: removed earlier, gone from the text, changed, or still there.
  var refresh=function(){
   if(inDraft(sentence)&&isKept(sentence)){action.hidden=true;keep.hidden=true;show.hidden=false;alt.hidden=true;undoKeep.hidden=false;undoKeep.disabled=false;result.textContent='✓ Kept — you confirmed it is true for your business; the package records it as confirmed by you.';row.classList.add('growth-flag-kept');ready();return}
   row.classList.remove('growth-flag-kept');action.hidden=false;undoKeep.hidden=true;
   if(removedSentences().includes(sentence)&&!inDraft(sentence)){retireAbsentFlag(box,sentence);return done('Removed or dismissed earlier — remembered for this page.');}
   if(inDraft(sentence)){action.disabled=false;action.textContent='Remove this flagged sentence from draft';alt.hidden=true;show.hidden=false;keep.hidden=safety;keep.disabled=false;result.textContent='';return}
   var near=closestSentence(sentence);
   if(near){action.disabled=true;action.textContent='Not removed automatically';
    result.textContent='Why not: your text no longer has this exact sentence, but a changed version of it ('+Math.round(near.share*100)+'% the same words): “'+near.text+'”. It can still carry the same problem.';
    alt.hidden=false;alt.textContent='Remove the changed sentence';
    alt.onclick=function(){var n=removeFlaggedSentence(near.text);if(n){saveRemoval(sentence,'REMOVED_BY_BUTTON');done('Changed version removed — remembered for this page.')}
     else result.textContent='Why not: the changed sentence could not be found as one piece (it may run across lines). Delete it by hand in the text field.'};
    return}
   // The old proposal warned about a sentence that is not in the actual
   // editable text. Let the owner dismiss the stale warning instead of
   // requiring a meaningless "it is true" checkbox.
   action.hidden=false;action.disabled=false;action.textContent='Dismiss obsolete warning — sentence not in draft';
   keep.hidden=true;show.hidden=true;alt.hidden=true;undoKeep.hidden=true;
   result.textContent='This sentence is not in the editable CMS text. You can dismiss the obsolete warning; the final package still checks its content.';
  };
  action.addEventListener('click',async function(){
   action.disabled=true;
   var n=removeFlaggedSentence(sentence);
   if(n){
    var saved=await saveRemoval(sentence,'REMOVED_BY_BUTTON');
    if(!saved){result.textContent='Removed locally, but the decision could not be saved to this page. Check your connection before downloading.';action.disabled=false;return}
    retireAbsentFlag(box,sentence);
    done('Removed from '+n+' draft text field(s) and saved for this page. Review the remaining paragraph.');
   }else if(!inDraft(sentence)&&!closestSentence(sentence)){
    var savedAbsent=await saveRemoval(sentence,'NOT_IN_TEXT_ANYMORE');
    if(!savedAbsent){action.disabled=false;result.textContent='Cannot save this dismissal yet; retry when the connection works.';return}
    retireAbsentFlag(box,sentence);
    done('Obsolete warning dismissed and saved. The sentence is not in the CMS package.','Dismissed — not in draft');
   }else{action.disabled=false;refresh()}
  });
  flagRows.push({refresh:function(){if(row.isConnected)refresh()}});
  box.appendChild(row);
  // The first flagged sentence brings the page-wide "Remove all" button with it (placed above that box).
  if(box.parentNode)flaggedRemoveAll(box);
  setTimeout(refresh,0);
 }
 // One tickable line per sentence to check, in the proposal box (the download waits until each is ticked).
 // A multi-sentence review string is not a single independently verified
 // statement. Break it into readable checks; every sentence still needs review.
 function reviewStatements(item){
  var raw=String(item||'').replace(/\\\./g,'.').replace(/([.!?])(?=[A-Z][a-z])/g,'$1 ');
  var units=(raw.match(/[^.!?]+(?:[.!?]+|$)/g)||[]).map(function(x){return x.trim()}).filter(Boolean);
  return units.length>1?units:[String(item||'').trim()];
 }
 function checkItem(box,item,flaggedSentence){
  var bits=flaggedSentence?[String(item||'').trim()]:reviewStatements(item);
  bits.forEach(function(bit){
   var l=document.createElement('label');l.className='check';
   if(flaggedSentence){l.classList.add('growth-flag-fact');l.dataset.flaggedSentence=normS(flaggedSentence)}
   var c=document.createElement('input');c.type='checkbox';c.className='fact-item';c.addEventListener('change',ready);
   var sp=document.createElement('span');sp.textContent=bit;l.appendChild(c);l.appendChild(sp);box.appendChild(l);
  });
 }
 // Other proposals and written concepts stored for this page (for example improvements the owner chose on the research
 // page). Each one is added only when the editor clicks it; its checks come with it and the package records its id.
 // Legacy proposal selector deliberately removed. Only current research is eligible.
 function mergedReview(main){
  var out={},keys=['needs_fact_check','needs_owner_confirmation','needs_safety_review','requirements','flagged','basis','competitor_sources'];
  [main||{}].forEach(function(r){
   keys.forEach(function(k){if(Array.isArray(r[k]))out[k]=(out[k]||[]).concat(r[k])});
   if(r.dossier&&!out.dossier)out.dossier=r.dossier});
  // Persisted dismissals remain in the audit store; do not reproduce obsolete
  // unsupported claims in a new CMS package's active review notes.
  if(Array.isArray(out.flagged))out.flagged=out.flagged.filter(function(f){
   return !f||!f.sentence||!removedSentences().includes(f.sentence)||inDraft(f.sentence);
  });
  return out;
 }
 // The checked Growth proposal for this page is used as-is: same H2s, text, placement and fact-check list.
 async function loadProposal(src){
  try{
   var exactQuestion=String($('query').value||'').trim();
   var res=await fetch(base+'/proposal?page_id='+encodeURIComponent(pageId)+'&query='+encodeURIComponent(exactQuestion),{cache:'no-store',credentials:'same-origin'});
   var d=await res.json();
   if(!res.ok||d.success!==true||safe.source!==src)return;
   if(!d.proposal||!(d.proposal.sections||[]).length){
    var no=$('growthProposal');if((d.other_query_proposals||[]).length&&no){
     no.hidden=false;no.textContent='';
     var warn=document.createElement('p');warn.textContent='No reviewed Growth proposal for this exact question: “'+exactQuestion+'”. Older concepts for '+(d.other_query_proposals||[]).map(function(p){return '“'+p.focus_query+'”'}).join(', ')+' are kept as history, but are not safe to reuse automatically. Run Growth for this question first.';
     no.appendChild(warn);
    }
    return;
   }
   if($('heading').value.trim()||$('copy').value.trim()||document.querySelector('[data-growth-draft-section]'))return;
   var p=d.proposal,box=$('growthProposal');box.textContent='';box.hidden=false;
   if(String(p.focus_query||'').trim().toLowerCase()!==exactQuestion.toLowerCase()){
    var earlier=document.createElement('p');earlier.textContent='Saved proposal #'+p.id+' concerns “'+p.focus_query+'”, not this selected customer question “'+exactQuestion+'”. It is historical context only, not an eligible draft for download. Generate a new AI draft below.';box.appendChild(earlier);return;
   }
   var summary=document.createElement('strong');summary.textContent='Growth research proposal #'+p.id+' · '+String(p.created_at||'').slice(0,10);box.appendChild(summary);
   var fact=document.createElement('p');fact.className='small';
   fact.textContent='This is an UNAPPROVED draft for “'+String(p.focus_query||exactQuestion)+'”. It is not a verified content gap or fact-checked article. Review the original research before accepting any text.';
   box.appendChild(fact);
   var next=document.createElement('p');next.setAttribute('role','status');next.setAttribute('aria-live','polite');next.className='small';next.textContent='Saved research proposal for reference. Required workflow: generate a new Advanced AI draft for this question → check claims → approve → download.';box.appendChild(next);
   var summaryList=document.createElement('p');summaryList.textContent='Suggested sections: '+(p.sections||[]).map(function(x){return x.h2}).join(' · ');box.appendChild(summaryList);
   var review=document.createElement('button');review.type='button';review.textContent='Review proposed text and claims →';
   review.className='growth-primary-finish';box.appendChild(review);
   var skip=document.createElement('button');skip.type='button';skip.textContent='Dismiss saved proposal · generate a new AI draft';
   skip.style.cssText='margin-left:8px';box.appendChild(skip);
   skip.addEventListener('click',function(){
    safe.proposal=null;box.hidden=true;box.textContent='';
    $('approved').checked=false;ready();
    status('downloadStatus','Saved proposal #'+p.id+' was dismissed. Generate the required Advanced draft, then review and approve it.',false);
   });
   review.addEventListener('click',function(){
    if(review.disabled)return;
    review.disabled=true;skip.hidden=true;summaryList.hidden=true;
    next.textContent='Saved proposal review only. To unlock the CMS download, first generate a new Advanced AI draft for the current question, then review and approve its claims.';
    var first=p.sections[0];
    // The server has already matched the saved proposal to the selected customer intent. Do not reject valid 24-hour emergency repair variants by exact spelling.
    safe.proposal=p;
    $('heading').value=first.h2;$('copy').value=first.text;
    $('mainPlacement').textContent='';if(first.placement)$('mainPlacement').appendChild(placementSelect(first.placement));
    p.sections.slice(1,5).forEach(function(x,i){addSection(x.h2,x.text,'Growth proposal section '+(i+2),x.placement)});
    if(!$('query').value&&p.focus_query)$('query').value=p.focus_query;
    var reviewBox=document.createElement('div');reviewBox.className='growth-proposal-review';$('growthProposal').appendChild(reviewBox);
    var box=reviewBox;
    var h=document.createElement('strong');h.textContent='Unapproved draft #'+p.id+' · '+String(p.created_at||'').slice(0,10);box.appendChild(h);
    var intro=document.createElement('p');
    intro.textContent='Draft for '+(p.focus_query?'“'+p.focus_query+'”':'the selected question')+'. Comparing pages is research, not verification that all these additions are missing, accurate or safe. Nothing has been approved or published.';
    var scope=document.createElement('p');scope.className='small';
    scope.textContent='Editorial concept only. Growth proposed this copy for the stated query, but its facts, competitors, safety instructions and originality are NOT independently verified. Do not publish without reviewing each claim against reliable evidence. Roofing work on wet or damaged roofs must be left to qualified professionals.';
    box.appendChild(intro);box.appendChild(scope);
    if(p.evidence_label){var ev=document.createElement('p');ev.className='small';ev.textContent=/^SELECTION_CONCEPT_FOR_REVIEW/.test(String(p.evidence_label))?'Status: previously selected writing concept — not independently verified':'Research status: '+String(p.evidence_label).toLowerCase().replace(/_/g,' ');box.appendChild(ev)}
    if(p.intent_note){var inote=document.createElement('p');inote.className='small';inote.textContent=p.intent_note;box.appendChild(inote)}
    var r=p.review||{},groups=[['flagged_text','Flagged by Growth: rewrite or remove these sentences, or keep one you confirm is true for your business (the package is refused while an unconfirmed one is still in your text)'],['needs_fact_check','Check that these sentences are true'],['needs_owner_confirmation','Confirm with the business'],['needs_safety_review','Safety review by a qualified professional']];
    r.flagged_text=(r.flagged||[]).map(function(f){return (f.sentence?'“'+f.sentence+'”':'Section “'+f.h2+'”')+' — '+f.reason});
    var seen=new Set();
    groups.forEach(function(g){
     // One tick per sentence, under the first (strictest-listed) check that names it.
     var items=(r[g[0]]||[]).filter(function(x){if(seen.has(x))return false;seen.add(x);return true});if(!items.length)return;
     var t=document.createElement('p');t.textContent=g[1]+' (confirm them all at once at the end of step 3, or one by one):';box.appendChild(t);
     items.forEach(function(item){var match=g[0]==='flagged_text'?(r.flagged||[]).find(function(f){return f.sentence&&item.indexOf('“'+f.sentence+'”')>=0}):null;checkItem(box,item,match&&match.sentence)});
     if(g[0]==='flagged_text')(r.flagged||[]).forEach(function(f){flaggedReviewAction(box,f)});
    });
    if((r.competitor_sources||[]).length){
     var cs=document.createElement('p');cs.className='small';
     cs.textContent='Compared with: '+r.competitor_sources.map(x=>x.url).join(' · ');box.appendChild(cs);
    }
 
    review.hidden=true;
    reapplyRemovals();$('approved').checked=false;ready();
   });
   reapplyRemovals();
   $('approved').checked=false;ready();
  }catch(e){/* no proposal: manual or AI-assisted text stays available */}
 }
 function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 // AI proposal for title, meta description and link text: filled in for review; the current values stay one click away.
 function showVerifiedLink(){
  var hasLink=!!$('linkUrl').value.trim();
  $('growthVerifiedLinkFields').hidden=!hasLink;
  if(!hasLink)$('linkText').value='';
 }
 async function loadSeoProposal(target,linkUrl){
  try{
   var res=await fetch(base+'/seo-proposal?page_id='+encodeURIComponent(pageId)+'&query='+encodeURIComponent(String($('query').value||requestedQuestion||'').trim())+(linkUrl?'&link='+encodeURIComponent(linkUrl):''),{cache:'no-store',credentials:'same-origin'});
   var d=await res.json();if(!res.ok||d.success!==true)return;
   var old=target.querySelector&&target.querySelector('.seo-proposal');if(old)old.remove();
   var box=document.createElement('div');box.className='note seo-proposal';target.appendChild(box);
   if(linkUrl&&!d.link_url){
    if($('linkUrl').value===linkUrl){$('linkUrl').value='';$('linkText').value='';showVerifiedLink()}
    var note=document.createElement('p');
    note.textContent='Internal link not verified as a direct working page ('+String(d.link_verification||'unknown')+'). It was removed; no 301 or unverified link will enter the CMS package.';
    box.appendChild(note);
   }else if(linkUrl&&d.link_url&&d.link_url!==linkUrl){
    if($('linkUrl').value===linkUrl)$('linkUrl').value=d.link_url;
    showVerifiedLink();
    var note=document.createElement('p');
    note.textContent='Redirect resolved: the proposed link now points straight to '+d.link_url+'.';
    box.appendChild(note);
   }
   if(d.status!=='AI_PROPOSAL_FOR_REVIEW'){var n=document.createElement('p');n.textContent='No AI proposal for the title and description ('+String(d.status||'').toLowerCase().replace(/_/g,' ')+'): the current values are used; edit them if needed.';box.appendChild(n);return}
   // The owner's own values are kept from the first time only (a second source check must not keep the AI text as "current").
   if(!safe.seoOriginal)safe.seoOriginal={title:$('title').value,meta:$('meta').value,link:$('linkText').value};
   var cur=d.current||{},prev=safe.seoOriginal;
   $('title').value=d.title;$('meta').value=d.meta_description;if(d.link_text&&$('linkUrl').value)$('linkText').value=d.link_text;showVerifiedLink();
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
   // Read only the stored report for this exact question; opening CMS must never trigger paid research.
   var exactQuery=String($('query').value||'').trim();
   var url='/api/tracker-client/'+encodeURIComponent(token)+'/growth/auto-research/saved?page_id='+encodeURIComponent(pageId)+(exactQuery?'&query='+encodeURIComponent(exactQuery):'')+(new URLSearchParams(location.search).get('market')?'&market='+encodeURIComponent(new URLSearchParams(location.search).get('market')):'');
   var res=await fetch(url,{cache:'no-store',credentials:'same-origin'});
   if(!res.ok)throw Error('Saved research unavailable');
   var saved=await res.json();
   if(saved.success!==true||saved.found!==true||!saved.report)throw Error('No saved research for this exact customer question');
   var d=saved.report,x=d.handoff_suggestions||{};
   if(d.url!==src.canonical_url||x.safe!==true)throw Error('Saved report source identity did not match');
   if(d.competitor_overview&&typeof window.renderGrowthCompetitorOverview==='function'){var ov=$('growthCompetitorOverview');ov.textContent='';try{ov.hidden=!window.renderGrowthCompetitorOverview(d.competitor_overview,ov)}catch(e){ov.hidden=true}}
   showVerifiedLink(); // No fake link or inputs when no verified internal destination exists.
   // No arbitrary research hint can relabel a customer question or mark SEO metadata reviewed.
   // SEO fields are filled only by a deliberate new draft or by the editor.
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
    showVerifiedLink();
    var sug=document.createElement('p');sug.textContent='Internal link filled in by Growth: '+x.internal_url+(x.internal_reason?'. '+x.internal_reason:'')+' Check it, change it or clear both fields.';target.appendChild(sug);
   }
   else{showVerifiedLink()}
   // No automatic AI SEO request: opening the form should be free of AI-generation calls.
   if(!x.meta||!x.title){
    var missing=document.createElement('p');
    missing.textContent='Missing SEO metadata requires an editor-written, source-checked proposal.';
    target.appendChild(missing);
   }
   ready();
  }catch(e){target.hidden=false;target.textContent='No saved research for this exact customer question. Open Growth research explicitly to run or review it. Opening the CMS form did not trigger paid research.';}
 }
 if(!Number.isSafeInteger(pageId)||pageId<1){
  status('sourceStatus','A valid tracked page ID is required. Return to Growth and select a page.',true);
  $('checkSource').disabled=true;
 }
 if(requestedQuestion)$('query').value=requestedQuestion;
 if(!requestedQuestion)$('query').placeholder='Select the saved research question below — do not use the tracked seed';
 showVerifiedLink();
 $('query').addEventListener('input',function(){safe.savedQuestionConfirmed=false;safe.source=null;safe.proposal=null;safe.aiDraftReadyForQuery=null;$('approved').checked=false;$('title').value='';$('meta').value='';$('heading').value='';$('copy').value='';$('growthAdditionalSections').textContent='';$('growthProposal').hidden=true;$('growthProposal').textContent='';$('existingMetadata').hidden=true;$('linkUrl').value='';$('linkText').value='';showVerifiedLink();$('generateEditorialDraft').textContent='3A. FIRST · Advanced: Generate a different draft →';$('savedQuestionChooser').hidden=false;$('checkSource').disabled=true;ready()});
 $('query').addEventListener('change',function(){void recoverSavedQuestions()});
 $('approved').addEventListener('change',ready);
 if($('confirmAll'))$('confirmAll').addEventListener('change',function(){var on=this.checked;document.querySelectorAll('.fact-item').forEach(function(x){x.checked=on});ready()});
 $('manualAcknowledged').addEventListener('change',ready);
 $('manualOriginalHtml').addEventListener('input',ready);
 $('checkSource').addEventListener('click',async function(){
  if(!safe.savedQuestionConfirmed||!$('query').value.trim()){
    status('sourceStatus','Choose the exact saved customer question first. The tracked seed is not a substitute.',true);$('savedQuestionChooser').hidden=false;return;
   }
   this.disabled=true;buttonProgress(this,true);safe.source=null;safe.aiDraftReadyForQuery=null;lockWhileLoading(true);
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
   // Never replace a lost customer question with the tracked seed keyword.
    var seedNote=$('trackedSeedNote');if(seedNote)seedNote.textContent='Tracked seed keyword (different from customer question): '+(data.working_keyword||'not set');
   if(needsManual){
    status('sourceStatus','No saved Tracker HTML. Retrieving public original URL automatically…',false);
    try{
     const liveResponse=await fetch(base+'/public-source?page_id='+encodeURIComponent(pageId),
      {cache:'no-store',credentials:'same-origin'});
     const liveData=await liveResponse.json();
     if(!liveResponse.ok||liveData.success!==true)throw Error(liveData.code||'Public HTML unavailable');
     $('manualOriginalHtml').value=liveData.html;
     const title=/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(liveData.html);
     if(title){$('existingTitle').textContent='Current page title: '+title[1].replace(/<[^>]*>/g,' ').trim().slice(0,100);$('existingMetadata').hidden=false}
     const desc=(liveData.html.match(/<meta\b[^>]*>/gi)||[]).find(x=>/\bname\s*=\s*["']description["']/i.test(x));
     const meta=desc&&/\bcontent\s*=\s*["']([^"']+)["']/i.exec(desc);
     if(meta){$('existingMeta').textContent='Current page description (not checked): '+meta[1].slice(0,220);$('existingMetadata').hidden=false}
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
  var draftQuery=$('query').value.trim();
  if(!draftQuery){status('aiDraftStatus','Enter a customer question before generating.',true);delete btn.dataset.requestPending;return}
  safe.aiDraftReadyForQuery=null;$('approved').checked=false;ready();
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
    body:JSON.stringify({page_id:pageId,focus_query:draftQuery})});
   var output=await r.json();
   if(!r.ok||output.success!==true)throw Error(output.code||'Draft not available');
   if(output.status!=='AI_DRAFT_REVIEW_REQUIRED'||!output.draft){
    status('aiDraftStatus','A required AI draft is not available ('+(output.status||'Unconfigured')+'). The CMS download stays disabled. Saved research is preserved.',true);
    return;
   }
   if(output.canonical_url!==safe.source.canonical_url||Number(output.page_id)!==pageId||$('query').value.trim()!==draftQuery)
    throw Error('Source identity changed');
   var draft=output.draft;
   if(draft.seo_title)$('title').value=draft.seo_title;
   if(draft.meta_description)$('meta').value=draft.meta_description;
   var parts=draft.sections||[];
   if(!parts.length||!String(parts[0].h2||'').trim()||(parts[0].paragraphs||[]).join(' ').trim().length<30)throw Error('AI did not return reviewable text. The CMS download stays disabled.');
   if(parts.length){
    $('heading').value=parts[0].h2;
    $('copy').value=(parts[0].paragraphs||[]).join('\n\n');
   }
   // An AI draft replaces the checked Growth proposal; the package then no longer claims to come from it.
   safe.proposal=null;$('growthProposal').hidden=true;$('growthProposal').textContent='';$('mainPlacement').textContent='';
   $('growthAdditionalSections').textContent='';
   parts.slice(1,5).forEach(function(section,i){addSection(section.h2,(section.paragraphs||[]).join('\n\n'),'AI draft section '+(i+2)+' · verify facts',null)});
   reapplyRemovals();
   safe.aiDraftReadyForQuery=draftQuery;
   $('approved').checked=false;ready();
   status('aiDraftStatus','Editable AI draft prepared from the original page. All claims and each section still require your review and explicit approval.',false);
  }catch(err){status('aiDraftStatus',String(err.message||err),true)}
  finally{
   buttonProgress(btn,false,false);
   delete btn.dataset.requestPending;
   btn.textContent=safe.aiDraftReadyForQuery===$('query').value.trim()?'3A. AI draft generated ✓ Generate again':originalLabel;
   btn.disabled=!safe.source;
   previousButtonStates.forEach(item=>{if(item.button.dataset.growthDraftLocked==='true'){item.button.disabled=item.disabled;delete item.button.dataset.growthDraftLocked}});
   ready();
  }
 });
 function build(){
  showVerifiedLink();
  const src=safe.source;if(!src)throw Error('Check the saved original page first');
   if(safe.aiDraftReadyForQuery!==$('query').value.trim())throw Error('Generate the Advanced AI draft for this customer question before the CMS package');
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
   // Only after an actual package download: put the owner at the next action.
   var finish=document.getElementById('publicationWrap');if(finish){
    finish.style.scrollMarginTop='90px';
    requestAnimationFrame(function(){
     var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
     finish.scrollIntoView({block:'start',behavior:reduce?'auto':'smooth'});
    });
   }
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
  checkExistingPublication();
 }
 // Reusing the same page/question is NOT a new publication. The owner explicitly
 // chooses to correct the existing record or to register a distinct later live edit.
 function localDateTime(value){
  var d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
  d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);
 }
 function showPublicationChoice(previous){
  if(!previous||!previous.id)return;
  safe.priorPublication=previous;safe.publicationChoice=null;safe.newPublication=false;
  $('existingPublicationChoice').hidden=false;
  $('reusePublicationEmailLabel').hidden=true;
  $('previousPublicationSummary').textContent='Already recorded: '+localDateTime(previous.published_at).replace('T',' ')+' · '+String(previous.notes||'').slice(0,220)+'. Choose whether you are correcting it or confirming a different later live update.';
  $('publicationVersionChoice').textContent='Choose an option before saving. A duplicate checkpoint is refused.';
  $('recordPublication').disabled=true;
 }
 function selectPublicationChoice(mode){
  var old=safe.priorPublication;if(!old)return;
  safe.publicationChoice=mode;safe.newPublication=mode==='new';
  safe.publicationId=mode==='edit'?Number(old.id):null;
  $('recordPublication').disabled=false;
  $('reusePublicationEmailLabel').hidden=mode!=='new';
  if(mode==='edit'){
   $('publishedAt').value=localDateTime(old.published_at);
   $('publicationNotes').value=String(old.notes||'');
   $('publicationVersionChoice').textContent='Editing the original checkpoint. A substantive change sends a revised confirmation to previously opted-in recipients.';
   $('recordPublication').textContent='Save correction to existing publication';
  }else{
   $('publishedAt').value=localNow();
   $('publicationVersionChoice').textContent='Register only if different changes actually went live later. This starts a separate measurement period. Describe the new changes and select the actual live date. An updated e-mail is only sent to previously opted-in or newly supplied addresses when sending succeeds.';
   $('recordPublication').textContent='Record later publication (email if configured)';
  }
 }
 $('editPreviousPublication').addEventListener('click',function(){selectPublicationChoice('edit')});
 $('newPublishedUpdate').addEventListener('click',function(){selectPublicationChoice('new')});
 async function checkExistingPublication(){
  if(!safe.published||!safe.published.query)return;
  $('publicationVersionChoice').textContent='Checking earlier publications for this page and question…';
  try{
   var r=await fetch('/api/tracker-client/'+encodeURIComponent(token)+'/growth/measurement',{cache:'no-store',credentials:'same-origin'});
   var j=await r.json();if(!r.ok||!j.success)throw Error(j.error||'Unavailable');
   var matches=(j.records||[]).filter(function(p){
    return Number(p.page_id)===pageId&&String(p.query||'').trim().toLowerCase()===String(safe.published.query||'').trim().toLowerCase();
   }).sort(function(a,b){return String(b.published_at||'').localeCompare(String(a.published_at||''))});
   if(matches.length)showPublicationChoice(matches[0]);
   else $('publicationVersionChoice').textContent='No previous publication recorded for this exact page and question.';
  }catch(e){
   // The server remains authoritative and rejects duplicates even if the
   // optional lookup was unavailable. Never claim none were recorded.
   $('publicationVersionChoice').textContent='Could not check earlier publications. Submission will be checked by the server before a new record is saved.';
  }
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
   if(safe.priorPublication&&!safe.publicationChoice)throw Error('This page and query were already recorded. Choose Edit existing publication or Register a newer published change.');
   if(safe.newPublication&&at.getTime()<=Date.parse(safe.priorPublication.published_at)+60000)
    throw Error('The second live update must be later than the already recorded publication.');
   var enteredEmails=$('reminderEmails')?$('reminderEmails').value.trim():'';
   var body={notes:$('publicationNotes').value.trim(),published_at:at.toISOString()};
   if(enteredEmails)body.reminder_emails=enteredEmails;
   if(safe.newPublication){body.new_publication=true;body.send_update_email=$('reusePublicationEmail').checked;}
   if(!editing&&!safe.newPublication)body.reminder_emails=enteredEmails;
   var url='/api/tracker-client/'+encodeURIComponent(token)+'/growth/publication'+(editing?'/'+encodeURIComponent(safe.publicationId):'');
   var r=await fetch(url,{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(editing?body:{...safe.published,...body})});
   var d=await r.json();
   if(r.status===409&&d.code==='EXISTING_PUBLICATION'&&d.previous){
    showPublicationChoice(d.previous);
    throw Error('This publication already exists. Choose to correct the original record or register a different, later live update.');
   }
   if(!r.ok||d.success!==true)throw Error(d.error||'Not saved');
   safe.publicationRecorded=true;safe.publicationId=d.publication&&d.publication.id||safe.publicationId;
   var go=document.getElementById('publicationMeasurement'),link=document.getElementById('publicationMeasureLink');
   if(go&&link){
    go.hidden=false;
    link.href='/track/'+encodeURIComponent(token)+'/growth/measurement'+(safe.publicationId?'#publication-'+encodeURIComponent(safe.publicationId):'');
   }
   status('downloadStatus','Website publication recorded for this page. The ZIP itself did not publish the change; your confirmed live publication is saved separately.',false);
   var cf=d.reminder&&d.reminder.confirmation;
   var rem=d.reminder&&d.reminder.error?' The reminder could not be saved; try again.':d.reminder?' Reminder e-mail to '+d.reminder.emails.join(', ')+' on '+String(d.reminder.due_at).slice(0,10)+'.'+
    (cf?(cf.sent?' A confirmation e-mail was sent just now'+(cf.translation&&cf.translation!=='AI_CHECKED'?' in English (no checked translation into the page language was available)':cf.language&&cf.language!=='en'?' in the page language ('+cf.language+')':'')+'; check your inbox (and spam).':cf.reason==='EMAIL_NOT_CONFIGURED'?' Warning: e-mail sending is not configured on the server (BREVO_API_KEY), so no confirmation and no reminder can be sent.':' Warning: the confirmation e-mail was not accepted by the mail service; the reminder may not arrive.'):''):' No reminder e-mail set.';
   status('publicationStatus',(editing?'Changes saved.':'Recorded. Growth reads the Search Console numbers of both periods itself when they are final; at the end of the test period you enter your enquiries from the e-mail link (or on the measurement page). You can close this page.')+rem+' You can still correct this record here while this page is open.',false);
  }catch(err){status('publicationStatus',err.message||'Not saved',true)}
  finally{buttonProgress(btn,false,false);btn.disabled=false;btn.textContent=safe.publicationChoice==='new'?'Record later publication (email if configured)':safe.publicationId?'Save correction to existing publication':'Confirm publication → start measurement'}
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
 // Recover older links safely: show saved page/question pairs instead of inserting the seed.
 async function recoverSavedQuestions(){
  var wrap=$('savedQuestionChooser'),choices=$('savedQuestionChoices');if(!wrap||!choices)return;
  try{
   var resp=await fetch('/api/tracker-client/'+encodeURIComponent(token)+'/growth/auto-research/queries?page_id='+encodeURIComponent(pageId),
    {cache:'no-store',credentials:'same-origin'});
   var data=await resp.json();if(!resp.ok||data.success!==true)throw Error('Saved question lookup unavailable');
   var questions=Array.isArray(data.questions)?data.questions:[];
   // Keep saved variations separate by market, but never repeat identical question/market combinations.
   var seen=new Set();
   questions=questions.filter(function(q){var key=String(q.question||'').trim().toLowerCase()+'|'+String(q.market||'').trim().toUpperCase();if(!q.question||seen.has(key))return false;seen.add(key);return true});
   var current=String($('query').value||'').trim();
   var market=String(new URLSearchParams(location.search).get('market')||'').trim().toUpperCase();
   var matched=questions.some(function(q){return String(q.question).trim().toLowerCase()===current.toLowerCase()&&String(q.market||'').toUpperCase()===market});
   if(current&&matched){safe.savedQuestionConfirmed=true;wrap.hidden=true;ready();if(!$('checkSource').disabled)$('checkSource').click();return}
   // An explicit user-supplied question is never silently replaced, even when an older report exists.
   // Even one historical report must be chosen deliberately: it may be a different intent.
   if(!current||questions.length){
    wrap.hidden=false;choices.textContent='';
    if(current){var note=document.createElement('p');note.textContent='This exact question has no saved completed research for the selected page and market. The suggestions below are older, different research questions; they cannot be substituted for it.';choices.appendChild(note);
     var go=document.createElement('a');go.textContent='Open Growth research for this exact question →';go.href='/track/'+encodeURIComponent(token)+'/growth/auto-research?page_id='+encodeURIComponent(pageId)+'&query='+encodeURIComponent(current)+(market?'&market='+encodeURIComponent(market):'');go.style.cssText='display:inline-block;margin:8px 0;color:#1d4ed8;font-weight:700';choices.appendChild(go)}
    if(!questions.length){var no=document.createElement('p');no.textContent='No previously saved customer question was found for this Tracker page. Open Growth research and save a run first.';choices.appendChild(no);return}
    questions.forEach(function(q){
     var btn=document.createElement('button');btn.type='button';btn.textContent=q.question+(q.market?' · '+q.market:'');
     btn.style.cssText='margin:5px 6px 5px 0;padding:9px 12px;background:#fff;color:#1e40af;border:1px solid #93c5fd;border-radius:8px;text-align:left';
     btn.addEventListener('click',function(){choose(q)});choices.appendChild(btn);
    });
   }
  }catch(e){wrap.hidden=false;choices.textContent='Could not look up previous Growth questions. Open the exact Growth research URL and use its CMS link.'}
  function choose(q){
   var question=String(q.question||'').trim(),market=String(q.market||'').trim();if(!question)return;
   $('query').value=question;safe.savedQuestionConfirmed=true;safe.source=null;safe.aiDraftReadyForQuery=null;safe.proposal=null;$('approved').checked=false;
   $('title').value='';$('meta').value='';$('existingTitle').textContent='';$('existingMeta').textContent='';$('existingMetadata').hidden=true;
   $('linkUrl').value='';$('linkText').value='';showVerifiedLink();
   $('evidence').value='needs_access';$('checkSource').disabled=false;$('checkSource').textContent='1. Check original Tracker page';
   var url=new URL(location.href);url.searchParams.set('query',question);
   if(market)url.searchParams.set('market',market);else url.searchParams.delete('market');
   history.replaceState(null,'',url.pathname+url.search);
   $('researchReviewLink').href='/track/'+encodeURIComponent(token)+'/growth/auto-research?page_id='+encodeURIComponent(pageId)+'&query='+encodeURIComponent(question)+(market?'&market='+encodeURIComponent(market):'');
   wrap.hidden=true;choices.textContent='';
   $('heading').value='';$('copy').value='';$('growthAdditionalSections').textContent='';
   $('growthProposal').hidden=true;$('growthProposal').textContent='';
   ready();if(!$('checkSource').disabled)$('checkSource').click();
  }
 }
 // Direct from Growth: verify owner, source and research automatically; never approve or publish.
 if(Number.isSafeInteger(pageId)&&pageId>0)Promise.resolve().then(async()=>{
  await recoverSavedQuestions();
 });
})();