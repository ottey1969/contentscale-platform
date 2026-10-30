'use strict';
// Free public Growth check, separate from the Tracker: own pages, own API, own
// tables, own settings (GROWTH_FREE_* environment variables). It can be mounted
// in the main app or run on its own domain with server.cjs.
const crypto=require('node:crypto');
const store=require('./store.cjs');
const {runFreeGrowthResearch,validatePublicUrl}=require('./engine.cjs');
const {summarizeFreeGrowth}=require('./summary.cjs');
const ai=require('./ai-answers.cjs');
const {writeForSelection,pageFingerprint,MAX_ITEMS:MAX_WRITE_ITEMS}=require('../growth-selected-writing.cjs');
const {generateGrowthEditorDraft,sourceFacts}=require('../growth-source-grounded-editor.cjs');
const {fetchPublicGrowthHtml}=require('../growth-public-html-reader.cjs');

const int=(v,d)=>{const n=Number.parseInt(v,10);return Number.isFinite(n)&&n>=0?n:d};
// Access keys decide where the free check may be used. GROWTH_FREE_ACCESS_KEYS is
// either "key1,key2" or JSON: [{"key":"...","label":"partner-site","origins":["https://site.com"],
// "daily":20,"per_email":3,"brand":"...","contact_url":"https://...","service_text":"..."}].
// Keys are public identifiers (they appear in the link); limits and allowed sites are the protection.
function parseAccessKeys(raw,defaults){
 const text=String(raw||'').trim();
 if(!text)return [];
 let list;
 if(text.startsWith('[')){
  try{list=JSON.parse(text)}catch{console.warn('[free-growth] GROWTH_FREE_ACCESS_KEYS is not valid JSON; no keys active');return []}
 }else list=text.split(',').map(key=>({key:key.trim()}));
 if(!Array.isArray(list))return [];
 return list.filter(x=>x&&/^[A-Za-z0-9_-]{8,80}$/.test(String(x.key||''))).map(x=>{
  const origins=(Array.isArray(x.origins)?x.origins:x.origins?String(x.origins).split(/[\s,]+/):[]).map(o=>{
   try{const u=new URL(o);return u.protocol==='https:'||u.hostname==='localhost'?u.origin:null}catch{return null}
  }).filter(Boolean);
  // hosts: domains where this key applies without ?key= in the link (e.g. your own site).
  const hosts=(Array.isArray(x.hosts)?x.hosts:x.hosts?String(x.hosts).split(/[\s,]+/):[])
   .map(h=>String(h).trim().toLowerCase().replace(/^https?:\/\//,'').replace(/[/:].*$/,'').replace(/^www\./,'')).filter(h=>/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h));
  return {key:String(x.key),label:clean(x.label,60)||String(x.key).slice(0,6),origins,hosts,
   daily:int(x.daily,defaults.daily),perEmail:int(x.per_email,defaults.perEmail),
   brand:x.brand?clean(x.brand,80):defaults.brand,
   contactUrl:/^https:\/\//.test(x.contact_url||'')?x.contact_url:defaults.contactUrl,
   serviceText:x.service_text?clean(x.service_text,600):defaults.serviceText};
 });
}
function freeGrowthConfig(env=process.env){
 const base=freeGrowthDefaults(env);
 return {...base,accessKeys:parseAccessKeys(env.GROWTH_FREE_ACCESS_KEYS,base)};
}
function freeGrowthDefaults(env){
 return {
  enabled:env.GROWTH_FREE_ENABLED!=='false',
  brand:env.GROWTH_FREE_BRAND||'ContentScale',
  perEmail:int(env.GROWTH_FREE_PER_EMAIL_PER_DAY,3),
  perIp:int(env.GROWTH_FREE_PER_IP_PER_DAY,3),
  daily:int(env.GROWTH_FREE_DAILY_LIMIT,50),
  concurrency:Math.max(1,int(env.GROWTH_FREE_CONCURRENCY,2)),
  // Admin needs a long secret; a short one keeps the admin switched off.
  adminKey:String(env.GROWTH_FREE_ADMIN_KEY||'').length>=16?String(env.GROWTH_FREE_ADMIN_KEY):'',
  ipSalt:env.GROWTH_FREE_IP_SALT||env.SESSION_SECRET||'growth-free-check',
  contactUrl:/^https:\/\//.test(env.GROWTH_FREE_CONTACT_URL||'')?env.GROWTH_FREE_CONTACT_URL:'',
  privacyUrl:/^https?:\/\//.test(env.GROWTH_FREE_PRIVACY_URL||'')?env.GROWTH_FREE_PRIVACY_URL:'',
  hireWebhook:/^https:\/\//.test(env.GROWTH_FREE_HIRE_WEBHOOK_URL||'')?env.GROWTH_FREE_HIRE_WEBHOOK_URL:'',
  // Writing concepts for a selection costs an AI call: off | admin (only you) | invited (you + invited people) | all.
  writing:['off','admin','invited','all'].includes(String(env.GROWTH_FREE_WRITING||'').toLowerCase())?String(env.GROWTH_FREE_WRITING).toLowerCase():'admin',
  writeLimit:Math.max(1,int(env.GROWTH_FREE_WRITES_PER_CHECK,3)),
  serviceText:env.GROWTH_FREE_SERVICE_TEXT||'I write the missing sections in your voice, check every fact with you, publish nothing without your approval and measure the result in Search Console after 28 days.'
 };
}

// Values embedded in <script>: JSON with '<' escaped, so no value can close the script tag.
const js=x=>JSON.stringify(x).replace(/</g,'\\u003c');
const safeToken=x=>/^[A-Za-z0-9_-]{1,60}$/.test(String(x||''))?String(x):'';
const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EMAIL=/^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const clean=(x,n)=>String(x==null?'':x).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);

function page(title,body,cfg){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="${title.startsWith('Free')?'index,follow':'noindex'}"><style>
:root{--bg:#f6f8fc;--card:#fff;--ink:#172337;--muted:#5b6b82;--line:#d9e0eb;--accent:#168347;--accent-ink:#fff;--warn:#fff7ed;--warn-line:#fed7aa}
@media (prefers-color-scheme:dark){:root{--bg:#0f1622;--card:#172131;--ink:#e6edf7;--muted:#9fb0c7;--line:#2a374b;--accent:#2fa866;--accent-ink:#06130b;--warn:#2a2116;--warn-line:#6b4a1f}}
*{box-sizing:border-box}body{font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink);margin:0}
main{max-width:860px;margin:0 auto;padding:24px 16px 60px}h1{font-size:30px;line-height:1.2;margin:.4em 0}h2{font-size:21px;margin:1.6em 0 .5em}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:16px 0}.lead{font-size:18px;color:var(--muted)}
label{display:block;margin:12px 0 4px;font-weight:600}input,textarea{width:100%;padding:11px;border:1px solid var(--line);border-radius:8px;font:inherit;background:var(--bg);color:var(--ink)}
.check{display:flex;gap:8px;align-items:flex-start;font-weight:400}.check input{width:auto;margin-top:5px}
button,.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);border:0;border-radius:9px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
button:disabled{opacity:.6;cursor:wait}.ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
small,.muted{color:var(--muted)}a{color:var(--accent);overflow-wrap:anywhere}.note{background:var(--warn);border:1px solid var(--warn-line);border-radius:10px;padding:12px 14px}
.kicker{text-transform:uppercase;font-size:13px;font-weight:700;color:var(--accent);letter-spacing:.03em;margin:0}
blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--line);color:var(--muted)}ol li,ul li{margin:6px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.grid div{border:1px solid var(--line);border-radius:10px;padding:10px}
.grid strong{display:block;font-size:18px}.grid.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.grid.two a{font-size:14px}
.grid.five{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}.eng{text-align:center}.eng small{display:block}.eng strong{font-size:26px}.eng.yes{border-color:var(--accent)}.eng.no{border-color:#c2410c}
select{width:100%;padding:11px;border:1px solid var(--line);border-radius:8px;font:inherit;background:var(--bg);color:var(--ink)}h3{font-size:17px;margin:1.2em 0 .4em}.error{color:#c2410c}
</style></head><body><main>${body}<p class="muted" style="margin-top:40px">${esc(cfg.brand)} · Free Growth check${cfg.privacyUrl?` · <a href="${esc(cfg.privacyUrl)}">Privacy</a>`:''}</p></main></body></html>`;
}

function formPage(cfg,api,base,accessKey,invite=null){
 return page('Free Growth check — what is your page missing?',`
<p class="kicker">Free · no account needed</p>
<h1>Is your page found in Google — and in AI answers?</h1>
<p class="lead">Enter one page of your website. The check compares it with the pages Google ranks for your search and tells you in plain language whether to change something — or not. Then check in two minutes whether ChatGPT, Perplexity, Google AI Overviews, Claude and Copilot cite your page. You also get the full research data (JSON) to work with yourself.</p>
${invite?`<p class="note"><strong>Personal invitation${invite.label?' — '+esc(invite.label):''}.</strong> ${esc(invite.left)} of ${esc(invite.max)} checks left, valid until ${esc(invite.expires)}.${invite.email_hint?' Only works with the email address '+esc(invite.email_hint)+'.':''}</p>`:''}
<form id="f" class="card" novalidate>
 <label for="url">Page address</label><input id="url" name="url" type="url" required placeholder="https://www.yoursite.com/service-page/" maxlength="500">
 <label for="query">Search term (optional)</label><input id="query" name="query" maxlength="120" placeholder="e.g. roof repair lodi nj">
 <small>The words your customers type into Google. Leave empty to let the check derive it from your page.</small>
 <label for="email">Your email</label><input id="email" name="email" type="email" required maxlength="200" placeholder="you@company.com">
 <label class="check"><input type="checkbox" name="consent" required> <span>I agree that my email and the checked page are stored to run this check and show the result.${invite?'':` Max ${cfg.perEmail} free checks per day.`}</span></label>
 <label class="check"><input type="checkbox" name="marketing"> <span>You may email me about this result (optional).</span></label>
 <p><button type="submit">Run the free check</button> <small id="s" role="status"></small></p>
</form>
<div class="card"><h2 style="margin-top:0">What you get</h2><ul>
<li>One clear decision: <strong>leave it</strong>, <strong>add a missing answer</strong>, <strong>make a separate page</strong>, or <strong>not enough evidence</strong>.</li>
<li>Where to add it on your page, with the ranking pages that support it.</li>
<li>Whether AI answers cite your site or this page — and which sites they cite instead.</li>
<li>The full research as JSON, to process yourself or with your own tools.</li></ul>
<p class="muted">No ranking promises. Nothing is changed on your website. Takes about one minute.</p></div>
<script>
document.getElementById('f').addEventListener('submit',async function(e){e.preventDefault();var f=e.target,s=document.getElementById('s'),b=f.querySelector('button');
if(!f.consent.checked){s.textContent='Please accept the storage notice.';return}
b.disabled=true;s.textContent='Starting…';
try{var r=await fetch(${js(api)}+'/checks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:${js(accessKey)},invite:${js(invite?invite.token:'')},url:f.url.value,query:f.query.value,email:f.email.value,consent:true,marketing_consent:f.marketing.checked})});
var d=await r.json();if(!d.success)throw Error(d.error||'Could not start the check');location.href=d.result_url}
catch(err){s.textContent=err.message;s.className='error';b.disabled=false}});
</script>`,cfg);
}

function resultPage(cfg,api,base,id,key){
 // Brand, contact link and service text come from the access key of the check (API: offer).
 const q=`?k=${encodeURIComponent(key)}`;
 return page('Your Growth check result',`
<p><a id="back" href="${esc(base)}">← New check</a></p>
<div id="out" class="card"><p class="kicker">Working</p><h1>Checking your page…</h1><p class="muted">Reading your page and the pages that rank for your search. This usually takes under a minute. You can keep this page open; the link also works later.</p></div>
<script>
var API=${js(api+'/checks/'+id)},Q=${js(q)},CONTACT=${js(cfg.contactUrl)},SERVICE=${js(cfg.serviceText)},BRAND=${js(cfg.brand)};
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
var ENG_STATE={};
function aiHtml(a){var x=a.summary,h='<h2 id="ai">AI answers</h2><p class="lead"><strong>'+esc(x.headline)+'.</strong> '+esc(x.explanation)+'</p>';
 h+='<div class="grid five">'+x.engines.map(function(e){var st=!e.checked?'not checked':!e.verifiable?'no RESOURCES section — not verified':!e.sources?'no sources given':e.exact_page_cited?'cites this page':e.own_site_cited?'cites your site':'does not cite you';
  return '<div class="eng '+(e.checked&&e.verifiable?(e.own_site_cited?'yes':'no'):'')+'"><strong>'+(e.checked&&e.verifiable?esc(e.sources):'–')+'</strong><small>'+esc(e.label)+'</small><small>'+esc(st)+'</small></div>'}).join('')+'</div><p class="muted">Number = links in the RESOURCES list of that AI answer. Links that appear only in the answer text do not count as sources.</p>';
 if(x.top_cited_sites.length)h+='<h3>Sites AI cites for “'+esc(a.search_term)+'”</h3><ul>'+x.top_cited_sites.map(function(t){return '<li>'+esc(t.site)+' <small>— in '+esc(t.ai_systems)+' of '+esc(x.checked)+' AI answers'+(x.also_in_google.indexOf(t.site)>=0?' · also ranks in Google':'')+'</small></li>'}).join('')+'</ul>';
 if(x.steps.length)h+='<h3>What to do</h3><ol>'+x.steps.map(function(t){return '<li>'+esc(t)+'</li>'}).join('')+'</ol>';
 var next=x.engines.filter(function(e){return !e.checked})[0]||x.engines[0];
 h+='<div class="card"><h3 style="margin-top:0">Check '+(x.checked?'another':'an')+' AI system — free, takes 2 minutes</h3><ol><li>Choose the AI system.</li><li>Copy the prompt and paste it into a <strong>new chat with web search on</strong>.</li><li>Paste the complete answer below, including the source links.</li></ol>'+
  '<label>AI system<select id="aiEngine">'+x.engines.map(function(e){return '<option value="'+esc(e.id)+'"'+(e.id===next.id?' selected':'')+'>'+esc(e.label)+(e.checked?' ✓':'')+'</option>'}).join('')+'</select></label>'+
  '<label>Prompt (the same for every AI system)<textarea id="aiPrompt" rows="6" readonly>'+esc(a.prompt)+'</textarea></label><p><button type="button" class="ghost" id="aiCopy">Copy prompt</button></p>'+
  '<label>Answer from the AI system<textarea id="aiText" rows="7" maxlength="'+esc(a.max_paste)+'" placeholder="Paste the complete answer here"></textarea></label><p><button type="button" id="aiSave">Analyse answer</button> <small role="status" id="aiStatus"></small></p></div>';
 h+='<p class="muted">'+esc(x.caveat)+'</p>';return h}
function wireAi(){var b=document.getElementById('aiSave');if(!b)return;
 document.getElementById('aiCopy').onclick=function(){var t=document.getElementById('aiPrompt');t.select();if(navigator.clipboard)navigator.clipboard.writeText(t.value);this.textContent='Copied ✓'};
 b.onclick=async function(){var st=document.getElementById('aiStatus'),eng=document.getElementById('aiEngine').value,txt=document.getElementById('aiText').value;if(!txt.trim()){st.textContent='Paste the answer first.';return}b.disabled=true;st.textContent='Analysing…';
  try{var r=await fetch(API+'/ai'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine:eng,text:txt})});var x=await r.json();if(!x.success)throw Error(x.error||'Not analysed');
   var d=await (await fetch(API+Q,{cache:'no-store'})).json();render(d);var el=document.getElementById('ai');if(el)el.scrollIntoView()}catch(err){st.textContent=err.message;b.disabled=false}}}
var GAPS=null;
var GAP_GROUPS=[];
function gapsHtml(g,w){if(!g||g.status!=='OBSERVED')return '';GAP_GROUPS=(g.groups||[]).map(function(x){return [x.id,x.label]});
 var h='<h2 id="gaps">Choose what goes on your site</h2><p class="lead">'+esc(g.note)+'</p><p class="muted">Compared with '+esc(g.ranking_pages_read)+' readable ranking page(s). '+(g.items.length?g.items.length+' difference(s) found.':'No difference found.')+'</p>';
 var rec=(g.items||[]).filter(function(x){return x.recommended});
 if(rec.length)h+='<p class="note">Recommended first ('+rec.length+'): '+rec.map(function(x){return esc(x.title)}).join(' · ')+'. Supported by at least two ranking pages, missing or partly on your page, not contradicted by the AI. You decide.</p>';
 if((g.strengths||[]).length)h+='<h3>Keep: your page has this, the ranking pages read do not ('+g.strengths.length+')</h3><ul>'+g.strengths.map(function(s){return '<li>'+esc(s.heading)+'</li>'}).join('')+'</ul><p class="muted">These are not gaps and are not rewritten.</p>';
 if(!g.items.length)return h;
 GAP_GROUPS.forEach(function(gr){var list=g.items.filter(function(x){return x.group===gr[0]});if(!list.length)return;
  h+='<h3>'+esc(gr[1])+' ('+list.length+')</h3>';
  list.forEach(function(x){h+='<label class="check card gap"><input type="checkbox" class="gapPick" value="'+esc(x.id)+'"><span>'+(x.recommended?'<mark>Recommended</mark> ':'')+'<strong>'+esc(x.title)+'</strong> <small>'+esc(x.status)+(x.ranking_pages?' · on '+esc(x.ranking_pages)+(x.of?' of '+esc(x.of):'')+' ranking page(s)':'')+(x.your_section?' · closest on your page: “'+esc(x.your_section)+'”':'')+'</small>'+
   (x.priority&&x.priority.suggested_action?'<br><small>Action: '+esc(x.priority.suggested_action)+'</small>':'')+(x.priority&&x.priority.why?'<br><small>Why: '+esc(x.priority.why.join(' · '))+'</small>':'')+
   (x.examples.length?'<br><small>'+x.examples.map(function(e){return (e.position?'#'+esc(e.position)+' ':'')+esc(e.site)+(e.heading&&e.heading!==x.title?': “'+esc(e.heading)+'”':'')}).join(' · ')+'</small>':'')+'</span></label>'})});
 h+='<p><strong id="gapCount">0 selected</strong></p><p><button type="button" id="gapAll" class="ghost">Select all</button> <button type="button" id="gapNone" class="ghost">Clear</button></p>';
 h+='<p><button type="button" id="gapDownload">Download selection as editor brief</button> <button type="button" id="gapCopy" class="ghost">Copy</button> <span id="gapStatus" class="muted"></span></p>';
 if(w&&w.allowed)h+='<p><button type="button" id="gapWrite">Write selected with AI ('+esc(w.remaining)+' run(s) left)</button> <small class="muted">Concepts for review only, at most 4 topics per run; page elements are added by the editor. Nothing is published.</small></p>';
 h+='<div id="gapWritten"></div>';
 return h}
function writtenHtml(r){if(!r)return '';var h='<h3>Concepts for your selection</h3><p class="note">'+esc(r.note||'')+'</p>';
 (r.sections||[]).forEach(function(x){var fl=(x.flags||[]).filter(function(f){return f.sentence}).map(function(f){return f.sentence});
  h+='<div class="card"><strong>'+esc(x.h2)+'</strong><br><small>'+(x.status==='FLAGGED_FOR_EDITOR'?'Flagged: '+x.flags.length+' item(s) to rewrite or remove':x.status==='MARKED_NO_SOURCE_TEXT'?'Marked: no competitor text behind it':'Concept for review')+(x.item_title?' · for “'+esc(x.item_title)+'”':'')+(x.placement&&x.placement.section_heading?' · place '+(x.placement.mode==='EXTEND_SECTION'?'inside':'after')+' “'+esc(x.placement.section_heading)+'”':' · you choose the place')+'</small>';
  if(x.basis)h+='<br><small>Answers: “'+esc(x.basis.answers)+'” · basis: '+esc(String(x.basis.evidence_level||'').toLowerCase().split('_').join(' '))+((x.basis.competitor_evidence||[]).length?' · sources: '+x.basis.competitor_evidence.map(function(e){return esc(e.site)}).join(', '):'')+'</small>'+(x.basis.warning?'<p class="note">'+esc(x.basis.warning)+'</p>':'');
  (x.paragraphs||[]).forEach(function(p){var out=esc(p);fl.forEach(function(f){out=out.split(esc(f)).join('<mark title="Flagged: rewrite or remove">'+esc(f)+'</mark>')});h+='<p>'+out+'</p>'});
  if((x.flags||[]).length)h+='<ul>'+x.flags.map(function(f){return '<li>'+(f.sentence?'“'+esc(f.sentence)+'” — ':'Whole section — ')+esc(f.reason)+'</li>'}).join('')+'</ul>';
  h+='</div>'});
 (r.not_written||[]).forEach(function(x){h+='<p class="muted">Not written: '+esc(x.title)+' — write this one yourself.</p>'});
 (r.unlinked_sections||[]).forEach(function(x){h+='<p class="muted">Not linked to a selected item and not used: “'+esc(x.h2)+'” — '+esc(x.reason)+'</p>'});
 if(r.reason&&!(r.sections||[]).length)h+='<p class="muted">'+esc(r.reason)+'</p>';
 return h}
function gapBrief(g,s){var picked={};document.querySelectorAll('.gapPick:checked').forEach(function(c){picked[c.value]=1});
 var items=g.items.filter(function(x){return picked[x.id]});
 var L=['# Editor brief: '+s.url,'','Search term: '+(s.checked.search_term||'—'),'Chosen from the comparison with '+g.ranking_pages_read+' ranking page(s). Write in your own words with facts you can stand behind; do not copy the ranking pages.',''];
 GAP_GROUPS.forEach(function(gr){var list=items.filter(function(x){return x.group===gr[0]});if(!list.length)return;L.push('## '+gr[1],'');
  list.forEach(function(x){L.push('- [ ] **'+x.title+'**'+(x.recommended?' (recommended)':'')+' ('+x.status+(x.your_section?'; closest on the page: “'+x.your_section+'”':'')+')');
   if(x.priority&&x.priority.suggested_action)L.push('  - Action: '+x.priority.suggested_action);
   x.examples.forEach(function(e){L.push('  - '+(e.position?'#'+e.position+' ':'')+e.site+(e.heading?': “'+e.heading+'”':''))})});L.push('')});
 if((g.strengths||[]).length){L.push('## Keep: your page has this, the ranking pages read do not','');g.strengths.forEach(function(x){L.push('- '+x.heading)});L.push('')}
 L.push('Ranking pages compared:');(g.ranking_pages||[]).forEach(function(p){L.push('- '+(p.position?'#'+p.position+' ':'')+p.url)});
 return {count:items.length,text:L.join('\\n')}}
function wireGaps(g,s,d){var box=document.getElementById('gapDownload');if(!box)return;
 var wr=document.getElementById('gapWritten');if(wr&&d&&d.writing&&d.writing.last)wr.innerHTML=writtenHtml(d.writing.last);
 var wb=document.getElementById('gapWrite');
 if(wb)wb.onclick=async function(){var ids=[];document.querySelectorAll('.gapPick:checked').forEach(function(c){ids.push(c.value)});var st=document.getElementById('gapStatus');
  if(!ids.length){st.textContent='Select at least one topic or question.';return}
  var writable=g.items.filter(function(x){return x.writable&&ids.indexOf(x.id)>=0}).length;
  if(writable>4){st.textContent='You selected '+writable+' topics: write at most 4 per run (untick some), or download the brief for all of them.';return}
  wb.disabled=true;st.textContent='Writing concepts…';
  try{var r=await fetch(API+'/write'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item_ids:ids})});var x=await r.json();if(!x.success)throw Error(x.error||'Not written');
   wr.innerHTML=writtenHtml(x);wb.textContent='Write selected with AI ('+x.remaining+' run(s) left)';wb.disabled=!x.remaining;st.textContent=(x.sections||[]).length?'Concepts written below.':'No text was written.'}
  catch(err){st.textContent=err.message;wb.disabled=false}};
 var count=function(){var n=document.querySelectorAll('.gapPick:checked').length;document.getElementById('gapCount').textContent=n+' selected'};
 document.querySelectorAll('.gapPick').forEach(function(c){c.addEventListener('change',count)});
 document.getElementById('gapAll').onclick=function(){document.querySelectorAll('.gapPick').forEach(function(c){c.checked=true});count()};
 document.getElementById('gapNone').onclick=function(){document.querySelectorAll('.gapPick').forEach(function(c){c.checked=false});count()};
 var st=document.getElementById('gapStatus');
 box.onclick=function(){var b=gapBrief(g,s);if(!b.count){st.textContent='Select at least one item.';return}
  var url=URL.createObjectURL(new Blob([b.text],{type:'text/markdown'})),a=document.createElement('a');a.href=url;a.download='editor-brief.md';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},2000);st.textContent=b.count+' item(s) in the brief.'};
 document.getElementById('gapCopy').onclick=function(){var b=gapBrief(g,s);if(!b.count){st.textContent='Select at least one item.';return}if(navigator.clipboard)navigator.clipboard.writeText(b.text);st.textContent='Copied ('+b.count+' item(s)).'}}
