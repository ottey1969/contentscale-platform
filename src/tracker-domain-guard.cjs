'use strict';
// A Tracker belongs to one domain (owner 2026-11-20: a tracker for test.com must never take in pages or data of roos.com).
// A URL belongs to it on the tracker's own domain, its subdomains, or a domain the admin added as extra domain.
// Parsed with URL, so "test.com.roos.com", "roos.com/?u=test.com" or "user@roos.com" never pass a text match.
function hostOf(v){
 const raw=String(v||'').trim();if(!raw)return '';
 try{const u=new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw)?raw:'https://'+raw);if(!/^https?:$/.test(u.protocol))return '';return u.hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}
}
function urlOnClientDomain(client,url){
 const h=hostOf(url);if(!h)return false;
 const allowed=[client&&client.domain,...String(client&&client.extra_domains||'').split(',')].map(hostOf).filter(Boolean);
 return allowed.some(d=>h===d||h.endsWith('.'+d));
}
module.exports={urlOnClientDomain,hostOf};
