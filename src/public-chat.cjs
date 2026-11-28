'use strict';
// One chat with Ottmar on every public page (owner 2026-11-28: "op alle publieke pagina's, zodat mensen kunnen chatten
// met mij"). public/chat-widget.js shows the launcher and loads Tawk.to only after Functional consent. Admin, owner and
// internal pages get no chat; the CEO Report and Quick Scan pages keep their own consent-aware chat (index.js).
const CHAT_TAG='<script src="/chat-widget.js?v=1" defer data-cs-chat="1"></script>';
const PROSPECT=/^\/(?:quick-scan(?:\/|$)|scan\/|opportunity-report\/|report\/|(?:nl-|es-)?(?:(?:linkedin|facebook|email)-)?ceo\/?$)/i;
const PRIVATE=/(?:^|[\/\-.])(?:admin|owner|internal)(?:[\/\-.]|$)|^\/(?:api\/|lead-?crawler|engine-login)|content-engine|audit/i;
function shouldInjectChat(path){
 const p=String(path||'/');
 return !PROSPECT.test(p)&&!PRIVATE.test(p);
}
// A page's own direct Tawk.to snippet (with its HTML comments) is replaced, so a page never gets two widgets.
function injectChat(body){
 if(typeof body!=='string'||body.includes('data-cs-chat="1"'))return body;
 let out=body.replace(/<!--\s*Start of Tawk\.to Script\s*-->/gi,'').replace(/<!--\s*End of Tawk\.to Script\s*-->/gi,'')
  .replace(/<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?embed\.tawk\.to(?:(?!<\/script>)[\s\S])*?<\/script>/gi,'');
 const i=out.lastIndexOf('</body>');
 return i<0?out:out.slice(0,i)+CHAT_TAG+out.slice(i);
}
module.exports={CHAT_TAG,shouldInjectChat,injectChat};
