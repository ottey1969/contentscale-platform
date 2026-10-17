'use strict';
const assert=require('node:assert/strict');

// Canonical server serves both public CEO HTML and the private CEO admin HTML
// from src/index.js. Apply once before Express loads that module.
const helper="function isCeoDomainInput(value){try{var raw=String(value||'').trim(),lower=raw.toLowerCase();if(!raw||raw.includes(' ')||raw.includes('@'))return false;var u=new URL(lower.startsWith('https://')||lower.startsWith('http://')?raw:'https://'+raw);if(u.protocol!=='http:'&&u.protocol!=='https:')return false;var host=u.hostname.toLowerCase();if(host.endsWith('.'))host=host.slice(0,-1);if(host.startsWith('www.'))host=host.slice(4);var parts=host.split('.');if(parts.length>=3&&['nl','en','es'].includes(parts[0]))parts.shift();if(host.length>253||parts.length<2||parts.length===4&&parts.every(x=>x.length>0&&Array.from(x).every(c=>c>='0'&&c<='9')))return false;return parts.every(function(p){return p.length>0&&p.length<=63&&p[0]!=='-'&&p[p.length-1]!=='-'&&Array.from(p).every(function(c){return c>='a'&&c<='z'||c>='0'&&c<='9'||c==='-';})})}catch(e){return false}}";

function once(s,before,after){
  if(s.includes(after))return s;
  assert.equal(s.split(before).length,2,'CEO HTML source anchor missing/duplicate: '+before.slice(0,75));
  return s.replace(before,after);
}
function patch(input){
  let s=input;
  const translations=[
    ["missing:'Enter your website domain.',","missing:'Enter your website domain.',badsite:'Enter a valid main website domain (e.g. example.com).',"],
    ["missing:'Vul je website domein in.',","missing:'Vul je website domein in.',badsite:'Vul een geldig hoofddomein in (bijvoorbeeld example.com).',"],
    ["missing:'Introduce el dominio de tu sitio web.',","missing:'Introduce el dominio de tu sitio web.',badsite:'Introduce un dominio principal válido (por ejemplo, example.com).',"]
  ];
  for(const [before,after] of translations)s=once(s,before,after);
  s=once(s,"const goEl=document.getElementById('go'),urlEl=",helper+"const goEl=document.getElementById('go'),urlEl=");
  s=once(s,"urlEl.focus();return}if(!emailEl.value.trim()","urlEl.focus();return}if(!isCeoDomainInput(urlEl.value)){statusEl.innerHTML='<div class=\"status\">'+esc(COPY.badsite)+'</div>';urlEl.focus();return}if(!emailEl.value.trim()");
  s=once(s,"async function createLink(){var b=event&&event.target?event.target:null;try{if(b)",helper+"async function createLink(){var b=event&&event.target?event.target:null;try{if(!isCeoDomainInput(url.value)){created.innerHTML='<p class=\"warn\">Enter a valid main website domain (e.g. example.com).</p>';url.focus();return}if(b)");
  return s;
}
module.exports={patch,helper};
