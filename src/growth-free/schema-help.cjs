'use strict';
// "Add structured data (schema)" with the how (owner 2026-11-12): what is on the live page now (so done work is ticked off
// by itself), and for each missing schema type a ready JSON-LD block, filled only with facts found on the page (business
// name, phone, e-mail, address, logo); everything else is "FILL IN: …", never invented.
const { pageElements } = require('../growth-competitor-overview.cjs');
const { factsOf } = require('./ai-gap.cjs');

const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const attr = (html, re) => { const m = String(html).match(re); return m ? decode(m[1]) : ''; };
// All JSON-LD nodes of the page (flattened @graph).
function jsonLd(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1]); } catch (e) { continue; }
    const walk = x => { if (Array.isArray(x)) return x.forEach(walk); if (x && typeof x === 'object') { out.push(x); if (x['@graph']) walk(x['@graph']); } };
    walk(j);
  }
  return out;
}
// Facts of the business as the page itself states them.
function pageFacts(html, url) {
  const nodes = jsonLd(html), typeOf = n => [].concat(n['@type'] || []).map(String);
  const biz = nodes.find(n => typeOf(n).some(t => /Business|Contractor|Organization|Service$|Store|Agency|Restaurant|Dentist|Physician|Attorney/i.test(t)) && n.name);
  const addrNode = (biz && biz.address && typeof biz.address === 'object' ? biz.address : null) || nodes.find(n => typeOf(n).includes('PostalAddress'));
  const tel = attr(html, /href=["']tel:([^"']+)["']/i) || (biz && biz.telephone) || '';
  const mail = attr(html, /href=["']mailto:([^"'?]+)["']/i) || (biz && biz.email) || '';
  const site = attr(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) || attr(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  const title = attr(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const logo = (biz && (typeof biz.logo === 'string' ? biz.logo : biz.logo && biz.logo.url)) || attr(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || '';
  let origin = ''; try { origin = new URL(url).origin + '/'; } catch (e) {}
  return {
    name: (biz && biz.name) || site || '', telephone: String(tel).trim(), email: String(mail).trim(), logo: String(logo || ''),
    address: addrNode ? { streetAddress: addrNode.streetAddress || '', addressLocality: addrNode.addressLocality || '', addressRegion: addrNode.addressRegion || '', postalCode: addrNode.postalCode || '', addressCountry: addrNode.addressCountry || '' } : null,
    pageTitle: title, url, origin,
  };
}
const FILL = what => 'FILL IN: ' + what;
const BUSINESS = /Business$|Contractor$|Agency$|Store$|Restaurant$|Dentist$|Physician$|Attorney$|Plumber$|Electrician$|Roofing|HVAC|Locksmith|Mover|Painter|Service$|Organization$/;
function addressOf(f) {
  const a = f.address || {};
  return { '@type': 'PostalAddress', streetAddress: a.streetAddress || FILL('street and number'), addressLocality: a.addressLocality || FILL('city'),
    ...(a.addressRegion ? { addressRegion: a.addressRegion } : {}), postalCode: a.postalCode || FILL('postal code'), addressCountry: a.addressCountry || FILL('country code, e.g. US, NL, ES') };
}
function businessNode(type, f) {
  return { '@type': type, '@id': (f.origin || f.url) + '#business', name: f.name || FILL('business name'), url: f.origin || f.url,
    telephone: f.telephone || FILL('phone number'), ...(f.email ? { email: f.email } : {}), ...(f.logo ? { image: f.logo } : {}),
    address: addressOf(f), areaServed: FILL('the area you serve, e.g. New Jersey') };
}
// A ready JSON-LD block for one missing schema type (or null when there is no safe template for it).
function snippetFor(type, f) {
  let graph;
  if (type === 'PostalAddress') graph = [businessNode('LocalBusiness', f)];
  else if (type === 'Service') graph = [{ '@type': 'Service', name: f.pageTitle ? f.pageTitle.split(/\s[|–—-]\s/)[0] : FILL('name of the service'), url: f.url,
    provider: { '@id': (f.origin || f.url) + '#business', '@type': 'LocalBusiness', name: f.name || FILL('business name') }, areaServed: FILL('the area you serve'), serviceType: FILL('the service, in your own words') }];
  else if (type === 'FAQPage') graph = [{ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: FILL('a question that is answered on this page'), acceptedAnswer: { '@type': 'Answer', text: FILL('the answer exactly as it is on the page') } }] }];
  else if (type === 'BreadcrumbList') graph = [{ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: f.origin || f.url }, { '@type': 'ListItem', position: 2, name: f.pageTitle || FILL('page name'), item: f.url }] }];
  else if (type === 'WebPage' || type === 'Article') graph = [{ '@type': type, headline: f.pageTitle || FILL('page title'), url: f.url, ...(type === 'Article' ? { author: { '@type': 'Organization', name: f.name || FILL('author or business name') }, datePublished: FILL('YYYY-MM-DD') } : {}) }];
  else if (/Rating|Review/.test(type)) return null; // only real reviews; no template that invites made-up ratings
  else if (BUSINESS.test(type) || type === 'LocalBusiness' || type === 'Organization') graph = [businessNode(type, f)];
  else return null;
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}
// What the live page has now, and the help for the schema types the research found missing.
function liveHelp(html, url, missingTypes = []) {
  const els = pageElements(html), facts = factsOf(html), f = pageFacts(html, url);
  const have = new Set(els.structured_data);
  const snippets = {};
  for (const t of missingTypes) if (!have.has(t)) { const s = snippetFor(t, f); if (s) snippets[t] = '<script type="application/ld+json">\n' + s + '\n</script>'; }
  return { schema_types: [...have], facts: Object.keys(facts), snippets, found: { name: !!f.name, telephone: !!f.telephone, email: !!f.email, address: !!f.address, logo: !!f.logo } };
}
module.exports = { liveHelp, pageFacts, snippetFor, jsonLd };
