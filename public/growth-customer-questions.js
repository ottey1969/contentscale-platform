// Growth: choose the customer search question for the selected page (Tracker Growth research page).
// Google's own questions and labelled AI suggestions; the owner can edit or type one. Choosing reloads the research
// with that question (&query=). Nothing is saved or published here.
(function(){
 var box=document.getElementById('customerQuestion');if(!box)return;
 var btn=document.getElementById('cqFind'),st=document.getElementById('cqStatus'),list=document.getElementById('cqList');
 var manual=document.getElementById('cqManual'),manualGo=document.getElementById('cqManualGo');
 function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 function go(q){q=String(q||'').replace(/\s+/g,' ').trim().slice(0,120);if(!q){st.textContent='Choose or type a question first.';return}
  var u=new URL(location.href);u.searchParams.set('query',q);location.href=u.pathname+u.search}
 if(manualGo&&manual)manualGo.addEventListener('click',function(){go(manual.value)});
 if(manual)manual.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();go(manual.value)}});
 // On first opening an existing page, discover a question automatically. Never overwrite an explicit URL query.
 // This one-time redirect gives the research and saved-result endpoints the same selected question.
 if(!new URL(location.href).searchParams.get('query')){
  st.textContent='Finding a customer question automatically… You can always replace it.';
  fetch(box.getAttribute('data-api'),{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
   var found=d&&d.success&&Array.isArray(d.questions)?d.questions:[];
   var preferred=found.filter(function(q){return q.source==='GOOGLE_PEOPLE_ALSO_ASK'})[0]||found.filter(function(q){return q.source==='GOOGLE_RELATED_SEARCH'})[0]||found[0];
   if(preferred&&preferred.text){st.textContent='Automatically selected: '+preferred.text+' · '+preferred.label+'. You can change it.';go(preferred.text)}
   else st.textContent='No verified customer question was found automatically. Type your own question or use the optional suggestions.';
  }).catch(function(){st.textContent='Automatic question discovery unavailable. You can type your own question.'});
 }
 btn.addEventListener('click',async function(){btn.disabled=true;st.textContent='Looking up how customers search (Google, and AI suggestions)…';list.innerHTML='';
  try{var r=await fetch(box.getAttribute('data-api'),{credentials:'same-origin',cache:'no-store'});var d=await r.json();if(!d.success)throw Error('Customer questions are not available right now.');
   var g=d.google&&d.google.status,why=g==='GOOGLE_NOT_CONFIGURED'?' Google questions need Serper on the server.':g==='GOOGLE_UNAVAILABLE'?' Google could not be reached.':'';
   st.textContent=(d.questions.length?d.questions.length+' question(s)'+(d.searched_with?' for “'+d.searched_with+'”':'')+(d.market?' in '+d.market.name:'')+'.':'No questions found.')+why;
   var h='<fieldset><legend>Customer questions</legend>'+d.questions.map(function(q,i){return '<label style="display:block;margin:6px 0"><input type="radio" name="cq" value="'+esc(q.text)+'"'+(i===0?' checked':'')+'> '+esc(q.text)+' <small style="display:inline">· '+esc(q.label)+'</small></label>'}).join('')+
    '<label style="display:block;margin:10px 0 4px">Or type or edit the question</label><input id="cqOwn" type="text" maxlength="120" style="width:min(100%,560px);font:inherit;padding:6px 8px" value="'+esc(d.questions[0]?d.questions[0].text:'')+'"></fieldset>'+
    '<p><button type="button" id="cqGo">Research this question →</button></p><p class="info">'+esc(d.note)+'</p>';
   list.innerHTML=h;var own=document.getElementById('cqOwn');
   list.querySelectorAll('input[name=cq]').forEach(function(r){r.addEventListener('change',function(){own.value=r.value})});
   document.getElementById('cqGo').addEventListener('click',function(){go(own.value)});
  }catch(e){st.textContent=e.message}btn.disabled=false});
})();
