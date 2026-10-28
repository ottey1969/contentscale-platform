'use strict';
// One HTML-entity decoder for every Growth module. Headings such as "&#128218; Related Articles" or "Google&rsquo;s"
// must be compared and shown as text, never as markup remnants.
const NAMED={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',mdash:'—',ndash:'–',hellip:'…',bull:'•',middot:'·',copy:'©',reg:'®',trade:'™',eacute:'é',egrave:'è',uuml:'ü',ouml:'ö',auml:'ä',rarr:'→',larr:'←',harr:'↔',uarr:'↑',darr:'↓',times:'×',divide:'÷',deg:'°',laquo:'«',raquo:'»',euro:'€',pound:'£',yen:'¥',sect:'§',para:'¶',check:'✓',hearts:'♥',minus:'−',plusmn:'±',frac12:'½',sup2:'²',aacute:'á',iacute:'í',oacute:'ó',uacute:'ú',ntilde:'ñ',ccedil:'ç',szlig:'ß'};
const cp=n=>{const v=Number(n);return Number.isInteger(v)&&v>0&&v<=0x10ffff&&!(v>=0xd800&&v<=0xdfff)?String.fromCodePoint(v):''};
function decodeEntities(text){
 return String(text==null?'':text)
  .replace(/&#x([0-9a-f]{1,6});?/gi,(_,h)=>cp(parseInt(h,16)))
  .replace(/&#(\d{1,7});?/g,(_,n)=>cp(n))
  .replace(/&([a-z0-9]{2,8});/gi,(m,n)=>NAMED[n.toLowerCase()]??m);
}
module.exports={decodeEntities};
