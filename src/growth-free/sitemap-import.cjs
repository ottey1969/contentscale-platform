'use strict';
// Optional visitor-supplied XML only. No remote fetch, DTD expansion, ZIP extraction or URL probing.
// A sitemap is an inventory of URL candidates, never evidence that those pages were read.
const MAX_BYTES=1024*1024,MAX_URLS=300;
function importSitemap(file,pageUrl){
 if(!file||!file.content_base64)return null;
 const input=String(file.content_base64);
 if(input.length>Math.ceil(MAX_BYTES*4/3)+8)throw Error('SITEMAP_TOO_LARGE');
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(input)||input.length%4!==0)throw Error('SITEMAP_INVALID_FILE');
 const bytes=Buffer.from(input,'base64');
 if(!bytes.length||bytes.length>MAX_BYTES)throw Error('SITEMAP_TOO_LARGE');
 const xml=bytes.toString('utf8').replace(/^\uFEFF/,'');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('SITEMAP_XML_ENTITIES_UNSUPPORTED');
 if(!/<(?:[A-Za-z_][\w.-]*:)?urlset(?:\s|>)/i.test(xml)){
  if(/<(?:[A-Za-z_][\w.-]*:)?sitemapindex(?:\s|>)/i.test(xml))throw Error('UPLOAD_URLSET_NOT_SITEMAP_INDEX');
  throw Error('SITEMAP_INVALID_XML');
 }
 const host=new URL(pageUrl).hostname.toLowerCase(),urls=[],seen=new Set();
 const records=xml.match(/<(?:[\w.-]+:)?url\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?url\s*>/gi)||[];
 for(const record of records){
  const match=record.match(/<(?:[\w.-]+:)?loc\s*>([\s\S]*?)<\/(?:[\w.-]+:)?loc\s*>/i);
  if(!match)continue;
  const value=match[1].trim().replace(/&amp;/gi,'&').replace(/&#(\d+);/g,(_m,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff)));
  try{
   const url=new URL(value);
   if(url.protocol!=='https:'&&url.protocol!=='http:')continue;
   if(url.hostname.toLowerCase()!==host||url.username||url.password||url.port&&!['80','443'].includes(url.port))continue;
   url.hash='';if(url.href.length>500||seen.has(url.href))continue;
   seen.add(url.href);urls.push(url.href);
  }catch(e){continue}
  if(urls.length>=MAX_URLS)break;
 }
 if(!urls.length)throw Error('SITEMAP_NO_MATCHING_SITE_URLS');
 return {fileName:String(file.name||'sitemap.xml').slice(0,120),urls,totalFound:records.length,limited:records.length>MAX_URLS};
}
module.exports={importSitemap,MAX_BYTES,MAX_URLS};