function render(d){var s=d.summary,o=document.getElementById('out');if(d.new_check_url)document.getElementById('back').href=d.new_check_url;if(d.offer){BRAND=d.offer.brand||BRAND;SERVICE=d.offer.service_text||SERVICE;CONTACT=d.offer.contact_url||''}
 if(d.status==='FAILED'){o.innerHTML='<p class="kicker">Not finished</p><h1>The check could not finish</h1><p>'+esc(d.error_text)+'</p><p><a class="btn" href="'+esc(d.new_check_url||${js(base)})+'">Try again</a></p>';return}
 var a=d.ai,as=a&&a.summary;
 var h='<p class="kicker">Result · Google + AI'+(d.cached?' · Google part from a check of this page in the last 24 hours':'')+'</p><h1>Your page in Google and in AI answers</h1>';
 h+='<p class="muted">Page: <a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.url)+'</a></p>';
 h+='<div class="grid two"><div><small>Google search (blue links)</small><strong>'+esc(s.headline)+'</strong><a href="#google">Details ↓</a></div><div><small>AI answers ('+(as?as.checked:0)+' of 5 AI systems checked)</small><strong>'+esc(as?as.headline:'AI answers not available')+'</strong><a href="#ai">'+(as&&as.checked?'Details ↓':'Check AI now ↓')+'</a></div></div>';
 h+='<h2 id="google">Google search (blue links)</h2><p class="lead"><strong>'+esc(s.headline)+'.</strong> '+esc(s.explanation)+'</p>';
 h+='<h3>What to do</h3><ol>'+s.steps.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ol>';
 if(s.tasks.length){h+='<h2>Why — what the ranking pages explain</h2>'+s.tasks.map(function(t){return '<div class="card"><strong>'+esc(t.title)+'</strong> <small>'+esc(t.status)+'</small>'+t.evidence.map(function(e){return '<blockquote>'+(e.heading?'<strong>'+esc(e.heading)+'</strong><br>':'')+esc(e.excerpt)+'<br><small><a href="'+esc(e.url)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(e.site)+'</a></small></blockquote>'}).join('')+'</div>'}).join('')}
 h+=gapsHtml(s.gaps,d.writing);
 var c=s.checked;h+='<h2>What was checked</h2><div class="grid"><div><small>Search term</small><strong>'+esc(c.search_term||'—')+'</strong><small>'+(c.search_term_source==='YOU_ENTERED_IT'?'entered by you':'derived from your page')+'</small></div><div><small>Google shows mostly</small><strong>'+esc(c.what_google_shows||'unclear')+'</strong></div><div><small>Ranking results considered</small><strong>'+esc(c.ranking_results_considered)+'</strong></div><div><small>Ranking pages read in full</small><strong>'+esc(c.ranking_pages_read)+'</strong></div>'+(c.search_market?'<div><small>Searched in</small><strong>'+esc(c.search_market.join(' + '))+'</strong>'+(c.markets_not_searched&&c.markets_not_searched.length?'<small>not researched: '+esc(c.markets_not_searched.join(', '))+' (partial market research)</small>':'')+(c.market_derived_not_confirmed?'<small>market derived from your page, not confirmed</small>':'')+'</div>':'')+'</div>';
 if(a)h+=aiHtml(a);
 h+='<h2>Limits of this free check</h2><ul>'+s.limitations.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul><p class="note">'+esc(s.promises)+'</p>';
 h+='<h2>Do it yourself</h2><p>Download the complete research data and process it yourself or with your own tools.</p><p><a class="btn ghost" href="'+esc(API+'/report.json'+Q)+'" download>Download JSON</a></p>';
 h+='<div class="card" id="hire"><p class="kicker">Paid · done for you</p><h2 style="margin-top:4px">Want this done for you?</h2><p>'+esc(SERVICE)+'</p>'+(CONTACT?'<p><a class="btn" href="'+esc(CONTACT)+'" target="_blank" rel="noopener noreferrer">Book a call</a></p><p class="muted">Or leave your details:</p>':'')+
 '<form id="hf"><label>Name<input name="name" required maxlength="120"></label><label>Email<input name="email" type="email" required maxlength="200"></label><label>Company / website (optional)<input name="company" maxlength="200"></label><label>Phone (optional)<input name="phone" maxlength="40"></label><label>What would you like help with? (optional)<textarea name="message" rows="3" maxlength="2000"></textarea></label><label class="check"><input type="checkbox" name="consent" required> <span>Contact me about this request.</span></label><p><button type="submit">Ask '+esc(BRAND)+' to do it</button> <small role="status" id="hs"></small></p></form></div>';
 o.innerHTML=h;wireAi();wireGaps(s.gaps,s,d);
 document.getElementById('hf').addEventListener('submit',async function(e){e.preventDefault();var f=e.target,st=document.getElementById('hs'),b=f.querySelector('button');if(!f.consent.checked){st.textContent='Please tick the contact box.';return}b.disabled=true;
  try{var r=await fetch(API+'/hire'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name.value,email:f.email.value,company:f.company.value,phone:f.phone.value,message:f.message.value,consent:true})});var x=await r.json();if(!x.success)throw Error(x.error||'Not sent');f.outerHTML='<p><strong>Thank you — your request was received.</strong> You will get a reply by email.</p>'}catch(err){st.textContent=err.message;st.className='error';b.disabled=false}});
}
async function poll(n){try{var r=await fetch(API+Q,{cache:'no-store'});var d=await r.json();if(!d.success)throw Error(d.error||'Not found');
 if(d.status==='DONE'||d.status==='FAILED')return render(d);}catch(e){document.getElementById('out').innerHTML='<h1>Result not available</h1><p>'+esc(e.message)+'</p>';return}
 setTimeout(function(){poll(n+1)},n<20?3000:8000)}
