'use strict';
const assert=require('node:assert/strict');
function patch(source){
 const before="if(!host || !host.includes('.')) throw new Error('Enter a valid main website domain');";
 const after="if(!host || !/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host) || /^\\d+(?:\\.\\d+){3}$/.test(host)) throw new Error('Enter a valid main website domain');";
 const beforeRoute="const normalizedWebsite=_ceoMainWebsiteUrl(urlInput);";
 const afterRoute="let normalizedWebsite;\n    try{normalizedWebsite=_ceoMainWebsiteUrl(urlInput)}catch(_invalidDomain){return res.status(400).json({success:false,code:'INVALID_WEBSITE_DOMAIN',error:'Enter a valid main website domain'});}";
 const replaceOnce=(value,a,b)=>{if(value.includes(b))return value;assert.equal(value.split(a).length,2,'CEO canonical anchor must occur once');return value.replace(a,b)};
 return replaceOnce(replaceOnce(source,before,after),beforeRoute,afterRoute);
}
module.exports={patch};
