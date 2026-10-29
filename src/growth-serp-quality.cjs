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
// The market a page serves, from what the site itself states: the working query, the page's tracked keyword and its URL
// slug ("...-roof-repair-nj/"). A GSC query is often shorter than the page's topic ("storm damage roof repair" for a
// New Jersey page), so the query alone under-states the place. Titles are not used: they name places in passing.
function deriveMarket({query='',keyword='',url=''}={}){
 let slug='';try{slug=decodeURIComponent(new URL(url).pathname).replace(/[-_/]+/g,' ')}catch{}
 const states=[...new Set([query,keyword,slug].flatMap(x=>statesIn(x,{queryMode:true})))];
 const name=a=>US[a].replace(/\b[a-z]/g,c=>c.toUpperCase());
 return states.length?{states,country:'us',location:states.length===1?name(states[0])+', United States':null,
  source:'QUERY_KEYWORD_OR_URL_OF_THE_SOURCE_PAGE'}:null;
}
// query: the working query; lead: {url,title,snippet}. Returns null when the lead is acceptable, else a reason code.
// marketStates: the place the source page serves (deriveMarket), applied even when the query itself names no place.
// The place a lead names in its title, snippet or URL path ("…/wind-damage-repair-colorado-spring-…"). The path is read for
// full state names only (lower-case slugs carry no reliable two-letter codes).
const leadStates=lead=>{let path='';try{path=decodeURIComponent(new URL(lead.url).pathname).toLowerCase().replace(/[-_/]+/g,' ')}catch{}
 return [...new Set([...statesIn(String(lead.title||'')+' '+String(lead.snippet||'')),...statesIn(path)])]};
function rejectLead({query='',lead={},ownHost='',marketStates=[]}={}){
 let host='';try{host=new URL(lead.url).hostname.replace(/^www\./,'').toLowerCase()}catch{return 'INVALID_URL'}
 if(ownHost&&(host===ownHost||host.endsWith('.'+ownHost)))return 'OWN_SITE';
 if(AGGREGATOR.test(host))return 'AGGREGATOR_OR_PROFILE_NOT_A_COMPARABLE_PAGE';
 const qStates=[...new Set([...statesIn(query,{queryMode:true}),...(Array.isArray(marketStates)?marketStates:[])])];
 if(qStates.length){ // a place-bound query: other-region pages are not competitors
  if(LISTICLE.test(String(lead.title||'')))return 'DIRECTORY_STYLE_LISTING_FOR_A_LOCAL_QUERY';
  const rStates=leadStates(lead);
  if(rStates.length&&!rStates.some(s=>qStates.includes(s)))return 'DIFFERENT_REGION:'+rStates.join(',');
 }
 return null;
}
// A kept lead either names the same market (a geographically comparable competitor) or names no place at all (a general
// informational source). The distinction is reported and same-market pages are read first.
function marketRelevance(lead={},marketStates=[]){
 if(!marketStates.length)return 'NO_MARKET_SCOPE';
 const st=leadStates(lead);
 return st.some(x=>marketStates.includes(x))?'SAME_MARKET':'NO_REGION_STATED_GENERAL_SOURCE';
}
module.exports={rejectLead,statesIn,leadStates,deriveMarket,marketRelevance,AGGREGATOR,US};