poll(0);
</script>`,cfg);
}

const INVITE_TEXT={REVOKED:'This invitation was withdrawn.',EXPIRED:'This invitation has expired.',USED_UP:'All checks of this invitation have been used.',NOT_FOUND:'This invitation link is not valid.'};
function inviteClosed(cfg,status){
 return page('Free Growth check',`<h1>${esc(INVITE_TEXT[status]||INVITE_TEXT.NOT_FOUND)}</h1><p class="lead">Ask the person who invited you for a new link.</p>`,cfg);
}
const maskEmail=e=>{const [u,d]=String(e||'').split('@');return d?(u.slice(0,1)+'***@'+d):''};
const fmtDay=x=>{const t=new Date(x);return Number.isFinite(t.getTime())?t.toISOString().slice(0,10):''};
function notActivated(cfg){
 return page('Free Growth check',`<h1>This free check is not activated here</h1><p class="lead">The link is missing a valid access key. Ask the website that sent you here for the correct link.</p>`,cfg);
}
// An explicit key in the link wins; without one, a key whose "hosts" include the
// domain the page is served on applies (no key needed on your own site).
function findKey(config,value,req){
 const v=String(value||'');
 if(v)return (config.accessKeys||[]).find(k=>store.sameKey(k.key,v))||null;
 const host=String(req&&req.hostname||'').toLowerCase().replace(/^www\./,'');
 return host?(config.accessKeys||[]).find(k=>k.hosts&&k.hosts.includes(host))||null:null;
}
const offerOf=k=>({brand:k.brand,contact_url:k.contactUrl||null,service_text:k.serviceText});

function adminPage(cfg,api,base,loggedIn){
 return page('Growth check — admin',`
