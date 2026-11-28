'use strict';
// What the ContentScore scanner accepts as a page to scan. An e-mail address typed into the URL field
// ("andrede@heystraetus.nl") used to become https://andrede@heystraetus.nl and was scanned; that is refused now.
function scanUrlProblem(raw){
 const text=String(raw||'').trim();
 if(!text)return 'URL required';
 if(/^mailto:/i.test(text)||/^[^\s/:?#]+@[^\s/]+\.[a-z]{2,}$/i.test(text))return 'That looks like an e-mail address. Enter a web page address, for example https://example.com/page/';
 let url;
 try{url=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text)?text:'https://'+text)}catch{return 'Enter a valid web page address, for example https://example.com/page/'}
 if(!['http:','https:'].includes(url.protocol))return 'Only http and https pages can be scanned';
 if(url.username||url.password)return 'A web page address cannot contain a user name or password. Enter the page address only.';
 if(!url.hostname||!url.hostname.includes('.'))return 'Enter a valid web page address, for example https://example.com/page/';
 return null;
}
module.exports={scanUrlProblem};
