// Growth: choose the customer search question for the selected page (Tracker Growth research page).
// Google's own questions and labelled AI suggestions; the owner can edit or type one. Choosing reloads the research
// with that question (&query=). Nothing is saved or published here.
(function(){
 var box=document.getElementById('customerQuestion');if(!box)return;
 var btn=document.getElementById('cqFind'),st=document.getElementById('cqStatus'),list=document.getElementById('cqList');
 var manual=document.getElementById('cqManual'),manualGo=document.getElementById('cqManualGo');
 // One browser-only draft per Tracker page and market. Explicit URL choices take precedence.
 var params=new URL(location.href).searchParams;
 var key='growthTrackerQuestionDraft:'+location.pathname+':'+(params.get('page_id')||'')+':'+(params.get('market')||'');
 var savedRaw=null;try{savedRaw=localStorage.getItem(key)}catch(e){}
 var saved=savedRaw==='__RESET__'?'':savedRaw||'';
 var explicit=params.get('query');
 if(manual&&explicit===null&&saved)manual.value=saved.slice(0,300);
 function saveDraft(v){try{localStorage.setItem(key,String(v||'').slice(0,300))}catch(e){}}
 if(manual){manual.addEventListener('input',function(){saveDraft(manual.value)});if(explicit!==null)saveDraft(manual.value)}
 var reset=document.createElement('button');reset.type='button';reset.id='cqReset';reset.textContent='Clear question';reset.className='ghost';reset.style.marginLeft='8px';
 if(manualGo&&manual){manualGo.insertAdjacentElement('afterend',reset);reset.addEventListener('click',function(){
  try{localStorage.setItem(key,'__RESET__')}catch(e){}
  manual.value='';var own=document.getElementById('cqOwn');if(own)own.value='';
  // Clear the URL override as well, without losing the selected page. Do not trigger automatic discovery on reset.
  var u=new URL(location.href);u.searchParams.delete('query');history.replaceState(null,'',u.pathname+u.search+u.hash);
  if(st)st.textContent='Question cleared. You can type a new one or choose a suggestion.';
 })}

 function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function go(q){q=String(q||'').replace(/\s+/g,' ').trim().slice(0,300);if(!q){st.textContent='Choose or type a question first.';return}
  saveDraft(q);
  var u=new URL(location.href),current=(u.searchParams.get('query')||'').trim();
  // Choosing the same question must NOT reset the entire page (owner report 2026-11-12).
  if(q===current){st.textContent='This question is already selected. Its research is shown below; no restart is needed.';
   var target=document.getElementById('growthAiCheck')||document.getElementById('growthGapChoice');
   if(target)target.scrollIntoView({behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});return}
  u.searchParams.set('query',q);u.searchParams.delete('auto_q');u.searchParams.delete('keyword_only');
  st.textContent='Opening research for the newly selected question. Your earlier research stays saved under its original question; no content is deleted.';
  location.assign(u.pathname+u.search+u.hash)}
 if(manualGo&&manual)manualGo.addEventListener('click',function(){go(manual.value)});
 if(manual)manual.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();go(manual.value)}});
 // On first opening an existing page, discover a question automatically. Never overwrite an explicit URL query.
 // This one-time redirect gives the research and saved-result endpoints the same selected question.
 if(!explicit&&savedRaw===null){
  st.textContent='Finding a customer question automatically… You can always replace it.';
  fetch(box.getAttribute('data-api'),{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
   var found=d&&d.success&&Array.isArray(d.questions)?d.questions:[];
   var preferred=found.filter(function(q){return q.text===d.best_question})[0]||found.filter(function(q){return q.priority==='OBSERVED_GOOGLE'})[0]||found.filter(function(q){return q.source==='AI_SUGGESTION'})[0];
   if(preferred&&preferred.text){if(manual&&manual.value.trim())return;st.textContent='Automatically selected: '+preferred.text+' · '+preferred.label+'. You can change it.';go(preferred.text)}
   else st.textContent='No verified customer question was found automatically. Type your own question or use the optional suggestions.';
  }).catch(function(){st.textContent='Automatic question discovery unavailable. You can type your own question.'});
 }
 btn.addEventListener('click',async function(){btn.disabled=true;st.textContent='Looking up how customers search (Google, and AI suggestions)…';list.innerHTML='';
  try{var r=await fetch(box.getAttribute('data-api'),{credentials:'same-origin',cache:'no-store'});var d=await r.json();if(!d.success)throw Error('Customer questions are not available right now.');
   var g=d.google&&d.google.status,why=g==='GOOGLE_NOT_CONFIGURED'?' Google questions need Serper on the server.':g==='GOOGLE_UNAVAILABLE'?' Google could not be reached.':'';
   st.textContent=(d.questions.length?d.questions.length+' question(s)'+(d.searched_with?' for “'+d.searched_with+'”':'')+(d.market?' in '+d.market.name:'')+'.':'No questions found.')+why;
   var h='<fieldset><legend>Customer questions · strongest relevant observation first</legend>'+d.questions.map(function(q,i){return '<label style="display:block;margin:6px 0"><input type="radio" name="cq" value="'+esc(q.text)+'"'+(q.text===d.best_question?' checked':'')+'> '+esc(q.text)+' <small style="display:inline">· '+esc(q.label)+(q.text===d.best_question?' · Best match':'')+'</small></label>'}).join('')+
    '<label style="display:block;margin:10px 0 4px">Or type or edit the question</label><input id="cqOwn" type="text" maxlength="300" style="width:min(100%,560px);font:inherit;padding:6px 8px" value="'+esc(d.best_question||'')+'"></fieldset>'+
    '<p><button type="button" id="cqGo">Use this question for research →</button></p><p class="info">Choosing a different question opens its own saved research; it does not delete your previous report or publish anything.</p><p class="info">'+esc(d.note)+'</p>';
   list.innerHTML=h;var own=document.getElementById('cqOwn');
   if(saved&&own)own.value=manual&&manual.value||saved;
   if(own)own.addEventListener('input',function(){saveDraft(own.value)});
   list.querySelectorAll('input[name=cq]').forEach(function(r){r.addEventListener('change',function(){own.value=r.value;saveDraft(own.value)})});
   document.getElementById('cqGo').textContent='Use this question for research →';
   document.getElementById('cqGo').addEventListener('click',function(){go(own.value)});
  }catch(e){st.textContent=e.message}btn.disabled=false});
})();
