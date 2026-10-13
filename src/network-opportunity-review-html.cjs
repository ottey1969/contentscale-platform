'use strict';
function opportunityReviewHtml(){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Network · Opportunity pilot</title><style>
 body{background:#f5f7fa;color:#162b40;font:16px/1.55 system-ui;margin:0;padding:25px}main{max-width:930px;margin:auto}header{display:flex;justify-content:space-between;align-items:center}h1{font-size:28px}article{border:1px solid #dbe3ec;border-radius:12px;padding:22px;background:#fff;margin:16px 0}label{display:block;margin:12px 0 5px;font-weight:600}input,textarea{font:inherit;box-sizing:border-box;width:100%;padding:10px;border:1px solid #9aacc2;border-radius:8px}button{font:inherit;background:#16783d;color:white;border:0;border-radius:8px;padding:10px 17px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}.muted{color:#52677d}.error{color:#971b26}.ok{color:#116133}.row{display:flex;gap:14px;flex-wrap:wrap}small{color:#52677d}
 </style></head><body><main><header><h1>Network · Opportunity pilot</h1><span>Admin review</span></header>
 <p>Review five existing prospects. Prepare a specific content opportunity. No invitation is sent automatically and no business is added to public Network.</p>
 <button id="refresh">Load 5 prospects</button><p id="status" role="status" aria-live="polite"></p><section id="items"></section></main>
 <script>(function(){
 'use strict';
 const el=id=>document.getElementById(id),status=el('status'),items=el('items');
 function token(){
  const names=['super_admin_session_token','superAdminToken','super_admin_token','adminToken','admin_token','adminKey','admin_key','lc_admin_key','lcAdminKey','engineAdminKey'];
  for(const store of [localStorage,sessionStorage])try{
   for(const n of names){const v=store.getItem(n);if(/^[a-f0-9]{64}$/i.test(v||''))return v;}
   for(let i=0;i<store.length;i++){const name=store.key(i);if(!/admin|super|session|auth/i.test(name||''))continue;
    const v=store.getItem(name);if(/^[a-f0-9]{64}$/i.test(v||''))return v;
    try{const obj=JSON.parse(v);for(const key of ['session_token','sessionToken','token','admin_token','adminToken'])if(/^[a-f0-9]{64}$/i.test(obj?.[key]||''))return obj[key];}catch{}
   }
  }catch{}
  return '';
 }
 function message(s,bad=false){status.textContent=s;status.className=bad?'error':'muted';}
 async function request(path,options={}){
  const t=token();if(!t)throw Error('Sign in to the ContentScale administrator dashboard first.');
  const r=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',headers:{'x-admin-key':t,...options.headers}});
  const data=await r.json();if(!r.ok||!data.success)throw Error((data.error||data.issues?.join(', ')||'Request failed')+(data.diagnostic_code?' (diagnostic '+data.diagnostic_code+')':''));return data;
 }
 function addField(card,labelName,kind,placeholder){
  const label=document.createElement('label');label.textContent=labelName;const input=document.createElement(kind);input.placeholder=placeholder;input.required=true;label.appendChild(input);card.appendChild(label);return input;
 }
 async function load(){
  items.replaceChildren();message('Loading…');el('refresh').disabled=true;
  try{
   const data=await request('/api/network/admin/opportunity-pilot');
   if(!data.prospects.length){message('No eligible prospects in this pilot.');return;}
   message(data.prospects.length+' prospects for manual review · no automatic emails');
   for(const p of data.prospects){
    const card=document.createElement('article'),h=document.createElement('h2');h.textContent=p.business_name;card.appendChild(h);
    const desc=document.createElement('p');desc.className='muted';desc.textContent=p.domain+' · '+(p.niche||'niche not verified')+' · fit '+(p.network_fit_score??'not assessed')+' · '+(p.opportunity_status||'not prepared');card.appendChild(desc);
    if(p.opportunity_status){const note=document.createElement('p');note.textContent='Opportunity already prepared. Reuse existing CRM state; no duplicate draft.';card.appendChild(note);items.appendChild(card);continue;}
    const title=addField(card,'Article title','input','A factual subject relevant to this website (15–150 characters)');
    const pitch=addField(card,'Why it helps and what would be proposed','textarea','Write at least 80 characters based on verified information. Do not claim publication is already secured.');
    pitch.rows=4;
    const suggest=document.createElement('button');suggest.textContent='Generate suggested opportunity';suggest.type='button';suggest.style.margin='8px 12px 12px 0';card.appendChild(suggest);
    const evidence=document.createElement('p');evidence.className='muted';card.appendChild(evidence);
    suggest.addEventListener('click',async()=>{
      suggest.disabled=true;suggest.textContent='Researching existing evidence…';
      try{
       const draft=await request('/api/network/admin/opportunity/'+p.id+'/suggestion');
       title.value=draft.title;pitch.value=draft.pitch;
       evidence.textContent='Suggestion from Contact Intelligence. Indexed-page research: '+(draft.overlap?.status||'unavailable')+'. Publication is not confirmed.';
       for(const item of draft.overlap?.sources||[]){
        const line=document.createElement('div'),a=document.createElement('a');
        a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';
        a.textContent=item.title+' (topic overlap '+Math.round(item.similarity*100)+'%)';
        line.appendChild(a);evidence.appendChild(line);
       }
       if(draft.overlap?.review_required) {
        const warn=document.createElement('strong');warn.textContent=' Content overlap or missing evidence needs editorial review before invitation.';
        evidence.appendChild(warn);
       }
      }catch(e){evidence.className='error';evidence.textContent=e.message;}
      finally{suggest.disabled=false;suggest.textContent='Regenerate suggestion';}
    });

    // Verified editorial example: Mixcloud's public blog covers creator advice,
    // Mixcloud Guides and music culture. Do not invent publication approval.
    if(String(p.domain||'').toLowerCase()==='mixcloud.com'){
     title.value='How Independent DJs Can Build a Loyal Audience Beyond Social Media';
     pitch.value="Mixcloud already publishes practical advice for DJs, radio hosts and independent music creators. This proposed article would explore how independent DJs can build lasting relationships with listeners through consistent shows, community engagement, collaborations and owned communication channels. It would complement Mixcloud's existing creator advice without promising specific growth results. This is an editorial proposal for review, not a confirmed placement.";
     const context=document.createElement('p');context.className='muted';
     context.textContent='Verified publisher candidate: Mixcloud Blog publishes creator advice and music culture. Editorial overlap and acceptance require review.';
     const blog=document.createElement('a');blog.href='https://www.mixcloud.com/blog/';blog.target='_blank';blog.rel='noopener noreferrer';blog.textContent=' Review Mixcloud blog';
     context.appendChild(blog);card.appendChild(context);
    }
    const button=document.createElement('button');button.textContent='Prepare preview (no email)';card.appendChild(button);
    const result=document.createElement('p');result.setAttribute('role','status');card.appendChild(result);
    button.addEventListener('click',async()=>{
     button.disabled=true;button.textContent='Saving…';result.textContent='';
     try{
      const data=await request('/api/network/admin/opportunity/'+p.id+'/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title.value,pitch:pitch.value})});
      const link=new URL(data.preview_url,location.origin).href;result.textContent='Prepared. Preview: ';
      const a=document.createElement('a');a.href=link;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open private preview';result.appendChild(a);
      const copy=document.createElement('button');copy.textContent='Copy invitation link';copy.style.marginLeft='12px';copy.addEventListener('click',()=>navigator.clipboard.writeText(link));result.appendChild(copy);
      const send=document.createElement('button');send.textContent='Approve & send email';send.style.marginLeft='12px';send.type='button';
      result.appendChild(send);
      send.addEventListener('click',async()=>{
       if(!confirm('Send this reviewed content opportunity by email to the verified business contact? Only one email will be sent.'))return;
       send.disabled=true;send.textContent='Sending…';
       try{
        const sent=await request('/api/network/admin/opportunity/'+p.id+'/send-invitation',{
         method:'POST',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({token:link.split('/').pop(),confirm_send:true})});
        send.textContent='Email accepted by provider';result.className='ok';
       }catch(e){send.textContent='Review delivery result';result.className='error';result.appendChild(document.createTextNode(' '+e.message));}
      });
      button.textContent='Prepared';title.disabled=true;pitch.disabled=true;
     }catch(e){result.className='error';result.textContent=e.message;button.disabled=false;button.textContent='Prepare preview (no email)';}
    });items.appendChild(card);
   }
  }catch(e){message(e.message,true)}finally{el('refresh').disabled=false;}
 }
 el('refresh').addEventListener('click',load);load();
 })();</script></body></html>`;
}
module.exports={opportunityReviewHtml};
