'use strict';
function scanResult(data,url,now=new Date()){
 if(!data||data.success!==true||typeof data.score!=='number'||!Number.isFinite(data.score)||data.score<0||data.score>100)throw Error('Invalid ContentScore result');
 if(data.url&&new URL(data.url).href!==new URL(url).href)throw Error('Scan URL differs from report page');
 const recs=data.recommendations?.all||data.recommendations;
 if(!Array.isArray(recs))throw Error('Missing ContentScore recommendations');
 const fields=['title','priority','description','action','learning','target'];
 return {url,score:data.score,quality:String(data.quality||''),scanned_at:now.toISOString(),recommendations:recs.map(r=>Object.fromEntries(fields.filter(k=>r&&r[k]!=null).map(k=>[k,String(r[k])])) )};
}
module.exports={scanResult};
