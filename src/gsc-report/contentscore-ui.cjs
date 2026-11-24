'use strict';
const labels={
 en:{scan:'Scan',again:'Rescan',pending:'Scanning…',saving:'Saving…',failed:'Scan failed. Please try again.',issues:'issues',copy:'Copy',all:'Copy all',copied:'Copied',none:'Not scanned',skip:'Not applicable',date:'Scanned (UTC)'},
 nl:{scan:'Scannen',again:'Opnieuw scannen',pending:'Scannen…',saving:'Opslaan…',failed:'Scan mislukt. Probeer opnieuw.',issues:'problemen',copy:'Kopieer',all:'Kopieer alles',copied:'Gekopieerd',none:'Niet gescand',skip:'Niet van toepassing',date:'Gescand (UTC)'},
 es:{scan:'Escanear',again:'Volver a escanear',pending:'Escaneando…',saving:'Guardando…',failed:'Error de análisis. Inténtalo de nuevo.',issues:'problemas',copy:'Copiar',all:'Copiar todo',copied:'Copiado',none:'Sin analizar',skip:'No aplicable',date:'Analizado (UTC)'}
};
function list(items,l,esc){
 return '<details><summary style="color:#2563eb;text-decoration:underline;cursor:pointer">'+items.length+' '+esc(l.issues)+'</summary><div data-findings><button type="button" data-copy-all>'+esc(l.all)+'</button><ol>'+items.map(t=>'<li><div data-copy-text style="white-space:pre-wrap">'+esc(t)+'</div><button type="button" data-copy>'+esc(l.copy)+'</button></li>').join('')+'</ol></div></details>';
}
function structure(p,A,lang,esc){
 if(!p.audit)return '—';
 return list((p.audit.issues||[]).map(x=>A.issues[x]||x),labels[lang],esc);
}
function cell(p,result,{owner,lang,esc,endpoint}){
 const l=labels[lang];
 if(['REDIRECT','GONE'].includes(p.action))return esc(l.skip);
 const content=result?'<strong>'+esc(result.score)+'/100</strong><div class="muted">'+esc(l.date)+' '+esc(result.scanned_at)+'</div>'+list(result.recommendations.map(r=>['title','priority','description','action','learning','target'].map(k=>r[k]).filter(Boolean).join('\n')),l,esc):'<span class="muted">'+esc(l.none)+'</span>';
 return content+(owner?'<div><button type="button" data-cs-scan data-url="'+esc(p.url)+'" data-endpoint="'+esc(endpoint)+'">'+esc(result?l.again:l.scan)+'</button><span role="status" data-cs-status></span></div>':'');
}
const script='('+function(){
 const dict={en:{pending:'Scanning…',saving:'Saving…',failed:'Scan failed. Please try again.',copied:'Copied'},nl:{pending:'Scannen…',saving:'Opslaan…',failed:'Scan mislukt. Probeer opnieuw.',copied:'Gekopieerd'},es:{pending:'Escaneando…',saving:'Guardando…',failed:'Error de análisis. Inténtalo de nuevo.',copied:'Copiado'}};
 const l=dict[document.documentElement.lang]||dict.en;
 document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-copy')||b.hasAttribute('data-copy-all')){
   const texts=b.hasAttribute('data-copy')?[b.closest('li').querySelector('[data-copy-text]')]:Array.from(b.closest('[data-findings]').querySelectorAll('[data-copy-text]'));
   try{await navigator.clipboard.writeText(texts.map(x=>x.textContent).join('\n\n'));b.textContent=l.copied;}catch{const r=document.createRange();r.selectNodeContents(b.closest('[data-findings]'));const s=window.getSelection();s.removeAllRanges();s.addRange(r);}
   return;
  }
  if(!b.hasAttribute('data-cs-scan'))return;
  const status=b.parentElement.querySelector('[data-cs-status]');b.disabled=true;status.textContent=l.pending;
  try{
   const url=b.dataset.url;
   const scan=await fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
   const result=await scan.json();if(!scan.ok||!result.success)throw Error('scan');
   status.textContent=l.saving;
   const save=await fetch(b.dataset.endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-requested-with':'gsc-report'},body:JSON.stringify({url,result})});
   const data=await save.json();if(!save.ok||!data.success)throw Error('save');
   location.reload();
  }catch{status.textContent=l.failed;b.disabled=false;}
 });
}.toString()+')();';
module.exports={labels,structure,cell,script};
