(function(){
 'use strict';
 var form=document.getElementById('growthSimpleForm');
 if(!form)return;
 var page=document.getElementById('growthSimplePage'),filter=document.getElementById('growthSimpleFilter'),
  continueBtn=document.getElementById('growthSimpleContinue'),pageStatus=document.getElementById('growthSimplePageStatus'),
  status=document.getElementById('growthSimpleStatus');
 var originalCountries=document.getElementById('growthSimpleOriginalCountries').value,
  originalLanguage=document.getElementById('growthSimpleOriginalLanguage').value;
 var options=Array.from(page.options).slice(1);
 function sync(){
  var selected=page.options[page.selectedIndex],valid=!!page.value&&!selected.disabled&&!selected.hidden;
  continueBtn.disabled=!valid;
  continueBtn.textContent=valid?'Run Growth research →':'Choose a page first';
  pageStatus.textContent=valid?'Selected: '+selected.textContent:'Select a page first. Nothing is selected automatically.';
 }
 page.value='';
 sync();
 page.addEventListener('change',sync);
 filter.addEventListener('input',function(){
  var term=filter.value.toLowerCase().replace(/[^a-z0-9]/g,''),visible=0;
  options.forEach(function(option){
   var matches=!term||option.textContent.toLowerCase().replace(/[^a-z0-9]/g,'').includes(term);
   option.hidden=!matches;option.disabled=!matches;
   if(matches)visible++;
  });
  if(page.value&&(page.options[page.selectedIndex].disabled||page.options[page.selectedIndex].hidden))page.value='';
  sync();
  status.textContent=visible+' matching page(s). Choose one to continue.';
 });
 function countryPhrase(v){return String(v||'').trim()}
 form.addEventListener('submit',async function(e){
  e.preventDefault();
  var selected=page.options[page.selectedIndex];
  if(!page.value||!selected||selected.disabled||selected.hidden)return;
  var id=Number(page.value);
  if(!Number.isSafeInteger(id)||id<=0)return;
  var question=String(form.elements.query.value||'').trim();
  var location=String(form.elements.location.value||'').trim();
  if(!question)question=String(selected.dataset.keyword||'').trim();
  // Location is an explicit user input: add it to the research query only
  // when that location is not already part of the selected question.
  if(location&&question&&!question.toLowerCase().includes(location.toLowerCase()))question+=' in '+location;
  if(location&&!question){
   status.textContent='Enter a customer question or seed keyword to research a specific location.';
   return;
  }
  var countries=countryPhrase(form.elements.countries.value),language=String(form.elements.language.value||'').trim();
  continueBtn.disabled=true;continueBtn.textContent='Opening Growth…';
  status.textContent='Preparing research for the selected page…';
  try{
   if(countries!==originalCountries||language!==originalLanguage){
    if(!countries&&!language)throw Error('Choose a market or language, or leave the original defaults unchanged.');
    var token=locationToken(),res=await fetch('/api/tracker-client/'+encodeURIComponent(token)+'/growth/markets?page_id='+id,{
     method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({countries:countries,language:language})});
    var result=await res.json().catch(function(){return {}});
    if(!res.ok||!result.success)throw Error(result.code==='UNKNOWN_COUNTRY'?'Choose a listed country, such as us — United States.':result.code==='UNKNOWN_LANGUAGE'?'Choose a listed language, such as English.':'Could not save target market and language.');
   }
   var uri='/track/'+encodeURIComponent(locationToken())+'/growth/auto-research?page_id='+encodeURIComponent(id);
   if(question)uri+='&query='+encodeURIComponent(question);
   window.location.assign(uri);
  }catch(err){
   status.textContent=String(err&&err.message||'Could not open the research. Retry.');
   continueBtn.disabled=false;continueBtn.textContent='Run Growth research →';
  }
 });
 function locationToken(){return String(location.pathname.split('/')[2]||'')}
})();