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
  localizeVisibleText(lang);
 }

 // Translate known interface copy only; leave user-provided query, URL and evidence unchanged.
 var NL_UI={
  'Growth Cockpit':'Growth-overzicht',
  'Automatic Growth research':'Automatisch Growth-onderzoek',
  'Run automatic Growth research · Search / AI / Content':'Automatisch onderzoek starten · Search / AI / Content',
  'Automatic research evidence':'Automatisch verzameld onderzoeksbewijs',
  'Page analysis — observed facts':'Pagina-analyse — waargenomen feiten',
  'Google Search Intelligence':'Google Search Intelligence',
  'Search and AI competitor research':'Onderzoek naar Search- en AI-concurrenten',
  'Prioritized, source-grounded improvement decisions':'Verbeterbesluiten op basis van bronnen',
  'Editor-ready Growth plan — preserve the original URL':'Growth-plan ter beoordeling — behoud de oorspronkelijke URL',
  'Existing section headings':'Bestaande tussenkoppen',
  'Evidence-based opportunities':'Kansen op basis van onderzoeksbewijs',
  'Automatically inspected public competitor pages':'Automatisch onderzochte openbare concurrentenpagina’s',
  'Candidate differences — confirm before editing':'Mogelijke verschillen — eerst verifiëren',
  'Existing AI visibility evidence':'Bestaand bewijs voor AI-zichtbaarheid',
  'Proposed sections from observed sources':'Voorgestelde secties op basis van bronnen',
  'Download research report (JSON)':'Onderzoeksrapport downloaden (JSON)',
  'Open cached analysis':'Opgeslagen analyse openen',
  'No supported observations in this source.':'Geen onderbouwde observaties in deze bron.',
  'Prepare a CMS-independent Growth handoff':'Maak een CMS-onafhankelijk Growth-pakket',
  'Optional manual source when the Tracker has no saved HTML':'Optionele handmatige bron wanneer de Tracker geen HTML heeft',
  'Original existing page HTML (H1 and paragraph required; 120–120,000 bytes)':'Oorspronkelijke pagina-HTML (H1 en alinea vereist; 120–120.000 bytes)',
  'I supplied this historical page source and understand it is not live-verified. I will check the real page before implementing anything.':'Ik heb deze historische paginabron aangeleverd en begrijp dat deze niet live is gecontroleerd. Ik controleer de huidige pagina voordat ik iets aanpas.',
  '1. Check original Tracker page':'1. Controleer de oorspronkelijke Tracker-pagina',
  '2. Review the existing page and evidence':'2. Beoordeel de bestaande pagina en het bewijs',
  '3. Approve useful content for the original page':'3. Keur nuttige inhoud voor de bestaande pagina goed',
  '4. Download reviewed CMS handoff ZIP':'4. Download het gecontroleerde CMS-pakket (ZIP)',
  'Website editor':'Website-editor',
  'Research evidence':'Onderzoeksbewijs',
  'Needs access — no verified GSC':'Toegang nodig — geen geverifieerde GSC',
  'Observed — editor-reviewed source':'Waargenomen — bron gecontroleerd door redacteur',
  'Verified — exact GSC page/query data':'Geverifieerd — exacte GSC-pagina en zoekopdracht',
  'Working query (never claim an unverified ranking)':'Werkzoekopdracht (geen onbewezen positie claimen)',
  'Reviewed SEO title':'Gecontroleerde SEO-titel',
  'Reviewed meta description':'Gecontroleerde metabeschrijving',
  'New approved H2 heading':'Nieuwe goedgekeurde H2-kop',
  'Fact-checked copy (at least 30 characters)':'Gecontroleerde tekst (minimaal 30 tekens)',
  'Optional contextual internal link URL':'Optionele relevante interne link-URL',
  'Internal link label':'Tekst voor de interne link',
  'Original page not checked yet.':'Oorspronkelijke pagina nog niet gecontroleerd.',
  'Other / custom CMS':'Ander / eigen CMS',
  'Custom':'Eigen systeem',
  'Wix':'Wix',
  'WordPress':'WordPress',
  'Webflow':'Webflow',
  'Squarespace':'Squarespace',
  'Prioritized page opportunities':'Pagina’s met groeikansen',
  'Top click opportunities — verified non-brand queries':'Klikkansen — geverifieerde niet-merkzoekopdrachten',
  'Research opportunities without GSC':'Onderzoekskansen zonder GSC',
  'Open research brief · no GSC required':'Open onderzoeksbrief · GSC niet nodig',
  'Open / copy execution brief':'Open of kopieer uitvoeringsbrief',
  'View publication measurement readiness':'Bekijk of publicatieresultaten meetbaar zijn',
  'Action plan · 4 steps':'Actieplan · 4 stappen',
  'Record actual publication':'Registreer echte publicatie',
  'Publication date and time':'Publicatiedatum en -tijd',
  'What actually changed?':'Wat is daadwerkelijk aangepast?',
  'Save publication checkpoint':'Publicatie registreren',
  'Saving…':'Opslaan…',
  'Recorded. Awaiting comparable GSC measurements.':'Geregistreerd. Vergelijkbare GSC-metingen ontbreken nog.',
  'Case Study locked':'Case Study vergrendeld',
  'Query / page':'Zoekopdracht / pagina',
  'Page':'Pagina',
  'Impressions':'Vertoningen',
  'Clicks':'Klikken',
  'Position':'Positie',
  'Diagnosis and action':'Analyse en actie',
  'Next step':'Volgende stap',
  'Needs access':'GSC-toegang nodig',
  'RANKING_GAP':'Positiekans — onderzoek nodig',
  'CTR_REVIEW':'CTR-analyse nodig',
  'CONTENT_RESEARCH':'Inhoudsonderzoek zonder GSC',
  'MEASURE':'Meetgegevens verzamelen',
  'SNIPPET_AND_INTENT_REVIEW':'Snippet en zoekintentie onderzoeken',
  'STRIKING_DISTANCE':'Binnen bereik top 10 — onderzoeken',
  'RANKING_AND_CONTENT':'Positie en inhoud onderzoeken',
  'LONG_TERM_VISIBILITY':'Zichtbaarheid op langere termijn',
  'Measured click growth':'Gemeten klikgroei',
  'Loading records…':'Meetgegevens laden…',
  'Step 1 — Record an actual published optimization':'Stap 1 — Registreer een gepubliceerde verbetering',
  '← Return to Growth Cockpit':'← Terug naar Growth',
  '← Growth Cockpit':'← Growth-overzicht',
  'Import both periods from GSC':'Importeer beide perioden uit GSC',
  'Enter the two exact GSC windows':'Voer de twee exacte GSC-perioden in',
  'GSC page/query export':'GSC-export per pagina en zoekopdracht',
  'Manually transcribed GSC page/query':'Handmatig overgenomen GSC-paginagegevens',
  'Read-only shared view — the account owner can record actual publication and GSC windows. The measurement evidence above remains visible.':'Gedeelde weergave, alleen lezen — uitsluitend de eigenaar kan publicaties en GSC-perioden registreren. De meetgegevens hierboven blijven zichtbaar.',
  'Research page intent, factual quality, content coverage and internal links; GSC is optional for starting this review':'Onderzoek zoekintentie, feiten, inhoud en interne links; GSC is niet nodig om te beginnen',
  'Collect comparable fresh GSC evidence':'Verzamel recente vergelijkbare GSC-gegevens',
  '1. Add Sitemap (GSC optional)':'1. Voeg sitemap toe (GSC optioneel)',
  '✨ Guided Tour':'✨ Rondleiding',
  '← Back':'← Vorige',
  'Next →':'Volgende →',
  'Finish tour ✓':'Rondleiding afronden ✓',
  'OVERVIEW':'OVERZICHT',
  'SETUP':'INSTELLEN',
  'DATA':'GEGEVENS',
  'WORKSPACE':'WERKRUIMTE',
  'PRIORITY':'PRIORITEIT',
  'EXECUTION':'UITVOERING',
  'GROWTH':'GROEI',
  'Open Growth directly':'Open Growth direct',
  'Visibility at a glance':'Zichtbaarheid in één oogopslag',
  'Track an existing page':'Volg een bestaande pagina',
  'Prewrite is only for a new spoke':'Prewrite is alleen voor een nieuwe ondersteunende pagina',
  'Connect real search demand':'Koppel echte zoekvraag',
  'Protect the site architecture':'Bescherm de websitestructuur',
  'Choose the brief language':'Kies de taal van de SEO-brief',
  'Control what AI may claim':'Bepaal welke claims AI mag gebruiken',
  'Run Gap Analysis before writing':'Voer eerst een gap-analyse uit',
  'Scan real opportunities':'Scan echte kansen',
  'Control the scan scope':'Bepaal welke pagina’s worden gescand',
  'One card, one decision cycle':'Eén paginakaart, één besliscyclus',
  'Verify five AI engines':'Controleer vijf AI-systemen',
  'Review the implementation plan':'Beoordeel het uitvoeringsplan'
 };
 var EN_UI={};Object.keys(NL_UI).forEach(function(k){if(!EN_UI[NL_UI[k]])EN_UI[NL_UI[k]]=k});
 function localizeVisibleText(lang){
  if(!document.body||typeof document.createTreeWalker!=='function')return;
  var dictionary=lang==='nl'?NL_UI:EN_UI,walker=document.createTreeWalker(document.body,4),node;
  while((node=walker.nextNode())){
   var p=node.parentElement;if(!p)continue;
   if(p.closest&&p.closest('script,style,pre,code,input,textarea,[contenteditable="true"],td:first-child strong,td:first-child a'))continue;
   var v=node.nodeValue,k=v.trim();
   if(!k||!Object.prototype.hasOwnProperty.call(dictionary,k))continue;
   node.nodeValue=v.replace(k,dictionary[k]);
  }
  if(location.pathname.indexOf('/growth/measurement')>=0){
   document.title=lang==='nl'?'Growth-metingen · ContentScale':'Growth measurement · ContentScale';
  }
 }

 function init(){
  var path=location.pathname,match=path.match(/^\/track\/([^/]+)(?:\/growth(?:\/measurement|\/cms-export|\/auto-research)?)?\/?$/);
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
   else{var first=document.querySelector('body > p');if(first)first.appendChild(select);else if(document.body)document.body.insertBefore(select,document.body.firstChild)}
  }
  select.addEventListener('change',function(){setLang(select.value)});
  apply(getLang());
  // GSC status resolves asynchronously. Keep any optional advice in the chosen language.
  var records=document.getElementById('records');
  if(records&&typeof MutationObserver==='function'){
   new MutationObserver(function(){apply(getLang())}).observe(records,{childList:true,subtree:true});
  }
  var tip=document.getElementById('tourTip');
  if(tip&&typeof MutationObserver==='function'){
   new MutationObserver(function(){apply(getLang())}).observe(tip,{childList:true,subtree:true});
  }
  var handoff=document.getElementById('handoffForm');
  if(handoff&&typeof MutationObserver==='function'){
   new MutationObserver(function(){apply(getLang())}).observe(handoff,{childList:true,subtree:true});
  }
  var banner=document.getElementById('gscSetupBanner');
  if(banner&&typeof MutationObserver==='function'){
   var observer=new MutationObserver(function(){apply(getLang())});
   observer.observe(banner,{childList:true,subtree:true});
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