<h1>Free Growth check — admin</h1>
<div id="login" class="card"${loggedIn?' hidden':''}><form id="lf"><label>Admin key<input name="key" type="password" autocomplete="current-password" required></label><p><button>Log in</button> <small id="ls" role="status"></small></p></form><p class="muted">The session lasts 12 hours on this browser only.</p></div>
<div id="app"${loggedIn?'':' hidden'}>
 <p><button class="ghost" id="logout" type="button">Log out</button></p>
 <div class="card"><h2 style="margin-top:0">Run a check yourself</h2><p class="muted">No limits for you. The same page and search term within 24 hours comes from the stored result.</p>
  <form id="rf"><label>Page address<input name="url" type="url" required maxlength="500" placeholder="https://..."></label><label>Search term (optional)<input name="query" maxlength="120"></label><p><button>Run check</button> <small role="status" id="rs"></small></p></form></div>
 <div class="card"><h2 style="margin-top:0">Invite someone</h2><p class="muted">A personal link with its own number of checks and expiry. Withdraw it any time.</p>
  <form id="if"><label>For whom? (name or company)<input name="label" required maxlength="80"></label>
  <label>Only for this email address (recommended)<input name="email_lock" type="email" maxlength="200" placeholder="name@company.com"></label>
  <label>Number of checks<input name="max_checks" type="number" min="1" max="50" value="3"></label>
  <label>Valid for (days)<input name="days" type="number" min="1" max="90" value="7"></label>
  <p><button>Create invitation link</button> <small role="status" id="is"></small></p></form><div id="newlink"></div></div>
 <h2>Invitations</h2><div id="invites"></div>
 <h2>Leads</h2><p><a id="csv" class="btn ghost" href="#">Download CSV</a></p><div id="leads"></div>
 <div class="card"><h2 style="margin-top:0">Delete someone's data</h2><form id="ff"><label>Email address<input name="email" type="email" required></label><p><button>Delete everything for this email</button> <small role="status" id="fs"></small></p></form></div>
