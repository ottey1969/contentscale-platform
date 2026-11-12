'use strict';
// Free public Growth check, separate from the Tracker: own pages, own API, own
// tables, own settings (GROWTH_FREE_* environment variables). It can be mounted
// in the main app or run on its own domain with server.cjs.
const crypto=require('node:crypto');
const store=require('./store.cjs');
const {runFreeGrowthResearch,validatePublicUrl,engineVersion}=require('./engine.cjs');
const {groundedGeminiAnswer}=require('./auto-ai-answers.cjs');
const {validCountries,validLanguage,PREWRITE_REGIONS,PREWRITE_LANGUAGES}=require('../growth-search-locale.cjs');
const {summarizeFreeGrowth,BLOCKER_TEXT}=require('./summary.cjs');
const ai=require('./ai-answers.cjs');
const aiGap=require('./ai-gap.cjs');
const {writeForSelection,planBatch,pageFingerprint,headingsStillPresent,headingsMessage,explainWriterFailure,MAX_ITEMS:MAX_WRITE_ITEMS}=require('../growth-selected-writing.cjs');
const {mergeWritten,viewOf}=require('./written.cjs');
const {generateGrowthEditorDraft,sourceFacts,styleIssues}=require('../growth-source-grounded-editor.cjs');
const styleFix=require('../growth-style-fix.cjs');
const {fetchPublicGrowthHtml}=require('../growth-public-html-reader.cjs');
const gscExport=require('./gsc-export.cjs');
const cmsPackage=require('./cms-package.cjs');
const reminders=require('./reminders.cjs');
const {discoverCustomerQuestions}=require('../growth-customer-questions.cjs');

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
  // Enable only after the WordPress application form is live and mail tested.
  // Existing result links continue to work; new check creation needs owner access or an invite.
  approvalRequired:env.GROWTH_FREE_APPROVAL_REQUIRED==='true',
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
  // Default all (owner 2026-11-07: "in Free Growth AI must fill in what is needed"); limited per check by writeLimit.
  writing:['off','admin','invited','all'].includes(String(env.GROWTH_FREE_WRITING||'').toLowerCase())?String(env.GROWTH_FREE_WRITING).toLowerCase():'all',
  writeLimit:Math.max(1,int(env.GROWTH_FREE_WRITES_PER_CHECK,3)),
  writesPerDay:Math.max(0,int(env.GROWTH_FREE_WRITES_PER_DAY,40)),
  serviceText:env.GROWTH_FREE_SERVICE_TEXT||'I write the missing sections in your voice, check every fact with you, publish nothing without your approval and measure the result in Search Console after 28 days.'
 };
}

// Values embedded in <script>: JSON with '<' escaped, so no value can close the script tag.
const js=x=>JSON.stringify(x).replace(/</g,'\\u003c');
const safeToken=x=>/^[A-Za-z0-9_-]{1,60}$/.test(String(x||''))?String(x):'';
const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EMAIL=/^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
// One to five addresses, separated by commas, semicolons or spaces; the first counts for the daily limits.
function readEmails(raw){
 const list=[...new Set(String(raw==null?'':raw).toLowerCase().split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean))];
 if(!list.length||list.some(x=>x.length>200||!EMAIL.test(x)))return {error:'Enter a valid email address (up to 5, separated by commas)'};
 if(list.length>5)return {error:'Enter at most 5 email addresses'};
 return {email:list[0],emails:list};
}
const clean=(x,n)=>String(x==null?'':x).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);

