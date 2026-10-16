'use strict';
// Uses the same GSC_SERVICE_ACCOUNT_JSON and readonly OAuth scope as the canonical server.
// Intended only as a fallback when the old server registration cannot inject a token resolver.
// Never expose returned tokens in HTTP responses or logs.
const {createSign}=require('node:crypto');
const AUTH='https://oauth2.googleapis.com/token';
async function growthServiceAccountToken({raw=process.env.GSC_SERVICE_ACCOUNT_JSON,fetchImpl=fetch}={}){
 if(!raw)return null;
 let account;try{account=JSON.parse(raw)}catch{throw Error('GSC_SERVICE_ACCOUNT_INVALID')}
 if(!account?.client_email||!account?.private_key)throw Error('GSC_SERVICE_ACCOUNT_INVALID');
 const now=Math.floor(Date.now()/1000);
 const part=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const header=part({alg:'RS256',typ:'JWT'});
 const body=part({iss:account.client_email,scope:'https://www.googleapis.com/auth/webmasters.readonly',
  aud:AUTH,iat:now,exp:now+3600});
 const signing=createSign('RSA-SHA256');signing.update(header+'.'+body);
 const jwt=header+'.'+body+'.'+signing.sign(account.private_key,'base64url');
 const response=await fetchImpl(AUTH,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}).toString()});
 if(!response?.ok)throw Error('GSC_SERVICE_ACCOUNT_TOKEN_REJECTED');
 const result=await response.json();
 if(typeof result?.access_token!=='string'||!result.access_token)throw Error('GSC_SERVICE_ACCOUNT_TOKEN_MISSING');
 return result.access_token;
}
module.exports={growthServiceAccountToken};