</div>
<script>
var API=${js(api)},H={'Content-Type':'application/json','X-Requested-With':'growth-free-admin'};
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function day(x){return String(x||'').slice(0,10)}
async function post(p,b){var r=await fetch(API+p,{method:'POST',credentials:'same-origin',headers:H,body:JSON.stringify(b||{})});var d=await r.json().catch(function(){return {success:false,error:'Unavailable'}});if(r.status===404&&!d.error)d.error='Not logged in';return d}
async function get(p){var r=await fetch(API+p,{credentials:'same-origin',cache:'no-store'});return r.json()}
var STATUS={ACTIVE:'Active',EXPIRED:'Expired',REVOKED:'Withdrawn',USED_UP:'Used up'};
async function load(){
 var i=await get('/admin/invites');if(!i.success){document.getElementById('app').hidden=true;document.getElementById('login').hidden=false;return}
 document.getElementById('invites').innerHTML=i.invites.length?i.invites.map(function(v){return '<div class="card"><strong>'+esc(v.label)+'</strong> · '+esc(STATUS[v.status]||v.status)+'<br><small>'+esc(v.used_checks)+' of '+esc(v.max_checks)+' checks used · valid until '+esc(day(v.expires_at))+(v.email_lock?' · only for '+esc(v.email_lock):' · anyone with the link')+(v.last_used_at?' · last used '+esc(day(v.last_used_at)):'')+'</small>'+(v.status==='ACTIVE'?'<p><button class="ghost revoke" data-id="'+esc(v.id)+'">Withdraw</button></p>':'')+'</div>'}).join(''):'<p class="muted">No invitations yet.</p>';
 var d=await get('/admin/leads');
 document.getElementById('leads').innerHTML='<h3>Hire requests ('+d.hires.length+')</h3>'+d.hires.map(function(h){return '<div class="card"><strong>'+esc(h.name)+'</strong> &lt;'+esc(h.email)+'&gt; '+esc(h.company||'')+' '+esc(h.phone||'')+'<br><small>'+esc(h.created_at)+' · '+esc(h.url)+' · '+esc(h.decision||'')+' · '+esc(h.access_label||'')+'</small><p>'+esc(h.message||'')+'</p></div>'}).join('')+
 '<h3>Checks ('+d.checks.length+')</h3>'+d.checks.map(function(c){return '<div class="card"><strong>'+esc(c.email)+'</strong>'+(c.marketing_consent?' · may be emailed':'')+'<br><small>'+esc(c.access_label||'')+' · '+esc(c.created_at)+' · '+esc(c.status)+' · '+esc(c.decision||c.error_code||'')+(c.cached?' · cached':'')+'</small><br><a href="'+esc(c.url)+'" target="_blank" rel="noopener noreferrer">'+esc(c.url)+'</a> '+esc(c.query||'')+'</div>'}).join('')}
document.getElementById('lf').addEventListener('submit',async function(e){e.preventDefault();var d=await post('/admin/login',{key:e.target.key.value});if(!d.success){document.getElementById('ls').textContent=d.error||'Not logged in';return}e.target.reset();document.getElementById('login').hidden=true;document.getElementById('app').hidden=false;load()});
document.getElementById('logout').addEventListener('click',async function(){await post('/admin/logout');location.reload()});
document.getElementById('rf').addEventListener('submit',async function(e){e.preventDefault();var f=e.target,st=document.getElementById('rs');st.textContent='Starting…';var d=await post('/admin/run',{url:f.url.value,query:f.query.value});if(!d.success){st.textContent=d.error;return}location.href=d.result_url});
document.getElementById('if').addEventListener('submit',async function(e){e.preventDefault();var f=e.target,st=document.getElementById('is');var d=await post('/admin/invites',{label:f.label.value,email_lock:f.email_lock.value,max_checks:Number(f.max_checks.value),days:Number(f.days.value)});if(!d.success){st.textContent=d.error;return}st.textContent='';f.reset();f.max_checks.value=3;f.days.value=7;
 document.getElementById('newlink').innerHTML='<p class="note"><strong>Copy this link now</strong> — it cannot be shown again.<br><input readonly id="lnk" value="'+esc(d.link)+'"> <button type="button" id="cp">Copy</button></p>';document.getElementById('cp').onclick=function(){var x=document.getElementById('lnk');x.select();navigator.clipboard&&navigator.clipboard.writeText(x.value);this.textContent='Copied'};load()});
