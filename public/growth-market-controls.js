// Isolated owner market control: loads independently of the large research renderer.
// A rendering error in the report must not disable the market save button.
(function(){
 'use strict';
 var box=document.getElementById('marketSetting');
 if(!box)return;
 var button=document.getElementById('marketSave'),status=document.getElementById('marketSaid');
 var market=document.getElementById('marketInput'),language=document.getElementById('marketLanguage');
 if(!button||!status||!market||!language)return;
 status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 var original=button.textContent,working=false;
 function state(kind,message){
  status.textContent=message;
  status.dataset.state=kind;
  button.dataset.state=kind;
 }
 function busy(on,label){
  working=on;button.disabled=on;
  button.setAttribute('aria-busy',on?'true':'false');
  button.textContent=on?label:original;
 }
 button.addEventListener('click',async function(){
  if(working)return;
  busy(true,'Saving settings…');
  state('working','Saving your target market and language…');
  try{
   var url=box.getAttribute('data-url');
   if(!url||url.charAt(0)!=='/')throw Error('MARKET_ENDPOINT_MISSING');
   var response=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({countries:market.value,language:language.value})});
   var data=null;try{data=await response.json()}catch(e){throw Error('INVALID_SERVER_RESPONSE')}
   if(!response.ok||!data||data.success!==true)
    throw Error(data&&data.code||'HTTP_'+response.status);
   var result=data.markets||{};
   var countries=Array.isArray(result.countries)?result.countries:[];
   var summary=countries.length?'Market: '+countries.join(', '):'Market: inherited from Pre-Write or page';
   summary+=' · Language: '+(result.language||'inherited');
   state('saved','✓ Settings saved. '+summary+'. Starting a fresh research run…');
   busy(true,'Saved ✓ · Reloading…');
   window.location.reload();
  }catch(error){
   var code=String(error&&error.message||'SAVE_FAILED');
   var message=code==='UNKNOWN_COUNTRY'?'Select valid markets, separated by commas (e.g. nl — Netherlands).':
    code==='UNKNOWN_LANGUAGE'?'Select a language from the list (e.g. English).':
    code==='OWNER_ONLY_MARKET_SETTING'?'Open Growth with the Tracker owner link to change settings.':
    'Could not save ('+code+'). Check the connection and try again.';
   state('error',message);
   busy(false);
  }
 });
})();