function page(title,body,cfg){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="${title.startsWith('Free')?'index,follow':'noindex'}"><style>
:root{--bg:#f6f8fc;--card:#fff;--ink:#172337;--muted:#5b6b82;--line:#d9e0eb;--accent:#2563eb;--accent-ink:#fff;--done:#15803d;--blocked:#b42318;--pending:#64748b;--warn:#fff7ed;--warn-line:#fed7aa}
@media (prefers-color-scheme:dark){:root{--bg:#0f1622;--card:#172131;--ink:#e6edf7;--muted:#9fb0c7;--line:#2a374b;--accent:#60a5fa;--accent-ink:#0b1220;--done:#4ade80;--blocked:#fb7185;--pending:#9fb0c7;--warn:#2a2116;--warn-line:#6b4a1f}}
*{box-sizing:border-box}body{font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink);margin:0}
main{max-width:860px;margin:0 auto;padding:24px 16px 60px}h1{font-size:30px;line-height:1.2;margin:.4em 0}h2{font-size:21px;margin:1.6em 0 .5em}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:16px 0}.lead{font-size:18px;color:var(--muted)}
label{display:block;margin:12px 0 4px;font-weight:600}input,textarea{width:100%;padding:11px;border:1px solid var(--line);border-radius:8px;font:inherit;background:var(--bg);color:var(--ink)}
.check{display:flex;gap:8px;align-items:flex-start;font-weight:400}.check input{width:auto;margin-top:5px}
button,.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);border:0;border-radius:9px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
button:disabled{opacity:.65;cursor:not-allowed}.cms-action-unavailable,.cms-action-unavailable:disabled{background:var(--bg)!important;border:1px solid var(--line)!important;color:var(--muted)!important;opacity:1!important;box-shadow:none!important;cursor:not-allowed!important;animation:none!important}.cms-action-ready{background:var(--accent)!important;border:1px solid var(--accent)!important;color:var(--accent-ink)!important}.cms-action-complete,.cms-action-complete:disabled{background:var(--done)!important;border:1px solid var(--done)!important;color:#fff!important;opacity:1!important;box-shadow:none!important;cursor:default!important}.cms-status{display:block;margin-top:8px;font-size:13px;color:var(--muted)}.cms-status.done{color:var(--done)}.cms-button-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}@media(prefers-reduced-motion:reduce){.cms-action-complete{animation:none!important}}button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.research-progress{height:5px;border-radius:99px;background:var(--line);overflow:hidden;margin:12px 0}.research-progress::after{content:'';display:block;width:35%;height:100%;background:var(--accent);border-radius:99px;animation:freeResearch 1.6s ease-in-out infinite alternate}@keyframes freeResearch{from{transform:translateX(-90%)}to{transform:translateX(280%)}}@media(prefers-reduced-motion:reduce){.research-progress::after{animation:none;width:100%}}.is-saving{pointer-events:none}.is-saving::after{content:'';display:inline-block;width:12px;height:12px;margin-left:8px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:freeSpin .8s linear infinite}.action-done{background:var(--done)!important;color:#fff!important;animation:freeDone .35s ease-out}.action-failed{background:var(--blocked)!important;color:#fff!important;animation:freeAlert .25s ease-out}@media(prefers-reduced-motion:reduce){.is-saving::after{animation:none;border-top-color:currentColor}}button{transition:background-color .18s ease,transform .18s ease,box-shadow .18s ease}button:not(:disabled):active{transform:scale(.98)}.is-working{position:relative;pointer-events:none}.is-working::before{content:'';display:inline-block;vertical-align:-2px;width:13px;height:13px;margin-right:9px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:freeSpin .8s linear infinite}.step-chip.done{animation:freeDone .35s ease-out}.step-chip.blocked{animation:freeAlert .25s ease-out}.action-green{animation:freeDone .35s ease-out}.action-red{animation:freeAlert .25s ease-out}@keyframes freeSpin{to{transform:rotate(360deg)}}@keyframes freeDone{0%{transform:translateY(3px);opacity:.7}100%{transform:translateY(0);opacity:1}}@keyframes freeAlert{0%,100%{transform:translateX(0)}30%{transform:translateX(-3px)}70%{transform:translateX(3px)}}@media(prefers-reduced-motion:reduce){button,.step-chip{transition:none!important;animation:none!important}.is-working::before{animation:none!important;border-right-color:currentColor}}.step-strip{display:grid;gap:8px;margin:16px 0}.step-chip{display:flex;gap:10px;align-items:center;padding:11px 14px;border:1px solid var(--line);border-radius:10px;font-size:14px;font-weight:650;background:var(--card);color:var(--pending)}.step-chip.done{border-color:var(--done);color:var(--done)}.step-chip.current{border-color:var(--accent);color:var(--accent);box-shadow:inset 3px 0 var(--accent)}.step-chip.blocked{border-color:var(--blocked);color:var(--blocked)}.step-chip .symbol{font-size:18px}.action-blue{background:var(--accent);color:var(--accent-ink)}.action-green{background:var(--done);color:#fff}.action-muted{background:transparent;color:var(--muted);border:1px solid var(--line)}.action-red{background:var(--blocked);color:#fff}a.step-chip{text-decoration:none}#ownerBox>summary.owner-sum{list-style:none;cursor:pointer}#ownerBox>summary.owner-sum::-webkit-details-marker{display:none}.owner-btn{display:inline-block;padding:9px 16px;border:1px solid var(--accent);border-radius:10px;color:var(--accent);font-weight:700;margin-right:8px}#ownerBox[open] .owner-btn{background:var(--accent);color:var(--accent-ink)}.step-help{color:var(--muted);font-size:13px;margin:4px 0 16px}.ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
small,.muted{color:var(--muted)}a{color:var(--accent);overflow-wrap:anywhere}.note{background:var(--warn);border:1px solid var(--warn-line);border-radius:10px;padding:12px 14px}
.kicker{text-transform:uppercase;font-size:13px;font-weight:700;color:var(--accent);letter-spacing:.03em;margin:0}
blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--line);color:var(--muted)}ol li,ul li{margin:6px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.grid div{border:1px solid var(--line);border-radius:10px;padding:10px}
.grid strong{display:block;font-size:18px}.grid.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.grid.two a{font-size:14px}
.grid.five{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}.eng{text-align:center}.eng small{display:block}.eng strong{font-size:26px}.eng.yes{border-color:var(--accent)}.eng.no{border-color:#c2410c}
select{width:100%;padding:11px;border:1px solid var(--line);border-radius:8px;font:inherit;background:var(--bg);color:var(--ink)}h3{font-size:17px;margin:1.2em 0 .4em}.error{color:#c2410c}
.now-bar{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:12px 16px;background:#0f3d3e;color:#fff;box-shadow:0 -6px 20px rgba(0,0,0,.18)}.now-bar[hidden]{display:none}.now-bar small{display:block;color:#cde7e4;font-size:12px}.now-bar strong{font-size:15px}.now-bar .btn{background:#fff;color:#0b2252;padding:9px 14px}.now-bar .now-top{color:#cde7e4;font-size:13px}
.rtabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px}.rtabs button{background:var(--bg);color:var(--ink);border:1px solid var(--line);padding:8px 14px;font-weight:600}.rtabs button[aria-selected="true"]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.chip{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 8px;margin:0 4px 0 0;border:1px solid var(--line);color:var(--muted);vertical-align:middle}.chip.rec{background:#fef08a;border-color:#facc15;color:#713f12}.chip.ai{border-color:#7c3aed;color:#6d28d9}.chip.g{border-color:#2563eb;color:#1d4ed8}
.gap .why{margin-top:4px}.gap .why summary{font-size:13px;color:var(--accent);cursor:pointer}.self li{list-style:none;margin:8px 0}.self label{font-weight:400;margin:0}.found li{margin:4px 0}.step-done{color:#15803d;font-weight:700}
#stepResearch>summary{font-weight:700;cursor:pointer;padding:6px 0}
.growth-cockpit{position:relative;overflow:hidden;background:linear-gradient(135deg,#0b2252 0%,#153d7d 55%,#2054ac 100%);color:white;border-radius:18px;padding:24px;margin:18px 0 22px;box-shadow:0 12px 32px rgba(14,44,100,.18);animation:cockpitEnter .5s ease-out}.growth-cockpit::before{content:'';position:absolute;width:260px;height:260px;border:1px solid rgba(255,255,255,.16);border-radius:50%;right:-100px;top:-140px;pointer-events:none}.growth-cockpit .kicker{color:#bfdbfe}.growth-cockpit h2{font-size:24px;line-height:1.22;color:#fff;margin:8px 0}.growth-cockpit p{color:#e0edff}.growth-cockpit .growth-eyebrow{display:inline-block;color:#dbeafe;background:rgba(255,255,255,.13);padding:5px 11px;border-radius:999px;font-size:12px;font-weight:750}.growth-cockpit .growth-next-btn{display:inline-flex;align-items:center;gap:10px;justify-content:center;min-height:46px;background:white;color:#153d7d;text-decoration:none;border-radius:10px;font-weight:800;padding:12px 18px;margin-top:6px;transition:transform .18s ease,box-shadow .18s ease;box-shadow:0 3px 8px rgba(0,0,0,.1)}.growth-next-btn:hover{transform:translateY(-2px);box-shadow:0 8px 18px rgba(0,0,0,.2)}.growth-next-btn:active{transform:scale(.97)}.growth-cockpit .growth-next-btn:focus-visible{outline:3px solid #fbbf24;outline-offset:3px}.growth-cockpit .growth-subline{font-size:13px;color:#c7d8f6;margin-top:12px}.growth-flow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:15px 0 4px}.growth-flow a{color:inherit;text-decoration:none;display:block}.growth-flow span{border:1px solid rgba(255,255,255,.26);padding:8px 5px;text-align:center;border-radius:8px;color:#dbeafe;font-size:12px;font-weight:650}.growth-flow span.complete{background:rgba(74,222,128,.2);border-color:#86efac;color:#e6ffef}.growth-flow span.active{background:rgba(255,255,255,.22);border-color:white;color:white;animation:flowPulse 1.8s ease-in-out infinite}.growth-decision-tag{display:inline-block;background:rgba(255,255,255,.17);font-size:13px;color:white;padding:4px 10px;border-radius:6px}.growth-cockpit.needs-evidence{background:linear-gradient(135deg,#26334b,#475569)}.growth-cockpit.no-change{background:linear-gradient(135deg,#134e4a,#115e59)}@keyframes cockpitEnter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes flowPulse{50%{box-shadow:inset 0 0 0 1px rgba(255,255,255,.6)}}@media(max-width:540px){.growth-flow{grid-template-columns:repeat(2,minmax(0,1fr))}.growth-cockpit{padding:18px}.growth-cockpit h2{font-size:21px}}@media(prefers-reduced-motion:reduce){.growth-cockpit,.growth-flow span.active{animation:none!important}.growth-cockpit .growth-next-btn{transition:none!important}} .journey-section{border:1px solid var(--line);border-radius:14px;margin:12px 0;background:var(--card);overflow:hidden}.journey-section>summary{display:flex;align-items:center;gap:12px;cursor:pointer;padding:18px 16px;list-style:none;user-select:none}.journey-section>summary::-webkit-details-marker{display:none}.journey-section>summary:focus-visible,.research-details>summary:focus-visible{outline:3px solid var(--accent);outline-offset:-3px}.journey-section>summary strong{display:block;font-size:17px}.journey-section>summary small{display:block;color:var(--muted);font-weight:400}.journey-num{display:grid;place-items:center;flex:0 0 36px;height:36px;background:var(--bg);border-radius:9px;font-weight:800}.journey-arrow{margin-left:auto;color:var(--accent);font-size:20px;transition:transform .18s}.journey-section[open]>.journey-arrow,.journey-section[open]>summary .journey-arrow{transform:rotate(180deg)}.journey-section[open]>summary{border-bottom:1px solid var(--line);background:var(--bg)}.journey-body{padding:18px;animation:journeyEnter .24s ease-out}.journey-body>h2:first-child{margin-top:0}.research-details{border:1px solid var(--line);border-radius:10px;margin:12px 0;padding:10px 14px}.research-details>summary{cursor:pointer;font-weight:650}.research-details[open]>summary{margin-bottom:12px}.journey-status{font-size:12px;font-weight:650;color:var(--done)}.journey-warning{color:var(--blocked)}@keyframes journeyEnter{from{opacity:.7;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.journey-body{animation:none!important}.journey-arrow{transition:none!important}}.growth-result-intro{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;padding:12px 16px;border:1px solid var(--line);border-radius:12px;background:var(--card);font-size:14px}.growth-result-intro strong{color:var(--accent)}.growth-result-intro span{color:var(--muted);font-size:12px}</style></head><body><main>${body}<p class="muted" style="margin-top:40px">${esc(cfg.brand)} · Free Growth check${cfg.privacyUrl?` · <a href="${esc(cfg.privacyUrl)}">Privacy</a>`:''}</p></main></body></html>`;
}

// Manual answer collection remains an optional fallback. Approved users get Gemini grounding automatically.
// The AI check is offered before the start: the prompt is built from the search term as it is typed, and the answers
// pasted here are stored with the check (same validation as pasting them on the result page).
function aiStartBlock(automatic=false){
 // Collapsed for everyone: a first-time visitor sees one form, not a prompt and five empty answer boxes.
 return `<details class="card" id="aiStart"><summary><strong>${automatic?'AI answers — automatic, plus your own (optional)':'Advanced: add AI answers yourself (optional)'}</strong> <small class="muted">${automatic?'Gemini with Google Search is checked automatically.':'You can also do this later on the result page.'}</small></summary>
 ${automatic?'<p>Growth automatically requests a Gemini answer grounded in live Google Search when the provider is configured. This is not a Google AI Overview. Other AI services are not marked as checked unless their actual answers are supplied.</p>':''}
 <ol><li>Enter the customer question or search phrase above.</li><li>Copy the prompt and paste it into a <strong>new chat with web search on</strong> (ChatGPT, Perplexity, Gemini, Claude or Copilot).</li><li>Paste the complete answer, including RESOURCES, at the AI system you used. You can also do this later on the result page.</li></ol>
 <label for="aiStartPrompt">Prompt (the same for every AI system)</label><textarea id="aiStartPrompt" rows="6" readonly></textarea><p><button type="button" class="ghost" id="aiStartCopy">Copy prompt</button></p>
 ${ai.ENGINES.map(e=>`<label>${esc(e.label)} — answer (optional)<textarea data-engine="${esc(e.id)}" rows="3" maxlength="${ai.MAX_PASTE}" placeholder="Paste the complete answer here"></textarea></label>`).join('')}</details>`;
}
function aiStartScript(){
 return `(function(){var LINES=${js(ai.DIRECT_PROMPT_LINES)},SLOT=${js(ai.QUERY_SLOT)},q=document.querySelector('[name=query]'),p=document.getElementById('aiStartPrompt');if(!q||!p)return;
 var upd=function(){var t=q.value.trim();p.value=t?LINES.map(function(l){return l===SLOT?t:l}).join(String.fromCharCode(10,10)):'Enter the customer question above first: the prompt uses it exactly.';document.getElementById('aiStartCopy').disabled=!t};
 q.addEventListener('input',upd);upd();
 document.getElementById('aiStartCopy').onclick=function(){p.select();if(navigator.clipboard)navigator.clipboard.writeText(p.value);this.textContent='Copied ✓'}})();
function aiStartAnswers(){return Array.prototype.slice.call(document.querySelectorAll('textarea[data-engine]')).filter(function(t){return t.value.trim()}).map(function(t){return {engine:t.getAttribute('data-engine'),text:t.value}})}`;
}

function formPage(cfg,api,base,accessKey,invite=null,owner={available:false,signedIn:false}){
 return page('Free Growth check — what is your page missing?',`
<p class="kicker">Free · no account needed</p>
<h1>Is your page found in Google — and in AI answers?</h1>
<p class="lead">Enter one page of your website. The check compares it with the pages Google ranks for your search and tells you in plain language whether to change something — or not. You can also see whether AI answers (ChatGPT, Perplexity, Gemini, Claude, Copilot) cite your page, by pasting their answers on the result.</p>
${invite?`<p class="note"><strong>Personal invitation${invite.label?' — '+esc(invite.label):''}.</strong> ${esc(invite.left)} of ${esc(invite.max)} checks left, valid until ${esc(invite.expires)}.${invite.email_hint?' Only works with the email address '+esc(invite.email_hint)+'.':''}</p>`:''}
<form id="f" class="card" novalidate>
 <label for="url">Page address</label><input id="url" name="url" type="text" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" required placeholder="https://www.yoursite.com/service-page/" maxlength="500">
 <label for="query">Customer question (optional)</label><input id="query" name="query" maxlength="120" placeholder="e.g. How much does roof repair cost in Lodi NJ?">
 ${owner.signedIn||invite?`<p><button type="button" id="cqFind" class="ghost">Find customer questions</button> <small role="status" id="cqStatus">Automatic customer question discovery is available with approved access.</small></p><div id="cqList"></div>`:''}
 <small>Leave it empty and the check finds the question customers ask in Google for what your page offers. Or type the question yourself — it then wins.</small>
 <input type="hidden" id="topic" name="topic"><input type="hidden" id="rt" name="rt"><p class="note" id="topicNote" hidden></p>
 <label for="market">Target market (optional)</label><input id="market" name="market" list="marketRegions" maxlength="200" placeholder="nl — Netherlands">
 <label for="language">Language (optional)</label><input id="language" name="language" list="marketLanguages" maxlength="40" placeholder="Dutch">
 <small>Where your customers search, as in the Pre-Write brief. Several markets separated by commas, main market first. Leave empty to let the check derive it from your page.</small>
 <datalist id="marketRegions">${PREWRITE_REGIONS.map(x=>'<option value="'+esc(x)+'">').join('')}</datalist><datalist id="marketLanguages">${PREWRITE_LANGUAGES.map(x=>'<option value="'+esc(x)+'">').join('')}</datalist>
${aiStartBlock(!!owner.signedIn||!!invite)}
 <label for="gscFile">Search Console export (optional)</label><input id="gscFile" name="gscFile" type="file" accept=".zip,.csv,text/csv,application/zip">
 <small>No Google sign-in needed. In Search Console: Performance → filter Page → "Exact URL" → this page → Export → Download CSV (a ZIP). Only an export filtered on exactly this page counts as evidence; it is used only for this check, never shared.</small>
 <label for="email">Your email address(es)</label><input id="email" name="email" type="email" multiple required maxlength="1100" placeholder="you@company.com, colleague@company.com"><small>Up to 5 addresses, separated by commas. The first address gets the e-mails; the others are kept with the check.</small>
 <label class="check"><input type="checkbox" name="consent" required> <span>I agree that my email and the checked page are stored to run this check and show the result.${invite?'':` ${owner.signedIn?' Owner mode: no daily limit.':` Max ${cfg.perEmail} free checks per day for the first address.`}`}</span></label>
 <label class="check"><input type="checkbox" name="marketing"> <span>You may email me about this result (optional).</span></label>
 ${owner.signedIn?'<label class="check"><input type="checkbox" name="fresh"> <span><strong>Research again</strong>: ignore a stored result of today for the same page and question (uses 1–2 Serper searches)</span></label>':''}
 <p><button type="submit">${owner.signedIn?'Run the check (owner)':'Run the free check'}</button> <small id="s" role="status"></small></p>
</form>
${owner.signedIn?`<div class="card" id="ownerBox"><strong>Owner mode</strong><p class="muted">Signed in with your admin key: no daily limit, and AI writes the chosen H2s in your checks${cfg.writing==='off'?' (AI writing is switched off on the server: GROWTH_FREE_WRITING=off)':''}. Visitors keep their normal limits.</p><p><button type="button" class="ghost" id="ownerOut">Sign out</button></p></div>`:owner.available?`<details class="card" id="ownerBox"><summary class="owner-sum"><span class="owner-btn">🔑 Owner? Sign in</span> <small class="muted">no daily limit, AI writing on</small></summary><form id="ownerIn" autocomplete="off"><label for="ownerKey">Admin key (GROWTH_FREE_ADMIN_KEY in Railway)</label><input id="ownerKey" type="password" autocomplete="current-password" required minlength="16"><p><button type="submit">Sign in as owner</button> <small id="ownerSt" role="status"></small></p></form></details>`:''}
<div class="card"><h2 style="margin-top:0">What you get</h2><ul>
<li>One clear decision: <strong>leave it</strong>, <strong>add a missing answer</strong>, <strong>make a separate page</strong>, or <strong>not enough evidence</strong>.</li>
<li>Where to add it on your page, with the ranking pages that support it.</li>
<li>Whether AI answers cite your site or this page — and which sites they cite instead.</li>
<li>The full research as JSON, to process yourself or with your own tools.</li></ul>
<p class="muted">No ranking promises. Nothing is changed on your website. Takes about one minute.</p></div>
<script>
${aiStartScript()}
// A "new check for this page" link fills in the page, search term, market and language; the visitor can change them.
(function(){try{var q=new URLSearchParams(location.search);['url','query','market','language','topic','rt'].forEach(function(k){var v=q.get(k),el=document.getElementById(k);if(v&&el&&!el.value)el.value=v.slice(0,k==='rt'?420:300)})}catch(e){}})();
// From the free rank tracker: the tracked keyword is the topic (the check picks the best real customer question about it),
// and a signed handoff fills in the owner's e-mail address and links the publication date back to the tracker.
(function(){try{var t=document.getElementById('topic'),n=document.getElementById('topicNote'),rt=document.getElementById('rt');
 if(t&&t.value&&n){n.hidden=false;n.textContent='From your rank tracker: “'+t.value+'”. Leave the customer question empty and the check picks the best real question customers ask in Google about it.'}
 if(rt&&rt.value)fetch('/api/rank-free/handoff?rt='+encodeURIComponent(rt.value),{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){var e=document.getElementById('email');if(d&&d.success&&e&&!e.value)e.value=d.email;if(!(d&&d.success))rt.value=''}).catch(function(){})}catch(e){}})();
var OWNER=${js(!!owner.signedIn)},APPROVED=${js(!!owner.signedIn||!!invite)};
(function(){var f=document.getElementById('ownerIn');if(f)f.addEventListener('submit',async function(e){e.preventDefault();var st=document.getElementById('ownerSt'),k=document.getElementById('ownerKey');st.textContent='Checking…';
  try{var r=await fetch(${js(api)}+'/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k.value})});k.value='';var x=await r.json();if(!x.success)throw Error(x.error||'Not signed in');location.reload()}catch(err){st.textContent=err.message}});
 var o=document.getElementById('ownerOut');if(o)o.onclick=async function(){await fetch(${js(api)}+'/admin/logout',{method:'POST',credentials:'same-origin'});location.reload()}})();
// This browser remembers what was entered (page, search term, market, language, addresses), so the next check starts
// filled in. Only in this browser; a link with values wins; works without storage too.
var REMEMBER=['url','query','market','language','email'],MEM='growthFreeForm';
(function(){try{var m=JSON.parse(localStorage.getItem(MEM)||'{}');REMEMBER.forEach(function(k){var el=document.getElementById(k);if(el&&!el.value&&m[k])el.value=String(m[k]).slice(0,1100)})}catch(e){}var q=document.getElementById('query');if(q&&q.value)q.dispatchEvent(new Event('input',{bubbles:true}))})();
function rememberForm(){try{var m={};REMEMBER.forEach(function(k){var el=document.getElementById(k);if(el)m[k]=el.value});localStorage.setItem(MEM,JSON.stringify(m))}catch(e){}rememberAi()}
// Pasted AI answers are kept in this browser too, with the customer question they answer: after a refresh or a failed start
// they come back as long as the question is the same (an answer to another question would not count). Reset clears them.
var MEM_AI='growthFreeFormAi';
function rememberAi(){try{var q=(document.getElementById('query')||{}).value||'',a={};document.querySelectorAll('textarea[data-engine]').forEach(function(t){if(t.value.trim())a[t.getAttribute('data-engine')]=t.value});
 if(Object.keys(a).length)localStorage.setItem(MEM_AI,JSON.stringify({query:q.trim(),answers:a}));else localStorage.removeItem(MEM_AI)}catch(e){}}
(function(){try{var m=JSON.parse(localStorage.getItem(MEM_AI)||'null'),q=(document.getElementById('query')||{}).value||'';if(!m||!m.answers||String(m.query||'')!==q.trim())return;var n=0;
 document.querySelectorAll('textarea[data-engine]').forEach(function(t){var v=m.answers[t.getAttribute('data-engine')];if(v&&!t.value){t.value=String(v).slice(0,40000);n++}});
 var box=document.getElementById('aiStart');if(n&&box){box.open=true;var note=document.createElement('p');note.className='muted';note.id='aiRestored';note.textContent=n+' pasted AI answer(s) restored from this browser.';box.insertBefore(note,box.children[1]||null)}}catch(e){}})();
document.querySelectorAll('textarea[data-engine]').forEach(function(t){t.addEventListener('input',rememberAi)});
var freeForm=document.getElementById('f');
if(freeForm){freeForm.addEventListener('input',function(e){if(e.target&&REMEMBER.includes(e.target.name))rememberForm()});
 freeForm.addEventListener('change',function(e){if(e.target&&REMEMBER.includes(e.target.name))rememberForm()});
 var resetFree=document.createElement('button');resetFree.type='button';resetFree.id='growthFreeReset';resetFree.className='ghost';resetFree.textContent='Reset saved fields';resetFree.style.marginLeft='8px';
 var submitFree=freeForm.querySelector('button[type=submit]');if(submitFree){submitFree.insertAdjacentElement('afterend',resetFree);resetFree.addEventListener('click',function(){
  REMEMBER.forEach(function(k){var el=freeForm.elements[k];if(el)el.value=''});
  document.querySelectorAll('textarea[data-engine]').forEach(function(t){t.value=''});try{localStorage.removeItem(MEM_AI)}catch(e){}
  try{localStorage.removeItem(MEM)}catch(e){}
  var start=document.getElementById('aiStartPrompt');if(start)start.value='';
  var list=document.getElementById('cqList');if(list)list.innerHTML='';
  var status=document.getElementById('cqStatus');if(status)status.textContent='Saved fields cleared.';
  document.getElementById('s').textContent='Saved fields cleared. You can enter new details.';
 })}}

// Customer questions for the page entered above: Google's questions (People also ask, related searches) and labelled AI
// ideas. Clicking one puts it in the search term; the check then researches that question.
// An address typed without "https://" is completed when the field is left (the server does the same).
(function(){var u=document.getElementById('url');if(!u)return;u.addEventListener('blur',function(){var v=u.value.trim();if(v&&!/^[a-z][a-z0-9+.-]*:/i.test(v)&&/^[^\s/]+\.[^\s/]+/.test(v))u.value='https://'+v})})();
(function(){var b=document.getElementById('cqFind');if(!b)return;var st=document.getElementById('cqStatus'),list=document.getElementById('cqList');
 b.addEventListener('click',async function(){var url=document.getElementById('url').value.trim(),kw=document.getElementById('query').value.trim();if(!url&&!kw){st.textContent='Enter a keyword (search term) first.';return}
  b.disabled=true;b.classList.add('is-working');st.textContent='Looking up how customers search…';list.innerHTML='';
  try{var r=await fetch(${js(api)}+'/customer-questions',{method:'POST',credentials:'same-origin',headers:OWNER?{'Content-Type':'application/json','X-Requested-With':'growth-free-admin'}:{'Content-Type':'application/json'},body:JSON.stringify({key:${js(accessKey)},invite:${js(invite?invite.token:'')},url:url,query:document.getElementById('query').value,market:document.getElementById('market').value,language:document.getElementById('language').value})});
   var d=await r.json();if(!d.success)throw Error(d.error||'Not available right now.');
   st.textContent=d.questions.length?'Best observed Google match first; AI ideas only if no suitable Google question. Choose or edit any question.':'No suitable questions found; enter your own.';
   list.innerHTML=d.questions.map(function(q){return '<button type="button" class="ghost cqPick" style="margin:4px 6px 4px 0;text-align:left">'+q.text.replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})+' <small style="display:inline">· '+q.label+(q.text===d.best_question?' · Best match':'')+'</small></button>'}).join('')+(d.questions.length?'<p class="muted">'+d.note+'</p>':'');
   Array.prototype.forEach.call(list.querySelectorAll('.cqPick'),function(x,i){x.onclick=function(){document.getElementById('query').value=d.questions[i].text;rememberForm();document.getElementById('query').dispatchEvent(new Event('input',{bubbles:true}));st.textContent='Search term set: “'+d.questions[i].text+'”.'}});
  }catch(err){st.textContent=err.message}b.disabled=false;b.classList.remove('is-working')})})();
function gscBase64(file){return new Promise(function(ok,bad){var r=new FileReader();r.onload=function(){ok(String(r.result).split(',')[1]||'')};r.onerror=function(){bad(Error('The file could not be read.'))};r.readAsDataURL(file)})}
// A request never waits forever: after the time limit the button comes back with a clear message.
function timeoutSignal(ms){try{if(AbortSignal.timeout)return AbortSignal.timeout(ms)}catch(e){}var c=new AbortController();setTimeout(function(){c.abort()},ms);return c.signal}
document.getElementById('f').addEventListener('submit',async function(e){e.preventDefault();var f=e.target,s=document.getElementById('s'),b=f.querySelector('button[type=submit]');
if(!f.consent.checked){s.textContent='Please accept the storage notice.';return}
rememberForm();
b.disabled=true;b.classList.add('is-working');b.setAttribute('aria-busy','true');s.textContent='Starting…';
try{
 // If no customer question was supplied, discover one automatically for this URL before starting the check.
 // An explicitly entered question is authoritative and is never replaced.
 if(APPROVED&&!f.query.value.trim()){
  s.textContent='Finding a customer question for this page…';
  try{
   var qr=await fetch(${js(api)}+'/customer-questions',{signal:timeoutSignal(45000),method:'POST',credentials:'same-origin',headers:OWNER?{'Content-Type':'application/json','X-Requested-With':'growth-free-admin'}:{'Content-Type':'application/json'},body:JSON.stringify({key:${js(accessKey)},invite:${js(invite?invite.token:'')},url:f.url.value,query:'',market:f.market.value,language:f.language.value})});
   var qd=await qr.json();
   var qs=qd&&qd.success&&Array.isArray(qd.questions)?qd.questions:[];
   var chosen=qs.filter(function(q){return q.text===qd.best_question})[0]||qs.filter(function(q){return q.priority==='OBSERVED_GOOGLE'})[0]||qs.filter(function(q){return q.source==='AI_SUGGESTION'})[0];
   if(chosen&&chosen.text){f.query.value=chosen.text;rememberForm();s.textContent='Customer question: '+chosen.text+' · '+chosen.label+'. Starting check…'}
   else s.textContent='No customer question verified automatically; using the page topic as a working phrase…';
  }catch(e){s.textContent='Question suggestions unavailable; continuing with the page topic…'}
 }
 var gf=null,gi=document.getElementById('gscFile');if(gi&&gi.files&&gi.files[0]){if(gi.files[0].size>3*1024*1024)throw Error('The Search Console file is larger than 3 MB. Export only this page.');gf={name:gi.files[0].name,content_base64:await gscBase64(gi.files[0])}}
var r=await fetch(${js(api)}+'/checks',{signal:timeoutSignal(60000),method:'POST',credentials:'same-origin',headers:OWNER?{'Content-Type':'application/json','X-Requested-With':'growth-free-admin'}:{'Content-Type':'application/json'},body:JSON.stringify({gsc_file:gf,key:${js(accessKey)},invite:${js(invite?invite.token:'')},url:f.url.value,query:f.query.value,topic:f.topic?f.topic.value:'',rank_ref:f.rt?f.rt.value:'',market:f.market.value,language:f.language.value,email:f.email.value,consent:true,marketing_consent:f.marketing.checked,fresh:!!(f.fresh&&f.fresh.checked),ai_answers:aiStartAnswers()})});
var d=await r.json();if(!d.success)throw Error(d.error||'Could not start the check');location.href=d.result_url}
catch(err){s.textContent=err&&(err.name==='AbortError'||err.name==='TimeoutError')?'The server did not answer within a minute. Please try again in a moment.':err.message;s.className='error';b.disabled=false;b.classList.remove('is-working');b.removeAttribute('aria-busy');b.classList.add('action-red')}});
</script>`,cfg);
}

function resultPage(cfg,api,base,id,key){
 // Brand, contact link and service text come from the access key of the check (API: offer).
 const q=`?k=${encodeURIComponent(key)}`;
 return page('Your Growth check result',`
<p><a id="back" href="${esc(base)}">← New check</a></p>
<div id="out" class="card" aria-live="polite" aria-busy="true"><p class="kicker">Working</p><h1>Checking your page…</h1><div class="research-progress" role="progressbar" aria-label="Research in progress" aria-valuetext="Research in progress"></div><p class="muted">Reading your page and the pages that rank for your search. This usually takes under a minute. You can keep this page open; the link also works later.</p></div>
<script>
var API=${js(api+'/checks/'+id)},Q=${js(q)},CONTACT=${js(cfg.contactUrl)},SERVICE=${js(cfg.serviceText)},BRAND=${js(cfg.brand)};
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
var ENG_STATE={};
function openJourney(id){var el=document.getElementById(id);if(!el)return;var root=el.closest('details.journey-section')||(el.matches('details.journey-section')?el:null);if(root){document.querySelectorAll('details.journey-section').forEach(function(x){if(x!==root)x.open=false});root.open=true}var rt=el.id==='stepResearch'?el:el.closest('#stepResearch');if(rt){rt.open=true;var pane=el.closest('.rtab-pane');if(pane)rtab(pane.getAttribute('data-tab'))}var inner=el.closest('details.research-details');if(inner)inner.open=true}
// Evidence tabs (Google · AI answers · Search Console): one pane visible at a time.
function rtab(name){document.querySelectorAll('.rtab-pane').forEach(function(p){p.hidden=p.getAttribute('data-tab')!==name});document.querySelectorAll('.rtabs button').forEach(function(b){b.setAttribute('aria-selected',String(b.getAttribute('data-tab')===name))})}
document.addEventListener('click',function(e){var b=e.target.closest('.rtabs button');if(b)rtab(b.getAttribute('data-tab'))});
document.addEventListener('click',function(e){var a=e.target.closest('a[href^="#"]');if(!a)return;var id=a.getAttribute('href').slice(1);if(!id||!document.getElementById(id))return;e.preventDefault();showStep(id,id)});
// Close other main steps synchronously on a deliberate summary click; never in a delayed toggle event.
// Opening a step closes the others. The step above may be long, so closing it would move the page and leave the
// visitor far below the step they clicked: the clicked step is kept in place (its header at the top of the screen).
document.addEventListener('click',function(e){var s=e.target.closest('details.journey-section > summary');if(!s||s.parentElement.open)return;var before=s.getBoundingClientRect().top;document.querySelectorAll('details.journey-section').forEach(function(x){if(x!==s.parentElement)x.open=false});requestAnimationFrame(function(){var top=s.getBoundingClientRect().top;if(top<0||top>window.innerHeight*0.6)s.scrollIntoView({block:'start'});else if(Math.abs(top-before)>2)window.scrollBy(0,top-before)})},true);
// Every jump to a step keeps the step header in view.
function showStep(id,targetId){openJourney(id);requestAnimationFrame(function(){var el=document.getElementById(targetId||id);if(el)el.scrollIntoView({block:'start'})})}

function aiHtml(a,auto){var x=a.summary,h='<h3 id="ai">AI answers <small>('+esc(x.checked)+' of 5 checked'+(x.checked===5?' · complete':'')+')</small></h3>';
 if(auto&&auto.gemini){var g=auto.gemini,status=g.status||'UNKNOWN';h+='<p class="note"><strong>Automatic AI research · Gemini with Google Search:</strong> '+(status==='SUCCESS'?'Completed and saved. See Gemini results below.':status==='NOT_CONFIGURED'?'Not configured on this server.':status==='NO_GROUNDED_ANSWER'?'No verifiable source-backed answer was returned.':status==='PROVIDER_UNAVAILABLE'?'The provider was unavailable.':status==='INCOMPLETE'?'The provider returned an incomplete answer.':'No verified automatic answer ('+esc(status)+').')+' This is not a Google AI Overview. ChatGPT, Claude, Perplexity and Copilot are only marked checked when their actual responses are supplied.</p>'}
 h+='<p class="muted"><strong>'+esc(x.headline)+'.</strong> '+esc(x.explanation)+'</p>';
 h+='<div class="grid five">'+x.engines.map(function(e){var st=!e.checked?(e.invalid?'INVALID, not counted':'not checked'):e.topic_warning?'check the topic (no shared word with the search term) — counted':!e.verifiable?'no source list pasted — not verified':!e.sources?'no sources given':e.exact_page_cited?'cites this page':e.own_site_cited?'cites your site':'does not cite you';
  return '<div class="eng '+(e.checked&&e.verifiable?(e.own_site_cited?'yes':'no'):'')+'"><strong>'+(e.checked&&e.verifiable?esc(e.sources):'–')+'</strong><small>'+esc(e.label)+'</small><small>'+esc(st)+'</small></div>'}).join('')+'</div><p class="muted">Number = sources the AI answer listed. Links inside its text are not counted.</p>';
 if(x.top_cited_sites.length)h+='<details class="research-details"><summary>Sources mentioned in the AI answers ('+esc(x.top_cited_sites.length)+')</summary><h3>Sites AI cites for “'+esc(a.search_term)+'”</h3><ul>'+x.top_cited_sites.map(function(t){return '<li>'+esc(t.site)+' <small>— in '+esc(t.ai_systems)+' of '+esc(x.checked)+' AI answers'+(x.also_in_google.indexOf(t.site)>=0?' · also ranks in Google':'')+'</small></li>'}).join('')+'</ul></details>';
 h+=aiGapHtml(a.gap);
 h+='<p class="muted">These source mentions are AI visibility observations, not verified content gaps. Growth compares the readable ranking pages automatically and labels missing evidence separately.</p>';
 var next=x.engines.filter(function(e){return !e.checked})[0]||x.engines[0];
  // Manual copying must not appear as the main action of the automatic Free Growth report.
 h+='<details id="aiRecheck" class="research-details"><summary>'+(x.checked===5?'Advanced · Recheck an AI answer (optional)':'Advanced · Add independent AI answers manually ('+(5-x.checked)+' unchecked)')+'</summary><div class="card"><p class="muted">Only check another AI answer if you want to; this never blocks the Google research.</p><ol><li>Choose the AI system.</li><li>Copy the prompt and paste it into a <strong>new chat with web search on</strong>.</li><li>Paste the complete answer below, including the source links.</li></ol>'+
  '<label>AI system<select id="aiEngine">'+x.engines.map(function(e){return '<option value="'+esc(e.id)+'"'+(e.id===next.id?' selected':'')+'>'+esc(e.label)+(e.checked?' ✓':'')+'</option>'}).join('')+'</select></label>'+
  '<label>Prompt (the same for every AI system)<textarea id="aiPrompt" rows="6" readonly>'+esc(a.prompt)+'</textarea></label><p><button type="button" class="ghost" id="aiCopy">Copy prompt</button></p>'+
  '<label>Answer from the AI system<textarea id="aiText" rows="7" maxlength="'+esc(a.max_paste)+'" placeholder="Paste the complete answer here"></textarea></label><p><button type="button" id="aiSave">Analyse answer</button> <small role="status" id="aiStatus"></small></p></div></details>';
 h+='<p class="muted">'+esc(x.caveat)+'</p>';return h}
// AI gap: what the pages AI cites (where it does not cite you) have and your page does not.
function aiGapHtml(g){var inner=aiGapInner(g);return inner?'<div id="aiGapBox">'+inner+'</div>':''}
function aiGapInner(g){if(!g)return '';
 var h='<h3 id="aiGap">What the pages AI cites have that your page does not</h3>';
 if(g.status==='RUNNING')return h+'<p class="muted">The pages AI cites are being read now (your saved AI answers are used, nothing to paste again). The comparison appears here by itself in a moment.</p><span id="aiGapRunning" hidden></span>';
 if(g.status==='FAILED')return h+'<p class="muted">The pages AI cites could not be compared this time. Paste an answer again to retry.</p>';
 if(g.status==='NO_CITED_PAGES')return '';
 if(g.status==='OWN_PAGE_UNREADABLE')return h+'<p class="muted">Your page could not be read just now, so the pages AI cites were not compared with it. Paste an answer again to retry.</p>';
 h+='<p class="muted">For the AI systems that do not cite you: the pages they cite, read and compared with your page. Observations only; add only what is true for your business, in your own words.</p>';
 if(g.status==='NOTHING_READABLE')h+='<p class="muted">None of the cited pages could be read automatically. Open them yourself (links below).</p>';
 if((g.missing_facts||[]).length)h+='<div class="card"><strong>Facts they state and your page does not</strong><ul>'+g.missing_facts.map(function(f){return '<li><strong>'+esc(f.label)+'</strong> <small>— on '+esc(f.sites.join(', '))+'</small>'+(f.example?'<br><small class="muted">'+esc(f.example.site)+': “'+esc(f.example.excerpt)+'”</small>':'')+'</li>'}).join('')+'</ul></div>';
 if((g.missing_topics||[]).length)h+='<div class="card"><strong>Topics they cover and your page does not ('+g.missing_topics.length+')</strong><br><small class="muted">'+(g.topics_basis==='TOPICS_COMPARED'?'Compared by topic: a section on your page that answers the same question counts, also when worded differently.':'Compared by heading words only: check each one, your page may answer it in other words.')+'</small><ul>'+g.missing_topics.map(function(t){return '<li><strong>'+esc(t.topic)+'</strong>'+(t.coverage==='PARTLY'?' <small>(partly on your page)</small>':t.coverage==='UNSURE'?' <small>(not sure: check whether your page answers this)</small>':'')+' <small>— '+esc(t.sites.join(', '))+'</small>'+(t.examples[0]&&t.examples[0].excerpt?'<br><small class="muted">“'+esc(t.examples[0].excerpt)+'”</small>':'')+(t.item_id?'<br><button type="button" class="ghost aiGapAdd" data-item="'+esc(t.item_id)+'">Add this topic to my choice in step 1</button> <small role="status" class="aiGapStatus"></small>':'')+'</li>'}).join('')+'</ul></div>';
 var el=g.elements||{},miss=(el.elements_they_have_and_this_page_lacks||[]).map(function(e){return e.label+' ('+e.ranking_pages_with_it+' of '+e.of+')'}).concat((el.structured_data_they_have_and_this_page_lacks||[]).map(function(e){return 'Structured data: '+e.type+' ('+e.ranking_pages_with_it+' of '+e.of+')'}));
 if(miss.length)h+='<div class="card"><strong>Page elements they have and your page does not</strong><ul>'+miss.map(function(m){return '<li>'+esc(m)+'</li>'}).join('')+'</ul></div>';
 h+='<details class="research-details"><summary>Pages AI cites ('+esc((g.pages||[]).length)+')</summary>'+(g.pages||[]).map(function(p){var m=(p.headings||[]).filter(function(x){return x.status==='MISSING'}).length;
  return '<div class="card"><strong>'+esc(p.site)+'</strong> <small class="muted">· cited by '+esc(p.cited_by.join(', '))+' · '+esc(p.status)+(p.read&&(p.headings||[]).length?' · '+m+' of '+p.headings.length+' heading(s) not on your page':'')+'</small><br><small><a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(p.url)+'</a></small>'+
   ((p.headings||[]).length?'<ul>'+p.headings.map(function(x){return '<li>'+(x.status==='MISSING'?'<strong>'+esc(x.text)+'</strong> <small class="error">· not on your page</small>':x.status==='PARTLY'?esc(x.text)+' <small>· partly on your page</small>':esc(x.text)+' <small class="muted">· on your page</small>')+'</li>'}).join('')+'</ul>':'')+'</div>'}).join('')+'</details>';
 return h}
// While the cited pages are read, only the AI-gap block is refreshed (every 5 s, at most 2 minutes): the rest of the
// page, an open step and a half-pasted answer stay as they are.
var aiGapPoll=null;
function wireAiGap(){if(aiGapPoll){clearTimeout(aiGapPoll);aiGapPoll=null}
 if(document.getElementById('aiGapRunning')){var tries=0;var tick=async function(){tries++;
   try{var d=await (await fetch(API+Q,{cache:'no-store'})).json();var g=d&&d.ai&&d.ai.gap,box=document.getElementById('aiGapBox');
    if(box&&g&&g.status!=='RUNNING'){box.outerHTML=aiGapHtml(g);wireAiGap();return}}catch(e){}
   if(tries<24)aiGapPoll=setTimeout(tick,5000)};aiGapPoll=setTimeout(tick,5000)}
 document.querySelectorAll('.aiGapAdd').forEach(function(b){b.onclick=function(){var box=document.querySelector('.gapPick[value="'+b.getAttribute('data-item').replace(/"/g,'')+'"]'),st=b.parentNode.querySelector('.aiGapStatus');
  if(!box){st.textContent='This topic is not in the list of step 1.';return}if(!box.checked){box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}))}st.textContent='Added to your choice in step 1.';b.disabled=true}})}
function aiDraftKey(eng){return 'growthFreeAiDraft:'+API+':'+eng}
function wireAi(){wireAiGap();var b=document.getElementById('aiSave');if(!b)return;
 // The answer being pasted is kept in this browser per check and AI system until it is analysed (a refresh loses nothing).
 var ta=document.getElementById('aiText'),sel=document.getElementById('aiEngine');
 var load=function(){try{var v=localStorage.getItem(aiDraftKey(sel.value));if(v&&!ta.value)ta.value=v}catch(e){}};load();
 sel.addEventListener('change',function(){ta.value='';load()});
 ta.addEventListener('input',function(){try{if(ta.value.trim())localStorage.setItem(aiDraftKey(sel.value),ta.value);else localStorage.removeItem(aiDraftKey(sel.value))}catch(e){}});
 document.getElementById('aiCopy').onclick=function(){var t=document.getElementById('aiPrompt');t.select();if(navigator.clipboard)navigator.clipboard.writeText(t.value);this.textContent='Copied ✓'};
 b.onclick=async function(){var st=document.getElementById('aiStatus'),eng=document.getElementById('aiEngine').value,txt=document.getElementById('aiText').value;if(!txt.trim()){st.textContent='Paste the answer first.';return}b.disabled=true;st.textContent='Analysing…';
  try{var r=await fetch(API+'/ai'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine:eng,text:txt})});var x=await r.json();if(!x.success)throw Error(x.error||'Not analysed');
   try{localStorage.removeItem(aiDraftKey(eng))}catch(e){}
   var d=await (await fetch(API+Q,{cache:'no-store'})).json();if(d.status==='DONE')render(d);else showAiFirst(d,true);showStep('stepResearch','ai')}catch(err){st.textContent=err.message;b.disabled=false}}}
function gscHtml(g){var h='<h3 id="gsc">Search Console <small>(optional)</small></h3>';
 if(g&&g.latest){var L=g.latest,T=L.totals||{};
  h+='<p class="lead"><strong>'+(L.status==='VERIFIED_FOR_PAGE'?'Verified for this page':L.status==='PAGE_TOTALS_ONLY'?'Totals of this page; search terms not page-filtered':'Not verified for this page')+'.</strong> '+esc(L.message)+(L.status==='VERIFIED_FOR_PAGE'&&!L.used_in_research?' This export was uploaded after the research (or belongs to a reused result), so it was not used to decide the page improvements. Start a new check and upload it before research to include its search queries.':'')+'</p>';
  h+='<div class="grid"><div><small>Period</small><strong>'+(L.period?esc(L.period.start)+' – '+esc(L.period.end):'not in the export')+'</strong></div><div><small>Clicks</small><strong>'+esc(T.clicks)+'</strong></div><div><small>Impressions</small><strong>'+esc(T.impressions)+'</strong></div><div><small>Average position</small><strong>'+(T.position==null?'–':esc(T.position))+'</strong></div></div>';
  if(T.source==='QUERIES_SUM_UNDERCOUNTS')h+='<p class="muted">Totals are the sum of the search terms; Search Console leaves out rare terms, so the real totals are higher. The ZIP export includes the exact totals.</p>';
  if(L.search_term)h+='<p>'+(L.search_term_row?'Your search term “'+esc(L.search_term)+'”: '+esc(L.search_term_row.impressions)+' impressions, '+esc(L.search_term_row.clicks)+' clicks, position '+esc(L.search_term_row.position==null?'–':L.search_term_row.position)+'.':'Your search term “'+esc(L.search_term)+'” is not in this export (no impressions in this period, or too rare to be listed).')+'</p>';
  if((L.top_queries||[]).length)h+='<h3>Search terms with the most impressions</h3><ol>'+L.top_queries.map(function(q){return '<li>'+esc(q.query)+' <small>— '+esc(q.impressions)+' impressions, '+esc(q.clicks)+' clicks'+(q.position==null?'':', position '+esc(q.position))+'</small></li>'}).join('')+'</ol>';
  if(g.uploads>1)h+='<p class="muted">'+esc(g.uploads)+' exports uploaded for this check; the latest is shown. All are kept for the comparison after publication.</p>';
 }else h+='<p>No Search Console export uploaded. The check works without it; with an export filtered on exactly this page, the research also uses your real search terms.</p>';
 h+='<details class="research-details" id="gscUpload"><summary>Upload another Search Console export (optional)</summary><div class="card"><label>Upload a Search Console export (ZIP or CSV)<input id="gscLater" type="file" accept=".zip,.csv,text/csv,application/zip"></label><p class="muted">Performance → filter Page → "Exact URL" → this page → Export → Download CSV. Stored with this check only. The Google research is not run again.</p><p><button type="button" id="gscSave">Upload export</button> <small role="status" id="gscStatus"></small></p></div></details>';
 return h}
function wireGsc(){var b=document.getElementById('gscSave');if(!b)return;
 b.onclick=async function(){var st=document.getElementById('gscStatus'),f=document.getElementById('gscLater').files[0];if(!f){st.textContent='Choose the export file first.';return}
  if(f.size>3*1024*1024){st.textContent='The file is larger than 3 MB. Export only this page.';return}
  b.disabled=true;b.classList.add('is-working');b.setAttribute('aria-busy','true');st.textContent='Reading…';
  try{var c=await new Promise(function(ok,bad){var r=new FileReader();r.onload=function(){ok(String(r.result).split(',')[1]||'')};r.onerror=function(){bad(Error('The file could not be read.'))};r.readAsDataURL(f)});
   var r=await fetch(API+'/gsc'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gsc_file:{name:f.name,content_base64:c}})});var x=await r.json();if(!x.success)throw Error(x.error||'Not uploaded');
   var d=await (await fetch(API+Q,{cache:'no-store'})).json();render(d);showStep('stepResearch','gsc')}catch(err){st.textContent=err.message;b.disabled=false;b.classList.remove('is-working');b.removeAttribute('aria-busy');b.classList.add('action-failed')}}}
var GAPS=null;
var GAP_GROUPS=[];
function exampleText(x){return function(e){return (e.position?'#'+esc(e.position)+' ':'')+esc(e.site)+(e.heading&&e.heading!==x.title?': “'+esc(e.heading)+'”':'')}}
// Step summaries say what is done (✓) or what to do; a finished step closes, the next one opens.
function stepSum(n,title,line,done){return '<summary><span class="journey-num">'+(done?'✓':n)+'</span><span><strong>'+title+'</strong><small'+(done?' class="step-done"':'')+'>'+esc(line)+'</small></span><span class="journey-arrow">⌄</span></summary>'}
// "Do it yourself": what Growth does not write (page elements, structured data, facts only you know, AI visibility work).
// Ticked items are remembered in this browser and move to "Done".
function selfItems(g,d){var out=[],ag=d&&d.ai&&d.ai.gap,acts=(d&&d.ai&&d.ai.summary&&d.ai.summary.visibility_actions)||[];
 ((g&&g.items)||[]).filter(function(x){return x.group==='PAGE_ELEMENT'}).forEach(function(x){out.push({id:'el:'+x.id,title:x.title.indexOf('Structured data: ')===0?'Add structured data (schema): '+x.title.slice(17):'Add: '+x.title,why:x.status+(x.ranking_pages?' · on '+x.ranking_pages+(x.of?' of '+x.of:'')+' ranking page(s)':''),src:'g'})});
 ((ag&&ag.missing_facts)||[]).forEach(function(f){out.push({id:'fact:'+f.key,title:'State on your page: '+f.label.toLowerCase(),why:'The pages AI cites state it ('+f.sites.join(', ')+'); your page does not. Only add it when it is true for your business.'+(f.example?' Example from '+f.example.site+': “'+f.example.excerpt+'”':''),src:'ai'})});
 ((ag&&ag.missing_topics)||[]).filter(function(t){return !t.item_id}).forEach(function(t){out.push({id:'aitopic:'+t.topic,title:'Cover on your page: '+t.topic,why:'On the pages AI cites ('+t.sites.join(', ')+'), not on your page. Not in the Google list, so Growth does not write it: add it yourself if it fits.'+(t.examples&&t.examples[0]&&t.examples[0].excerpt?' “'+t.examples[0].excerpt+'”':''),src:'ai'})});
 acts.filter(function(a){return a.id!=='choose_ai_topics'&&a.id!=='compare_cited_pages'}).forEach(function(a){out.push({id:'act:'+a.id,title:a.title,why:a.why,steps:a.steps,src:'ai'})});
 return out}
function selfKey(){return 'growthFreeSelfDone:'+API}
function selfDone(){try{return JSON.parse(localStorage.getItem(selfKey())||'{}')}catch(e){return {}}}
function selfHtml(list){if(!list.length)return '';var done=selfDone(),open=list.filter(function(x){return !done[x.id]}),fin=list.filter(function(x){return done[x.id]});
 var li=function(x){return '<li><label class="check"><input type="checkbox" class="selfDone" data-id="'+esc(x.id)+'"'+(done[x.id]?' checked':'')+'><span><span class="chip '+(x.src==='ai'?'ai">AI':'g">Google')+'</span><strong>'+esc(x.title)+'</strong><details class="why"><summary>Why and how</summary><small>'+esc(x.why)+'</small>'+((x.steps||[]).length?'<ol>'+x.steps.map(function(t){return '<li><small>'+esc(t)+'</small></li>'}).join('')+'</ol>':'')+'</details></span></label></li>'};
 return '<div class="card self" id="selfDo"><h3 style="margin-top:0">Do it yourself ('+open.length+' open)</h3><p class="muted">Growth does not write these: they are settings, data or facts only you can confirm. Tick one when it is done.</p><ul style="padding:0">'+open.map(li).join('')+'</ul>'+
  (fin.length?'<details><summary>Done ('+fin.length+')</summary><ul style="padding:0">'+fin.map(li).join('')+'</ul></details>':'')+'</div>'}
function wireSelf(){document.querySelectorAll('.selfDone').forEach(function(c){c.onchange=function(){var d=selfDone();if(c.checked)d[c.getAttribute('data-id')]=1;else delete d[c.getAttribute('data-id')];try{localStorage.setItem(selfKey(),JSON.stringify(d))}catch(e){}
 var card=document.getElementById('selfDo');if(card&&LAST_SELF){card.outerHTML=selfHtml(LAST_SELF);wireSelf()}}})}
var LAST_SELF=null;
// One topic card: title and labels, one line of action; everything else behind "Why?".
function gapCard(x,aiOn){var why=[];
 if(x.priority&&x.priority.why)why.push('Why: '+x.priority.why.join(' · '));
 if(x.growth_potential&&x.growth_potential.search_demand)why.push(x.growth_potential.search_demand.status==='NOT_MEASURED'?'Search demand: not measured (not low)':x.growth_potential.search_demand.note);
 (x.possible_overlap||[]).forEach(function(o){why.push('May overlap with “'+o.title+'” (shared words, not confirmed)')});
 var ex=(x.examples||[]).map(exampleText(x));
 return '<label class="check card gap"><input type="checkbox" class="gapPick" value="'+esc(x.id)+'"><span>'+(x.recommended?'<span class="chip rec">Recommended</span>':'')+'<span class="chip g">Google'+(x.ranking_pages?' · '+esc(x.ranking_pages)+' page'+(x.ranking_pages>1?'s':''):'')+'</span>'+(aiOn?'<span class="chip ai">AI cites this too</span>':'')+'<br><strong>'+esc(x.title)+'</strong>'+
  '<br><small>'+esc(x.priority&&x.priority.suggested_action?x.priority.suggested_action:x.status)+'</small>'+
  (why.length||ex.length?'<details class="why"><summary>Why?</summary>'+why.map(function(t){return '<small>'+esc(t)+'</small><br>'}).join('')+(x.your_section?'<small>Closest on your page: “'+esc(x.your_section)+'”</small><br>':'')+(ex.length?'<small>Seen on: '+ex.join(' · ')+'</small>':'')+'</details>':'')+'</span></label>'}
function gapsHtml(g,w,d){if(!g||g.status!=='OBSERVED')return '';GAP_GROUPS=(g.groups||[]).map(function(x){return [x.id,x.label]});
 var chosen=(d&&d.selected_item_ids||[]).length,aiIds={};((d&&d.ai&&d.ai.gap&&d.ai.gap.missing_topics)||[]).forEach(function(t){if(t.item_id)aiIds[t.item_id]=1});
 var h='<details id="stepReview" class="journey-section" open>'+stepSum(1,'Choose what to add',chosen?chosen+' topic(s) chosen — change your choice here':'Tick the topics you want on your page',chosen>0)+'<div class="journey-body"><h2 id="gaps">Choose what goes on your page</h2><p class="muted">What pages Google ranks'+(Object.keys(aiIds).length?' and pages AI cites':'')+' have and your page does not. Tick what fits your business; AI writes only what you tick, in step 2.</p>';
 if(g.writing_allowed===false&&g.evidence)h+='<p class="note"><strong>No section is proposed or written:</strong> '+esc(g.evidence.plain_reason||g.evidence.reason)+'</p>';
 LAST_SELF=selfItems(g,d);
 if(!g.items.length)return h+selfHtml(LAST_SELF)+'</div></details><details id="stepPrepare" class="journey-section">'+stepSum(2,'Write the text','Nothing to write: no content differences',false)+'<div class="journey-body"><p class="muted">No editable content differences are available.</p></div></details>';
 var writ=g.items.filter(function(x){return x.group!=='PAGE_ELEMENT'&&x.group!=='NOT_RELEVANT'});
 var order=function(a,b){return (b.recommended?1:0)-(a.recommended?1:0)||(aiIds[b.id]?1:0)-(aiIds[a.id]?1:0)};
 var rec=writ.filter(function(x){return x.recommended||aiIds[x.id]}).sort(order),rest=writ.filter(function(x){return !(x.recommended||aiIds[x.id])});
 if(rec.length){h+='<h3>Start here ('+rec.length+')</h3>';rec.forEach(function(x){h+=gapCard(x,!!aiIds[x.id])})}
 GAP_GROUPS.forEach(function(gr){var list=rest.filter(function(x){return x.group===gr[0]});if(!list.length)return;
  h+='<h3>'+esc(gr[1])+' ('+list.length+')</h3>';list.forEach(function(x){h+=gapCard(x,false)})});
 h+='<p><strong id="gapCount">0 selected</strong> <small>· choices saved, not automatically approved or verified</small></p><p><button type="button" id="gapAll" class="ghost">Include all H2 topics</button> <button type="button" id="gapNone" class="ghost">Clear</button> <small>A CMS package is limited to 12 reviewed text sections.</small></p>';
 // The next action sits right under the choice: write the chosen H2s with AI, or the exact reason why that is not possible.
 h+='<div id="nextWrite" class="card" aria-live="polite"></div>';
 h+='<details class="research-details"><summary>Export your selection (optional)</summary><p class="muted">The editor brief contains your selected observations, not a verified content recommendation.</p>';
 h+='<p><button type="button" id="gapDownload" class="action-muted">Download editor brief</button> <button type="button" id="gapCopy" class="ghost">Copy</button> <span id="gapStatus" class="muted"></span></p></details>';
 h+=selfHtml(LAST_SELF);
 // Seen, but nothing to do now: unique content to keep, and topics that probably do not fit this search.
 var nr=g.items.filter(function(x){return x.group==='NOT_RELEVANT'}),uq=g.unique_content||[];
 if(nr.length||uq.length)h+='<details class="research-details" id="alsoSeen"><summary>Also seen ('+(nr.length+uq.length)+') — nothing to do now</summary>'+(uq.length?'<h3>Only on your page — keep it ('+uq.length+')</h3><ul>'+uq.map(function(x){return '<li>'+esc(x.heading)+'</li>'}).join('')+'</ul><p class="muted">Not on the ranking pages read (compared by heading words). Unique is not proof that it is correct or strong; it is not rewritten.</p>':'')+(nr.length?'<h3>Probably not relevant to this search ('+nr.length+')</h3><p class="muted">Not proposed and not written. Tick one only if you know it belongs on this page.</p>'+nr.map(function(x){return gapCard(x,false)}).join(''):'')+'</details>';
 var hasText=!!(w&&w.last&&(w.last.sections||[]).length);
 h+='</div></details><details id="stepPrepare" class="journey-section">'+stepSum(2,'Write the text',hasText?'Text written for '+w.last.sections.length+' topic(s) — check it and download the CMS package':'AI writes the chosen topics; you check them',hasText)+'<div class="journey-body"><h2 id="prepare">Write the text</h2><p class="muted">'+(g.writing_allowed===false?'Research did not establish enough evidence to safely draft new text. Your H2 selections are observations, not verified recommendations. Export the editor brief in step 1.':!w||!w.allowed?'Automatic writing is disabled for this Free Growth access link. This is an access restriction, not a request to manually write every H2. Export the editor brief in step 1; the CMS editor is optional.':w.remaining<=0?'The automatic writing limit for this check has been reached. Previously prepared copy remains available for review.':'Generate draft text for evidence-supported selected topics using AI, then review it before creating the CMS package.')+'</p>';
 if(w&&!w.allowed&&w.owner_login_available&&w.remaining>0&&g.writing_allowed!==false)h+='<div class="card" id="ownerUnlock"><strong>Owner access · Write with AI</strong><p class="muted">Sign in with your existing Free Growth admin key. No new password or check is required. Your selected H2s are kept.</p><form id="ownerUnlockForm" autocomplete="off"><label for="ownerUnlockKey">Admin key (stored in Railway)</label><input id="ownerUnlockKey" type="password" autocomplete="current-password" required minlength="16"><p><button type="submit" id="ownerUnlockButton" class="action-blue">Unlock Write with AI</button> <small id="ownerUnlockStatus" role="status"></small></p></form></div>';
 if(w&&w.allowed&&w.owner_unlocked)h+='<p class="note"><strong>Owner mode enabled.</strong> Write with AI is unlocked for this check. No visitor permissions were changed.</p>';
 if(w&&w.allowed&&w.remaining>0&&g.writing_allowed!==false)h+='<p><button type="button" id="gapWrite" class="action-blue" disabled>Write the chosen H2s with AI (up to '+esc(w.remaining*4)+' more H2s for this check)</button> <small class="muted">AI writes 4 H2s per round; this check has '+esc(w.remaining)+' round(s) left, so up to '+esc(w.remaining*4)+' H2s. One click uses as many rounds as needed. You check everything before download. Nothing is published.</small><br><strong role="status" id="gapWriteStatus" aria-live="polite"></strong></p>';
 h+='<div id="gapWritten"></div><div id="pkgBox"></div></div></details>';
 return h}
function writtenHtml(r){if(!r)return '';var h='<h3>Concepts for your selection</h3><p class="note">'+esc(r.note||'')+'</p>';
 (r.sections||[]).forEach(function(x){var fl=(x.flags||[]).filter(function(f){return f.sentence}).map(function(f){return f.sentence});
  h+='<div class="card"><strong>'+esc(x.h2)+'</strong><br><small>'+(x.status==='FLAGGED_FOR_EDITOR'?'Flagged: '+x.flags.length+' item(s) to rewrite or remove':x.status==='MARKED_NO_SOURCE_TEXT'?'Marked: no competitor text behind it':'Concept for review')+(x.item_title?' · for “'+esc(x.item_title)+'”':'')+(x.run?' · run '+esc(x.run):'')+(x.placement&&x.placement.section_heading?' · place '+(x.placement.mode==='EXTEND_SECTION'?'inside':'after')+' “'+esc(x.placement.section_heading)+'”':' · you choose the place')+'</small>';
  if(x.basis)h+='<br><small>Answers: “'+esc(x.basis.answers)+'” · basis: '+esc(String(x.basis.evidence_level||'').toLowerCase().split('_').join(' '))+((x.basis.competitor_evidence||[]).length?' · sources: '+x.basis.competitor_evidence.map(function(e){return esc(e.site)}).join(', '):'')+'</small>'+(x.basis.warning?'<p class="note">'+esc(x.basis.warning)+'</p>':'');
  (x.paragraphs||[]).forEach(function(p){var out=esc(p);fl.forEach(function(f){out=out.split(esc(f)).join('<mark class="conceptJump" role="link" tabindex="0" style="cursor:pointer" title="Change it in the CMS package below" data-sentence="'+esc(f)+'">'+esc(f)+'</mark>')});h+='<p>'+out+'</p>'});
  if((x.flags||[]).length)h+='<ul>'+x.flags.map(function(f){return '<li>'+(f.sentence?'“'+esc(f.sentence)+'” — ':'Whole section — ')+esc(f.reason)+'</li>'}).join('')+'</ul>';
  if(fl.length)h+='<p class="note">These sentences are changed in the <strong>CMS package below</strong>, not here: AI replaces them there automatically (checked), or click a yellow sentence to change it yourself.</p>';
  var si=x.style_issues||[];
  h+='<label class="check"><input type="checkbox" class="gapRewrite" value="'+esc(x.item_id)+'"'+(si.length?' checked':'')+'><span>Write this H2 again with AI'+(si.length?' — ticked for you: '+si.map(function(i){return (i.problem==='OPENING_FILLER'?'weak opening':i.problem==='MIXED_LANGUAGE'?'mixed language':'advice for a team')+' “'+esc(i.sentence)+'”'}).join('; '):'')+'</span></label>';
  h+='</div>'});
 (r.not_written||[]).forEach(function(x){h+='<p class="muted">Not written: '+esc(x.title)+' — kept for the next run, or write it yourself.</p>'});
 if((r.pending||[]).length)h+='<p class="note">Still to write from your selection ('+r.pending.length+'): '+r.pending.map(function(x){return esc(x.title)}).join(' · ')+'. Click write again for the next ones.</p>';
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
 if((g.unique_content||[]).length){L.push('## Unique content worth reviewing and preserving','');g.unique_content.forEach(function(x){L.push('- '+x.heading)});L.push('')}
 if((LAST_SELF||[]).length){var dn=selfDone();L.push('## To do yourself (not written by Growth)','');LAST_SELF.forEach(function(x){L.push('- ['+(dn[x.id]?'x':' ')+'] '+x.title+' — '+x.why)});L.push('')}
 L.push('Ranking pages compared:');(g.ranking_pages||[]).forEach(function(p){L.push('- '+(p.position?'#'+p.position+' ':'')+p.url)});
 return {count:items.length,text:L.join('\\n')}}
// Pop-up before writing when no AI answer was analysed for this check: the editor checks AI first or continues without.
function freeAiGate(d){var a=d&&d.ai;if(!a||(a.summary&&a.summary.checked>0))return Promise.resolve('WITH_AI');
 return new Promise(function(resolve){var dlg=document.createElement('dialog');dlg.className='growth-ai-gate';
  dlg.innerHTML='<h2>No AI answers for “'+esc(a.search_term)+'”</h2><p>No AI answer was analysed for this check. Without one, the concepts rest on Google and the ranking pages only; whether AI systems cite your page for this search is unknown.</p><p><button type="button" data-v="first">Check AI answers first</button> <button type="button" class="ghost" data-v="without">Continue without AI check</button></p>';
  var done=function(v){try{dlg.close()}catch(e){}dlg.remove();resolve(v)};
  dlg.addEventListener('click',function(e){var b=e.target.closest('button[data-v]');if(!b)return;if(b.getAttribute('data-v')==='first'){done(null);var el=document.getElementById('ai');if(el)el.scrollIntoView()}else done('WITHOUT_AI')});
  dlg.addEventListener('cancel',function(e){e.preventDefault();done(null)});
  document.body.appendChild(dlg);if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');dlg.querySelector('button').focus()})}
// Step 4: the same CMS package (ZIP) as the Tracker, from the concepts. The editor edits, approves and downloads; nothing is published.
var PKG_SHA='';
var PKG_FLAGS={},PKG_FLAG_REASONS={};
function pkgHtml(r){var list=(r&&r.sections)||[];PKG_FLAGS={};PKG_FLAG_REASONS={};list.forEach(function(x){var seen={};PKG_FLAG_REASONS[String(x.item_id)]=(x.flags||[]).filter(function(f){return f.sentence}).map(function(f){return {sentence:f.sentence,reason:f.reason||''}});PKG_FLAGS[String(x.item_id)]=(x.flags||[]).filter(function(f){return f.sentence&&!seen[f.sentence]&&(seen[f.sentence]=1)}).map(function(f){return f.sentence})});if(!list.length)return '';
 var h='<h2 id="pkg">CMS package for your editor</h2><p class="lead">The same package as the Tracker: approved text, exact placement on your page, SEO title and description, and a measurement plan. Edit the text, remove what you do not want, approve and download. Nothing is published.</p>';
 h+='<p class="muted" id="pkgSource">Reading your page as it is live now…</p><div class="cms-button-row"><button type="button" id="pkgIncludeAll" class="cms-action-unavailable" disabled>Include all prepared H2s</button> <button type="button" id="pkgExcludeAll" class="cms-action-unavailable" disabled>Exclude all</button></div><small id="pkgBulkStatus" role="status" class="cms-status">Checking prepared content…</small>';
 list.forEach(function(x){var id=esc(x.item_id),fl=(x.flags||[]).filter(function(f){return f.sentence});
  h+='<div class="card"><label class="check"><input type="checkbox" class="pkgUse" data-id="'+id+'"'+(x.empty?'':' checked')+'><span>Include H2'+(x.empty?' (no researched text: excluded by default)':' · prepared text available')+'</span></label>'+
   '<label>Heading (H2)<input class="pkgH2" data-id="'+id+'" maxlength="200" value="'+esc(x.h2)+'"></label>'+
   '<details class="research-details pkg-edit"><summary>'+(x.empty?'No researched draft · Optional: add verified text yourself':'Review or edit prepared text')+'</summary><label>Section text (blank line separates paragraphs)<textarea class="pkgText" data-id="'+id+'" rows="7"'+(x.empty?' placeholder="Only enter facts you can verify; no draft was produced."':'')+'>'+esc((x.paragraphs||[]).join('\\n\\n'))+'</textarea></label></details>'+
   '<small class="muted">'+(x.placement&&x.placement.section_heading?'Placement: '+(x.placement.mode==='EXTEND_SECTION'?'inside':'after')+' “'+esc(x.placement.section_heading)+'”':'Placement: the editor chooses')+'</small>'+
   (fl.length?'<div class="pkgFlags" data-id="'+id+'"><p class="note"><strong>Check before downloading:</strong> for each sentence, rewrite it in the text, keep it when it is true for your business, or remove it.</p><ul>'+(PKG_FLAGS[String(x.item_id)]||[]).map(function(sent,fi){var why=fl.filter(function(f){return f.sentence===sent}).map(function(f){return f.reason}).filter(function(v,k,a){return a.indexOf(v)===k});return '<li data-fi="'+fi+'"><mark class="pkgFlagText">'+esc(sent)+'</mark> <small>— '+esc(why.join(' · '))+'</small><div class="pkgFlagState"></div></li>'}).join('')+'</ul></div>':'')+'</div>'});
 h+='<label class="check"><input type="checkbox" id="pkgPersonal"><span><strong>This page presents me as a person</strong> (a personal brand, for example you as a specialist): “I” and “my” are allowed in the title, description and text.</span></label>';
 h+='<label for="pkgTitle">SEO title</label><input id="pkgTitle" maxlength="100">';
 h+='<label for="pkgMeta">Meta description</label><textarea id="pkgMeta" rows="2" maxlength="220"></textarea>';
 h+='<label for="pkgCms">Website system (CMS)</label><select id="pkgCms"><option value="generic">Other / not sure</option><option value="wordpress">WordPress</option><option value="wix">Wix</option><option value="webflow">Webflow</option><option value="squarespace">Squarespace</option><option value="custom">Custom built</option></select>';
 h+='<details><summary>Internal link</summary><label for="pkgLinkUrl">Page of this website to link to</label><input id="pkgLinkUrl" type="url" placeholder="https://" list="pkgLinkChoices"><datalist id="pkgLinkChoices"></datalist><small id="pkgLinkHelp" class="muted"></small><label for="pkgLinkLabel">Link words (what the reader clicks)</label><input id="pkgLinkLabel" maxlength="120"></details>';
 h+='<label class="check"><input type="checkbox" id="pkgApprove"><span>I reviewed the page, the sections and the link. Every statement is true for this business.</span></label>';
 h+='<p><button type="button" id="pkgDownload" class="action-blue">Download CMS package (ZIP)</button> <span id="pkgStatus" class="muted"></span></p><div id="pkgIssues"></div>';
 return h}
function pkgInput(){var out=[];document.querySelectorAll('.pkgUse').forEach(function(c){if(!c.checked)return;var id=c.getAttribute('data-id');
  var h2=document.querySelector('.pkgH2[data-id="'+id+'"]'),t=document.querySelector('.pkgText[data-id="'+id+'"]');out.push({item_id:id,h2:h2?h2.value:'',text:t?t.value:''})});
 return {cms:document.getElementById('pkgCms').value,seo_title:document.getElementById('pkgTitle').value,meta_description:document.getElementById('pkgMeta').value,
  sections:out,link:{url:document.getElementById('pkgLinkUrl').value,label:document.getElementById('pkgLinkLabel').value},editor_approved:document.getElementById('pkgApprove').checked,confirmed_sentences:Object.keys(PKG_KEPT).reduce(function(a,id){Object.keys(PKG_KEPT[id]||{}).forEach(function(s){a.push({item_id:id,sentence:s})});return a},[]),personal_voice:!!(document.getElementById('pkgPersonal')||{}).checked,source_sha256:PKG_SHA}}
// Title or description in the first person ("my", "I"): AI rewrites them as the service and says so; without AI the
// field is marked with the exact word to change.
function metaNote(id,text,bad){var f=document.getElementById(id);if(!f)return;var n=document.getElementById(id+'Voice');if(!n){n=document.createElement('small');n.id=id+'Voice';f.insertAdjacentElement('afterend',n)}n.textContent=text;n.className=bad?'error':'muted';f.style.borderColor=bad?'#ef4444':''}
function personalOn(){var c=document.getElementById('pkgPersonal');return !!(c&&c.checked)}
function clearVoice(){['pkgTitle','pkgMeta'].forEach(function(id){var n=document.getElementById(id+'Voice');if(n)n.remove();var f=document.getElementById(id);if(f)f.style.borderColor=''})}
// "I"/"my" in the title or description: the visitor chooses — this page presents a person (keep it), or AI rewrites it
// as the service (checked, see suggestServiceMeta). Nothing is changed without that choice.
async function pkgFixVoice(hint,rewrite){if(personalOn())return clearVoice();var t=document.getElementById('pkgTitle'),m=document.getElementById('pkgMeta');if(!t||!m||(hint&&!hint.title&&!hint.meta))return;
 var x=null;if(rewrite||!hint){try{x=await (await fetch(API+'/meta-suggest'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seo_title:t.value,meta_description:m.value,check_only:!rewrite})})).json()}catch(e){}}
 var v=(x&&x.voice)||hint||{};if(!v.title&&!v.meta)return clearVoice();
 if(rewrite&&x&&x.status==='SUGGESTED'){clearVoice();if(v.title){t.value=x.title;metaNote('pkgTitle','Rewritten by AI as the service (it said “'+v.title+'”). Check it.',false)}if(v.meta){m.value=x.meta_description;metaNote('pkgMeta','Rewritten by AI as the service (it said “'+v.meta+'”). Check it.',false)}return}
 var why=rewrite?' AI could not rewrite it safely; change it yourself.':'';
 [['pkgTitle',v.title],['pkgMeta',v.meta]].forEach(function(a){if(!a[1])return;metaNote(a[0],'Says “'+a[1]+'”. Does this page present you as a person? Tick “This page presents me as a person” above. Otherwise write it as the service.'+why,true);
  var n=document.getElementById(a[0]+'Voice');if(n&&!rewrite){var b=document.createElement('button');b.type='button';b.className='ghost';b.textContent='Rewrite as the service with AI';b.style.marginLeft='8px';b.onclick=function(){pkgFixVoice(null,true)};n.appendChild(b)}})}
async function pkgReadSource(){var el=document.getElementById('pkgSource');if(!el)return;
 try{var r=await fetch(API+'/package-source'+Q,{cache:'no-store'});var x=await r.json();if(!x.success)throw Error(x.error||'Not read');PKG_SHA=x.source.source_sha256;
  var t=document.getElementById('pkgTitle'),m=document.getElementById('pkgMeta');if(t&&!t.value)t.value=x.source.title||'';
  // Internal link: pages of this site that the page already links to; choosing one fills in the page's own link words.
  var links=x.source.internal_links||[],dl=document.getElementById('pkgLinkChoices'),lu=document.getElementById('pkgLinkUrl'),ll=document.getElementById('pkgLinkLabel'),lh=document.getElementById('pkgLinkHelp');
  if(dl){dl.innerHTML=links.map(function(l){return '<option value="'+esc(l.url)+'">'+esc(l.label)+'</option>'}).join('')}
  if(lh)lh.textContent=links.length?'Click the field to choose one of the '+links.length+' page(s) of your site this page already links to; the link words fill in by themselves. Or type another page of your site.':'This page links to no other page of your site; type one yourself (optional).';
  // Chosen automatically: the page of this site that fits the written sections best (a service or contact page counts a
  // little more). Shown in the fields, so the visitor sees it and can change or empty it.
  var sl=x.source.suggested_link;if(sl&&lu&&ll&&!lu.value.trim()&&!ll.value.trim()){lu.value=sl.url;ll.value=sl.label;var dt=lu.closest('details');if(dt)dt.open=true;
   if(lh)lh.textContent='Chosen automatically: '+(sl.reason==='OFFER_PAGE'?'the page where you offer this help':'the page that fits these sections best')+'. The package puts the link in the section that fits it. Change or empty the field if another page is better.'}
  if(lu&&ll&&!lu.dataset.wired){lu.dataset.wired='1';lu.addEventListener('change',function(){var hit=links.filter(function(l){return l.url===lu.value.trim()})[0];if(hit&&!ll.value.trim())ll.value=hit.label})}if(m&&!m.value){m.value=x.source.meta_description||'';if(x.source.meta_description_source==='FIRST_PARAGRAPH'&&m.value){var mh=document.getElementById('pkgMetaHelp');if(!mh){mh=document.createElement('small');mh.id='pkgMetaHelp';mh.className='muted';m.insertAdjacentElement('afterend',mh)}mh.textContent='Your page has no meta description; this one is taken from its first paragraph. Check it.'}}
  el.textContent='Original page read now: “'+(x.source.title||x.source.url)+'”, '+x.source.headings.length+' heading(s). The package is refused if the page changes before the download.';(function(){var pc=document.getElementById('pkgPersonal');if(pc&&x.source.speaks_as_person&&!pc.dataset.touched){pc.checked=true;var n=document.getElementById('pkgPersonalNote');if(!n){n=document.createElement('small');n.id='pkgPersonalNote';n.className='muted';pc.parentNode.insertAdjacentElement('afterend',n)}n.textContent='Ticked for you: your page already speaks as a person (“I”, “my”), so that voice is kept. Untick it if this page should speak as a company.'}})();pkgFixVoice(x.voice)}
 catch(err){el.innerHTML=esc(err.message)+' <button type="button" class="ghost" id="pkgReread">Read again</button>';var b=document.getElementById('pkgReread');if(b)b.onclick=pkgReadSource}}
// Flagged sentences: one click removes the exact sentence from the section text (nothing else); "Remove all" does that for
// every flagged sentence still in an included section. A section that is not included shows its warnings as not applicable.
// Find a sentence in the package editor (section text first, then the heading fields) and select it there. A sentence the
// check glued from several parts is found by its longest part.
function pkgJumpTo(sentence){var s=String(sentence||'').replace(/\\s+/g,' ').trim();if(!s)return;
 var fields=[].slice.call(document.querySelectorAll('.pkgText')).concat([].slice.call(document.querySelectorAll('.pkgH2')));
 var tries=[s].concat(s.split(/(?<=[.!?])\\s+|(?<=[a-z])\\s+(?=[A-Z][a-z]+\\s)/).map(function(x){return x.trim()}).filter(function(x){return x.length>=12}).sort(function(a,b){return b.length-a.length}));
 for(var i=0;i<tries.length;i++){for(var j=0;j<fields.length;j++){var f=fields[j],v=f.value.replace(/\\s+/g,' '),at=v.indexOf(tries[i]);if(at<0)continue;
  var d=f.closest('details');if(d)d.open=true;f.scrollIntoView({block:'center'});f.focus();
  var raw=f.value,start=raw.indexOf(tries[i]);if(start<0)start=at;try{f.setSelectionRange(start,start+tries[i].length)}catch(e){}
  f.style.outline='3px solid #f59e0b';setTimeout(function(x){return function(){x.style.outline=''}}(f),2500);return}}
 alert('This sentence is not in the text as one piece anymore; it may have been changed already.')}
function pkgDropSentence(id,sentence){var t=document.querySelector('.pkgText[data-id="'+id+'"]');if(!t||!sentence)return false;var before=t.value;
 t.value=before.split(sentence).join('').replace(/[ ]{2,}/g,' ').replace(/ +([.,;:])/g,'$1').replace(new RegExp(String.fromCharCode(10)+'{3,}','g'),String.fromCharCode(10,10)).trim();return t.value!==before}
// Per flagged sentence: still in the text (rewrite · keep · remove), kept by the editor, rewritten by AI (restore), or
// removed (undo). Kept sentences are sent with the package as confirmed by the editor (a safety assurance never is).
var PKG_KEPT={},PKG_UNDO={};
function pkgKeptKey(){return 'growthFreeKept:'+API}
try{PKG_KEPT=JSON.parse(localStorage.getItem(pkgKeptKey())||'{}')||{}}catch(e){PKG_KEPT={}}
function pkgSaveKept(){try{localStorage.setItem(pkgKeptKey(),JSON.stringify(PKG_KEPT))}catch(e){}}
function pkgIsKept(id,s){return !!(PKG_KEPT[id]&&PKG_KEPT[id][s])}
function pkgSafety(id,s){return (PKG_FLAG_REASONS[id]||[]).some(function(f){return f.sentence===s&&/safe to wait|safety/i.test(f.reason)})}
function pkgFixOf(id,s){return PKG_STYLE_FIXES.filter(function(f){return f.id===id&&f.before===s})[0]}
function pkgFlagState(){document.querySelectorAll('.pkgFlags').forEach(function(box){var id=box.getAttribute('data-id'),use=document.querySelector('.pkgUse[data-id="'+id+'"]'),t=document.querySelector('.pkgText[data-id="'+id+'"]');
 var on=!use||use.checked;box.style.opacity=on?'':'0.5';var note=box.querySelector('.note strong');if(note)note.textContent=on?'Check before downloading:':'Not in the package (section not included):';
 box.querySelectorAll('li').forEach(function(li){var i=Number(li.getAttribute('data-fi')),s=(PKG_FLAGS[id]||[])[i],inText=!!(t&&s&&t.value.indexOf(s)>=0),fix=pkgFixOf(id,s),kept=inText&&pkgIsKept(id,s),st=li.querySelector('.pkgFlagState'),mk=li.querySelector('.pkgFlagText');if(!st)return;
  var b=function(cls,label){return '<button type="button" class="ghost '+cls+'" data-id="'+esc(id)+'" data-fi="'+i+'">'+label+'</button> '};
  if(mk)mk.style.textDecoration=!inText&&!fix?'line-through':'';
  st.innerHTML=kept?'<small class="step-done">✓ Kept — you confirmed it is true for your business.</small> '+b('pkgFlagUnkeep','Undo')
   :inText?b('pkgFlagShow','Show in the text')+(pkgSafety(id,s)?'':b('pkgFlagKeep','It is true — keep it'))+b('pkgDropFlag','Remove this sentence')
   :fix?'<small>Rewritten by AI'+(fix.after?': “'+esc(fix.after)+'”':' (removed)')+'.</small> '+b('pkgFlagRestore','Restore the original — it is true')
   :'<small>Removed or rewritten by you.</small> '+(PKG_UNDO[id+'|'+i]!=null?b('pkgFlagUndo','Undo'):'')});
 box.querySelectorAll('button').forEach(function(btn){var id2=btn.getAttribute('data-id'),i2=Number(btn.getAttribute('data-fi')),s2=(PKG_FLAGS[id2]||[])[i2],t2=document.querySelector('.pkgText[data-id="'+id2+'"]');
  btn.onclick=function(){
   if(btn.classList.contains('pkgFlagShow'))pkgJumpTo(s2);
   else if(btn.classList.contains('pkgFlagKeep')){(PKG_KEPT[id2]=PKG_KEPT[id2]||{})[s2]=1;pkgSaveKept()}
   else if(btn.classList.contains('pkgFlagUnkeep')){if(PKG_KEPT[id2])delete PKG_KEPT[id2][s2];pkgSaveKept()}
   else if(btn.classList.contains('pkgDropFlag')){PKG_UNDO[id2+'|'+i2]=t2?t2.value:null;pkgDropSentence(id2,s2)}
   else if(btn.classList.contains('pkgFlagUndo')){var prev=PKG_UNDO[id2+'|'+i2];if(t2&&prev!=null)t2.value=prev;delete PKG_UNDO[id2+'|'+i2]}
   else if(btn.classList.contains('pkgFlagRestore')){var f=pkgFixOf(id2,s2);if(t2&&f){var at=f.after?t2.value.indexOf(f.after):-1;t2.value=at>=0?t2.value.slice(0,at)+f.before+t2.value.slice(at+f.after.length):(t2.value+' '+f.before).trim()}
    PKG_STYLE_FIXES=PKG_STYLE_FIXES.filter(function(x){return x!==f});(PKG_KEPT[id2]=PKG_KEPT[id2]||{})[s2]=1;pkgSaveKept()}
   pkgFlagState()}})});
 var any=0;Object.keys(PKG_FLAGS).forEach(function(id){var use=document.querySelector('.pkgUse[data-id="'+id+'"]'),t=document.querySelector('.pkgText[data-id="'+id+'"]');if((!use||use.checked)&&t)PKG_FLAGS[id].forEach(function(s){if(t.value.indexOf(s)>=0&&!pkgIsKept(id,s))any++})});
 var all=document.getElementById('pkgDropAll');if(all){all.style.display=any?'':'none';all.textContent='Remove all flagged sentences you did not keep ('+any+')'}}
function pkgWireFlags(){var first=document.querySelector('.pkgFlags');
 if(first&&!document.getElementById('pkgDropAll')){var b=document.createElement('button');b.type='button';b.id='pkgDropAll';b.className='ghost';b.style.margin='8px 0';
  var box=document.getElementById('pkgSource');if(box)box.insertAdjacentElement('afterend',b);
  b.onclick=function(){Object.keys(PKG_FLAGS).forEach(function(id){var use=document.querySelector('.pkgUse[data-id="'+id+'"]');if(use&&!use.checked)return;PKG_FLAGS[id].forEach(function(s){if(!pkgIsKept(id,s))pkgDropSentence(id,s)})});pkgFlagState()}}
 document.querySelectorAll('.pkgUse,.pkgText').forEach(function(el){el.addEventListener(el.classList.contains('pkgText')?'input':'change',pkgFlagState)});pkgFlagState()}
// Weak openings and team advice: AI replaces only those sentences in the section texts, automatically, once per page
// load. Each change is shown under its section with the original sentence; nothing else in the text changes.
var PKG_STYLE_FIXES=[],PKG_STYLE_TRIED={},PKG_STYLE_LEFT=[];
async function pkgFixStyle(){var list=[];pkgApplyStyle(PKG_STYLE_FIXES,true);pkgStyleLeft(PKG_STYLE_LEFT,'');document.querySelectorAll('.pkgText').forEach(function(t){var id=t.getAttribute('data-id'),h=document.querySelector('.pkgH2[data-id="'+id+'"]');var fl=(PKG_FLAG_REASONS[id]||[]).filter(function(f){return t.value.indexOf(f.sentence)>=0&&!pkgIsKept(id,f.sentence)});if(t.value.trim())list.push({id:id,h2:h?h.value:'',text:t.value,flags:fl})});
 if(!list.length)return;var x=null;try{x=await (await fetch(API+'/fix-style'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sections:list,skip:Object.keys(PKG_STYLE_TRIED)})})).json()}catch(e){}
 if(!x)return;PKG_STYLE_FIXES=PKG_STYLE_FIXES.concat(x.fixes||[]);pkgApplyStyle(x.fixes||[],false);
 var left=(x.problems||[]).filter(function(p){return !(x.fixes||[]).some(function(f){return f.id===p.id&&f.before===p.sentence})});
 (x.problems||[]).forEach(function(p){PKG_STYLE_TRIED[p.id+'|'+p.sentence]=1});
 var why=x.status==='AI_UNAVAILABLE'||x.status==='AI_FAILED'||x.status==='LIMIT'?' (AI could not repair it now)':' (the AI repair did not pass the checks)';
 PKG_STYLE_LEFT=PKG_STYLE_LEFT.concat(left.map(function(p){return {id:p.id,sentence:p.sentence,problem:p.problem,why:why}}));pkgStyleLeft(left,why)}
// Sentences AI could not repair: named under their section (only while they are still in the text).
function pkgStyleLeft(left,why0){left.forEach(function(p){var why=p.why||why0;var t=document.querySelector('.pkgText[data-id="'+p.id+'"]'),card=t&&t.closest('.card');if(!card||t.value.indexOf(p.sentence)<0)return;var n=document.createElement('p');n.className='note pkgStyleNote pkgStyleLeft';n.textContent=(p.problem==='OPENING_FILLER'?'Weak opening':p.problem==='FLAGGED_CLAIM'?'Flagged sentence':p.problem==='MIXED_LANGUAGE'?'Mixed language':'Advice for a team')+' still in the text'+why+': “'+p.sentence+'”. Rewrite it yourself.';card.appendChild(n)})}
// Applies repaired sentences (also again after the editor is redrawn, without a new AI call) and shows each change.
function pkgApplyStyle(fixes,again){var by={};(fixes||[]).forEach(function(f){(by[f.id]=by[f.id]||[]).push(f)});
 Object.keys(by).forEach(function(id){var t=document.querySelector('.pkgText[data-id="'+id+'"]');if(!t)return;var v=t.value,done=[];
  by[id].forEach(function(f){var i=v.indexOf(f.before);if(i<0)return;v=v.slice(0,i)+f.after+v.slice(i+f.before.length);done.push(f)});
  v=v.split('  ').join(' ');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}));if(typeof pkgFlagState==='function')pkgFlagState();
  var card=t.closest('.card');if(card&&done.length&&!card.querySelector('.pkgStyleNote')){var n=document.createElement('div');n.className='note pkgStyleNote';n.innerHTML='<strong>AI repaired '+done.length+' sentence(s) automatically. Check them:</strong><ul>'+done.map(function(f){return '<li>'+(f.problem==='OPENING_FILLER'?'Weak opening':f.problem==='FLAGGED_CLAIM'?'Flagged claim':f.problem==='MIXED_LANGUAGE'?'Mixed language':'Advice for a team')+': <s>'+esc(f.before)+'</s> → '+(f.after?'<mark>'+esc(f.after)+'</mark>':'removed')+'</li>'}).join('')+'</ul>';card.appendChild(n)}})}
function showPkg(r){var box=document.getElementById('pkgBox');if(!box)return;box.innerHTML=pkgHtml(r);var b=document.getElementById('pkgDownload');if(!b)return;pkgReadSource();
 pkgWireFlags();pkgFixStyle();
 var pc=document.getElementById('pkgPersonal');if(pc)pc.onchange=function(){pc.dataset.touched='1';if(pc.checked)clearVoice();else pkgFixVoice(null)};
 var bulk=document.getElementById('pkgIncludeAll'),exclude=document.getElementById('pkgExcludeAll'),bulkSt=document.getElementById('pkgBulkStatus');
 function cmsChoices(){return [...document.querySelectorAll('.pkgUse')]}
 function cmsReady(cb){var t=document.querySelector('.pkgText[data-id="'+cb.dataset.id+'"]');return !!(t&&t.value.trim().length>=30)}
 function cmsButtonState(message){
  var all=cmsChoices(),ready=all.filter(cmsReady),selected=all.filter(function(cb){return cb.checked}),allReadySelected=ready.length>0&&ready.slice(0,12).every(function(cb){return cb.checked})&&selected.length===Math.min(ready.length,12);
  bulk.disabled=ready.length===0||allReadySelected;
  bulk.className=ready.length===0?'cms-action-unavailable':allReadySelected?'cms-action-complete':'cms-action-ready';
  bulk.textContent=allReadySelected?'✓ Prepared H2s included':'Include all prepared H2s';
  exclude.disabled=selected.length===0;exclude.className=selected.length?'action-muted':'cms-action-unavailable';
  bulkSt.className='cms-status'+(allReadySelected?' done':'');
  bulkSt.textContent=message||(!ready.length?'No prepared text yet. Use Write with AI in step 2; empty H2s cannot be included.':allReadySelected?selected.length+' prepared H2(s) included. Review the text and approve before downloading.':ready.length+' H2(s) have text; '+selected.length+' selected for the CMS package.');
 }
 if(bulk)bulk.onclick=function(){var all=cmsChoices(),ready=all.filter(cmsReady);all.forEach(function(cb){cb.checked=false});ready.slice(0,12).forEach(function(cb){cb.checked=true});cmsButtonState(ready.length>12?'12 of '+ready.length+' prepared H2s selected; package limit is 12.':null)};
 if(exclude)exclude.onclick=function(){cmsChoices().forEach(function(cb){cb.checked=false});cmsButtonState('All H2s excluded. Select one with verified text to continue.')};
 box.addEventListener('change',function(e){if(e.target.matches('.pkgUse,.pkgText'))cmsButtonState()});
 box.addEventListener('input',function(e){if(e.target.matches('.pkgText'))cmsButtonState()});
 cmsButtonState();
 b.onclick=async function(){var st=document.getElementById('pkgStatus'),iss=document.getElementById('pkgIssues');iss.innerHTML='';st.textContent='Checking the package…';b.disabled=true;b.classList.add('is-working');b.setAttribute('aria-busy','true');
  // Text pasted or changed after the editor opened: weak openings, team advice and flagged sentences are repaired first.
  try{st.textContent='Checking the sentences…';await pkgFixStyle()}catch(e){}st.textContent='Checking the package…';
  try{var body=pkgInput();body.format='zip';var r=await fetch(API+'/package'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(r.ok&&/zip/.test(r.headers.get('content-type')||'')){var blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cms-package.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},2000);st.textContent='Downloaded. Give the ZIP to whoever edits your website.';b.classList.add('action-done');var next=document.getElementById('freeStepExport');if(next){next.className='step-chip done';next.querySelector('.symbol').textContent='✓'}}
   else{var x=await r.json().catch(function(){return {messages:['Not ready.']}});st.textContent='Not ready yet:';
    var meta=(x.details||[]).filter(function(dd){return dd.code==='META_PERSONAL_OR_FOUNDER_VOICE'});if(meta.length)pkgFixVoice(null);
    // Every sentence the package refused on: the visitor's own check (x.flagged) and the builder's final-text check
    // (details FLAGGED_SENTENCE_STILL_IN_TEXT / UNRESOLVED_*), each once with its reason; issues without a sentence
    // (for example a heading that promises reasons but gives steps) are listed as such.
    var still=[],seenS={};(x.flagged||[]).map(function(f){return {sentence:f.sentence,reason:f.reason||''}}).concat((x.details||[]).filter(function(dd){return /^(FLAGGED_SENTENCE_STILL_IN_TEXT|UNRESOLVED_)/.test(dd.code||'')}).map(function(dd){return {sentence:dd.text,reason:dd.reason||''}})).forEach(function(f){var k=f.sentence||('#'+f.reason);if(seenS[k]){if(f.reason&&seenS[k].reason.indexOf(f.reason)<0)seenS[k].reason+=' · '+f.reason;return}seenS[k]={sentence:f.sentence,reason:f.reason};still.push(seenS[k])});
    var withSentence=still.filter(function(f){return f.sentence});
    iss.innerHTML='<ul>'+(x.messages||[x.error||'Not ready.']).map(function(m){return '<li>'+esc(m)+'</li>'}).join('')+'</ul>'+(still.length?'<div class="note"><strong>Still in the text:</strong><ul>'+still.map(function(f,si){return '<li>'+(f.sentence?'<a href="#" class="pkgJump" data-si="'+si+'" title="Show this sentence in the text">“'+esc(f.sentence)+'”</a>':'<em>Section heading</em>')+(f.reason?' <small>— '+esc(f.reason)+'</small>':'')+'</li>'}).join('')+'</ul>'+(withSentence.length?'<button type="button" class="ghost" id="pkgDropListed">Remove these sentences ('+withSentence.length+')</button>':'')+'</div>':'');
    // One click removes exactly the sentences the package refused on (in the included sections), then the button says so.
    // Clicking a sentence opens its section and selects it in the text (or in the heading field), so it can be changed there.
    iss.querySelectorAll('.pkgJump').forEach(function(a){a.onclick=function(ev){ev.preventDefault();pkgJumpTo(still[Number(a.getAttribute('data-si'))].sentence)}});
    var dropListed=document.getElementById('pkgDropListed');if(dropListed)dropListed.onclick=function(){var n=0;withSentence.forEach(function(f){document.querySelectorAll('.pkgText').forEach(function(t){var id=t.getAttribute('data-id'),use=document.querySelector('.pkgUse[data-id="'+id+'"]');if(use&&!use.checked)return;if(pkgDropSentence(id,f.sentence))n++})});pkgFlagState();dropListed.disabled=true;dropListed.textContent=n?'Removed '+n+' — download again':'Not found as one piece: change it in the text above'};
    if((x.issues||[]).indexOf('SOURCE_REVISION_CHANGED')>=0)pkgReadSource()}}
  catch(err){st.textContent=err.message;b.classList.add('action-failed')}b.disabled=false;b.classList.remove('is-working');b.removeAttribute('aria-busy')}}
// Step 4 is always reachable once something is chosen: AI concepts are prefilled; chosen items without a concept are
// empty sections the editor writes. Without any writing by AI the package works the same way.
function pkgSections(g,last,includeEmpty){var have={},out=[];((last&&last.sections)||[]).forEach(function(x){have[x.item_id]=1;out.push(x)});if(!includeEmpty)return {sections:out};
 document.querySelectorAll('.gapPick:checked').forEach(function(c){if(have[c.value])return;var it=((g&&g.items)||[]).filter(function(x){return String(x.id)===c.value})[0];
  if(it)out.push({item_id:String(it.id),h2:it.title,paragraphs:[],flags:[],empty:true,placement:null})});return {sections:out}}
function pkgStart(g,last,canWrite){var box=document.getElementById('pkgBox');if(!box)return;
 if(last&&(last.sections||[]).length){showPkg(pkgSections(g,last,false));return}
 if(canWrite){box.innerHTML='<h2 id="pkg">CMS package for your editor</h2><p class="muted">No AI text has been prepared yet. Use the blue automatic preparation button above; prepared H2 text appears here for your review. You do not have to write every paragraph yourself.</p>';return}
 var n=document.querySelectorAll('.gapPick:checked').length;
 box.innerHTML='<h2 id="pkg">CMS package for your editor</h2><p class="muted">A CMS package needs approved factual text, not H2 headings alone. Your editor brief is in step 1.</p>'+(canWrite?'':'<details class="research-details" id="pkgManual"><summary>Advanced: prepare a CMS package with your own verified text (optional)</summary>')+'<p><button type="button" id="pkgOpen" class="'+(canWrite?'action-blue':'ghost')+'"'+(n?'':' disabled')+'>Open the package editor for your selection ('+n+')</button> <small class="muted" id="pkgOpenHelp">'+(n?'Your selections are kept. No content is fabricated or published automatically.':'Choose at least one item in Step 2 first.')+'</small></p>'+(canWrite?'':'</details>');
 document.getElementById('pkgOpen').onclick=function(){showPkg(pkgSections(g,last,true));showStep('stepPrepare','pkg')}}
function pkgCount(n){var b=document.getElementById('pkgOpen');if(!b)return;b.disabled=!n;b.textContent='Open the package editor for your selection ('+n+')';var h=document.getElementById('pkgOpenHelp');if(h)h.textContent=n?'You write or paste the text per section, then approve and download.':'Choose at least one item in step 2 first.'}
function questionLink(d,s,q){var b=(d&&d.new_check_url)||${js(base)};if(b.slice(-6)==='/admin')b=${js(base)};return b+(b.indexOf('?')>=0?'&':'?')+'url='+encodeURIComponent(s&&s.url||'')+'&query='+encodeURIComponent(q||'')}
function newCheckLink(d,s){var b=(d&&d.new_check_url)||${js(base)};if(b.slice(-6)==='/admin')b=${js(base)};var c=s&&s.checked||{};
 return b+(b.indexOf('?')>=0?'&':'?')+'url='+encodeURIComponent(s&&s.url||'')+'&query='+encodeURIComponent(c.search_term||'')}
function nextWrite(g,w,n,d){var box=document.getElementById('nextWrite');if(!box)return;var r=null;
 if(g&&g.writing_allowed===false){var ev=g.evidence||{},read=Number(ev.readable_ranking_pages||0);
  box.innerHTML='<strong>AI cannot write text for this check yet</strong><p>'+esc(ev.plain_reason||ev.reason||'The research found too little evidence to write new text safely.')+'</p>'+
   '<p class="muted">AI only writes when at least 2 pages that Google ranks for your search term could be read and compared'+(read?' (here: '+read+')':'')+'. Otherwise the text would be guesswork about your business.</p>'+
   '<p><strong>What you can do</strong></p><ol><li>Run a new check for this page with a more specific search term, the way a customer types it in Google (for example with your service and town), or with the right country and language.</li><li>Or download the editor brief (Export your selection, below) and let someone write from it.</li></ol>'+
   '<p><a class="btn" id="nextWriteNewCheck" href="'+esc(newCheckLink(d,d&&d.summary))+'">New check for this page →</a></p>';return}
 else if(!w||!w.allowed)r='AI writing is switched off for this link'+(w&&w.owner_login_available?'. Owner: unlock it in step 2 (Write the text) with your admin key.':' (Railway setting GROWTH_FREE_WRITING). Use the editor brief instead (Export your selection, below).');
 else if(w.remaining<=0)r='All AI writing runs for this check are used. Your prepared text is in step 2; a new check gives new runs.';
 if(r){box.innerHTML='<strong>Write with AI</strong><p class="muted">'+esc(r)+'</p>';return}
 box.innerHTML='<strong>Next: let AI write your chosen H2s</strong><p class="muted">'+(n?'AI writes the text for the '+n+' chosen H2(s); you check it before anything is downloaded. Nothing is published.':'Tick the H2s you want above. Then AI writes the text for you here.')+'</p><p><button type="button" id="nextWriteBtn" class="action-blue"'+(n?'':' disabled')+'>'+(n?'✍ Write the '+n+' chosen H2(s) with AI':'Choose a topic above first')+'</button></p>';
 var b=document.getElementById('nextWriteBtn');if(b)b.onclick=function(){showStep('stepPrepare','prepare');var wb=document.getElementById('gapWrite');if(wb&&!wb.disabled)wb.click()}}
function wireGaps(g,s,d){var box=document.getElementById('gapDownload');if(!box)return;
 var unlock=document.getElementById('ownerUnlockForm');if(unlock)unlock.onsubmit=async function(e){e.preventDefault();var key=document.getElementById('ownerUnlockKey'),btn=document.getElementById('ownerUnlockButton'),st=document.getElementById('ownerUnlockStatus');btn.disabled=true;btn.classList.add('is-working');btn.setAttribute('aria-busy','true');st.textContent='Verifying owner access…';try{var res=await fetch('/api/free-growth/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:key.value})});key.value='';var answer=await res.json();if(!answer.success)throw Error(answer.error||'Owner authentication failed');st.textContent='Owner access confirmed.';var state=await fetch(API+Q,{cache:'no-store',credentials:'same-origin'});var next=await state.json();if(!next.success||!next.writing||!next.writing.allowed)throw Error('Could not activate writing on this check');render(next);openJourney('stepPrepare')}catch(err){key.value='';st.textContent=err.message;st.className='error';btn.classList.add('action-failed')}finally{btn.disabled=false;btn.classList.remove('is-working');btn.removeAttribute('aria-busy')}};

  var savedIds=new Set((d.selected_item_ids||[]).map(String)),saveTimer=null,revision=0;
  function queueSelectionSave(){var ids=Array.from(document.querySelectorAll('.gapPick:checked')).map(function(x){return x.value});var generation=++revision;clearTimeout(saveTimer);saveTimer=setTimeout(async function(){var st=document.getElementById('gapStatus');try{var r=await fetch(API+'/selection'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item_ids:ids})});var v=await r.json();if(!v.success)throw Error(v.error||'Selection not saved');if(generation===revision&&st)st.textContent=ids.length+' selected · saved';}catch(e){if(generation===revision&&st){st.textContent='Selection not saved: '+e.message;st.className='error'}}},350)}
  document.querySelectorAll('.gapPick').forEach(function(el){el.checked=savedIds.has(el.value)});
 var wr=document.getElementById('gapWritten');if(wr&&d&&d.writing&&d.writing.last){wr.innerHTML=writtenHtml(d.writing.last)}
// "Write this H2 again": ticking a concept (or the automatic tick on a weak opening / team advice) makes the write button
// write those concepts again, as long as the check has a round left.
function syncRewrite(){var left=Number(d.writing&&d.writing.remaining||0);
 document.querySelectorAll('.gapRewrite').forEach(function(c){var l=c.closest('label');if(l)l.style.display=left>0?'':'none'});
 var b=document.getElementById('gapWrite');if(!b)return;var n=document.querySelectorAll('.gapRewrite:checked').length;
 if(n&&left>0){if(!b.dataset.rewriteLabel)b.dataset.rewriteLabel=b.textContent;b.disabled=false;b.dataset.exhausted='';b.textContent='Write the '+n+' ticked concept(s) again with AI (uses '+Math.ceil(n/4)+' of '+left+' round(s))'}
 else if(b.dataset.rewriteLabel){b.textContent=b.dataset.rewriteLabel}}
 if(wr&&!wr.dataset.jumpWired){wr.dataset.jumpWired='1';wr.addEventListener('click',function(e){var m=e.target&&e.target.closest&&e.target.closest('.conceptJump');if(m)pkgJumpTo(m.getAttribute('data-sentence'))});wr.addEventListener('keydown',function(e){var m=e.target&&e.target.closest&&e.target.closest('.conceptJump');if(m&&e.key==='Enter')pkgJumpTo(m.getAttribute('data-sentence'))})}
 if(wr&&!wr.dataset.rewriteWired){wr.dataset.rewriteWired='1';wr.addEventListener('change',function(e){if(e.target&&e.target.classList&&e.target.classList.contains('gapRewrite'))syncRewrite()})}
 var wb=document.getElementById('gapWrite');
 if(wb)wb.onclick=async function(){
  var ids=[];document.querySelectorAll('.gapPick:checked').forEach(function(c){ids.push(c.value)});
  var st0=document.getElementById('gapStatus'),stW=document.getElementById('gapWriteStatus'),available=Number(d.writing&&d.writing.remaining||0);
  // Progress and errors of writing are shown right under the write button (the brief's status line is inside a collapsed box).
  var st={set textContent(v){if(stW){stW.textContent=v;stW.className=/stopped|not |could not|error|limit|used up|changed/i.test(v)?'error':''}if(st0)st0.textContent=v},get textContent(){return stW?stW.textContent:''}};
  if(!ids.length){st.textContent='Select at least one topic in step 1.';return}
  var doneIds=new Set(((d.writing&&d.writing.last&&d.writing.last.sections)||[]).map(function(x){return String(x.item_id)}));
  var eligible=ids.filter(function(id){var it=(g.items||[]).find(function(x){return String(x.id)===id});return !!(it&&it.writable&&!doneIds.has(id))});
  // Concepts ticked "Write this H2 again": written again (the new concept replaces the old one; it uses a round).
  var again=[];document.querySelectorAll('.gapRewrite:checked').forEach(function(c){again.push(c.value)});
  var rewrite=!eligible.length&&again.length>0;if(rewrite)eligible=again;
  if(!eligible.length){st.textContent=doneIds.size?'Every selected H2 already has a concept. To have AI write one again, tick “Write this H2 again with AI” at that concept below, then click this button.':'None of the selected headings is eligible for evidence-supported AI writing.';return}
  var aiChoice=await freeAiGate(d);if(!aiChoice){st.textContent='Your selection is saved. Check AI answers or choose to continue without them.';return}
  var capacity=Math.min(available*4,eligible.length),chosen=eligible.slice(0,capacity);
  wb.disabled=true;wb.classList.add('is-working');wb.setAttribute('aria-busy','true');
  st.textContent='Preparing '+chosen.length+' eligible H2(s) automatically using '+Math.ceil(chosen.length/4)+' round(s) of 4 H2s…';
  var latest=null,completed=0;
  try{
   for(var run=0;run<Math.min(available,Math.ceil(chosen.length/4));run++){
    st.textContent='Writing H2 batch '+(run+1)+' of '+Math.ceil(chosen.length/4)+'…';
    var response=await fetch(API+'/write'+Q,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(d&&d.writing&&d.writing.owner_unlocked?{'X-Requested-With':'growth-free-admin'}:{})},body:JSON.stringify({item_ids:rewrite?chosen.slice(run*4,run*4+4):chosen,ai_check_choice:aiChoice,rewrite:rewrite})});
    var result=await response.json();
    if(result.stored===false&&(result.sections||[]).length){wr.innerHTML=writtenHtml(result);throw Error(result.error||'The draft was not saved; reload to verify the status')}
    if(!response.ok||!result.success)throw Error(result.error||'Writing could not finish');
    latest=result;completed+=result.sections?.length||0;
    wr.innerHTML=writtenHtml(result.all_written||result);
    showPkg(pkgSections(g,result.all_written||result,false));
    if(rewrite?((run+1)*4>=chosen.length||!result.remaining):(!(result.pending||[]).length||!result.remaining))break;
   }
   if(!latest)throw Error('No verified draft was generated');
   var pending=latest.pending||[],outside=ids.length-chosen.length-[...doneIds].filter(function(id){return ids.includes(id)}).length;
   st.textContent=completed+' H2 draft(s) prepared automatically for review.'+(pending.length?' '+pending.length+' could not be completed with the available runs.':'')+(outside?' '+outside+' selected topic(s) were not processed because they are unsupported or exceed the remaining quota.':'')+' Review the prepared sections below; nothing is published.';
   // Nothing left to prepare: say so instead of offering another run.
   var allDone=!pending.length;
   wb.textContent=allDone?'✓ All selected H2s are prepared':'Write the remaining chosen H2s with AI (up to '+(latest.remaining*4)+' more)';
   wb.disabled=allDone||!latest.remaining;wb.dataset.exhausted=allDone||!latest.remaining?'yes':'';if(d.writing)d.writing.remaining=latest.remaining;
   if(rewrite)st.textContent=completed+' H2(s) written again by AI. The new concepts replace the old ones below and in the package; nothing is published.';syncRewrite();
   if(allDone)showStep('stepPrepare','pkg');
   wb.classList.add('action-green');openJourney('stepPrepare');
  }catch(err){st.textContent='Automatic preparation stopped after '+completed+' draft(s): '+String(err.message).replace(/[.]+$/,'')+'. Saved drafts remain available below.';wb.disabled=false;wb.classList.add('action-red')}
  finally{wb.classList.remove('is-working');wb.removeAttribute('aria-busy')}
 };
 var count=function(){var n=document.querySelectorAll('.gapPick:checked').length;updateNow(n);document.getElementById('gapCount').textContent=n+' selected';nextWrite(g,d&&d.writing,n,d);pkgCount(n);if(wb&&!wb.dataset.exhausted){wb.disabled=n===0}if(count.initialized)queueSelectionSave();var step=document.getElementById('freeStepSelect');if(step&&!step.classList.contains('blocked')){step.className='step-chip '+(n?'done':'current');step.querySelector('.symbol').textContent=n?'✓':'→'}var writeStep=document.getElementById('freeStepWrite');if(writeStep&&!writeStep.classList.contains('done')&&!writeStep.classList.contains('blocked')){writeStep.className='step-chip '+(n&&wb?'current':'');writeStep.querySelector('.symbol').textContent=n&&wb?'→':'○'}};
 document.querySelectorAll('.gapPick').forEach(function(c){c.addEventListener('change',count)});
 document.getElementById('gapAll').onclick=function(){document.querySelectorAll('.gapPick').forEach(function(c){c.checked=true});count()};
 document.getElementById('gapNone').onclick=function(){document.querySelectorAll('.gapPick').forEach(function(c){c.checked=false});count()};
 var st=document.getElementById('gapStatus');
 box.onclick=function(){var b=gapBrief(g,s);if(!b.count){st.textContent='Select at least one item.';return}
  var url=URL.createObjectURL(new Blob([b.text],{type:'text/markdown'})),a=document.createElement('a');a.href=url;a.download='editor-brief.md';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},2000);st.textContent=b.count+' item(s) in the brief.';box.classList.add('action-done');var next=document.getElementById('freeStepExport');if(next){next.className='step-chip done';next.querySelector('.symbol').textContent='✓'}};
 document.getElementById('gapCopy').onclick=function(){var b=gapBrief(g,s);if(!b.count){st.textContent='Select at least one item.';return}if(navigator.clipboard)navigator.clipboard.writeText(b.text);st.textContent='Copied ('+b.count+' item(s)).'};count();count.initialized=true;syncRewrite();pkgStart(g,d&&d.writing&&d.writing.last,!!(d&&d.writing&&d.writing.allowed&&d.writing.remaining>0&&g&&g.writing_allowed!==false))}
// After publication: the date, one e-mail about four weeks later, and the before/after comparison from two exports.
function fmtD(x){try{return new Date(String(x).slice(0,10)+'T12:00:00Z').toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}catch(e){return String(x)}}
function sideHtml(label,w,x,undated){if(!x)return '<div><small>'+label+'</small><strong>'+(undated?'Export uploaded, dates unknown':'No export yet')+'</strong><small>'+(undated?'Your export ('+esc(undated.totals&&undated.totals.impressions)+' shown · '+esc(undated.totals&&undated.totals.clicks)+' clicks) does not say which dates it covers, so it is not placed here. Upload the same ZIP again (the dates are now read from its date filter), or export ':'Upload an export for ')+esc(fmtD(w.start))+' – '+esc(fmtD(w.end))+', filtered on exactly this page.</small></div>';
 var T=x.totals||{};return '<div><small>'+label+' · '+esc(x.period.start)+' – '+esc(x.period.end)+(x.period.inferred?' (dates from “'+esc(x.period.inferred)+'” and the export date)':'')+'</small><strong>'+esc(T.impressions)+' shown · '+esc(T.clicks)+' clicks</strong><small>'+(T.position==null?'':'average position '+esc(T.position)+' · ')+(x.search_term_row?'your search term: '+esc(x.search_term_row.impressions)+' shown, '+esc(x.search_term_row.clicks)+' clicks':'your search term is not in this export')+(x.matches_window?'':' · not exactly the 4 weeks '+(label==='Before'?'before':'after')+' the update')+'</small></div>'}
function pubHtml(p,g){if(!p)return '';var h='<h2 id="published">Record publication and compare results</h2>';
 var today=new Date().toISOString().slice(0,10);
 if(p.published_on){h+='<p class="lead"><strong>Published on '+esc(fmtD(p.published_on))+'.</strong> '+(p.stopped?'The reminder is stopped.':p.reminder_sent_at?'The reminder was sent on '+esc(fmtD(p.reminder_sent_at))+'.':p.reminder_due_at?'One e-mail on '+esc(fmtD(p.reminder_due_at))+' to '+esc(p.email_hint)+': which two periods to export from Search Console.':'No e-mail reminder.')+'</p>';
  if(!p.email_configured&&p.reminder_due_at&&!p.reminder_sent_at)h+='<p class="note">E-mail is not set up on this server, so no e-mail will arrive. Come back to this page after '+esc(fmtD(p.reminder_due_at))+'; the steps below work without it.</p>';
  var c=g&&g.comparison;if(c){h+='<h3>Before and after in Google (Search Console)</h3><div class="grid two">'+sideHtml('Before',c.windows.before,c.before,c.undated)+sideHtml('After',c.windows.after,c.after,null)+'</div><p class="muted">'+esc(c.note)+'</p>';
   if(!c.ready)h+='<p>Export from Search Console: Performance → filter Page → “Exact URL” → this page → Date → Custom → '+(c.before?'':'<strong>'+esc(fmtD(c.windows.before.start))+' – '+esc(fmtD(c.windows.before.end))+'</strong> (before)')+(!c.before&&!c.after?' and ':'')+(c.after?'':'<strong>'+esc(fmtD(c.windows.after.start))+' – '+esc(fmtD(c.windows.after.end))+'</strong> (after, once these 4 weeks have passed)')+' → Export → Download CSV. Upload it under Search Console above.</p>'}
  h+='<p><button type="button" class="ghost" id="pubChange">Change the date</button> <button type="button" class="ghost" id="pubClear">Remove the date</button> <small role="status" id="pubStatus"></small></p>';
  h+='<div id="pubForm" hidden>'}else{h+='<p>Your editor puts the package on your website; nothing is published by this check. Once the change is live, enter the date here. About four weeks later you get one e-mail with the two periods to compare in Search Console, and this page shows them side by side.</p><details id="pubOpen"><summary><strong>The change is live: enter the date</strong></summary><div id="pubForm">'}
 h+='<label for="pubDate">Date the change went live</label><input id="pubDate" type="date" max="'+today+'" value="'+esc(p.published_on||'')+'">';
 h+='<label class="check"><input type="checkbox" id="pubRemind" checked><span>E-mail me ('+esc(p.email_hint)+') once, about four weeks later. You can stop it with the link in the e-mail.</span></label>';
 h+='<p><button type="button" id="pubSave">Save the date</button> <small role="status" id="pubSaveStatus"></small></p></div>'+(p.published_on?'':'</details>');
 return h}
function wirePub(){var save=document.getElementById('pubSave');if(!save)return;
 var reload=async function(){var d=await (await fetch(API+Q,{cache:'no-store'})).json();var box=document.getElementById('pubBox');if(box&&d.success){box.innerHTML=pubHtml(d.publication,d.gsc);wirePub()}var el=document.getElementById('published');if(el)el.scrollIntoView()};
 var ch=document.getElementById('pubChange');if(ch)ch.onclick=function(){document.getElementById('pubForm').hidden=false};
 var cl=document.getElementById('pubClear');if(cl)cl.onclick=async function(){if(!confirm('Remove the date and the reminder?'))return;await fetch(API+'/publication'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clear:true})});reload()};
 save.onclick=async function(){var st=document.getElementById('pubSaveStatus'),v=document.getElementById('pubDate').value;if(!v){st.textContent='Choose the date first.';return}save.disabled=true;save.classList.add('is-working');save.setAttribute('aria-busy','true');st.textContent='Saving…';
  try{var r=await fetch(API+'/publication'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({published_on:v,remind:document.getElementById('pubRemind').checked})});var x=await r.json();if(!x.success)throw Error(x.error||'Not saved');await reload()}
  catch(err){st.textContent=err.message;save.disabled=false;save.classList.remove('is-working');save.removeAttribute('aria-busy');save.classList.add('action-failed')}}}
// What the competitor pages have and your page does not: every Google result, read or not, with the headings of the
// pages that were read. Shown also when no advice is given (then as observations only).
function competitorsHtml(c,s){if(!c||!(c.pages||[]).length)return '';var blocked=s&&s.decision==='DATA_BLOCKED';
 var h='<h3 id="competitors">What the competitor pages have'+(c.missing?' that your page does not ('+c.missing+')':'')+'</h3>';
 h+='<p class="muted">'+(blocked?'Observations only: there was not enough evidence for advice, but this is what Google showed and what the pages that could be read contain.':'What Google showed for this search, and the headings of the pages that could be read, compared with your page.')+'</p>';
 c.pages.forEach(function(p){var miss=(p.headings||[]).filter(function(x){return x.status==='MISSING'||x.status==='PARTLY'}).length;
  h+='<div class="card"><strong>'+(p.position?'#'+esc(p.position)+' ':'')+esc(p.site)+'</strong> <small class="muted">· '+esc(p.status)+(p.read&&p.headings.length?' · '+miss+' of '+p.headings.length+' heading(s) not on your page':'')+'</small>'+
   (p.title?'<br><small>'+esc(p.title)+'</small>':'')+'<br><small><a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(p.url)+'</a></small>'+
   ((p.headings||[]).length?'<ul>'+p.headings.map(function(x){return '<li>'+(x.status==='MISSING'?'<strong>'+esc(x.text)+'</strong> <small class="error">· '+esc(x.label)+'</small>':x.status==='PARTLY'?esc(x.text)+' <small>· '+esc(x.label)+'</small>':esc(x.text)+' <small class="muted">· '+esc(x.label)+'</small>')+'</li>'}).join('')+'</ul>':'')+'</div>'});
 if((c.side_by_side||[]).length){h+='<h3 id="sideBySide">Side by side: what the competitor says, and your page</h3><p class="muted">The competitor’s own words, for comparison only: write your own text with facts you can stand behind, never copy theirs.</p>';
  c.side_by_side.forEach(function(x,i){h+='<div class="card"><strong>'+esc(x.competitor_section)+'</strong> <small class="muted">· '+esc(x.site||'')+'</small><blockquote>'+esc(x.competitor_excerpt)+'</blockquote>'+
   '<p><small>Your page:</small> '+(x.your_section?'<strong>'+esc(x.your_section)+'</strong>'+(x.your_excerpt?'<br><small>'+esc(x.your_excerpt)+'</small>':''):'<em>no matching section</em>')+'</p>'+
   (x.action?'<p><small>What to do:</small> '+esc(x.action)+'</p>':'')+
   '<p>'+(x.item_id?'<button type="button" class="ghost sbsAdd" data-item="'+esc(x.item_id)+'">Add this topic to my choice</button> ':'')+'<button type="button" class="ghost sbsCopy" data-i="'+i+'">Copy for the editor</button> <small role="status" class="sbsStatus"></small></p></div>'})}
 if((c.your_headings||[]).length)h+='<details class="research-details"><summary>Your page’s headings ('+c.your_headings.length+')</summary><ul>'+c.your_headings.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul></details>';
 return h}
function wireSideBySide(c){if(!c||!(c.side_by_side||[]).length)return;
 document.querySelectorAll('.sbsAdd').forEach(function(b){b.onclick=function(){var box=document.querySelector('.gapPick[value="'+b.getAttribute('data-item').replace(/"/g,'')+'"]'),st=b.parentNode.querySelector('.sbsStatus');
  if(!box){st.textContent='This topic is not in the list of step 1.';return}if(!box.checked){box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}))}st.textContent='Added to your choice in step 1.';b.disabled=true}});
 document.querySelectorAll('.sbsCopy').forEach(function(b){b.onclick=function(){var x=c.side_by_side[Number(b.getAttribute('data-i'))],st=b.parentNode.querySelector('.sbsStatus');
  var t=['Topic: '+x.competitor_section,'What '+(x.site||'the competitor')+' says (do not copy; write your own): '+x.competitor_excerpt,'Your page: '+(x.your_section?x.your_section+(x.your_excerpt?' — '+x.your_excerpt:''):'no matching section'),x.action?'What to do: '+x.action:'',x.competitor_url?'Source: '+x.competitor_url:''].filter(Boolean).join(String.fromCharCode(10));
  if(navigator.clipboard)navigator.clipboard.writeText(t);st.textContent='Copied.'}})}
// The next action, from the state of the check and the current choice (updated while ticking topics).
var NOW_CTX=null;
function nowOf(c,chosen){var d=c.d,stage=c.published?3:c.hasConcepts?2:chosen&&c.canWrite?2:1;
 var now=c.published?{t:'Measure the effect',why:'You recorded the publication date. Upload a new Search Console export after about four weeks to compare before and after.',b:'Go to step 3',to:'stepPublish'}
  :c.hasConcepts?{t:'Check the text and download the CMS package',why:'AI wrote '+d.writing.last.sections.length+' section(s). Read them, keep what is true for your business, then download the package for your website.',b:'Check the text',to:'stepPrepare'}
  :c.blocker?{t:'Look at what the competitor pages have',why:'There was too little evidence to propose new text, but you can still see what the ranking pages cover and you do not.',b:'See the comparison',to:'competitors'}
  :!c.hasGaps?{t:'Nothing to add for this search',why:'Your page already covers what the ranking pages cover. See what was checked below.',b:'See what was checked',to:'stepResearch'}
  :chosen&&c.canWrite?{t:'Let AI write the '+chosen+' chosen topic(s)',why:'You chose what goes on your page. AI writes it now; you check everything before anything is downloaded.',b:'Go to step 2: write',to:'stepPrepare'}
  :chosen?{t:'Download the editor brief',why:'You chose '+chosen+' topic(s). AI writing is not available for this check, so hand the brief to whoever writes your page.',b:'Go to the brief',to:'gapDownload'}
  :{t:'Choose what to add to your page',why:'Start with the topics marked Recommended or “AI cites this too”. Tick what fits your business.',b:'Choose topics',to:'stepReview'};
 return {stage:stage,now:now}}
function cockpitInner(c,chosen){var x=nowOf(c,chosen),now=x.now,stage=x.stage;
 return '<span class="growth-eyebrow">STEP '+stage+' OF 3 · DO THIS NOW</span><h2 id="freeActionTitle">'+esc(now.t)+'</h2><p>'+esc(now.why)+'</p><a class="growth-next-btn" href="#'+esc(now.to)+'">'+esc(now.b)+' <span aria-hidden="true">→</span></a>'+(c.selfOpen?'<p class="growth-subline">Also: <a href="#selfDo" style="color:inherit">'+c.selfOpen+' thing(s) to do yourself</a> (schema, Bing, listings, facts) — Growth does not write these.</p>':'')+'<div class="growth-flow" aria-label="Workflow progress">'+[['Choose','stepReview'],['Write','stepPrepare'],['Publish & measure','stepPublish']].map(function(st,i){var cls=i+1<stage?'complete':i+1===stage?'active':'';return '<span class="'+cls+'"><a href="#'+st[1]+'">'+(i+1<stage?'✓ ':(i+1)+'. ')+esc(st[0])+'</a></span>'}).join('')+'</div>'}
// When the "Do this now" card is scrolled out of view, the same action sits in a bar at the bottom of the screen,
// so the next step is always one click away (no scrolling back up).
function updateNow(chosen){if(!NOW_CTX)return;var card=document.getElementById('freeNextAction');if(card)card.innerHTML=cockpitInner(NOW_CTX,chosen);
 var x=nowOf(NOW_CTX,chosen),bar=document.getElementById('nowBar');if(!bar)return;
 bar.innerHTML='<span><small>Step '+x.stage+' of 3 · do this now</small><strong>'+esc(x.now.t)+'</strong></span><a class="btn" href="#'+esc(x.now.to)+'">'+esc(x.now.b)+' →</a><a class="now-top" href="#freeNextAction" aria-label="Back to the top">↑ Top</a>'}
var nowObs=null;
function wireNowBar(){var card=document.getElementById('freeNextAction'),bar=document.getElementById('nowBar');if(!bar){bar=document.createElement('div');bar.id='nowBar';bar.className='now-bar';bar.hidden=true;bar.setAttribute('role','region');bar.setAttribute('aria-label','Next action');document.body.appendChild(bar)}
 if(!card||!window.IntersectionObserver)return;if(nowObs)nowObs.disconnect();
 nowObs=new IntersectionObserver(function(es){var off=!es[0].isIntersecting&&es[0].boundingClientRect.top<0;bar.hidden=!off;document.body.style.paddingBottom=off?'84px':''},{threshold:0});nowObs.observe(card)}
function render(d){var s=d.summary,o=document.getElementById('out');o.setAttribute('aria-busy','false');if(d.new_check_url)document.getElementById('back').href=d.new_check_url;if(d.offer){BRAND=d.offer.brand||BRAND;SERVICE=d.offer.service_text||SERVICE;CONTACT=d.offer.contact_url||''}
 if(d.status==='FAILED'){o.innerHTML='<p class="kicker">Not finished</p><h1>The check could not finish</h1><p>'+esc(d.error_text)+'</p><p><a class="btn" href="'+esc(d.new_check_url||${js(base)})+'">Try again</a></p>';return}
 var a=d.ai,as=a&&a.summary;
 var h='<p class="kicker">Result · Google + AI'+'</p><h1>Your page in Google and in AI answers</h1>';
 if(d.cached)h+='<p class="note"><strong>Result from earlier today.</strong> This page was checked for the same question and market'+(s.checked&&s.checked.checked_at?' on '+esc(new Date(s.checked.checked_at).toLocaleString()):' in the last 24 hours')+', so that result is shown. A new check of this page is possible tomorrow.</p>';
 h+='<p class="muted">Page: <a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.url)+'</a></p>';
 // The customer question the check used: chosen automatically from Google, or typed. Other questions start a new check.
 var cq=d.customer_question,term=s.checked&&s.checked.search_term;
 if(cq&&cq.text)h+='<div class="card" id="customerQuestion"><strong>Customer question researched:</strong> “'+esc(cq.text)+'” <small class="muted">· chosen automatically · '+esc(cq.label||'')+'</small>'+
  ((cq.others||[]).length?'<details><summary>Other questions customers ask ('+cq.others.length+') — run the check with one of them</summary><ul>'+cq.others.map(function(o){return '<li><a href="'+esc(questionLink(d,s,o.text))+'">'+esc(o.text)+'</a> <small class="muted">· '+esc(o.label)+'</small></li>'}).join('')+'</ul></details>':'')+
  '<p><a href="'+esc(questionLink(d,s,''))+'">Not the right question? Run the check with your own question →</a></p></div>';
 else if(cq&&!cq.text)h+='<div class="card" id="customerQuestion"><strong>Search term researched:</strong> “'+esc(term||'')+'” <small class="muted">· no customer question found in Google for this page, so a phrase from the page was used</small><p><a href="'+esc(questionLink(d,s,''))+'">Run the check with your own customer question →</a></p></div>';
 var canWrite=!!(s.gaps&&s.gaps.status==='OBSERVED'&&s.gaps.writing_allowed!==false&&d.writing&&d.writing.allowed);
 var chosen=(d.selected_item_ids||[]).length,hasConcepts=!!(d.writing&&d.writing.last&&(d.writing.last.sections||[]).length),hasGaps=!!(s.gaps&&s.gaps.status==='OBSERVED'&&(s.gaps.items||[]).length);
 var published=!!(d.publication&&d.publication.published_on);
 var blocker=s.decision==='DATA_BLOCKED',noChange=s.decision==='NO_CHANGE';
 var hasCompetitors=!!(d.competitors&&(d.competitors.pages||[]).some(function(x){return (x.headings||[]).length}));
 // One next action at a time: what to do now, why, and one button. Done steps close; their result stays one click away.
 var selfOpen=(function(){var dn=selfDone();return selfItems(s.gaps,d).filter(function(x){return !dn[x.id]}).length})();
 NOW_CTX={d:d,canWrite:canWrite,hasConcepts:hasConcepts,hasGaps:hasGaps,published:published,blocker:blocker,selfOpen:selfOpen};
 h+='<section class="growth-cockpit '+(blocker?'needs-evidence':noChange?'no-change':'')+'" id="freeNextAction" aria-labelledby="freeActionTitle">'+cockpitInner(NOW_CTX,chosen)+'</section>';
 // What the check found, in three lines; the evidence is in the tabs below.
 var recN=hasGaps?s.gaps.items.filter(function(x){return x.recommended}).length:0;
 var ag=a&&a.gap,aiTopics=ag&&ag.missing_topics?ag.missing_topics.length:0,gItems=hasGaps?s.gaps.items.filter(function(x){return x.group!=='PAGE_ELEMENT'&&x.group!=='NOT_RELEVANT'}).length:0;
 h+='<div class="card found"><strong>What the check found</strong><ul>'+
  '<li><strong>Google:</strong> '+(gItems?gItems+' topic(s) the ranking pages have and your page does not'+(recN?' ('+recN+' recommended)':''):esc(s.headline))+' <a href="#google">evidence</a></li>'+
  '<li><strong>AI answers:</strong> '+(as&&as.checked?esc(as.headline)+(aiTopics?' · '+aiTopics+' topic(s) on the pages AI cites that your page does not cover':ag&&ag.status==='RUNNING'?' · the pages AI cites are being compared':''):'not checked yet')+' <a href="#ai">evidence</a></li>'+
  (d.gsc&&d.gsc.latest?'<li><strong>Search Console:</strong> export used <a href="#gsc">evidence</a></li>':'')+'</ul></div>';
 h+=gapsHtml(s.gaps,d.writing,d);
 if(!s.gaps||s.gaps.status!=='OBSERVED'){h+='<details id="stepReview" class="journey-section" open>'+stepSum(1,'Choose what to add','Evidence required before writing',false)+'<div class="journey-body"><h2 id="gaps">No verified content change</h2><p>'+esc(s.explanation)+'</p><p class="muted">AI citations and competitor headings alone do not establish a safe change. No automatic writing or publication is approved.</p><p><a href="#google">See the evidence</a></p></div></details><details id="stepPrepare" class="journey-section">'+stepSum(2,'Write the text','No approved content recommendation',false)+'<div class="journey-body"><p>No content is ready for a CMS package.</p></div></details>'}
 h+='<details id="stepPublish" class="journey-section"'+(published?' open':'')+'>'+stepSum(3,'Publish & measure',published?'Published on '+String(d.publication.published_on).slice(0,10)+' — compare before and after here':'After you put the text on your site: record the date',published)+'<div class="journey-body" id="pubBox">'+pubHtml(d.publication,d.gsc)+'</div></details>';
 // The evidence: one tab per source, closed until opened (also by every "evidence" link).
 h+='<details id="stepResearch" class="card"><summary>What was checked — evidence (Google · AI answers'+(as?' '+as.checked+'/5':'')+' · Search Console)</summary><div class="rtabs" role="tablist"><button type="button" data-tab="google" aria-selected="true">Google</button><button type="button" data-tab="ai" aria-selected="false">AI answers</button><button type="button" data-tab="gsc" aria-selected="false">Search Console</button></div>';
 h+='<div class="rtab-pane" data-tab="google"><h2 id="google">Google search</h2><p class="muted"><strong>'+esc(s.headline)+'.</strong> '+esc(s.explanation)+'</p>';
 h+=competitorsHtml(d.competitors,s);
 h+='<details class="research-details"><summary>Research limitations and next research options</summary><ol>'+s.steps.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ol></details>';
 if(s.tasks.length){h+='<h2>Why — what the ranking pages explain</h2>'+s.tasks.map(function(t){return '<div class="card"><strong>'+esc(t.title)+'</strong> <small>'+esc(t.status)+'</small>'+t.evidence.map(function(e){return '<blockquote>'+(e.heading?'<strong>'+esc(e.heading)+'</strong><br>':'')+esc(e.excerpt)+'<br><small><a href="'+esc(e.url)+'" target="_blank" rel="noopener noreferrer nofollow">'+esc(e.site)+'</a></small></blockquote>'}).join('')+'</div>'}).join('')}
 h+='</div><div class="rtab-pane" data-tab="ai" hidden>'+(a?aiHtml(a,d.automatic_ai_answers):'<p class="muted">AI answers are available once the search term is known.</p>')+'</div><div class="rtab-pane" data-tab="gsc" hidden>'+gscHtml(d.gsc)+'</div></details>';
 var c=s.checked;h+='<details class="research-details" id="checkedScope"><summary>Search details (term, market, pages read)</summary><div class="grid"><div><small>Search term</small><strong>'+esc(c.search_term||'—')+'</strong><small>'+(c.search_term_source==='YOU_ENTERED_IT'?'entered by you':'derived from your page')+'</small></div><div><small>Google shows mostly</small><strong>'+esc(c.what_google_shows||'unclear')+'</strong></div><div><small>Ranking results considered</small><strong>'+esc(c.ranking_results_considered)+'</strong>'+(c.google_results_received!=null?'<small>of '+esc(c.google_results_received)+' Google results received</small>':'')+(c.results_not_used&&c.results_not_used.length?'<small>not used: '+esc(c.results_not_used.map(function(x){return x.count+' × '+x.text}).join(', '))+'</small>':'')+'</div><div><small>Ranking pages read in full</small><strong>'+esc(c.ranking_pages_read)+'</strong></div>'+(c.search_market?'<div><small>Searched in</small><strong>'+esc(c.search_market.join(' + '))+'</strong>'+(c.markets_not_searched&&c.markets_not_searched.length?'<small>not researched: '+esc(c.markets_not_searched.join(', '))+' (partial market research)</small>':'')+(c.market_derived_not_confirmed?'<small>market derived from your page, not confirmed</small>':'')+'</div>':'')+'</div></details>';
 h+='<details class="research-details" id="limits"><summary>Research scope and limitations</summary><ul>'+s.limitations.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul><p class="note">'+esc(s.promises)+'</p></details>';
 h+='<details class="research-details" id="data"><summary>Download complete research data (optional)</summary><p>The JSON contains the full research for independent analysis.</p><p><a class="btn ghost" href="'+esc(API+'/report.json'+Q)+'" download>Download JSON</a></p></details>';
 h+='<div class="card" id="hire"><p class="kicker">Paid · done for you</p><h2 style="margin-top:4px">Want this done for you?</h2><p>'+esc(SERVICE)+'</p>'+(CONTACT?'<p><a class="btn" href="'+esc(CONTACT)+'" target="_blank" rel="noopener noreferrer">Book a call</a></p><p class="muted">Or leave your details:</p>':'')+
 '<form id="hf"><label>Name<input name="name" required maxlength="120"></label><label>Email<input name="email" type="email" required maxlength="200"></label><label>Company / website (optional)<input name="company" maxlength="200"></label><label>Phone (optional)<input name="phone" maxlength="40"></label><label>What would you like help with? (optional)<textarea name="message" rows="3" maxlength="2000"></textarea></label><label class="check"><input type="checkbox" name="consent" required> <span>Contact me about this request.</span></label><p><button type="submit">Ask '+esc(BRAND)+' to do it</button> <small role="status" id="hs"></small></p></form></div>';
 o.innerHTML=h;var activeStage=published?'stepPublish':hasConcepts?'stepPrepare':chosen&&!blocker&&canWrite?'stepPrepare':'stepReview';document.querySelectorAll('details.journey-section').forEach(function(el){el.open=el.id===activeStage});wireNowBar();updateNow(chosen);wireAi();wireGsc();wireGaps(s.gaps,s,d);wireSideBySide(d.competitors);wirePub();wireSelf();
 document.getElementById('hf').addEventListener('submit',async function(e){e.preventDefault();var f=e.target,st=document.getElementById('hs'),b=f.querySelector('button');if(!f.consent.checked){st.textContent='Please tick the contact box.';return}b.disabled=true;
  try{var r=await fetch(API+'/hire'+Q,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name.value,email:f.email.value,company:f.company.value,phone:f.phone.value,message:f.message.value,consent:true})});var x=await r.json();if(!x.success)throw Error(x.error||'Not sent');f.outerHTML='<p><strong>Thank you — your request was received.</strong> You will get a reply by email.</p>'}catch(err){st.textContent=err.message;st.className='error';b.disabled=false}});
}
// While Google is researched, the AI check is offered first (it needs only the search term). Shown once, so a pasted
// answer is not wiped by the next poll.
function showAiFirst(d,again){if(!d.ai)return;var box=document.getElementById('aiFirst');
 if(!box){box=document.createElement('div');box.id='aiFirst';document.getElementById('out').appendChild(box)}else if(!again)return;
 box.innerHTML='<p class="note"><strong>Research (optional) — while Google is being researched:</strong> check the AI answers now. Your answers are kept with this check.</p>'+aiHtml(d.ai,d.automatic_ai_answers);wireAi()}
async function poll(n){try{var r=await fetch(API+Q,{cache:'no-store'});var d=await r.json();if(!d.success)throw Error(d.error||'Not found');
 if(d.status==='DONE'||d.status==='FAILED'){var t=document.getElementById('aiText'),e=document.getElementById('aiEngine'),keep=t&&t.value,eng=e&&e.value;render(d);
  if(keep){var t2=document.getElementById('aiText'),e2=document.getElementById('aiEngine');if(t2)t2.value=keep;if(e2&&eng)e2.value=eng}return}
 showAiFirst(d);}catch(e){document.getElementById('out').innerHTML='<h1>Result not available</h1><p>'+esc(e.message)+'</p>';return}
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
 <div class="card"><h2 style="margin-top:0">Run a check yourself</h2><p class="muted">The same form your visitors use, in owner mode: no limits, AI writing, customer questions, Search Console upload, pasted AI answers kept, and the option to research again. One form, so what you test is what visitors get.</p>
  <p><a class="btn" href="${esc(base)}">Open the check form (owner mode) →</a></p></div>
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
${aiStartScript()}
var API=${js(api)},H={'Content-Type':'application/json','X-Requested-With':'growth-free-admin'};
(function(){
 var form=document.getElementById('rf'),key='growthFreeAdminDraft:'+location.pathname;
 if(!form)return;
 var fields=['url','query','market','language'],saved={};
 try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
 fields.forEach(function(k){var el=form.elements[k];if(el&&saved[k]&&!el.value)el.value=String(saved[k]).slice(0,k==='url'?500:200)});
 var queryInput=form.elements.query;if(queryInput&&queryInput.value)queryInput.dispatchEvent(new Event('input',{bubbles:true}));
 function save(){var next={};fields.forEach(function(k){var el=form.elements[k];if(el)next[k]=el.value});try{localStorage.setItem(key,JSON.stringify(next))}catch(e){}}
 form.addEventListener('input',save);form.addEventListener('change',save);
 var submit=form.querySelector('button[type=submit],button:not([type])');
 if(submit){var reset=document.createElement('button');reset.type='button';reset.id='growthFreeAdminReset';reset.className='ghost';reset.textContent='Reset saved fields';reset.style.marginLeft='8px';
 submit.insertAdjacentElement('afterend',reset);reset.addEventListener('click',function(){
  fields.forEach(function(k){var el=form.elements[k];if(el)el.value=''});
  try{localStorage.removeItem(key)}catch(e){}
  var p=document.getElementById('aiStartPrompt');if(p)p.value='';
  var status=document.getElementById('rs');if(status)status.textContent='Saved fields cleared.';
 });}
})();
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
var rfForm=document.getElementById('rf');if(rfForm)rfForm.addEventListener('submit',async function(e){e.preventDefault();var f=e.target,st=document.getElementById('rs');st.textContent='Starting…';var d=await post('/admin/run',{url:f.url.value,query:f.query.value,market:f.market.value,language:f.language.value,fresh:f.fresh.checked,ai_answers:aiStartAnswers()});if(!d.success){st.textContent=d.error;return}location.href=d.result_url});
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

function registerFreeGrowth(app,pool,{config=freeGrowthConfig(),engine=runFreeGrowthResearch,engineDeps={},basePath='/free-growth',apiPath='/api/free-growth',fetchImpl=global.fetch,storage=store,sendEmail=null,rankHandoff=null}={}){
 // A check opened from the free rank tracker carries a signed handoff for one tracked keyword (src/rank-free/handoff.cjs).
 const attachRank=async(row,ref)=>{if(rankHandoff&&ref&&row&&row.public_id)await rankHandoff.attach(row.public_id,ref).catch(()=>{})};
 if(!config.enabled)return null;
 const queue=[];let running=0;
 const jobs=new Set();
 // No question typed: the customer question customers ask in Google for what the page offers (People also ask, related
 // searches; one Serper search). AI ideas only for approved access (cost). Nothing found: the research derives a working
 // phrase from the page, as before. The visitor sees which question was used and can run the check with another one.
 async function autoQuestion(job){
  try{
   const live=await (engineDeps.fetchLive||fetchPublicGrowthHtml)(job.url);const html=String(live&&live.html||'');
   const country=job.market&&job.market.countries&&job.market.countries[0]||null,lang=job.market&&job.market.language||((/<html\b[^>]*\blang=["']?([a-z]{2})/i.exec(html)||[])[1]||'en').toLowerCase();
   const out=await discoverCustomerQuestions({url:job.url,html,keyword:job.topic||'',gl:country?(country==='GB'?'uk':country.toLowerCase()):'us',hl:lang,
    ...(engineDeps.questionFetch?{fetchImpl:engineDeps.questionFetch}:{}),model:job.approved?(engineDeps.questionModel!==undefined?engineDeps.questionModel:require('../growth-task-meaning.cjs').geminiModel()):null});
   const best=(out.questions||[]).find(q=>q.text===out.best_question)||null;
   return {text:best?best.text:null,source:best?best.source:'NONE',label:best?best.label:null,searched_with:out.searched_with||null,
    others:(out.questions||[]).filter(q=>!best||q.text!==best.text).slice(0,6).map(q=>({text:q.text,label:q.label})),chosen_automatically:true,...(job.topic?{topic:job.topic}:{})};
  }catch(e){return {text:null,source:'UNAVAILABLE',label:null,others:[],chosen_automatically:true}}
 }
 function pump(){
  while(running<config.concurrency&&queue.length){
   const job=queue.shift();running++;
   const p=(async()=>{
    try{
     await storage.setStatus(pool,job.id,{status:'RUNNING'});
     const chosenQuestion=job.query?null:await autoQuestion(job);
     if(chosenQuestion&&chosenQuestion.text)job.query=chosenQuestion.text;
     // No customer question found for a rank tracker topic: the tracked keyword itself is researched.
     else if(job.topic){job.query=job.topic;if(chosenQuestion)chosenQuestion.text_fallback='TOPIC'}
     const out=await engine({url:job.url,query:job.query,market:job.market||null,gscRows:job.gscRows||[]},engineDeps);
     if(out.statusCode!==200||!out.report||out.report.success===false){
      await storage.setStatus(pool,job.id,{status:'FAILED',error_code:String(out.report&&out.report.code||'RESEARCH_FAILED').slice(0,80)});
      if(job.inviteId)await storage.refundInvite(pool,job.inviteId);
     }else{
      // Marks which research code made this result; the cache reuses only results of the running code.
      out.report.engine_version=engineVersion();
      if(chosenQuestion)out.report.customer_question=chosenQuestion;
      const summary=summarizeFreeGrowth(out.report,{url:job.url,query:job.query});
      if(job.approved){
       const provider=engineDeps.groundedAnswer||groundedGeminiAnswer;
       // A provider timeout or unavailable key must never turn a successful page check into FAILED.
       let auto;
       try{
        auto=await provider({query:job.query||out.report?.editorial_decision_gate?.focus_query,pageUrl:job.url,fetchImpl:engineDeps.answerFetch||global.fetch});
        if(auto.status==='SUCCESS'&&auto.parsed?.validation_status!=='invalid'){
         await storage.saveAiAnswer(pool,{checkId:job.id,engine:auto.engine,rawText:auto.raw,parsed:auto.parsed});
        }
       }catch(e){auto={status:'PROVIDER_UNAVAILABLE'};}
       out.report.automatic_ai_answers={gemini:{status:auto.status,source:auto.source||null,model:auto.model||null},note:'Only connected providers count as checked. Gemini Google Search grounding is not a Google AI Overview. Other engines are unchecked until their own answers are provided.'};
      }
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
 app.get(basePath,async(req,res)=>{
  // An unapproved public key must not look like a usable check when approval-only mode is enabled.
  // A valid handoff from the free rank tracker opens the form, also when approval is required or the domain has no key.
  if(rankHandoff&&req.query&&req.query.rt&&!sessionValid(req)){
   const rk=await rankHandoff.read(String(req.query.rt)).catch(()=>null);
   if(rk){const e=require('../rank-free/handoff.cjs').handoffEntry(config);res.set('Content-Security-Policy',"frame-ancestors 'none'");
    return res.set('Cache-Control','private, no-store').set('Referrer-Policy','no-referrer').type('html').send(formPage({...config,...e},apiPath,basePath,'',null,{available:!!config.adminKey,signedIn:false}))}
  }
  if(config.approvalRequired&&!sessionValid(req))return res.redirect(302,'https://contentscale.site/');
  const entry=findKey(config,req.query&&req.query.key,req);
  // The owner (signed in) always gets the form, also on a domain without an access key (the admin page links here).
  if(!entry&&sessionValid(req))return res.set('Cache-Control','private, no-store').set('Content-Security-Policy',"frame-ancestors 'none'").type('html').send(formPage(config,apiPath,basePath,'',null,{available:!!config.adminKey,signedIn:true}));
  if(!entry)return res.status(403).set('Cache-Control','no-store').set('Content-Security-Policy',"frame-ancestors 'none'").type('html').send(notActivated(config));
  // Where it may be embedded is decided by the key: only its listed sites (or anywhere if none are listed).
  res.set('Content-Security-Policy','frame-ancestors '+(entry.origins.length?"'self' "+entry.origins.join(' '):'*'));
  res.set('Cache-Control','private, no-store').type('html').send(formPage({...config,...entry},apiPath,basePath,req.query&&req.query.key?entry.key:'',null,{available:!!config.adminKey,signedIn:sessionValid(req)}));
 });
 app.get(basePath+'/r/:id',(req,res)=>res.set('Cache-Control','no-store').set('Referrer-Policy','no-referrer').type('html')
  .set('Content-Security-Policy','frame-ancestors '+(()=>{const o=[...new Set((config.accessKeys||[]).flatMap(k=>k.origins))];return (config.accessKeys||[]).some(k=>!k.origins.length)?'*':"'self' "+o.join(' ')})())
  .send(resultPage(config,apiPath,basePath,safeToken(req.params.id),safeToken(req.query.k))));

 // Customer questions for a page (form helper): one Google search through Serper and one AI call. Only with an active
 // access key (or the owner), and at most 10 per hour per visitor, so the free form cannot be used as a search API.
 const cqHits=new Map();
 app.post(apiPath+'/customer-questions',async(req,res)=>{
  const b=req.body||{};
  const owner=sessionValid(req)&&req.get&&req.get('x-requested-with')==='growth-free-admin';
  if(!owner){
    await storage.ensureTables(pool);
    const invitation=b.invite?await storage.getInvite(pool,b.invite):null;
    if(store.inviteStatus(invitation)!=='ACTIVE')return res.status(403).json({success:false,error:'An approved invitation is required for customer question discovery.'});
   }
  const ip=store.hashIp(req.ip,config.ipSalt),now=Date.now(),h=(cqHits.get(ip)||[]).filter(t=>now-t<3600000);
  if(!owner&&h.length>=10)return res.status(429).json({success:false,error:'Enough suggestions for now; try again in an hour or enter the search term yourself.'});
  h.push(now);cqHits.set(ip,h);if(cqHits.size>5000)cqHits.clear();
  // Customer questions come from Google for the keyword (owner 2026-11-10: "het moet de keyword zijn"). The page only
  // helps to understand what it offers: with a keyword and no (readable) page the questions are still found.
  const kw=clean(b.query,120),hasUrl=!!String(b.url||'').trim(),v=hasUrl?validatePublicUrl(b.url):{error:'NO_URL'};
  if(v.error&&!kw)return res.status(400).json({success:false,error:hasUrl?v.error:'Enter a keyword (search term) or the page address first.'});
  const entries=String(b.market||'').split(/[,;]+/).map(x=>x.trim()).filter(Boolean),country=validCountries(entries)[0]||null,lang=String(b.language||'').trim()?validLanguage(b.language):null;
  let html='';if(!v.error){try{html=String((await (engineDeps.fetchLive||fetchPublicGrowthHtml)(v.url))?.html||'')}catch(e){if(!kw)return res.status(503).json({success:false,error:'Your page could not be read publicly. Enter the search term yourself.'})}}
  const pageLang=((/<html\b[^>]*\blang=["']?([a-z]{2})/i.exec(html)||[])[1]||'').toLowerCase();
  const out=await discoverCustomerQuestions({url:v.error?'':v.url,html,keyword:kw,gl:country?(country==='GB'?'uk':country.toLowerCase()):'us',hl:lang||pageLang||'en',
   ...(engineDeps.questionFetch?{fetchImpl:engineDeps.questionFetch}:{}),model:engineDeps.questionModel!==undefined?engineDeps.questionModel:require('../growth-task-meaning.cjs').geminiModel()});
  res.set('Cache-Control','no-store').json({success:true,...out});
 });
 app.post(apiPath+'/checks',async(req,res)=>{
  try{
   const b=req.body||{};
   if(b.invite)return await startInviteCheck(req,res,b);
   // The owner, signed in with the admin key on this browser: no daily limits, AI writing as for the owner's checks.
   // Cookie-based, so it needs the custom header another website cannot send (CSRF), as every owner action.
   if(sessionValid(req)&&req.get&&req.get('x-requested-with')==='growth-free-admin'){
    const input=readInput(b,res);if(!input)return;
    await storage.ensureTables(pool);
    return await start(res,input,{accessLabel:'admin',marketingConsent:b.marketing_consent===true,fresh:b.fresh===true});
   }
   // From the free rank tracker with a valid handoff: access of its own (also when approval is required), own weekly limit.
   if(rankHandoff&&b.rank_ref){const rk=await rankHandoff.read(b.rank_ref).catch(()=>null);if(rk)return await startRankCheck(req,res,b,rk)}
   if(config.approvalRequired)return res.status(403).json({success:false,error:'Personal approval is required. Request access at https://contentscale.site/.'});
   const entry=findKey(config,b.key,req);
   if(!entry)return res.status(403).json({success:false,error:'This free check is not activated here'});
   const origin=req.get&&req.get('origin');
   if(origin&&entry.origins.length&&origin!==`${req.protocol}://${req.get('host')}`&&!entry.origins.includes(origin))
    return res.status(403).json({success:false,error:'This free check is not activated on this website'});
   const em=readEmails(String(b.email||'').slice(0,1100));if(em.error)return res.status(400).json({success:false,error:em.error});
   const email=em.email;
   if(b.consent!==true)return res.status(400).json({success:false,error:'Please accept the storage notice'});
   const v=validatePublicUrl(b.url);if(v.error)return res.status(400).json({success:false,error:v.error});
   // Empty: the check finds the customer question itself in Google (see autoQuestion); a typed question wins.
   const query=clean(b.query,120),topic=query?'':clean(b.topic,120);
   const market=readMarket(b,res);if(market===undefined)return;
   const aiAnswers=readAiAnswers(b,res);if(aiAnswers===undefined)return;
   const gsc=readGscFile(b,v.url,res);if(gsc===undefined)return;
   await storage.ensureTables(pool);
   const ipHash=store.hashIp(req.ip,config.ipSalt);
   // A verified Search Console export changes the research, so a stored result without it is not reused.
   // A topic from the rank tracker leads to its own customer question, so a stored result for the page is not reused.
   const cached=(gsc&&gsc.upload.status==='VERIFIED_FOR_PAGE')||topic?null:await storage.recentResult(pool,{url:v.url,query,market,engineVersion:engineVersion()});
   if(!cached){
    const u=await storage.usage(pool,{email,ipHash,accessLabel:entry.label});
    if(u.by_email>=entry.perEmail||u.by_ip>=config.perIp)
     return res.status(429).json({success:false,error:`The free limit is ${entry.perEmail} checks per day. Try again tomorrow, or ask for the paid service.`});
    if(u.by_key>=entry.daily||u.total>=config.daily)return res.status(429).json({success:false,error:'Today\'s free checks are used up. Please try again tomorrow.'});
   }
   const row=await storage.createCheck(pool,{email,emails:em.emails,ipHash,url:v.url,host:v.host,query,marketingConsent:b.marketing_consent===true,cached,accessLabel:entry.label,market});
   await saveStartAnswers(row,v.url,aiAnswers);
   if(gsc)await storage.saveGscUpload(pool,{checkId:row.id,fileName:gsc.fileName,upload:gsc.upload});
   await attachRank(row,b.rank_ref);
   if(!cached){queue.push({id:row.id,url:v.url,query,topic,market,gscRows:gscRowsOf(gsc,v.url)});pump()}
   res.status(202).json({success:true,id:row.public_id,key:row.access_key,status:row.status,result_url:resultUrl(row)});
  }catch(e){console.error('[free-growth] start failed',e.message);res.status(503).json({success:false,error:'The free check is temporarily unavailable'})}
 });

 // Target market(s) and language, as in the Tracker and the Pre-Write brief (optional; empty = derived from the page).
 function readMarket(b,res){
  const entries=String(b.market||'').split(/[,;]+/).map(x=>x.trim()).filter(Boolean);
  const countries=validCountries(entries),language=String(b.language||'').trim()?validLanguage(b.language):null;
  if(entries.length&&countries.length<entries.length){res.status(400).json({success:false,error:'Choose the market from the list, for example nl — Netherlands (several separated by commas).'});return undefined}
  if(String(b.language||'').trim()&&!language){res.status(400).json({success:false,error:'Choose the language from the list, for example Dutch.'});return undefined}
  return countries.length||language?{countries,language}:null;
 }
 // AI answers pasted before the start: at most one per AI system, checked like a paste on the result page.
 function readAiAnswers(b,res){
  const list=Array.isArray(b.ai_answers)?b.ai_answers.filter(x=>x&&String(x.text||'').trim()):[];
  const seen=new Set();
  for(const x of list){
   const engine=String(x.engine||''),text=String(x.text);
   if(!ai.ENGINE_IDS.has(engine)||seen.has(engine)){res.status(400).json({success:false,error:'Paste each AI answer at the AI system you used (one answer per system).'});return undefined}
   seen.add(engine);
   const label=(ai.ENGINES.find(e=>e.id===engine)||{}).label;
   if(text.length>ai.MAX_PASTE){res.status(413).json({success:false,error:label+': this answer is too long; paste only the answer and its sources'});return undefined}
   {const v=ai.validateGrowthAnswer(ai.parseAiAnswer(text,{}).answer,clean(b.query,120));if(v.status==='invalid'){res.status(400).json({success:false,error:label+': '+v.message});return undefined}}
   if(ai.otherPrompt(text)){res.status(400).json({success:false,error:label+': this is an answer to the company quick-scan prompt (company profile or QUESTION 1–4), not to the prompt for this search term. Copy the prompt shown here and paste that answer.'});return undefined}
  }
  if(list.length&&!clean(b.query,120)){res.status(400).json({success:false,error:'Enter the customer question first: your pasted AI answers are checked against it.'});return undefined}
  return list.map(x=>({engine:String(x.engine),text:String(x.text)}));
 }
 async function saveStartAnswers(row,url,answers){
  for(const x of answers||[])await storage.saveAiAnswer(pool,{checkId:row.id,engine:x.engine,rawText:x.text,parsed:ai.parseAiAnswer(x.text,{pageUrl:url})});
 }
 // Shared input checks for every way of starting a check.
 // Optional Search Console export ({name, content_base64}). null: none; undefined: refused (response sent).
 function readGscFile(b,url,res){
  const f=b&&b.gsc_file;if(!f||!f.content_base64)return null;
  if(String(f.content_base64).length>Math.ceil(gscExport.MAX_BYTES*4/3)+16){res.status(413).json({success:false,error:'The Search Console file is larger than 3 MB. Export only this page.'});return undefined}
  const upload=gscExport.readGscExport({fileName:clean(f.name,200),content:Buffer.from(String(f.content_base64),'base64'),pageUrl:url});
  if(upload.status==='INVALID'){res.status(400).json({success:false,error:'Search Console file: '+upload.message});return undefined}
  return {fileName:clean(f.name,200),upload};
 }
 const gscRowsOf=(gsc,url)=>gsc?gscExport.engineRows(gsc.upload,{pageUrl:url}):[];
 // The visitor's Search Console uploads for this check: the latest one is shown; all are kept for the 28-day comparison.
 async function gscFor(row){
  let list=[];try{list=await storage.listGscUploads(pool,row.id)}catch(e){console.warn('[free-growth] GSC uploads unavailable',String(e&&e.code||'unknown'))}
  const term=searchTermOf(row),comparison=reminders.compareUploads(list,row.published_on||null,term);
  if(!list.length)return {uploads:0,latest:null,comparison};
  const last=list[list.length-1];
  return {uploads:list.length,latest:{status:last.status,message:gscExport.MESSAGES[last.status]||'',file_name:last.file_name,uploaded_at:last.created_at,
   period:last.period_start?{start:last.period_start,end:last.period_end}:null,totals:last.totals,top_queries:(last.queries||[]).slice(0,10),
   search_term:term||null,search_term_row:gscExport.termInExport({queries:last.queries||[]},term),used_in_research:last.status==='VERIFIED_FOR_PAGE'&&!row.cached_from&&!!row.finished_at&&new Date(last.created_at).getTime()<=new Date(row.finished_at).getTime()},
   history:list.map(x=>({status:x.status,uploaded_at:x.created_at,period:x.period_start?{start:x.period_start,end:x.period_end}:null,totals:x.totals})),comparison};
 }
 function readInput(b,res){
  const em=readEmails(String(b.email||'').slice(0,1100));
  if(em.error){res.status(400).json({success:false,error:em.error});return null}
  const email=em.email;
  if(b.consent!==true){res.status(400).json({success:false,error:'Please accept the storage notice'});return null}
  const v=validatePublicUrl(b.url);if(v.error){res.status(400).json({success:false,error:v.error});return null}
  const market=readMarket(b,res);if(market===undefined)return null;
  const aiAnswers=readAiAnswers(b,res);if(aiAnswers===undefined)return null;
  const gsc=readGscFile(b,v.url,res);if(gsc===undefined)return null;
  const query=clean(b.query,120);
  return {email,emails:em.emails,url:v.url,host:v.host,query,topic:query?'':clean(b.topic,120),rankRef:String(b.rank_ref||'').slice(0,420),market,aiAnswers,gsc};
 }
 async function start(res,input,{ipHash=null,marketingConsent=false,accessLabel,inviteId=null,beforeRun=null,fresh=false}){
  // fresh: admin only, researches again even when a stored result exists.
  // A verified Search Console export changes the research, so a stored result without it is not reused.
  const withGsc=!!(input.gsc&&input.gsc.upload.status==='VERIFIED_FOR_PAGE');
  const cached=fresh||withGsc||input.topic?null:await storage.recentResult(pool,{url:input.url,query:input.query,market:input.market,engineVersion:engineVersion()});
  // A cached result costs nothing, so it never uses up an invitation.
  if(!cached&&beforeRun&&!(await beforeRun()))return;
  const row=await storage.createCheck(pool,{email:input.email,emails:input.emails,ipHash,url:input.url,host:input.host,query:input.query,marketingConsent,cached,accessLabel,inviteId:cached?null:inviteId,market:input.market});
  await saveStartAnswers(row,input.url,input.aiAnswers);
  if(input.gsc)await storage.saveGscUpload(pool,{checkId:row.id,fileName:input.gsc.fileName,upload:input.gsc.upload});
  await attachRank(row,input.rankRef);
  if(!cached){queue.push({id:row.id,url:input.url,query:input.query,topic:input.topic,market:input.market,inviteId:cached?null:inviteId,approved:accessLabel==='admin'||!!inviteId,gscRows:gscRowsOf(input.gsc,input.url)});pump()}
  res.status(202).json({success:true,id:row.public_id,key:row.access_key,status:row.status,result_url:resultUrl(row)});
 }
 // A check started from the free rank tracker: the tracker account is the access. The e-mail address of the tracker
 // account must be among the addresses (the result and the reminder go to it); its own weekly limit and the daily total.
 async function startRankCheck(req,res,b,rk){
  const input=readInput(b,res);if(!input)return;
  if(!input.emails.includes(String(rk.account.email).toLowerCase()))return res.status(403).json({success:false,error:'Use the e-mail address of your rank tracker ('+maskEmail(rk.account.email)+').'});
  await storage.ensureTables(pool);
  const a=await rankHandoff.allowance(rk);
  if(!a.ok)return res.status(429).json({success:false,error:'You used the '+a.limit+' free Growth checks from your rank tracker for this week. Try again in a few days.'});
  const ipHash=store.hashIp(req.ip,config.ipSalt),u=await storage.usage(pool,{email:input.email,ipHash,accessLabel:'rank-tracker'});
  if(u.total>=config.daily)return res.status(429).json({success:false,error:'Today\'s free checks are used up. Please try again tomorrow.'});
  return start(res,{...input,rankRef:String(b.rank_ref)},{ipHash,marketingConsent:b.marketing_consent===true,accessLabel:'rank-tracker'});
 }
 async function startInviteCheck(req,res,b){
  const input=readInput(b,res);if(!input)return;
  await storage.ensureTables(pool);
  const inv=await storage.getInvite(pool,b.invite),status=store.inviteStatus(inv);
  if(status!=='ACTIVE')return res.status(403).json({success:false,error:INVITE_TEXT[status]});
  if(inv.email_lock&&!input.emails.includes(inv.email_lock))
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
 // AI gap per check: the cited pages are read once per set of cited URLs.
 const aiGapFor0=aiGap.createAiGapCache({engines:ai.ENGINES,fetchHtml:engineDeps.fetchAiCited||engineDeps.fetchLive||fetchPublicGrowthHtml,
  model:()=>engineDeps.aiGapModel!==undefined?engineDeps.aiGapModel:require('../growth-task-meaning.cjs').geminiModel()});
 const aiGapFor=(row,answers,{wait=false}={})=>aiGapFor0({key:'free:'+row.id,answers,pageUrl:row.url,query:searchTermOf(row),wait});
 // Step 2 topics an AI-gap topic matches, so it can be added to the visitor's choice.
 function withStepTwo(gap,gaps){
  if(!gap||!(gap.missing_topics||[]).length)return gap;
  const w=t=>new Set((String(t).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]).map(x=>x.slice(0,5)));
  const items=((gaps&&gaps.items)||[]).map(it=>({id:String(it.id),sets:[it.title,...(it.examples||[]).map(e=>e.heading)].filter(Boolean).map(w)}));
  return {...gap,missing_topics:gap.missing_topics.map(t=>{const tw=w(t.topic);if(!tw.size)return t;
   const hit=items.find(it=>it.sets.some(s=>[...tw].filter(x=>s.has(x)).length/tw.size>=0.6));return hit?{...t,item_id:hit.id}:t})};
 }
 async function aiFor(row,{waitGap=false}={}){
  // The AI check needs only the search term: with an entered term it is available at once, before the Google part.
  const term=searchTermOf(row);
  if(row.status==='FAILED'||!term)return null;
  let answers=[];
  try{answers=await storage.listAiAnswers(pool,row.id)}catch(e){console.warn('[free-growth] AI answers unavailable',String(e&&e.code||'unknown'))}
  const summary=ai.summarizeAiAnswers(answers,{pageUrl:row.url,googleUrls:googleUrlsOf(row),query:term});
  const gap=summary.verifiable>summary.cited_by?withStepTwo(await aiGapFor(row,answers,{wait:waitGap}),row.summary&&row.summary.gaps):null;
  return {search_term:term,prompt:ai.directPrompt(term),engines:ai.ENGINES,max_paste:ai.MAX_PASTE,answers,summary,gap};
 }
 // With an uploaded Search Console export, the "not used" limitation says what was actually used.
 function withGscLimits(summary,gscPart){
  if(!summary||!gscPart||!gscPart.latest)return summary;
  const L=gscPart.latest,period=L.period?' ('+L.period.start+' – '+L.period.end+')':'';
  const line=L.used_in_research?'Your Search Console export, filtered on exactly this page'+period+', was used in the research.':L.status==='VERIFIED_FOR_PAGE'?'The latest Search Console export is verified for this page'+period+' but was not used in the original research; start a new check with this export to research its queries.':'A Search Console export was uploaded'+period+', but it is not filtered on exactly this page, so it was shown and not used as evidence.';
  return {...summary,limitations:[...(summary.limitations||[]).filter(x=>!/^Google Search Console was not used/.test(x)),line]};
 }
 const writerReason=explainWriterFailure;
 // What the competitor pages have (owner 2026-11-08: "the point of Growth is seeing what others have that I don't"):
 // every Google result, whether it could be read, and the headings of the pages that were read, each marked as on your
 // page or not. Shown on every result, also when the research is blocked: an observation, not advice.
 function competitorsOf(report,gaps){
  if(!report)return null;
  const sd=report.search_discovery||{},ov=report.competitor_overview||{};
  const leads=(sd.leads||[]).slice(0,10),log=new Map((sd.competitor_fetch_log||[]).map(x=>[x.url,x])),read=new Map((ov.ranking_pages||[]).map(x=>[x.url,x]));
  const own=report.page_content&&report.page_content.headings||{},ownHeadings=[...(own.h1||[]),...(own.h2||[]),...(own.h3||[])].map(String);
  const words=t=>new Set((String(t).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(w=>!/^(the|and|for|with|your|you|how|what|why|are|our|van|het|een|voor|met|wat|hoe|die|dat)$/.test(w)).map(w=>w.slice(0,5)));
  const ownSets=ownHeadings.map(words);
  // The gap list decided per heading (better than words alone); otherwise compare heading words with your headings.
  const byHeading=new Map();for(const it of (gaps&&gaps.items)||[])for(const e of it.examples||[])if(e.heading)byHeading.set(String(e.heading).toLowerCase(),it.status);
  // "Not compared" (a blocked research skips the comparison) falls back to comparing the heading words with your headings.
  const mark=h=>{const st=byHeading.get(String(h).toLowerCase());if(st&&!/not compared|not matched/i.test(st))return {status:/not on your page|not found/i.test(st)?'MISSING':/partly/i.test(st)?'PARTLY':'ON_YOUR_PAGE',label:st};
   const w=words(h);if(!w.size)return {status:'NOT_COMPARED',label:'Not compared'};const best=Math.max(0,...ownSets.map(o=>[...w].filter(x=>o.has(x)).length/w.size));
   return best>=0.6?{status:'ON_YOUR_PAGE',label:'Similar heading on your page'}:{status:'MISSING',label:'Not on your page (heading words)'}};
  const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return u}};
  const pages=leads.map(l=>{const f=log.get(l.url),r=read.get(l.url);
   return {position:l.serp_position||null,url:l.url,site:host(l.url),title:l.title||null,
    read:!!r,status:r?'Read':f&&f.outcome==='NOT_READABLE'?'Opened, but too little readable text':f&&f.outcome==='FETCH_FAILED'?'Could not be opened'+(f.explanation?' ('+String(f.explanation).slice(0,80)+')':''):'Not read',
    headings:r?(r.content_headings||[]).slice(0,15).map(h=>({text:String(h).slice(0,160),...mark(h)})):[]}});
  // Side by side, as in Tracker Growth: what a competitor section says next to your closest section, and what to do. A pair
  // whose heading is one of the topics in step 2 can be added to the visitor's choice from here.
  const itemOf=new Map();for(const it of (gaps&&gaps.items)||[])for(const e of it.examples||[])if(e.heading)itemOf.set(String(e.heading).toLowerCase(),String(it.id));
  const pairs=((report.practical_growth_plan&&report.practical_growth_plan.competitors&&report.practical_growth_plan.competitors.side_by_side)||[]).slice(0,8).map(x=>({
   competitor_section:String(x.competitor_section||'').slice(0,200),competitor_excerpt:String(x.competitor_excerpt||'').slice(0,700),competitor_url:x.competitor_url||null,site:x.competitor_url?host(x.competitor_url):null,
   your_section:x.tracked_page_section?String(x.tracked_page_section).slice(0,200):null,your_excerpt:x.tracked_page_excerpt?String(x.tracked_page_excerpt).slice(0,500):null,
   interpretation:x.interpretation?String(x.interpretation).slice(0,300):null,action:x.editorial_action?String(x.editorial_action).slice(0,300):null,
   item_id:itemOf.get(String(x.competitor_section||'').toLowerCase())||null})).filter(x=>x.competitor_section&&x.competitor_excerpt);
  return {pages,side_by_side:pairs,missing:pages.reduce((n,p)=>n+p.headings.filter(h=>h.status==='MISSING').length,0),your_headings:ownHeadings.slice(0,20)};
 }
 // Why AI cannot write, in plain words (also for checks stored before this text existed): the research blocker of the
 // report, as the visitor reads it elsewhere on the result, instead of the internal code.
 function withPlainEvidence(summary,row){
  const ev=summary&&summary.gaps&&summary.gaps.evidence;if(!ev||ev.status!=='INSUFFICIENT_EVIDENCE')return summary;
  const code=String(row.report&&row.report.editorial_decision_gate&&row.report.editorial_decision_gate.blocker_code||'').toUpperCase();
  const plain=/data blocked/i.test(ev.reason||'')&&BLOCKER_TEXT[code]?BLOCKER_TEXT[code]:ev.reason;
  return {...summary,gaps:{...summary.gaps,evidence:{...ev,plain_reason:plain}}};
 }
 // Once AI answers are pasted, the "AI not checked" limitation is replaced by the AI caveat.
 function withAiLimits(summary,aiPart){
  if(!summary||!aiPart||!aiPart.summary.checked)return summary;
  return {...summary,limitations:[...summary.limitations.filter(x=>!/AI answers .* were not checked/.test(x)),aiPart.summary.caveat]};
 }
 // A valid owner session unlocks old visitor results without modifying their ownership or public permissions.
 // Approved invitations receive the complete Free Growth writing workflow, even when ordinary public writing is admin-only.
  // 'off' remains an emergency provider-disable switch; it cannot be bypassed with an invite.
  const ordinaryWritingAllowed=row=>config.writing==='all'||(config.writing!=='off'&&(row.access_label==='admin'||!!row.invite_id));
 const writingAllowed=(row,req)=>ordinaryWritingAllowed(row)||(config.writing!=='off'&&sessionValid(req));
 const writingInfo=(row,req)=>({allowed:writingAllowed(row,req),owner_unlocked:!!config.adminKey&&sessionValid(req),
  owner_login_available:!!config.adminKey&&config.writing!=='off',
  remaining:Math.max(0,(config.writeLimit||3)-Number(row.write_count||0)),last:withStyle(viewOf(row.written))});
 app.get(apiPath+'/checks/:id',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  const aiPart=await aiFor(row),gscPart=await gscFor(row);
  res.set('Cache-Control','no-store').json({success:true,status:row.status,url:row.url,query:row.query,decision:row.decision,gsc:gscPart,
   ai:aiPart?{search_term:aiPart.search_term,prompt:aiPart.prompt,engines:aiPart.engines,max_paste:aiPart.max_paste,summary:aiPart.summary,gap:aiPart.gap}:null,
    automatic_ai_answers:row.report?.automatic_ai_answers||null,
   customer_question:row.report&&row.report.customer_question||null,competitors:competitorsOf(row.report,row.summary&&row.summary.gaps),
   summary:withPlainEvidence(withGscLimits(withAiLimits(row.summary,aiPart),gscPart),row)||null,cached:!!row.cached_from,error_code:row.error_code||null,
   selected_item_ids:Array.isArray(row.selected_item_ids)?row.selected_item_ids:[],writing:row.status==='DONE'?writingInfo(row,req):null,publication:row.status==='DONE'?publicationOf(row):null,
   offer:offerOf((config.accessKeys||[]).find(k=>k.label===row.access_label)||config),
   new_check_url:(()=>{if(row.access_label==='admin')return basePath+'/admin';
    const k=(config.accessKeys||[]).find(x=>x.label===row.access_label);
    if(!k)return null;
    const host=String(req.hostname||'').toLowerCase().replace(/^www\./,'');
    return k.hosts.includes(host)?basePath:`${basePath}?key=${encodeURIComponent(k.key)}`;})(),
   error_text:row.status==='FAILED'?(FAIL_TEXT[row.error_code]||'The check could not finish. Please try again later.'):null});
 });
 // Research-scoped selection, persisted independently of the browser.
 app.post(apiPath+'/checks/:id/selection',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  if(row.status!=='DONE')return res.status(409).json({success:false,error:'Research has not finished'});
  const list=Array.isArray(req.body&&req.body.item_ids)?req.body.item_ids:null;
  if(!list||list.length>200||list.some(x=>typeof x!=='string'))return res.status(400).json({success:false,error:'Invalid selection'});
  const allowed=new Set((row.summary?.gaps?.items||[]).map(x=>String(x.id)));
  if(list.some(x=>!allowed.has(x)))return res.status(400).json({success:false,error:'Selection contains an item outside this report'});
  try{const ids=[...new Set(list)];await storage.saveSelection(pool,{checkId:row.id,itemIds:ids});res.json({success:true,selected_item_ids:ids})}
  catch(e){res.status(503).json({success:false,error:'Could not save the selection'})}
 });
 app.get(apiPath+'/checks/:id/report.json',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  if(row.status!=='DONE')return res.status(409).json({success:false,error:'The check has not finished'});
  const aiPart=await aiFor(row),gscPart=await gscFor(row);
  res.set('Cache-Control','no-store').set('Content-Disposition',`attachment; filename="growth-check-${row.public_id}.json"`)
   .json({generated_by:config.brand+' free Growth check',url:row.url,search_term:row.query||null,checked_at:row.finished_at,
    disclaimer:'Research data only. No ranking or traffic increase is promised. '+(gscPart.latest?(gscPart.latest.used_in_research?'A Search Console export verified for this exact page was used.':gscPart.latest.status==='VERIFIED_FOR_PAGE'?'The latest page-verified Search Console export was not used in the original research.':'A Search Console export was uploaded but is not verified for this exact page; it was not used as evidence.'):'Google Search Console data was not used.'),
    search_console:gscPart,
    selected_item_ids:Array.isArray(row.selected_item_ids)?row.selected_item_ids:[],summary:withGscLimits(withAiLimits(row.summary,aiPart),gscPart),
    ai_answers:aiPart?{search_term:aiPart.search_term,prompt:aiPart.prompt,summary:aiPart.summary,
     answers:aiPart.answers.map(a=>({engine:a.engine,pasted_at:a.created_at,parsed:a.parsed,raw_text:a.raw_text}))}:null,
    report:row.report});
 });
 // Optional Search Console export after the result (for example a newer period, or for the measurement after publication).
 // Stored with this check only; the research is not run again.
 app.post(apiPath+'/checks/:id/gsc',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  try{
   const gsc=readGscFile(req.body||{},row.url,res);if(gsc===undefined)return;
   if(!gsc)return res.status(400).json({success:false,error:'Choose the Search Console export (ZIP or CSV) first.'});
   await storage.saveGscUpload(pool,{checkId:row.id,fileName:gsc.fileName,upload:gsc.upload});
   res.json({success:true,gsc:await gscFor(row)});
  }catch(e){console.error('[free-growth] GSC upload failed',e.message);res.status(503).json({success:false,error:'The Search Console file could not be saved. Please try again.'})}
 });
 // Optional: concepts only for the items the visitor selected (never automatic). The page is read again, publicly; the
 // text is checked against it and failing sentences are flagged. Nothing is published or stored on the visitor's site.
 // Concepts with an opening about who observes the topic, or team/editorial-process advice: marked, so the result page
 // ticks them for a new AI round by itself (owner 2026-11-09: the AI must fix these, not the visitor).
 const withStyle=v=>v&&{...v,sections:(v.sections||[]).map(x=>({...x,style_issues:styleIssues({sections:[{h2:x.h2,paragraphs:x.paragraphs||[]}]},'').map(i=>({sentence:i.sentence,problem:i.problem}))}))};
 app.post(apiPath+'/checks/:id/write',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  if(row.status!=='DONE')return res.status(409).json({success:false,error:'The check has not finished'});
  if(!writingAllowed(row,req))return res.status(403).json({success:false,error:'Writing is not available for this check. Sign in as the owner, or download the editor brief.'});
  // Cookie-based privileges require a non-simple same-origin header; ordinary visitor access does not.
  if(!ordinaryWritingAllowed(row)&&sessionValid(req)&&req.get('x-requested-with')!=='growth-free-admin')
   return res.status(403).json({success:false,error:'Owner request confirmation required.'});
  if(Number(row.write_count||0)>=(config.writeLimit||3))return res.status(429).json({success:false,error:'The writing limit for this check is reached. Download the editor brief instead.'});
  // A daily cap on AI writing for visitors (GROWTH_FREE_WRITES_PER_DAY): the owner's checks do not count and are not capped.
  if(row.access_label!=='admin'&&typeof storage.writesToday==='function'){const today=await storage.writesToday(pool).catch(()=>0);
   if(today>=(config.writesPerDay||40))return res.status(429).json({success:false,error:'Today\'s AI writing for free checks is used up. Download the editor brief, or try again tomorrow.'})}
  const ids=Array.isArray(req.body&&req.body.item_ids)?[...new Set(req.body.item_ids.map(String))].slice(0,200):[];
  const items=((row.summary&&row.summary.gaps&&row.summary.gaps.items)||[]).filter(x=>ids.includes(String(x.id)));
  if(!items.length)return res.status(400).json({success:false,error:'Select at least one topic or question first.'});
  if(!items.some(x=>x.writable))return res.status(400).json({success:false,error:'Page elements are added by the editor; select a topic or question to write.'});
  // One outcome: a check without enough evidence proposes nothing, so nothing is written from it either.
  if(row.summary?.gaps?.evidence?.status==='INSUFFICIENT_EVIDENCE')return res.status(409).json({success:false,error:'Not enough evidence in this check to write: '+row.summary.gaps.evidence.reason+' Download the editor brief instead.'});
  let token=null;
  try{
   const live=await (engineDeps.fetchLive||fetchPublicGrowthHtml)(row.url);
   const html=String(live&&live.html||'');
   const researched=row.summary&&row.summary.gaps&&row.summary.gaps.source_fingerprint;
   // The text fingerprint changes on pages with live parts (counters, latest items, dates), so on a homepage it said "changed"
   // every time. For writing what matters is the structure the sections are placed in: the H1 and H2 headings researched.
   // Same headings: writing goes on (the concepts are checked against the live page anyway). Changed headings: say which.
   if(researched&&pageFingerprint(html)!==researched){
    const g0=row.summary&&row.summary.gaps||{},hs=headingsStillPresent((g0.research&&g0.research.source_headings)||(row.report&&row.report.page_content&&row.report.page_content.headings),html);
    if(!hs.ok)return res.status(409).json({success:false,code:hs.known?'PAGE_HEADINGS_CHANGED':'PAGE_CHANGED',error:hs.known?headingsMessage(hs.missing).replace('the research','this check').replace('Run the research again','Run a new check'):'Your page changed since this check. Run a new check so the advice matches the page'});
   }

   // One run at a time per check: a parallel or repeated click gets "in progress", never a second AI call.
   if(typeof storage.claimWriting==='function'){token=await storage.claimWriting(pool,{checkId:row.id});
    if(!token)return res.status(409).json({success:false,error:'Concepts for this check are being written right now. Wait a moment and reload.'})}
   // What is written already is read AFTER the claim, so a run that just finished is never written again.
   const fresh=token?(await storage.getCheck(pool,req.params.id,req.query.k))||row:row;
   const doneBefore=(fresh.written&&fresh.written.done_item_ids)||[];
   // The whole selection is kept: this run writes the next four not written yet; the rest stays for the next run.
   const plan=planBatch(items,req.body&&req.body.rewrite===true?[]:doneBefore);
   if(!plan.batch.length){if(token)await storage.releaseWriting(pool,{checkId:row.id,token}).catch(()=>{});token=null;
    return res.status(409).json({success:false,error:'Every selected item has been written already. Select other items, or download the editor brief.'})}
   const write=engineDeps.generateDraft||generateGrowthEditorDraft;
   const focusQuery=row.query||(row.summary&&row.summary.checked&&row.summary.checked.search_term)||'';
   const gaps=row.summary&&row.summary.gaps||{};
   const written=await writeForSelection({items:plan.batch,targetUrl:row.url,focusQuery,research:gaps.research||null,sourceFingerprint:gaps.source_fingerprint||null,
    generate:async ctx=>({...(await write({sourceHtml:html,pageUrl:row.url,focusQuery,readerTask:ctx.reader_task,researchObservations:ctx.observations,fallbackFlagged:true})),source_text:sourceFacts(html).text})});
   // The writer returned no text at all (unavailable, timeout, nothing usable): this is not a used round. Nothing is stored
   // or counted, and the visitor sees the real reason instead of "could not be completed with the available runs".
   if(!(written.sections||[]).length&&written.status==='NOT_WRITTEN'){
    if(token&&typeof storage.releaseWriting==='function')await storage.releaseWriting(pool,{checkId:row.id,token}).catch(()=>{});token=null;
    console.warn('[free-growth] writer returned no text',String(written.writer_status||'').slice(0,60),JSON.stringify(written.provider_error||null).slice(0,300));
    return res.status(502).json({success:false,code:'WRITER_NO_TEXT',writer_status:written.writer_status||null,
     reason:writerReason(written),error:'AI could not write the text: '+writerReason(written)+' No writing round was used.'});
   }
   const done=(written.sections||[]).map(s=>s.item_id);
   const pending=[...plan.batch.filter(x=>!done.includes(x.id)),...plan.pending].map(x=>({item_id:x.id,title:x.title}));
   written.pending=pending;
   // Every run is kept (with its dossier); the earlier runs' concepts stay available after reload.
   const doc=mergeWritten(fresh.written,written);
   const counted=await storage.recordWriting(pool,{checkId:row.id,written:doc,limit:config.writeLimit||3,token});
   const mine=token;token=null;
   if(counted&&counted.superseded)return res.status(409).json({success:false,stored:false,sections:written.sections||[],
    error:'This writing run took too long and another run took over, so this text was not stored. It is shown here so it is not lost.'});
   if(!counted){if(mine&&typeof storage.releaseWriting==='function')await storage.releaseWriting(pool,{checkId:row.id,token:mine}).catch(()=>{});
    return res.status(429).json({success:false,error:'The writing limit for this check is reached.'})}
   res.set('Cache-Control','no-store').json({success:true,...written,done_item_ids:doc.done_item_ids,all_written:withStyle(viewOf(doc)),stored:true,
    remaining:Math.max(0,(config.writeLimit||3)-counted.write_count),published:false});
  }catch(e){console.error('[free-growth] writing failed',String(e.code||e.message).slice(0,80));
   if(token&&typeof storage.releaseWriting==='function')await storage.releaseWriting(pool,{checkId:row.id,token}).catch(()=>{});
   res.status(503).json({success:false,error:'Writing is not available right now. Your selection works with the editor brief.'})}
 });
 // Measurement after publication: the date the change went live, one e-mail about four weeks later, unsubscribe.
 const publicBase=()=>String(config.publicUrl||process.env.GROWTH_FREE_PUBLIC_URL||process.env.PUBLIC_APP_URL||'https://app.contentscale.site').replace(/\/+$/,'');
 // Links in the e-mails use the domain the visitor saved the date on, when it is a domain of this app (the hosts of the
 // access keys, or the public URL): ten domains need no extra setting. Any other Host header falls back to the public URL.
 const knownHosts=()=>new Set([...(config.accessKeys||[]).flatMap(k=>k.hosts||[]),(()=>{try{return new URL(publicBase()).hostname.replace(/^www\./,'')}catch(e){return ''}})()].filter(Boolean));
 const baseFor=req=>{const h=String(req.hostname||'').toLowerCase().replace(/^www\./,'');return h&&knownHosts().has(h)?'https://'+String(req.hostname).toLowerCase():null};
 const baseOf=row=>row&&row.reminder_base||publicBase();
 const links={result:row=>baseOf(row)+resultUrl(row),stop:(t,row)=>baseOf(row)+basePath+'/stop/'+encodeURIComponent(t||'')};
 const send=sendEmail||reminders.brevo(fetchImpl);
 const emailConfigured=()=>!!sendEmail||!!process.env.BREVO_API_KEY;
 const publicationOf=row=>({published_on:row.published_on||null,reminder_due_at:row.reminder_due_at||null,reminder_sent_at:row.reminder_sent_at||null,
  stopped:!!row.reminder_opt_out_at,email_hint:(Array.isArray(row.emails)&&row.emails.length?row.emails:[row.email]).map(maskEmail).join(', '),email_configured:emailConfigured(),
  windows:row.published_on?reminders.windowsOf(row.published_on):null});
 app.post(apiPath+'/checks/:id/publication',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  if(row.status!=='DONE')return res.status(409).json({success:false,error:'The check has not finished'});
  if(typeof storage.setPublication!=='function')return res.status(503).json({success:false,error:'Temporarily unavailable'});
  const b=req.body||{};
  if(b.clear===true){await storage.setPublication(pool,{checkId:row.id,publishedOn:null,dueAt:null});
   if(rankHandoff)await rankHandoff.published(row.public_id,null).catch(()=>{});
   const fresh=await storage.getCheck(pool,req.params.id,req.query.k);return res.json({success:true,publication:publicationOf(fresh||row)})}
  const d=reminders.readPublishedOn(b.published_on);if(d.error)return res.status(400).json({success:false,error:d.error});
  const remind=b.remind!==false;
  try{
   const saved=await storage.setPublication(pool,{checkId:row.id,publishedOn:d.value,dueAt:remind?reminders.dueAt(d.value):null,base:baseFor(req)});
   // Started from the rank tracker: the tracked keyword is marked "changed" there with its position on this day.
   if(rankHandoff)await rankHandoff.published(row.public_id,d.value).catch(e=>console.warn('[free-growth] rank tracker link failed',e&&e.message));
   let confirmation=remind?(emailConfigured()?'NOT_ACCEPTED':'EMAIL_NOT_CONFIGURED'):'NO_REMINDER';
   const fresh=await storage.getCheck(pool,req.params.id,req.query.k)||row;
   if(remind&&emailConfigured()){
    const lang=reminders.languageOf(fresh);
    const m=await localizeMail(reminders.confirmationMessage({url:row.url,publishedOn:d.value,stopLink:links.stop(saved.reminder_token,saved),lang:reminders.T[lang]?lang:'en'}),lang);
    if(await Promise.resolve(send({to:reminders.recipientsOf({...saved,access_label:row.access_label,invite_id:row.invite_id}),subject:m.subject,html:m.html})).catch(()=>false))confirmation='SENT'}
   res.set('Cache-Control','no-store').json({success:true,publication:publicationOf(fresh),confirmation,gsc:await gscFor(fresh)});
  }catch(e){console.error('[free-growth] publication failed',e.message);res.status(503).json({success:false,error:'The date could not be saved. Please try again.'})}
 });
 const localizeMail=(mail,lang)=>require('../growth-measurement-reminders.cjs').localize(mail,lang,{model:reminders.modelFor(config.mailModel)});
 app.get(basePath+'/stop/:token',async(req,res)=>{
  let n=0;try{await storage.ensureTables(pool);n=typeof storage.optOutReminder==='function'?await storage.optOutReminder(pool,req.params.token):0}catch(e){}
  res.set('Cache-Control','no-store').set('Referrer-Policy','no-referrer').type('html').send(page(n?'Reminder stopped':'Link not valid',
   n?'<div class="card"><h1>Reminder stopped</h1><p>You will not get the e-mail about this check. Your result stays available with its link.</p></div>':'<div class="card"><h1>This link is not valid</h1><p>The reminder may already have been stopped, or the check was deleted.</p></div>',config));
 });
 // Hourly in the running app; off without an e-mail key, with GROWTH_FREE_REMINDERS=0, or in tests (they call it directly).
 const sendDue=(o={})=>reminders.sendDueFreeReminders(pool,storage,{send,links,model:config.mailModel,...o});
 if(config.reminders!==false&&!sendEmail&&process.env.BREVO_API_KEY&&process.env.GROWTH_FREE_REMINDERS!=='0'&&process.env.NODE_ENV!=='test'){
  const tick=()=>storage.ensureTables(pool).then(()=>sendDue()).then(r=>{if(r.sent||r.failed)console.log('[free-growth] reminders',JSON.stringify(r))}).catch(e=>console.warn('[free-growth] reminders',String(e.code||e.message).slice(0,80)));
  const t=setInterval(tick,3600000);if(t.unref)t.unref();const first=setTimeout(tick,90000);if(first.unref)first.unref();
 }
 // CMS package (the same ZIP as the Tracker): step 1 reads the original page publicly; the download refuses the package
 // when the page changed in between, when a flagged sentence is still in the text, or when the editor did not approve.
 async function readOwnPage(row){
  const live=await (engineDeps.fetchLive||fetchPublicGrowthHtml)(row.url);
  return String(live&&live.html||'');
 }
 // Title and description in the first person: AI rewrites them as the service (checked; see suggestServiceMeta).
 const metaUses=new Map();
 app.post(apiPath+'/checks/:id/meta-suggest',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  if(row.status!=='DONE')return res.status(409).json({success:false,error:'The check has not finished'});
  const b=req.body||{};
  // At most 5 AI rewrites per check (each is an AI call); the check without AI stays free.
  if(b.check_only!==true){const n=(metaUses.get(row.id)||0)+1;if(n>5)return res.status(429).json({success:false,status:'LIMIT',error:'The AI rewrite limit for this check is reached; change the title and description yourself.'});metaUses.set(row.id,n);if(metaUses.size>20000)metaUses.clear()}
  // check_only: which field says "I"/"my", without AI (nothing is rewritten unless the visitor asks).
  if(b.check_only===true)return res.set('Cache-Control','no-store').json({success:true,status:'CHECKED',voice:cmsPackage.voiceOf({title:clean(b.seo_title,200),meta:clean(b.meta_description,400)})});
  const model=engineDeps.metaModel!==undefined?engineDeps.metaModel:require('../growth-task-meaning.cjs').geminiModel();
  const out=await cmsPackage.suggestServiceMeta({title:clean(b.seo_title,200),meta:clean(b.meta_description,400),language:(row.market&&row.market.language)||'en',url:row.url,model});
  res.set('Cache-Control','no-store').json({success:out.status==='SUGGESTED'||out.status==='NOT_NEEDED',...out});
 });
 // Weak openings and team/editorial-process advice in the package text: AI replaces only those sentences (checked; see
 // src/growth-style-fix.cjs). No writing round is used; at most 5 calls per check.
 const styleUses=new Map(),styleCache=new Map();
 app.post(apiPath+'/checks/:id/fix-style',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  if(row.status!=='DONE')return res.status(409).json({success:false,error:'The check has not finished'});
  const b=req.body||{},sections=(Array.isArray(b.sections)?b.sections:[]).slice(0,12).map(x=>({id:clean(x&&x.id,80),h2:clean(x&&x.h2,200),text:String(x&&x.text||'').slice(0,20000),flags:(Array.isArray(x&&x.flags)?x.flags:[]).slice(0,8).map(f=>({sentence:clean(f&&f.sentence,400),reason:clean(f&&f.reason,240)}))})).filter(x=>x.id&&x.text);
  let html='';try{html=await readOwnPage(row)}catch(e){}
  const pageText=html?sourceFacts(html).text:'';
  // Sentences this page already sent to AI (repaired or not) are not sent again: a redraw of the editor costs no call.
  const skip=new Set((Array.isArray(b.skip)?b.skip:[]).slice(0,100).map(x=>clean(x,500)));
  const problems=styleFix.styleProblems(sections,pageText).filter(p=>!skip.has(p.id+'|'+p.sentence));
  // Repairs already made for this check (also after a reload) come from memory: no new AI call, no use counted.
  const key=p=>row.id+'|'+p.id+'|'+p.sentence,known=problems.filter(p=>styleCache.has(key(p))),fresh=problems.filter(p=>!styleCache.has(key(p)));
  const cachedFixes=known.map(p=>styleCache.get(key(p))).filter(Boolean);
  if(!fresh.length)return res.set('Cache-Control','no-store').json({success:true,status:problems.length?(cachedFixes.length?'FIXED':'NOT_FIXED'):'NOT_NEEDED',fixes:cachedFixes,problems});
  const n=(styleUses.get(row.id)||0)+1;if(n>5)return res.status(429).json({success:false,status:'LIMIT',problems,error:'The automatic sentence repair limit for this check is reached; change the marked sentences yourself.'});
  styleUses.set(row.id,n);if(styleUses.size>20000)styleUses.clear();
  const model=engineDeps.styleModel!==undefined?engineDeps.styleModel:require('../growth-task-meaning.cjs').geminiModel();
  const freshKeys=new Set(fresh.map(p=>p.id+'|'+p.sentence));
  const out=await styleFix.fixStyleSentences({sections,pageText,language:(row.market&&row.market.language)||'en',model,skip:new Set([...skip,...known.map(p=>p.id+'|'+p.sentence)])});
  // Only a real answer is remembered (an unavailable AI may answer next time).
  if(out.status==='FIXED'||out.status==='NOT_FIXED'){for(const p of out.problems||[])if(freshKeys.has(p.id+'|'+p.sentence))styleCache.set(key(p),(out.fixes||[]).find(f=>f.id===p.id&&f.before===p.sentence)||null);if(styleCache.size>50000)styleCache.clear()}
  // One line per repair call, so a repair that did not happen can be traced (never the text itself).
  console.log('[free-growth] fix-style',out.status,'problems',(out.problems||[]).length,'fixed',(out.fixes||[]).length,'refused',(out.refused||[]).map(r=>r.problem+':'+(r.why||'')).join(',').slice(0,300),out.ai_error||'');
  res.set('Cache-Control','no-store').json({success:true,...out,fixes:[...cachedFixes,...(out.fixes||[])],problems});
 });
 app.get(apiPath+'/checks/:id/package-source',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  if(row.status!=='DONE')return res.status(409).json({success:false,error:'The check has not finished'});
  try{const html=await readOwnPage(row);if(!html)throw Error('empty');
   const wv=viewOf(row.written),sectionsText=((wv&&wv.sections)||[]).map(x=>(x.h2||'')+' '+(x.paragraphs||[]).join(' ')).join(' ').slice(0,20000);
   const src=cmsPackage.pageSource(html,{url:row.url,sectionsText,focus:searchTermOf(row)||''});res.set('Cache-Control','no-store').json({success:true,source:src,voice:cmsPackage.voiceOf({title:src.title,meta:src.meta_description}),cms:cmsPackage.CMS})}
  catch(e){res.status(503).json({success:false,error:'Your page could not be read right now. Try again in a moment.'})}
 });
 app.post(apiPath+'/checks/:id/package',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  if(row.status!=='DONE')return res.status(409).json({success:false,error:'The check has not finished'});
  const b=req.body||{};
  let html;try{html=await readOwnPage(row)}catch(e){html=''}
  if(!html)return res.status(503).json({success:false,ready:false,messages:[cmsPackage.PLAIN.ORIGINAL_PAGE_SNAPSHOT_REQUIRED]});
  const term=searchTermOf(row);
  let gscVerifiedTerm=false;
  try{const list=await storage.listGscUploads(pool,row.id),last=list[list.length-1];
   gscVerifiedTerm=!!(last&&last.status==='VERIFIED_FOR_PAGE'&&gscExport.termInExport({queries:last.queries||[]},term))}catch(e){}
  const language=(row.market&&row.market.language)||cmsPackage.pageSource(html).language||'en';
  const out=cmsPackage.buildFreePackage({url:row.url,originalHtml:html,sourceSha256:clean(b.source_sha256,80),written:viewOf(row.written),
   input:b,focusQuery:term,gscVerifiedTerm,language});
  // Not ready is a normal answer (what is still to do), not a server error.
  if(!out.ready)return res.set('Cache-Control','no-store').json({success:false,ready:false,details:(out.blocked_details||[]).map(x=>({code:x.code,text:x.sentence||null,reason:x.reason||''})),issues:out.issues,messages:out.messages,flagged:out.flagged});
  if(b.format==='zip'){const zip=out.zip();
   return res.set('Cache-Control','no-store').set('Content-Type','application/zip').set('Content-Disposition','attachment; filename="cms-package.zip"').send(zip)}
  res.set('Cache-Control','no-store').json({success:true,ready:true,files:out.files.map(f=>f.name),manifest:out.manifest,warnings:out.warnings,published:false});
 });
 app.post(apiPath+'/checks/:id/ai',async(req,res)=>{
  const row=await load(req,res);if(!row)return;
  try{
   const b=req.body||{},engine=String(b.engine||''),text=String(b.text||'');
   if(row.status==='FAILED'||!searchTermOf(row))return res.status(409).json({success:false,error:row.status==='FAILED'?'This check could not finish':'The search term is derived from your page: the AI check is available when the Google part has finished'});
   if(!ai.ENGINE_IDS.has(engine))return res.status(400).json({success:false,error:'Choose the AI system you used'});
   if(!text.trim())return res.status(400).json({success:false,error:'Paste the complete answer first'});
   if(text.length>ai.MAX_PASTE)return res.status(413).json({success:false,error:'This answer is too long; paste only the answer and its sources'});
   if(ai.otherPrompt(text))return res.status(400).json({success:false,error:'This is an answer to the company quick-scan prompt (company profile or QUESTION 1–4), not to the prompt for this search term. Copy the prompt shown here, paste it into a new chat with web search on, and paste that answer.'});
   const parsed=ai.parseAiAnswer(text,{pageUrl:row.url,query:searchTermOf(row)});
   if(parsed.validation_status==='invalid')return res.status(400).json({success:false,error:parsed.error_message||'This is not an answer to the search term.'});
   await storage.saveAiAnswer(pool,{checkId:row.id,engine,rawText:text,parsed});
   const aiPart=await aiFor(row,{waitGap:true});
   res.json({success:true,engine,parsed:{sources:parsed.sources.length,resources_status:parsed.resources_status,verifiable:parsed.sources_verifiable,own_site_cited:parsed.own_site_cited,exact_page_cited:parsed.exact_page_cited,own_url_mentioned_not_cited:parsed.own_url_mentioned_not_cited},
    ai:{search_term:aiPart.search_term,prompt:aiPart.prompt,engines:aiPart.engines,max_paste:aiPart.max_paste,summary:aiPart.summary,gap:aiPart.gap},
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
    const market=readMarket(b,res);if(market===undefined)return;
    const aiAnswers=readAiAnswers(b,res);if(aiAnswers===undefined)return;
    await start(res,{email:'owner',url:v.url,host:v.host,query:clean(b.query,120),market,aiAnswers},{accessLabel:'admin',fresh:b.fresh===true});
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
 return {config,idle:()=>Promise.all([...jobs]),queueLength:()=>queue.length,sendDueReminders:sendDue};
}

module.exports={registerFreeGrowth,freeGrowthConfig,parseAccessKeys};
