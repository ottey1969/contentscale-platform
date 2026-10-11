'use strict';
// Existing CEO/QuickScan and later Audit20 keep their own workflow/scanner.
// This adds one common eligibility rule. No database writes or network calls.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'src/index.js');
let s=fs.readFileSync(file,'utf8');
if(Buffer.byteLength(s)<6000000)throw Error('STOP: incomplete canonical app');
function uniqueReplace(oldText,newText,label){
 const n=s.split(oldText).length-1;
 if(n===0&&s.includes(newText))return;
 if(n!==1)throw Error('STOP: '+label+' source drift ('+n+')');
 s=s.replace(oldText,newText);
}
const helper=[
"// Canonical utility-page exclusion for CEO page A, Quick Scan page B and Audit20 discovery.",
"// Classification only: never performs scans, emails, database writes or full audits.",
"function _ceoUtilityPage(rawUrl,title='',h1=''){",
"  try{",
"    const u=new URL(rawUrl);",
"    const segments=decodeURIComponent(u.pathname||'/').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').split('/').filter(Boolean).map(v=>v.replace(/[_\\s]+/g,'-'));",
"    const excluded=/^(?:privacy|privacy-policy|privacy-statement|privacyverklaring|privacybeleid|privacypolicy|privacidad|politica-de-privacidad|datenschutz|datenschutzerklaerung|cookie|cookies|cookie-policy|cookiebeleid|cookieverklaring|politica-de-cookies|disclaimer|disclaimers|disclaimer-of-liability|terms|terms-of-service|terms-of-use|terms-and-conditions|terms-conditions|tos|voorwaarden|algemene-voorwaarden|gebruiksvoorwaarden|condiciones-de-uso|condiciones-generales|aviso-legal|legal-notice|legal-information|impressum|mentions-legales|gdpr|avg|accessibility-statement|toegankelijkheidsverklaring|refund-policy|return-policy|returns-policy|shipping-policy|thank-you|thankyou|bedankt|gracias|login|log-in|signin|sign-in|signup|sign-up|register|registration|checkout|cart|basket|account|my-account|unsubscribe|afmelden|404|not-found|search|feed|sitemap)$/i;",
"    if(segments.some(v=>excluded.test(v)))return true;",
"    if(segments.some(v=>/^(?:disclaimer|privacy-policy|cookie-policy|terms-and-conditions|algemene-voorwaarden|aviso-legal|legal-notice|impressum|datenschutz)(?:-(?:20\\d\\d|nl|en|es|de|fr|updated|update|page|v\\d+))+$/.test(v)))return true;",
"    const normalize=v=>String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');",
"    const exact=/^(?:disclaimer|privacy policy|privacy statement|privacyverklaring|privacybeleid|cookie policy|cookiebeleid|terms and conditions|terms of service|terms of use|algemene voorwaarden|gebruiksvoorwaarden|aviso legal|politica de privacidad|politica de cookies|datenschutzerklarung|legal notice|accessibility statement)(?:\\s*[-:|–—]\\s*.{1,90})?$/i;",
"    if([title,h1].some(v=>exact.test(normalize(v))))return true;",
"    return false;",
"  }catch(e){return true}",
"}",
""
].join('\n');
const anchor='function _audit20LooksUtility(url){';
if(!s.includes('// Canonical utility-page exclusion for CEO page A, Quick Scan page B and Audit20 discovery.')){
 if(s.split(anchor).length!==2)throw Error('STOP: shared filter anchor drift');
 s=s.replace(anchor,helper+anchor);
}
uniqueReplace("    return /\\/(privacy|privacy-policy|terms|terms-and-conditions|cookie|cookies|login|signin|signup|cart|checkout|account|wp-admin)(\\/|$)/.test(p)",
"    return _ceoUtilityPage(url)||/\\/(privacy|privacy-policy|terms|terms-and-conditions|cookie|cookies|login|signin|signup|cart|checkout|account|wp-admin)(\\/|$)/.test(p)",
"Audit20 utility discovery exclusion");
const selectorStart=s.indexOf('function _pqsSelectorUrlEligible(rawUrl){'),selectorEnd=s.indexOf('function _pqsSelectorLooksArchive(',selectorStart);
if(selectorStart<0||selectorEnd<=selectorStart)throw Error('STOP: CEO selector bounds changed');
let sel=s.slice(selectorStart,selectorEnd);
const rawMarker="    const u=new URL(rawUrl),p=String(u.pathname||'/').toLowerCase();";
if(!sel.includes("if(_ceoUtilityPage(u.href))return false;")){
 if(sel.split(rawMarker).length!==2)throw Error('STOP: URL validation anchor changed');
 sel=sel.replace(rawMarker,rawMarker+"\n    if(_ceoUtilityPage(u.href))return false;");
 s=s.slice(0,selectorStart)+sel+s.slice(selectorEnd);
}
uniqueReplace("  if(!_pqsSelectorUrlEligible(u.href)||_pqsSelectorLooksArchive(page))return null;",
"  if(!_audit20SameHost(u.href,home.href)||!_pqsSelectorUrlEligible(u.href)||_ceoUtilityPage(u.href,title,h1)||_pqsSelectorLooksArchive(page))return null;",
"CEO final fetched URL and identity");
uniqueReplace("}:{selected_url:cleaned,mode:'auto_fallback',strategy:'multi_candidate_weak_commercial_prescreen',reason:'No meaningful first-party commercial page could be validated during pre-screening.',discovery:{urls_discovered:rawCandidates.length,shortlisted:shortlist.length,prescreened:scores.length},candidates:debugCandidates};",
"}:{selected_url:null,mode:'no_eligible_page',strategy:'multi_candidate_weak_commercial_prescreen',reason:'No verified business page was eligible. A legal or utility page is never a substitute for a CEO report.',discovery:{urls_discovered:rawCandidates.length,shortlisted:shortlist.length,prescreened:scores.length},candidates:debugCandidates};",
"CEO no-eligible safe fallback");
const ceoStart=s.indexOf("app.post('/api/ceo-report/start',async(req,res)=>{"),ceoEnd=s.indexOf("    lastStage='GENERATE_CEO';",ceoStart);
if(ceoStart<0||ceoEnd<ceoStart)throw Error('STOP: public/private CEO route moved');
const ceoOld="    }catch(_e){console.warn('[ceo-report] smart page selection:',_e.message)}\n    await pool.query(";
const ceoNew="    }catch(_e){console.warn('[ceo-report] smart page selection:',_e.message)}\n    if(!selection||!selection.selected_url||!_pqsSelectorUrlEligible(selected)||!_audit20SameHost(selected,url)){\n      const unavailable=selection||{mode:'page_selection_failed',selected_url:null,reason:'No verified eligible business page could be selected.'};\n      await pool.query(\`UPDATE prospect_quick_scans SET ceo_report_page_url=NULL,page_selection=$1::jsonb,updated_at=NOW() WHERE token=$2\`,[JSON.stringify(unavailable),token]);\n      return res.status(422).json({success:false,code:'NO_ELIGIBLE_CEO_PAGE',error:'No suitable business page could be verified. Privacy, disclaimer and utility pages will not be scanned.',manual_review_required:true});\n    }\n    await pool.query(";
uniqueReplace(ceoOld,ceoNew,"public/private CEO fail-closed response");
const quickStart=s.indexOf("app.post('/api/prospect-quick-scan/:token/setup',"),quickEnd=s.indexOf("app.post('/api/prospect-quick-scan/:token/contact',",quickStart);
if(quickStart<0||quickEnd<quickStart)throw Error('STOP: Quick Scan setup route moved');
uniqueReplace("    if(!page)return res.status(400).json({success:false,error:'Enter a valid public page URL'});",
"    if(!page)return res.status(400).json({success:false,error:'Enter a valid public page URL'});\n    if(!_pqsSelectorUrlEligible(page))return res.status(400).json({success:false,code:'QUICKSCAN_UTILITY_PAGE',error:'Choose a real business page, not a disclaimer, privacy policy or other utility page.'});",
"Quick Scan manually chosen page B");
const runStart=s.indexOf("app.post('/api/prospect-quick-scan/:token/run',"),runEnd=s.indexOf("app.",runStart+10);
if(runStart<0)throw Error('STOP: Quick Scan run route moved');
const runSlice=s.slice(runStart,runStart+3000);
if(!runSlice.includes("    row=q.rows[0];"))throw Error('STOP: Quick Scan run row marker moved');
uniqueReplace("    row=q.rows[0];\n    if(row.ceo_report_page_url){",
"    row=q.rows[0];\n    if(!_pqsSelectorUrlEligible(row.url))return res.status(400).json({success:false,code:'QUICKSCAN_UTILITY_PAGE',error:'This is not a suitable business page for Quick Scan.'});\n    if(row.ceo_report_page_url){",
"Quick Scan run legacy URL revalidation");
fs.writeFileSync(file,s);
console.log('CEO page A and Quick Scan page B exclude utility pages; Audit20 discovery shares only eligibility, its scan remains separate.');
