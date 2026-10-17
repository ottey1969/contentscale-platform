(function(){
 'use strict';
 // One canonical UI-language setting for Tracker and Growth; unrelated to brief language.
 var KEY='cs_ui_language',labels={
  en:{growth:'Growth',tracker:'Tracker',language:'Interface language',title:'Growth Cockpit',
   back:'← Tracker',main:'Prioritized page opportunities',queries:'Top click opportunities — verified non-brand queries',
   measured:'View publication measurement readiness',notAvailable:'Needs access',welcome:'1. Add your sitemap (GSC optional)',
   welcomeDesc:'Start with your website and sitemap. Connect GSC later for verified query and click measurements; Tracker does not require it.',
   tour:'✨ Guided Tour',gsc:'Recommended — Connect Google Search Console (optional)',
   gscDesc:'You can use Tracker now without connecting GSC. Connect it later for verified Google queries, clicks, impressions, rankings and comparable before/after measurements. Missing GSC data is not zero traffic.'},
  nl:{growth:'Growth',tracker:'Tracker',language:'Interfacetaal',title:'Growth-overzicht',
   back:'← Tracker',main:'Pagina’s met groeikansen',queries:'Belangrijkste klikkansen — geverifieerde niet-merkzoekopdrachten',
   measured:'Bekijk of publicatieresultaten meetbaar zijn',notAvailable:'Toegang tot GSC nodig',
   welcome:'1. Voeg je sitemap toe (GSC optioneel)',
   welcomeDesc:'Start met de website en sitemap. Koppel GSC later voor geverifieerde zoekopdrachten en klikken; de Tracker vereist dit niet.',
   tour:'✨ Rondleiding',gsc:'Aanbevolen — Koppel Google Search Console (optioneel)',
   gscDesc:'Je kunt de Tracker zonder GSC gebruiken. Koppel GSC later voor geverifieerde zoekopdrachten, klikken, vertoningen, posities en vergelijkbare voor- en nametingen. Ontbrekende gegevens betekenen niet nul bezoekers.'}
 };
 function getLang(){try{return localStorage.getItem(KEY)==='nl'?'nl':'en'}catch(e){return 'en'}}
 function setLang(lang){lang=lang==='nl'?'nl':'en';try{localStorage.setItem(KEY,lang)}catch(e){};apply(lang)}
 function translateText(el,en,nl,lang){
  if(!el)return;var text=lang==='nl'?nl:en;if(el.textContent!==text)el.textContent=text;
 }
 function apply(lang){
  lang=lang==='nl'?'nl':'en';document.documentElement.lang=lang;
  var dict=labels[lang],sel=document.getElementById('csUiLanguage');
  if(sel&&sel.value!==lang)sel.value=lang;
  var nav=document.getElementById('growthDirectNav');
  if(nav){nav.textContent='↗ '+dict.growth;nav.setAttribute('aria-label',lang==='nl'?'Ga direct naar Growth':'Go directly to Growth')}
  var tour=document.getElementById('tourBtn');
  if(tour)tour.textContent=dict.tour;
  var gate=document.getElementById('csGscOptionalAdvice');
  if(gate){translateText(gate.querySelector('strong'),labels.en.gsc,labels.nl.gsc,lang);
   var details=gate.querySelector('div');translateText(details,labels.en.gscDesc,labels.nl.gscDesc,lang)}
  var step=document.querySelector('.wl-step-title');if(step)translateText(step,labels.en.welcome,labels.nl.welcome,lang);
  var intro=document.querySelector('.wl-step-desc');if(intro)translateText(intro,labels.en.welcomeDesc,labels.nl.welcomeDesc,lang);
  var growth=location.pathname.match(/^\/track\/[^/]+\/growth\/?$/);
  if(growth){
   var h1=document.querySelector('h1');translateText(h1,labels.en.title,labels.nl.title,lang);
   var back=document.querySelector('body > p a[href*="/track/"]');translateText(back,labels.en.back,labels.nl.back,lang);
   document.querySelectorAll('h2').forEach(function(el){
    if(el.dataset.csOrig==null)el.dataset.csOrig=el.textContent;
    var v=el.dataset.csOrig;
    if(v===labels.en.queries)translateText(el,labels.en.queries,labels.nl.queries,lang);
    if(v===labels.en.main)translateText(el,labels.en.main,labels.nl.main,lang);
   });
   var stats={
    'Non-brand verified clicks':'Geverifieerde niet-merkklikken',
    'Non-brand impressions':'Niet-merkvertoningen',
    'Brand / ambiguous clicks':'Merk- en onduidelijke klikken',
    'Verified query rows':'Geverifieerde zoekopdrachten'
   };
   document.querySelectorAll('.stats section').forEach(function(el){
    var first=el.firstChild;if(!first||first.nodeType!==3)return;
    if(el.dataset.csOrig==null)el.dataset.csOrig=first.nodeValue;
    var original=el.dataset.csOrig;
    first.nodeValue=lang==='nl'?(stats[original]||original):original;
   });
   document.querySelectorAll('table th').forEach(function(el){
    if(el.dataset.csOrig==null)el.dataset.csOrig=el.textContent;
    var map={'Query / page':'Zoekopdracht / pagina','Impressions':'Vertoningen','Clicks':'Klikken','Position':'Positie','Diagnosis and action':'Analyse en actie','Page':'Pagina','CTR':'CTR','Next step':'Volgende stap'};
    el.textContent=lang==='nl'?(map[el.dataset.csOrig]||el.dataset.csOrig):el.dataset.csOrig;
   });
  }
 }
 function init(){
  var path=location.pathname,match=path.match(/^\/track\/([^/]+)(?:\/growth)?\/?$/);
  if(!match)return;
  var toolbar=document.getElementById('gbpAdvisorNav');
  if(toolbar){
   var button=document.getElementById('growthDirectNav');
   if(!button){
    button=document.createElement('a');button.id='growthDirectNav';button.className='cs-btn';
    button.href='/track/'+encodeURIComponent(match[1])+'/growth';
    button.style.cssText='border-color:#2563eb;color:#bfdbfe;font-weight:800;background:#0b244d;';
    button.title='Open Growth directly; GSC is optional';toolbar.parentNode.insertBefore(button,toolbar);
   }
  }
  var select=document.getElementById('csUiLanguage');
  if(!select){
   select=document.createElement('select');select.id='csUiLanguage';
   select.setAttribute('aria-label','Interface language');
   select.title='Interface language · English default / Nederlands';
   select.style.cssText='color:#dbeafe;background:#111827;border:1px solid #475569;border-radius:7px;padding:7px;font-size:12px;';
   [['en','EN'],['nl','NL']].forEach(function(pair){var o=document.createElement('option');o.value=pair[0];o.textContent=pair[1];select.appendChild(o)});
   if(toolbar){toolbar.parentNode.insertBefore(select,toolbar)}
   else{var first=document.querySelector('body > p');if(first)first.appendChild(select)}
  }
  select.addEventListener('change',function(){setLang(select.value)});
  apply(getLang());
  // GSC status resolves asynchronously. Keep any optional advice in the chosen language.
  var banner=document.getElementById('gscSetupBanner');
  if(banner&&typeof MutationObserver==='function'){
   var observer=new MutationObserver(function(){apply(getLang())});
   observer.observe(banner,{childList:true,subtree:true});
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
