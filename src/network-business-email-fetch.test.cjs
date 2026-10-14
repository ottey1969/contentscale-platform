'use strict';
const assert=require('node:assert/strict');
const {publicIP,hostForWebsite,discoverCompanyContact}=require('./network-business-email-fetch.cjs');
async function run(){
 for(const ip of ['127.0.0.1','10.2.3.4','192.168.1.3','169.254.169.254','172.16.1.2','::1','fc00::1','2001:db8::1'])assert.equal(publicIP(ip),false,ip);
 assert.equal(publicIP('8.8.8.8'),true);
 assert.equal(hostForWebsite('https://www.acme.com/contact').host,'acme.com');
 assert.equal(hostForWebsite('http://www.acme.com/').host,'acme.com','HTTP-origin imported Maps URLs must upgrade to HTTPS-only fetch');
 for(const url of ['https://localhost','https://127.0.0.1','https://acme.com:8443'])assert.throws(()=>hostForWebsite(url));
 const jersey=await discoverCompanyContact('https://jerseycraftroofing.com/',{
   maxPages:1,resolve:async()=>[{address:'8.8.8.8',family:4}],
   request:(options,callback)=>{
     const {EventEmitter}=require('node:events');const req=new EventEmitter();
     req.end=()=>{const res=new EventEmitter();res.statusCode=200;res.headers={'content-type':'text/html'};callback(res);
       process.nextTick(()=>{res.emit('data',Buffer.from('<html><head><style>.ignore{content:"vendor@external.com"}</style></head><body><footer>Jersey Craft Roofing | info@jerseycraftexteriors.com</footer></body></html>'));res.emit('end');});};
     req.destroy=()=>{};return req;
   }
 });
 assert.equal(jersey.email,'info@jerseycraftexteriors.com','published alternate business domain must be detected');
 assert.equal(jersey.source_url,'https://jerseycraftroofing.com/');
 assert.equal(jersey.relationship,'publicly_listed_other_business_domain');
 assert(!jersey.contacts.some(x=>x.email==='vendor@external.com'),'script/style emails must be ignored');
 const result=await discoverCompanyContact('https://acme.com',{maxPages:2,resolve:async()=>[{address:'8.8.8.8',family:4}],request:(options,callback)=>{
   const {EventEmitter}=require('node:events');
   const req=new EventEmitter();
   req.end=()=>{
     const res=new EventEmitter();
     res.statusCode=200;res.headers={'content-type':'text/html'};
     callback(res);
     process.nextTick(()=>{res.emit('data',Buffer.from(options.path==='/contact'?'<a href="mailto:sales@acme.com">Sales</a>':'<a href="mailto:info@acme.com">Contact</a>'));res.emit('end');});
   };
   req.destroy=()=>{};
   return req;
 }});
 assert.equal(result.contacts.length,2);
 assert.equal(result.verification,'publicly_observed');
 console.log('network acquisition email discovery tests passed');
}
run().catch(e=>{console.error(e);process.exitCode=1});