document.addEventListener('click',async function(e){var b=e.target.closest('button.revoke');if(!b)return;if(!confirm('Withdraw this invitation? The link stops working immediately.'))return;var d=await post('/admin/invites/'+b.dataset.id+'/revoke');if(!d.success)alert(d.error);load()});
document.getElementById('csv').addEventListener('click',async function(e){e.preventDefault();var r=await fetch(API+'/admin/leads.csv',{credentials:'same-origin'});if(!r.ok){alert('Not logged in');return}var b=await r.blob(),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='growth-free-leads.csv';a.click()});
document.getElementById('ff').addEventListener('submit',async function(e){e.preventDefault();if(!confirm('Delete all checks and requests of this email address?'))return;var d=await post('/admin/forget',{email:e.target.email.value});document.getElementById('fs').textContent=d.success?('Deleted '+d.deleted.checks+' checks, '+d.deleted.hire_requests+' requests'):(d.error||'Failed');load()});
if(${js(!!loggedIn)})load();
</script>`,cfg);
}

const FAIL_TEXT={
 INTERRUPTED:'The check was interrupted. Please run it again.',
 AUTOMATIC_RESEARCH_TEMPORARILY_UNAVAILABLE:'The research service is temporarily unavailable. Please try again later.',
 PAGE_IDENTITY_CHANGED:'The page changed while it was being checked. Please try again.'
};

function registerFreeGrowth(app,pool,{config=freeGrowthConfig(),engine=runFreeGrowthResearch,engineDeps={},basePath='/free-growth',apiPath='/api/free-growth',fetchImpl=global.fetch,storage=store}={}){
 if(!config.enabled)return null;
 const queue=[];let running=0;
 const jobs=new Set();
 function pump(){
  while(running<config.concurrency&&queue.length){
   const job=queue.shift();running++;
   const p=(async()=>{
    try{
     await storage.setStatus(pool,job.id,{status:'RUNNING'});
     const out=await engine({url:job.url,query:job.query},engineDeps);
     if(out.statusCode!==200||!out.report||out.report.success===false){
      await storage.setStatus(pool,job.id,{status:'FAILED',error_code:String(out.report&&out.report.code||'RESEARCH_FAILED').slice(0,80)});
      if(job.inviteId)await storage.refundInvite(pool,job.inviteId);
     }else{
      const summary=summarizeFreeGrowth(out.report,{url:job.url,query:job.query});
      await storage.setStatus(pool,job.id,{status:'DONE',decision:summary.decision,summary,report:out.report});
     }
    }catch(e){
     console.warn('[free-growth] check failed',String(e&&e.code||e&&e.message||'unknown').slice(0,80));
     await storage.setStatus(pool,job.id,{status:'FAILED',error_code:'RESEARCH_FAILED'}).catch(()=>{});
     if(job.inviteId)await storage.refundInvite(pool,job.inviteId).catch(()=>{});
    }finally{running--;pump()}
   })();
   jobs.add(p);p.finally(()=>jobs.delete(p));
  }
 }
 const resultUrl=row=>`${basePath}/r/${encodeURIComponent(row.public_id)}?k=${encodeURIComponent(row.access_key)}`;

 app.get(basePath,async(req,res,next)=>{
  if(!(req.query&&req.query.invite))return next();
  // Personal invitation: works on any domain, limited to its own number of checks and validity.
  try{
   await storage.ensureTables(pool);
   const inv=await storage.getInvite(pool,req.query.invite),status=store.inviteStatus(inv);
   res.set('Cache-Control','no-store').set('Referrer-Policy','no-referrer').set('Content-Security-Policy',"frame-ancestors 'none'");
   if(status!=='ACTIVE')return res.status(403).type('html').send(inviteClosed(config,status));
   res.type('html').send(formPage(config,apiPath,basePath,'',{token:String(req.query.invite),label:'',
    left:inv.max_checks-inv.used_checks,max:inv.max_checks,expires:fmtDay(inv.expires_at),email_hint:maskEmail(inv.email_lock)}));
  }catch(e){console.error('[free-growth] invite page failed',e.message);res.status(503).type('text').send('Temporarily unavailable')}
 });
 app.get(basePath,(req,res)=>{
  const entry=findKey(config,req.query&&req.query.key,req);
  if(!entry)return res.status(403).set('Cache-Control','no-store').set('Content-Security-Policy',"frame-ancestors 'none'").type('html').send(notActivated(config));
  // Where it may be embedded is decided by the key: only its listed sites (or anywhere if none are listed).
  res.set('Content-Security-Policy','frame-ancestors '+(entry.origins.length?"'self' "+entry.origins.join(' '):'*'));
  res.set('Cache-Control','private, no-store').type('html').send(formPage({...config,...entry},apiPath,basePath,req.query&&req.query.key?entry.key:''));
 });
 app.get(basePath+'/r/:id',(req,res)=>res.set('Cache-Control','no-store').set('Referrer-Policy','no-referrer').type('html')
  .set('Content-Security-Policy','frame-ancestors '+(()=>{const o=[...new Set((config.accessKeys||[]).flatMap(k=>k.origins))];return (config.accessKeys||[]).some(k=>!k.origins.length)?'*':"'self' "+o.join(' ')})())
  .send(resultPage(config,apiPath,basePath,safeToken(req.params.id),safeToken(req.query.k))));

 app.post(apiPath+'/checks',async(req,res)=>{
  try{
   const b=req.body||{};
   if(b.invite)return await startInviteCheck(req,res,b);
   const entry=findKey(config,b.key,req);
   if(!entry)return res.status(403).json({success:false,error:'This free check is not activated here'});
   const origin=req.get&&req.get('origin');
   if(origin&&entry.origins.length&&origin!==`${req.protocol}://${req.get('host')}`&&!entry.origins.includes(origin))
    return res.status(403).json({success:false,error:'This free check is not activated on this website'});
   const email=clean(b.email,200).toLowerCase();
   if(!EMAIL.test(email))return res.status(400).json({success:false,error:'Enter a valid email address'});
   if(b.consent!==true)return res.status(400).json({success:false,error:'Please accept the storage notice'});
   const v=validatePublicUrl(b.url);if(v.error)return res.status(400).json({success:false,error:v.error});
   const query=clean(b.query,120);
   await storage.ensureTables(pool);
   const ipHash=store.hashIp(req.ip,config.ipSalt);
   const cached=await storage.recentResult(pool,{url:v.url,query});
   if(!cached){
    const u=await storage.usage(pool,{email,ipHash,accessLabel:entry.label});
    if(u.by_email>=entry.perEmail||u.by_ip>=config.perIp)
     return res.status(429).json({success:false,error:`The free limit is ${entry.perEmail} checks per day. Try again tomorrow, or ask for the paid service.`});
    if(u.by_key>=entry.daily||u.total>=config.daily)return res.status(429).json({success:false,error:'Today\'s free checks are used up. Please try again tomorrow.'});
   }
   const row=await storage.createCheck(pool,{email,ipHash,url:v.url,host:v.host,query,marketingConsent:b.marketing_consent===true,cached,accessLabel:entry.label});
   if(!cached){queue.push({id:row.id,url:v.url,query});pump()}
   res.status(202).json({success:true,id:row.public_id,key:row.access_key,status:row.status,result_url:resultUrl(row)});
  }catch(e){console.error('[free-growth] start failed',e.message);res.status(503).json({success:false,error:'The free check is temporarily unavailable'})}
 });

 // Shared input checks for every way of starting a check.
 function readInput(b,res){
  const email=clean(b.email,200).toLowerCase();
  if(!EMAIL.test(email)){res.status(400).json({success:false,error:'Enter a valid email address'});return null}
  if(b.consent!==true){res.status(400).json({success:false,error:'Please accept the storage notice'});return null}
  const v=validatePublicUrl(b.url);if(v.error){res.status(400).json({success:false,error:v.error});return null}
  return {email,url:v.url,host:v.host,query:clean(b.query,120)};
 }
 async function start(res,input,{ipHash=null,marketingConsent=false,accessLabel,inviteId=null,beforeRun=null}){
  const cached=await storage.recentResult(pool,{url:input.url,query:input.query});
  // A cached result costs nothing, so it never uses up an invitation.
  if(!cached&&beforeRun&&!(await beforeRun()))return;
  const row=await storage.createCheck(pool,{email:input.email,ipHash,url:input.url,host:input.host,query:input.query,marketingConsent,cached,accessLabel,inviteId:cached?null:inviteId});
  if(!cached){queue.push({id:row.id,url:input.url,query:input.query,inviteId:cached?null:inviteId});pump()}
  res.status(202).json({success:true,id:row.public_id,key:row.access_key,status:row.status,result_url:resultUrl(row)});
 }
 async function startInviteCheck(req,res,b){
  const input=readInput(b,res);if(!input)return;
  await storage.ensureTables(pool);
  const inv=await storage.getInvite(pool,b.invite),status=store.inviteStatus(inv);
  if(status!=='ACTIVE')return res.status(403).json({success:false,error:INVITE_TEXT[status]});
  if(inv.email_lock&&inv.email_lock!==input.email)
   return res.status(403).json({success:false,error:'This invitation only works with the email address it was sent to'});
  await start(res,input,{ipHash:store.hashIp(req.ip,config.ipSalt),marketingConsent:b.marketing_consent===true,
   accessLabel:'invite: '+inv.label,inviteId:inv.id,
   beforeRun:async()=>{if(await storage.consumeInvite(pool,inv.id))return true;res.status(403).json({success:false,error:INVITE_TEXT.USED_UP});return false}});
 }

 async function load(req,res){
  try{
   await storage.ensureTables(pool);
   const row=await storage.getCheck(pool,req.params.id,req.query.k);
   if(!row){res.status(404).json({success:false,error:'Result not found'});return null}
   return row;
  }catch(e){console.error('[free-growth] load failed',e.message);res.status(503).json({success:false,error:'Temporarily unavailable'});return null}
 }
 // Search term the AI prompt must use: the one entered, or the one the research derived.
 const searchTermOf=row=>String(row.query||row.summary&&row.summary.checked&&row.summary.checked.search_term||'').trim();
 const googleUrlsOf=row=>((row.report&&row.report.search_discovery&&row.report.search_discovery.leads)||[]).map(l=>l&&l.url).filter(Boolean);
 async function aiFor(row){
  const term=searchTermOf(row);
  if(row.status!=='DONE'||!term)return null;
  let answers=[];
  try{answers=await storage.listAiAnswers(pool,row.id)}catch(e){console.warn('[free-growth] AI answers unavailable',String(e&&e.code||'unknown'))}
  return {search_term:term,prompt:ai.directPrompt(term),engines:ai.ENGINES,max_paste:ai.MAX_PASTE,answers,
   summary:ai.summarizeAiAnswers(answers,{pageUrl:row.url,googleUrls:googleUrlsOf(row)})};
 }
 // Once AI answers are pasted, the "AI not checked" limitation is replaced by the AI caveat.
 function withAiLimits(summary,aiPart){
  if(!summary||!aiPart||!aiPart.summary.checked)return summary;
  return {...summary,limitations:[...summary.limitations.filter(x=>!/AI answers .* were not checked/.test(x)),aiPart.summary.caveat]};
 }
 const writingAllowed=row=>config.writing==='all'||(config.writing!=='off'&&row.access_label==='admin')||(config.writing==='invited'&&!!row.invite_id);
 const writingInfo=row=>({allowed:writingAllowed(row),remaining:Math.max(0,(config.writeLimit||3)-Number(row.write_count||0)),last:row.written||null});
 app.get(apiPath+'/checks/:id',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  const aiPart=await aiFor(row);
  res.set('Cache-Control','no-store').json({success:true,status:row.status,url:row.url,query:row.query,decision:row.decision,
   ai:aiPart?{search_term:aiPart.search_term,prompt:aiPart.prompt,engines:aiPart.engines,max_paste:aiPart.max_paste,summary:aiPart.summary}:null,
   summary:withAiLimits(row.summary,aiPart)||null,cached:!!row.cached_from,error_code:row.error_code||null,
   writing:row.status==='DONE'?writingInfo(row):null,
   offer:offerOf((config.accessKeys||[]).find(k=>k.label===row.access_label)||config),
   new_check_url:(()=>{if(row.access_label==='admin')return basePath+'/admin';
    const k=(config.accessKeys||[]).find(x=>x.label===row.access_label);
    if(!k)return null;
    const host=String(req.hostname||'').toLowerCase().replace(/^www\./,'');
    return k.hosts.includes(host)?basePath:`${basePath}?key=${encodeURIComponent(k.key)}`;})(),
   error_text:row.status==='FAILED'?(FAIL_TEXT[row.error_code]||'The check could not finish. Please try again later.'):null});
 });
 app.get(apiPath+'/checks/:id/report.json',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  if(row.status!=='DONE')return res.status(409).json({success:false,error:'The check has not finished'});
  const aiPart=await aiFor(row);
  res.set('Cache-Control','no-store').set('Content-Disposition',`attachment; filename="growth-check-${row.public_id}.json"`)
   .json({generated_by:config.brand+' free Growth check',url:row.url,search_term:row.query||null,checked_at:row.finished_at,
    disclaimer:'Research data only. No ranking or traffic increase is promised. Google Search Console data was not used.',
    summary:withAiLimits(row.summary,aiPart),
    ai_answers:aiPart?{search_term:aiPart.search_term,prompt:aiPart.prompt,summary:aiPart.summary,
     answers:aiPart.answers.map(a=>({engine:a.engine,pasted_at:a.created_at,parsed:a.parsed,raw_text:a.raw_text}))}:null,
    report:row.report});
 });
 // Optional: concepts only for the items the visitor selected (never automatic). The page is read again, publicly; the
 // text is checked against it and failing sentences are flagged. Nothing is published or stored on the visitor's site.
 app.post(apiPath+'/checks/:id/write',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  if(row.status!=='DONE')return res.status(409).json({success:false,error:'The check has not finished'});
  if(!writingAllowed(row))return res.status(403).json({success:false,error:'Writing is not available for this check. Download the editor brief instead.'});
  if(Number(row.write_count||0)>=(config.writeLimit||3))return res.status(429).json({success:false,error:'The writing limit for this check is reached. Download the editor brief instead.'});
  const ids=Array.isArray(req.body&&req.body.item_ids)?[...new Set(req.body.item_ids.map(String))].slice(0,20):[];
  const items=((row.summary&&row.summary.gaps&&row.summary.gaps.items)||[]).filter(x=>ids.includes(String(x.id)));
  if(!items.length)return res.status(400).json({success:false,error:'Select at least one topic or question first.'});
  if(items.filter(x=>x.writable).length>MAX_WRITE_ITEMS)return res.status(400).json({success:false,error:'Select at most '+MAX_WRITE_ITEMS+' topics or questions per writing run.'});
  if(!items.some(x=>x.writable))return res.status(400).json({success:false,error:'Page elements are added by the editor; select a topic or question to write.'});
  try{
   const live=await (engineDeps.fetchLive||fetchPublicGrowthHtml)(row.url);
   const html=String(live&&live.html||'');
   const researched=row.summary&&row.summary.gaps&&row.summary.gaps.source_fingerprint;
   if(researched&&pageFingerprint(html)!==researched)return res.status(409).json({success:false,error:'Your page changed since this check. Run a new check so the advice matches the page.'});
   const write=engineDeps.generateDraft||generateGrowthEditorDraft;
   const focusQuery=row.query||(row.summary&&row.summary.checked&&row.summary.checked.search_term)||'';
   const written=await writeForSelection({items,targetUrl:row.url,focusQuery,
    generate:async ctx=>({...(await write({sourceHtml:html,pageUrl:row.url,focusQuery,readerTask:ctx.reader_task,researchObservations:ctx.observations,fallbackFlagged:true})),source_text:sourceFacts(html).text})});
   const counted=await storage.recordWriting(pool,{checkId:row.id,written,limit:config.writeLimit||3});
   if(!counted)return res.status(429).json({success:false,error:'The writing limit for this check is reached.'});
   res.set('Cache-Control','no-store').json({success:true,...written,remaining:Math.max(0,(config.writeLimit||3)-counted.write_count),published:false});
  }catch(e){console.error('[free-growth] writing failed',String(e.code||e.message).slice(0,80));
   res.status(503).json({success:false,error:'Writing is not available right now. Your selection works with the editor brief.'})}
 });
 app.post(apiPath+'/checks/:id/ai',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  try{
   const b=req.body||{},engine=String(b.engine||''),text=String(b.text||'');
   if(row.status!=='DONE'||!searchTermOf(row))return res.status(409).json({success:false,error:'The Google part of the check must finish first'});
   if(!ai.ENGINE_IDS.has(engine))return res.status(400).json({success:false,error:'Choose the AI system you used'});
   if(!text.trim())return res.status(400).json({success:false,error:'Paste the complete answer first'});
   if(text.length>ai.MAX_PASTE)return res.status(413).json({success:false,error:'This answer is too long; paste only the answer and its sources'});
   const parsed=ai.parseAiAnswer(text,{pageUrl:row.url});
   await storage.saveAiAnswer(pool,{checkId:row.id,engine,rawText:text,parsed});
   const aiPart=await aiFor(row);
   res.json({success:true,engine,parsed:{sources:parsed.sources.length,resources_status:parsed.resources_status,verifiable:parsed.sources_verifiable,own_site_cited:parsed.own_site_cited,exact_page_cited:parsed.exact_page_cited,own_url_mentioned_not_cited:parsed.own_url_mentioned_not_cited},
    ai:{search_term:aiPart.search_term,prompt:aiPart.prompt,engines:aiPart.engines,max_paste:aiPart.max_paste,summary:aiPart.summary},
    summary:withAiLimits(row.summary,aiPart)});
  }catch(e){console.error('[free-growth] AI answer failed',e.message);res.status(503).json({success:false,error:'Could not analyse the answer. Please try again.'})}
 });
 app.post(apiPath+'/checks/:id/hire',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  try{
   const b=req.body||{};
   const name=clean(b.name,120),email=clean(b.email,200).toLowerCase();
   if(!name)return res.status(400).json({success:false,error:'Enter your name'});
   if(!EMAIL.test(email))return res.status(400).json({success:false,error:'Enter a valid email address'});
   if(b.consent!==true)return res.status(400).json({success:false,error:'Please tick the contact box'});
   const saved=await storage.createHireRequest(pool,{checkId:row.id,name,email,company:clean(b.company,200),phone:clean(b.phone,40),message:clean(b.message,2000)});
   if(config.hireWebhook&&typeof fetchImpl==='function'){
    fetchImpl(config.hireWebhook,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),
     body:JSON.stringify({text:`New Growth hire request from ${name} <${email}> for ${row.url} (${row.decision||row.status}) via ${row.access_label||'unknown key'}`,access_label:row.access_label||null,
      name,email,company:clean(b.company,200),url:row.url,search_term:row.query||null,decision:row.decision})})
     .catch(e=>console.warn('[free-growth] hire webhook failed',String(e&&e.code||'unknown')));
   }
   res.json({success:true,id:saved.id});
  }catch(e){console.error('[free-growth] hire failed',e.message);res.status(503).json({success:false,error:'Could not send your request. Please try again.'})}
 });

 // Admin: off unless GROWTH_FREE_ADMIN_KEY (16+ characters) is set. Scripts send the
 // key in the x-admin-key header; the admin page logs in once and gets a signed,
 // HttpOnly, SameSite=Strict session cookie (12 hours). Changing the key ends all sessions.
 const SESSION='gf_admin',SESSION_MS=12*3600*1000;
 const sign=exp=>crypto.createHmac('sha256',config.adminKey).update('growth-free-admin|'+exp).digest('base64url');
 const readCookie=(req,name)=>{for(const part of String(req.headers&&req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i>0&&part.slice(0,i).trim()===name)return part.slice(i+1).trim()}return ''};
 function sessionValid(req){
  const [exp,mac]=readCookie(req,SESSION).split('.');
  return !!config.adminKey&&Number(exp)>Date.now()&&store.sameKey(sign(exp),mac);
 }
 const admin=(req,res)=>{
  const header=req.get?.('x-admin-key')||req.headers?.['x-admin-key'];
  const viaKey=!!config.adminKey&&!!header&&store.sameKey(config.adminKey,header);
  const viaSession=!viaKey&&sessionValid(req);
  // Cookie-based writes need a custom header, which another website cannot send (CSRF).
  if(!(viaKey||(viaSession&&(req.method==='GET'||req.get?.('x-requested-with')==='growth-free-admin')))){res.status(404).json({success:false,error:'Not found'});return false}
  return true;
 };
 const attempts=new Map();
 if(typeof app.post==='function'){
  app.post(apiPath+'/admin/login',(req,res)=>{
   if(!config.adminKey)return res.status(404).json({success:false,error:'Not found'});
   const ip=String(req.ip||''),now=Date.now(),a=attempts.get(ip)||{n:0,reset:now+15*60000};
   if(now>a.reset){a.n=0;a.reset=now+15*60000}
   if(a.n>=10)return res.status(429).json({success:false,error:'Too many attempts. Try again in 15 minutes.'});
   if(!store.sameKey(config.adminKey,req.body&&req.body.key)){a.n++;attempts.set(ip,a);if(attempts.size>5000)attempts.clear();return res.status(401).json({success:false,error:'Wrong admin key'})}
   attempts.delete(ip);
   const exp=String(now+SESSION_MS);
   res.set('Set-Cookie',`${SESSION}=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS/1000}${req.secure?'; Secure':''}`);
   res.json({success:true,expires_at:new Date(Number(exp)).toISOString()});
  });
  app.post(apiPath+'/admin/logout',(req,res)=>{
   res.set('Set-Cookie',`${SESSION}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${req.secure?'; Secure':''}`);res.json({success:true});
  });
  // The owner's own checks: no daily limits (results are still cached for 24 hours).
  app.post(apiPath+'/admin/run',async(req,res)=>{
   if(!admin(req,res))return;
   try{
    const b=req.body||{};
    const v=validatePublicUrl(b.url);if(v.error)return res.status(400).json({success:false,error:v.error});
    await storage.ensureTables(pool);
    await start(res,{email:'owner',url:v.url,host:v.host,query:clean(b.query,120)},{accessLabel:'admin'});
   }catch(e){console.error('[free-growth] admin run failed',e.message);res.status(503).json({success:false,error:'Temporarily unavailable'})}
  });
  app.post(apiPath+'/admin/invites',async(req,res)=>{
   if(!admin(req,res))return;
   const b=req.body||{};
   const label=clean(b.label,80);
   if(!label)return res.status(400).json({success:false,error:'Give the invitation a name (who is it for?)'});
   const emailLock=b.email_lock?clean(b.email_lock,200).toLowerCase():null;
   if(emailLock&&!EMAIL.test(emailLock))return res.status(400).json({success:false,error:'Enter a valid email address or leave it empty'});
   const maxChecks=Math.min(Math.max(int(b.max_checks,3),1),50),days=Math.min(Math.max(int(b.days,7),1),90);
   try{
    await storage.ensureTables(pool);
    const inv=await storage.createInvite(pool,{label,emailLock,maxChecks,days});
    const origin=`${req.protocol}://${req.get('host')}`;
    res.json({success:true,invite:{...inv,token:undefined,status:store.inviteStatus(inv)},
     link:`${origin}${basePath}?invite=${encodeURIComponent(inv.token)}`,
     note:'Copy this link now: only a fingerprint is stored, the link cannot be shown again.'});
   }catch(e){console.error('[free-growth] invite failed',e.message);res.status(503).json({success:false,error:'Temporarily unavailable'})}
  });
  app.post(apiPath+'/admin/invites/:id/revoke',async(req,res)=>{
   if(!admin(req,res))return;
   if(!/^[1-9][0-9]{0,12}$/.test(String(req.params.id)))return res.status(400).json({success:false,error:'Invalid invitation'});
   try{await storage.ensureTables(pool);const r=await storage.revokeInvite(pool,Number(req.params.id));
    res.status(r?200:404).json({success:!!r,...(r?{}:{error:'Not found or already withdrawn'})})}
   catch(e){res.status(503).json({success:false,error:'Temporarily unavailable'})}
  });
 }
 app.get(apiPath+'/admin/invites',async(req,res)=>{
  if(!admin(req,res))return;
  try{await storage.ensureTables(pool);res.set('Cache-Control','no-store').json({success:true,invites:(await storage.listInvites(pool)).map(i=>({...i,status:store.inviteStatus(i)}))})}
  catch(e){res.status(503).json({success:false,error:'Temporarily unavailable'})}
 });
 app.get(basePath+'/admin',(req,res)=>res.set('Cache-Control','no-store').set('Content-Security-Policy',"frame-ancestors 'none'").type('html').send(adminPage(config,apiPath,basePath,sessionValid(req))));
 app.get(apiPath+'/admin/leads',async(req,res)=>{
  if(!admin(req,res))return;
  try{await storage.ensureTables(pool);res.set('Cache-Control','no-store').json({success:true,...await storage.listLeads(pool)})}
  catch(e){res.status(503).json({success:false,error:e.message})}
 });
 app.get(apiPath+'/admin/leads.csv',async(req,res)=>{
  if(!admin(req,res))return;
  try{
   await storage.ensureTables(pool);const {checks,hires}=await storage.listLeads(pool,{limit:5000});
   const cell=x=>{const s=String(x==null?'':x instanceof Date?x.toISOString():x);return /^[=+\-@]/.test(s)?`"'${s.replace(/"/g,'""')}"`:`"${s.replace(/"/g,'""')}"`};
   const lines=[['type','created_at','email','name','company','phone','url','search_term','decision','status','message','marketing_consent'].join(','),
    ...hires.map(h=>['hire',h.created_at,h.email,h.name,h.company,h.phone,h.url,h.query,h.decision,h.status,h.message,''].map(cell).join(',')),
    ...checks.map(c=>['check',c.created_at,c.email,'','','',c.url,c.query,c.decision,c.status,'',c.marketing_consent].map(cell).join(','))];
   res.set('Cache-Control','no-store').set('Content-Disposition','attachment; filename="growth-free-leads.csv"').type('text/csv').send(lines.join('\n'));
  }catch(e){res.status(503).json({success:false,error:e.message})}
 });
 if(typeof app.post==='function')app.post(apiPath+'/admin/forget',async(req,res)=>{
  if(!admin(req,res))return;
  const email=clean(req.body&&req.body.email,200).toLowerCase();
  if(!EMAIL.test(email))return res.status(400).json({success:false,error:'Enter a valid email address'});
  try{await storage.ensureTables(pool);res.json({success:true,deleted:await storage.forgetEmail(pool,email)})}
  catch(e){res.status(503).json({success:false,error:e.message})}
 });
 return {config,idle:()=>Promise.all([...jobs]),queueLength:()=>queue.length};
}

module.exports={registerFreeGrowth,freeGrowthConfig,parseAccessKeys};
