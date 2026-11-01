'use strict';
// Qualified Leads: how likely a search term is to lead to a business enquiry, and whether the page the searcher lands on
// lets them make one. Words of the search term only (no industry list): someone who wants to hire, someone who compares
// providers, someone who wants to learn, or not clear. English, Dutch, French and German modifiers, because the owner's
// markets include NL, BE, LU and GB. A class is an observation of the words, not a conversion forecast.

// Wants to hire or buy now: price, quote, hire, outsource, a provider nearby.
const HIRE=/\b(hire|hiring|outsourc\w*|inhuren|uitbesteden|aannemen|cost|costs|price|prices|pricing|rates?|quote|quotes|prijs|prijzen|kosten|tarief|tarieven|offerte|offertes|aanvragen|devis|tarifs?|prix|preise?|angebot|beauftragen|near me|nearby|in de buurt|bij mij in de buurt)\b/;
// Compares providers or options.
const COMPARE=/\b(best|top|vs|versus|compare|comparison|alternatives?|reviews?|rated|beste|vergelijk\w*|ervaringen|recensies?|meilleur\w*|comparatif|avis|vergleich\w*|bewertung\w*|empfehlung)\b|\btop\s*\d+\b/;
// A provider of the service is named (agency, consultant, freelancer, firm, specialist).
const PROVIDER=/\b(agency|agencies|consultant|consultants|consultancy|consulting|freelancer|freelancers|specialist|specialists|expert|experts|company|companies|firm|firms|provider|providers|services?|bureau|bureaus|adviseur|adviseurs|adviesbureau|specialisten|diensten|dienstverlening|bedrijf|bedrijven|agence|prestataire|cabinet|agentur|berater|dienstleister)\b/;
// Wants to learn or do it themselves.
const INFO=/\b(what|how|why|when|which|guide|tutorial|tips|examples?|definition|meaning|explained|template|checklist|course|learn|wat|hoe|waarom|wanneer|uitleg|betekenis|voorbeelden?|handleiding|zelf|comment|pourquoi|warum|anleitung|beispiele?)\b/;

const CLASSES={
 HIRE:{weight:1,label:'wants to hire or buy'},
 COMPARE:{weight:0.8,label:'compares providers or options'},
 UNCLEAR:{weight:0.5,label:'intent not clear from the words'},
 INFORMATION:{weight:0.35,label:'wants information'}
};
function leadIntentOf(query){
 const q=' '+String(query||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';
 const hire=HIRE.test(q),compare=COMPARE.test(q),provider=PROVIDER.test(q),info=INFO.test(q);
 const cls=compare?'COMPARE':hire?'HIRE':provider?(info?'COMPARE':'HIRE'):info?'INFORMATION':'UNCLEAR';
 const basis=[hire&&'a price, quote or hiring word',compare&&'a comparison word',provider&&'a provider of the service',info&&'a question or learning word'].filter(Boolean);
 return {class:cls,weight:CLASSES[cls].weight,label:CLASSES[cls].label,signals:{hire,compare,provider,info},
  basis:basis.length?'The search term contains '+basis.join(' and ')+'.':'The search term names only the topic, so the words do not show whether the searcher wants to hire, compare or learn.'};
}

// Can a visitor of this page contact the business? Read from the page HTML the Tracker saved (never fetched here).
const CONTACT_PATH=/(?:^|[/#?=_-])(contact|contacts|kontakt|contacto|contatto|contactez|offerte|offertes|quote|devis|angebot|aanvraag|aanvragen|afspraak|appointment|book|booking|boeken|reserveren|consult|consultation|intake|demo|get-in-touch|enquiry|inquiry|kennismaking|gesprek)(?:[/#?._-]|$)/i;
const BOOKING_HOSTS=/\b(calendly\.com|cal\.com|meetings\.hubspot\.com|savvycal\.com|tidycal\.com|zcal\.co|acuityscheduling\.com|wa\.me|api\.whatsapp\.com)\b/i;
function contactPathOf(html){
 const h=String(html||'');
 if(h.length<200)return {status:'UNKNOWN',detail:'The Tracker has no saved HTML of this page, so Growth cannot see whether visitors can contact you from it.'};
 for(const f of h.matchAll(/<form\b[\s\S]*?<\/form>/gi)){
  const body=f[0];
  if(/type=["']?(email|tel)\b|<textarea\b|name=["']?(e-?mail|phone|telefoon|message|bericht)\b/i.test(body)&&!/type=["']?search\b|role=["']?search/i.test(body))
   return {status:'CONTACT_FORM',detail:'The page has a form where visitors can leave their details or a message.'};
 }
 const links=[...h.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({href:m[1],text:m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}));
 const mail=links.find(l=>/^(mailto|tel):/i.test(l.href));
 const page=links.find(l=>{let p=l.href;try{p=new URL(l.href,'https://x.invalid/').pathname}catch{}return CONTACT_PATH.test(p)||BOOKING_HOSTS.test(l.href)});
 if(page||mail)return {status:'CONTACT_LINK',detail:'The page links to a way to contact you'+(page?' (“'+(page.text||page.href).slice(0,60)+'”)':' (e-mail or phone)')+'.'};
 return {status:'NO_CONTACT_PATH',detail:'Growth found no contact form, contact page link, booking link, e-mail or phone link on this page (saved HTML).'};
}
module.exports={leadIntentOf,contactPathOf,CLASSES};
