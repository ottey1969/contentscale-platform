'use strict';
// Quality filters for live SERP leads used as competitor candidates. Industry-neutral: a lead must be a comparable
// page for the same intent and place, not an aggregator, the site's own listing, or a page about another region.
const US={AL:'alabama',AK:'alaska',AZ:'arizona',AR:'arkansas',CA:'california',CO:'colorado',CT:'connecticut',DE:'delaware',FL:'florida',GA:'georgia',HI:'hawaii',ID:'idaho',IL:'illinois',IN:'indiana',IA:'iowa',KS:'kansas',KY:'kentucky',LA:'louisiana',ME:'maine',MD:'maryland',MA:'massachusetts',MI:'michigan',MN:'minnesota',MS:'mississippi',MO:'missouri',MT:'montana',NE:'nebraska',NV:'nevada',NH:'new hampshire',NJ:'new jersey',NM:'new mexico',NY:'new york',NC:'north carolina',ND:'north dakota',OH:'ohio',OK:'oklahoma',OR:'oregon',PA:'pennsylvania',RI:'rhode island',SC:'south carolina',SD:'south dakota',TN:'tennessee',TX:'texas',UT:'utah',VT:'vermont',VA:'virginia',WA:'washington',WV:'west virginia',WI:'wisconsin',WY:'wyoming',DC:'district of columbia'};
const NAME2ABBR=Object.fromEntries(Object.entries(US).map(([a,n])=>[n,a]));
// Two-letter words that are also common English words; only accepted after a comma ("Paterson, OR") or with a city before them.
const AMBIGUOUS=new Set(['IN','OR','ME','OK','HI','OH','LA','PA','AL','ID','MA','DE','CO','DC']);
function statesIn(text,{queryMode=false}={}){
 const raw=String(text||''),found=new Set(),lower=raw.toLowerCase();
 for(const [name,abbr] of Object.entries(NAME2ABBR))if(new RegExp('\\b'+name+'\\b').test(lower))found.add(abbr);
 for(const m of raw.matchAll(/(?:,\s*|\b[A-Z][a-z]+\s+)([A-Z]{2})\b(?!\s*[a-z])/g)){const a=m[1];if(US[a]&&(!AMBIGUOUS.has(a)||/,\s*[A-Z]{2}\b/.test(m[0])))found.add(a)}
 if(queryMode)for(const w of lower.split(/[^a-z]+/))if(w.length===2&&US[w.toUpperCase()]&&!AMBIGUOUS.has(w.toUpperCase()))found.add(w.toUpperCase());
 return [...found];
}
// Directories, marketplaces, social profiles and review aggregators. They list businesses; they are not comparable pages.
const AGGREGATOR=/(^|\.)(yelp\.com|angi\.com|angieslist\.com|homeadvisor\.com|thumbtack\.com|bbb\.org|yellowpages\.com|mapquest\.com|nextdoor\.com|porch\.com|houzz\.com|buildzoom\.com|manta\.com|superpages\.com|trustpilot\.com|expertise\.com|threebestrated\.com|fixr\.com|networx\.com|chamberofcommerce\.com|clutch\.co|g2\.com|capterra\.com|glassdoor\.com|indeed\.com|facebook\.com|instagram\.com|linkedin\.com|pinterest\.com|youtube\.com|tiktok\.com|x\.com|twitter\.com|reddit\.com|quora\.com|wikipedia\.org|gravatar\.com)$/i;
const LISTICLE=/^(?:the\s+)?(?:top|best)\s+\d+\b|\b(?:top|best)\s+\d+\s+.*\b(?:in|near)\b|\bdirectory\b|\bfind (?:a|the) (?:best|top|local)\b|\bcompare (?:quotes|prices|pros)\b/i;
// query: the working query; lead: {url,title,snippet}. Returns null when the lead is acceptable, else a reason code.
function rejectLead({query='',lead={},ownHost=''}={}){
 let host='';try{host=new URL(lead.url).hostname.replace(/^www\./,'').toLowerCase()}catch{return 'INVALID_URL'}
 if(ownHost&&(host===ownHost||host.endsWith('.'+ownHost)))return 'OWN_SITE';
 if(AGGREGATOR.test(host))return 'AGGREGATOR_OR_PROFILE_NOT_A_COMPARABLE_PAGE';
 const qStates=statesIn(query,{queryMode:true});
 const text=String(lead.title||'')+' '+String(lead.snippet||'');
 if(qStates.length){ // a place-bound query: other-region pages are not competitors
  if(LISTICLE.test(String(lead.title||'')))return 'DIRECTORY_STYLE_LISTING_FOR_A_LOCAL_QUERY';
  const rStates=statesIn(text);
  if(rStates.length&&!rStates.some(s=>qStates.includes(s)))return 'DIFFERENT_REGION:'+rStates.join(',');
 }
 return null;
}
module.exports={rejectLead,statesIn,AGGREGATOR,US};
