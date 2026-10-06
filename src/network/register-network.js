// ContentScale Network v527 — authoritative Publication Readiness Engine; v526 deterministic 3x3 link repair + v538 recovery preserved
'use strict';

// CONTENTSCALE NETWORK — GENERATION RECOVERY + IMAGE CONTROL v509
// Rule: a Network failure may break Network only, never the core ContentScale app.
// This module owns only network_* tables and must not ALTER/DELETE core tables.

const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const multer = require('multer');
const networkImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

const NETWORK_SCHEMA_VERSION = 17;
const NETWORK_TABLES = [
  'network_websites',
  'network_content',
  'network_prewrite_approvals',
  'network_publication_versions',
  'network_placements',
  'network_placement_review_events',
  'network_credit_wallets',
  'network_credit_transactions',
  'network_verification_runs',
  'network_publication_images',
  'network_image_library',
  'network_referral_partners',
  'network_referral_codes',
  'network_referrals',
  'network_publisher_applications',
  'network_publisher_accounts',
  'network_ads',
  'network_directory_businesses'
];


const NETWORK_LOCALES = [
  ['en-US','English','United States','LTR'],['en-GB','English','United Kingdom','LTR'],['en-AU','English','Australia','LTR'],['en-CA','English','Canada','LTR'],
  ['nl-NL','Dutch','Netherlands','LTR'],['nl-BE','Dutch','Belgium','LTR'],['de-DE','German','Germany','LTR'],['de-AT','German','Austria','LTR'],['de-CH','German','Switzerland','LTR'],
  ['fr-FR','French','France','LTR'],['fr-BE','French','Belgium','LTR'],['fr-CA','French','Canada','LTR'],['es-ES','Spanish','Spain','LTR'],['es-MX','Spanish','Mexico','LTR'],['es-US','Spanish','United States','LTR'],
  ['it-IT','Italian','Italy','LTR'],['pt-PT','Portuguese','Portugal','LTR'],['pt-BR','Portuguese','Brazil','LTR'],['pl-PL','Polish','Poland','LTR'],['ro-RO','Romanian','Romania','LTR'],['bg-BG','Bulgarian','Bulgaria','LTR'],
  ['ru-RU','Russian','Russia','LTR'],['uk-UA','Ukrainian','Ukraine','LTR'],['fi-FI','Finnish','Finland','LTR'],['sv-SE','Swedish','Sweden','LTR'],['nb-NO','Norwegian','Norway','LTR'],['da-DK','Danish','Denmark','LTR'],
  ['cs-CZ','Czech','Czechia','LTR'],['sk-SK','Slovak','Slovakia','LTR'],['hu-HU','Hungarian','Hungary','LTR'],['el-GR','Greek','Greece','LTR'],['tr-TR','Turkish','Türkiye','LTR'],
  ['ar-SA','Arabic','Saudi Arabia','RTL'],['ar-AE','Arabic','United Arab Emirates','RTL'],['ar-EG','Arabic','Egypt','RTL'],['he-IL','Hebrew','Israel','RTL'],
  ['zh-CN','Chinese','China','LTR'],['zh-TW','Chinese','Taiwan','LTR'],['zh-HK','Chinese','Hong Kong','LTR'],['ja-JP','Japanese','Japan','LTR'],['ko-KR','Korean','South Korea','LTR'],
  ['hi-IN','Hindi','India','LTR'],['bn-BD','Bengali','Bangladesh','LTR'],['ur-PK','Urdu','Pakistan','RTL'],['id-ID','Indonesian','Indonesia','LTR'],['ms-MY','Malay','Malaysia','LTR'],['th-TH','Thai','Thailand','LTR'],['vi-VN','Vietnamese','Vietnam','LTR'],['fil-PH','Filipino','Philippines','LTR']
];
function localeDirection(code){const x=NETWORK_LOCALES.find(r=>r[0]===code);return x?x[3]:'LTR'}
function safeJsonObject(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
async function invalidateNetworkRenderedState(pool,placementId,reason){
  const pid=Number(placementId),r=await pool.query(`SELECT id,generation_input_snapshot FROM network_publication_versions WHERE placement_id=$1 LIMIT 1`,[pid]);
  const row=r.rows[0];if(!row)return;const next=safeJsonObject(row.generation_input_snapshot);delete next.official_contentscore_scan;next.internal_preview_hash=null;delete next.seo_publication_copied_hash;delete next.seo_publication_copied_at;next.render_state_invalidated_at=new Date().toISOString();next.render_state_invalidated_reason=cleanText(reason||'content_changed',120);
  await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(next)]);
  await pool.query(`UPDATE network_placements SET status=CASE WHEN status IN ('submitted','verifying','verified') THEN 'needs_review' ELSE status END,verification_decision=CASE WHEN status IN ('submitted','verifying','verified') THEN NULL ELSE verification_decision END,updated_at=NOW() WHERE id=$1`,[pid]);
}

const NETWORK_NICHE_RULES = [
  {main:'Marketing',sub:'SEO',terms:['seo','search engine optimization','search optimisation','ai seo','ai search','google ai overview','google ai overviews','aio seo','organic search'],topics:['AI SEO','AI Search Visibility','Google AI Overviews','Organic Search']},
  {main:'Marketing',sub:'Content Marketing',terms:['content marketing','content strategy','copywriting','blogging','editorial content'],topics:['Content Strategy','Content Creation']},
  {main:'Marketing',sub:'Paid Advertising',terms:['ppc','paid ads','google ads','facebook ads','meta ads','paid advertising'],topics:['PPC','Paid Media']},
  {main:'Marketing',sub:'Social Media',terms:['social media','instagram marketing','linkedin marketing','tiktok marketing'],topics:['Social Media Marketing']},
  {main:'Marketing',sub:'Email Marketing',terms:['email marketing','newsletter marketing','email automation'],topics:['Email Marketing']},
  {main:'Marketing',sub:'Branding & PR',terms:['branding','brand strategy','public relations','pr agency','digital pr'],topics:['Branding','Public Relations']},
  {main:'Home Services',sub:'Roofing',terms:['roofing','roofer','roof repair','roof replacement','shingle','flat roof'],topics:['Roof Repair','Roof Replacement']},
  {main:'Home Services',sub:'Plumbing',terms:['plumbing','plumber','drain cleaning','pipe repair'],topics:['Plumbing']},
  {main:'Home Services',sub:'HVAC',terms:['hvac','air conditioning','heating','furnace','heat pump'],topics:['HVAC']},
  {main:'Home Services',sub:'Electrical',terms:['electrician','electrical contractor','electrical repair'],topics:['Electrical']},
  {main:'Home Services',sub:'Landscaping',terms:['landscaping','landscape','lawn care','garden maintenance'],topics:['Landscaping']},
  {main:'Finance & Business Services',sub:'Accounting',terms:['accounting','accountant','bookkeeping','tax preparation','cpa'],topics:['Accounting','Tax']},
  {main:'Finance & Business Services',sub:'Financial Services',terms:['financial services','investment','wealth management','financial advisor','trading platform','broker'],topics:['Finance','Investing']},
  {main:'Finance & Business Services',sub:'Insurance',terms:['insurance','insurance broker','insurance agency'],topics:['Insurance']},
  {main:'Finance & Business Services',sub:'Consulting',terms:['consulting','business consultant','management consulting'],topics:['Business Consulting']},
  {main:'Legal',sub:'Legal Services',terms:['law firm','lawyer','attorney','legal services'],topics:['Legal']},
  {main:'Real Estate',sub:'Real Estate Services',terms:['real estate','realtor','property management','real estate agent'],topics:['Real Estate']},
  {main:'Healthcare',sub:'Healthcare Services',terms:['healthcare','medical clinic','doctor','dentist','dental','physician','hospital'],topics:['Healthcare']},
  {main:'Beauty & Wellness',sub:'Beauty & Wellness',terms:['beauty','salon','spa','wellness','skincare','hair salon','nail salon'],topics:['Beauty','Wellness']},
  {main:'Technology',sub:'Software & SaaS',terms:['software','saas','software as a service','app development','web app'],topics:['Software','SaaS']},
  {main:'Technology',sub:'AI & Automation',terms:['artificial intelligence',' ai ','machine learning','automation','ai tools','ai platform'],topics:['Artificial Intelligence','Automation']},
  {main:'Technology',sub:'Cybersecurity',terms:['cybersecurity','cyber security','information security','infosec'],topics:['Cybersecurity']},
  {main:'Ecommerce & Retail',sub:'Ecommerce',terms:['ecommerce','e-commerce','online store','shopify','woocommerce'],topics:['Ecommerce']},
  {main:'Automotive',sub:'Automotive Services',terms:['automotive','auto repair','car repair','garage','mechanic'],topics:['Automotive']},
  {main:'Education',sub:'Education & Training',terms:['education','training','online course','school','academy','tutoring'],topics:['Education']},
  {main:'Travel & Hospitality',sub:'Travel & Hospitality',terms:['travel','hotel','resort','tourism','vacation rental'],topics:['Travel','Hospitality']},
  {main:'Food & Hospitality',sub:'Restaurants & Food',terms:['restaurant','catering','food service','bakery','cafe','coffee shop'],topics:['Food','Restaurants']}
];

function classifyNetworkNiche(input){
  const raw=cleanText(input,240);
  const q=(' '+raw.toLowerCase().replace(/[^a-z0-9+#&]+/g,' ')+' ').replace(/\s+/g,' ');
  let best=null,bestScore=0;
  for(const rule of NETWORK_NICHE_RULES){
    let score=0;
    for(const term of rule.terms){
      const t=term.toLowerCase();
      if(q.includes(' '+t+' ')) score+=100+t.length;
      else if(q.includes(t)) score+=35+t.length;
    }
    if(score>bestScore){best=rule;bestScore=score}
  }
  if(!raw) return {input:'',main_niche:null,sub_niche:null,topics:[],confidence:'none',needs_confirmation:true};
  if(best){
    return {
      input:raw,
      main_niche:best.main,
      sub_niche:best.sub,
      topics:Array.from(new Set(best.topics||[])),
      confidence:bestScore>=100?'high':'medium',
      needs_confirmation:bestScore<100
    };
  }
  return {
    input:raw,
    main_niche:'Other',
    sub_niche:raw,
    topics:[],
    confidence:'low',
    needs_confirmation:true
  };
}

function firstThreeWords(v){return cleanText(v,300).split(/\s+/).filter(Boolean).slice(0,3).join(' ')}
function normalizeImageKey(v){return cleanText(v,255).toLowerCase().replace(/\.(jpe?g|png|webp)$/i,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,220)}

function networkSlug(v){
  return cleanText(v,260).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,180) || crypto.randomBytes(6).toString('hex');
}
function publicDirectoryBusiness(row){
  if(!row)return null;
  return {slug:row.slug,business_name:row.business_name,domain:row.domain,canonical_url:row.canonical_url,description:row.description||null,source:row.source||null,primary_niche:row.primary_niche||null,sub_niche:row.sub_niche||null,topic_tags:Array.isArray(row.topic_tags)?row.topic_tags:[],market:row.market||null,country:row.country||null,language:row.language||null,status:row.status,verified_at:row.verified_at||null,created_at:row.created_at||null};
}
function directoryStatusCopy(status){
  const s=String(status||'unclaimed');
  if(s==='verified')return 'Verified Business';
  if(s==='claim_pending')return 'Claim submitted · awaiting review';
  if(s==='rejected')return 'Verification not approved';
  return 'Unclaimed · not yet verified by the business';
}

function directoryCountryName(code){
  const m={NL:'Netherlands',BE:'Belgium',US:'United States',GB:'United Kingdom',DE:'Germany',FR:'France',ES:'Spain',IT:'Italy',PT:'Portugal',CA:'Canada',AU:'Australia',NZ:'New Zealand',IE:'Ireland',CH:'Switzerland',AT:'Austria',SE:'Sweden',NO:'Norway',DK:'Denmark',FI:'Finland',PL:'Poland',CZ:'Czechia',RO:'Romania',GR:'Greece',PH:'Philippines',AE:'United Arab Emirates',SA:'Saudi Arabia',IN:'India',SG:'Singapore',MY:'Malaysia',ID:'Indonesia'};
  const c=cleanText(code,20).toUpperCase();return m[c]||cleanText(code,120)||'—';
}
function directoryLanguageName(code){
  const m={'nl-NL':'Dutch','nl-BE':'Dutch (Belgium)','en-US':'English (US)','en-GB':'English (UK)','en-AU':'English (Australia)','en-CA':'English (Canada)','de-DE':'German','fr-FR':'French','es-ES':'Spanish','it-IT':'Italian','pt-PT':'Portuguese','pt-BR':'Portuguese (Brazil)','fil-PH':'Filipino','en-PH':'English (Philippines)','ar-SA':'Arabic','ar-AE':'Arabic (UAE)','hi-IN':'Hindi','id-ID':'Indonesian','ms-MY':'Malay'};
  return m[cleanText(code,30)]||cleanText(code,60)||'—';
}


function normalizeNetworkMarketInput(input){
  const raw=cleanText(input,120);if(!raw)return null;
  const k=raw.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\./g,'').trim();
  const map={
    'us':'US','usa':'US','united states':'US','united states of america':'US','america':'US','verenigde staten':'US',
    'uk':'GB','gb':'GB','united kingdom':'GB','great britain':'GB','britain':'GB','england':'GB','verenigd koninkrijk':'GB',
    'nl':'NL','netherlands':'NL','the netherlands':'NL','nederland':'NL','holland':'NL',
    'be':'BE','belgium':'BE','belgie':'BE','belgië':'BE',
    'de':'DE','germany':'DE','deutschland':'DE','duitsland':'DE',
    'fr':'FR','france':'FR','frankrijk':'FR',
    'es':'ES','spain':'ES','espana':'ES','españa':'ES','spanje':'ES',
    'it':'IT','italy':'IT','italia':'IT','italie':'IT','italië':'IT',
    'pt':'PT','portugal':'PT',
    'br':'BR','brazil':'BR','brasil':'BR','brazilie':'BR','brazilië':'BR',
    'ca':'CA','canada':'CA',
    'au':'AU','australia':'AU','australie':'AU','australië':'AU',
    'nz':'NZ','new zealand':'NZ','nieuw zeeland':'NZ',
    'ie':'IE','ireland':'IE','ierland':'IE',
    'ch':'CH','switzerland':'CH','zwitserland':'CH',
    'at':'AT','austria':'AT','oostenrijk':'AT',
    'se':'SE','sweden':'SE','zweden':'SE',
    'no':'NO','norway':'NO','noorwegen':'NO',
    'dk':'DK','denmark':'DK','denemarken':'DK',
    'fi':'FI','finland':'FI',
    'pl':'PL','poland':'PL','polen':'PL',
    'cz':'CZ','czechia':'CZ','czech republic':'CZ','tsjechie':'CZ','tsjechië':'CZ',
    'ro':'RO','romania':'RO','roemenie':'RO','roemenië':'RO',
    'gr':'GR','greece':'GR','griekenland':'GR',
    'ph':'PH','philippines':'PH','the philippines':'PH','filipijnen':'PH',
    'ae':'AE','uae':'AE','united arab emirates':'AE','verenigde arabische emiraten':'AE',
    'sa':'SA','saudi arabia':'SA','saudi':'SA','saoedi arabie':'SA','saoedi-arabie':'SA',
    'in':'IN','india':'IN','indiaas':'IN',
    'sg':'SG','singapore':'SG',
    'my':'MY','malaysia':'MY',
    'id':'ID','indonesia':'ID','indonesie':'ID','indonesië':'ID',
    'mx':'MX','mexico':'MX',
    'cn':'CN','china':'CN',
    'tw':'TW','taiwan':'TW',
    'hk':'HK','hong kong':'HK',
    'jp':'JP','japan':'JP',
    'kr':'KR','south korea':'KR','korea':'KR'
  };
  if(map[k])return map[k];
  if(/^[a-z]{2}$/i.test(raw))return raw.toUpperCase();
  return raw;
}

function normalizeNetworkLocaleInput(languageInput,marketInput){
  const raw=cleanText(languageInput,80);
  const market=normalizeNetworkMarketInput(marketInput);
  if(!raw)return {language:null,market};
  const compact=raw.trim();
  if(/^[a-z]{2}-[a-z]{2}$/i.test(compact)){
    const p=compact.split('-');return {language:p[0].toLowerCase()+'-'+p[1].toUpperCase(),market:market||p[1].toUpperCase()};
  }
  const k=compact.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim();
  const langAliases={
    'dutch':'nl','nederlands':'nl','nederlandse':'nl',
    'english':'en','engels':'en',
    'german':'de','deutsch':'de','duits':'de',
    'french':'fr','francais':'fr','français':'fr','frans':'fr',
    'spanish':'es','espanol':'es','español':'es','spaans':'es',
    'italian':'it','italiano':'it','italiaans':'it',
    'portuguese':'pt','portugues':'pt','português':'pt','portugees':'pt',
    'arabic':'ar','arabisch':'ar','العربية':'ar',
    'chinese':'zh','chinees':'zh','中文':'zh',
    'japanese':'ja','japans':'ja','日本語':'ja',
    'korean':'ko','koreaans':'ko','한국어':'ko',
    'hindi':'hi','हिन्दी':'hi',
    'filipino':'fil','tagalog':'fil','filipijns':'fil',
    'indonesian':'id','bahasa indonesia':'id','indonesisch':'id',
    'malay':'ms','bahasa melayu':'ms','maleis':'ms',
    'polish':'pl','polski':'pl','pools':'pl',
    'romanian':'ro','romana':'ro','roemeens':'ro',
    'russian':'ru','русский':'ru','russisch':'ru',
    'ukrainian':'uk','українська':'uk','oekraïens':'uk',
    'finnish':'fi','suomi':'fi','fins':'fi',
    'swedish':'sv','svenska':'sv','zweeds':'sv',
    'norwegian':'nb','norsk':'nb','noors':'nb',
    'danish':'da','dansk':'da','deens':'da',
    'turkish':'tr','turkce':'tr','türkçe':'tr','turks':'tr',
    'greek':'el','ελληνικά':'el','grieks':'el',
    'hebrew':'he','עברית':'he','hebreeuws':'he',
    'thai':'th','ไทย':'th',
    'vietnamese':'vi','tiếng việt':'vi','vietnamees':'vi'
  };
  let lang=/^[a-z]{2,3}$/i.test(k)?k.toLowerCase():(langAliases[k]||null);
  if(!lang)return {language:compact,market};
  const byMarket={
    en:{US:'en-US',GB:'en-GB',AU:'en-AU',CA:'en-CA',PH:'en-PH',IE:'en-IE',SG:'en-SG',IN:'en-IN',NZ:'en-NZ'},
    nl:{NL:'nl-NL',BE:'nl-BE'},
    de:{DE:'de-DE',AT:'de-AT',CH:'de-CH'},
    fr:{FR:'fr-FR',BE:'fr-BE',CA:'fr-CA',CH:'fr-CH'},
    es:{ES:'es-ES',MX:'es-MX',US:'es-US'},
    pt:{PT:'pt-PT',BR:'pt-BR'},
    ar:{SA:'ar-SA',AE:'ar-AE',EG:'ar-EG'},
    zh:{CN:'zh-CN',TW:'zh-TW',HK:'zh-HK'}
  };
  const defaults={en:'en-US',nl:'nl-NL',de:'de-DE',fr:'fr-FR',es:'es-ES',it:'it-IT',pt:'pt-PT',ar:'ar-SA',zh:'zh-CN',ja:'ja-JP',ko:'ko-KR',hi:'hi-IN',fil:'fil-PH',id:'id-ID',ms:'ms-MY',pl:'pl-PL',ro:'ro-RO',ru:'ru-RU',uk:'uk-UA',fi:'fi-FI',sv:'sv-SE',nb:'nb-NO',da:'da-DK',tr:'tr-TR',el:'el-GR',he:'he-IL',th:'th-TH',vi:'vi-VN'};
  const language=(byMarket[lang]&&market&&byMarket[lang][market])||defaults[lang]||compact;
  const inferredMarket=market||((/^[a-z]{2,3}-[A-Z]{2}$/.test(language))?language.split('-')[1]:null);
  return {language,market:inferredMarket};
}

function envEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.NETWORK_ENABLED || '').trim());
}

function cleanText(v, max = 500) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

async function ensureNetworkPrewriteApprovalTable(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS network_prewrite_approvals (
    id BIGSERIAL PRIMARY KEY,
    prewrite_brief_id BIGINT NOT NULL,
    brief_hash TEXT NOT NULL,
    brief_snapshot JSONB NOT NULL,
    approved_contract JSONB NOT NULL DEFAULT '{}'::jsonb,
    readiness_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    approved_by_admin_id TEXT,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invalidated_at TIMESTAMPTZ,
    invalidated_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(prewrite_brief_id, brief_hash)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_network_prewrite_approvals_active ON network_prewrite_approvals(prewrite_brief_id,approved_at DESC) WHERE invalidated_at IS NULL`);
}


async function ensurePublisherApplySchema(pool) {
  // Public publisher signup must survive an old or partially initialized Network.
  // If the publisher tables do not exist yet, initialize ONLY the network_* schema.
  const exists=await pool.query(`SELECT
    to_regclass('public.network_publisher_applications') AS applications,
    to_regclass('public.network_publisher_accounts') AS accounts,
    to_regclass('public.network_websites') AS websites`);
  if(!exists.rows[0]?.applications || !exists.rows[0]?.accounts || !exists.rows[0]?.websites){
    await ensureNetworkTables(pool);
  }

  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS brand_name TEXT`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS contact_name TEXT`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS email TEXT`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS niche TEXT`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS niche_main TEXT`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS niche_sub TEXT`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS niche_topics JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS niche_confidence TEXT`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS market TEXT`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS language TEXT`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS message TEXT`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS referral_code TEXT`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  await pool.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS application_id BIGINT REFERENCES network_publisher_applications(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS website_id BIGINT REFERENCES network_websites(id) ON DELETE RESTRICT`);
  await pool.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS email TEXT`);
  await pool.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS contact_name TEXT`);
  await pool.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS access_token TEXT`);
  await pool.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`);
  await pool.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  // Same repair on the public apply path, so signup does not depend on an Admin init click.
  await pool.query(`ALTER TABLE network_publisher_accounts ALTER COLUMN website_id DROP NOT NULL`);
  await pool.query(`ALTER TABLE network_publisher_accounts ALTER COLUMN application_id DROP NOT NULL`);

  await pool.query(`ALTER TABLE network_websites ADD COLUMN IF NOT EXISTS sub_niche TEXT`);
  await pool.query(`ALTER TABLE network_websites ADD COLUMN IF NOT EXISTS topic_tags JSONB NOT NULL DEFAULT '[]'::jsonb`);
}

async function networkNotifyOwnerPublisherApplication(pool, appRow, extra = {}) {
  const row = appRow || {};
  const key = String(process.env.BREVO_API_KEY || '').trim();
  const toEmail = cleanText(process.env.NETWORK_NOTIFY_EMAIL || process.env.QUICK_SCAN_NOTIFY_EMAIL || 'info@contentscale.site', 320);
  const fromEmail = cleanText(process.env.FROM_EMAIL || 'info@contentscale.site', 320);
  const source = cleanText(extra.source || (row.metadata && row.metadata.source) || 'network_landing', 100);
  const referredBy = cleanText(extra.referred_by || '', 220);
  const appId = Number(row.id || 0);
  const status = {
    state: key ? 'pending' : 'not_configured',
    attempted_at: new Date().toISOString(),
    to: toEmail,
    provider: key ? 'brevo' : null,
    error: key ? null : 'BREVO_API_KEY is not configured'
  };

  if (!key) {
    if (appId) {
      await pool.query(
        `UPDATE network_publisher_applications
         SET metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb, updated_at=NOW()
         WHERE id=$1`,
        [appId, JSON.stringify({ owner_notification: status })]
      ).catch(()=>{});
    }
    return status;
  }

  const esc = v => String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const adminUrl = 'https://app.contentscale.site/network/advertising';
  const brand = cleanText(row.brand_name || row.domain || 'New publisher', 220);
  const subject = `New Network Publisher Application — ${brand}`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
    <h2>New ContentScale Network publisher application</h2>
    <p>
      <b>Business:</b> ${esc(row.brand_name || '—')}<br>
      <b>Domain:</b> ${esc(row.domain || '—')}<br>
      <b>Contact:</b> ${esc(row.contact_name || '—')}<br>
      <b>Email:</b> ${esc(row.email || '—')}<br>
      <b>Niche:</b> ${esc(row.niche || '—')}<br>
      <b>Source:</b> ${esc(source)}${referredBy ? `<br><b>Referred by:</b> ${esc(referredBy)}` : ''}
    </p>
    ${row.message ? `<p><b>Message:</b><br>${esc(row.message)}</p>` : ''}
    <p><a href="${adminUrl}">Open publisher applications in Network Admin</a></p>
  </div>`;

  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({
        to: [{ email: toEmail }],
        sender: { email: fromEmail, name: 'ContentScale Network' },
        subject,
        htmlContent: html
      })
    });
    const body = await r.text().catch(()=> '');
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${body.slice(0,300)}`);
    status.state = 'sent';
    status.sent_at = new Date().toISOString();
    status.error = null;
  } catch (e) {
    status.state = 'failed';
    status.error = cleanText(e && e.message || e, 500);
  }

  if (appId) {
    await pool.query(
      `UPDATE network_publisher_applications
       SET metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb, updated_at=NOW()
       WHERE id=$1`,
      [appId, JSON.stringify({ owner_notification: status })]
    ).catch(()=>{});
  }
  return status;
}



async function networkSendBrevoMessage({to,subject,html}) {
  const key=String(process.env.BREVO_API_KEY||'').trim();
  const fromEmail=cleanText(process.env.FROM_EMAIL||'info@contentscale.site',320);
  const email=cleanText(to,320).toLowerCase();
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {state:'skipped',error:'No valid recipient'};
  if(!key)return {state:'not_configured',error:'BREVO_API_KEY is not configured'};
  try{
    const r=await fetch('https://api.brevo.com/v3/smtp/email',{
      method:'POST',
      headers:{'Content-Type':'application/json','api-key':key},
      body:JSON.stringify({to:[{email}],sender:{email:fromEmail,name:'ContentScale Network'},subject,htmlContent:html})
    });
    const body=await r.text().catch(()=> '');
    if(!r.ok)throw new Error(`Brevo ${r.status}: ${body.slice(0,300)}`);
    return {state:'sent',sent_at:new Date().toISOString()};
  }catch(e){return {state:'failed',error:cleanText(e&&e.message||e,500)}}
}

async function ensureBusinessClaimDashboardToken(pool,row){
  if(!row||!row.id)return null;
  const meta=Object.assign({},safeJsonObject(row.metadata));
  let token=cleanText(meta.claim_access_token||'',128);
  if(!/^[a-f0-9]{64}$/i.test(token)){
    token=crypto.randomBytes(32).toString('hex');
    meta.claim_access_token=token;
    meta.claim_dashboard_created_at=meta.claim_dashboard_created_at||new Date().toISOString();
    await pool.query(`UPDATE network_directory_businesses SET metadata=$2::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(meta)]);
  }
  row.metadata=meta;
  return token;
}

async function networkNotifyDirectoryClaim(pool,row,event='claim_submitted',note='') {
  const x=row||{},esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const adminEmail=cleanText(process.env.NETWORK_NOTIFY_EMAIL||process.env.QUICK_SCAN_NOTIFY_EMAIL||'info@contentscale.site',320);
  const claimantEmail=cleanText(x.claim_email||'',320).toLowerCase();
  const profileUrl='https://app.contentscale.site/network/directory/'+encodeURIComponent(x.slug||'');
  const claimToken=cleanText(safeJsonObject(x.metadata).claim_access_token||'',128);
  const dashboardUrl=/^[a-f0-9]{64}$/i.test(claimToken)?('https://app.contentscale.site/network/business/'+claimToken):profileUrl;
  let claimant={state:'skipped'},admin={state:'skipped'};
  if(event==='claim_submitted'){
    claimant=await networkSendBrevoMessage({
      to:claimantEmail,
      subject:`We received your ContentScale business claim — ${cleanText(x.business_name||'Business',180)}`,
      html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>Business claim received</h2><p>Hi ${esc(x.claim_name||'there')},</p><p>We received your request to verify <b>${esc(x.business_name||'your business')}</b>.</p><p>Status: <b>Awaiting ContentScale review</b>.</p><p><a href="${dashboardUrl}">Open your guided business dashboard</a></p></div>`
    });
    admin=await networkSendBrevoMessage({
      to:adminEmail,
      subject:`Business claim waiting for review — ${cleanText(x.business_name||'Business',180)}`,
      html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>New Directory claim</h2><p><b>Business:</b> ${esc(x.business_name||'—')}<br><b>Domain:</b> ${esc(x.domain||'—')}<br><b>Claimant:</b> ${esc(x.claim_name||'—')}<br><b>Email:</b> ${esc(x.claim_email||'—')}</p><p><a href="https://app.contentscale.site/network/directory/admin">Open Business Verification Cockpit</a></p></div>`
    });
  } else if(event==='verified'||event==='rejected'){
    const verified=event==='verified';
    claimant=await networkSendBrevoMessage({
      to:claimantEmail,
      subject:verified?`Your ContentScale business profile is verified — ${cleanText(x.business_name||'Business',180)}`:`Update on your ContentScale business verification — ${cleanText(x.business_name||'Business',180)}`,
      html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>${verified?'Business verified':'Verification not approved yet'}</h2><p>Hi ${esc(x.claim_name||'there')},</p><p><b>${esc(x.business_name||'Your business')}</b>: ${verified?'your business profile has been verified.':'the verification request was not approved.'}</p>${note?`<p><b>Review note:</b> ${esc(note)}</p>`:''}<p><a href="${dashboardUrl}">Open your guided business dashboard</a></p></div>`
    });
  }
  const meta=Object.assign({},safeJsonObject(x.metadata)),notifications=Object.assign({},safeJsonObject(meta.directory_notifications));
  notifications[event]={at:new Date().toISOString(),claimant,admin};meta.directory_notifications=notifications;
  if(x.id)await pool.query(`UPDATE network_directory_businesses SET metadata=$2::jsonb,updated_at=NOW() WHERE id=$1`,[x.id,JSON.stringify(meta)]).catch(()=>{});
  return {claimant,admin};
}

async function networkNotifyOwnerAdRequest(pool, adRow) {
  const row = adRow || {};
  const key = String(process.env.BREVO_API_KEY || '').trim();
  const toEmail = cleanText(process.env.NETWORK_NOTIFY_EMAIL || process.env.QUICK_SCAN_NOTIFY_EMAIL || 'info@contentscale.site', 320);
  const fromEmail = cleanText(process.env.FROM_EMAIL || 'info@contentscale.site', 320);
  const status = {
    state: key ? 'pending' : 'not_configured',
    attempted_at: new Date().toISOString(),
    to: toEmail,
    provider: key ? 'brevo' : null,
    error: key ? null : 'BREVO_API_KEY is not configured'
  };
  if (!key) return status;

  const esc = v => String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({
        to: [{ email: toEmail }],
        sender: { email: fromEmail, name: 'ContentScale Network' },
        subject: `New Network Advertising Request — ${cleanText(row.company_name || row.headline || 'Advertiser', 180)}`,
        htmlContent: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2>New ContentScale Network advertising request</h2>
          <p>
            <b>Company:</b> ${esc(row.company_name || '—')}<br>
            <b>Contact:</b> ${esc(row.contact_name || '—')}<br>
            <b>Email:</b> ${esc(row.contact_email || '—')}<br>
            <b>Headline:</b> ${esc(row.headline || '—')}<br>
            <b>Target URL:</b> ${esc(row.target_url || '—')}<br>
            <b>Niche:</b> ${esc(row.niche || '—')}<br>
            <b>Requested placement:</b> Homepage
          </p>
          ${row.description ? `<p><b>Description:</b><br>${esc(row.description)}</p>` : ''}
          <p><a href="https://app.contentscale.site/network/advertising">Review advertising request in Network Admin</a></p>
        </div>`
      })
    });
    const body = await r.text().catch(()=> '');
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${body.slice(0,300)}`);
    status.state = 'sent';
    status.sent_at = new Date().toISOString();
    status.error = null;
  } catch (e) {
    status.state = 'failed';
    status.error = cleanText(e && e.message || e, 500);
  }
  return status;
}


async function networkNotifyPublisherReviewDecision(pool, row, decision, note) {
  const key = String(process.env.BREVO_API_KEY || '').trim();
  const toEmail = cleanText(row && row.publisher_email, 320);
  const fromEmail = cleanText(process.env.FROM_EMAIL || 'info@contentscale.site', 320);
  const status = {
    state: key && toEmail ? 'pending' : 'not_configured',
    attempted_at: new Date().toISOString(),
    to: toEmail || null,
    provider: key ? 'brevo' : null,
    error: null
  };
  if (!toEmail) {
    status.error = 'Publisher email is not available';
    return status;
  }
  if (!key) {
    status.error = 'BREVO_API_KEY is not configured';
    return status;
  }

  const esc = v => String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const publisher = cleanText(row.publisher_brand || row.publisher_domain || 'Publisher', 220);
  const article = cleanText(row.edition_title || row.opportunity_title || 'Network publication', 260);
  const dashboardUrl = row.publisher_dashboard_token
    ? `https://app.contentscale.site/network/publisher/${row.publisher_dashboard_token}`
    : 'https://app.contentscale.site/network';

  const copy = decision === 'verified'
    ? {
        subject: `ContentScale Network: placement verified — ${article}`,
        title: 'Your placement has been verified',
        body: 'Your live publication passed the final manual review.',
        next: 'The placement is now verified. Any eligible placement credits can now be released through the Network reward flow.'
      }
    : decision === 'needs_changes'
      ? {
          subject: `ContentScale Network: changes requested — ${article}`,
          title: 'Changes are required on your placement',
          body: 'We reviewed the live publication and need a correction before it can be verified.',
          next: 'Please update the live page, then submit the live URL again from your Publisher Dashboard.'
        }
      : {
          subject: `ContentScale Network: placement rejected — ${article}`,
          title: 'Your placement was not approved',
          body: 'The submitted publication did not pass the final manual review.',
          next: 'Review the reason below. If a new placement becomes available, it will appear in your Publisher Dashboard.'
        };

  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {'Content-Type':'application/json','api-key':key},
      body: JSON.stringify({
        to: [{email:toEmail}],
        sender: {email:fromEmail,name:'ContentScale Network'},
        subject: copy.subject,
        htmlContent: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2>${esc(copy.title)}</h2>
          <p>Hello ${esc(row.publisher_contact_name || publisher)},</p>
          <p>${esc(copy.body)}</p>
          <p>
            <b>Publisher:</b> ${esc(publisher)}<br>
            <b>Publication:</b> ${esc(article)}<br>
            <b>Live URL:</b> ${row.published_url ? `<a href="${esc(row.published_url)}">${esc(row.published_url)}</a>` : '—'}<br>
            <b>Decision:</b> ${esc(decision.replace(/_/g,' '))}
          </p>
          ${note ? `<p><b>Review note:</b><br>${esc(note)}</p>` : ''}
          <p>${esc(copy.next)}</p>
          <p><a href="${esc(dashboardUrl)}">Open your Publisher Dashboard</a></p>
        </div>`
      })
    });
    const body = await r.text().catch(()=> '');
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${body.slice(0,300)}`);
    status.state = 'sent';
    status.sent_at = new Date().toISOString();
    status.error = null;
  } catch (e) {
    status.state = 'failed';
    status.error = cleanText(e && e.message || e, 500);
  }
  return status;
}


function normalizeSite(input) {
  let raw = cleanText(input, 2048);
  if (!raw) throw new Error('Website/domain is required');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http/https websites are allowed');
  u.hash = '';
  const hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  if (!hostname || !hostname.includes('.')) throw new Error('Enter a real public domain');
  return {
    domain: hostname,
    canonical_url: `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`
  };
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] >= 224;
  }
  const s = ip.toLowerCase();
  return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') ||
    s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb') ||
    s.startsWith('::ffff:127.') || s.startsWith('::ffff:10.') || s.startsWith('::ffff:192.168.');
}

async function assertPublicHostname(hostname) {
  if (!hostname) throw new Error('Invalid hostname');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Local/private hosts are not allowed');
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Private/reserved IP addresses are not allowed');
    return;
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error('Domain does not resolve');
  if (records.some(r => isPrivateIp(r.address))) throw new Error('Domain resolves to a private/reserved address');
}

async function safeFetchHtml(startUrl) {
  let current = new URL(startUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    for (let hop = 0; hop < 5; hop++) {
      await assertPublicHostname(current.hostname);
      const r = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'ContentScaleNetworkSiteCheck/1.0 (+https://app.contentscale.site/network)',
          'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'
        }
      });
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const loc = r.headers.get('location');
        if (!loc) throw new Error('Redirect without destination');
        current = new URL(loc, current);
        if (!['http:', 'https:'].includes(current.protocol)) throw new Error('Unsafe redirect protocol');
        continue;
      }
      const ctype = String(r.headers.get('content-type') || '');
      const html = ctype.includes('text/html') || ctype.includes('application/xhtml+xml') ? (await r.text()).slice(0, 1000000) : '';
      return { response: r, html, finalUrl: current.toString(), contentType: ctype };
    }
    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timer);
  }
}

function htmlText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAttr(tag, name) {
  const m = String(tag || '').match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? m[1].trim() : '';
}

function analyzeWebsiteHtml({ status, html, finalUrl, contentType }) {
  const titleMatch = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanText(titleMatch ? titleMatch[1].replace(/<[^>]+>/g, ' ') : '', 300);
  const metaRobots = (String(html || '').match(/<meta\b[^>]*name=["']robots["'][^>]*>/i) || [])[0] || '';
  const robotsContent = extractAttr(metaRobots, 'content').toLowerCase();
  const noindex = /(?:^|[,\s])noindex(?:$|[,\s])/i.test(robotsContent);
  const canonicalTag = (String(html || '').match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i) || [])[0] || '';
  const canonical = extractAttr(canonicalTag, 'href');
  const text = htmlText(html);
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const parked = /domain (?:is )?for sale|buy this domain|sedo parking|parkingcrew|hugedomains|dan\.com\/buy-domain/i.test((title + ' ' + text.slice(0, 5000)).toLowerCase());
  const spamSignals = [];
  if (parked) spamSignals.push('parked_or_for_sale');
  if (words > 0 && words < 120) spamSignals.push('very_thin_content');
  const httpOk = status >= 200 && status < 400;
  const htmlOk = /text\/html|application\/xhtml\+xml/i.test(contentType || '') && html.length >= 300;
  const indexable = httpOk && htmlOk && !noindex;
  const basicPass = httpOk && htmlOk && indexable && !!title && words >= 120 && !parked;
  const needsReview = basicPass && (words < 300 || !canonical);
  return {
    checked_url: finalUrl,
    http_status: status,
    content_type: contentType,
    title,
    canonical,
    noindex,
    indexable,
    word_count: words,
    parked,
    spam_signals: spamSignals,
    technical_pass: basicPass,
    outcome: !basicPass ? 'rejected' : (needsReview ? 'needs_review' : 'passed'),
    checked_at: new Date().toISOString()
  };
}



function slugifyNetwork(v) {
  return cleanText(v, 180).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120) || 'publisher-edition';
}

function stripCodeFence(v) {
  let s = String(v || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return s;
}

function sanitizePublisherHtml(html) {
  let out = String(html || '');
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<(?:iframe|object|embed|form|input|button|textarea|select|meta|link)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|form|textarea|select)>/gi, '')
    .replace(/<(?:iframe|object|embed|form|input|button|textarea|select|meta|link)\b[^>]*\/?\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
  out = out.replace(/<!doctype[^>]*>/gi,'').replace(/<\/?(?:html|head|body)\b[^>]*>/gi,'').trim();
  return out;
}

function ensureContentScaleAttribution(html, placementId) {
  const clean = sanitizePublisherHtml(html);
  const marker = `<footer class="contentscale-network-credit" data-contentscale-credit="required" style="margin-top:28px;padding-top:14px;border-top:1px solid rgba(127,127,127,.28);font-size:12px;line-height:1.5;opacity:.82">Created with <a href="https://app.contentscale.site/network" target="_blank" rel="noopener">ContentScale Network &amp; Distribution</a><span data-contentscale-placement="${Number(placementId)}"></span></footer>`;
  if (/data-contentscale-credit=["']required["']/i.test(clean)) return clean;
  return clean + marker;
}

async function callNetworkGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  const model = cleanText(process.env.GEMINI_NETWORK_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash', 100);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        contents:[{parts:[{text:prompt}]}],
        generationConfig:{temperature:0.55,topP:0.92,maxOutputTokens:20000,responseMimeType:'application/json',thinkingConfig:{thinkingBudget:0}}
      })
    });
    if (!r.ok) throw new Error(`Gemini API error ${r.status}: ${cleanText(await r.text(), 800)}`);
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('') || '';
    if (!text) throw new Error('Gemini returned no publication content');
    let parsed;
    try { parsed = JSON.parse(stripCodeFence(text)); }
    catch (_) { throw new Error('Gemini returned invalid publication JSON'); }
    return { parsed, model };
  } finally { clearTimeout(timer); }
}

function protectedSnippet(origin, placementId, token, title='', excerpt='') {
  const base = String(origin || 'https://app.contentscale.site').replace(/\/$/,'');
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fallbackTitle=cleanText(title,220),fallbackExcerpt=cleanText(excerpt,360);
  const fallback=(fallbackTitle||fallbackExcerpt)?`<div class="contentscale-network-fallback"><strong>${esc(fallbackTitle||'Content preview')}</strong>${fallbackExcerpt?`<p>${esc(fallbackExcerpt)}</p>`:''}</div>`:'<div class="contentscale-network-fallback"><p>Content preview loading…</p></div>';
  return `<div class="contentscale-network-placement" data-cs-placement="${Number(placementId)}">${fallback}</div>\n<script async src="${base}/network/embed/${token}.js"></script>`;
}


function escapeHtmlAttr(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function normalizeComparableText(v) {
  return htmlText(String(v || '')).toLowerCase().replace(/[^a-z0-9\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}

function publicationTextMatch(expectedHtml, liveHtml) {
  const expected = normalizeComparableText(expectedHtml);
  const live = normalizeComparableText(liveHtml);
  if (!expected || !live) return { matched:false, matched_phrases:0, tested_phrases:0 };
  const words = expected.split(' ').filter(Boolean);
  const starts = [0, Math.floor(words.length*0.22), Math.floor(words.length*0.47), Math.floor(words.length*0.72)].filter((v,i,a)=>v>=0&&v+10<=words.length&&a.indexOf(v)===i);
  const phrases = starts.map(i=>words.slice(i,i+10).join(' ')).filter(x=>x.length>=35);
  const hits = phrases.filter(x=>live.includes(x)).length;
  return { matched: phrases.length ? hits >= Math.min(2, phrases.length) : live.includes(expected.slice(0,120)), matched_phrases:hits, tested_phrases:phrases.length };
}

function publicationStandardChecks(html) {
  const s=String(html||''),plain=htmlText(s),words=plain?plain.split(/\s+/).filter(Boolean).length:0;
  const hasDirect=/class=["'][^"']*cs-direct-answer/i.test(s),hasTldr=/class=["'][^"']*cs-tldr/i.test(s),hasToc=/class=["'][^"']*cs-toc/i.test(s)&&/href=["']#/i.test(s),hasTable=/<table\b/i.test(s)&&/class=["'][^"']*cs-table-wrap/i.test(s);
  const h1=(s.match(/<h1\b/gi)||[]).length,h2=(s.match(/<h2\b/gi)||[]).length,faqSchema=buildFaqSchemaFromHtml(s),faqCount=faqSchema&&Array.isArray(faqSchema.mainEntity)?faqSchema.mainEntity.length:0;
  const statsTable=/class=["'][^"']*cs-table/i.test(s)&&/(statistic|statistics|by the numbers|source)/i.test(plain);
  return {words,minimum_words:1200,h1_count:h1,direct_answer:hasDirect,tldr:hasTldr,table_of_contents:hasToc,mobile_friendly_table:hasTable,statistics_table:statsTable,faq_present:faqCount>0,faq_count:faqCount,h2_count:h2,minimum_h2:5,passed:h1===1&&words>=1200&&hasDirect&&hasTldr&&hasToc&&hasTable&&h2>=5};
}


// v515 — deterministic seed/focus-keyword SEO contract.
// Do not chase plugin-only title gimmicks (sentiment/power words/numbers). These checks cover
// durable on-page signals: exact seed in SEO title/description/slug, early content, a subheading,
// natural repeated body coverage, and one descriptive image alt when images exist.
function _networkSeedKeywordV515(row, explicitSeed='') {
  const snap=safeJsonObject(row&&row.generation_input_snapshot);
  return cleanText(explicitSeed||row&&row.seed_keyword||snap.prewrite_keyword||'',220);
}
function _networkExactSeedV515(text, seed) {
  const a=String(text||'').toLocaleLowerCase(),b=String(seed||'').trim().toLocaleLowerCase();
  return !!b&&a.includes(b);
}
function _networkSeedCountV515(text, seed) {
  const hay=String(text||'').toLocaleLowerCase(),needle=String(seed||'').trim().toLocaleLowerCase();
  if(!needle)return 0;let n=0,pos=0;while((pos=hay.indexOf(needle,pos))!==-1){n++;pos+=needle.length;}return n;
}
function _networkSeedMetaTitleV515(seed,current) {
  seed=cleanText(seed,220);current=cleanText(current,220);if(!seed)return cleanText(current,60);
  if(_networkExactSeedV515(current,seed))return cleanText(current,60);
  if(seed.length>60)return cleanText(current,60);
  const room=Math.max(0,60-seed.length-3),tail=cleanText(current,room);
  return cleanText(seed+(tail?': '+tail:''),60);
}
function _networkSeedMetaDescriptionV515(seed,current) {
  seed=cleanText(seed,220);current=cleanText(current,500);if(!seed)return cleanText(current,160);
  if(_networkExactSeedV515(current,seed))return cleanText(current,160);
  const pref=seed+' — ',room=Math.max(0,160-pref.length),tail=cleanText(current,room);
  return cleanText(pref+tail,160);
}
function _networkSeedKeywordChecksV515(row,images,explicitSeed='') {
  const seed=_networkSeedKeywordV515(row,explicitSeed),html=String(row&&row.html||''),metaTitle=String(row&&row.meta_title||''),metaDescription=String(row&&row.meta_description||''),slug=String(row&&row.suggested_slug||'');
  if(!seed)return {required:false,passed:true,seed_keyword:'',note:'No linked seed keyword'};
  const bodyHtml=html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i,' '),bodyPlain=htmlText(bodyHtml),words=bodyPlain?bodyPlain.split(/\s+/).filter(Boolean):[];
  const firstCount=Math.max(1,Math.ceil(words.length*0.10)),firstTen=words.slice(0,firstCount).join(' ');
  const headingTexts=Array.from(html.matchAll(/<h[234]\b[^>]*>([\s\S]*?)<\/h[234]>/gi)).map(m=>htmlText(m[1]));
  const exactMentions=_networkSeedCountV515(bodyPlain,seed),minimumMentions=words.length>=1800?5:(words.length>=1200?4:(words.length>=600?3:2));
  const uploaded=(Array.isArray(images)?images:[]).filter(x=>x&&['uploaded','approved'].includes(String(x.status||'')));
  const allImageAlts=uploaded.length===0||uploaded.every(x=>cleanText(x.alt_text||'',500).length>=8);
  const focusAlt=uploaded.length===0||uploaded.some(x=>_networkExactSeedV515(x.alt_text,seed)&&normalizeComparableText(x.alt_text)!==normalizeComparableText(seed));
  const checks={
    seo_title_exact:_networkExactSeedV515(metaTitle,seed),
    meta_description_exact:_networkExactSeedV515(metaDescription,seed),
    slug_exact:slugifyNetwork(slug)===slugifyNetwork(seed),
    first_10_percent_exact:_networkExactSeedV515(firstTen,seed),
    subheading_exact:headingTexts.some(x=>_networkExactSeedV515(x,seed)),
    body_mentions_enough:exactMentions>=minimumMentions,
    all_images_have_alt:allImageAlts,
    one_descriptive_image_alt_has_exact_seed:focusAlt
  };
  const missing=Object.entries(checks).filter(([,ok])=>!ok).map(([k])=>k);
  return {required:true,passed:missing.length===0,seed_keyword:seed,expected_slug:slugifyNetwork(seed),body_word_count:words.length,exact_body_mentions:exactMentions,minimum_exact_body_mentions:minimumMentions,image_count:uploaded.length,checks,missing};
}
async function _networkEnsureSeedImageAltV515(pool,publicationVersionId,seed) {
  seed=cleanText(seed,220);if(!seed||!publicationVersionId)return {changed:false,reason:'no_seed_or_publication'};
  const r=await pool.query(`SELECT id,image_role,image_name,alt_text,caption,suggested_filename,status FROM network_publication_images WHERE publication_version_id=$1 AND status IN ('uploaded','approved') ORDER BY CASE WHEN image_role='featured' THEN 0 ELSE 1 END,sort_order,id`,[publicationVersionId]);
  const rows=r.rows||[];if(!rows.length)return {changed:false,image_count:0,reason:'no_images'};
  let changed=false;
  for(const img of rows){
    if(cleanText(img.alt_text||'',500).length>=8)continue;
    const fallback=cleanText(img.image_name||img.caption||'Article illustration',320)||'Article illustration';
    await pool.query(`UPDATE network_publication_images SET alt_text=$2,updated_at=NOW() WHERE id=$1`,[img.id,fallback]);img.alt_text=fallback;changed=true;
  }
  let focus=rows.find(x=>_networkExactSeedV515(x.alt_text,seed)&&normalizeComparableText(x.alt_text)!==normalizeComparableText(seed));
  if(!focus){
    focus=rows[0];const base=cleanText(focus.alt_text||focus.image_name||focus.caption||'article illustration',320)||'article illustration';
    const withoutExact=_networkExactSeedV515(base,seed)?base.replace(new RegExp(seed.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'),'').replace(/^\s*[-—:|]+\s*|\s*[-—:|]+\s*$/g,'').trim():base;
    const next=cleanText(seed+' — '+(withoutExact||'article illustration'),500);
    await pool.query(`UPDATE network_publication_images SET alt_text=$2,updated_at=NOW() WHERE id=$1`,[focus.id,next]);focus.alt_text=next;changed=true;
  }
  return {changed,image_count:rows.length,focus_image_id:focus&&focus.id||null,focus_alt:focus&&focus.alt_text||null};
}

function buildFaqSchemaFromHtml(html) {
  const section=(String(html||'').match(/<section\b[^>]*class=["'][^"']*cs-faq[^"']*["'][^>]*>([\s\S]*?)<\/section>/i)||[])[1]||'';
  if(!section)return null;
  const items=[];
  const re=/<h3\b[^>]*>([\s\S]*?)<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi;let m;
  while((m=re.exec(section))&&items.length<12){const q=cleanText(htmlText(m[1]),300),a=cleanText(htmlText(m[2]),1400);if(q&&a)items.push({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}})}
  return items.length?{'@context':'https://schema.org','@type':'FAQPage',mainEntity:items}:null;
}

function buildBreadcrumbSchema(row) {
  const host=normalizeHost(row.publisher_domain||'');
  const slug=slugifyNetwork(row.suggested_slug||row.title||'article');
  if(!host||!slug)return null;
  return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:cleanText(row.publisher_brand||host,200)||host,item:'https://'+host+'/'},
    {'@type':'ListItem',position:2,name:cleanText(row.title||'Article',300)||'Article',item:'https://'+host+'/'+slug+'/'}
  ]};
}

function buildSeoPublicationHtml(row, images) {
  const rendered=renderEditionHtml(row,images);
  const faq=buildFaqSchemaFromHtml(row.html);
  const breadcrumb=buildBreadcrumbSchema(row);
  const schemas=[rendered.schema].concat(faq?[faq]:[]).concat(breadcrumb?[breadcrumb]:[]).filter(Boolean);
  const scripts=schemas.map((x,i)=>`<script type="application/ld+json" data-contentscale-schema="${i===0?'article':(x&&x['@type']==='FAQPage'?'faq':'breadcrumb')}">${JSON.stringify(x).replace(/<\/script/gi,'<\\/script')}</script>`).join('\n');
  const marker=`<!-- ContentScale Network indexable placement ${Number(row.placement_id||row.id||0)} -->`;
  return `${marker}\n${rendered.html}\n${scripts}`;
}

function safeHexColor(v, fallback) {
  const x = String(v || '').trim();
  return /^#[0-9a-f]{6}$/i.test(x) ? x : fallback;
}

function getPublicationSettings(snapshot, defaults = {}) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const p = s.publication_settings && typeof s.publication_settings === 'object' ? s.publication_settings : {};
  return {
    primary_color: safeHexColor(p.primary_color, '#111827'),
    accent_color: safeHexColor(p.accent_color, '#2563eb'),
    author_type: ['company','person','publisher'].includes(p.author_type) ? p.author_type : 'company',
    author_name: cleanText(p.author_name || defaults.author_name || '', 200),
    author_url: cleanText(p.author_url || defaults.author_url || '', 1000),
    author_bio: cleanText(p.author_bio || defaults.author_bio || '', 1000),
    author_job_title: cleanText(p.author_job_title || '', 160),
    image_mode: ['off','prompt_only','auto_generate'].includes(p.image_mode) ? p.image_mode : 'prompt_only'
  };
}


function normalizeResearchUrl(raw) {
  let input=String(raw||'').trim();if(!input)return '';
  input=input.replace(/^[\s<>()\[\]"']+|[\s<>()\[\]"',.;:!?*_]+$/g,'');
  let u;try{u=new URL(input)}catch(_e){return ''}
  if(!['http:','https:'].includes(u.protocol))return '';
  // Unwrap search-engine wrappers when they only point to the real source URL.
  const host=normalizeHost(u.hostname);
  if((host==='google.com'||host.endsWith('.google.com'))&&/^\/search\/?$/i.test(u.pathname||'')){
    const q=String(u.searchParams.get('q')||u.searchParams.get('url')||'').trim();
    if(/^https?:\/\//i.test(q))return normalizeResearchUrl(q);
    return '';
  }
  u.protocol='https:';u.hash='';
  const drop=[];for(const [k] of u.searchParams){if(/^utm_/i.test(k)||['gclid','fbclid','msclkid','dclid','yclid','mc_cid','mc_eid','roistat_visit','ref','referrer','source'].includes(String(k).toLowerCase()))drop.push(k)}drop.forEach(k=>u.searchParams.delete(k));
  // Never keep a second URL accidentally concatenated into a path/query value.
  const href=u.toString();if(/https?:\/\/.*https?:\/\//i.test(href))return '';
  if(u.pathname!=='/')u.pathname=u.pathname.replace(/\/{2,}/g,'/').replace(/\/$/,'');
  return u.toString().replace(/\?$/,'');
}

function extractUrlsDeep(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value || {});
  // AI evidence can contain escaped or malformed newline separators such as \n, /n/n or literal \n strings.
  text=text.replace(/\\r\\n|\\n|\\r/gi,' ').replace(/\/n\/n|\/n(?=https?:\/\/)/gi,' ');
  const found = text.match(/https?:\/\/[^\s"'<>\)\]}]+/gi) || [];
  const out=[],seen=new Set();
  for(const raw of found){const u=normalizeResearchUrl(raw);if(!u||seen.has(u))continue;seen.add(u);out.push(u);if(out.length>=200)break}
  return out;
}

function normalizeHost(value) {
  try { return new URL(/^https?:\/\//i.test(String(value||'')) ? String(value) : 'https://'+String(value||'')).hostname.toLowerCase().replace(/^www\./,''); }
  catch(e) { return ''; }
}

function extractH2Headings(html) {
  const out=[]; let n=0;
  String(html||'').replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi,(m,inner)=>{n++;out.push({number:n,text:htmlText(inner).trim(),first_three:firstThreeWords(htmlText(inner).trim())});return m});
  return out;
}

function linkIntelligenceFromSources(row, prewriteBrief) {
  const urls = extractUrlsDeep(prewriteBrief && prewriteBrief.brief_json ? prewriteBrief.brief_json : {});
  const sourceHost = normalizeHost(row.source_domain || '');
  const publisherHost = normalizeHost(row.publisher_domain || '');
  const internal=[], external=[];
  for(const u of urls){
    const h=normalizeHost(u); if(!h) continue;
    // A Publisher Edition is published on the publisher domain. Only publisher-domain URLs are truly internal.
    // The owner/source domain is external from the publisher's point of view and must stay in evidence/source links.
    if(publisherHost && (h===publisherHost||h.endsWith('.'+publisherHost))){
      let pageLike=true;try{const z=new URL(u),p=(z.pathname||'').toLowerCase();pageLike=!(/(?:^|\/)(?:sitemap(?:[_-]index)?|wp-sitemap|robots)(?:[._\/-]|$)/i.test(p)||/\.xml$/i.test(p)||/\/feed\/?$/i.test(p)||/\/wp-json(?:\/|$)/i.test(p));}catch(_e){pageLike=false}
      if(pageLike)internal.push(u);
    } else external.push(u);
  }
  const cleanExternal=Array.from(new Set(external.map(normalizeResearchUrl).filter(Boolean)));
  // Keep Link Intelligence calm: research may contain many URLs, but publication only needs a strong shortlist.
  // Prefer direct, specific pages and cap the visible/source-target pool at five.
  cleanExternal.sort((a,b)=>{const score=u=>{try{const z=new URL(u),h=normalizeHost(z.hostname),p=z.pathname||'/';let n=0;if(/\.(gov|edu)$/i.test(h))n+=6;if(/developers\.google\.com|schema\.org|w3\.org|ietf\.org/i.test(h))n+=5;if(p&&p!=='/')n+=3;if(p.split('/').filter(Boolean).length>=2)n+=1;if(/medium\.com|slideshare\.net/i.test(h))n-=2;return n}catch(_e){return -99}};return score(b)-score(a)||a.length-b.length});
  return {internal:Array.from(new Set(internal)).slice(0,30),external:cleanExternal.slice(0,5),source_host:sourceHost,publisher_host:publisherHost,prewrite_used:!!prewriteBrief};
}

function _networkPublicationLinkPolicyV522(row,opts={}){
  const html=String(row&&row.html||''),publisherHost=normalizeHost(opts.publisher_domain||row&&row.publisher_domain||''),sourceHost=normalizeHost(opts.source_domain||row&&row.source_domain||'');
  const internalCandidates=Array.from(new Set((Array.isArray(opts.internal_candidates)?opts.internal_candidates:[]).map(normalizeResearchUrl).filter(Boolean)));
  const externalCandidates=Array.from(new Set((Array.isArray(opts.external_candidates)?opts.external_candidates:[]).map(x=>normalizeResearchUrl(typeof x==='string'?x:(x&&x.final_url||x&&x.url||''))).filter(Boolean)));
  const anchors=[];String(html||'').replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(m,href,inner)=>{anchors.push({url:normalizeResearchUrl(href)||String(href||''),anchor:cleanText(htmlText(inner),240)});return m});
  const internalMap=new Map(),externalMap=new Map(),internalCandidateKeys=new Set(internalCandidates.map(_briefUrlKey)),externalCandidateKeys=new Set(externalCandidates.map(_briefUrlKey));
  for(const a of anchors){const h=normalizeHost(a.url);if(!h)continue;const k=_briefUrlKey(a.url);if(!k)continue;if(publisherHost&&(h===publisherHost||h.endsWith('.'+publisherHost))){if(internalCandidateKeys.has(k)&&!internalMap.has(k))internalMap.set(k,a)}else if(/^https?:\/\//i.test(a.url)){if(sourceHost&&(h===sourceHost||h.endsWith('.'+sourceHost)))continue;if(externalCandidateKeys.has(k)&&!externalMap.has(k))externalMap.set(k,a)}}
  const internal=Array.from(internalMap.values()),external=Array.from(externalMap.values());
  const goodAnchor=a=>{const t=String(a&&a.anchor||'').trim();return t.length>=3&&!/^https?:\/\//i.test(t)};
  const internalAnchors=new Set(internal.filter(goodAnchor).map(a=>a.anchor.toLowerCase().replace(/\s+/g,' '))),externalAnchors=new Set(external.filter(goodAnchor).map(a=>a.anchor.toLowerCase().replace(/\s+/g,' ')));
  const internalMin=3,externalMin=3,internalTargetMin=3,externalTargetMin=3,targetMax=5;
  const missingInternal=Math.max(0,internalMin-internal.length),missingExternal=Math.max(0,externalMin-external.length);
  const internalAnchorOk=internal.length<2||internalAnchors.size>=2,externalAnchorOk=external.every(goodAnchor);
  const missing=[];if(missingInternal)missing.push('internal_links');if(missingExternal)missing.push('external_links');if(!internalAnchorOk)missing.push('internal_anchor_diversity');if(!externalAnchorOk)missing.push('external_anchor_quality');
  const candidateInternalMissing=internalCandidates.filter(u=>!internalMap.has(_briefUrlKey(u))).slice(0,5),candidateExternalMissing=externalCandidates.filter(u=>!externalMap.has(_briefUrlKey(u))).slice(0,5);
  return {passed:missing.length===0,missing,internal:{count:internal.length,min:internalMin,target_min:internalTargetMin,target_max:targetMax,urls:internal.map(x=>x.url),candidate_count:internalCandidates.length,candidates_missing:missingInternal,candidate_urls_available:candidateInternalMissing,anchor_diversity_ok:internalAnchorOk},external:{count:external.length,min:externalMin,target_min:externalTargetMin,target_max:targetMax,urls:external.map(x=>x.url),candidate_count:externalCandidates.length,candidates_missing:missingExternal,candidate_urls_available:candidateExternalMissing,anchor_quality_ok:externalAnchorOk},rule:'Exactly the current verified candidate set governs publication: minimum 3 unique relevant same-domain internal URLs and 3 unique external editorial URLs; target 3-5. Never invent URLs; homepage is fallback only.'};
}


function _networkLinkLabelV526(item, rawUrl) {
  const source=rawUrl||(typeof item==='string'?item:(item&&item.final_url||item&&item.url||''));
  const url=normalizeResearchUrl(source);
  let label=cleanText(item&&typeof item==='object'&&(item.title||item.label||'')||'',180);
  if(label&&/^https?:\/\//i.test(label))label='';
  if(!label&&url){
    try{
      const u=new URL(url),parts=decodeURIComponent(u.pathname||'').split('/').filter(Boolean),last=parts[parts.length-1]||normalizeHost(u.hostname);
      label=last.replace(/[-_]+/g,' ').replace(/\b(aeo|geo|seo|ai|aio|ymyl|faq)\b/gi,m=>m.toUpperCase()).replace(/\s+/g,' ').trim();
      if(label)label=label.charAt(0).toUpperCase()+label.slice(1);
    }catch(_e){}
  }
  return cleanText(label||'related source',180);
}

function _networkDeterministicLinkRepairV526(inputHtml, policy, internalCandidates, externalCandidates) {
  let html=String(inputHtml||'');
  const p=policy&&typeof policy==='object'?policy:{internal:{count:0,candidate_urls_available:[]},external:{count:0,candidate_urls_available:[]}};
  const needInternal=Math.max(0,3-Number(p.internal&&p.internal.count||0)),needExternal=Math.max(0,3-Number(p.external&&p.external.count||0));
  if(!needInternal&&!needExternal)return {changed:false,html,added_internal:[],added_external:[],reason:'already_complete'};
  const intPool=Array.from(new Map([].concat(p.internal&&p.internal.candidate_urls_available||[],internalCandidates||[]).map(x=>normalizeResearchUrl(typeof x==='string'?x:(x&&x.final_url||x&&x.url||''))).filter(Boolean).map(u=>[_briefUrlKey(u),u])).values());
  const extRaw=[].concat(externalCandidates||[]),extByKey=new Map();
  for(const x of extRaw){const u=normalizeResearchUrl(typeof x==='string'?x:(x&&x.final_url||x&&x.url||''));if(u&&!extByKey.has(_briefUrlKey(u)))extByKey.set(_briefUrlKey(u),x)}
  const extPool=Array.from(new Map([].concat(p.external&&p.external.candidate_urls_available||[],extRaw).map(x=>normalizeResearchUrl(typeof x==='string'?x:(x&&x.final_url||x&&x.url||''))).filter(Boolean).map(u=>[_briefUrlKey(u),u])).values());
  const additions=[];
  for(const u of intPool.slice(0,needInternal))additions.push({kind:'internal',url:u,label:_networkLinkLabelV526(u,u)});
  for(const u of extPool.slice(0,needExternal)){const raw=extByKey.get(_briefUrlKey(u));additions.push({kind:'external',url:u,label:_networkLinkLabelV526(raw,u)})}
  if(additions.filter(x=>x.kind==='internal').length<needInternal||additions.filter(x=>x.kind==='external').length<needExternal)return {changed:false,html,added_internal:[],added_external:[],reason:'insufficient_verified_candidates'};

  const paras=[];let m;const re=/<p\b[^>]*>[\s\S]*?<\/p>/gi;
  while((m=re.exec(html))){const raw=m[0],plain=cleanText(htmlText(raw),1200);if(plain.length<70||/contentscale network/i.test(plain))continue;paras.push({start:m.index,end:m.index+raw.length,insertAt:m.index+raw.toLowerCase().lastIndexOf('</p>'),plain,raw})}
  const used=new Set(),inserts=[];
  for(let i=0;i<additions.length;i++){
    const a=additions[i],tokens=Array.from(new Set(_briefTokens(a.label+' '+a.url))).slice(0,12);let best=null;
    for(let j=0;j<paras.length;j++){
      if(used.has(j))continue;const q=paras[j],norm=_briefNorm(q.plain),overlap=tokens.reduce((n,t)=>n+(norm.includes(t)?1:0),0),linkPenalty=/<a\b/i.test(q.raw)?-0.25:0,positionBias=(j+1)/(paras.length+1)*0.05,score=overlap*10+linkPenalty+positionBias;
      if(!best||score>best.score)best={j,q,score};
    }
    if(best){used.add(best.j);const label=escapeHtmlAttr(a.label),url=escapeHtmlAttr(a.url),sentence=a.kind==='internal'?` <span class="cs-context-link cs-context-link-internal">See <a href="${url}">${label}</a> for related context.</span>`:` <span class="cs-context-link cs-context-link-external">For supporting context, see <a href="${url}">${label}</a>.</span>`;inserts.push({at:best.q.insertAt,text:sentence,kind:a.kind,url:a.url})}
  }
  if(inserts.length<additions.length){
    const missing=additions.filter(a=>!inserts.some(x=>x.url===a.url));
    if(missing.length){const links=missing.map(a=>`<a href="${escapeHtmlAttr(a.url)}">${escapeHtmlAttr(a.label)}</a>`).join(' · '),block=`<p class="cs-context-link cs-context-link-fallback">Related reading: ${links}.</p>`,at=html.toLowerCase().lastIndexOf('</article>');inserts.push({at:at>=0?at:html.length,text:block,kind:'mixed',url:''})}
  }
  inserts.sort((a,b)=>b.at-a.at);for(const x of inserts)html=html.slice(0,x.at)+x.text+html.slice(x.at);
  return {changed:html!==String(inputHtml||''),html,added_internal:additions.filter(x=>x.kind==='internal').map(x=>x.url),added_external:additions.filter(x=>x.kind==='external').map(x=>x.url),reason:'deterministic_verified_candidate_insertion'};
}

function discoverRelevantPublisherLinks(html, baseUrl, topic, max=12) {
  let base;try{base=new URL(baseUrl)}catch(_e){return []}
  const host=normalizeHost(base.hostname),topicTokens=new Set(_briefTokens(topic));
  const skip=/(?:^|\/)(?:login|logout|register|privacy|terms|cookie|cart|checkout|account|wp-admin)(?:\/|$)/i;
  const found=[];const seen=new Set();
  String(html||'').replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(m,href,inner)=>{
    try{
      if(!href||href.startsWith('#')||/^(?:mailto:|tel:|javascript:)/i.test(href))return m;
      const u=new URL(href,base);if(!/^https?:$/.test(u.protocol))return m;
      if(normalizeHost(u.hostname)!==host||skip.test(u.pathname)||u.pathname==='/'||!u.pathname)return m;
      u.hash='';const url=(u.origin+u.pathname).replace(/\/$/,'');if(seen.has(url))return m;seen.add(url);
      const label=htmlText(inner),hay=_briefTokens(label+' '+u.pathname.replace(/[\/_-]+/g,' ')),score=hay.filter(t=>topicTokens.has(t)).length;
      if(score>0)found.push({url,score,label:cleanText(label,180)});
    }catch(_e){}return m;
  });
  return found.sort((a,b)=>b.score-a.score||a.url.length-b.url.length).slice(0,max).map(x=>x.url);
}



async function _networkFetchTextV523(startUrl, maxBytes=1500000) {
  let current=new URL(startUrl);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    for(let hop=0;hop<5;hop++){
      await assertPublicHostname(current.hostname);
      const r=await fetch(current.toString(),{method:'GET',redirect:'manual',signal:controller.signal,headers:{'User-Agent':'ContentScaleNetworkLinkDiscovery/1.0 (+https://app.contentscale.site/network)','Accept':'application/xml,text/xml,text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'}});
      if([301,302,303,307,308].includes(r.status)){const loc=r.headers.get('location');if(!loc)throw new Error('Redirect without destination');current=new URL(loc,current);if(!['http:','https:'].includes(current.protocol))throw new Error('Unsafe redirect protocol');continue}
      const text=(await r.text()).slice(0,maxBytes);return {response:r,text,finalUrl:current.toString(),contentType:String(r.headers.get('content-type')||'')};
    }
    throw new Error('Too many redirects');
  } finally { clearTimeout(timer); }
}

function _networkSitemapLocsV523(xml){
  const out=[];String(xml||'').replace(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi,(m,v)=>{const u=String(v||'').replace(/&amp;/gi,'&').replace(/&#38;/g,'&').trim();if(/^https?:\/\//i.test(u))out.push(u);return m});return Array.from(new Set(out));
}

function _networkInternalUrlScoreV523(url,topic){
  try{
    const u=new URL(url),p=String(u.pathname||'/'),tokens=new Set(_briefTokens(topic)),hay=_briefTokens(decodeURIComponent(p).replace(/[\/_-]+/g,' '));let score=hay.filter(t=>tokens.has(t)).length*8;
    const depth=p.split('/').filter(Boolean).length;if(depth>=1)score+=3;if(depth>=2)score+=2;
    if(/\/(?:blog|resources?|guides?|services?|solutions?|learn|academy)\//i.test(p))score+=2;
    if(/\/(?:tag|category|author|page)\//i.test(p))score-=4;
    if(p==='/'||!p)score-=20;
    return score;
  }catch(_e){return -99}
}

async function _networkDiscoverInternalCandidatesV523({publisher_domain,topic,start_url,current_slug}){
  const pub=normalizeHost(publisher_domain||'');if(!pub)return {candidates:[],checked:[],source:'none'};
  const root='https://'+pub,seen=new Set(),raw=[];
  const add=u=>{const n=normalizeResearchUrl(u);if(!n||seen.has(n)||!_networkReaderInternalUrlV500(n,pub))return;try{const z=new URL(n);if(current_slug&&z.pathname.replace(/^\/+|\/+$/g,'')===String(current_slug).replace(/^\/+|\/+$/g,''))return}catch(_e){}seen.add(n);raw.push(n)};
  const sitemapSeeds=[root+'/wp-sitemap.xml',root+'/sitemap_index.xml',root+'/sitemap.xml'];
  for(const sm of sitemapSeeds){
    try{
      const f=await _networkFetchTextV523(sm);if(!(f.response.status>=200&&f.response.status<400))continue;const locs=_networkSitemapLocsV523(f.text);
      const nested=locs.filter(u=>/\.xml(?:$|\?)/i.test(u)||/sitemap/i.test(u)).slice(0,6),pages=locs.filter(u=>!nested.includes(u));pages.slice(0,500).forEach(add);
      for(const child of nested){try{const c=await _networkFetchTextV523(child);if(c.response.status>=200&&c.response.status<400)_networkSitemapLocsV523(c.text).slice(0,500).forEach(add)}catch(_e){}}
      if(raw.length>=40)break;
    }catch(_e){}
  }
  if(raw.length<12){
    try{const start=cleanText(start_url||'',2048)||root+'/';const f=await safeFetchHtml(start);discoverRelevantPublisherLinks(f.html,f.finalUrl,topic,30).forEach(add)}catch(_e){}
  }
  const ranked=raw.sort((a,b)=>_networkInternalUrlScoreV523(b,topic)-_networkInternalUrlScoreV523(a,topic)||a.length-b.length).slice(0,18),checked=[];
  for(const url of ranked){
    if(checked.filter(x=>x.status==='verified').length>=5)break;
    try{
      const f=await safeFetchHtml(url),a=analyzeWebsiteHtml({status:f.response.status,html:f.html,finalUrl:f.finalUrl,contentType:f.contentType}),finalUrl=normalizeResearchUrl(f.finalUrl||url);
      const finalHost=normalizeHost(finalUrl);if(finalHost!==pub||!a.indexable)continue;
      checked.push({url:finalUrl,status:'verified',http_status:f.response.status,title:a.title||'',score:_networkInternalUrlScoreV523(finalUrl,topic)});
    }catch(_e){checked.push({url,status:'failed',http_status:null,title:'',score:_networkInternalUrlScoreV523(url,topic)})}
  }
  if(checked.filter(x=>x.status==='verified').length<3){
    try{
      const f=await safeFetchHtml(root+'/'),a=analyzeWebsiteHtml({status:f.response.status,html:f.html,finalUrl:f.finalUrl,contentType:f.contentType}),home=normalizeResearchUrl(f.finalUrl||root+'/');
      if(a.indexable&&normalizeHost(home)===pub&&!checked.some(x=>_briefUrlKey(x.url)===_briefUrlKey(home)))checked.push({url:home,status:'verified',http_status:f.response.status,title:a.title||'',score:-5,homepage_fallback:true});
    }catch(_e){}
  }
  const candidates=Array.from(new Map(checked.filter(x=>x.status==='verified').map(x=>[_briefUrlKey(x.url),x.url])).values()).slice(0,5);
  return {candidates,checked,source:raw.length?'sitemap_or_same_domain':'homepage_fallback'};
}


async function _networkVerifyExternalCandidatesV523(urls,publisherDomain,sourceDomain,max=5){
  const blocked=[normalizeHost(publisherDomain||''),normalizeHost(sourceDomain||'')].filter(Boolean),out=[],seen=new Set();
  for(const raw of (Array.isArray(urls)?urls:[]).slice(0,16)){
    const url=normalizeResearchUrl(typeof raw==='string'?raw:(raw&&raw.final_url||raw&&raw.url||''));if(!url)continue;const h=normalizeHost(url);if(blocked.some(b=>h===b||h.endsWith('.'+b)))continue;
    try{const f=await safeFetchHtml(url),a=analyzeWebsiteHtml({status:f.response.status,html:f.html,finalUrl:f.finalUrl,contentType:f.contentType}),finalUrl=normalizeResearchUrl(f.finalUrl||url),k=_briefUrlKey(finalUrl);if(!a.indexable||!k||seen.has(k))continue;seen.add(k);out.push({url:finalUrl,final_url:finalUrl,title:a.title||'',http_status:f.response.status,status:'verified',source:'prewrite_live_verified'});if(out.length>=max)break}catch(_e){}
  }
  return out;
}

function _briefArray(...values){
  for(const v of values){
    if(Array.isArray(v)) return v;
    if(v&&typeof v==='object'&&!Array.isArray(v)){
      for(const k of ['sections','items','questions','entries','list','h2s','faqs','paa']) if(Array.isArray(v[k])) return v[k];
    }
  }
  return [];
}

function _briefItemText(v, keys=[]){
  if(typeof v==='string'||typeof v==='number') return cleanText(v,1200);
  if(!v||typeof v!=='object') return '';
  for(const k of keys.concat(['text','name','title','label','question','q','heading','h2','audience','entity'])){
    if(v[k]!=null&&String(v[k]).trim()) return cleanText(v[k],1200);
  }
  return '';
}

function _briefNorm(v){return normalizeComparableText(String(v||''));}
function _briefTokens(v){return _briefNorm(v).split(' ').filter(x=>x.length>2&&!['the','and','for','with','from','that','this','what','when','your','into','how','why','are','vs','via','een','het','van','voor','met','wat','hoe','waarom','und','der','die','das','con','para','que'].includes(x));}
function _briefEntityCovered(entity,articleNorm){
  const raw=cleanText(entity,500),norm=_briefNorm(raw);if(!norm)return true;if(articleNorm.includes(norm))return true;
  const acronym=(raw.match(/\(([A-Z][A-Z0-9-]{1,12})\)/)||[])[1]||'';if(acronym&&new RegExp('(?:^|\\s|[^a-z0-9])'+acronym.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|\\s|[^a-z0-9])','i').test(articleNorm))return true;
  const variants=raw.split(/\s*(?:\/|\||;|\u2014|\u2013|\s-\s)\s*/).map(_briefNorm).filter(x=>x.length>=3);if(variants.some(v=>articleNorm.includes(v)))return true;
  const toks=Array.from(new Set(_briefTokens(raw)));if(!toks.length)return true;const hits=toks.filter(t=>articleNorm.includes(t)).length;
  if(toks.length===1)return hits===1;
  if(toks.length===2)return hits===2;
  return hits>=2&&(hits/toks.length)>=0.75;
}
function _briefSimilar(a,b){
  const na=_briefNorm(a),nb=_briefNorm(b);if(!na||!nb)return false;
  if(na.includes(nb)||nb.includes(na))return true;
  const aa=Array.from(new Set(_briefTokens(a))),bb=new Set(_briefTokens(b));if(!aa.length)return false;
  const hits=aa.filter(x=>bb.has(x)).length;return hits/aa.length>=0.6;
}
function _briefUrlKey(v){try{const u=new URL(String(v));u.hash='';return (u.origin+u.pathname).replace(/\/$/,'').toLowerCase()}catch(e){return ''}}

function _outlineHeadingSame(a,b){
  const na=_briefNorm(a),nb=_briefNorm(b);if(!na||!nb)return false;
  if(na===nb)return true;
  const shorter=na.length<=nb.length?na:nb,longer=na.length>nb.length?na:nb;
  if(longer.includes(shorter)&&shorter.length>=18&&shorter.length/longer.length>=0.72)return true;
  const aa=Array.from(new Set(_briefTokens(a))),bb=Array.from(new Set(_briefTokens(b)));if(!aa.length||!bb.length)return false;
  const bs=new Set(bb),hits=aa.filter(x=>bs.has(x)).length,union=new Set(aa.concat(bb)).size;
  return union>0&&hits/union>=0.72;
}

function buildCanonicalApprovedOutline(briefJson){
  const b=safeJsonObject(briefJson),structure=safeJsonObject(b.recommended_structure);
  const definitive=_briefArray(b.definitive_outline);
  const rawBlueprint=_briefArray(b.page_blueprint,b.blueprint,b.h2_structure,b.outline,structure.h2s,structure.sections);
  const normalizeSection=item=>{
    if(typeof item==='string')return {h2:cleanText(item,300),purpose:'',target_words:null,cover:[],citation_hook:''};
    if(!item||typeof item!=='object')return null;
    return {h2:_briefItemText(item,['h2','heading','title','name']),purpose:cleanText(item.purpose||item.goal||item.intent||item.description||item.summary||'',1200),target_words:Number(item.target_words||item.targetWords||item.word_count||item.words||0)||null,cover:_briefArray(item.cover,item.must_cover,item.points,item.subtopics,item.topics).map(x=>_briefItemText(x,['text','title','name'])).filter(Boolean).slice(0,8),citation_hook:cleanText(item.citation_hook||item.citationHook||item.evidence_hook||item.source_hook||item.support_with||'',1800)};
  };
  const pool=rawBlueprint.map(normalizeSection).filter(x=>x&&x.h2);
  if(definitive.length){
    return definitive.map(normalizeSection).filter(x=>x&&x.h2).map(sec=>{
      const fallback=pool.find(x=>_outlineHeadingSame(sec.h2,x.h2))||{};
      return {h2:sec.h2,purpose:sec.purpose||fallback.purpose||'',target_words:sec.target_words||fallback.target_words||null,cover:(Array.isArray(sec.cover)&&sec.cover.length)?sec.cover:(Array.isArray(fallback.cover)?fallback.cover:[]),citation_hook:sec.citation_hook||fallback.citation_hook||''};
    }).slice(0,16);
  }
  const headings=[];const add=h=>{h=cleanText(h,300);if(h&&!headings.some(x=>_outlineHeadingSame(x,h)))headings.push(h)};
  _briefArray(structure.must_have_h2s).forEach(x=>add(_briefItemText(x,['h2','heading','title','name'])));
  _briefArray(structure.h2s,structure.sections).forEach(x=>add(_briefItemText(x,['h2','heading','title','name'])));
  pool.forEach(x=>add(x.h2));
  return headings.slice(0,16).map(h=>{
    const sec=pool.find(x=>_outlineHeadingSame(h,x.h2))||{};
    return {h2:h,purpose:sec.purpose||'',target_words:sec.target_words||null,cover:Array.isArray(sec.cover)?sec.cover:[],citation_hook:sec.citation_hook||''};
  });
}

function _networkImageBriefSection(briefJson,h2Number,h2Text){
  const outline=buildCanonicalApprovedOutline(briefJson),heading=cleanText(h2Text||'',300);
  if(!outline.length)return {h2:heading,purpose:'',cover:[],target_words:null,citation_hook:''};
  const matched=heading?outline.find(x=>_outlineHeadingSame(x&&x.h2||'',heading)):null;
  if(matched)return matched;
  const indexed=outline[Math.max(0,Number(h2Number||0)-1)];
  if(indexed&&(!heading||_briefSimilar(indexed.h2,heading)))return indexed;
  // Never attach another section's purpose merely because the numeric position happens to match.
  return {h2:heading,purpose:'',cover:[],target_words:null,citation_hook:''};
}

function _networkImageSceneDirection({role,section,purpose,cover,articleTitle}){
  const s=cleanText(section,300).toLowerCase(),g=cleanText(purpose,1200).toLowerCase(),concepts=(Array.isArray(cover)?cover:[]).map(x=>cleanText(x,180)).filter(Boolean),cx=concepts.join(' | ').toLowerCase(),bag=(s+' | '+g+' | '+cx+' | '+cleanText(articleTitle,300).toLowerCase());
  if(role==='featured') return '';
  if(/coexist|overlap|unified|layer|layers|integration|integrate|complementary/.test(bag)){
    return 'SECTION-SPECIFIC SCENE DIRECTION: Show one strong content foundation or source asset feeding multiple search experiences at the same time — for example a single high-quality content source connected to traditional search discovery, direct-answer retrieval and generative-AI synthesis. Make the overlap understandable at a glance. Do not use arbitrary symbolic rings, shapes or materials that would need labels to make sense.';
  }
  if(/difference|differences|compare|comparison|at a glance|matrix|versus|vs\.?/.test(bag)){
    return 'SECTION-SPECIFIC SCENE DIRECTION: Show a structured side-by-side comparison with clearly different lanes, panels, cards or process paths. The image should visually separate the compared approaches without relying on text inside the image.';
  }
  if(/define|definition|defining|what is|the trio|explaining/.test(bag)){
    return 'SECTION-SPECIFIC SCENE DIRECTION: Show three clearly distinct but related concepts as separate visual units, each represented by its own type of search or discovery outcome, so the reader can intuitively understand what each one does.';
  }
  if(/resource allocation|practical application|workflow|implementation|operational|planning|budget|team/.test(bag)){
    return 'SECTION-SPECIFIC SCENE DIRECTION: Show a concrete editorial or strategy-planning scene where one team, process or planning board allocates effort across the different search approaches without duplication. Prefer an actionable process scene over a generic office setup.';
  }
  if(/future|evolution|next|ahead|emerging/.test(bag)){
    return 'SECTION-SPECIFIC SCENE DIRECTION: Show the evolution of search as a forward-looking ecosystem, with one content foundation extending into newer AI-led discovery surfaces. Keep it editorial and believable rather than sci-fi.';
  }
  return '';
}

function _networkImageDiversityLockV503({role,h2Number,usedPrompts}){
  if(role==='featured')return {id:'featured-hero',direction:'Wide editorial hero composition with one dominant focal relationship, generous negative space and a clear subject hierarchy. Do not use a grid, collage or the same multi-panel structure as supporting images.'};
  const variants=[
    {id:'split-contrast',direction:'Use a wide left-versus-right editorial composition with two materially different visual lanes. Keep one clear focal point in each lane and an eye-level camera.'},
    {id:'overhead-process',direction:'Use a top-down process composition with physical or spatial elements arranged as a clear sequence. Avoid the same eye-level or split-panel composition used elsewhere.'},
    {id:'source-to-outcomes',direction:'Use one strong foreground source or starting point that visibly branches into multiple distinct outcomes across depth. Use a three-quarter perspective, not a flat diagram.'},
    {id:'human-action',direction:'Use a believable human action or decision scene where the section concept is visible through what people are doing. Avoid generic laptop-at-desk poses and avoid any composition already used.'},
    {id:'depth-layers',direction:'Use a strong foreground / midground / background composition that reveals different layers of the section concept. Keep the camera lower and more cinematic than other images.'},
    {id:'decision-path',direction:'Use a real-world decision or pathway composition with one clear fork, handoff or transition. The meaning must be understandable without signs, arrows or text.'},
    {id:'close-detail',direction:'Use a close editorial detail shot focused on one concrete interaction, object relationship or transformation central to this section. Avoid wide establishing shots.'},
    {id:'system-context',direction:'Use a wider environmental or system-context scene showing how several elements interact in one believable setting. Avoid split screens, dashboards and abstract floating UI.'}
  ];
  const used=new Set((Array.isArray(usedPrompts)?usedPrompts:[]).map(x=>{const ms=Array.from(String(x||'').matchAll(/VISUAL COMPOSITION LOCK:\s*([a-z0-9-]+)/gi));const m=ms.length?ms[ms.length-1]:null;return m&&m[1]||'';}).filter(Boolean));
  const start=Math.max(0,(Number(h2Number||1)-1)%variants.length);
  for(let i=0;i<variants.length;i++){const v=variants[(start+i)%variants.length];if(!used.has(v.id))return v;}
  return variants[start];
}

function _networkImagePromptText({role,name,purpose,cover,articleTitle,usedSubjects,usedPrompts,h2Number}){
  const section=cleanText(name,300),goal=cleanText(purpose,900),concepts=(Array.isArray(cover)?cover:[]).map(x=>cleanText(x,180)).filter(Boolean).slice(0,10),used=(Array.isArray(usedSubjects)?usedSubjects:[]).map(x=>cleanText(x,220)).filter(Boolean).slice(0,8),sceneDirection=_networkImageSceneDirection({role,section,purpose:goal,cover:concepts,articleTitle}),diversity=_networkImageDiversityLockV503({role,h2Number,usedPrompts}),usedLocks=Array.from(new Set((Array.isArray(usedPrompts)?usedPrompts:[]).map(x=>{const ms=Array.from(String(x||'').matchAll(/VISUAL COMPOSITION LOCK:\s*([a-z0-9-]+)/gi));return ms.length?ms[ms.length-1][1]:'';}).filter(Boolean))).slice(0,8);
  if(role==='featured'){
    return `Create one realistic, publication-grade FEATURED editorial image for the article "${section}". The image should communicate the overall article topic clearly without text, logos, watermarks, screenshots, invented data or branded UI. Avoid generic laptop-on-desk, coffee-mug, abstract AI-brain and dashboard compositions unless they are genuinely necessary to the topic. Use a distinctive concrete scene or clearly understandable visual relationship that fits this exact article.

VISUAL COMPOSITION LOCK: ${diversity.id} — ${diversity.direction}
DIVERSITY RULE: this featured image must not reuse the same camera angle, main objects, background setting, subject arrangement or central metaphor as any supporting image in this article.
COMMUNICATION TEST: someone who sees the image should understand why it belongs to this article without needing labels.`;
  }
  return `Create ONE realistic, publication-grade SUPPORTING editorial image for this exact H2 section — not for the article in general.

H2 SECTION (PRIMARY SUBJECT): "${section}"
SECTION PURPOSE: ${goal||`Visually explain the meaning of the H2 "${section}".`}
${concepts.length?`SECTION CONCEPTS THAT MAY BE SHOWN: ${concepts.join(' · ')}
`:''}ARTICLE CONTEXT (background only; do not make this the main subject): "${cleanText(articleTitle,300)}"
${used.length?`OTHER IMAGE SUBJECTS ALREADY USED: ${used.join(' | ')}
`:''}${usedLocks.length?`VISUAL COMPOSITION TYPES ALREADY USED — do not reuse them: ${usedLocks.join(' | ')}
`:''}${sceneDirection?sceneDirection+'\n':''}
VISUAL COMPOSITION LOCK: ${diversity.id} — ${diversity.direction}

VISUAL INVARIANTS:
- The visible concept must directly explain the H2 section and its purpose.
- Every image in the same article must be materially different in composition, camera angle, primary objects, setting and central visual idea.
- Do not reuse a prior image with only small prop, color, crop or background changes.
- Do not switch back to the seed keyword or create a generic image for the whole article.
- Prefer a concrete scene, process, relationship, allocation, comparison or immediately understandable system view.
- Use metaphor only when the meaning is obvious without labels; avoid arbitrary symbolism that only makes sense when explained in the prompt.
- If the H2 is abstract, show the relationship or process it describes rather than unrelated technology objects.
- Avoid generic laptop/desk/workspace/dashboard/notebook/coffee-mug/magnifying-glass/AI-brain imagery unless the H2 itself requires it.
- No text inside the image, no logos, no watermarks, no fake screenshots, no invented statistics or named people.
- COMMUNICATION TEST: a reader should be able to say why this image belongs to this H2, not merely the article topic.`;
}


function buildApprovedBriefContract(briefJson){
  const b=safeJsonObject(briefJson),structure=safeJsonObject(b.recommended_structure),entities=safeJsonObject(b.entity_strategy),evidence=safeJsonObject(b.evidence),balance=safeJsonObject(b.balance);
  const _intentRaw=b.search_intent, _intent=( _intentRaw && typeof _intentRaw==='object' && !Array.isArray(_intentRaw) )?safeJsonObject(_intentRaw):{primary:cleanText(_intentRaw||'',80)};
  const intentContract={primary:cleanText(_intent.primary||'',80)||null,secondary:cleanText(_intent.secondary||'',80)||null,query_format:cleanText(_intent.query_format||'standard',80)||'standard',strategy:cleanText(_intent.strategy||_intent.primary||'',240)||null,intent_bridge:cleanText(_intent.intent_bridge||'',900)||null,keyword_suggested_intent:cleanText(_intent.keyword_suggested_intent||'',80)||null,conflict:cleanText(_intent.conflict||'',900)||null};
  const blueprint=buildCanonicalApprovedOutline(b);
  const plannedH2s=[];const citationUrls=[];
  for(const item of blueprint){
    const heading=_briefItemText(item,['h2','heading','title','name']);if(heading&&!plannedH2s.some(x=>_outlineHeadingSame(x,heading)))plannedH2s.push(heading);
    if(item&&typeof item==='object') citationUrls.push(...extractUrlsDeep(item.citation_hook||item.citations||item.sources||item.source||''));
  }
  const paa=_briefArray(b.paa_questions,b.people_also_ask,b.paa,b.questions).map(x=>_briefItemText(x,['q','question','query','title'])).filter(Boolean);
  const faq=_briefArray(b.faq_questions,b.faqs,b.faq).map(x=>_briefItemText(x,['q','question','query','title'])).filter(Boolean);
  const entityList=_briefArray(b.must_cover_entities,b.entities_to_cover,entities.primary_entities,entities.entities).map(x=>_briefItemText(x,['name','entity','label'])).filter(Boolean);
  const quickFacts=_briefArray(b.quick_facts,b.facts).map(x=>_briefItemText(x,['label','name','title'])).filter(Boolean);
  const limitations=_briefArray(b.limitations,balance.limitations).map(x=>_briefItemText(x,['text','limitation','title'])).filter(Boolean);
  const useCases=_briefArray(b.use_cases,b.practical_use_cases).map(x=>_briefItemText(x,['audience','title','name'])).filter(Boolean);
  const statistics=_briefArray(evidence.statistics,b.statistics,b.original_statistics).map(x=>{
    if(typeof x==='string')return {evidence_text:cleanText(x,1800),source_url:'',best_source_url:'',source_title:'',best_source_title:'',quality_stage:'legacy_source_verified',authority_class:'ungraded',primary_verified:false,provenance_resolved:false,supports:''};
    if(!x||typeof x!=='object')return null;
    const evidence_text=cleanText(x.evidence_text||x.value||x.stat||x.text||'',1800),source_url=cleanText(x.source_url||x.url||'',1400),best_source_url=cleanText(x.best_source_url||source_url,1400),source_title=cleanText(x.source_title||x.source||'',500),best_source_title=cleanText(x.best_source_title||source_title,500),quality_stage=cleanText(x.quality_stage||'source_verified',80),authority_class=cleanText(x.authority_class||'ungraded',100),authority_score=Number(x.authority_score||0)||0,supports=cleanText(x.supports||x.supports_claim||'',800);
    return evidence_text?{evidence_text,source_url,best_source_url,source_title,best_source_title,quality_stage,authority_class,authority_score,primary_verified:!!x.primary_verified,provenance_resolved:!!x.provenance_resolved,supports}:null;
  }).filter(Boolean).slice(0,5);
  const expertQuotes=_briefArray(evidence.expert_quotes,b.expert_quotes,b.quotes).map(x=>{
    if(!x||typeof x!=='object')return null;
    const quote=cleanText(x.quote||x.text||'',1200),person=cleanText(x.person||x.expert||x.author||x.name||'',240),role=cleanText(x.role||x.title||x.job_title||'',240),source_url=cleanText(x.source_url||x.url||'',1400),source_title=cleanText(x.source_title||x.source||'',500),supports=cleanText(x.supports||x.supports_claim||'',800),quality_stage=cleanText(x.quality_stage||'source_verified',80),authority_class=cleanText(x.authority_class||'ungraded',100),authority_score=Number(x.authority_score||0)||0;
    return quote&&person&&_briefUrlKey(source_url)?{quote,person,role,source_url,source_title,supports,quality_stage,authority_class,authority_score,primary_verified:!!x.primary_verified}:null;
  }).filter(Boolean).slice(0,4);
  const expertInsights=_briefArray(evidence.expert_insights,b.expert_insights).map(x=>{
    if(!x||typeof x!=='object')return null;
    const insight=cleanText(x.insight||x.text||'',1200),person=cleanText(x.person||x.expert||x.author||x.name||'',240),role=cleanText(x.role||x.title||x.job_title||'',240),source_url=cleanText(x.source_url||x.url||'',1400),source_title=cleanText(x.source_title||x.source||'',500),supports=cleanText(x.supports||x.supports_claim||'',800),quality_stage=cleanText(x.quality_stage||'source_verified',80),authority_class=cleanText(x.authority_class||'ungraded',100),authority_score=Number(x.authority_score||0)||0;
    return insight&&person&&_briefUrlKey(source_url)?{insight,person,role,source_url,source_title,supports,quality_stage,authority_class,authority_score,attribution_mode:'paraphrase_only'}:null;
  }).filter(Boolean).slice(0,4);
  // v494: the Brief may contain a larger verified evidence pool, but the article should not
  // turn evidence into a quota. Select a small, high-quality writing set and make fidelity
  // enforce only that set. Primary/provenance-resolved evidence wins; diversify sources.
  const _evidenceRank=x=>(x&&x.primary_verified?10000:0)+(x&&x.provenance_resolved?5000:0)+(Number(x&&x.authority_score||0)*10)+(x&&x.quality_stage==='primary_verified'?500:0);
  const _distinctTop=(items,limit,urlField)=>{const out=[],hosts=new Set();for(const x of items.slice().sort((a,b)=>_evidenceRank(b)-_evidenceRank(a))){let h='';try{h=new URL(String(x&&x[urlField]||x&&x.source_url||'')).hostname.toLowerCase().replace(/^www\./,'')}catch(_e){}if(h&&hosts.has(h)&&out.length<Math.max(1,limit-1))continue;out.push(x);if(h)hosts.add(h);if(out.length>=limit)break;}return out;};
  const selectedStatistics=_distinctTop(statistics,Math.min(3,statistics.length),'best_source_url');
  const selectedQuotes=_distinctTop(expertQuotes,Math.min(1,expertQuotes.length),'source_url');
  const selectedInsights=selectedQuotes.length?[]:_distinctTop(expertInsights,Math.min(1,expertInsights.length),'source_url');
  const evidenceQuality=safeJsonObject(b.evidence_research&&b.evidence_research.quality_ladder);
  const externalTargets=extractUrlsDeep([b.external_source_targets,b.external_link_targets,b.citation_targets,evidence.official_sources,evidence.authority_sources,evidence.sources,b.official_sources,b.external_sources]);
  const evidenceResearchUrls=[].concat(selectedStatistics.map(x=>x&&x.best_source_url||x&&x.source_url||''),selectedQuotes.map(x=>x&&x.source_url||''),selectedInsights.map(x=>x&&x.source_url||'')).filter(Boolean);
  const requiredEvidenceUrls=Array.from(new Set(evidenceResearchUrls.slice(0,4).concat(citationUrls.slice(0,4)).concat((evidenceResearchUrls.length||citationUrls.length)?[]:externalTargets.slice(0,4)).map(_briefUrlKey).filter(Boolean))).slice(0,6);
  const explicitTarget=Number(b.target_word_count||b.recommended_word_count||(b.content_requirements&&b.content_requirements.target_words)||0)||0;
  const outlineTarget=blueprint.reduce((n,x)=>n+(Number(x&&x.target_words)||0),0);
  const targetWords=explicitTarget||outlineTarget||null;
  const minimumUsefulWords=targetWords?Math.max(1200,Math.min(2600,Math.round(targetWords*0.80))):1200;
  return {intent_contract:intentContract,definitive_outline:blueprint.slice(0,16),planned_h2s:Array.from(new Set(plannedH2s)).slice(0,16),paa_questions:Array.from(new Set(paa)).slice(0,12),faq_questions:Array.from(new Set(faq)).slice(0,12),entities:Array.from(new Set(entityList)).slice(0,30),quick_facts:Array.from(new Set(quickFacts)).slice(0,12),limitations:Array.from(new Set(limitations)).slice(0,10),use_cases:Array.from(new Set(useCases)).slice(0,10),statistics:selectedStatistics,expert_quotes:selectedQuotes,expert_insights:selectedInsights,evidence_pool_summary:{statistics_available:statistics.length,expert_quotes_available:expertQuotes.length,expert_insights_available:expertInsights.length,selection_rule:'Use a small best-available evidence set; prefer primary/provenance-resolved sources and never force every verified item into one article.'},evidence_research_completed:!!(b.evidence_research&&b.evidence_research.completed===true),evidence_quality_completed:!!(evidenceQuality&&evidenceQuality.completed===true),evidence_quality_summary:{approved_items:Number(evidenceQuality.approved_items||0),primary_verified:Number(evidenceQuality.primary_verified||0),source_verified:Number(evidenceQuality.source_verified||0),stages:Array.isArray(evidenceQuality.stages)?evidenceQuality.stages.slice(0,8):[]},required_evidence_urls:requiredEvidenceUrls,target_words:targetWords,minimum_useful_words:minimumUsefulWords,structure_rule:'planned_h2s / definitive_outline are authoritative. Use every H2 exactly once and in this order.',intent_rule:'The live-SERP primary intent controls the page format. Query format and verified secondary intent must still be served; never discard a real secondary need or treat comparison wording as automatically commercial.',evidence_rule:'Use only evidence approved by the Evidence Quality Ladder. Prefer best_source_url for statistics when provenance was resolved. Preserve exact quote wording/source for direct quotes. Expert insights are paraphrase_only and may never be placed inside quotation marks. Never invent substitutes.'};
}


function _networkAiEvidenceStateV500(b){
  const ae=safeJsonObject(b&&b.ai_system_evidence),keys=['google_aio','chatgpt','perplexity','claude','copilot'],labels={google_aio:'Google AIO / Gemini',chatgpt:'ChatGPT Search',perplexity:'Perplexity',claude:'Claude',copilot:'Microsoft Copilot'};
  const checked=keys.filter(k=>ae[k]&&ae[k].checked===true),missing=keys.filter(k=>!checked.includes(k));
  return {checked_count:checked.length,checked,missing,missing_labels:missing.map(k=>labels[k]||k),complete:checked.length===5};
}
function _networkFiveAiResearchV500(b){
  const keys=['google_aio','chatgpt','perplexity','claude','copilot'],labels={google_aio:'Google AIO / Gemini',chatgpt:'ChatGPT Search',perplexity:'Perplexity',claude:'Claude',copilot:'Microsoft Copilot'},ae=safeJsonObject(b&&b.ai_system_evidence),analysis=safeJsonObject(b&&b.ai_systems_analysis);
  const systems={};
  for(const k of keys){
    const ev=safeJsonObject(ae[k]),an=safeJsonObject(analysis[k]),raw=String(ev.text||'').trim();
    let summary=cleanText(an.answer_summary||'',1200);
    if((!summary||/^not checked$/i.test(summary))&&raw){let x=raw,at=x.toUpperCase().indexOf('RESOURCES:');if(at>=0)x=x.slice(0,at);summary=cleanText(x.replace(/^ANSWER:\s*/i,''),1200);}
    const urls=Array.from(new Set([].concat(Array.isArray(an.citation_sources)?an.citation_sources.map(x=>x&&x.exact_url||''):[],extractUrlsDeep(raw)).map(x=>cleanText(x,1600)).filter(x=>/^https:\/\//i.test(x)))).slice(0,10);
    systems[k]={label:labels[k],checked:ev.checked===true,source:cleanText(ev.source||an.evidence_source||'',80),answer_summary:summary,citation_sources:urls};
  }
  const state=_networkAiEvidenceStateV500(b||{});
  return {required:5,checked:state.checked_count,complete:state.complete,missing:state.missing_labels,systems,rule:'Use these five saved AI-system answers as research evidence to strengthen coverage and source awareness. Do not merge systems into fake consensus and do not call non-Google evidence a Google AI Overview finding.'};
}
function _networkReaderInternalUrlV500(raw,publisherDomain){
  try{const u=new URL(String(raw||'').trim()),h=normalizeHost(u.hostname),p=String(u.pathname||'/').toLowerCase(),pub=normalizeHost(publisherDomain||'');if(!pub||h!==pub||u.protocol!=='https:')return false;if(/(?:^|\/)(?:sitemap(?:[_-]index)?|wp-sitemap|robots)(?:[._\/-]|$)/i.test(p)||/\.xml$/i.test(p)||/\/feed\/?$/i.test(p)||/\/wp-json(?:\/|$)/i.test(p))return false;return true;}catch(_e){return false}
}
function _networkInternalDestinationStateV500(b,publisherDomain){
  const targets=Array.isArray(b&&b.internal_link_targets)?b.internal_link_targets:[],valid=targets.filter(x=>x&&_networkReaderInternalUrlV500(x.link_to,publisherDomain));
  return {publisher_domain:normalizeHost(publisherDomain||''),valid_count:valid.length,selected_url:valid[0]&&valid[0].link_to||'',complete:valid.length>0};
}

function _networkGenerationConflictV503(res,code,error,ctx={}){
  const payload={
    success:false,
    error:String(error||'Publisher Edition generation is blocked.'),
    code:String(code||'publisher_generation_conflict'),
    stage:'publisher_generation',
    retryable:ctx.retryable===true,
    next_action:cleanText(ctx.next_action||'',600)||null,
    placement_id:Number(ctx.placement_id||0)||null,
    placement_status:cleanText(ctx.placement_status||'',80)||null,
    brief_id:Number(ctx.brief_id||0)||null,
    approval_id:Number(ctx.approval_id||0)||null,
    details:ctx.details&&typeof ctx.details==='object'?ctx.details:null
  };
  return res.status(409).json(payload);
}

// v502 — automatic publisher-page selection. A real verified page beats / (index/homepage).
// Manual publisher choices are preserved. Homepage is used only when no eligible page exists.
function _networkAutoSelectInternalDestinationV502(b,publisherDomain){
  b=safeJsonObject(b);const pub=normalizeHost(publisherDomain||'');if(!pub)return {brief:b,changed:false,url:'',source:'no_publisher_domain'};
  b.internal_link_targets=Array.isArray(b.internal_link_targets)?b.internal_link_targets:[];
  b.link_research=safeJsonObject(b.link_research);b.link_research.internal=safeJsonObject(b.link_research.internal);
  const lr=b.link_research.internal,clean=u=>{try{const x=new URL(String(u||'').trim());x.hash='';return x.href}catch(_e){return ''}},isRoot=u=>{try{const x=new URL(String(u||''));return (x.pathname||'/')==='/'&&!x.search}catch(_e){return false}};
  const current=b.internal_link_targets.find(x=>x&&_networkReaderInternalUrlV500(x.link_to,pub))||null;
  if(current&&/manual/i.test(String(current.selection_source||current.source||'')))return {brief:b,changed:false,url:current.link_to,source:'publisher_manual'};
  if(current&&!isRoot(current.link_to))return {brief:b,changed:false,url:current.link_to,source:String(current.selection_source||'existing_verified_target')};
  const candidates=Array.from(new Set([].concat(Array.isArray(lr.candidate_urls)?lr.candidate_urls:[],b.internal_link_targets.map(x=>x&&x.link_to||'')).map(clean).filter(Boolean))).filter(u=>_networkReaderInternalUrlV500(u,pub));
  const pages=candidates.filter(u=>!isRoot(u));
  let chosen=null,source='';
  if(pages.length){
    const stop=new Set(['the','and','for','with','from','what','how','why','vs','versus','this','that','guide','blog','page','home','index','www','com','site']);
    const tok=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(x=>x.length>=3&&!stop.has(x));
    const topic=new Set([].concat(tok(b.keyword),tok(b.recommended_title_h1),(Array.isArray(b.must_cover_entities)?b.must_cover_entities:[]).flatMap(tok),(Array.isArray(b.definitive_outline)?b.definitive_outline:[]).flatMap(x=>tok(x&&x.h2||''))).slice(0,160));
    const ranked=pages.map(u=>{try{const x=new URL(u),pt=tok(x.pathname),hits=pt.filter(t=>topic.has(t)).length;return {url:u,hits,score:hits*10+Math.min(5,pt.length),path:x.pathname}}catch(_e){return {url:u,hits:0,score:0,path:''}}}).sort((a,z)=>z.score-a.score||a.path.length-z.path.length);
    const best=ranked[0],seg=(best.path.split('/').filter(Boolean).pop()||'related page').replace(/[-_]+/g,' ').trim();
    chosen={anchor_text:seg||'related page',link_to:best.url,why:best.hits?'Automatically selected verified publisher page with the strongest URL-topic overlap.':'Automatically selected a verified reader-facing publisher page. Homepage was avoided because a real page exists.',selection_source:best.hits?'publisher_verified_relevant_page':'publisher_verified_page_fallback',review_recommended:best.hits===0};source=chosen.selection_source;
  }else if(current){chosen=current;source=String(current.selection_source||'publisher_homepage_fallback');}
  else{const home='https://'+pub+'/';chosen={anchor_text:'Publisher homepage',link_to:home,why:'Last-resort publisher homepage fallback because no eligible reader-facing publisher page was verified.',selection_source:'publisher_homepage_fallback',review_recommended:true};source='publisher_homepage_fallback';}
  const before=JSON.stringify({targets:b.internal_link_targets,lr:b.link_research.internal});
  b.internal_link_targets=[chosen];
  b.research_contract=safeJsonObject(b.research_contract);b.research_contract.internal_destination_required=true;b.research_contract.internal_destination_domain=pub;
  b.link_research.internal=Object.assign({},lr,{searched:true,status:source==='publisher_homepage_fallback'?'verified_homepage_last_resort':'verified_targets',targets_selected:1,target_domain:pub,publisher_domain:pub,selected_url:chosen.link_to,selection_source:source,required_for_publisher_edition:true,manual_same_domain_allowed:true,homepage_last_resort:true,rule:'Prefer a verified reader-facing publisher page. Homepage is last resort only when no eligible page exists. Discovery XML/sitemap/robots/feed URLs are never article links.'});
  const after=JSON.stringify({targets:b.internal_link_targets,lr:b.link_research.internal});
  return {brief:b,changed:before!==after,url:chosen.link_to,source};
}

function _networkBriefHash(briefJson){  return crypto.createHash('sha256').update(JSON.stringify(safeJsonObject(briefJson))).digest('hex');
}
function _networkBriefApprovalReadiness(briefJson,opts={}){
  const b=safeJsonObject(briefJson),q=safeJsonObject(b.ai_quality_check),contract=buildApprovedBriefContract(b),missing=[],aiState=_networkAiEvidenceStateV500(b),internalState=_networkInternalDestinationStateV500(b,opts.publisher_domain||'');
  if(q.ready_for_generation!==true)missing.push('ai_quality_check.ready_for_generation');
  if(Number(q.readiness_score||0)<90)missing.push('readiness_score_below_90');
  if(!contract||!Array.isArray(contract.planned_h2s)||contract.planned_h2s.length<3)missing.push('canonical_outline');
  if(!contract||contract.evidence_research_completed!==true)missing.push('evidence_research');
  if(!contract||contract.evidence_quality_completed!==true)missing.push('evidence_quality_ladder');
  if(!contract||!contract.intent_contract||!cleanText(contract.intent_contract.primary||'',80))missing.push('search_intent');
  if(!contract||Number(contract.minimum_useful_words||0)<1200)missing.push('content_depth_target');
  if(!aiState.complete)missing.push('ai_system_evidence_5_of_5');
  if(opts.publisher_domain&&!internalState.complete)missing.push('publisher_internal_destination');
  return {passed:missing.length===0,missing,score:Number(q.readiness_score||0),ready_for_generation:q.ready_for_generation===true,contract,ai_evidence:aiState,internal_destination:internalState};
}
async function _networkApproveBriefSnapshot(pool,briefId,adminId,opts={}){
  await ensureNetworkPrewriteApprovalTable(pool);
  const r=await pool.query(`SELECT id,keyword,working_title,language,region,brief_json,competitors_scraped,created_at FROM prewrite_briefs WHERE id=$1 LIMIT 1`,[Number(briefId)]),brief=r.rows[0];
  if(!brief){const e=new Error('Prewrite Brief not found');e.status=404;throw e;}
  const readiness=_networkBriefApprovalReadiness(brief.brief_json||{},opts);
  if(!readiness.passed){const e=new Error('Brief is not ready for approval. Complete the Brief first: '+readiness.missing.join(', '));e.status=409;e.details=readiness;throw e;}
  const hash=_networkBriefHash(brief.brief_json||{}),client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(`UPDATE network_prewrite_approvals SET invalidated_at=COALESCE(invalidated_at,NOW()),invalidated_reason=CASE WHEN invalidated_at IS NULL THEN 'Superseded by a newly approved Brief snapshot' ELSE invalidated_reason END,updated_at=NOW() WHERE prewrite_brief_id=$1 AND brief_hash<>$2 AND invalidated_at IS NULL`,[brief.id,hash]);
    const a=await client.query(`INSERT INTO network_prewrite_approvals (prewrite_brief_id,brief_hash,brief_snapshot,approved_contract,readiness_snapshot,approved_by_admin_id,approved_at,created_at,updated_at)
      VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,NOW(),NOW(),NOW())
      ON CONFLICT (prewrite_brief_id,brief_hash) DO UPDATE SET brief_snapshot=EXCLUDED.brief_snapshot,approved_contract=EXCLUDED.approved_contract,readiness_snapshot=EXCLUDED.readiness_snapshot,approved_by_admin_id=EXCLUDED.approved_by_admin_id,approved_at=NOW(),invalidated_at=NULL,invalidated_reason=NULL,updated_at=NOW()
      RETURNING id,prewrite_brief_id,brief_hash,approved_by_admin_id,approved_at`,[brief.id,hash,JSON.stringify(brief.brief_json||{}),JSON.stringify(readiness.contract||{}),JSON.stringify({score:readiness.score,ready_for_generation:readiness.ready_for_generation,missing:readiness.missing}),cleanText(adminId||'',200)||null]);
    await client.query('COMMIT');
    return {approval:a.rows[0],brief,brief_hash:hash,brief_snapshot:safeJsonObject(brief.brief_json),contract:readiness.contract,readiness};
  }catch(e){try{await client.query('ROLLBACK')}catch(_){}throw e}finally{client.release()}
}
async function _networkGetValidApproval(pool,briefId,approvalId){
  await ensureNetworkPrewriteApprovalTable(pool);
  const br=await pool.query(`SELECT id,keyword,working_title,language,region,brief_json,competitors_scraped,created_at FROM prewrite_briefs WHERE id=$1 LIMIT 1`,[Number(briefId)]),brief=br.rows[0];
  if(!brief){const e=new Error('Linked Prewrite Brief not found');e.status=409;e.code='prewrite_missing';throw e;}
  const currentHash=_networkBriefHash(brief.brief_json||{});
  const vals=[Number(briefId)],cond=[`prewrite_brief_id=$1`,`invalidated_at IS NULL`];
  if(Number(approvalId)>0){vals.push(Number(approvalId));cond.push(`id=$${vals.length}`)}
  const ar=await pool.query(`SELECT id,prewrite_brief_id,brief_hash,brief_snapshot,approved_contract,readiness_snapshot,approved_by_admin_id,approved_at FROM network_prewrite_approvals WHERE ${cond.join(' AND ')} ORDER BY approved_at DESC,id DESC LIMIT 1`,vals),approval=ar.rows[0];
  if(!approval){const e=new Error('Approve the current Prewrite Brief before generating content.');e.status=409;e.code='approval_missing';throw e;}
  if(String(approval.brief_hash)!==String(currentHash)){
    await pool.query(`UPDATE network_prewrite_approvals SET invalidated_at=COALESCE(invalidated_at,NOW()),invalidated_reason=COALESCE(invalidated_reason,'Brief changed after approval'),updated_at=NOW() WHERE id=$1`,[approval.id]).catch(()=>{});
    const e=new Error('The Prewrite Brief changed after approval. Review it and approve the current version before generating.');e.status=409;e.code='approval_stale';e.details={approval_id:Number(approval.id),approved_hash:String(approval.brief_hash),current_hash:String(currentHash)};throw e;
  }
  const snapshot=safeJsonObject(approval.brief_snapshot),checkHash=_networkBriefHash(snapshot);
  if(checkHash!==String(approval.brief_hash)){const e=new Error('Approved Brief snapshot failed integrity verification. Re-approve the Brief before generation.');e.status=409;e.code='approval_snapshot_integrity';e.details={approval_id:Number(approval.id),snapshot_hash:String(checkHash),approved_hash:String(approval.brief_hash)};throw e;}
  return {approval,brief,brief_hash:currentHash,brief_snapshot:snapshot,contract:safeJsonObject(approval.approved_contract)};
}

function checkApprovedBriefFidelity(html, briefJson, opts={}){
  const contract=(opts.approved_contract&&Object.keys(safeJsonObject(opts.approved_contract)).length)?safeJsonObject(opts.approved_contract):buildApprovedBriefContract(briefJson),articleText=htmlText(html),articleNorm=_briefNorm(articleText),h2s=extractH2Headings(html).map(x=>x.text),links=Array.from(String(html||'').matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)).map(m=>m[1]),linkKeys=new Set(links.map(_briefUrlKey).filter(Boolean));
  const matchedH2Indexes=contract.planned_h2s.map(x=>h2s.findIndex(y=>_outlineHeadingSame(x,y)));
  const missingH2s=contract.planned_h2s.filter((x,i)=>matchedH2Indexes[i]<0);
  const outlineOrderBroken=!missingH2s.length&&matchedH2Indexes.some((idx,i)=>i>0&&idx<=matchedH2Indexes[i-1]);
  const questionMissing=q=>{const nq=_briefNorm(q);return nq&&!articleNorm.includes(nq)};
  const missingPaa=contract.paa_questions.filter(questionMissing),missingFaq=contract.faq_questions.filter(questionMissing);
  const missingEntities=contract.entities.filter(x=>!_briefEntityCovered(x,articleNorm));
  const missingQuickFacts=contract.quick_facts.filter(x=>{const toks=_briefTokens(x);return toks.length&&toks.filter(t=>articleNorm.includes(t)).length/Math.max(1,toks.length)<0.6});
  const missingLimitations=contract.limitations.filter(x=>{const toks=_briefTokens(x);return toks.length>=3&&toks.filter(t=>articleNorm.includes(t)).length/Math.max(1,toks.length)<0.45});
  const missingUseCases=contract.use_cases.filter(x=>{const n=_briefNorm(x);return n&&!articleNorm.includes(n)});
  const missingEvidence=contract.required_evidence_urls.filter(x=>!linkKeys.has(x));
  const _articleLower=articleText.toLowerCase();
  const _statNumberTokens=function(v){return Array.from(String(v||'').matchAll(/\b\d[\d,.]*(?:%|x|×)?\b/gi)).map(m=>m[0]).filter(t=>{const n=Number(String(t).replace(/[^0-9.]/g,''));return !(/^\d{4}$/.test(t)&&n>=1900&&n<=2100)});};
  const missingStatistics=(contract.statistics||[]).filter(st=>{
    const txt=typeof st==='string'?st:cleanText(st&&st.evidence_text||'',1800),preferred=_briefUrlKey(st&&typeof st==='object'&&(st.best_source_url||st.source_url)||''),urls=preferred?[preferred]:extractUrlsDeep(st).map(_briefUrlKey).filter(Boolean),nums=_statNumberTokens(txt);
    const sourceOk=!urls.length||urls.some(u=>linkKeys.has(u));
    const numberOk=!nums.length||nums.some(n=>_articleLower.includes(String(n).toLowerCase()));
    return !(sourceOk&&numberOk);
  });
  const missingExpertQuotes=(contract.expert_quotes||[]).filter(q=>{
    if(!q)return false;const u=_briefUrlKey(q.source_url),person=_briefNorm(q.person),qt=_briefTokens(q.quote),hit=qt.filter(t=>articleNorm.includes(t)).length;
    return !((!u||linkKeys.has(u))&&person&&articleNorm.includes(person)&&(qt.length<4||hit/qt.length>=0.45));
  });
  const missingExpertInsights=(contract.expert_insights||[]).filter(q=>{
    if(!q)return false;const u=_briefUrlKey(q.source_url),person=_briefNorm(q.person),it=_briefTokens(q.insight),hit=it.filter(t=>articleNorm.includes(t)).length;
    return !((!u||linkKeys.has(u))&&person&&articleNorm.includes(person)&&(it.length<4||hit/it.length>=0.40));
  });
  const internalCandidates=Array.isArray(opts.internal_candidates)?opts.internal_candidates:[];
  const publisherHost=normalizeHost(opts.publisher_domain||'');
  const internalLinks=Array.from(new Set(links.filter(u=>{const h=normalizeHost(u);return publisherHost&&h&&(h===publisherHost||h.endsWith('.'+publisherHost))}).map(_briefUrlKey).filter(Boolean)));
  const requiredInternal=_briefUrlKey(opts.required_internal_url||'');
  const _missingRequired=requiredInternal&&!linkKeys.has(requiredInternal)?[opts.required_internal_url]:[];
  const _needInternal=Math.max(0,2-internalLinks.length);
  const _availableInternal=internalCandidates.filter(u=>!linkKeys.has(_briefUrlKey(u))).slice(0,Math.max(2,_needInternal));
  const missingInternal=_missingRequired.length?_missingRequired:(_needInternal>0?(_availableInternal.length?_availableInternal:[`Need ${_needInternal} more unique publisher-domain internal link(s); add verified same-domain candidates first.`]):[]);
  const articleWords=articleText.split(/\s+/).filter(Boolean).length,minimumUsefulWords=Number(contract.minimum_useful_words||1200);
  const depthMissing=articleWords<minimumUsefulWords?[`Useful words ${articleWords}; minimum ${minimumUsefulWords}${contract.target_words?' toward Brief target '+contract.target_words:''}`]:[];
  const groups={evidence_research:contract.evidence_research_completed?[]:['Approved Brief predates or failed verified evidence enrichment; regenerate the Brief before publication.'],evidence_quality:contract.evidence_quality_completed?[]:['Approved Brief did not complete the Evidence Quality Ladder; regenerate the Brief before publication.'],definitive_outline:missingH2s,outline_order:outlineOrderBroken?contract.planned_h2s:[],depth:depthMissing,paa_answers:missingPaa,faq_questions:missingFaq,entities:missingEntities,quick_facts:missingQuickFacts,limitations:missingLimitations,use_cases:missingUseCases,evidence_links:missingEvidence,statistics:missingStatistics,expert_quotes:missingExpertQuotes,expert_insights:missingExpertInsights,internal_links:missingInternal};
  const missing=Object.entries(groups).filter(([,v])=>Array.isArray(v)&&v.length).map(([k])=>k);
  return {passed:missing.length===0,missing,groups,contract,counts:{words:articleWords,target_words:contract.target_words||null,minimum_useful_words:minimumUsefulWords,planned_h2s:contract.planned_h2s.length,paa:contract.paa_questions.length,faq:contract.faq_questions.length,entities:contract.entities.length,evidence_urls:contract.required_evidence_urls.length,statistics:contract.statistics.length,primary_verified_statistics:contract.statistics.filter(x=>x&&x.primary_verified).length,expert_quotes:contract.expert_quotes.length,expert_insights:contract.expert_insights.length,internal_candidates:internalCandidates.length,internal_links:internalLinks.length,required_internal_url:opts.required_internal_url||null,required_internal_present:requiredInternal?linkKeys.has(requiredInternal):null}};
}

function scorePublication(row, images) {
  const html=String(row.html||''),plain=htmlText(html),words=plain?plain.split(/\s+/).filter(Boolean).length:0,h1=(html.match(/<h1\b/gi)||[]).length,h2=(html.match(/<h2\b/gi)||[]).length,h3=(html.match(/<h3\b/gi)||[]).length,standard=publicationStandardChecks(html);
  const links=Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)).map(m=>m[1]),sourceHost=normalizeHost(row.source_domain||''),sourceLink=sourceHost?links.some(u=>{const h=normalizeHost(u);return h===sourceHost||h.endsWith('.'+sourceHost)}):!row.source_link_required,externalLinks=links.filter(u=>/^https?:\/\//i.test(u));
  const metaTitleLen=String(row.meta_title||'').trim().length,metaDescLen=String(row.meta_description||'').trim().length,schema=row.schema_json&&typeof row.schema_json==='object'?row.schema_json:{},imageRows=Array.isArray(images)?images:[],uploaded=imageRows.filter(x=>x.status==='uploaded'||x.status==='approved'),featured=uploaded.some(x=>x.image_role==='featured'),altOk=uploaded.length>0&&uploaded.every(x=>String(x.alt_text||'').trim().length>=8);
  const settings=getPublicationSettings(row.generation_input_snapshot,{author_name:row.source_brand||row.brand_name||'',author_url:row.source_domain?`https://${row.source_domain}`:''}),authorOk=!!settings.author_name,snap=safeJsonObject(row.generation_input_snapshot),prewriteUsed=!!(snap.prewrite_used||snap.prewrite_brief_id),attribution=/contentscale-network-credit|ContentScale Network indexable placement/i.test(html),briefContract=safeJsonObject(snap.approved_brief_contract),briefMin=Number(briefContract.minimum_useful_words||1200),briefTarget=Number(briefContract.target_words||0),savedIntel=safeJsonObject(snap.link_intelligence),linkPolicy=_networkPublicationLinkPolicyV522(row,{publisher_domain:row.publisher_domain,source_domain:row.source_domain,internal_candidates:Array.isArray(savedIntel.publisher_internal_candidates)?savedIntel.publisher_internal_candidates:[],external_candidates:Array.isArray(savedIntel.external_candidates)?savedIntel.external_candidates:[]});
  const depthScore=words>=Math.max(1500,briefTarget||0)?20:words>=briefMin?18:words>=1200?14:words>=1000?10:words>=800?7:words>=500?4:2;
  const parts={
    depth:{label:'Depth',score:depthScore,max:20,detail:`${words} words${briefTarget?' · Brief target '+briefTarget:''}${briefMin>1200?' · minimum '+briefMin:''}`},
    structure:{label:'Structure',score:(h1===1?4:0)+(h2>=5?8:h2===4?6:h2===3?4:h2>=1?2:0)+(standard.direct_answer?3:0)+(standard.tldr?2:0)+(standard.table_of_contents?3:0),max:20,detail:`H1 ${h1} · H2 ${h2}`},
    meta:{label:'Meta',score:(metaTitleLen>=1&&metaTitleLen<=60?5:metaTitleLen>0?2:0)+(metaDescLen>=140&&metaDescLen<=160?5:metaDescLen>0?2:0)+(String(row.suggested_slug||'').trim()?2:0),max:12,detail:`title ${metaTitleLen}/60 · description ${metaDescLen}/160${metaDescLen>=150&&metaDescLen<=159?' · ideal':''}`},
    schema:{label:'Schema',score:Object.keys(schema).length?8:0,max:8,detail:Object.keys(schema).length?'Article schema present':'Missing schema'},
    evidence:{label:'Evidence & links',score:(sourceLink?3:0)+(linkPolicy.internal.count>=3?3:linkPolicy.internal.count>=2?2:0)+(linkPolicy.external.count>=3?3:linkPolicy.external.count>=2?2:0)+(prewriteUsed?3:0),max:12,detail:`source ${sourceLink?'✓':'✕'} · internal ${linkPolicy.internal.count} · external ${linkPolicy.external.count} · Prewrite ${prewriteUsed?'✓':'✕'}`},
    table:{label:'Useful table',score:standard.mobile_friendly_table?6:0,max:6,detail:standard.mobile_friendly_table?'Present':'Missing'},
    faq:{label:'FAQ depth',score:standard.faq_count>=8?6:standard.faq_count>=5?5:standard.faq_count>=3?3:standard.faq_count>=1?1:0,max:6,detail:`${standard.faq_count||0} questions`},
    images:{label:'Images · optional',score:8,max:8,detail:uploaded.length?`${uploaded.length} uploaded${featured?' · featured ✓':''}${altOk?' · alt text ✓':' · review alt text'} · optional / non-blocking`:'Optional · none added · never blocks delivery'},
    author:{label:'Author',score:authorOk?4:0,max:4,detail:authorOk?settings.author_name:'Missing'},
    delivery:{label:'Delivery readiness',score:(standard.mobile_friendly_table?2:0)+(attribution?2:0),max:4,detail:`table ${standard.mobile_friendly_table?'✓':'✕'} · attribution ${attribution?'✓':'✕'}`}
  };
  const score=Object.values(parts).reduce((n,p)=>n+Number(p.score||0),0);
  return {score,status:score>=85&&standard.passed&&linkPolicy.passed?'passed':score>=65?'needs_review':'failed',words,h1,h2,h3,internal_link_count:linkPolicy.internal.count,external_link_count:linkPolicy.external.count,link_policy:linkPolicy,source_link_ok:sourceLink,featured_image:featured,image_count:uploaded.length,author_ok:authorOk,prewrite_used:prewriteUsed,critical_standard_passed:standard.passed,parts};
}


// v527 — ONE authoritative Publication Readiness decision engine.
// Every UI/action consumer receives the same ordered gate result. Images are deliberately optional.
function _networkPublicationReadinessV527(ctx){
  ctx=ctx||{};
  const status=String(ctx.placement_status||'');
  const liveStates=['submitted','verifying','needs_review','verified'];
  const prewriteLinked=!!ctx.prewrite_linked;
  const aiComplete=!!ctx.ai_complete;
  const internalDestinationReady=!!ctx.internal_destination_ready;
  const generationCurrent=ctx.generation_current!==false;
  const internalCandidates=Number(ctx.internal_candidate_count||0);
  const externalCandidates=Number(ctx.external_candidate_count||0);
  const internalUsed=Number(ctx.internal_used_count||0);
  const externalUsed=Number(ctx.external_used_count||0);
  const linkPolicyReady=!!ctx.link_policy_ready;
  const briefReady=!!ctx.brief_fidelity_ready;
  const standardReady=!!ctx.publication_standard_ready;
  const metaReady=!!ctx.meta_policy_ready;
  const seedReady=!!ctx.seed_keyword_ready;
  const internalPreviewCurrent=!!ctx.internal_preview_current;
  const officialScanCurrent=!!ctx.official_scan_current;
  const officialScore=Number(ctx.official_contentscore||0);
  const minimumScore=80;
  const contentScoreReady=officialScanCurrent&&officialScore>=minimumScore;
  const copiedCurrent=!!ctx.seo_copied_current;
  const copiedAt=String(ctx.seo_copied_at||'');
  const verification=ctx.live_verification&&typeof ctx.live_verification==='object'?ctx.live_verification:null;
  const verificationDetails=verification&&verification.details&&typeof verification.details==='object'?verification.details:{};
  const verificationPassed=!!(verification&&String(verification.result_status||'')==='passed');
  const verificationReachable=!!(verification&&Number(verification.http_status)>=200&&Number(verification.http_status)<400);
  const verificationFetchFailed=!!(verification&&(verificationDetails.fetch_error||!verificationReachable));
  const copiedAfterCheck=!!(copiedCurrent&&copiedAt&&(!verification||!verification.checked_at||Date.parse(copiedAt)>Date.parse(verification.checked_at)));
  const researchReady=prewriteLinked&&aiComplete&&internalDestinationReady;
  const contentContractReady=researchReady&&generationCurrent&&briefReady&&standardReady&&metaReady&&seedReady&&linkPolicyReady;
  const deliveryReady=contentContractReady;
  const finalReady=deliveryReady&&internalPreviewCurrent&&contentScoreReady;
  const liveState=liveStates.includes(status);

  const checks=[
    {key:'prewrite_linked',label:'Prewrite Brief linked',passed:prewriteLinked,blocking:true,step:1},
    {key:'ai_5_of_5',label:'5/5 AI research complete',passed:aiComplete,blocking:true,step:1},
    {key:'internal_destination',label:'Publisher internal destination selected',passed:internalDestinationReady,blocking:true,step:1},
    {key:'generation_current',label:'Current content matches current approved Brief snapshot',passed:generationCurrent,blocking:true,step:3},
    {key:'internal_3',label:'3 verified internal URLs available and used',passed:internalCandidates>=3&&internalUsed>=3,blocking:true,step:4,detail:internalUsed+'/'+3+' used · '+internalCandidates+' verified candidates'},
    {key:'external_3',label:'3 verified external URLs available and used',passed:externalCandidates>=3&&externalUsed>=3,blocking:true,step:4,detail:externalUsed+'/'+3+' used · '+externalCandidates+' verified candidates'},
    {key:'brief_fidelity',label:'Approved Brief Fidelity passes',passed:briefReady,blocking:true,step:4},
    {key:'publication_standard',label:'Publication Standard passes',passed:standardReady,blocking:true,step:4},
    {key:'meta_policy',label:'SEO meta policy passes',passed:metaReady,blocking:true,step:4},
    {key:'seed_keyword',label:'Seed-keyword policy passes',passed:seedReady,blocking:true,step:4},
    {key:'images_optional',label:'Images optional / non-blocking',passed:true,blocking:false,step:5},
    {key:'internal_preview',label:'Stable internal live URL matches current HTML',passed:internalPreviewCurrent,blocking:true,step:7},
    {key:'contentscore',label:'Real ContentScore is current and at least '+minimumScore,passed:contentScoreReady,blocking:true,step:8,detail:officialScanCurrent?(officialScore+'/100'):'not current'},
    {key:'seo_html_copy',label:'SEO publication HTML copied for current HTML',passed:copiedCurrent,blocking:false,step:6},
    {key:'live_verified',label:'Live placement manually verified',passed:status==='verified',blocking:false,step:10}
  ];

  let next={key:'prewrite',control_id:'prewriteStepBtn',step:1,label:'Open Prewrite Brief',reason:'Complete the current Prewrite requirement.'};
  if(!prewriteLinked||!aiComplete||!internalDestinationReady){
    const reason=!prewriteLinked?'Link or create the Prewrite Brief first.':(!aiComplete?'Complete only the missing AI evidence; existing research stays intact.':'Choose/confirm the publisher-domain internal destination. No new research is needed.');
    next={key:'prewrite',control_id:'prewriteStepBtn',step:1,label:'Open Prewrite Brief',reason};
  }else if(internalCandidates<3){
    next={key:'discover_internal',control_id:'discoverInternal',step:4,label:'Discover & verify internal URLs',reason:'Internal Link Intelligence has fewer than 3 current verified same-domain URLs.'};
  }else if(externalCandidates<3){
    next={key:'suggest_external',control_id:'suggestExternal',step:4,label:'Suggest & verify external URLs',reason:'External Link Intelligence has fewer than 3 current verified source URLs.'};
  }else if(!deliveryReady||!finalReady){
    if(liveState){
      next={key:'reopen_editing',control_id:'reopenForEditing',step:9,label:'Reopen for editing',reason:'The live/reviewed placement no longer satisfies the current Ready contract. Reopen explicitly before changing it.'};
    }else{
      next={key:'refresh_all',control_id:'refreshAllContent',step:9,label:'Refresh all & verify',reason:!generationCurrent?'The current Brief snapshot changed; perform surgical repair/relock without rerunning research.':(!linkPolicyReady?'Apply the current verified 3 + 3 link set and recheck the package.':(!internalPreviewCurrent?'Rebuild the stable internal URL for the exact current HTML.':(!contentScoreReady?'Run the real ContentScore on the exact current HTML.':'Repair/recheck the remaining deterministic content requirement.')))};
    }
  }else if(status==='verified'){
    next={key:'done',control_id:null,step:10,label:'Verified live',reason:'The current HTML and live placement are verified.',done:true};
  }else if(liveState&&verification){
    if(verificationPassed){
      next={key:'manual_verify',control_id:'publishVerifyManual',step:10,label:'Verify live placement',reason:'Automated live pre-check passed. Make the final manual verification decision.'};
    }else if(verificationFetchFailed&&!copiedAfterCheck){
      next={key:'copy_after_failed_check',control_id:'copySeoHtml',step:6,label:'Copy SEO publication HTML',reason:'The last live fetch failed. Copy the exact current HTML before retrying the live check.'};
    }else if(verificationFetchFailed){
      next={key:'retry_live_precheck',control_id:'publishPrecheck',step:10,label:'Retry live pre-check',reason:'Current SEO HTML was copied after the failed live check. Publish it, then retry.'};
    }else{
      next={key:'needs_changes',control_id:'publishNeedsChanges',step:10,label:'Mark Needs changes',reason:'The live page is reachable, but at least one live verification requirement failed.'};
    }
  }else if(!copiedCurrent){
    next={key:'copy_seo_html',control_id:'copySeoHtml',step:6,label:'Copy SEO publication HTML',reason:'The package is Ready. Copy the exact current SEO HTML before publishing.'};
  }else{
    next={key:'publish_precheck',control_id:'publishPrecheck',step:10,label:'Publish & run live pre-check',reason:'Publish the copied current HTML, save/confirm the exact live URL, then run the live pre-check.'};
  }

  const blockingMissing=checks.filter(x=>x.blocking&&!x.passed).map(x=>x.key);
  return {
    engine:'network-publication-readiness-v527',authoritative:true,minimum_contentscore:minimumScore,
    placement_status:status,research_ready:researchReady,content_contract_ready:contentContractReady,
    delivery_ready:deliveryReady,final_ready:finalReady,seo_copied_current:copiedCurrent,
    internal_preview_current:internalPreviewCurrent,official_scan_current:officialScanCurrent,
    official_contentscore:officialScanCurrent?officialScore:null,live_state:liveState,
    blocking_missing:blockingMissing,checks,next_action:next,
    images:{required:false,blocking:false}
  };
}

function buildArticleSchema(row, images, settings) {
  const uploaded = (images||[]).filter(x=>x.status==='uploaded'||x.status==='approved');
  const imageUrls = uploaded.map(x=>`https://app.contentscale.site/network/media/${x.id}`);
  const author = settings.author_type==='person'
    ? {'@type':'Person',name:settings.author_name || undefined,url:settings.author_url || undefined,jobTitle:settings.author_job_title || undefined}
    : {'@type':'Organization',name:settings.author_name || row.source_brand || row.brand_name || undefined,url:settings.author_url || (row.source_domain?`https://${row.source_domain}`:undefined)};
  const base = row.schema_json && typeof row.schema_json === 'object' ? Object.assign({}, row.schema_json) : {};
  const schema = Object.assign(base, {
    '@context':'https://schema.org',
    '@type': base['@type'] || 'Article',
    headline: row.title || base.headline,
    description: row.meta_description || base.description,
    author,
    publisher: {'@type':'Organization',name: row.publisher_brand || row.publisher_domain || 'Publisher'},
    image: imageUrls.length ? imageUrls : base.image
  });
  Object.keys(schema).forEach(k=>schema[k]===undefined&&delete schema[k]);
  const faqMatch=String(row.html||'').match(/<section\b[^>]*class=["'][^"']*cs-faq[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);
  if(faqMatch){
    const inner=faqMatch[1],entities=[];
    const re=/<h3\b[^>]*>([\s\S]*?)<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi;let m;
    while((m=re.exec(inner))&&entities.length<12){const q=cleanText(htmlText(m[1]),500),a=cleanText(htmlText(m[2]),1800);if(q&&a)entities.push({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}})}
    if(entities.length){const article=Object.assign({},schema);delete article['@context'];return {'@context':'https://schema.org','@graph':[article,{'@type':'FAQPage',mainEntity:entities}]};}
  }
  return schema;
}

function networkEditionCss(settings) {
  return `.cs-network-content{--cs-primary:${settings.primary_color};--cs-accent:${settings.accent_color};max-width:840px;margin:0 auto;padding:28px 30px;background:#fff;color:#111827;border-radius:14px;font-family:inherit;font-size:inherit;line-height:1.72;overflow-wrap:anywhere}.cs-network-content p,.cs-network-content li,.cs-network-content td,.cs-network-content figcaption,.cs-network-content .cs-network-author{color:#111827}.cs-network-content *{box-sizing:border-box}.cs-network-content article{width:100%}.cs-network-content h1,.cs-network-content h2,.cs-network-content h3{color:var(--cs-primary);line-height:1.2;margin:1.45em 0 .55em}.cs-network-content h1{font-size:clamp(1.8rem,5vw,2.65rem);margin-top:.25em}.cs-network-content h2{font-size:clamp(1.35rem,3.5vw,1.85rem)}.cs-network-content h3{font-size:clamp(1.1rem,3vw,1.35rem)}.cs-network-content p,.cs-network-content li{line-height:1.72}.cs-network-content a{color:var(--cs-accent);text-decoration-thickness:.08em;text-underline-offset:.14em}.cs-network-content img{display:block;width:100%;height:auto;max-width:100%;border-radius:10px;margin:18px 0}.cs-network-content figure{margin:24px 0}.cs-network-content figcaption{font-size:.86em;opacity:.72;margin-top:7px}.cs-network-content blockquote{margin:24px 0;padding:12px 16px;border-left:4px solid var(--cs-accent);background:color-mix(in srgb,var(--cs-accent) 7%,transparent)}.cs-network-content ul,.cs-network-content ol{padding-left:1.25rem}.cs-direct-answer,.cs-tldr,.cs-callout{border:1px solid color-mix(in srgb,var(--cs-accent) 30%,transparent);background:color-mix(in srgb,var(--cs-accent) 7%,transparent);border-radius:12px;padding:18px 20px;margin:20px 0}.cs-toc{border:1px solid rgba(127,127,127,.24);border-radius:12px;padding:18px 22px;margin:22px 0}.cs-table-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:22px 0;border:1px solid rgba(127,127,127,.22);border-radius:12px}.cs-table{width:100%;min-width:640px;border-collapse:collapse;margin:0}.cs-table th,.cs-table td{padding:11px 12px;border-bottom:1px solid rgba(127,127,127,.18);text-align:left;vertical-align:top}.cs-table th{font-weight:700;color:var(--cs-primary);background:rgba(127,127,127,.06)}.cs-table tr:last-child td{border-bottom:0}.cs-network-author{margin-top:28px;padding:16px;border:1px solid color-mix(in srgb,var(--cs-primary) 20%,transparent);border-radius:12px}.cs-network-author strong{color:var(--cs-primary)}.contentscale-network-credit{margin-top:28px!important}@media(max-width:640px){.cs-network-content{max-width:100%;padding:20px 16px}.cs-network-content h1{font-size:1.9rem}.cs-network-content h2{font-size:1.42rem}.cs-network-content p,.cs-network-content li{font-size:1rem}.cs-network-author{padding:13px}.cs-direct-answer,.cs-tldr,.cs-callout,.cs-toc{padding:14px}.cs-table{min-width:560px;font-size:.92rem}}`;
}

function renderEditionHtml(row, images) {
  const settings = getPublicationSettings(row.generation_input_snapshot, {author_name:row.source_brand||row.brand_name||'',author_url:row.source_domain?`https://${row.source_domain}`:''});
  const uploaded = (images||[]).filter(x=>x.status==='uploaded'||x.status==='approved').sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.id-b.id);
  const featured = uploaded.find(x=>x.image_role==='featured');
  const supporting = uploaded.filter(x=>x.image_role!=='featured');
  const fig = x=>`<figure class="cs-network-image"><img src="https://app.contentscale.site/network/media/${Number(x.id)}?v=${encodeURIComponent(String(x.updated_at||x.byte_size||Date.now()))}" alt="${String(x.alt_text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}" loading="lazy">${x.caption?`<figcaption>${String(x.caption).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</figcaption>`:''}</figure>`;
  let body = String(row.html||'');
  if(featured) body = fig(featured) + body;
  const unmatched=[];
  for(const im of supporting){
    const hint=String(im.placement_hint||'');
    let placed=false;
    if(hint.startsWith('before-h2-num:')){
      const wanted=Number(hint.slice('before-h2-num:'.length)); let idx=0;
      body=body.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi,(m)=>{idx++;if(!placed&&idx===wanted){placed=true;return fig(im)+m}return m});
    } else if(hint.startsWith('before-h2:')){
      const target=hint.slice('before-h2:'.length).trim().toLowerCase();
      body=body.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi,(m,inner)=>{if(placed)return m;const txt=htmlText(inner).trim().toLowerCase();if(txt.startsWith(target)){placed=true;return fig(im)+m}return m});
    }
    if(!placed) unmatched.push(im);
  }
  // v429 invariant: every uploaded image must appear in the rendered article. If a saved H2 target no longer exists,
  // fall back deterministically to the first H2; if there is no H2, place after the first paragraph; otherwise append.
  for(const im of unmatched){
    const markup=fig(im);
    if(/<h2\b[^>]*>/i.test(body)){
      body=body.replace(/<h2\b[^>]*>/i,m=>markup+m);
    } else if(/<\/p>/i.test(body)){
      body=body.replace(/<\/p>/i,m=>m+markup);
    } else {
      body+=markup;
    }
  }

  if(settings.author_name) {
    body += `<aside class="cs-network-author" data-cs-author="true"><strong>About the author</strong><div>${settings.author_url?`<a href="${settings.author_url}" target="_blank" rel="noopener">${settings.author_name}</a>`:settings.author_name}${settings.author_job_title?` · ${settings.author_job_title}`:''}</div>${settings.author_bio?`<p>${settings.author_bio}</p>`:''}</aside>`;
  }
  return {settings, html:`<div class="cs-network-content" data-cs-responsive="true" dir="${localeDirection(cleanText(row.source_snapshot?.language||row.generation_input_snapshot?.language||'en-US',30))==='RTL'?'rtl':'ltr'}"><style>${networkEditionCss(settings)}
button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled{cursor:not-allowed!important;opacity:.72!important}.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style>${body}</div>`, schema:buildArticleSchema(row,uploaded,settings)};
}


function buildInternalPublicationDocument(row, images, opts={}) {
  const rendered=renderEditionHtml(row,images||[]);
  const title=cleanText(row.meta_title||row.title||'ContentScale Internal Content',180);
  const desc=cleanText(row.meta_description||'',320);
  const schema=rendered.schema&&typeof rendered.schema==='object'?rendered.schema:{};
  const lang=cleanText(row.generation_input_snapshot?.language||row.source_snapshot?.language||'en-US',30)||'en-US';
  const escAttr=v=>String(v||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const canonical=cleanText(opts.canonical_url||'',1800);
  const image=(images||[]).find(x=>(x.status==='uploaded'||x.status==='approved')&&x.image_role==='featured');
  const imageUrl=image?`https://app.contentscale.site/network/media/${Number(image.id)}`:'';
  const social=`${canonical?`<link rel="canonical" href="${escAttr(canonical)}">`:''}<meta property="og:title" content="${escAttr(title)}">${desc?`<meta property="og:description" content="${escAttr(desc)}">`:''}${canonical?`<meta property="og:url" content="${escAttr(canonical)}">`:''}${imageUrl?`<meta property="og:image" content="${escAttr(imageUrl)}">`:''}<meta property="og:type" content="article"><meta name="twitter:card" content="${imageUrl?'summary_large_image':'summary'}"><meta name="twitter:title" content="${escAttr(title)}">${desc?`<meta name="twitter:description" content="${escAttr(desc)}">`:''}${imageUrl?`<meta name="twitter:image" content="${escAttr(imageUrl)}">`:''}`;
  const doc=`<!doctype html><html lang="${escAttr(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${escAttr(title)}</title>${desc?`<meta name="description" content="${escAttr(desc)}">`:''}${social}<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\u003c')}</script></head><body>${rendered.html}</body></html>`;
  const hash=crypto.createHash('sha256').update(doc).digest('hex');
  return {document:doc,hash,rendered};
}

async function ensureReferralAdminIdText(pool) {
  if (!pool) throw new Error('Database unavailable');
  const r = await pool.query(`SELECT table_name,column_name,data_type
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name IN ('network_referral_partners','network_referral_codes')
      AND column_name='created_by_admin_id'`);
  for (const row of r.rows) {
    if (row.data_type !== 'text') {
      const table = row.table_name === 'network_referral_partners' ? 'network_referral_partners' : 'network_referral_codes';
      await pool.query(`ALTER TABLE ${table} ALTER COLUMN created_by_admin_id TYPE TEXT USING created_by_admin_id::text`);
    }
  }
}

async function ensureNetworkTables(pool) {
  if (!pool) throw new Error('Database unavailable');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [26093001]);

    await client.query(`CREATE TABLE IF NOT EXISTS network_schema_meta (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
      schema_version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`INSERT INTO network_schema_meta (singleton, schema_version)
      VALUES (TRUE, $1)
      ON CONFLICT (singleton) DO UPDATE
      SET schema_version = EXCLUDED.schema_version, updated_at = NOW()`, [NETWORK_SCHEMA_VERSION]);

    await client.query(`CREATE TABLE IF NOT EXISTS network_websites (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id BIGINT,
      domain TEXT NOT NULL,
      canonical_url TEXT,
      brand_name TEXT,
      primary_niche TEXT,
      sub_niche TEXT,
      topic_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      country TEXT,
      language TEXT,
      cms TEXT,
      ownership_type TEXT NOT NULL DEFAULT 'external' CHECK (ownership_type IN ('owned','external')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','trusted','suspended','rejected')),
      scan_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      approved_at TIMESTAMPTZ,
      suspended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_network_websites_domain_lower ON network_websites ((LOWER(domain)))`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_websites_status_niche ON network_websites(status, primary_niche)`);
    await client.query(`ALTER TABLE network_websites ADD COLUMN IF NOT EXISTS sub_niche TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_websites ADD COLUMN IF NOT EXISTS topic_tags JSONB NOT NULL DEFAULT '[]'::jsonb`).catch(()=>{});

    await client.query(`CREATE TABLE IF NOT EXISTS network_directory_businesses (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      business_name TEXT NOT NULL,
      domain TEXT,
      canonical_url TEXT,
      description TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      source_ref TEXT,
      primary_niche TEXT,
      sub_niche TEXT,
      topic_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      market TEXT,
      country TEXT,
      language TEXT,
      status TEXT NOT NULL DEFAULT 'unclaimed' CHECK (status IN ('imported','unclaimed','claim_pending','verified','rejected')),
      claim_name TEXT,
      claim_email TEXT,
      claim_message TEXT,
      claim_submitted_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      verified_by_admin_id TEXT,
      website_check JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_network_directory_domain_lower ON network_directory_businesses ((LOWER(domain))) WHERE domain IS NOT NULL AND domain<>''`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_directory_status ON network_directory_businesses(status,updated_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_directory_niche ON network_directory_businesses(primary_niche,sub_niche,status)`);


    await client.query(`CREATE TABLE IF NOT EXISTS network_content (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id BIGINT,
      owner_website_id BIGINT REFERENCES network_websites(id) ON DELETE SET NULL,
      prewrite_brief_id BIGINT,
      title TEXT NOT NULL,
      source_url TEXT,
      source_type TEXT NOT NULL DEFAULT 'existing_url' CHECK (source_type IN ('existing_url','prewrite_brief','html','text','original')),
      primary_niche TEXT,
      target_searcher TEXT,
      target_keyword TEXT,
      brand_name TEXT,
      source_html TEXT,
      source_text TEXT,
      source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      publication_status TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft','available','paused','completed','rejected')),
      distribution_status TEXT NOT NULL DEFAULT 'not_started',
      desired_placements INTEGER NOT NULL DEFAULT 1 CHECK (desired_placements > 0),
      verified_placements INTEGER NOT NULL DEFAULT 0 CHECK (verified_placements >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_content_status_niche ON network_content(publication_status, primary_niche, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_content_prewrite_ref ON network_content(prewrite_brief_id) WHERE prewrite_brief_id IS NOT NULL`);

    // Immutable Network approval snapshots. Core prewrite_briefs remains read-only to Network.
    await client.query(`CREATE TABLE IF NOT EXISTS network_prewrite_approvals (
      id BIGSERIAL PRIMARY KEY,
      prewrite_brief_id BIGINT NOT NULL,
      brief_hash TEXT NOT NULL,
      brief_snapshot JSONB NOT NULL,
      approved_contract JSONB NOT NULL DEFAULT '{}'::jsonb,
      readiness_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      approved_by_admin_id TEXT,
      approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      invalidated_at TIMESTAMPTZ,
      invalidated_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(prewrite_brief_id, brief_hash)
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_prewrite_approvals_active ON network_prewrite_approvals(prewrite_brief_id,approved_at DESC) WHERE invalidated_at IS NULL`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_placements (
      id BIGSERIAL PRIMARY KEY,
      content_id BIGINT NOT NULL REFERENCES network_content(id) ON DELETE RESTRICT,
      publisher_website_id BIGINT NOT NULL REFERENCES network_websites(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','generating','ready','submitted','verifying','needs_review','verified','rejected','cancelled')),
      reward_credits INTEGER NOT NULL DEFAULT 10 CHECK (reward_credits >= 0),
      brand_mention_required BOOLEAN NOT NULL DEFAULT TRUE,
      source_link_required BOOLEAN NOT NULL DEFAULT TRUE,
      published_url TEXT,
      accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      verification_note TEXT,
      verification_decision TEXT,
      reviewed_by_admin_id TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(content_id, publisher_website_id)
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_placements_status ON network_placements(status, created_at DESC)`);
    await client.query(`ALTER TABLE network_placements ADD COLUMN IF NOT EXISTS verification_note TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_placements ADD COLUMN IF NOT EXISTS verification_decision TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_placements ADD COLUMN IF NOT EXISTS reviewed_by_admin_id TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_placements ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`).catch(()=>{});

    await client.query(`CREATE TABLE IF NOT EXISTS network_placement_review_events (
      id BIGSERIAL PRIMARY KEY,
      placement_id BIGINT NOT NULL REFERENCES network_placements(id) ON DELETE RESTRICT,
      event_type TEXT NOT NULL CHECK (event_type IN ('submitted','resubmitted','precheck_passed','precheck_needs_review','needs_changes','rejected','verified')),
      actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('publisher','admin','system')),
      actor_ref TEXT,
      published_url TEXT,
      note TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_review_events_placement ON network_placement_review_events(placement_id,created_at DESC,id DESC)`);


    await client.query(`CREATE TABLE IF NOT EXISTS network_publication_versions (
      id BIGSERIAL PRIMARY KEY,
      placement_id BIGINT NOT NULL UNIQUE REFERENCES network_placements(id) ON DELETE RESTRICT,
      content_id BIGINT NOT NULL REFERENCES network_content(id) ON DELETE RESTRICT,
      publisher_website_id BIGINT NOT NULL REFERENCES network_websites(id) ON DELETE RESTRICT,
      version_no INTEGER NOT NULL DEFAULT 1 CHECK (version_no > 0),
      title TEXT,
      html TEXT,
      plain_text TEXT,
      meta_title TEXT,
      meta_description TEXT,
      suggested_slug TEXT,
      schema_json JSONB,
      generation_input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      generation_model TEXT,
      quality_status TEXT NOT NULL DEFAULT 'pending' CHECK (quality_status IN ('pending','passed','failed','needs_review')),
      generated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_credit_wallets (
      id BIGSERIAL PRIMARY KEY,
      website_id BIGINT NOT NULL UNIQUE REFERENCES network_websites(id) ON DELETE RESTRICT,
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (reserved <= balance)
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_credit_transactions (
      id BIGSERIAL PRIMARY KEY,
      wallet_id BIGINT NOT NULL REFERENCES network_credit_wallets(id) ON DELETE RESTRICT,
      placement_id BIGINT REFERENCES network_placements(id) ON DELETE RESTRICT,
      transaction_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      note TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_credit_transactions_wallet ON network_credit_transactions(wallet_id, created_at DESC)`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_publication_images (
      id BIGSERIAL PRIMARY KEY,
      publication_version_id BIGINT NOT NULL REFERENCES network_publication_versions(id) ON DELETE RESTRICT,
      placement_id BIGINT NOT NULL REFERENCES network_placements(id) ON DELETE RESTRICT,
      image_role TEXT NOT NULL DEFAULT 'supporting' CHECK (image_role IN ('featured','supporting')),
      image_name TEXT NOT NULL,
      prompt TEXT,
      alt_text TEXT,
      caption TEXT,
      suggested_filename TEXT,
      placement_hint TEXT,
      mime_type TEXT,
      original_filename TEXT,
      image_data BYTEA,
      byte_size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'prompt_ready' CHECK (status IN ('prompt_ready','uploaded','approved')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_publication_images_version ON network_publication_images(publication_version_id, sort_order, id)`);

    await client.query(`CREATE TABLE IF NOT EXISTS public.network_image_library (
      id BIGSERIAL PRIMARY KEY,
      normalized_key TEXT NOT NULL UNIQUE,
      image_name TEXT NOT NULL,
      suggested_filename TEXT,
      alt_text TEXT,
      caption TEXT,
      prompt TEXT,
      source_image_id BIGINT REFERENCES network_publication_images(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_image_library_filename ON public.network_image_library(LOWER(suggested_filename))`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_referral_partners (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      label TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','blocked')),
      notes TEXT,
      created_by_admin_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_referral_partners_status ON network_referral_partners(status,created_at DESC)`);
    await client.query(`ALTER TABLE network_referral_partners ADD COLUMN IF NOT EXISTS access_token TEXT`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_network_referral_partners_access_token ON network_referral_partners(access_token) WHERE access_token IS NOT NULL`);
    // Admin IDs in the existing ContentScale auth layer are opaque session/admin references, not guaranteed numeric.
    // Keep Network audit refs as TEXT so values such as ADMIN-... never hit a BIGINT cast.
    await client.query(`ALTER TABLE network_referral_partners ALTER COLUMN created_by_admin_id TYPE TEXT USING created_by_admin_id::text`);
    await client.query(`ALTER TABLE network_referral_partners DROP CONSTRAINT IF EXISTS network_referral_partners_status_check`);
    await client.query(`ALTER TABLE network_referral_partners ADD CONSTRAINT network_referral_partners_status_check CHECK (status IN ('active','paused','blocked','revoked'))`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_referral_codes (
      id BIGSERIAL PRIMARY KEY,
      website_id BIGINT REFERENCES network_websites(id) ON DELETE RESTRICT,
      partner_id BIGINT REFERENCES network_referral_partners(id) ON DELETE RESTRICT,
      code TEXT NOT NULL UNIQUE,
      label TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_admin_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_referral_codes_website ON network_referral_codes(website_id,is_active)`);

    await client.query(`ALTER TABLE network_referral_codes ADD COLUMN IF NOT EXISTS partner_id BIGINT`);
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_network_referral_codes_partner') THEN
        ALTER TABLE network_referral_codes ADD CONSTRAINT fk_network_referral_codes_partner FOREIGN KEY (partner_id) REFERENCES network_referral_partners(id) ON DELETE RESTRICT;
      END IF;
    END $$`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_referral_codes_partner ON network_referral_codes(partner_id,is_active)`);
    await client.query(`ALTER TABLE network_referral_codes ALTER COLUMN created_by_admin_id TYPE TEXT USING created_by_admin_id::text`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_referrals (
      id BIGSERIAL PRIMARY KEY,
      referral_code_id BIGINT NOT NULL REFERENCES network_referral_codes(id) ON DELETE RESTRICT,
      referred_member_ref TEXT,
      status TEXT NOT NULL DEFAULT 'clicked' CHECK (status IN ('clicked','registered','activated','rewarded','rejected')),
      reward_credits INTEGER NOT NULL DEFAULT 10 CHECK (reward_credits >= 0),
      activated_at TIMESTAMPTZ,
      rewarded_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_referrals_code_status ON network_referrals(referral_code_id,status,created_at DESC)`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_publisher_applications (
      id BIGSERIAL PRIMARY KEY,
      domain TEXT NOT NULL,
      brand_name TEXT,
      contact_name TEXT,
      email TEXT NOT NULL,
      niche TEXT,
      niche_main TEXT,
      niche_sub TEXT,
      niche_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
      niche_confidence TEXT,
      market TEXT,
      language TEXT,
      message TEXT,
      referral_code TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','activated')),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_publisher_applications_status ON network_publisher_applications(status,created_at DESC)`);
    // v448: legacy installations may already have these tables from an older
    // Network build. CREATE TABLE IF NOT EXISTS does not add newer columns,
    // so explicitly self-heal every column used by the current apply flow.
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS brand_name TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS contact_name TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS email TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS niche TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS niche_main TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS niche_sub TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS niche_topics JSONB NOT NULL DEFAULT '[]'::jsonb`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS niche_confidence TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS market TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS language TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS message TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS referral_code TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`).catch(()=>{});


    await client.query(`CREATE TABLE IF NOT EXISTS network_publisher_accounts (
      id BIGSERIAL PRIMARY KEY,
      application_id BIGINT UNIQUE REFERENCES network_publisher_applications(id) ON DELETE SET NULL,
      website_id BIGINT UNIQUE REFERENCES network_websites(id) ON DELETE RESTRICT,
      email TEXT NOT NULL,
      contact_name TEXT,
      access_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','revoked')),
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_publisher_accounts_email ON network_publisher_accounts(LOWER(email),status)`);
    await client.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS application_id BIGINT REFERENCES network_publisher_applications(id) ON DELETE SET NULL`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS website_id BIGINT REFERENCES network_websites(id) ON DELETE RESTRICT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS email TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS contact_name TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS access_token TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`).catch(()=>{});
    // v450 legacy repair: a publisher account is deliberately created before a website is approved/linked.
    // Older Network schemas may still require website_id/application_id. Remove those obsolete NOT NULL constraints.
    await client.query(`ALTER TABLE network_publisher_accounts ALTER COLUMN website_id DROP NOT NULL`).catch(()=>{});
    await client.query(`ALTER TABLE network_publisher_accounts ALTER COLUMN application_id DROP NOT NULL`).catch(()=>{});
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_network_publisher_accounts_application_id ON network_publisher_accounts(application_id) WHERE application_id IS NOT NULL`).catch(()=>{});
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_network_publisher_accounts_access_token ON network_publisher_accounts(access_token) WHERE access_token IS NOT NULL`).catch(()=>{});


    await client.query(`CREATE TABLE IF NOT EXISTS network_ads (
      id BIGSERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      contact_email TEXT,
      headline TEXT NOT NULL,
      description TEXT,
      target_url TEXT NOT NULL,
      logo_url TEXT,
      niche TEXT,
      locale TEXT NOT NULL DEFAULT 'en-US',
      placement TEXT NOT NULL DEFAULT 'homepage' CHECK (placement IN ('homepage','homepage_featured','niche')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','rejected','expired')),
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      impressions BIGINT NOT NULL DEFAULT 0,
      clicks BIGINT NOT NULL DEFAULT 0,
      owner_email_status TEXT,
      owner_email_error TEXT,
      owner_email_sent_at TIMESTAMPTZ,
      created_by_admin_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`ALTER TABLE network_ads ADD COLUMN IF NOT EXISTS owner_email_status TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_ads ADD COLUMN IF NOT EXISTS owner_email_error TEXT`).catch(()=>{});
    await client.query(`ALTER TABLE network_ads ADD COLUMN IF NOT EXISTS owner_email_sent_at TIMESTAMPTZ`).catch(()=>{});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_network_ads_public ON network_ads(status,placement,starts_at,ends_at,created_at DESC)`);

    await client.query(`CREATE TABLE IF NOT EXISTS network_verification_runs (
      id BIGSERIAL PRIMARY KEY,
      placement_id BIGINT NOT NULL REFERENCES network_placements(id) ON DELETE RESTRICT,
      run_no INTEGER NOT NULL DEFAULT 1 CHECK (run_no > 0),
      http_status INTEGER,
      indexable BOOLEAN,
      canonical_ok BOOLEAN,
      brand_mention_ok BOOLEAN,
      source_link_ok BOOLEAN,
      content_match_ok BOOLEAN,
      password_protected BOOLEAN,
      result_status TEXT NOT NULL DEFAULT 'pending' CHECK (result_status IN ('pending','passed','failed','needs_review')),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(placement_id, run_no)
    )`);

    await client.query('COMMIT');
    return { success: true, schema_version: NETWORK_SCHEMA_VERSION, tables: NETWORK_TABLES.slice() };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}


async function ensureNetworkDirectorySchema(pool) {
  if(!pool) throw new Error('DB unavailable');
  await pool.query(`CREATE TABLE IF NOT EXISTS network_directory_businesses (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    business_name TEXT NOT NULL,
    domain TEXT,
    canonical_url TEXT,
    description TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    source_ref TEXT,
    primary_niche TEXT,
    sub_niche TEXT,
    topic_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    market TEXT,
    country TEXT,
    language TEXT,
    status TEXT NOT NULL DEFAULT 'unclaimed' CHECK (status IN ('imported','unclaimed','claim_pending','verified','rejected')),
    claim_name TEXT,
    claim_email TEXT,
    claim_message TEXT,
    claim_submitted_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    verified_by_admin_id TEXT,
    website_check JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // Self-heal later additions too, not only first install.
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS description TEXT`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS source_ref TEXT`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS primary_niche TEXT`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS sub_niche TEXT`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS topic_tags JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS market TEXT`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS country TEXT`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS language TEXT`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS claim_name TEXT`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS claim_email TEXT`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS claim_message TEXT`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS claim_submitted_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS verified_by_admin_id TEXT`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS website_check JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE network_directory_businesses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_network_directory_domain_lower ON network_directory_businesses ((LOWER(domain))) WHERE domain IS NOT NULL AND domain<>''`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_network_directory_status ON network_directory_businesses(status,updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_network_directory_niche ON network_directory_businesses(primary_niche,sub_niche,status)`);
  await pool.query(`INSERT INTO network_schema_meta (singleton,schema_version,updated_at)
    VALUES (TRUE,$1,NOW())
    ON CONFLICT (singleton) DO UPDATE SET schema_version=GREATEST(network_schema_meta.schema_version,EXCLUDED.schema_version),updated_at=NOW()`,
    [NETWORK_SCHEMA_VERSION]).catch(()=>{});
}

async function ensureNetworkImageLibrary(pool) {
  if (!pool) throw new Error('DB unavailable');
  await pool.query(`CREATE TABLE IF NOT EXISTS public.network_image_library (
    id BIGSERIAL PRIMARY KEY,
    normalized_key TEXT NOT NULL UNIQUE,
    image_name TEXT NOT NULL,
    suggested_filename TEXT,
    alt_text TEXT,
    caption TEXT,
    prompt TEXT,
    source_image_id BIGINT REFERENCES public.network_publication_images(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_network_image_library_filename ON public.network_image_library(LOWER(suggested_filename))`);
}

async function inspectNetworkSchema(pool) {
  if (!pool) return { db_connected: false, schema_ready: false, missing_tables: NETWORK_TABLES.slice() };
  const names = ['network_schema_meta', ...NETWORK_TABLES];
  const r = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])`, [names]);
  const found = new Set(r.rows.map(x => x.tablename));
  const missing = NETWORK_TABLES.filter(t => !found.has(t));
  let schemaVersion = null;
  if (found.has('network_schema_meta')) {
    try {
      const v = await pool.query('SELECT schema_version FROM network_schema_meta WHERE singleton=TRUE LIMIT 1');
      if (v.rows[0]) schemaVersion = v.rows[0].schema_version;
    } catch (_) {}
  }
  return {
    db_connected: true,
    schema_ready: missing.length === 0 && schemaVersion === NETWORK_SCHEMA_VERSION,
    schema_version: schemaVersion,
    expected_schema_version: NETWORK_SCHEMA_VERSION,
    missing_tables: missing
  };
}

function websitesPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Network Websites | ContentScale</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1220px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.crumb{font-size:13px;color:#91a1c2}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.field label{display:block;font-size:11px;color:#96a6c7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.field input,.field select{width:100%;background:#091327;color:#eef4ff;border:1px solid #31456f;border-radius:10px;padding:11px}.span2{grid-column:span 2}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:10px 13px;border-radius:10px;cursor:pointer;font-weight:700}.btn.secondary{background:#101b31}.btn.good{background:#14532d;border-color:#22c55e}.btn.bad{background:#5f1e28;border-color:#ef4444}.btn:disabled{opacity:.5;cursor:not-allowed}.note{color:#9aabd0;line-height:1.5}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #3b4f77;background:#142039}.status.approved,.status.trusted{border-color:#2b8f55;color:#8ff0b2}.status.rejected,.status.suspended{border-color:#a23b49;color:#ff9ca8}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:980px}th,td{text-align:left;padding:11px;border-bottom:1px solid #223150;vertical-align:top}th{font-size:11px;color:#8fa2c5;text-transform:uppercase;letter-spacing:.07em}.tiny{font-size:12px;color:#91a1c2}.actions{display:flex;gap:6px;flex-wrap:wrap}.scan.pass{color:#75e6a0}.scan.review{color:#ffd27a}.scan.fail{color:#ff8c98}.auth{padding:14px;border:1px solid #704b1d;background:#2a1b0b;border-radius:12px;color:#ffd89a;margin-top:16px}@media(max-width:900px){.grid{grid-template-columns:1fr 1fr}.span2{grid-column:span 2}}@media(max-width:560px){.grid{grid-template-columns:1fr}.span2{grid-column:span 1}}

button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><main>
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Websites</div><h1>Publisher Websites</h1><div class="note">This is stage 2 of Publisher onboarding. Do not enter the same publisher again: approving a Publisher Application automatically creates or links this Network Website. This page is where Admin checks and approves that same website.</div></div><a class="btn secondary" href="/network/admin">← Network admin</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><h2>Manual website add</h2><p class="note">Use this only when there is no Publisher Application. For normal onboarding, approve the application first and the website appears here automatically.</p><div class="grid">
<div class="field span2"><label>Domain / URL</label><input id="domain" placeholder="example.com"></div>
<div class="field"><label>Brand</label><input id="brand" placeholder="Brand name"></div>
<div class="field"><label>Ownership</label><select id="ownership"><option value="external">External publisher</option><option value="owned">Owned by ContentScale</option></select></div>
<div class="field"><label>Main niche</label><input id="niche" placeholder="Beauty & Wellness"></div>
<div class="field"><label>Subniche</label><input id="subniche" placeholder="Hair salon"></div>
<div class="field"><label>Country</label><input id="country" placeholder="Netherlands"></div>
<div class="field"><label>Language</label><input id="language" placeholder="nl"></div>
<div class="field"><label>CMS</label><input id="cms" placeholder="WordPress"></div>
</div><div style="margin-top:14px"><button id="addBtn" class="btn">Add website</button> <span id="formMsg" class="tiny"></span></div></section>
<section class="card"><div class="top"><h2>Websites</h2><button class="btn secondary" id="refreshBtn">Refresh</button></div><div class="tableWrap"><table><thead><tr><th>Website</th><th>Niche</th><th>Market</th><th>Status</th><th>Last check</th><th>Actions</th></tr></thead><tbody id="rows"><tr><td colspan="6" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||''; const auth=document.getElementById('auth');
 if(!key){auth.style.display='block';}
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 function scanLabel(x){const s=x&&x.scan_snapshot||{};if(!s.checked_at)return '<span class="tiny">Not checked</span>';const c=s.outcome==='passed'?'pass':s.outcome==='needs_review'?'review':'fail';return '<div class="scan '+c+'"><strong>'+esc(s.outcome||'checked')+'</strong></div><div class="tiny">HTTP '+esc(s.http_status||'—')+' · '+esc(s.word_count||0)+' words<br>'+esc(s.checked_at||'')+'</div>'}
 async function load(){const b=document.getElementById('rows');try{const d=await api('/api/network/admin/websites');const a=d.websites||[];if(!a.length){b.innerHTML='<tr><td colspan="6" class="tiny">No websites yet.</td></tr>';return;}b.innerHTML=a.map(x=>'<tr><td><strong>'+esc(x.brand_name||x.domain)+'</strong><div class="tiny"><a target="_blank" rel="noopener" href="'+esc(x.canonical_url||('https://'+x.domain))+'">'+esc(x.domain)+'</a><br>'+esc(x.ownership_type)+'</div></td><td>'+esc(x.primary_niche||'—')+'<div class="tiny">'+esc(x.sub_niche||'')+'</div></td><td>'+esc(x.country||'—')+'<div class="tiny">'+esc(x.language||'')+'</div></td><td><span class="status '+esc(x.status)+'">'+esc(x.status)+'</span></td><td>'+scanLabel(x)+'</td><td><div class="actions"><button class="btn secondary" data-action="check" data-id="'+x.id+'">Hard interest → check site</button><button class="btn good" data-action="status" data-status="approved" data-id="'+x.id+'">Approve</button><button class="btn bad" data-action="status" data-status="rejected" data-id="'+x.id+'">Reject</button></div></td></tr>').join('')}catch(e){b.innerHTML='<tr><td colspan="6" class="tiny">'+esc(e.message)+'</td></tr>'}}
 window.siteCheck=async(id)=>{if(!confirm('Confirm HARD publication interest for this publisher/site? The Network will now spend resources checking the site before any Publisher Edition is written.'))return;try{const d=await api('/api/network/admin/websites/'+id+'/check',{method:'POST',body:JSON.stringify({hard_interest_confirmed:true})});alert('Site check: '+d.check.outcome+'\\nHTTP '+d.check.http_status+'\\nIndexable: '+d.check.indexable+'\\nWords: '+d.check.word_count);load()}catch(e){alert(e.message)}};
 window.setStatus=async(id,status)=>{try{await api('/api/network/admin/websites/'+id+'/status',{method:'PATCH',body:JSON.stringify({status})});load()}catch(e){alert(e.message)}};
 document.getElementById('rows').addEventListener('click',function(ev){const btn=ev.target.closest('button[data-action]');if(!btn)return;const id=Number(btn.dataset.id||0);if(!id)return;if(btn.dataset.action==='check')return window.siteCheck(id);if(btn.dataset.action==='status')return window.setStatus(id,btn.dataset.status||'');});
 document.getElementById('addBtn').onclick=async()=>{const m=document.getElementById('formMsg');m.textContent='Saving…';try{const d=await api('/api/network/admin/websites',{method:'POST',body:JSON.stringify({domain:document.getElementById('domain').value,brand_name:document.getElementById('brand').value,country:document.getElementById('country').value,language:document.getElementById('language').value,cms:document.getElementById('cms').value,ownership_type:document.getElementById('ownership').value})});m.textContent='Saved: '+d.website.domain;document.getElementById('domain').value='';load()}catch(e){m.textContent=e.message}};
document.getElementById('refreshBtn').onclick=load; if(key)load();
})();
</script></main></body></html>`;
}


function opportunitiesPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Network Opportunities | ContentScale</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1240px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.crumb{font-size:13px;color:#91a1c2}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.field label{display:block;font-size:11px;color:#96a6c7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.field input,.field select,.field textarea,select{width:100%;background:#091327;color:#eef4ff;border:1px solid #31456f;border-radius:10px;padding:11px;font:inherit}.field textarea{min-height:96px;resize:vertical}.span2{grid-column:span 2}.span4{grid-column:span 4}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:10px 13px;border-radius:10px;cursor:pointer;font-weight:700}.btn.secondary{background:#101b31}.btn.good{background:#14532d;border-color:#22c55e}.btn.bad{background:#5f1e28;border-color:#ef4444}.btn:disabled{opacity:.65;cursor:wait}.btn.busy{position:relative;padding-left:34px}.btn.busy:before{content:'';position:absolute;left:12px;top:50%;width:12px;height:12px;margin-top:-7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:csSpin .7s linear infinite}@keyframes csSpin{to{transform:rotate(360deg)}}.note{color:#9aabd0;line-height:1.5}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #3b4f77;background:#142039}.status.available{border-color:#2b8f55;color:#8ff0b2}.status.full{border-color:#d49b2b;color:#ffd98a;background:#2a210f}.status.paused,.status.rejected{border-color:#a23b49;color:#ff9ca8}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1060px}th,td{text-align:left;padding:11px;border-bottom:1px solid #223150;vertical-align:top}th{font-size:11px;color:#8fa2c5;text-transform:uppercase;letter-spacing:.07em}.tiny{font-size:12px;color:#91a1c2}.actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.actions select{min-width:220px;width:auto}.auth{padding:14px;border:1px solid #704b1d;background:#2a1b0b;border-radius:12px;color:#ffd89a;margin-top:16px}.bulk{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}.pitch{max-width:430px;line-height:1.45}.check{width:18px;height:18px;accent-color:#2563eb}@media(max-width:900px){.grid{grid-template-columns:1fr 1fr}.span4{grid-column:span 2}}@media(max-width:560px){.grid{grid-template-columns:1fr}.span2,.span4{grid-column:span 1}}

button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><main>
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Opportunities</div><h1>Distribution Opportunities</h1><div class="note">Source website = brand/content owner. Publisher website = chosen later after hard interest. Prewrite Brief = research intelligence used by Distribution or Standalone Content.</div></div><div class="actions"><a class="btn" href="/network/content-studio">Create standalone content</a><a class="btn secondary" href="/network/admin">← Network admin</a></div></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><h2>Create opportunity</h2><div class="grid">
<div class="field span2"><label>H1 / working title</label><input id="title" placeholder="e.g. 7 Emergency Roof Repair Mistakes NJ Homeowners Should Avoid"></div>
<div class="field"><label>Brand</label><input id="brand" placeholder="Perfect Roofing Team"></div>
<div class="field"><label>Source website / content owner</label><select id="ownerWebsite"><option value="">Optional</option></select><div class="tiny" style="margin-top:6px">This is who the content belongs to. Publisher selection happens later after hard interest.</div></div>
<div class="field"><label>Prewrite Brief</label><select id="prewriteBrief"><option value="">Optional — choose existing brief</option></select><div class="tiny" id="prewriteHint" style="margin-top:6px">Selected brief becomes read-only generation evidence with a proof hash.</div></div>
<div class="field span2"><label>Admin-only Google verification notes</label><textarea id="googleManual" placeholder="AI Overview present? Local/Maps pack? Dominant intent? Top-result angles? Content gaps? Facts/URLs manually verified?"></textarea><div class="tiny" style="margin-top:6px">Admin research only. Publisher does not fill this in.</div></div>
<div class="field"><label>Main niche</label><input id="niche" readonly placeholder="Auto-detected"><div class="tiny" style="margin-top:6px">Auto-classified from source website + title + pitch + Prewrite.</div></div>
<div class="field"><label>Subniche</label><input id="subniche" readonly placeholder="Auto-detected"></div>
<div class="field"><label>Country / market</label><input id="country" placeholder="United States"></div>
<div class="field"><label>Language / locale</label><input id="language" placeholder="Dutch, Nederlands, English, en-US…"><div class="tiny" style="margin-top:6px">Type a language name or locale code. ContentScale normalizes it automatically.</div></div>
<div class="field"><label>Max placements</label><select id="placements"><option value="1" selected>1 publisher</option><option value="2">2 publishers</option><option value="3">3 publishers</option><option value="4">4 publishers</option><option value="5">5 publishers</option></select><div class="tiny" style="margin-top:6px">Maximum 5. Each placement gets its own unique Publisher Edition.</div></div>
<div class="field span4"><label>Short publisher pitch</label><textarea id="pitch" placeholder="2–4 sentences explaining what the publication will cover and why it is useful for this niche. Do not write the full article yet."></textarea></div>
</div><div style="margin-top:14px"><button id="addBtn" class="btn">Create opportunity</button> <span id="formMsg" class="tiny"></span></div></section>
<section class="card"><div class="top"><h2>Opportunities</h2><button class="btn secondary" id="refreshBtn">Refresh</button></div>
<div class="bulk"><input type="checkbox" class="check" id="selectAll"><label for="selectAll" class="tiny">Select all</label><button class="btn bad" id="deleteSelected" disabled>Delete selected</button><span class="tiny" id="selectedCount">0 selected</span></div>
<div class="tableWrap"><table><thead><tr><th></th><th>Opportunity</th><th>Niche</th><th>Market</th><th>Status</th><th>Interest</th><th>Actions</th></tr></thead><tbody id="rows"><tr><td colspan="7" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');if(!key)auth.style.display='block';
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.oldText=btn.textContent;btn.disabled=true;btn.classList.add('busy');if(label)btn.textContent=label;}else{btn.disabled=false;btn.classList.remove('busy');if(btn.dataset.oldText)btn.textContent=btn.dataset.oldText;delete btn.dataset.oldText;}}
 let websites=[],briefs=[];
 async function loadWebsites(){const d=await api('/api/network/admin/websites');websites=d.websites||[];const owner=document.getElementById('ownerWebsite');owner.innerHTML='<option value="">Optional</option>'+websites.map(w=>'<option value="'+w.id+'">'+esc(w.brand_name||w.domain)+' — '+esc(w.domain)+'</option>').join('');try{const pb=await api('/api/network/admin/prewrite-briefs');briefs=pb.briefs||[];const pe=document.getElementById('prewriteBrief');if(pe)pe.innerHTML='<option value="">Optional — choose existing brief</option>'+briefs.map(x=>'<option value="'+x.id+'">#'+x.id+' · '+esc(x.keyword||x.working_title||'Brief')+' · '+esc(x.language||'')+'</option>').join('')}catch(e){}}
 function approvedOptions(){return websites.filter(w=>(w.status==='approved'||w.status==='trusted')&&w.scan_snapshot&&w.scan_snapshot.technical_pass===true).map(w=>'<option value="'+w.id+'">'+esc(w.brand_name||w.domain)+' — '+esc(w.domain)+'</option>').join('')}
 function localClassify(){const site=websites.find(w=>String(w.id)===document.getElementById('ownerWebsite').value),brief=briefs.find(b=>String(b.id)===document.getElementById('prewriteBrief').value),txt=((site&&(site.primary_niche+' '+(site.sub_niche||'')))||'')+' '+document.getElementById('title').value+' '+document.getElementById('pitch').value+' '+((brief&&(brief.keyword+' '+(brief.working_title||'')))||''),q=txt.toLowerCase();let main='',sub='';if(/roof|shingle|roofer/.test(q)){main='Home Services';sub='Roofing'}else if(/seo|search engine|ai overview|organic search/.test(q)){main='Marketing';sub='SEO'}else if(/account|bookkeep|tax|cpa/.test(q)){main='Finance & Business Services';sub='Accounting'}else if(/law|attorney|legal/.test(q)){main='Legal';sub='Legal Services'}else if(/software|saas/.test(q)){main='Technology';sub='Software & SaaS'}document.getElementById('niche').value=(site&&site.primary_niche)||main||'Auto on save';document.getElementById('subniche').value=(site&&site.sub_niche)||sub||'Auto on save'}
 function updateBulk(){const boxes=Array.from(document.querySelectorAll('.rowSelect'));const checked=boxes.filter(x=>x.checked);document.getElementById('selectedCount').textContent=checked.length+' selected';document.getElementById('deleteSelected').disabled=!checked.length;document.getElementById('selectAll').checked=boxes.length>0&&checked.length===boxes.length}
 async function load(){const b=document.getElementById('rows');try{await loadWebsites();const d=await api('/api/network/admin/opportunities');const a=d.opportunities||[];if(!a.length){b.innerHTML='<tr><td colspan="7" class="tiny">No opportunities yet. Create the first H1 + pitch above.</td></tr>';updateBulk();return;}const opts=approvedOptions();b.innerHTML=a.map(x=>{const max=Math.max(1,Math.min(5,Number(x.desired_placements)||1)),used=Number(x.interest_count||0),full=used>=max,status=full?'full':(x.publication_status||'available');return '<tr><td><input class="check rowSelect" type="checkbox" value="'+x.id+'"></td><td><strong>'+esc(x.title)+'</strong><div class="pitch tiny">'+esc(x.pitch||'')+'</div><div class="tiny">'+esc(x.brand_name||'')+(x.prewrite_brief_id?' · Prewrite #'+esc(x.prewrite_brief_id):' · No Prewrite')+'</div></td><td>'+esc(x.primary_niche||'—')+'<div class="tiny">'+esc(x.sub_niche||'')+'</div></td><td>'+esc(x.country||'—')+'<div class="tiny">'+esc(x.language||'')+'</div></td><td><span class="status '+esc(status)+'">'+esc(status)+'</span><div class="tiny">'+used+' / '+max+' placements</div></td><td><strong>'+used+'</strong><div class="tiny">publisher commitments</div></td><td><div class="actions"><select data-site-for="'+x.id+'" '+(full?'disabled':'')+'><option value="">'+(full?'Placement limit reached':'Choose PUBLISHER website')+'</option>'+(full?'':opts)+'</select><button class="btn good" data-action="interest" data-id="'+x.id+'" '+(full?'disabled':'')+'>'+(full?'Full — '+used+'/'+max:'Hard interest')+'</button><button class="btn bad" data-action="delete" data-id="'+x.id+'">Delete</button></div></td></tr>'}).join('');updateBulk()}catch(e){b.innerHTML='<tr><td colspan="7" class="tiny">'+esc(e.message)+'</td></tr>'}}
 ['ownerWebsite','prewriteBrief','title','pitch'].forEach(id=>document.getElementById(id).addEventListener(id==='title'||id==='pitch'?'input':'change',localClassify));document.getElementById('prewriteBrief').addEventListener('change',function(){const x=briefs.find(b=>String(b.id)===this.value),h=document.getElementById('prewriteHint');if(!x){h.textContent='Selected brief becomes read-only generation evidence with a proof hash.';return}h.innerHTML='<a target="_blank" href="/network/prewrite/'+encodeURIComponent(x.id)+'">View Prewrite #'+esc(x.id)+' evidence ↗</a> · '+esc(x.keyword||x.working_title||'')});
 document.getElementById('rows').addEventListener('change',e=>{if(e.target.classList.contains('rowSelect'))updateBulk()});
 document.getElementById('selectAll').onchange=function(){document.querySelectorAll('.rowSelect').forEach(x=>x.checked=this.checked);updateBulk()};
 async function removeIds(ids,btn){if(!ids.length)return;if(!confirm('Delete '+ids.length+' selected opportunity'+(ids.length===1?'':'ies')+'? This is only allowed while no placement/publication is attached.'))return;busy(btn,true,'Deleting…');try{const d=await api('/api/network/admin/opportunities/delete',{method:'POST',body:JSON.stringify({ids})});btn.textContent='✓ Deleted '+d.deleted;await load()}catch(e){alert(e.message)}finally{busy(btn,false)}}
 document.getElementById('deleteSelected').onclick=function(){const ids=Array.from(document.querySelectorAll('.rowSelect:checked')).map(x=>Number(x.value)).filter(Boolean);removeIds(ids,this)};
 document.getElementById('rows').addEventListener('click',async function(ev){const btn=ev.target.closest('button[data-action]');if(!btn)return;const id=Number(btn.dataset.id||0);if(!id)return;if(btn.dataset.action==='delete')return removeIds([id],btn);if(btn.dataset.action==='interest'){const sel=document.querySelector('select[data-site-for="'+id+'"]');const websiteId=Number(sel&&sel.value||0);if(!websiteId){alert('Choose an approved website first.');return;}if(!confirm('Confirm HARD publication interest for the selected approved website? No article has been written yet.'))return;busy(btn,true,'Confirming…');try{await api('/api/network/admin/opportunities/'+id+'/interest',{method:'POST',body:JSON.stringify({publisher_website_id:websiteId,hard_interest_confirmed:true})});btn.textContent='✓ Committed';alert('Hard interest recorded. Placement created. Final publication must use SEO-indexable HTML on the publisher site and will be monitored after publication.');await load()}catch(e){alert(e.message)}finally{busy(btn,false)}}});
 document.getElementById('addBtn').onclick=async function(){const btn=this,m=document.getElementById('formMsg');busy(btn,true,'Creating…');m.textContent='Creating H1 + pitch…';try{await api('/api/network/admin/opportunities',{method:'POST',body:JSON.stringify({title:document.getElementById('title').value,pitch:document.getElementById('pitch').value,brand_name:document.getElementById('brand').value,owner_website_id:Number(document.getElementById('ownerWebsite').value||0)||null,primary_niche:document.getElementById('niche').value,sub_niche:document.getElementById('subniche').value,country:document.getElementById('country').value,language:document.getElementById('language').value,desired_placements:Number(document.getElementById('placements').value||1),prewrite_brief_id:Number((document.getElementById('prewriteBrief')||{}).value||0)||null,google_manual_notes:(document.getElementById('googleManual')||{}).value||''})});m.textContent='✓ Opportunity created — no full article written.';document.getElementById('title').value='';document.getElementById('pitch').value='';btn.textContent='✓ Created';await load()}catch(e){m.textContent=e.message}finally{busy(btn,false)}};
 document.getElementById('refreshBtn').onclick=async function(){busy(this,true,'Refreshing…');try{await load()}finally{busy(this,false)}};if(key)load();
})();
</script></main></body></html>`;
}



function contentStudioPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Standalone Content Studio | ContentScale</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui}main{max-width:1180px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field label{display:block;font-size:11px;color:#96a6c7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.field input,.field select,.field textarea{width:100%;background:#091327;color:#eef4ff;border:1px solid #31456f;border-radius:10px;padding:11px;font:inherit}.field textarea{min-height:96px}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:10px 13px;border-radius:10px;cursor:pointer;font-weight:700;text-decoration:none}.btn.secondary{background:#101b31}.tiny{font-size:12px;color:#91a1c2}.preview{background:#fff;color:#111;border-radius:12px;padding:20px;max-height:720px;overflow:auto}.score{font-size:2rem;font-weight:900}.parts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.part{border:1px solid #31456f;border-radius:10px;padding:10px}.ok{color:#86efac}.warn{color:#fde68a}.bad{color:#fca5a5}@media(max-width:760px){.grid,.parts{grid-template-columns:1fr}}</style></head><body><main>
<div class="top"><div><div class="tiny"><a href="/network/opportunities">Distribution Opportunities</a> / Standalone Content Studio</div><h1>Standalone Content Studio</h1><div class="tiny">Create content for your own site or a client with Prewrite Brief intelligence, without creating a Network placement.</div></div><a class="btn secondary" href="/network/admin">← Network admin</a></div>
<section class="card"><h2>Create standalone content</h2><div class="grid"><div class="field"><label>Prewrite Brief</label><select id="brief"><option value="">Choose a brief</option></select></div><div class="field"><label>Source website / owner</label><select id="site"><option value="">Optional</option></select></div><div class="field"><label>Working H1 / title</label><input id="title"></div><div class="field"><label>Brand</label><input id="brand"></div><div class="field"><label>Market</label><input id="market" placeholder="US, United States, NL, Netherlands…"></div><div class="field"><label>Language</label><input id="language" placeholder="English, en-US, Dutch, Nederlands…"></div><div class="field" style="grid-column:1/-1"><label>Admin notes / manual Google verification</label><textarea id="notes" placeholder="Optional verified Admin evidence only."></textarea></div></div><div style="margin-top:14px"><button class="btn" id="generate">Approve Brief &amp; Generate standalone article</button> <span id="msg" class="tiny"></span></div></section>
<section class="card"><div class="top"><h2>Generated standalone content</h2><button class="btn secondary" id="refresh">Refresh</button></div><div id="items" class="tiny">Loading…</div></section>
<script>(function(){const key=localStorage.getItem('admin_id')||'',api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt),t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(!r.ok)throw Error(d.error||('Request failed '+r.status));return d},esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));async function init(){const [b,w]=await Promise.all([api('/api/network/admin/prewrite-briefs'),api('/api/network/admin/websites')]);const brief=document.getElementById('brief');brief.innerHTML='<option value="">Choose a brief</option>'+(b.briefs||[]).map(x=>'<option value="'+x.id+'">#'+x.id+' · '+esc(x.keyword||x.working_title||'Brief')+'</option>').join('');document.getElementById('site').innerHTML='<option value="">Optional</option>'+(w.websites||[]).map(x=>'<option value="'+x.id+'">'+esc(x.brand_name||x.domain)+' — '+esc(x.domain)+'</option>').join('');brief.onchange=()=>{const x=(b.briefs||[]).find(v=>String(v.id)===brief.value);if(!x)return;document.getElementById('title').value=x.working_title||x.keyword||'';document.getElementById('language').value=x.language||'';document.getElementById('market').value=x.region||''};await load()}async function load(){const d=await api('/api/network/admin/standalone-content'),a=d.items||[];document.getElementById('items').innerHTML=a.length?a.map(x=>'<div class="card" style="margin-top:10px"><div class="top"><div><strong>'+esc(x.title)+'</strong><div class="tiny">'+esc(x.brand_name||'')+' · '+esc(x.primary_niche||'')+' · '+(x.prewrite_brief_id?('Prewrite #'+x.prewrite_brief_id):'No Prewrite')+'</div></div><div class="score '+(Number(x.content_score||0)>=85?'ok':Number(x.content_score||0)>=65?'warn':'bad')+'">'+esc(x.content_score||0)+'/100</div></div><div class="tiny">Prewrite proof: '+esc(x.prewrite_hash||'—')+'</div><div style="margin-top:10px">'+(x.prewrite_brief_id?'<a class="btn secondary" target="_blank" href="/network/prewrite/'+encodeURIComponent(x.prewrite_brief_id)+'">View brief evidence</a> ':'')+'<button class="btn" data-copy="'+x.id+'">Copy HTML</button></div><details style="margin-top:10px"><summary>ContentScore breakdown</summary><div class="parts" style="margin-top:8px">'+Object.values(x.score_parts||{}).map(p=>'<div class="part"><strong>'+esc(p.label)+'</strong><div>'+esc(p.score)+' / '+esc(p.max)+'</div><div class="tiny">'+esc(p.detail||'')+'</div></div>').join('')+'</div></details><details style="margin-top:10px"><summary>Preview</summary><div class="preview" style="margin-top:8px">'+(x.source_html||'')+'</div></details></div>').join(''):'No standalone content yet.';document.querySelectorAll('[data-copy]').forEach(btn=>btn.onclick=async()=>{const x=a.find(v=>String(v.id)===btn.dataset.copy);if(!x)return;await navigator.clipboard.writeText(x.source_html||'');btn.textContent='✓ Copied';setTimeout(()=>btn.textContent='Copy HTML',1200)})}document.getElementById('generate').onclick=async function(){const b=this,m=document.getElementById('msg'),briefId=Number(document.getElementById('brief').value||0)||0;if(!briefId){m.textContent='✕ Choose and review a Prewrite Brief first.';return}b.disabled=true;b.textContent='Approving Brief snapshot…';m.textContent='Locking the exact reviewed Brief before article generation…';try{const a=await api('/api/network/admin/prewrite-briefs/'+briefId+'/approve-for-writing',{method:'POST',body:'{}'});b.textContent='Generating from approved Brief…';m.textContent='✓ Brief approved · now generating from the immutable snapshot…';const d=await api('/api/network/admin/standalone-content/generate',{method:'POST',body:JSON.stringify({prewrite_brief_id:briefId,approval_id:Number(a.approval&&a.approval.id||0),owner_website_id:Number(document.getElementById('site').value||0)||null,title:document.getElementById('title').value,brand_name:document.getElementById('brand').value,country:document.getElementById('market').value,language:document.getElementById('language').value,google_manual_notes:document.getElementById('notes').value})});m.textContent='✓ Approved + generated · '+d.content_score+'/100 · Prewrite proof '+(d.prewrite_hash||'none');await load()}catch(e){m.textContent='✕ '+e.message}finally{b.disabled=false;b.textContent='Approve Brief & Generate standalone article'}};document.getElementById('refresh').onclick=load;if(key)init().catch(e=>document.getElementById('items').textContent=e.message);else location.href='/admin?next='+encodeURIComponent('/network/content-studio')})();</script></main></body></html>`;
}

function prewriteEvidencePage(id) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prewrite Evidence | ContentScale</title><style>:root{color-scheme:dark}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui}main{max-width:1100px;margin:auto;padding:30px 20px}a{color:#8dd9ff}.card{background:#0f1930;border:1px solid #26375c;border-radius:16px;padding:18px;margin-top:16px}.meta{white-space:pre-wrap;overflow:auto;background:#091327;border:1px solid #31456f;border-radius:10px;padding:14px;max-height:70vh}.tiny{color:#91a1c2;font-size:12px}</style></head><body><main><a href="/network/opportunities">← Back</a><h1>Prewrite Brief Evidence</h1><div id="root" class="card">Loading…</div><script>(async()=>{const key=localStorage.getItem('admin_id')||'',r=await fetch('/api/network/admin/prewrite-briefs/${Number(id)||0}',{headers:{'x-admin-key':key}}),d=await r.json(),root=document.getElementById('root');if(!r.ok){root.textContent=d.error||'Unable to load';return}const b=d.brief;root.innerHTML='<h2>#'+b.id+' · '+(b.keyword||b.working_title||'Prewrite Brief')+'</h2><div class="tiny">Created '+(b.created_at||'—')+' · Language '+(b.language||'—')+' · Region '+(b.region||'—')+' · Competitors '+(b.competitors_scraped||0)+'</div><p><strong>SHA-256 proof hash:</strong> '+d.hash+'</p><div class="meta">'+String(JSON.stringify(b.brief_json||{},null,2)).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</div>'})().catch(e=>document.getElementById('root').textContent=e.message)</script></main></body></html>`;
}


function publishingPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Network Publishing | ContentScale</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1260px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.crumb{font-size:13px;color:#91a1c2}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.notice{border:1px solid #315c88;background:#0b2238;border-radius:14px;padding:15px;color:#cdeaff;line-height:1.5}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:9px 12px;border-radius:10px;cursor:pointer;font-weight:700}.btn.secondary{background:#101b31}.btn.good{background:#14532d;border-color:#22c55e}.btn:disabled{opacity:.65;cursor:wait}.btn.busy:before{content:'';display:inline-block;width:12px;height:12px;margin-right:7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #3b4f77;background:#142039}.status.ready,.status.verified{border-color:#2b8f55;color:#8ff0b2}.status.generating{border-color:#a87b20;color:#ffd785}.pill{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #4d6790;background:#111e34}.pill.protected{border-color:#b47d24;color:#ffd791;background:#2b1d08}.tiny{font-size:12px;color:#91a1c2}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1080px}th,td{text-align:left;padding:11px;border-bottom:1px solid #223150;vertical-align:top}th{font-size:11px;color:#8fa2c5;text-transform:uppercase;letter-spacing:.07em}.actions{display:flex;gap:7px;flex-wrap:wrap}.auth{padding:14px;border:1px solid #704b1d;background:#2a1b0b;border-radius:12px;color:#ffd89a;margin-top:16px}

button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><main>
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Publishing</div><h1>Publisher Editions</h1><div class="tiny">A Publisher Edition is generated only after hard interest and an approved target website.</div></div><a class="btn secondary" href="/network/admin">← Network admin</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><div class="notice"><strong>SEO-indexable publication required.</strong><br>ContentScale creates one unique Publisher Edition per placement. Final publication must exist as real HTML in the publisher page source with required attribution and ongoing verification. JavaScript-only embeds are preview/legacy only and do not qualify.</div></section>
<section class="card"><div class="top"><div><h2>Publishing queue</h2><div class="tiny">During testing, unverified queue items can be deleted. Verified/rewarded placements remain protected history.</div></div><button class="btn secondary" id="refreshBtn">Refresh</button></div><div class="tableWrap"><table><thead><tr><th>Opportunity</th><th>Publisher</th><th>Protection</th><th>Status</th><th>Edition</th><th>Action</th></tr></thead><tbody id="rows"><tr><td colspan="6" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');if(!key)auth.style.display='block';
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.old=btn.textContent;btn.disabled=true;btn.classList.add('busy');btn.textContent=label||'Working…'}else{btn.disabled=false;btn.classList.remove('busy');if(btn.dataset.old)btn.textContent=btn.dataset.old}}
 async function load(){const b=document.getElementById('rows');try{const d=await api('/api/network/admin/publishing');const a=d.items||[];if(!a.length){b.innerHTML='<tr><td colspan="6" class="tiny">No publisher commitments ready for publishing yet.</td></tr>';return;}b.innerHTML=a.map(x=>'<tr><td><strong>'+esc(x.title)+'</strong><div class="tiny">'+esc(x.pitch||'')+'</div><div class="tiny">Brand: '+esc(x.brand_name||'—')+'</div></td><td><strong>'+esc(x.publisher_brand||x.publisher_domain)+'</strong><div class="tiny">'+esc(x.publisher_domain)+' · '+esc(x.publisher_status)+'</div></td><td><span class="pill protected">'+esc(x.protection_mode)+'</span><div class="tiny">SEO-indexable HTML + required attribution</div></td><td><span class="status '+esc(x.status)+'">'+esc(x.status)+'</span></td><td>'+(x.publication_version_id?'<strong>'+esc(x.edition_title||'Publisher Edition')+'</strong><div class="tiny">Generated '+esc(x.generated_at||'')+'<br>'+esc(x.quality_status||'')+'</div>':'<span class="tiny">Not generated yet</span>')+'</td><td><div class="actions">'+(x.status==='accepted'?'<span class="tiny" style="color:#fcd34d">Review the Prewrite Brief, then use <b>Approve Brief &amp; Generate</b> there.</span>':'')+(x.publication_version_id?'<a class="btn secondary" href="/network/publishing/'+x.id+'">Open package</a>':'')+(x.status==='ready'&&x.delivery_available?'<button class="btn" data-action="copy" data-id="'+x.id+'">Copy preview snippet</button>':'')+(x.status==='generating'?'<button class="btn busy" disabled>Generating…</button>':'')+(['accepted','generating','ready'].includes(x.status)?'<button class="btn secondary" data-action="delete" data-id="'+x.id+'">Delete from queue</button>':'')+'</div></td></tr>').join('')}catch(e){b.innerHTML='<tr><td colspan="6" class="tiny">'+esc(e.message)+'</td></tr>'}}
 document.getElementById('rows').addEventListener('click',async function(ev){const btn=ev.target.closest('button[data-action]');if(!btn)return;const id=Number(btn.dataset.id||0);if(!id)return;if(btn.dataset.action==='generate'){alert('Generation starts only from the reviewed Prewrite Brief via Approve Brief & Generate.');return}else if(btn.dataset.action==='copy'){busy(btn,true,'Preparing preview…');try{const d=await api('/api/network/admin/placements/'+id+'/delivery');await navigator.clipboard.writeText(d.snippet);btn.textContent='✓ Copied';setTimeout(()=>{btn.textContent='Copy preview snippet'},1600)}catch(e){alert(e.message)}finally{btn.disabled=false;btn.classList.remove('busy')}}else if(btn.dataset.action==='delete'){if(!confirm('Delete this test item from the Publishing queue?\\n\\nThis removes the unverified placement, Publisher Edition, images and pre-publication review data.\\n\\nVerified/rewarded placements cannot be deleted.'))return;busy(btn,true,'Deleting…');try{await api('/api/network/admin/placements/'+id+'/delete-from-publishing',{method:'POST',body:JSON.stringify({confirm:true})});btn.textContent='✓ Deleted';setTimeout(load,350)}catch(e){btn.textContent='✕ Delete failed';alert(e.message);setTimeout(()=>{btn.disabled=false;btn.classList.remove('busy');btn.textContent='Delete from queue'},1200)}}});
 document.getElementById('refreshBtn').onclick=load;if(key)load();
})();
</script></main></body></html>`;
}

function publishingDetailPage(placementId) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Publisher Edition Package | ContentScale</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1180px;margin:auto;padding:28px 18px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:18px;margin-top:16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.field label{display:block;font-size:11px;color:#96a6c7;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px}.field input,.field select,.field textarea{width:100%;background:#091327;color:#eef4ff;border:1px solid #31456f;border-radius:10px;padding:10px;font:inherit}.field textarea{min-height:88px;resize:vertical}.btn{border:1px solid #3b4a63;background:#111827;color:#dbe4f0;padding:9px 12px;border-radius:10px;cursor:pointer;font-weight:700;text-decoration:none;display:inline-flex;align-items:center}.btn.secondary{background:#101b31}.btn.good{background:#14532d;border-color:#22c55e}.btn.bad{background:#5f1e28;border-color:#ef4444}.btn:disabled{opacity:.6;cursor:not-allowed}.btn.locked:disabled,.dummyAction.locked:disabled{cursor:default;opacity:.82}.btn.completedAction,.dummyAction.completedAction{background:#14532d!important;border-color:#22c55e!important;color:#dcfce7!important;cursor:default!important;opacity:.94!important}.btn.nextAction,.dummyAction.nextAction{background:#1d4ed8!important;border-color:#60a5fa!important;color:#fff!important;box-shadow:0 0 0 3px rgba(59,130,246,.18)}.btn.nextAction:disabled,.dummyAction.nextAction:disabled{opacity:1!important;cursor:pointer!important}.btn.busy:before{content:'';display:inline-block;width:12px;height:12px;margin-right:7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.tiny{font-size:12px;color:#91a1c2}.dummyFlow{display:grid;grid-template-columns:repeat(10,minmax(145px,1fr));gap:8px;overflow-x:auto;overflow-y:hidden;padding-bottom:6px;scroll-behavior:smooth}.dummyStep{min-width:145px;border:1px solid #31456f;background:#0a1528;border-radius:12px;padding:11px;cursor:pointer}.dummyStep:focus{outline:2px solid #60a5fa;outline-offset:2px}.dummyStep b{display:block;margin-bottom:4px}.dummyAction{display:inline-flex;margin-top:9px;border:1px solid #3b82f6;background:#0b2a52;color:#dbeafe;padding:7px 9px;border-radius:8px;text-decoration:none;font-size:11px;font-weight:800}.dummyAction:hover{filter:brightness(1.1)}.dummyAction.locked{border-color:#475569;background:#111827;color:#94a3b8;pointer-events:none}.dummyHint{display:block;margin-top:6px;font-size:10px;color:#94a3b8}.workflowCard{position:relative}.workflowCard::before{content:"STEP " attr(data-stage);position:absolute;top:12px;right:14px;font-size:10px;font-weight:900;letter-spacing:.08em;color:#64748b}.workflowCard.flowDone{border-color:#166534;box-shadow:0 0 0 1px rgba(34,197,94,.12)}.workflowCard.flowActive{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.28)}.workflowCard.flowWait{opacity:.82}.workflowCard.flowDone::before{color:#86efac}.workflowCard.flowActive::before{color:#93c5fd}.dummyStep.done{border-color:#166534;background:#092219}.dummyStep.active{border:2px solid #3b82f6;background:#0b1b35;box-shadow:0 0 0 3px rgba(59,130,246,.12)}.dummyStep.wait{opacity:.7}.officialScore{font-size:48px;font-weight:950}.scanStale{color:#fde68a}.scanFresh{color:#86efac}.score{font-size:42px;font-weight:900}.ok{color:#8ff0b2}.warn{color:#ffd785}.badText{color:#ff9ca8}.imgrow{border:1px solid #273a61;border-radius:12px;padding:12px;margin-top:10px}.actions{display:flex;gap:8px;flex-wrap:wrap}.preview{position:relative;background:white;color:#111;border-radius:12px;padding:18px;max-height:640px;overflow:auto;user-select:none;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none}.preview img{-webkit-user-drag:none;user-drag:none;pointer-events:none}.preview::before{content:'Protected ContentScale Preview';position:sticky;top:0;display:block;width:max-content;margin:0 0 12px auto;padding:5px 9px;border-radius:999px;background:rgba(8,16,31,.88);color:#fff;font:700 11px/1.2 Inter,system-ui,sans-serif;letter-spacing:.04em;z-index:3}.preview .cs-h2-guide{display:flex;align-items:center;gap:9px;margin:24px 0 5px;color:#64748b;font:600 10px/1.2 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}.preview .cs-h2-guide:after{content:"";height:1px;flex:1;background:rgba(100,116,139,.22)}.metaBox{padding:10px;border:1px solid #2d426c;border-radius:10px;background:#091327;overflow-wrap:anywhere}.aiCheckPrompt{min-height:320px!important;font:12px/1.45 Consolas,monospace!important}.aiCheckAnswer{min-height:220px!important}.aiCheckStatus{margin-top:10px;padding:10px;border:1px solid #31456f;border-radius:10px;background:#091327}.aiCheckStatus.ok{border-color:#166534;color:#bbf7d0}.aiCheckStatus.warn{border-color:#92400e;color:#fde68a}.swatch{width:48px;height:38px;padding:3px!important}.placed-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px}.placed-image{position:relative;border:1px solid #273a61;border-radius:12px;padding:10px;background:#0a1427}.placed-image.dragging{opacity:.58}.drag-handle{display:flex;align-items:center;justify-content:center;gap:7px;margin:8px 0 2px;padding:8px 10px;border:1px dashed #4b67a0;border-radius:8px;background:#101b31;color:#dce8ff;font:700 12px/1.2 Inter,system-ui,sans-serif;cursor:grab;user-select:none}.drag-handle:active{cursor:grabbing}.drag-handle.selected{border-color:#8b5cf6;background:rgba(124,58,237,.18)}.cs-image-drop-zone{display:flex;align-items:center;justify-content:center;min-height:46px;margin:10px 0;border:2px dashed rgba(124,58,237,.38);border-radius:9px;background:rgba(124,58,237,.06);color:#6d5bb8;font:700 11px/1.2 Inter,system-ui,sans-serif;letter-spacing:.03em;transition:.15s}.cs-image-drop-zone.drag-over{border-color:#7c3aed;background:rgba(124,58,237,.15);color:#4c1d95}.cs-image-drop-zone:before{content:'Drop image here';}.cs-image-drop-zone[data-drop-kind="featured"]:before{content:'Drop image here — Featured / before article';}.cs-image-drop-zone[data-drop-h2]:before{content:'Drop image here — before H2 #' attr(data-drop-h2);}.placed-image img{display:block;width:100%;height:150px;object-fit:cover;border-radius:9px;border:1px solid #35507a}.image-x{position:absolute;right:16px;top:16px;width:30px;height:30px;border-radius:50%;border:1px solid #ef4444;background:rgba(95,30,40,.95);color:#fff;font-size:18px;line-height:26px;font-weight:900;cursor:pointer;z-index:2}.placed-meta{margin-top:9px}.placed-meta strong{display:block;overflow-wrap:anywhere}.placed-actions{display:flex;gap:8px;align-items:end;margin-top:9px}.placed-actions .field{flex:1}.placed-actions select{width:100%;background:#091327;color:#eef4ff;border:1px solid #31456f;border-radius:10px;padding:8px;font:inherit}@media(max-width:760px){.grid,.grid3{grid-template-columns:1fr}.score{font-size:34px}main{padding:20px 12px 50px}.prewriteWorkspace.split{grid-template-columns:1fr!important}.prewriteWorkspace.split #prewriteEmbedFrame{min-height:52vh}.prewriteWorkspace.split #prewriteAiPane{min-height:auto}}.prewriteTabs{display:flex;gap:7px;flex-wrap:wrap}.prewriteTabs .btn.active{background:#1d4ed8;border-color:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,.15)}.prewriteWorkspace{flex:1;min-height:0;display:grid;grid-template-columns:1fr;gap:10px;padding:10px;background:#07101d;overflow:hidden}.prewriteWorkspace.split{grid-template-columns:minmax(0,1.25fr) minmax(380px,.75fr)}#prewriteEmbedFrame{border:0;width:100%;height:100%;min-height:0;background:#0a0a0f;border-radius:10px}#prewriteAiPane{display:none;overflow:auto;background:#08101f;border:1px solid #273a61;border-radius:10px;padding:10px}#prewriteAiPane #aiAnswerCheckCard{margin-top:0}
button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled{cursor:not-allowed!important;opacity:.72!important}.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}.btn.busy::after{animation:none!important}}
</style></head><body>
<div id="prewriteEmbedOverlay" style="display:none;position:fixed;inset:0;background:rgba(2,6,23,.88);z-index:20000;padding:18px;"><div style="height:100%;max-width:1440px;margin:auto;background:#0b1220;border:1px solid #334155;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid #24324a;flex-wrap:wrap"><div><strong>Prewrite Brief + AI Answer Check</strong><div class="tiny">Same linked keyword + live AI evidence. Prewrite automatically discovers/imports the sitemap for internal links and researches exact verified external source URLs.</div></div><div class="prewriteTabs"><button class="btn secondary" id="viewPrewriteOnly" type="button">Prewrite Brief</button><button class="btn secondary" id="viewAiCheckOnly" type="button">AI Answer Check</button><button class="btn" id="viewPrewriteSplit" type="button">Split view</button><button class="btn secondary" id="closePrewriteEmbed" type="button">Close</button></div></div><div class="prewriteWorkspace split" id="prewriteWorkspace"><iframe id="prewriteEmbedFrame" title="Tracker Prewrite Brief"></iframe><div id="prewriteAiPane"></div></div></div></div>
<main>
<div class="top"><div><div class="tiny"><a href="/network">Network</a> / <a href="/network/publishing">Publishing</a> / Package</div><h1>Publisher Edition Package</h1></div><a class="btn secondary" href="/network/publishing">← Publishing</a></div>
<div id="auth" class="card" style="display:none">Open <a href="/admin">/admin</a> and log in first.</div><section class="card"><h2 style="margin-top:0">For dummies · follow this order</h2><div class="tiny" style="margin-bottom:10px">Blue = your next action. Green = completed. You should not have to remember the workflow yourself.</div><div class="dummyFlow"><div class="dummyStep" data-flow="1"><b>1 · Prewrite Brief</b><span class="tiny">SEO intelligence + AIO Spy: intent, competitors, entities, PAA/PAQ, sources, internal/external links and all 5 AI systems.</span><button class="dummyAction" id="prewriteStepBtn" type="button">Open Prewrite Brief</button><span class="dummyHint" id="prewriteStepHint">Create or reopen the real Tracker Prewrite here.</span></div><div class="dummyStep" data-flow="2"><b>2 · Content Requirements</b><span class="tiny">Review words, H2s, PAA/PAQ/PPS, stats, quotes and additions.</span></div><div class="dummyStep" data-flow="3"><b>3 · Generate article</b><span class="tiny">Generate/regenerate the full article from the linked Brief.</span></div><div class="dummyStep" data-flow="4"><b>4 · SEO Package</b><span class="tiny">Check meta, schema, links, structure and evidence.</span></div><div class="dummyStep" data-flow="5"><b>5 · Author + images</b><span class="tiny">Finish author, styling and every image.</span></div><div class="dummyStep" data-flow="6"><b>6 · Delivery package</b><span class="tiny">Prepare the exact SEO HTML / client delivery package.</span></div><div class="dummyStep" data-flow="7"><b>7 · Internal live URL</b><span class="tiny">Render the finished delivery package on a real noindex URL.</span></div><div class="dummyStep" data-flow="8"><b>8 · Real ContentScore</b><span class="tiny">Scan that internal live URL with the real ContentScale scanner.</span></div><div class="dummyStep" data-flow="9"><b>9 · Ready</b><span class="tiny">Only now is the final package verified and ready.</span></div><div class="dummyStep" data-flow="10"><b>10 · Publish & verify live</b><span class="tiny">Publish the real HTML, save the exact live URL, run the pre-check and make the final manual decision.</span></div></div><div id="nextDummy" class="tiny" style="margin-top:12px;color:#bfdbfe">Loading next action…</div></section>
<section class="card"><div class="grid"><div><div class="tiny">Publisher</div><strong id="publisher">—</strong><div class="tiny" id="source">—</div></div><div><div class="tiny">Publication</div><strong id="title">—</strong><div class="tiny" id="status">—</div></div></div></section>
<section class="card workflowCard" data-stage="1"><div class="top"><div><h2>1 · Prewrite Brief evidence</h2><div class="tiny">Proof of the exact research brief used at generation time. <strong>SEO Intelligence + AIO Spy.</strong></div></div><a class="btn secondary" id="viewPrewrite" target="_blank" style="display:none">View full brief</a></div><div id="prewriteEvidence" class="metaBox" style="margin-top:12px">Loading…</div></section>
<section class="card workflowCard" data-stage="1" id="aiAnswerCheckCard"><div class="top"><div><h2 style="margin-bottom:4px">AIO Spy · AI answer check</h2><div class="tiny">Uses the exact linked Prewrite keyword automatically. Same query for every AI system. Captures the real answer + exact source URLs and syncs the evidence back to the Prewrite.</div></div><span class="status" id="aiCheckKeywordStatus">Waiting for Prewrite keyword…</span></div>
<div class="grid" style="margin-top:12px"><div class="field"><label>Exact Prewrite keyword / question</label><input id="aiCheckKeyword" readonly placeholder="Linked Prewrite keyword appears automatically"></div><div class="field"><label>AI system</label><select id="aiCheckEngine"><option value="google_aio">Google AIO / Gemini</option><option value="chatgpt">ChatGPT Search</option><option value="perplexity">Perplexity</option><option value="claude">Claude</option><option value="copilot">Microsoft Copilot</option></select></div></div>
<div class="field" style="margin-top:12px"><label>Prompt — keyword inserted automatically</label><textarea id="aiCheckPrompt" class="aiCheckPrompt" readonly></textarea></div>
<div class="actions" style="margin-top:10px"><button class="btn" id="copyAiCheckPrompt" type="button">Copy prompt</button></div>
<div class="field" style="margin-top:14px"><label>Paste the complete AI answer here</label><textarea id="aiCheckAnswer" class="aiCheckAnswer" placeholder="Paste the complete answer from the selected AI system, including all source URLs"></textarea></div>
<div class="actions" style="margin-top:10px"><button class="btn" id="analyseAiCheck" type="button">Analyse answer</button><button class="btn secondary" id="clearAiCheck" type="button">Clear this AI answer</button></div>
<div id="aiCheckStatus" class="aiCheckStatus">No answer analysed yet.</div></section>
<section class="card workflowCard" data-stage="2" id="contentRequirementsCard"><div class="top"><div><h2>2 · Content Requirements</h2><div class="tiny">Requirements detected from the linked Prewrite Brief. Review them before generating/regenerating the article.</div></div><a class="btn secondary" id="openRequirementsBrief" target="_blank" style="display:none">Open full Prewrite</a></div><div id="contentRequirements" class="metaBox" style="margin-top:12px">Loading…</div></section>
<section class="card workflowCard" data-stage="3"><div class="top"><div><h2 style="margin-bottom:4px">3 · Generate article / Article preview</h2><div class="tiny">Protected preview — text selection, copying, context menu and dragging are disabled. This deters casual copying but cannot prevent screenshots or developer-tool extraction.</div></div><button class="btn" id="regenerateArticle" type="button">Regenerate article</button></div><div id="publisherGenerationError" class="metaBox badText" style="display:none;margin-top:10px"></div><div id="preview" class="preview" tabindex="0" aria-label="Protected publication preview">Loading…</div></section>
<section class="card workflowCard" data-stage="4" id="seoPackageCard"><h2>4 · SEO Package</h2><div class="grid"><div><div class="tiny">Meta title</div><div class="metaBox" id="metaTitle">—</div></div><div><div class="tiny">Meta description</div><div class="metaBox" id="metaDesc">—</div></div><div><div class="tiny">Suggested slug</div><div class="metaBox" id="slug">—</div></div><div><div class="tiny">Schema</div><div class="metaBox">Article JSON-LD is generated automatically from the edition, author and uploaded images.</div></div></div><div style="margin-top:12px"><div class="tiny">Expected article URL</div><div class="metaBox" id="expectedArticleUrl">—</div><div class="tiny" style="margin-top:5px">Built from the approved publisher domain + current slug. Step 10 uses this automatically; change it there only if the publisher publishes on another same-domain URL.</div></div></section>
<section class="card workflowCard" data-stage="4" id="linkIntelligenceCard"><div class="top"><div><h2>Link intelligence</h2><div class="tiny">One policy for the finished article: 3 verified internal URLs + 3 verified external URLs. URLs may change; only the current verified candidate set counts.</div></div><div class="actions"><button class="btn secondary" id="discoverInternal" type="button">Discover & verify internal URLs</button><button class="btn secondary" id="suggestExternal" type="button">Suggest & verify external URLs</button></div></div><div class="grid" style="margin-top:12px"><div><div class="tiny">Internal URLs · 3 required</div><div id="internalLinks" class="metaBox">Loading…</div></div><div><div class="tiny">External URLs · 3 required</div><div id="externalLinks" class="metaBox">Loading…</div></div></div><div class="tiny" style="margin-top:8px">ContentScale discovers internal pages sitemap-first, then same-domain crawl fallback. External URLs are normalized and live-verified. If any URL changes or disappears, it stops counting until replaced and Refresh all & verify updates the article.</div><div id="linkPolicyStatus" class="metaBox" style="margin-top:10px">Loading link policy…</div><div class="grid" style="margin-top:12px;padding-top:12px;border-top:1px solid #294163"><div><div class="tiny" style="color:#a5f3fc;font-weight:800">Manual internal fallback</div><div class="field"><label>Exact publisher-domain URL</label><input id="manualInternalUrl" placeholder="https://publisher.com/relevant-page"></div><div class="field"><label>Anchor text (optional)</label><input id="manualInternalAnchor" placeholder="Natural anchor text"></div><div class="actions" style="margin-top:8px"><button class="btn secondary" id="saveManualInternal" type="button">Add verified internal URL</button></div><div id="manualInternalStatus" class="tiny" style="margin-top:6px">Use only when automatic discovery cannot reach 3 relevant pages.</div></div><div><div class="tiny" style="color:#a5f3fc;font-weight:800">Manual external fallback</div><div class="field"><label>Exact external source URL</label><input id="manualExternalUrl" placeholder="https://authoritative-source.com/exact-page"></div><div class="actions" style="margin-top:8px"><button class="btn secondary" id="saveManualExternal" type="button">Add & verify external URL</button></div><div id="manualExternalStatus" class="tiny" style="margin-top:6px">The URL is live-checked before it enters the candidate set.</div></div></div></section>
<section class="card workflowCard" data-stage="4"><div class="top"><div><h2>Publication Standard</h2><div class="tiny">Required for final SEO delivery: 1200+ useful words, Direct Answer, TL;DR, linked TOC, at least 5 H2 sections and at least one mobile-friendly table.</div></div></div><div id="publicationStandard" class="metaBox" style="margin-top:12px">Loading…</div></section>
<section class="card workflowCard" data-stage="4"><div class="top"><div><h2>Approved Brief Fidelity</h2><div class="tiny">The approved Prewrite Brief is a content contract. Planned sections, PAA/FAQ, entities, evidence links, limitations and use cases may not silently disappear during generation.</div></div><button class="btn" id="repairBriefFidelity" type="button" disabled>Repair missing content requirements</button></div><div id="briefFidelity" class="metaBox" style="margin-top:12px">Loading…</div><div id="repairBriefFidelityStatus" class="tiny" style="margin-top:8px">Repair reuses the immutable Approved Brief and current article, including Publication Standard checks. It does not rerun SERP, competitor, PAA or evidence research.</div></section>
<section class="card workflowCard" data-stage="5"><h2>5 · Author & styling</h2><div class="grid3"><div class="field"><label>Author type</label><select id="authorType"><option value="company">Company</option><option value="person">Person</option><option value="publisher">Publisher</option></select></div><div class="field"><label>Author name</label><input id="authorName"></div><div class="field"><label>Job title (person only)</label><input id="authorJob"></div><div class="field"><label>Author URL</label><input id="authorUrl"></div><div class="field"><label>Primary color — headings</label><div style="display:flex;gap:8px;align-items:center"><input class="swatch" type="color" id="primary"><input id="primaryHex" maxlength="7" placeholder="#111827" style="max-width:110px"></div></div><div class="field"><label>Accent color — links & callouts</label><div style="display:flex;gap:8px;align-items:center"><input class="swatch" type="color" id="accent"><input id="accentHex" maxlength="7" placeholder="#2563eb" style="max-width:110px"></div></div><div class="field" style="grid-column:1/-1"><label>Short author bio</label><textarea id="authorBio"></textarea></div></div><div class="tiny" style="margin-top:10px">Primary changes article headings. Accent changes links, quote/callout borders and other highlights. Both are scoped only to the ContentScale block.</div><div class="actions" style="margin-top:12px"><button class="btn" id="saveSettings">Save author & colors</button></div><div class="tiny" style="margin-top:8px">Responsive CSS is scoped to the ContentScale block. It does not style the publisher's whole website.</div></section>
<section class="card workflowCard" data-stage="5"><div class="top"><div><h2>Images · optional</h2><div class="tiny">Images never block article repair, internal live URL, ContentScore or final delivery. One active generated-image draft at a time. Choose the exact H2; subject, prompt, alt, caption and filename stay synchronized with that placement. Once uploaded, the image becomes fixed visual content and moves to Placed images below.</div></div></div><h3 style="margin:8px 0 10px">A. Generate a new image <span class="tiny" style="font-weight:400">· H2-driven workflow v498</span></h3><div class="grid3"><div class="field"><label>Image subject — automatic from placement</label><div id="imageSubjectDisplay" class="metaBox" style="min-height:42px;display:flex;align-items:center">Choose Featured or an H2</div><div class="tiny" style="margin-top:5px">Featured uses the article title. Supporting uses the exact selected H2. Generated-image mode has no manual image-name field.</div></div><div class="field"><label>Role</label><select id="imageRole"><option value="featured">Featured</option><option value="supporting">Supporting</option></select></div><div class="field"><label>Place before H2 #</label><select id="imageH2Number"><option value="">Choose H2</option></select><div class="tiny" style="margin-top:5px">Choose an H2 for a section-specific supporting image. H2 numbers are shown as light guides in the protected preview.</div></div><div style="display:flex;align-items:end"><button class="btn" type="button" id="prepareImage">Generate prompt & metadata</button></div></div><div id="imageActionStatus" class="tiny" style="margin-top:8px"></div><div id="images"></div><div style="height:1px;background:#2a4065;margin:22px 0"></div><h3 style="margin:0 0 8px">B. Use an existing image from your computer</h3><div class="tiny" style="margin-bottom:12px">Choose the file first. ContentScale checks the image library by filename/name. If this image name was used before, saved alt text, caption and SEO filename are filled in automatically. You can always edit them.</div><form id="existingImageForm"><div class="grid3"><div class="field"><label>Choose existing image</label><input id="existingFile" name="image" type="file" accept="image/jpeg,image/png,image/webp" required><div id="existingLookupStatus" class="tiny" style="margin-top:5px"></div></div><div class="field"><label>Image name / subject</label><input id="existingName" name="image_name" placeholder="high-wind-shingle-damage" required></div><div class="field"><label>Image placement</label><select id="existingPlacement" name="placement"><option value="featured">Featured — before article</option></select></div></div><div class="grid" style="margin-top:10px"><div class="field"><label>Alt text</label><textarea id="existingAlt" name="alt_text" placeholder="Describe what is actually visible in the image" required></textarea></div><div class="field"><label>Caption</label><textarea id="existingCaption" name="caption" placeholder="Short useful caption" required></textarea></div></div><div class="grid" style="margin-top:10px"><div class="field"><label>SEO filename</label><input id="existingFilename" name="suggested_filename" placeholder="high-wind-shingle-damage.jpg" required></div><div style="display:flex;align-items:end"><button class="btn" id="uploadExisting" type="submit">Add existing image</button></div></div></form><div style="height:1px;background:#2a4065;margin:22px 0"></div><div class="top"><div><h3 style="margin:0">Placed images</h3><div class="tiny">These images are already attached to the article. Use “↕ Drag image into article” and drop it on a placement line in the preview. You can also click the drag handle and then click a placement line. Click × to remove an image from this article. Its SEO metadata stays in the image library so it can be reused later.</div></div><button type="button" class="btn secondary" id="showPlacedImages">Show all placed images</button></div><div id="placedImages" class="placed-grid"></div></section>
<section class="card workflowCard" data-stage="6"><div class="top"><div><h2>6 · Delivery package</h2><div class="tiny">Final delivery is SEO-indexable HTML. JavaScript-only embeds are not accepted as final Network placements.</div></div><button class="btn" id="copySeoHtml">Copy SEO publication HTML</button><button class="btn secondary" id="copySnippet">Copy preview embed (not final SEO)</button></div></section>
<section class="card workflowCard" data-stage="7"><div class="top"><div><h2>7 · Internal live URL</h2><div class="tiny">Render the exact finished delivery package on a real noindex URL before ContentScore is allowed.</div></div></div><div id="internalUrlBox" class="metaBox" style="margin-top:12px">No internal live URL yet.</div><div class="actions" style="margin-top:12px"><button class="btn" id="createInternalUrl">Create / refresh internal live URL</button><a class="btn secondary" id="openInternalUrl" target="_blank" style="display:none">Open live internal URL</a></div></section>
<section class="card workflowCard" data-stage="8"><div class="top"><div><h2>8 · Real ContentScore</h2><div class="tiny">Scan the exact internal live URL with the canonical ContentScale scanner. A stale scan never counts as complete.</div></div><div class="officialScore" id="officialScore">—</div></div><div class="actions" style="margin-top:12px"><button class="btn" id="runOfficialScan" disabled>Run real ContentScore scan</button></div><div class="tiny" id="officialScanStatus" style="margin-top:10px">No ContentScore exists yet. First create the internal live URL; then run the canonical /api/scan scanner.</div><div id="officialRecommendations" class="metaBox" style="display:none;margin-top:10px"></div></section>
<section class="card workflowCard" data-stage="9"><div class="top"><div><h2>9 · Ready</h2><div class="tiny">Final state only when the real ContentScore is current for the exact current HTML.</div></div><span class="status" id="readyStatus">Waiting</span></div><div id="readyDetail" class="metaBox" style="margin-top:12px">Complete the previous steps first.</div></section><section class="card" id="refreshAllCard"><div class="top"><div><h2>Refresh all · verify current content</h2><div class="tiny">One owner-controlled check: re-read the current Brief, verify 5/5 AI, revalidate the current 3 + 3 Link Intelligence set, repair only what changed, rebuild the same internal URL and rerun ContentScore. No SERP, competitor, PAA or evidence research is rerun. If an already-live placement must change, ContentScale first reopens it explicitly for editing so live verification history is never silently overwritten.</div></div><div class="actions"><button class="btn secondary" id="reopenForEditing" type="button">Reopen for editing</button><button class="btn" id="refreshAllContent" type="button">Refresh all & verify</button></div></div><div id="refreshAllStatus" class="metaBox" style="margin-top:12px">Ready when you want a full current-content verification.</div></section>
<section class="card workflowCard" data-stage="10" id="publishVerifyCard"><div class="top"><div><h2>10 · Publish & verify live</h2><div class="tiny">After Ready: copy the exact SEO HTML into the publisher CMS, publish a normal indexable page, enter the exact live URL, run the automated pre-check, then make the final manual decision.</div></div><span class="status" id="publishVerifyStatus">Waiting</span></div><div id="publishVerifyBody" class="metaBox" style="margin-top:12px">Finish Step 9 first.</div></section>
<script>(function(){const pid=${Number(placementId)||0},key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');let headings=[],aiCheckKeyword='',aiCheckStoreKey='cs_network_ai_answer_check_'+pid,linkedPrewriteBriefId=0,currentPendingDraft=null,lastPackage=null,lastGuidedAction='';if(!key)auth.style.display='block';const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt),t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(!r.ok){const er=Error(d.error||('Request failed '+r.status));er.payload=d;er.httpStatus=r.status;throw er}return d};function validHttpUrl(v){try{const u=new URL(String(v||'').trim());return (u.protocol==='http:'||u.protocol==='https:')?u.href:''}catch(_e){return ''}}function expectedArticleUrl(p){let host=String(p&&p.publisher_domain||'').trim();if(host.toLowerCase().startsWith('https://'))host=host.slice(8);else if(host.toLowerCase().startsWith('http://'))host=host.slice(7);while(host.endsWith('/'))host=host.slice(0,-1);let slug=String(p&&p.suggested_slug||'').trim();while(slug.startsWith('/'))slug=slug.slice(1);while(slug.endsWith('/'))slug=slug.slice(0,-1);return host&&slug?'https://'+host+'/'+slug:''}function scrollToFlowStep(n){n=Number(n||0);const el=n===10?document.getElementById('publishVerifyCard'):document.querySelector('.workflowCard[data-stage="'+n+'"]');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}document.querySelectorAll('.dummyStep[data-flow]').forEach(function(card){card.tabIndex=0;card.setAttribute('role','button');card.title='Go to Step '+card.dataset.flow;card.addEventListener('click',function(e){if(e.target&&e.target.closest('button,a,input,textarea,select'))return;scrollToFlowStep(card.dataset.flow)});card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();scrollToFlowStep(card.dataset.flow)}})});function showPublisherGenerationError(e,label){const box=document.getElementById('publisherGenerationError');if(!box)return;if(!e){box.style.display='none';box.innerHTML='';return}const p=e&&e.payload&&typeof e.payload==='object'?e.payload:{},parts=['HTTP '+Number(e.httpStatus||0||500)];if(p.code)parts.push('code: '+p.code);if(p.placement_status)parts.push('state: '+p.placement_status);if(p.approval_id)parts.push('approval #'+p.approval_id);box.style.display='block';box.className='metaBox badText';box.innerHTML='<strong>✕ '+esc(label||'Publisher Edition generation failed')+'</strong><div class="tiny" style="margin-top:5px;color:#fca5a5">'+esc(e.message||'Unknown generation error')+'</div><div class="tiny" style="margin-top:5px;color:#cbd5e1">'+esc(parts.join(' · '))+'</div>'+(p.next_action?'<div class="tiny" style="margin-top:6px;color:#fde68a"><b>Next action:</b> '+esc(p.next_action)+'</div>':'')+(p.details?'<details style="margin-top:7px"><summary class="tiny" style="cursor:pointer">Exact server details</summary><pre style="white-space:pre-wrap;font-size:10px;color:#cbd5e1">'+esc(JSON.stringify(p.details,null,2))+'</pre></details>':'');box.scrollIntoView({behavior:'smooth',block:'center'})}function busy(b,on,label){if(on){b.dataset.old=b.textContent;b.disabled=true;b.classList.add('busy');b.textContent=label}else{b.disabled=false;b.classList.remove('busy');b.textContent=b.dataset.old||b.textContent}}async function copyText(v){const text=String(v==null?'':v);if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(text);return true}catch(_e){}}const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';ta.style.pointerEvents='none';document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy')}catch(_e){}ta.remove();if(!ok)throw Error('Browser blocked clipboard access');return true}function h2Options(current){return '<option value="">Choose H2</option>'+headings.map(h=>'<option value="'+h.number+'" '+(String(current||'')===String(h.number)?'selected':'')+'>#'+h.number+' · '+esc(h.text)+'</option>').join('')}function syncGeneratedImageSubject(){const box=document.getElementById('imageSubjectDisplay'),role=document.getElementById('imageRole'),sel=document.getElementById('imageH2Number');if(!box||!role||!sel)return;const n=Number(sel.value||0);if(n>0){const h=headings.find(x=>Number(x.number)===n);role.value='supporting';box.textContent=h&&h.text?h.text:'Choose a valid H2';return;}if(role.value==='featured'){box.textContent=((document.getElementById('title')||{}).textContent||'').trim()||'Article title';}else{box.textContent='Choose an H2 — the H2 title will become the image subject';}}function getCurrentImageSelection(){const role=document.getElementById('imageRole'),sel=document.getElementById('imageH2Number'),h2Number=Number(sel&&sel.value||0)||0,imageRole=h2Number>0?'supporting':String(role&&role.value||'featured');return {image_role:imageRole,h2_number:h2Number}}function draftMatchesCurrentSelection(draft){if(!draft)return true;const sel=getCurrentImageSelection(),draftRole=String(draft.image_role||'featured'),m=String(draft.placement_hint||'').match(/^before-h2-num:(\d+)$/),draftH2=draftRole==='supporting'&&m?Number(m[1]||0):0;return draftRole===String(sel.image_role||'featured')&&Number(draftH2||0)===Number(sel.h2_number||0)}function syncImageDraftView(){const box=document.getElementById('images'),status=document.getElementById('imageActionStatus');if(!box)return;box.querySelectorAll('[data-image-selection-mismatch]').forEach(el=>el.remove());if(!currentPendingDraft)return;const row=box.querySelector('.imgrow');if(row)row.style.display='';if(draftMatchesCurrentSelection(currentPendingDraft)){if(status&&/^Selection changed\./.test(String(status.textContent||''))){status.textContent='';status.style.color=''}return;}const sel=getCurrentImageSelection(),target=sel.image_role==='featured'?'the featured image':'H2 #'+sel.h2_number,note=document.createElement('div');note.dataset.imageSelectionMismatch='1';note.className='tiny';note.style.marginTop='10px';note.style.padding='10px';note.style.border='1px solid #7c5a12';note.style.borderRadius='10px';note.style.background='#2a1d08';note.style.color='#f8deb0';note.innerHTML='<strong>Selection changed — existing draft kept available.</strong><div style="margin-top:5px">This prompt belongs to its saved placement. You can still copy/upload/use it. Generate a new prompt only if you want to replace it for '+esc(target)+'. Images never block the workflow.</div>';box.prepend(note);if(status){status.textContent='Image draft remains usable; selection warning only.';status.style.color='#f8deb0'}}function placementOptions(x){const hint=String(x.placement_hint||''),cur=hint.startsWith('before-h2-num:')?('h2:'+hint.slice(14)):(x.image_role==='featured'?'featured':'');return '<option value="featured" '+(cur==='featured'?'selected':'')+'>Featured — before article</option>'+headings.map(h=>'<option value="h2:'+h.number+'" '+(cur==='h2:'+h.number?'selected':'')+'>Before H2 #'+h.number+' · '+esc(h.text)+'</option>').join('')}function imgRow(x){const uploaded=x.status==='uploaded'||x.status==='approved',size=x.byte_size?Math.round(Number(x.byte_size)/1024)+' KB':'',thumb=uploaded?'<div style="margin-top:12px"><img src="/network/media/'+x.id+'?v='+encodeURIComponent(x.updated_at||Date.now())+'" alt="'+esc(x.alt_text||x.image_name||'Uploaded image')+'" style="display:block;max-width:320px;width:100%;height:auto;border-radius:10px;border:1px solid #35507a"><div class="tiny" style="margin-top:6px;color:#86efac">✓ Uploaded successfully'+(x.original_filename?' · '+esc(x.original_filename):'')+(size?' · '+size:'')+' · included in protected preview</div></div>':'',refreshControl=uploaded?'<div class="tiny" style="align-self:end;padding:10px 0">Prompt locked after upload — regenerate a draft instead of rewriting metadata for different pixels.</div>':'<button type="button" class="btn secondary" data-meta="'+x.id+'">Regenerate H2 prompt</button>';return '<div class="imgrow"><div class="top"><div><strong>'+esc(x.image_role)+' · '+esc(x.image_name)+'</strong><div class="tiny">'+esc(x.status)+' · Placement: '+esc(x.placement_hint||'not set')+'</div></div><button type="button" class="btn bad" data-del="'+x.id+'">Delete</button></div><div class="grid3" style="margin-top:10px"><div class="field" style="grid-column:span 2"><label>Image subject — locked to placement</label><div class="metaBox" data-image-subject="'+x.id+'">'+esc(x.image_name||'')+'</div><div class="tiny" style="margin-top:5px">Generated-image subjects are server-derived from the selected H2 (or H1 for Featured). They cannot be manually renamed.</div></div><div style="display:flex;align-items:end">'+refreshControl+'</div></div><div class="grid3" style="margin-top:10px"><div class="field" style="grid-column:span 2"><label>Image placement</label><select data-move-placement="'+x.id+'">'+placementOptions(x)+'</select><div class="tiny" style="margin-top:5px">For an unused draft, moving to another H2 also rebuilds the prompt. For an uploaded image, placement moves but metadata stays tied to the actual image.</div></div><div style="display:flex;align-items:end"><button type="button" class="btn secondary" data-move="'+x.id+'">'+(uploaded?'Move image':'Update placement + prompt')+'</button></div></div><div class="grid" style="margin-top:10px"><div><div class="tiny">Prompt</div><div class="metaBox" data-prompt-text="'+x.id+'">'+esc(x.prompt||'')+'</div><button type="button" class="btn secondary" data-copy="'+x.id+'" style="margin-top:6px">Copy prompt</button></div><div><div class="tiny">Alt text</div><div class="metaBox">'+esc(x.alt_text||'')+'</div><div class="tiny" style="margin-top:8px">Caption</div><div class="metaBox">'+esc(x.caption||'')+'</div><div style="margin-top:10px;padding:10px;border:1px solid #35507a;border-radius:8px"><div class="tiny">Suggested filename</div><strong style="display:block;margin-top:3px">'+esc(x.suggested_filename||'—')+'</strong><button class="btn secondary" type="button" data-copy-filename="'+x.id+'" data-filename="'+esc(x.suggested_filename||'')+'" style="margin-top:6px">Copy filename</button></div></div></div>'+thumb+'<form data-upload="'+x.id+'" style="margin-top:10px"><input type="file" name="image" accept="image/jpeg,image/png,image/webp" required> <button class="btn">'+(uploaded?'Replace image':'Upload image')+'</button><span class="tiny upload-note" style="margin-left:8px"></span></form></div>'}function placedImgRow(x){const size=x.byte_size?Math.round(Number(x.byte_size)/1024)+' KB':'',src='/network/media/'+x.id+'?v='+encodeURIComponent(x.updated_at||Date.now());return '<div class="placed-image" data-drag-image="'+x.id+'" title="Use the Drag image handle to place this image in the article preview, or use the Placement selector below."><button type="button" class="image-x" data-delete-placed="'+x.id+'" title="Delete image from this article" aria-label="Delete image from article">×</button><img draggable="false" src="'+src+'" alt="'+esc(x.alt_text||x.image_name||'Placed image')+'"><div class="drag-handle" draggable="true" data-drag-handle="'+x.id+'" title="Drag this handle to a placement line in the article preview">↕ Drag image into article</div><div class="placed-meta"><strong>'+esc(x.image_name||x.original_filename||'Image')+'</strong><div class="tiny">'+esc(x.placement_hint||'not set')+(size?' · '+size:'')+'</div><div class="tiny" style="margin-top:5px"><b>Alt:</b> '+esc(x.alt_text||'—')+'</div><div class="tiny" style="margin-top:3px"><b>Caption:</b> '+esc(x.caption||'—')+'</div></div><div class="placed-actions"><div class="field"><label>Placement</label><select data-move-placement="'+x.id+'">'+placementOptions(x)+'</select></div><button type="button" class="btn secondary" data-move="'+x.id+'">Move</button></div></div>'}function setDummyStep(n,msg){document.querySelectorAll('[data-flow]').forEach(el=>{const x=Number(el.dataset.flow||0);el.classList.toggle('done',x<n);el.classList.toggle('active',x===n);el.classList.toggle('wait',x>n)});document.querySelectorAll('.workflowCard[data-stage]').forEach(el=>{const x=Number(el.dataset.stage||0);el.classList.toggle('flowDone',x<n);el.classList.toggle('flowActive',x===n);el.classList.toggle('flowWait',x>n)});document.getElementById('nextDummy').innerHTML='<b>NEXT ACTION · Step '+n+'</b> · '+esc(msg)}
function guideToActualNextAction(info){
  if(!info)return;
  const sig=String(info.step||'')+'|'+String(info.nextId||'')+'|'+String(info.mode||'');
  if(sig===lastGuidedAction)return;
  lastGuidedAction=sig;
  let el=info.nextId?document.getElementById(info.nextId):null;
  if(!el)el=info.step===10?document.getElementById('publishVerifyCard'):document.querySelector('.workflowCard[data-stage="'+Number(info.step||1)+'"]');
  if(el)setTimeout(function(){try{el.scrollIntoView({behavior:'smooth',block:'center'});if(el.matches&&el.matches('button,input,textarea,select'))el.focus({preventScroll:true});}catch(_e){}},180);
}
function _seoCopyStateKey(){return 'cs_network_seo_copy_'+pid}
function _seoCopyHash(d){return String(d&&d.internal_content&&d.internal_content.current_hash||'')}
function _readSeoCopyState(){try{return JSON.parse(localStorage.getItem(_seoCopyStateKey())||'{}')||{}}catch(_e){return {}}}
function _seoCopiedForCurrent(d){const h=_seoCopyHash(d),srv=d&&d.delivery_state||{};return !!(h&&srv.seo_publication_copied_current===true&&String(srv.seo_publication_copied_hash||'')===h)}
function _seoCopiedAfterLiveCheck(d){const srv=d&&d.delivery_state||{},v=d&&d.live_verification||null,copiedAt=String(srv.seo_publication_copied_at||'');if(!_seoCopiedForCurrent(d)||!copiedAt)return false;if(!v||!v.checked_at)return true;return Date.parse(copiedAt)>Date.parse(v.checked_at)}
function _markSeoCopied(d){const h=_seoCopyHash(d);if(!h)return;try{localStorage.setItem(_seoCopyStateKey(),JSON.stringify({hash:h,copied_at:new Date().toISOString()}))}catch(_e){}}
function applySingleNextAction(d){
  const r=d&&d.readiness||{},action=r.next_action||{},p=d&&d.publication||{},pe=d&&d.prewrite_evidence||{},ic=d&&d.internal_content||{};
  const controls=['prewriteStepBtn','regenerateArticle','repairBriefFidelity','suggestExternal','discoverInternal','saveManualInternal','saveManualExternal','reopenForEditing','createInternalUrl','runOfficialScan','refreshAllContent','copySeoHtml','publishPrecheck'];
  controls.forEach(id=>{const b=document.getElementById(id);if(!b)return;b.classList.remove('nextAction','completedAction');b.disabled=true;b.classList.add('locked')});
  ['publishVerifyManual','publishNeedsChanges','publishReject'].forEach(id=>{const b=document.getElementById(id);if(b){b.classList.remove('nextAction','completedAction');b.disabled=true;}});
  const nextId=String(action.control_id||''),step=Number(action.step||1),msg=String(action.reason||'Follow the current required action.');
  const next=nextId?document.getElementById(nextId):null;if(next){next.disabled=false;next.classList.remove('locked');next.classList.add('nextAction');if(action.label)next.textContent=action.label}
  const checks=Array.isArray(r.checks)?r.checks:[];const passed=k=>checks.some(x=>x&&x.key===k&&x.passed===true);
  const preBtn=document.getElementById('prewriteStepBtn');if(passed('prewrite_linked')&&passed('ai_5_of_5')&&passed('internal_destination')&&preBtn&&nextId!=='prewriteStepBtn'){preBtn.classList.add('completedAction');preBtn.classList.remove('nextAction')}
  const refresh=document.getElementById('refreshAllContent');if(r.final_ready&&refresh&&nextId!=='refreshAllContent'){refresh.classList.add('completedAction');refresh.classList.remove('nextAction');refresh.textContent='✓ Current content verified'}
  const regen=document.getElementById('regenerateArticle');if(passed('generation_current')&&regen){regen.classList.add('completedAction');regen.classList.remove('nextAction')}
  const scan=document.getElementById('runOfficialScan');if(passed('contentscore')&&scan){scan.classList.add('completedAction');scan.classList.remove('nextAction')}
  const live=document.getElementById('createInternalUrl');if(passed('internal_preview')&&live){live.classList.add('completedAction');live.classList.remove('nextAction')}
  const copy=document.getElementById('copySeoHtml');if(r.seo_copied_current&&copy&&nextId!=='copySeoHtml'){copy.classList.add('completedAction');copy.classList.remove('nextAction');copy.disabled=true;copy.classList.add('locked');copy.textContent='✓ SEO publication HTML copied'}else if(copy&&nextId==='copySeoHtml'&&action.label){copy.textContent=action.label}
  const precheck=document.getElementById('publishPrecheck');if(precheck&&nextId==='publishPrecheck'&&action.label)precheck.textContent=action.label;
  setDummyStep(step,msg);const info={step,nextId,msg,mode:action.done?'done':'next'};guideToActualNextAction(info);return info;
}
function aiCheckPromptText(q){const nl=String.fromCharCode(10)+String.fromCharCode(10);return ['Answer this exact user query as a real user would receive the answer:','QUERY:',q||'[NO LINKED PREWRITE KEYWORD]','Instructions:','- Use the query EXACTLY as written. Do not rewrite, broaden or replace it.','- Actually answer the query. Do not explain these instructions and do not return a template.','- Use current live web/search capabilities when available.','- Research the current web before answering when web search is available.','- Use multiple independent relevant sources when genuinely available; do not invent extra sources just to reach a number.','- Do not invent facts, citations or URLs.','- Preserve every exact cited/source page URL as a complete https:// URL.','- Never replace an exact page URL with only a root domain when the exact page is available.','- Never invent, reconstruct, guess or repair URLs.','- If the interface renders a URL as a clickable Markdown link, that is acceptable, but the underlying exact https:// URL must remain visible and complete.','Return ONLY these two sections:','ANSWER:','[the actual complete answer to the exact query]','RESOURCES:','https://exact-source-page-1','https://exact-source-page-2','[continue with every real source actually used or shown; if none, write NO VERIFIED RESOURCES]','Do NOT add MENTIONED, RECOMMENDED, company lists, brand lists, summaries, classifications or any other section.','Final validation: answer the query, preserve exact https:// source URLs, include no invented URLs, and return only ANSWER and RESOURCES.'].join(nl)}
function _aiCheckKey(q){return String(q||'').trim().toLowerCase().replace(/\s+/g,' ').slice(0,240)}
function _aiCheckRead(){let d={answers:{},engine:'google_aio',drafts:{},active_keyword:''};try{d=JSON.parse(localStorage.getItem(aiCheckStoreKey)||'null')||d}catch(_e){}if(!d.answers)d.answers={};if(!d.drafts)d.drafts={};return d}
function aiCheckLoadDraft(){const d=_aiCheckRead(),e=document.getElementById('aiCheckEngine'),a=document.getElementById('aiCheckAnswer'),k=_aiCheckKey(aiCheckKeyword);if(e&&d.engine&&Array.from(e.options).some(o=>o.value===d.engine))e.value=d.engine;const bucket=(k&&d.drafts[k])||null;if(a&&e){if(bucket&&bucket.answers)a.value=bucket.answers[e.value]||'';else a.value=d.answers[e.value]||''}}
function aiCheckPersist(){const e=document.getElementById('aiCheckEngine'),a=document.getElementById('aiCheckAnswer'),d=_aiCheckRead(),k=_aiCheckKey(aiCheckKeyword);if(!e||!a)return;d.engine=e.value;if(k){if(!d.drafts[k])d.drafts[k]={answers:{},keyword:aiCheckKeyword,saved_at:''};if(!d.drafts[k].answers)d.drafts[k].answers={};d.drafts[k].keyword=aiCheckKeyword;d.drafts[k].answers[e.value]=a.value;d.drafts[k].saved_at=new Date().toISOString();d.active_keyword=k;const keys=Object.keys(d.drafts).sort((x,y)=>Date.parse(d.drafts[y].saved_at||0)-Date.parse(d.drafts[x].saved_at||0));keys.slice(20).forEach(x=>delete d.drafts[x])}else{d.answers[e.value]=a.value}localStorage.setItem(aiCheckStoreKey,JSON.stringify(d))}
function renderAiCheck(prewrite){const q=String(prewrite&&prewrite.keyword||prewrite&&prewrite.working_title||'').trim(),kw=document.getElementById('aiCheckKeyword'),prompt=document.getElementById('aiCheckPrompt'),badge=document.getElementById('aiCheckKeywordStatus'),copy=document.getElementById('copyAiCheckPrompt'),analyse=document.getElementById('analyseAiCheck');const oldKey=_aiCheckKey(aiCheckKeyword),newKey=_aiCheckKey(q);if(oldKey&&oldKey!==newKey)aiCheckPersist();aiCheckKeyword=q;if(kw)kw.value=q;if(prompt)prompt.value=q?aiCheckPromptText(q):'';if(oldKey!==newKey)aiCheckLoadDraft();document.getElementById('aiCheckAnswer').addEventListener('input',aiCheckPersist);if(badge){badge.textContent=q?'Keyword synced from open Prewrite ✓':'Waiting for Prewrite keyword…';badge.style.borderColor=q?'#166534':'#92400e';badge.style.color=q?'#86efac':'#fde68a'}if(copy)copy.disabled=!q;if(analyse)analyse.disabled=!q}
async function analyseAiCheck(){const raw=document.getElementById('aiCheckAnswer').value||'',status=document.getElementById('aiCheckStatus'),engine=document.getElementById('aiCheckEngine').value;const upper=raw.toUpperCase(),resourceAt=upper.indexOf('RESOURCES:'),answerPart=resourceAt>=0?raw.slice(0,resourceAt):raw;let answer=answerPart.trim();if(answer.toUpperCase().indexOf('ANSWER:')===0)answer=answer.slice(7).trim();const urls=[],seen=new Set();let pos=0;while(true){let h1=raw.indexOf('https://',pos),h2=raw.indexOf('http://',pos),at=h1<0?h2:(h2<0?h1:Math.min(h1,h2));if(at<0)break;let end=at;while(end<raw.length){const ch=raw.charAt(end),cc=raw.charCodeAt(end);if(ch===' '||cc===10||cc===13||cc===9||ch==='<'||ch==='>'||ch===']'||ch==='['||ch==='('||ch===')'||cc===34||cc===39)break;end++}let u=raw.slice(at,end);while(u&&'.,;:!?*_'.indexOf(u.slice(-1))>=0)u=u.slice(0,-1);try{const x=new URL(u);if((x.protocol==='http:'||x.protocol==='https:')&&!seen.has(x.href)){seen.add(x.href);urls.push(x.href)}}catch(_e){}pos=Math.max(end,at+7)}if(!answer){status.className='aiCheckStatus warn';status.textContent='✕ No ANSWER content recognized.';return}aiCheckPersist();try{if(prewriteFrame&&prewriteFrame.contentWindow)prewriteFrame.contentWindow.postMessage({type:'network-ai-evidence',placement_id:pid,engine:engine,evidence:raw},window.location.origin)}catch(_e){}if(!linkedPrewriteBriefId){status.className='aiCheckStatus ok';status.innerHTML='<strong>✓ Added to the open Prewrite form</strong><div class="tiny" style="margin-top:6px">No CURRENT Prewrite link exists for this Publisher Edition, so no server save was attempted. The left form can still receive the evidence live. Save/link the current Brief first, then persistent AI evidence can be stored.</div>'+(urls.length?'<div style="margin-top:8px;word-break:break-all">'+urls.map(u=>'<div><a target="_blank" rel="noopener noreferrer" href="'+esc(u)+'">'+esc(u)+'</a></div>').join('')+'</div>':'');return}status.className='aiCheckStatus';status.textContent='Answer added to the open Prewrite. Saving persistent evidence…';try{const d=await api('/api/network/admin/publications/'+pid+'/ai-evidence',{method:'POST',body:JSON.stringify({engine:engine,evidence:raw})});status.className=d.complete_5_of_5?'aiCheckStatus ok':'aiCheckStatus warn';status.innerHTML='<strong>'+(d.complete_5_of_5?'✓ Five-system research complete':'⚠ Research still incomplete')+' · saved to Brief #'+esc(d.brief_id)+'</strong><div class="tiny" style="margin-top:6px">'+urls.length+' exact source URL(s) captured for '+esc(document.getElementById('aiCheckEngine').options[document.getElementById('aiCheckEngine').selectedIndex].text)+' · '+esc(d.checked_count)+'/5 AI systems.</div>'+(!d.complete_5_of_5?'<div class="tiny" style="margin-top:6px;color:#fde68a">Missing: '+esc((d.missing_ai_systems||[]).join(', ')||'unknown')+'. Approval stays blocked; existing research is preserved.</div>':'')+(d.requires_regeneration?'<div class="tiny" style="margin-top:6px;color:#fde68a">The Brief changed after Publisher Edition generation. Regenerate before final delivery.</div>':'')+(urls.length?'<div style="margin-top:8px;word-break:break-all">'+urls.map(u=>'<div><a target="_blank" rel="noopener noreferrer" href="'+esc(u)+'">'+esc(u)+'</a></div>').join('')+'</div>':'')}catch(e){const unlinked=/Create or link the Prewrite Brief first/i.test(String(e&&e.message||''));if(unlinked){status.className='aiCheckStatus ok';status.innerHTML='<strong>✓ Added to the open Prewrite form</strong><div class="tiny" style="margin-top:6px">This Prewrite has not been saved/linked yet. Generate or save the Brief and this evidence will be included with it.</div>'+(urls.length?'<div style="margin-top:8px;word-break:break-all">'+urls.map(u=>'<div><a target="_blank" rel="noopener noreferrer" href="'+esc(u)+'">'+esc(u)+'</a></div>').join('')+'</div>':'')}else{status.className='aiCheckStatus warn';status.textContent='✕ Added to the open Prewrite form, but persistent save failed: '+e.message}}}
function renderPrewriteAction(prewrite){
  const btn=document.getElementById('prewriteStepBtn'),hint=document.getElementById('prewriteStepHint'),top=document.getElementById('openPrewriteTop');
  if(!btn||!hint)return;
  btn.textContent=prewrite&&prewrite.id?'Open / update Prewrite Brief':'Create Prewrite Brief';
  btn.classList.remove('locked');btn.removeAttribute('aria-disabled');
  if(prewrite&&prewrite.id){
    const n=Number(prewrite.ai_systems_checked||0),missing=Array.isArray(prewrite.ai_systems_missing)?prewrite.ai_systems_missing:[];
    if(!prewrite.ai_complete)hint.textContent='⚠ Research incomplete · '+n+'/5 AI systems · missing '+(missing.join(', ')||'unknown')+'. Existing research is preserved.';
    else if(!prewrite.internal_destination_ready)hint.textContent='⚠ Internal URL choice required for '+(prewrite.publisher_domain||'the publisher domain')+'. Existing research is preserved.';
    else hint.textContent='✓ Linked Prewrite #'+prewrite.id+(prewrite.keyword?' · '+prewrite.keyword:'')+' · 5/5 AI · internal destination ready';
  }else hint.textContent='No Prewrite linked yet. Open the real Tracker modal and create it here.';
  if(top&&prewrite&&prewrite.id){top.href='/network/prewrite/'+encodeURIComponent(prewrite.id);top.style.display='inline-flex'}else if(top)top.style.display='none';
}
function renderOfficial(ic,prewrite,images,briefFidelity,publicationStandard){
  ic=ic||{};
  const urlBox=document.getElementById('internalUrlBox'),open=document.getElementById('openInternalUrl'),scanBtn=document.getElementById('runOfficialScan'),score=document.getElementById('officialScore'),status=document.getElementById('officialScanStatus'),rec=document.getElementById('officialRecommendations');
  const fidelityOk=!!(briefFidelity&&briefFidelity.passed),standardOk=!!(publicationStandard&&publicationStandard.passed&&publicationStandard.meta_policy_passed!==false),hasPre=!!prewrite,aiOk=!!(prewrite&&prewrite.ai_complete),internalOk=!!(prewrite&&prewrite.internal_destination_ready),prewriteIntegrityOk=aiOk&&internalOk,needsRegen=!!(prewrite&&prewrite.requires_regeneration);
  if(ic.url){urlBox.innerHTML='<strong>Internal live URL</strong><div style="word-break:break-all;margin-top:5px">'+esc(ic.url)+'</div><div class="tiny">Current content hash: '+esc(String(ic.current_hash||'').slice(0,20))+'…</div>';open.href=ic.url;open.style.display='inline-flex';scanBtn.disabled=!(prewriteIntegrityOk&&fidelityOk&&standardOk)}else{urlBox.textContent='No internal live URL yet.';open.style.display='none';scanBtn.disabled=true}
  const s=ic.official_scan;
  if(s){score.textContent=s.score+'/100';if(s.stale){status.className='tiny scanStale';status.textContent='⚠ The saved ContentScore belongs to older HTML. Use Refresh all & verify to rebuild and rescan the exact current content.'}else{status.className='tiny scanFresh';status.textContent='✓ Official ContentScore current · '+(s.scanned_at||'')+' · '+(s.canonical_route||'/api/scan')}const recommendations=Array.isArray(s.recommendations)?s.recommendations:[];if(recommendations.length){rec.style.display='block';rec.innerHTML='<strong>Official scanner recommendations</strong><div class="tiny" style="margin-top:6px">'+recommendations.slice(0,12).map(x=>esc(typeof x==='string'?x:(x.title||x.message||x.recommendation||JSON.stringify(x)))).join('<br>')+'</div>'}else rec.style.display='none'}else{score.textContent='—';rec.style.display='none';if(ic.url)status.textContent='Internal URL ready. Use Refresh all & verify for the final current-content scan.'}

  const scanCurrent=!!(s&&!s.stale),ready=!!(hasPre&&prewriteIntegrityOk&&!needsRegen&&fidelityOk&&standardOk&&ic.url&&scanCurrent);
  let step=1,msg='Create or review the Prewrite Brief first.';
  if(!hasPre){step=1;msg='Link or create the Prewrite Brief first.'}
  else if(!aiOk){step=1;msg='Prewrite research is incomplete: '+Number(prewrite&&prewrite.ai_systems_checked||0)+'/5 AI systems. Add only the missing evidence; existing research stays intact.'}
  else if(!internalOk){step=1;msg='Choose/confirm the required publisher-domain internal destination. No new research is needed.'}
  else if(ready){step=9;msg='All final checks are current. Publisher Edition is Ready.'}
  else{step=9;msg='Manual prerequisites are complete. Run Refresh all & verify below; it will repair/regenerate when needed, rebuild the stable internal URL and run the final ContentScore.'}

  const checklist=[
    ['Prewrite Brief linked',hasPre],
    ['5/5 AI research complete',aiOk],
    ['Publisher internal destination selected',internalOk],
    ['Current generation matches approved Brief',hasPre&&!needsRegen],
    ['Approved Brief Fidelity passes',fidelityOk],
    ['Publication Standard passes',standardOk],
    ['Stable internal live URL exists',!!ic.url],
    ['Real ContentScore is current for exact HTML',scanCurrent]
  ];
  const rs=document.getElementById('readyStatus'),rd=document.getElementById('readyDetail');
  if(rs&&rd){
    rs.textContent=ready?'✓ Ready':'Waiting';rs.style.color=ready?'#86efac':'#fde68a';
    const checklistHtml=checklist.map(x=>'<div style="margin:4px 0;color:'+(x[1]?'#86efac':'#fde68a')+'">'+(x[1]?'✓':'○')+' '+esc(x[0])+'</div>').join('');
    let next='';
    if(ready) next='<div class="tiny" style="margin-top:10px;color:#86efac"><strong>Everything is current. This Publisher Edition is Ready.</strong></div>';
    else if(!hasPre) next='<div class="tiny" style="margin-top:10px"><strong>Next:</strong> link/create the Prewrite Brief.</div>';
    else if(!aiOk) next='<div class="tiny" style="margin-top:10px"><strong>Next:</strong> complete only the missing AI evidence ('+esc(String(Number(prewrite&&prewrite.ai_systems_checked||0)))+'/5 saved).</div>';
    else if(!internalOk) next='<div class="tiny" style="margin-top:10px"><strong>Next:</strong> choose the publisher internal URL. This is a deterministic choice; do not rerun research.</div>';
    else next='<div class="tiny" style="margin-top:10px"><strong>Next:</strong> use <b>Refresh all & verify</b>. It is the single final verification action.</div><button class="btn good" id="readyGoRefresh" type="button" style="margin-top:10px">Go to Refresh all & verify</button>';
    rd.innerHTML='<strong>Final readiness checklist</strong><div style="margin-top:8px">'+checklistHtml+'</div>'+next;
    const go=document.getElementById('readyGoRefresh');if(go)go.onclick=function(){const card=document.getElementById('refreshAllCard');if(card)card.scrollIntoView({behavior:'smooth',block:'center'})};
  }
  setDummyStep(step,msg);
}
function renderAuthoritativeReadiness(d){
  const r=d&&d.readiness||null,rs=document.getElementById('readyStatus'),rd=document.getElementById('readyDetail');if(!r||!rs||!rd)return;
  rs.textContent=r.final_ready?'✓ Ready':'Waiting';rs.style.color=r.final_ready?'#86efac':'#fde68a';
  const checks=(r.checks||[]).filter(x=>x&&x.key!=='seo_html_copy'&&x.key!=='live_verified');
  const html=checks.map(x=>'<div style="margin:4px 0;color:'+(x.passed?'#86efac':'#fde68a')+'">'+(x.passed?'✓':'○')+' '+esc(x.label)+(x.detail?' <span class="tiny">· '+esc(x.detail)+'</span>':'')+(x.blocking===false?' <span class="tiny">· optional</span>':'')+'</div>').join('');
  const a=r.next_action||{};const next=r.final_ready?'<div class="tiny" style="margin-top:10px;color:#86efac"><strong>Everything required for the current HTML is current.</strong></div>':'<div class="tiny" style="margin-top:10px"><strong>Authoritative next action:</strong> '+esc(a.label||'Continue')+' · '+esc(a.reason||'')+'</div>';
  rd.innerHTML='<strong>Publication Readiness Engine</strong><div class="tiny" style="margin-top:4px">One server-side truth · '+esc(r.engine||'')+'</div><div style="margin-top:8px">'+html+'</div>'+next;
}
function renderPublishVerify(d){
  const box=document.getElementById('publishVerifyBody'),status=document.getElementById('publishVerifyStatus');if(!box||!status)return;
  const p=d&&d.publication||{},q=d&&d.quality_gate||{},v=d&&d.live_verification||null,state=String(p.status||''),finalReady=!!(d&&d.readiness?d.readiness.final_ready:q.final_ready);
  const inReview=['submitted','verifying','needs_review','verified'].includes(state),unlocked=finalReady||inReview;
  if(state==='verified'){status.textContent='✓ Verified live';status.style.color='#86efac'}else if(inReview){status.textContent='Live review';status.style.color='#fde68a'}else{status.textContent=finalReady?'Ready to publish':'Waiting';status.style.color=finalReady?'#86efac':'#fde68a'}
  if(unlocked)setDummyStep(10,state==='verified'?'Live placement verified. Publication workflow complete.':(inReview?'Live URL saved. Review the automated pre-check and make the final manual decision.':'Publisher Edition is Ready. Publish the SEO HTML, then save the exact live URL and run the pre-check.'));
  if(!unlocked){box.innerHTML='<strong>Finish Step 9 first.</strong><div class="tiny" style="margin-top:6px">When the Publisher Edition is Ready, this section unlocks the existing publication and live-verification workflow.</div>';return}
  const suggested=expectedArticleUrl(p),live=String(p.published_url||''),liveInput=live||suggested,verified=state==='verified',details=v&&v.details||{},check=(label,val)=>'<div class="'+(val?'ok':'badText')+'">'+(val?'✓':'✕')+' '+esc(label)+'</div>';
  let checks='';if(v){checks='<div style="margin-top:12px;padding-top:10px;border-top:1px solid #294163"><strong>Latest live pre-check · '+esc(v.result_status||'')+'</strong><div class="grid" style="margin-top:8px">'+check('HTTP reachable',Number(v.http_status)>=200&&Number(v.http_status)<400)+check('Indexable',!!v.indexable)+check('Canonical valid',!!v.canonical_ok)+check('Publisher Edition present as static HTML',!!v.content_match_ok)+check('Brand mention requirement',!!v.brand_mention_ok)+check('Source link requirement',!!v.source_link_ok)+check('Not password protected',!v.password_protected)+'</div>'+(details.fetch_error?'<div class="tiny badText" style="margin-top:6px">Fetch error: '+esc(details.fetch_error)+'</div>':'')+'<div class="tiny" style="margin-top:6px">Checked '+esc(v.checked_at||'')+'. Automated evidence never awards credits; the final decision remains manual.</div></div>'}
  if(verified){
    box.innerHTML='<div class="ok"><strong>✓ Verified live</strong></div><div class="tiny" style="margin-top:6px">'+(live?'Live URL: <a target="_blank" rel="noopener" href="'+esc(live)+'">'+esc(live)+'</a>':'Live URL saved')+'</div>'+checks+(p.verification_note?'<div class="tiny" style="margin-top:8px"><strong>Review note:</strong> '+esc(p.verification_note)+'</div>':'')+'<div class="actions" style="margin-top:12px"><button class="btn secondary" id="changeVerifiedLiveUrl" type="button">Change live URL</button></div><div id="verifiedUrlChangePanel" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid #294163"><div class="tiny" style="margin-bottom:8px;color:#fde68a"><strong>Controlled URL change.</strong> The current URL remains in review history. If the old public URL is being replaced, keep a 301 redirect from the old URL to the new URL.</div><div class="field"><label>New exact live article URL</label><input id="verifiedNewLiveUrl" value="'+esc(live)+'" placeholder="https://'+esc(p.publisher_domain||'publisher.com')+'/new-article-url"></div><div class="actions" style="margin-top:10px"><button class="btn nextAction" id="saveVerifiedLiveUrl" type="button">Save new URL & run live pre-check</button><button class="btn secondary" id="cancelVerifiedLiveUrl" type="button">Cancel</button></div><div id="verifiedUrlChangeMsg" class="tiny" style="margin-top:8px"></div></div>';
    const change=document.getElementById('changeVerifiedLiveUrl'),panel=document.getElementById('verifiedUrlChangePanel'),save=document.getElementById('saveVerifiedLiveUrl'),cancel=document.getElementById('cancelVerifiedLiveUrl');
    if(change)change.onclick=function(){this.disabled=true;panel.style.display='block';setTimeout(()=>save&&save.scrollIntoView({behavior:'smooth',block:'center'}),80)};
    if(cancel)cancel.onclick=function(){panel.style.display='none';if(change)change.disabled=false};
    if(save)save.onclick=async function(){const b=this,msg=document.getElementById('verifiedUrlChangeMsg'),u=String((document.getElementById('verifiedNewLiveUrl')||{}).value||'').trim();if(!u){msg.className='tiny badText';msg.textContent='Enter the new exact live URL first.';return}if(u.replace(/\\/$/,'')===live.replace(/\\/$/,'')){msg.className='tiny badText';msg.textContent='This is still the currently verified URL. Enter the new URL.';return}busy(b,true,'Checking new URL…');msg.className='tiny';msg.textContent='Starting a new review round and checking the new live page…';try{await api('/api/network/admin/placements/'+pid+'/submit-live',{method:'POST',body:JSON.stringify({published_url:u,allow_verified_url_change:true})});const x=await api('/api/network/admin/placements/'+pid+'/verify-live',{method:'POST',body:'{}'});msg.className='tiny '+(x.precheck_passed?'ok':'badText');msg.textContent=x.precheck_passed?'✓ New URL passed the live pre-check. Final manual verification is now required.':'✕ New URL saved, but the live pre-check found issues. Follow the next blue action.';lastGuidedAction='';await load()}catch(e){msg.className='tiny badText';msg.textContent='✕ '+e.message}finally{busy(b,false)}};
    return
  }
  box.innerHTML='<div class="tiny" style="margin-bottom:10px"><strong>1.</strong> Publish the exact SEO HTML on <strong>'+esc(p.publisher_domain||'the publisher domain')+'</strong>. <strong>2.</strong> Enter the final public URL. <strong>3.</strong> Run the live pre-check. <strong>4.</strong> Make the manual decision.</div><div class="actions"><button class="btn" id="publishCopyHtml" type="button">Copy SEO HTML</button></div><div class="field" style="margin-top:12px"><label>Final live article URL <span class="tiny">· prefilled from Step 4; change only if the publisher used another same-domain URL</span></label><input id="publishLiveUrl" placeholder="https://'+esc(p.publisher_domain||'publisher.com')+'/article" value="'+esc(liveInput)+'"></div><div class="actions" style="margin-top:10px"><button class="btn good" id="publishPrecheck" type="button">'+(v&&v.result_status==='passed'?'✓ Live pre-check passed':'Save URL & run live pre-check')+'</button>'+(live?'<a class="btn secondary" target="_blank" rel="noopener" href="'+esc(live)+'">Open live page</a>':'')+'</div><div id="publishLiveMsg" class="tiny" style="margin-top:8px"></div>'+checks+(v?'<div class="field" style="margin-top:14px"><label>Manual review note '+(v.result_status==='passed'?'(optional)':'(required to override a failed pre-check)')+'</label><textarea id="publishReviewNote" placeholder="What did you verify or what must change?">'+esc(p.verification_note||'')+'</textarea></div><div class="actions" style="margin-top:10px"><button class="btn good" id="publishVerifyManual" type="button">Verify manually</button><button class="btn warn" id="publishNeedsChanges" type="button">Needs changes</button><button class="btn bad" id="publishReject" type="button">Reject</button></div>':'');
  const copy=document.getElementById('publishCopyHtml');if(copy)copy.onclick=async function(){const b=this;busy(b,true,'Copying…');try{const x=await api('/api/network/admin/placements/'+pid+'/seo-html');await navigator.clipboard.writeText(x.html||'');await api('/api/network/admin/publications/'+pid+'/mark-seo-copied',{method:'POST',body:'{}'});_markSeoCopied(lastPackage);b.textContent='✓ SEO HTML copied';lastGuidedAction='';await load()}catch(e){alert(e.message)}finally{b.classList.remove('busy')}};
  const pre=document.getElementById('publishPrecheck');if(pre&&v&&v.result_status==='passed'){pre.disabled=true;pre.classList.add('locked');pre.title='The current saved live URL already passed the automated pre-check.'}if(pre)pre.onclick=async function(){if(this.disabled)return;const b=this,msg=document.getElementById('publishLiveMsg'),u=String((document.getElementById('publishLiveUrl')||{}).value||'').trim();if(!u){msg.className='tiny badText';msg.textContent='Enter the exact live article URL first.';return}busy(b,true,'Checking live page…');msg.className='tiny';msg.textContent='Saving the live URL and checking the real published page…';try{if(u!==String(p.published_url||'')||!['submitted','needs_review','verifying'].includes(state))await api('/api/network/admin/placements/'+pid+'/submit-live',{method:'POST',body:JSON.stringify({published_url:u})});const x=await api('/api/network/admin/placements/'+pid+'/verify-live',{method:'POST',body:'{}'});msg.className='tiny '+(x.precheck_passed?'ok':'badText');msg.textContent=x.precheck_passed?'✓ Live pre-check passed. Open the page and make the final manual decision.':'✕ Live pre-check found issues. Review the checks below before deciding.';await load()}catch(e){msg.className='tiny badText';msg.textContent='✕ '+e.message}finally{busy(b,false)}};
  async function manual(decision){const n=String((document.getElementById('publishReviewNote')||{}).value||'').trim();if(decision==='verified'&&v&&v.result_status!=='passed'&&!n)return alert('The automated pre-check did not pass. Enter a review note before manually verifying an override.');if(decision==='verified'&&!confirm('Verify this live Publisher Edition? This can release placement credits once.'))return;if(decision==='rejected'&&!confirm('Reject this live placement?'))return;try{await api('/api/network/admin/placements/'+pid+'/manual-review',{method:'POST',body:JSON.stringify({decision,note:n})});await load()}catch(e){alert(e.message)}}
  const vb=document.getElementById('publishVerifyManual'),nb=document.getElementById('publishNeedsChanges'),rb=document.getElementById('publishReject');if(vb)vb.onclick=()=>manual('verified');if(nb)nb.onclick=()=>manual('needs_changes');if(rb)rb.onclick=()=>manual('rejected');
}
async function load(){const d=await api('/api/network/admin/publications/'+pid+'/package');lastPackage=d;const p=d.publication,s=d.settings;const ps=d.publication_standard||{},kw=d.seed_keyword_policy||{required:false,passed:true,checks:{},missing:[]},lp=d.link_policy||{passed:false,missing:['link_policy'],internal:{count:0,min:3,target_min:3,target_max:5,candidate_count:0},external:{count:0,min:3,target_min:3,target_max:5,candidate_count:0}};const lps=document.getElementById('linkPolicyStatus');if(lps){lps.innerHTML='<div class="'+(lp.passed?'ok':'badText')+'"><strong>'+(lp.passed?'✓ Publication Link Policy passed':'✕ Publication Link Policy needs action')+'</strong></div><div class="tiny" style="margin-top:6px">Internal: '+esc(lp.internal&&lp.internal.count||0)+' / min '+esc(lp.internal&&lp.internal.min||3)+' · target 3–5 · candidates '+esc(lp.internal&&lp.internal.candidate_count||0)+'</div><div class="tiny">External: '+esc(lp.external&&lp.external.count||0)+' / min '+esc(lp.external&&lp.external.min||3)+' · target 3–5 · candidates '+esc(lp.external&&lp.external.candidate_count||0)+'</div>'+(!lp.passed?'<div class="tiny" style="margin-top:6px;color:#fde68a">Missing: '+esc((lp.missing||[]).join(', ')||'link coverage')+'</div>':'')}const bf=d.brief_fidelity||{passed:false,missing:['prewrite_brief'],groups:{},counts:{}};const wordMin=Number(bf.counts&&bf.counts.minimum_useful_words||1200);document.getElementById('publicationStandard').innerHTML='<div>'+(Number(ps.words||0)>=wordMin?'✓':'✕')+' Useful words: <strong>'+esc(ps.words||0)+' / '+esc(wordMin)+'</strong></div><div>'+(ps.meta_policy_passed?'✓':'✕')+' SEO meta policy · title '+esc(ps.meta_title_length||0)+'/60 · description '+esc(ps.meta_description_length||0)+'/160 (required 140-160)</div><div>'+(ps.direct_answer?'✓':'✕')+' Direct Answer</div><div>'+(ps.tldr?'✓':'✕')+' TL;DR / Key Takeaways</div><div>'+(ps.table_of_contents?'✓':'✕')+' Linked Table of Contents</div><div>'+(ps.mobile_friendly_table?'✓':'✕')+' Mobile-friendly table</div><div>'+(Number(ps.h2_count||0)>=5?'✓':'✕')+' 5+ H2 sections ('+esc(ps.h2_count||0)+')</div>'+(kw.required?'<div style="margin-top:7px;padding-top:7px;border-top:1px solid #243858"><strong>Focus keyword:</strong> '+esc(kw.seed_keyword||'')+'<div>'+(kw.checks&&kw.checks.seo_title_exact?'✓':'✕')+' Exact in SEO title</div><div>'+(kw.checks&&kw.checks.meta_description_exact?'✓':'✕')+' Exact in meta description</div><div>'+(kw.checks&&kw.checks.slug_exact?'✓':'✕')+' Slug = exact seed keyword</div><div>'+(kw.checks&&kw.checks.first_10_percent_exact?'✓':'✕')+' Exact in first 10% of body</div><div>'+(kw.checks&&kw.checks.subheading_exact?'✓':'✕')+' Exact in H2/H3/H4</div><div>'+(kw.checks&&kw.checks.body_mentions_enough?'✓':'✕')+' Natural exact coverage: '+esc(kw.exact_body_mentions||0)+' / '+esc(kw.minimum_exact_body_mentions||0)+'</div><div>'+(kw.checks&&kw.checks.all_images_have_alt?'✓':'✕')+' Every uploaded image has alt text</div><div>'+(kw.checks&&kw.checks.one_descriptive_image_alt_has_exact_seed?'✓':'✕')+' One image alt contains exact seed + descriptive text'+(Number(kw.image_count||0)===0?' · optional, no image added':'')+'</div></div>':'')+'<div class="tiny" style="margin-top:8px">'+(ps.passed&&kw.passed?'SEO structure + seed-keyword policy ready ✓':'Final SEO HTML stays blocked until the deterministic content/seed-keyword requirements are present. Images remain optional; when images exist their alt metadata must be valid.')+'</div>';const bfBox=document.getElementById('briefFidelity'),bfRepair=document.getElementById('repairBriefFidelity');if(bfBox){const missing=Array.isArray(bf.missing)?bf.missing:[],groups=bf.groups||{},detail=missing.map(function(k){const vals=Array.isArray(groups[k])?groups[k]:[];return '<div style="margin-top:5px"><strong>'+esc(k.replace(/_/g,' '))+':</strong> '+esc(vals.slice(0,4).map(function(x){return typeof x==='string'?x:JSON.stringify(x)}).join(' · ')||'required')+'</div>';}).join('');bfBox.innerHTML='<div class="'+(bf.passed?'ok':'badText')+'"><strong>'+(bf.passed?'✓ Approved Brief fully executed':'✕ Approved Brief not fully executed')+'</strong></div><div class="tiny" style="margin-top:7px">'+(bf.passed?'All mandatory Brief contract groups are represented in the generated article.':'Missing contract groups: '+esc(missing.join(', ')||'unknown')+detail)+'</div>';if(bfRepair){const hard=missing.includes('evidence_research')||missing.includes('evidence_quality')||missing.includes('prewrite_brief');bfRepair.disabled=(!!bf.passed&&!!ps.passed&&!!kw.passed)||hard||!(d.prewrite_evidence&&d.prewrite_evidence.ai_complete&&d.prewrite_evidence.internal_destination_ready);bfRepair.textContent=(bf.passed&&ps.passed&&kw.passed)?'✓ Content requirements complete':(hard?'Repair unavailable · Brief research must be fixed':'Repair missing content requirements');}}const cr=d.content_requirements||null,crBox=document.getElementById('contentRequirements'),crBtn=document.getElementById('openRequirementsBrief');if(cr){const item=(label,val)=>'<div style="margin:5px 0"><strong>'+esc(label)+':</strong> '+esc(val==null||val===''?'not specified':val)+'</div>';crBox.innerHTML=item('Target words',cr.target_words||('minimum '+wordMin))+item('Planned H2s',cr.planned_h2s)+item('PAA / PAQ',cr.paa_count)+item('FAQs',cr.faq_count)+item('Statistics',Number(cr.stats_count||0)>0?cr.stats_count+' approved · '+Number(cr.stats_primary_verified||0)+' primary · '+Number(cr.stats_provenance_resolved||0)+' provenance-resolved':(cr.stats_research_status==='searched_no_verified_result'?'0 after sufficient verified research':(cr.evidence_research_complete?'0 approved after research':'research incomplete — regenerate Brief')))+item('Expert evidence',Number(cr.quotes_count||0)>0?cr.quotes_count+' exact quote(s)'+(Number(cr.expert_insights_count||0)>0?' · '+cr.expert_insights_count+' attributed insight(s)':''):(Number(cr.expert_insights_count||0)>0?cr.expert_insights_count+' verified attributed insight(s) · no fabricated quotes':(cr.quotes_research_status==='searched_no_verified_result'?'0 exact quotes after sufficient verified research':(cr.evidence_research_complete?'0 approved expert evidence':'research incomplete — regenerate Brief'))))+item('Evidence ladder',cr.evidence_quality_complete?'complete · '+Number(cr.evidence_approved_items||0)+' approved item(s)':'incomplete — regenerate Brief')+item('AI systems',Number(cr.ai_systems_checked||0)===5?'5/5 complete':Number(cr.ai_systems_checked||0)+'/5 · missing '+((cr.ai_systems_missing||[]).join(', ')||'unknown'))+item('Internal destination',cr.internal_selected_url||'required — choose a verified publisher page/homepage')+item('External source targets',cr.external_link_targets)+'<div class="tiny" style="margin-top:8px">These values come from Prewrite #'+esc(cr.brief_id)+'. Open the full Brief for exact requirements and evidence.</div>';crBtn.href='/network/prewrite/'+encodeURIComponent(cr.brief_id);crBtn.style.display='inline-flex'}else{crBox.innerHTML='<span class="badText">No linked Prewrite requirements yet.</span>';crBtn.style.display='none'};const pe=d.prewrite_evidence||null,peBox=document.getElementById('prewriteEvidence'),peBtn=document.getElementById('viewPrewrite');if(pe){peBox.innerHTML='<strong>Prewrite #'+esc(pe.id)+'</strong><div class="tiny">'+esc(pe.keyword||pe.working_title||'')+' · created '+esc(pe.created_at||'—')+' · competitors '+esc(pe.competitors_scraped||0)+'</div><div style="margin-top:8px;padding:8px;border:1px solid '+(pe.ai_complete?'#166534':'#991b1b')+';border-radius:8px;background:'+(pe.ai_complete?'#052e1633':'#2a0f1433')+'" class="'+(pe.ai_complete?'ok':'badText')+'"><strong>AI research: '+esc(pe.ai_systems_checked||0)+'/5 '+(pe.ai_complete?'complete':'INCOMPLETE')+'</strong>'+(pe.ai_complete?'':'<div class="tiny" style="margin-top:4px">Missing: '+esc((pe.ai_systems_missing||[]).join(', ')||'unknown')+'. Approval is blocked; existing research is preserved.</div>')+'</div><div style="margin-top:8px" class="'+(pe.internal_destination_ready?'ok':'badText')+'"><strong>Internal destination:</strong> '+(pe.internal_destination?esc(pe.internal_destination):'required for '+esc(pe.publisher_domain||'publisher domain'))+'</div><div class="tiny" style="margin-top:6px">Current hash: '+esc(pe.hash)+'</div><div class="tiny">Generation hash: '+esc(pe.generation_hash||'—')+'</div><div style="margin-top:6px" class="'+(pe.generation_match?'ok':'badText')+'">'+(pe.generation_match?'✓ Brief matches generation snapshot':'✕ Brief changed since generation')+'</div>';peBtn.href='/network/prewrite/'+encodeURIComponent(pe.id);peBtn.style.display='inline-block'}else{peBox.innerHTML='<span class="badText">Prewrite Brief required.</span><div class="tiny" style="margin-top:6px">This Publisher Edition must have a linked Prewrite Brief before the workflow is considered complete.</div>'}document.getElementById('publisher').textContent=p.publisher_brand||p.publisher_domain;document.getElementById('source').textContent='Source: '+(p.source_brand||p.source_domain||'—');document.getElementById('title').textContent=p.title;document.getElementById('status').textContent=p.quality_status+' · '+p.status;document.getElementById('metaTitle').innerHTML=esc(p.meta_title||'—')+'<div class="tiny '+(String(p.meta_title||'').length<=60?'ok':'badText')+'" style="margin-top:5px">'+String(p.meta_title||'').length+' / 60</div>';document.getElementById('metaDesc').innerHTML=esc(p.meta_description||'—')+'<div class="tiny '+(String(p.meta_description||'').length>=140&&String(p.meta_description||'').length<=160?'ok':'badText')+'" style="margin-top:5px">'+String(p.meta_description||'').length+' / 160'+(String(p.meta_description||'').length>=150&&String(p.meta_description||'').length<=159?' · ideal':' · target 140–160')+'</div>';document.getElementById('slug').textContent=p.suggested_slug||'—';const _expectedArticleUrl=expectedArticleUrl(p),_eu=document.getElementById('expectedArticleUrl');if(_eu)_eu.innerHTML=_expectedArticleUrl?'<a target="_blank" rel="noopener" href="'+esc(_expectedArticleUrl)+'">'+esc(_expectedArticleUrl)+'</a>':'<span class="tiny">Publisher domain or slug is not ready yet.</span>';document.getElementById('authorType').value=s.author_type;document.getElementById('authorName').value=s.author_name||'';document.getElementById('authorJob').value=s.author_job_title||'';document.getElementById('authorUrl').value=s.author_url||'';document.getElementById('authorBio').value=s.author_bio||'';document.getElementById('primary').value=s.primary_color;document.getElementById('accent').value=s.accent_color;document.getElementById('primaryHex').value=s.primary_color;document.getElementById('accentHex').value=s.accent_color;headings=d.h2_headings||[];document.getElementById('imageH2Number').innerHTML=h2Options('');document.getElementById('existingPlacement').innerHTML='<option value="featured">Featured — before article</option>'+headings.map(h=>'<option value="h2:'+h.number+'">Before H2 #'+h.number+' · '+esc(h.text)+'</option>').join('');const hasFeatured=(d.images||[]).some(x=>x.image_role==='featured'&&(x.status==='uploaded'||x.status==='approved'||x.status==='prompt_ready'));document.getElementById('imageRole').value=hasFeatured?'supporting':'featured';syncGeneratedImageSubject();const allImages=d.images||[],pendingImages=allImages.filter(x=>x.status!=='uploaded'&&x.status!=='approved'),placedImages=allImages.filter(x=>x.status==='uploaded'||x.status==='approved');const activeDraft=pendingImages.length?pendingImages[0]:null;currentPendingDraft=activeDraft||null;if(activeDraft){const m=String(activeDraft.placement_hint||'').match(/^before-h2-num:(\d+)$/);if(m){document.getElementById('imageH2Number').value=String(Number(m[1]));document.getElementById('imageRole').value='supporting';syncGeneratedImageSubject();}else if(String(activeDraft.image_role||'featured')==='featured'){document.getElementById('imageH2Number').value='';document.getElementById('imageRole').value='featured';syncGeneratedImageSubject();}}const visiblePlaced=placedImages;try{localStorage.removeItem('cs_network_dismissed_images_'+pid)}catch(_e){}document.getElementById('images').innerHTML=pendingImages.map(imgRow).join('')||'<div class="tiny" style="margin-top:10px">Ready for a new image.</div>';syncImageDraftView();document.getElementById('placedImages').innerHTML=visiblePlaced.map(placedImgRow).join('')||(placedImages.length?'<div class="tiny">All placed image cards are closed. The images remain in the article. Click Show all placed images to manage them again.</div>':'<div class="tiny">No images placed yet.</div>');const li=d.link_intelligence||{},fmt=a=>(a&&a.length)?a.map(u=>'<div style="margin:4px 0;word-break:break-all">'+esc(typeof u==='string'?u:(u&&u.final_url||u&&u.url||''))+'</div>').join(''):'<span class="tiny">None verified yet.</span>';const _internalAll=Array.from(new Set([].concat(li.publisher_internal_candidates||[]).map(function(v){return typeof v==='string'?v:(v&&v.url||'')}).filter(Boolean))),_selectedInternal=pe&&pe.internal_destination||'';document.getElementById('internalLinks').innerHTML='<div class="'+(_internalAll.length>=3?'ok':'badText')+'"><strong>'+(_internalAll.length>=3?'✓':'✕')+' Verified internal URLs: '+esc(_internalAll.length)+'/3</strong></div>'+(_selectedInternal?'<div class="tiny" style="margin-top:5px">Primary internal destination: '+esc(_selectedInternal)+'</div>':'')+(_internalAll.length?'<div class="tiny" style="margin-top:8px">Current verified candidate set:</div>'+fmt(_internalAll):'<div class="tiny" style="margin-top:6px">Use Discover & verify internal URLs. ContentScale checks sitemap first, then same-domain crawl.</div>');const intBtn=document.getElementById('discoverInternal');if(intBtn){const complete=_internalAll.length>=3;intBtn.disabled=complete;intBtn.classList.toggle('locked',complete);intBtn.textContent=complete?'✓ 3–5 internal URLs ready':'Discover & verify internal URLs';intBtn.title=complete?'Three or more current verified same-domain URLs are ready. Re-run discovery when the publisher changes URLs.':'Sitemap-first discovery, same-domain crawl fallback, live/indexable verification.'};const ext=(li.external_candidates||[]).map(function(x){const u=validHttpUrl(x&&x.final_url||x&&x.url);return u?Object.assign({},x,{_url:u}):null}).filter(Boolean),preExt=(li.prewrite_external||[]).map(validHttpUrl).filter(Boolean),verifiedExt=ext.filter(function(x){return x.status==='verified'&&Number(x.http_status)>=200&&Number(x.http_status)<400});document.getElementById('externalLinks').innerHTML=ext.length?ext.map(function(x){return '<div style="margin:7px 0"><strong class="'+(x.status==='verified'?'ok':'badText')+'">'+esc(x.status||'checked')+'</strong> · <a target="_blank" rel="noopener" href="'+esc(x._url)+'">'+esc(x._url)+'</a><div class="tiny">'+(Number.isFinite(Number(x.http_status))?'HTTP '+esc(x.http_status):'No valid HTTP response')+(x.title?' · '+esc(x.title):'')+(x.reason?' · '+esc(x.reason):'')+'</div></div>'}).join(''):(preExt.length?fmt(preExt):'<span class="tiny">No valid external source URLs are currently stored. Use Suggest & verify external sources only if the article needs additional authority links.</span>');const extBtn=document.getElementById('suggestExternal');if(extBtn){const complete=verifiedExt.length>=3;extBtn.disabled=complete;extBtn.classList.toggle('locked',complete);extBtn.textContent=complete?'✓ 3–5 external URLs ready':'Suggest & verify external URLs';extBtn.title=complete?'Three or more current live-verified external URLs are ready. Re-run when a source URL changes.':'Build and live-check a current shortlist of 3–5 strong external URLs.'};const pv=document.getElementById('preview');pv.innerHTML=p.rendered_html||p.html||'<p>No HTML.</p>';const articleRoot=pv.querySelector('.cs-network-content')||pv;const featuredDrop=document.createElement('div');featuredDrop.className='cs-image-drop-zone';featuredDrop.dataset.dropKind='featured';articleRoot.insertBefore(featuredDrop,articleRoot.firstChild);Array.from(pv.querySelectorAll('h2')).forEach((h,i)=>{const n=i+1,g=document.createElement('div');g.className='cs-h2-guide';g.textContent='H2 #'+n;const dz=document.createElement('div');dz.className='cs-image-drop-zone';dz.dataset.dropH2=String(n);h.parentNode.insertBefore(g,h);h.parentNode.insertBefore(dz,h)});linkedPrewriteBriefId=Number(d.current_prewrite_brief_id||0);renderPrewriteAction(d.prewrite_evidence);renderAiCheck(d.prewrite_evidence);const regenBtn=document.getElementById('regenerateArticle'),need=!!(d.prewrite_evidence&&(d.prewrite_evidence.requires_regeneration||!(d.brief_fidelity&&d.brief_fidelity.passed)));if(regenBtn){const integrityReady=!!(d.prewrite_evidence&&d.prewrite_evidence.ai_complete&&d.prewrite_evidence.internal_destination_ready);regenBtn.disabled=!integrityReady;regenBtn.textContent=!d.prewrite_evidence?'Regenerate · Prewrite required':(!d.prewrite_evidence.ai_complete?'Regenerate · AI research incomplete':(!d.prewrite_evidence.internal_destination_ready?'Regenerate · internal URL required':(need?'Repair / regenerate from Approved Brief':'Regenerate article')));regenBtn.title=!integrityReady?'Complete 5/5 AI evidence and the publisher-domain internal destination first. Existing research is preserved.':(need?'Required because the current article does not fully execute the Approved Brief':'Deliberately regenerate this Publisher Edition from the current linked Brief')}renderOfficial(d.internal_content,d.prewrite_evidence,allImages,d.brief_fidelity,d.publication_standard);renderAuthoritativeReadiness(d);renderPublishVerify(d);const _deliveryReady=!!(d.readiness?d.readiness.delivery_ready:(d.quality_gate&&d.quality_gate.delivery_ready)),_finalReady=!!(d.readiness?d.readiness.final_ready:(d.quality_gate&&d.quality_gate.final_ready)),_scanCurrent=!!(d.readiness?d.readiness.official_scan_current:(d.internal_content&&d.internal_content.official_scan&&!d.internal_content.official_scan.stale)),_preComplete=!!(d.readiness?d.readiness.research_ready:(d.prewrite_evidence&&d.prewrite_evidence.ai_complete&&d.prewrite_evidence.internal_destination_ready&&d.prewrite_evidence.generation_match&&!d.prewrite_evidence.requires_regeneration));document.getElementById('copySeoHtml').disabled=!_deliveryReady;document.getElementById('copySnippet').disabled=!_deliveryReady;const _create=document.getElementById('createInternalUrl');if(_create){const done=!!(d.internal_content&&d.internal_content.url);_create.disabled=true;_create.classList.toggle('locked',true);_create.textContent=done?'✓ Internal live URL current':'Internal live URL · handled by Refresh all'}const _scan=document.getElementById('runOfficialScan');if(_scan){_scan.disabled=true;_scan.classList.add('locked');_scan.textContent=_scanCurrent?'✓ ContentScore current':'ContentScore · handled by Refresh all'}const _refresh=document.getElementById('refreshAllContent');if(_refresh){_refresh.disabled=_finalReady;_refresh.classList.toggle('locked',_finalReady);_refresh.textContent=_finalReady?'✓ Current content verified':'Refresh all & verify'}const _pb=document.getElementById('prewriteStepBtn');if(_pb&&_preComplete){_pb.disabled=true;_pb.classList.add('locked');_pb.textContent='✓ Prewrite complete';_pb.title='Use View full brief to inspect it. If the Brief changes, this workflow will automatically reopen the dependent step.'}if(regenBtn){regenBtn.disabled=true;regenBtn.classList.add('locked');regenBtn.textContent=(!need&&_preComplete)?'✓ Article matches approved Brief':'Article generation · handled by Refresh all';regenBtn.title='Refresh all & verify is the single controlled regeneration/repair path.'}applySingleNextAction(d)}document.getElementById('discoverInternal').onclick=async function(){const b=this;if(b.disabled)return;busy(b,true,'Discovering internal URLs…');try{const d=await api('/api/network/admin/publications/'+pid+'/links/discover-internal',{method:'POST',body:'{}'});b.textContent='✓ Verified '+Number(d.count||0)+'/3';lastGuidedAction='';await load();const card=document.getElementById('linkIntelligenceCard');if(card)card.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){alert(e.message)}finally{if(b.classList.contains('locked'))b.classList.remove('busy');else busy(b,false)}};document.getElementById('saveManualInternal').onclick=async function(){const b=this,u=document.getElementById('manualInternalUrl').value.trim(),a=document.getElementById('manualInternalAnchor').value.trim(),st=document.getElementById('manualInternalStatus');if(!u){st.textContent='Enter the exact publisher-domain URL first.';return;}busy(b,true,'Verifying…');try{const x=await api('/api/network/admin/publications/'+pid+'/internal-link',{method:'POST',body:JSON.stringify({url:u,anchor_text:a})});await api('/api/network/admin/publications/'+pid+'/links/revalidate',{method:'POST',body:'{}'});st.className='tiny ok';st.textContent='✓ Verified internal URL added and the full current link set rechecked.';document.getElementById('manualInternalUrl').value='';document.getElementById('manualInternalAnchor').value='';lastGuidedAction='';await load()}catch(e){st.className='tiny badText';st.textContent='✕ '+e.message}finally{busy(b,false,'Add verified internal URL')}};document.getElementById('saveManualExternal').onclick=async function(){const b=this,u=document.getElementById('manualExternalUrl').value.trim(),st=document.getElementById('manualExternalStatus');if(!u){st.textContent='Enter the exact external source URL first.';return;}busy(b,true,'Verifying…');try{const x=await api('/api/network/admin/publications/'+pid+'/external-link',{method:'POST',body:JSON.stringify({url:u})});await api('/api/network/admin/publications/'+pid+'/links/revalidate',{method:'POST',body:'{}'});st.className='tiny ok';st.textContent='✓ External URL verified, added, and the full current link set rechecked.';document.getElementById('manualExternalUrl').value='';lastGuidedAction='';await load()}catch(e){st.className='tiny badText';st.textContent='✕ '+e.message}finally{busy(b,false,'Add & verify external URL')}};function syncHex(colorId,hexId){const c=document.getElementById(colorId),h=document.getElementById(hexId);c.addEventListener('input',()=>h.value=c.value);h.addEventListener('input',()=>{const v=String(h.value||'').trim();if(/^#[0-9a-f]{6}$/i.test(v))c.value=v})}syncHex('primary','primaryHex');syncHex('accent','accentHex');document.getElementById('imageRole').addEventListener('change',function(){if(this.value==='featured')document.getElementById('imageH2Number').value='';syncGeneratedImageSubject();syncImageDraftView();});document.getElementById('imageH2Number').addEventListener('change',function(){if(this.value)document.getElementById('imageRole').value='supporting';syncGeneratedImageSubject();syncImageDraftView();});const existingFile=document.getElementById('existingFile'),existingName=document.getElementById('existingName'),existingAlt=document.getElementById('existingAlt'),existingCaption=document.getElementById('existingCaption'),existingFilename=document.getElementById('existingFilename'),existingLookupStatus=document.getElementById('existingLookupStatus');async function lookupExistingMeta(raw){const key=String(raw||'').replace(/\.(jpe?g|png|webp)$/i,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase();if(!key)return;const f=existingFile.files&&existingFile.files[0];existingLookupStatus.textContent='Checking saved metadata…';existingLookupStatus.style.color='#9fb7df';try{const d=await api('/api/network/admin/publications/'+pid+'/images/resolve-existing-metadata',{method:'POST',body:JSON.stringify({name:key,original_filename:f?f.name:''})});if(d.image){const x=d.image;existingName.value=x.image_name||key;existingAlt.value=x.alt_text||'';existingCaption.value=x.caption||'';existingFilename.value=x.suggested_filename||((key||'image')+'.jpg');existingLookupStatus.textContent=d.reused?'✓ Existing SEO metadata found — fields filled automatically':'✓ SEO metadata created from the image name — review it, then add the image';existingLookupStatus.style.color='#86efac'}else{throw Error('No metadata returned')}}catch(e){if(!existingName.value)existingName.value=key;if(!existingFilename.value)existingFilename.value=key+((f&&f.name.match(/\.(jpe?g|png|webp)$/i)||['.jpg'])[0].toLowerCase());existingLookupStatus.textContent='Metadata generation unavailable: '+e.message;existingLookupStatus.style.color='#fca5a5'}}existingFile.addEventListener('change',function(){const f=this.files&&this.files[0];if(!f)return;const stem=f.name.replace(/\.(jpe?g|png|webp)$/i,'');existingName.value=stem;existingFilename.value=f.name.toLowerCase().replace(/[^a-z0-9.]+/g,'-');lookupExistingMeta(stem)});existingName.addEventListener('blur',function(){if(this.value.trim())lookupExistingMeta(this.value.trim())});document.getElementById('existingImageForm').addEventListener('submit',async function(e){e.preventDefault();const b=document.getElementById('uploadExisting'),f=existingFile.files&&existingFile.files[0];if(!f)return alert('Choose an existing image file.');if(!existingName.value.trim()||!existingAlt.value.trim()||!existingCaption.value.trim()||!existingFilename.value.trim())return alert('Image name, alt text, caption and SEO filename are required.');const choice=document.getElementById('existingPlacement').value||'featured',fd=new FormData();fd.append('image',f);fd.append('image_name',existingName.value.trim());fd.append('alt_text',existingAlt.value.trim());fd.append('caption',existingCaption.value.trim());fd.append('suggested_filename',existingFilename.value.trim());fd.append('image_role',choice==='featured'?'featured':'supporting');fd.append('h2_number',choice.startsWith('h2:')?choice.slice(3):'0');busy(b,true,'Adding image…');try{const r=await fetch('/api/network/admin/publications/'+pid+'/images/existing-upload',{method:'POST',headers:{'x-admin-key':key},body:fd}),t=await r.text();let d={};try{d=JSON.parse(t)}catch(_e){}if(!r.ok)throw Error(d.error||'Upload failed');b.textContent=d.reused_metadata?'✓ Added · metadata reused':'✓ Added · metadata saved';this.reset();existingName.value='';existingAlt.value='';existingCaption.value='';existingFilename.value='';existingLookupStatus.textContent='';lastGuidedAction='';await load()}catch(err){alert(err.message)}finally{busy(b,false)}});document.getElementById('showPlacedImages').onclick=async function(){this.textContent='Refreshing…';await load();setTimeout(()=>{this.textContent='Show all placed images'},800)};document.getElementById('regenerateArticle').onclick=async function(){if(!confirm('Regenerate this Publisher Edition from the current saved Prewrite Brief? ContentScale will first lock the exact current Brief snapshot, then regenerate from that snapshot. Existing research is not rerun. This replaces article HTML/meta/schema, preserves author/style settings, and invalidates old live proof/ContentScore.'))return;const b=this;showPublisherGenerationError(null);busy(b,true,'Approving current Brief…');try{const pe=lastPackage&&lastPackage.prewrite_evidence||{};if(!pe.id)throw Error('Linked Prewrite Brief is required before regeneration.');const ap=await api('/api/network/admin/placements/'+pid+'/approve-prewrite',{method:'POST',body:JSON.stringify({brief_id:pe.id})});const aid=Number(ap&&ap.approval&&ap.approval.id||0);if(!aid)throw Error('Brief approval returned no approval snapshot ID.');b.textContent='Regenerating…';await api('/api/network/admin/placements/'+pid+'/generate',{method:'POST',body:JSON.stringify({approval_id:aid,force_regenerate:true})});b.textContent='✓ Regenerated';showPublisherGenerationError(null);await load();const next=document.querySelector('.workflowCard[data-stage="4"]');if(next)next.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){showPublisherGenerationError(e,'Publisher Edition regeneration failed')}finally{busy(b,false)}};
document.getElementById('repairBriefFidelity').onclick=async function(){const b=this,s=document.getElementById('repairBriefFidelityStatus');if(!confirm('Repair only the missing Approved Brief requirements in the current Publisher Edition? Existing good content is preserved. This does not rerun SERP, competitors, PAA or evidence research.'))return;busy(b,true,'Repairing missing requirements…');s.className='tiny';s.textContent='Repairing only the missing Brief contract groups from the immutable approved snapshot…';try{const d=await api('/api/network/admin/publications/'+pid+'/repair-brief-fidelity',{method:'POST',body:'{}'});s.className='tiny ok';s.textContent='✓ '+(d.message||'Approved Brief fidelity repaired.')+(d.repair_calls!=null?' · '+d.repair_calls+' targeted repair call(s)':'');await load();document.getElementById('briefFidelity').scrollIntoView({behavior:'smooth',block:'center'})}catch(e){s.className='tiny badText';s.textContent='✕ '+e.message}finally{busy(b,false,'Repair missing content requirements')}};
document.getElementById('saveSettings').onclick=async function(){const b=this;busy(b,true,'Saving…');try{await api('/api/network/admin/publications/'+pid+'/settings',{method:'PATCH',body:JSON.stringify({author_type:authorType.value,author_name:authorName.value,author_job_title:authorJob.value,author_url:authorUrl.value,author_bio:authorBio.value,primary_color:primaryHex.value||primary.value,accent_color:accentHex.value||accent.value,image_mode:'prompt_only'})});b.textContent='✓ Saved';lastGuidedAction='';await load()}catch(e){alert(e.message)}finally{busy(b,false)}};document.getElementById('prepareImage').onclick=async function(){const h2Number=Number((document.getElementById('imageH2Number')||{}).value||0)||0,role=h2Number>0?'supporting':imageRole.value,status=document.getElementById('imageActionStatus');if(role==='supporting'&&!h2Number){if(status){status.textContent='Choose an H2 first.';status.style.color='#fca5a5'}return alert('Choose the H2 where this supporting image will be placed. The H2 controls its subject and prompt.')}const b=this;busy(b,true,'Building H2-locked prompt…');if(status){status.textContent='Building prompt from the exact H2 and Approved Brief purpose…';status.style.color='#9fb7df'}try{const out=await api('/api/network/admin/publications/'+pid+'/images/prepare',{method:'POST',body:JSON.stringify({image_role:role,h2_number:h2Number})});document.getElementById('imageH2Number').value='';if(status){status.textContent='✓ Prompt locked to '+(out.h2_title||out.image&&out.image.image_name||'article')+(out.diversity_lock?' · distinct composition: '+out.diversity_lock:'')+'.';status.style.color='#86efac'}b.textContent='✓ Ready';await load()}catch(e){if(status){status.textContent='✕ '+e.message;status.style.color='#fca5a5'}alert(e.message)}finally{busy(b,false)}};async function handleImageClick(e){const removePlaced=e.target.closest('[data-delete-placed]');if(removePlaced){const id=String(removePlaced.dataset.deletePlaced||'');if(!id)return;if(!confirm('Delete this image from the article?\\n\\nThe image placement is removed immediately. Its saved SEO metadata stays in the image library for later reuse.'))return;busy(removePlaced,true,'×');try{await api('/api/network/admin/publications/'+pid+'/images/'+id,{method:'DELETE'});lastGuidedAction='';await load()}catch(err){alert('Image delete failed: '+err.message)}finally{busy(removePlaced,false)}return}const fn=e.target.closest('[data-copy-filename]');if(fn){await copyText(fn.dataset.filename||'');fn.textContent='✓ Copied';setTimeout(()=>fn.textContent='Copy filename',1200);return}const c=e.target.closest('[data-copy]');if(c){const row=c.closest('.imgrow'),box=row&&row.querySelector('[data-prompt-text]');if(!box)return alert('Prompt not found. Regenerate the H2 prompt first.');await copyText(box.textContent);c.textContent='✓ Copied';setTimeout(()=>c.textContent='Copy prompt',1200);return}const md=e.target.closest('[data-meta]');if(md){const id=md.dataset.meta;busy(md,true,'Refreshing from placement…');try{await api('/api/network/admin/publications/'+pid+'/images/'+id+'/metadata',{method:'PATCH',body:'{}'});md.textContent='✓ Updated';await load()}catch(err){alert(err.message)}finally{busy(md,false)}return}const mv=e.target.closest('[data-move]');if(mv){const id=mv.dataset.move,choice=(document.querySelector('[data-move-placement="'+id+'"]')||{}).value||'';if(!choice)return alert('Choose an image placement.');const role=choice==='featured'?'featured':'supporting',h2Number=choice.startsWith('h2:')?Number(choice.slice(3))||0:0;busy(mv,true,'Moving…');try{const moved=await api('/api/network/admin/publications/'+pid+'/images/'+id+'/placement',{method:'PATCH',body:JSON.stringify({image_role:role,h2_number:h2Number})});if(moved&&moved.image&&moved.image.status==='prompt_ready'){mv.textContent='Refreshing metadata…';await api('/api/network/admin/publications/'+pid+'/images/'+id+'/metadata',{method:'PATCH',body:'{}'})}mv.textContent='✓ Moved + synced';lastGuidedAction='';await load()}catch(err){alert(err.message)}finally{busy(mv,false)}return}const d=e.target.closest('[data-del]');if(d&&confirm('Delete this unused image draft? This removes only the draft. Uploaded images have their own × delete control.')){busy(d,true,'Removing…');try{await api('/api/network/admin/publications/'+pid+'/images/'+d.dataset.del,{method:'DELETE'});await load();const pv=document.getElementById('preview');if(pv)pv.scrollIntoView({behavior:'smooth',block:'nearest'})}catch(err){alert(err.message)}finally{busy(d,false)}}}document.getElementById('images').addEventListener('click',handleImageClick);document.getElementById('placedImages').addEventListener('click',handleImageClick);document.getElementById('images').addEventListener('submit',async e=>{const f=e.target.closest('form[data-upload]');if(!f)return;e.preventDefault();const b=f.querySelector('button'),note=f.querySelector('.upload-note'),fd=new FormData(f);if(note)note.textContent='';busy(b,true,'Uploading…');try{const r=await fetch('/api/network/admin/publications/'+pid+'/images/'+f.dataset.upload+'/upload',{method:'POST',headers:{'x-admin-key':key},body:fd}),t=await r.text();let d={};try{d=JSON.parse(t)}catch(_e){}if(!r.ok)throw Error(d.error||'Upload failed');if(note){note.textContent='✓ Upload saved. Updating article preview…';note.style.color='#86efac'}b.textContent='✓ Uploaded';await load();const fresh=document.querySelector('form[data-upload="'+f.dataset.upload+'"] .upload-note');if(fresh){fresh.textContent='✓ Image placed.';fresh.style.color='#86efac'}document.getElementById('preview').scrollIntoView({behavior:'smooth',block:'start'})}catch(err){if(note){note.textContent='✕ '+err.message;note.style.color='#fca5a5'}alert(err.message)}finally{busy(b,false)}});document.getElementById('suggestExternal').onclick=async function(){const b=this;if(b.disabled)return;busy(b,true,'Checking sources…');try{const d=await api('/api/network/admin/publications/'+pid+'/links/suggest-external',{method:'POST',body:'{}'});b.textContent='✓ Verified '+(d.verified_shortlist||[]).length+'/3';await load();const card=document.getElementById('linkIntelligenceCard');if(card)card.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){alert(e.message)}finally{if(b.classList.contains('locked'))b.classList.remove('busy');else busy(b,false)}};let draggedImageId=null,selectedImageId=null;const placedBox=document.getElementById('placedImages');function clearDragState(){document.querySelectorAll('.placed-image.dragging').forEach(c=>c.classList.remove('dragging'));document.querySelectorAll('.drag-handle.selected').forEach(c=>c.classList.remove('selected'));document.querySelectorAll('.cs-image-drop-zone.drag-over').forEach(z=>z.classList.remove('drag-over'));draggedImageId=null}placedBox.addEventListener('dragstart',e=>{const handle=e.target.closest('[data-drag-handle]');if(!handle)return;const card=handle.closest('[data-drag-image]');draggedImageId=String(handle.dataset.dragHandle||'');selectedImageId=draggedImageId;if(card)card.classList.add('dragging');handle.classList.add('selected');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedImageId);try{e.dataTransfer.setDragImage(card||handle,40,30)}catch(_e){}}});placedBox.addEventListener('dragend',()=>{clearDragState()});placedBox.addEventListener('click',e=>{const handle=e.target.closest('[data-drag-handle]');if(!handle)return;selectedImageId=String(handle.dataset.dragHandle||'');document.querySelectorAll('.drag-handle.selected').forEach(h=>h.classList.toggle('selected',h===handle));document.querySelectorAll('.cs-image-drop-zone').forEach(z=>z.classList.add('drag-over'))});const protectedPreview=document.getElementById('preview');protectedPreview.addEventListener('dragenter',e=>{if(!draggedImageId)return;const z=e.target.closest('.cs-image-drop-zone');if(z){e.preventDefault();z.classList.add('drag-over')}});protectedPreview.addEventListener('dragover',e=>{if(!draggedImageId)return;const z=e.target.closest('.cs-image-drop-zone');if(!z)return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';document.querySelectorAll('.cs-image-drop-zone.drag-over').forEach(n=>{if(n!==z)n.classList.remove('drag-over')});z.classList.add('drag-over');const r=protectedPreview.getBoundingClientRect();if(e.clientY<r.top+70)protectedPreview.scrollTop-=18;else if(e.clientY>r.bottom-70)protectedPreview.scrollTop+=18});protectedPreview.addEventListener('dragleave',e=>{const z=e.target.closest('.cs-image-drop-zone');if(z&&!z.contains(e.relatedTarget))z.classList.remove('drag-over')});async function placeDraggedImage(z,id){if(!z||!id)return;const featured=z.dataset.dropKind==='featured',h2Number=featured?0:Number(z.dataset.dropH2||0);const original=z.textContent;z.textContent='Moving image…';try{const moved=await api('/api/network/admin/publications/'+pid+'/images/'+id+'/placement',{method:'PATCH',body:JSON.stringify({image_role:featured?'featured':'supporting',h2_number:h2Number})});if(moved&&moved.image&&moved.image.status==='prompt_ready')await api('/api/network/admin/publications/'+pid+'/images/'+id+'/metadata',{method:'PATCH',body:'{}'});selectedImageId=null;lastGuidedAction='';await load()}catch(err){alert(err.message);await load()}finally{draggedImageId=null;if(z&&z.isConnected)z.textContent=original||''}}protectedPreview.addEventListener('drop',async e=>{const z=e.target.closest('.cs-image-drop-zone');if(!z)return;e.preventDefault();const id=draggedImageId||(e.dataTransfer&&e.dataTransfer.getData('text/plain'))||selectedImageId;if(!id)return;await placeDraggedImage(z,id)});protectedPreview.addEventListener('click',async e=>{const z=e.target.closest('.cs-image-drop-zone');if(!z||!selectedImageId)return;e.preventDefault();await placeDraggedImage(z,selectedImageId)});['copy','cut','contextmenu','selectstart'].forEach(ev=>protectedPreview.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation()}));protectedPreview.addEventListener('keydown',e=>{const k=String(e.key||'').toLowerCase();if((e.ctrlKey||e.metaKey)&&['a','c','x','s','p'].includes(k)){e.preventDefault();e.stopPropagation()}});protectedPreview.addEventListener('mousedown',e=>{if(e.detail>1)e.preventDefault()});const aiCheckEngine=document.getElementById('aiCheckEngine'),aiCheckAnswer=document.getElementById('aiCheckAnswer');aiCheckLoadDraft();aiCheckEngine.addEventListener('change',function(){aiCheckPersist();let d={answers:{}};try{d=JSON.parse(localStorage.getItem(aiCheckStoreKey)||'null')||d}catch(_e){}if(!d.answers)d.answers={};aiCheckAnswer.value=d.answers[this.value]||'';document.getElementById('aiCheckStatus').className='aiCheckStatus';document.getElementById('aiCheckStatus').textContent='No answer analysed yet for '+this.options[this.selectedIndex].text+'.'});aiCheckAnswer.addEventListener('input',aiCheckPersist);document.getElementById('copyAiCheckPrompt').onclick=async function(){const b=this;if(!aiCheckKeyword)return;busy(b,true,'Copying…');try{await copyText(document.getElementById('aiCheckPrompt').value);b.textContent='✓ Copied';setTimeout(()=>{b.textContent='Copy prompt'},1200)}catch(e){alert(e.message)}finally{b.disabled=!aiCheckKeyword;b.classList.remove('busy')}};document.getElementById('analyseAiCheck').onclick=analyseAiCheck;document.getElementById('clearAiCheck').onclick=function(){aiCheckAnswer.value='';aiCheckPersist();const s=document.getElementById('aiCheckStatus');s.className='aiCheckStatus';s.textContent='Cleared for '+aiCheckEngine.options[aiCheckEngine.selectedIndex].text+'.'};
const prewriteOverlay=document.getElementById('prewriteEmbedOverlay'),prewriteFrame=document.getElementById('prewriteEmbedFrame'),prewriteWorkspace=document.getElementById('prewriteWorkspace'),prewriteAiPane=document.getElementById('prewriteAiPane'),aiAnswerCheckCard=document.getElementById('aiAnswerCheckCard'),aiAnswerCheckHome=aiAnswerCheckCard?aiAnswerCheckCard.parentNode:null,aiAnswerCheckAnchor=aiAnswerCheckCard?document.createComment('ai-answer-check-home'):null;if(aiAnswerCheckCard&&aiAnswerCheckHome)aiAnswerCheckHome.insertBefore(aiAnswerCheckAnchor,aiAnswerCheckCard);
function restoreAiAnswerCheck(){if(aiAnswerCheckCard&&aiAnswerCheckAnchor&&aiAnswerCheckAnchor.parentNode&&aiAnswerCheckCard.parentNode!==aiAnswerCheckAnchor.parentNode)aiAnswerCheckAnchor.parentNode.insertBefore(aiAnswerCheckCard,aiAnswerCheckAnchor.nextSibling)}
function setPrewriteView(view){const preBtn=document.getElementById('viewPrewriteOnly'),aiBtn=document.getElementById('viewAiCheckOnly'),splitBtn=document.getElementById('viewPrewriteSplit');[preBtn,aiBtn,splitBtn].forEach(x=>x&&x.classList.remove('active'));prewriteWorkspace.classList.remove('split');if(view==='prewrite'){restoreAiAnswerCheck();prewriteFrame.style.display='block';prewriteAiPane.style.display='none';if(preBtn)preBtn.classList.add('active')}else if(view==='ai'){if(aiAnswerCheckCard)prewriteAiPane.appendChild(aiAnswerCheckCard);prewriteFrame.style.display='none';prewriteAiPane.style.display='block';if(aiBtn)aiBtn.classList.add('active')}else{if(aiAnswerCheckCard)prewriteAiPane.appendChild(aiAnswerCheckCard);prewriteWorkspace.classList.add('split');prewriteFrame.style.display='block';prewriteAiPane.style.display='block';if(splitBtn)splitBtn.classList.add('active')}try{localStorage.setItem('cs_network_prewrite_view_'+pid,view)}catch(_e){}}
async function openPrewriteEmbed(){const b=document.getElementById('prewriteStepBtn');busy(b,true,'Opening Prewrite…');try{const d=await api('/api/network/admin/publications/'+pid+'/prewrite-workspace',{method:'POST',body:'{}'});prewriteFrame.src=d.url;prewriteOverlay.style.display='block';let saved='split';try{saved=localStorage.getItem('cs_network_prewrite_view_'+pid)||'split'}catch(_e){}if(saved==='seo')saved='split';setPrewriteView(saved)}catch(e){alert(e.message)}finally{busy(b,false)}}
document.getElementById('prewriteStepBtn').onclick=openPrewriteEmbed;
document.getElementById('viewPrewriteOnly').onclick=function(){setPrewriteView('prewrite')};
document.getElementById('viewAiCheckOnly').onclick=function(){setPrewriteView('ai')};
document.getElementById('viewPrewriteSplit').onclick=function(){setPrewriteView('split')};
document.getElementById('closePrewriteEmbed').onclick=function(){restoreAiAnswerCheck();prewriteOverlay.style.display='none';prewriteFrame.src='about:blank';load()};
window.addEventListener('message',function(e){if(e.origin!==window.location.origin||!e.data)return;if(Number(e.data.placement_id)!==Number(pid))return;if(e.data.type==='network-prewrite-state'){renderAiCheck({keyword:String(e.data.keyword||''),working_title:String(e.data.working_title||''),id:Number(e.data.brief_id||0)});return}if(e.data.type==='network-prewrite-linked'){linkedPrewriteBriefId=Number(e.data.brief_id||linkedPrewriteBriefId||0);document.getElementById('prewriteStepHint').textContent='✓ Prewrite linked. New AI evidence can now be saved persistently to this Brief.';load();return}if(e.data.type==='network-publisher-edition-ready'){restoreAiAnswerCheck();prewriteOverlay.style.display='none';prewriteFrame.src='about:blank';lastGuidedAction='';load();return}});
document.getElementById('reopenForEditing').onclick=async function(){const b=this,s=document.getElementById('refreshAllStatus');if(!confirm('Reopen this live Publisher Edition for editing? The existing live URL, review history and any already-earned credit history are preserved, but the current live verification becomes historical and must be re-verified after the updated HTML is republished.'))return;busy(b,true,'Reopening…');s.className='metaBox';s.innerHTML='<strong>Reopening Publisher Edition for editing…</strong><div class="tiny">Live history is preserved. Only the current verification state is reopened.</div>';try{const x=await api('/api/network/admin/placements/'+pid+'/reopen-editing',{method:'POST',body:'{}'});s.className='metaBox ok';s.innerHTML='<strong>✓ Reopened for editing</strong><div class="tiny" style="margin-top:6px">Previous live URL: '+esc(x.previous_url||'—')+'. Previous verification remains in history. Refresh all & verify is now the next action.</div>';lastGuidedAction='';await load()}catch(e){s.className='metaBox badText';s.innerHTML='<strong>✕ Could not reopen for editing</strong><div class="tiny" style="margin-top:6px">'+esc(e.message)+'</div>'}finally{busy(b,false,'Reopen for editing')}};
document.getElementById('refreshAllContent').onclick=async function(){const b=this,s=document.getElementById('refreshAllStatus');showPublisherGenerationError(null);busy(b,true,'Refreshing all…');s.className='metaBox';s.innerHTML='<strong>1/6 Re-reading current Brief and content…</strong><div class="tiny">No new SERP, competitor, PAA or evidence research.</div>';try{let d=await api('/api/network/admin/publications/'+pid+'/package');lastPackage=d;let pe=d.prewrite_evidence||{};if(!pe.id)throw Error('Linked Prewrite Brief is required.');if(!pe.ai_complete)throw Error('Research incomplete: '+Number(pe.ai_systems_checked||0)+'/5 AI systems. Missing: '+((pe.ai_systems_missing||[]).join(', ')||'unknown')+'.');if(!pe.internal_destination_ready)throw Error('Internal destination is not ready for '+(pe.publisher_domain||'publisher domain')+'.');s.innerHTML='<strong>2/6 Revalidating all 3 + 3 link URLs…</strong><div class="tiny">Dead or changed URLs stop counting immediately; no research is rerun.</div>';const lr=await api('/api/network/admin/publications/'+pid+'/links/revalidate',{method:'POST',body:'{}'});if(Number(lr.internal_count||0)<3)throw Error('Internal link set is '+Number(lr.internal_count||0)+'/3 after live revalidation. Use Discover & verify internal URLs or the manual verified fallback.');if(Number(lr.external_count||0)<3)throw Error('External link set is '+Number(lr.external_count||0)+'/3 after live revalidation. Use Suggest & verify external URLs or the manual verified fallback.');d=await api('/api/network/admin/publications/'+pid+'/package');lastPackage=d;pe=d.prewrite_evidence||{};let repairApprovalId=0;if(pe.requires_regeneration){s.innerHTML='<strong>3/6 Re-locking the current Brief for surgical repair…</strong><div class="tiny">No full article regeneration. Existing research and valid content are preserved; only changed contract/link items are repaired.</div>';const ap=await api('/api/network/admin/placements/'+pid+'/approve-prewrite',{method:'POST',body:JSON.stringify({brief_id:pe.id})});repairApprovalId=Number(ap&&ap.approval&&ap.approval.id||0);if(!repairApprovalId)throw Error('Current Brief approval returned no approval snapshot ID.');}else{s.innerHTML='<strong>3/6 Current generation snapshot matches the Brief ✓</strong><div class="tiny">No full article regeneration was needed.</div>';}s.innerHTML='<strong>4/6 Applying the current 3 + 3 link set and verifying content…</strong><div class="tiny">Link-only gaps are repaired deterministically from the verified candidate set; no Gemini generation call is used for 3 + 3 coverage.</div>';try{await api('/api/network/admin/publications/'+pid+'/repair-brief-fidelity',{method:'POST',body:JSON.stringify(repairApprovalId?{approval_id:repairApprovalId}:{})})}catch(e){if(!/already passes/i.test(String(e.message||'')))throw e}d=await api('/api/network/admin/publications/'+pid+'/package');lastPackage=d;if(!(d.quality_gate&&d.quality_gate.delivery_ready))throw Error('Content is not delivery-ready after refresh. Check the visible Publication Standard / Brief Fidelity items above.');s.innerHTML='<strong>5/6 Rebuilding the stable internal test URL…</strong><div class="tiny">Same URL is reused; images remain optional.</div>';await api('/api/network/admin/publications/'+pid+'/internal-live',{method:'POST',body:'{}'});s.innerHTML='<strong>6/6 Running current ContentScore…</strong><div class="tiny">Scanning the exact refreshed HTML.</div>';const sc=await api('/api/network/admin/publications/'+pid+'/run-official-contentscore',{method:'POST',body:'{}'});s.className='metaBox ok';s.innerHTML='<strong>✓ Refresh all complete · ContentScore '+esc(sc.official_contentscore&&sc.official_contentscore.score||'—')+'/100</strong><div class="tiny" style="margin-top:6px">5/5 AI research, Publication Link Policy, Approved Brief fidelity, Publication Standard and the current stable internal URL were rechecked. Images were not required and did not block anything.</div>';showPublisherGenerationError(null);await load();document.getElementById('readyDetail').scrollIntoView({behavior:'smooth',block:'center'})}catch(e){s.className='metaBox badText';s.innerHTML='<strong>✕ Refresh stopped at the real blocker</strong><div class="tiny" style="margin-top:6px">'+esc(e.message)+'</div><div class="tiny" style="margin-top:4px">Nothing was hidden or faked. Existing research/content remains preserved.</div>';if(e&&e.payload)showPublisherGenerationError(e,'Refresh all / generation failed');await load()}finally{busy(b,false,'Refresh all & verify')}};
document.getElementById('createInternalUrl').onclick=async function(){const b=this,s=document.getElementById('officialScanStatus');busy(b,true,'Building URL…');s.textContent='Building the exact current package as a live internal URL…';try{await api('/api/network/admin/publications/'+pid+'/internal-live',{method:'POST',body:'{}'});s.className='tiny scanFresh';s.textContent='✓ Internal live URL ready.';await load()}catch(e){s.className='tiny badText';s.textContent='✕ '+e.message}finally{busy(b,false)}};
document.getElementById('runOfficialScan').onclick=async function(){const b=this,s=document.getElementById('officialScanStatus');busy(b,true,'Scanning…');s.className='tiny';s.textContent='Running the canonical live URL scanner. This can take up to 90 seconds…';try{const d=await api('/api/network/admin/publications/'+pid+'/run-official-contentscore',{method:'POST',body:'{}'});s.className='tiny scanFresh';s.textContent='✓ Official ContentScore: '+d.official_contentscore.score+'/100';await load()}catch(e){s.className='tiny badText';s.textContent='✕ Official scan failed: '+e.message}finally{busy(b,false)}};
document.getElementById('copySeoHtml').onclick=async function(){const b=this;busy(b,true,'Preparing SEO HTML…');try{const d=await api('/api/network/admin/placements/${Number(placementId)}/seo-html');await navigator.clipboard.writeText(d.html||'');await api('/api/network/admin/publications/'+pid+'/mark-seo-copied',{method:'POST',body:'{}'});_markSeoCopied(lastPackage);b.textContent='✓ SEO publication HTML copied';b.classList.remove('nextAction');b.classList.add('completedAction');lastGuidedAction='';await load()}catch(e){alert(e.message)}finally{b.classList.remove('busy')}};
 document.getElementById('copySnippet').onclick=async function(){const b=this;busy(b,true,'Preparing…');try{const d=await api('/api/network/admin/placements/'+pid+'/delivery');await navigator.clipboard.writeText(d.snippet);b.textContent='✓ Copied'}catch(e){alert(e.message);await load()}finally{busy(b,false)}};if(key)load()})();</script></main></body></html>`;
}

function placementsPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Network Placements | ContentScale</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1260px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.crumb{font-size:13px;color:#91a1c2}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.notice{border:1px solid #315c88;background:#0b2238;border-radius:14px;padding:15px;color:#cdeaff;line-height:1.5}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:9px 12px;border-radius:10px;cursor:pointer;font-weight:700}.btn.secondary{background:#101b31}.btn.bad{background:#5f1e28;border-color:#ef4444}.btn:disabled{opacity:.65;cursor:wait}.btn.busy:before{content:'';display:inline-block;width:12px;height:12px;margin-right:7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #3b4f77;background:#142039}.status.accepted{border-color:#4b78bc;color:#acd0ff}.status.verified{border-color:#2b8f55;color:#8ff0b2}.status.cancelled,.status.rejected{border-color:#a23b49;color:#ff9ca8}.pill{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;border:1px solid #4d6790;background:#111e34}.pill.protected{border-color:#b47d24;color:#ffd791;background:#2b1d08}.pill.monitored{border-color:#2b8f55;color:#8ff0b2;background:#0e2819}.tiny{font-size:12px;color:#91a1c2}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1050px}th,td{text-align:left;padding:11px;border-bottom:1px solid #223150;vertical-align:top}th{font-size:11px;color:#8fa2c5;text-transform:uppercase;letter-spacing:.07em}.auth{padding:14px;border:1px solid #704b1d;background:#2a1b0b;border-radius:12px;color:#ffd89a;margin-top:16px}

button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><main>
<div class="top"><div><div class="crumb"><a href="/network">Network</a> / Placements</div><h1>Placements & Protection</h1><div class="tiny">A placement starts only after hard interest on an approved website.</div></div><a class="btn secondary" href="/network/admin">← Network admin</a></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>
<section class="card"><div class="notice"><strong>SEO publication rule</strong><br>Approved and Trusted publishers must publish the Publisher Edition as real indexable HTML on their own domain. ContentScale keeps required attribution/marker and ongoing live verification. A JavaScript-only embed cannot earn credits.</div></section>
<section class="card"><div class="top"><h2>Publisher commitments</h2><button id="refreshBtn" class="btn secondary">Refresh</button></div><div class="tableWrap"><table><thead><tr><th>Opportunity</th><th>Publisher</th><th>Protection</th><th>Status</th><th>Requirements</th><th>Accepted</th><th>Action</th></tr></thead><tbody id="rows"><tr><td colspan="7" class="tiny">Loading…</td></tr></tbody></table></div></section>
<script>
(function(){
 const key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');if(!key)auth.style.display='block';
 const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
 function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.old=btn.textContent;btn.disabled=true;btn.classList.add('busy');btn.textContent=label||'Working…'}else{btn.disabled=false;btn.classList.remove('busy');btn.textContent=btn.dataset.old||btn.textContent}}
 function protection(x){return '<span class="pill monitored">SEO-indexable monitored HTML</span><div class="tiny">Real page-source HTML + attribution + live verification required.</div>'}
 async function load(){const b=document.getElementById('rows');try{const d=await api('/api/network/admin/placements');const a=d.placements||[];if(!a.length){b.innerHTML='<tr><td colspan="7" class="tiny">No publisher commitments yet. Create an opportunity and record hard interest first.</td></tr>';return;}b.innerHTML=a.map(x=>'<tr><td><strong>'+esc(x.title)+'</strong><div class="tiny">'+esc(x.pitch||'')+'</div><div class="tiny">'+esc(x.brand_name||'')+(x.prewrite_brief_id?' · Prewrite #'+esc(x.prewrite_brief_id):' · No Prewrite')+'</div></td><td><strong>'+esc(x.publisher_brand||x.publisher_domain)+'</strong><div class="tiny">'+esc(x.publisher_domain)+' · '+esc(x.publisher_status)+'</div></td><td>'+protection(x)+'</td><td><span class="status '+esc(x.status)+'">'+esc(x.status)+'</span><div class="tiny">credits '+esc(x.reward_credits||0)+' — not earned yet</div></td><td><div class="tiny">Brand mention: '+(x.brand_mention_required?'required':'no')+'<br>Source link: '+(x.source_link_required?'required':'no')+'<br>ContentScale marker: required by policy</div></td><td><div class="tiny">'+esc(x.accepted_at||'—')+'</div></td><td>'+(x.status==='accepted'?'<button class="btn bad" data-action="cancel" data-id="'+x.id+'">Cancel commitment</button>':'<span class="tiny">No action</span>')+'</td></tr>').join('')}catch(e){b.innerHTML='<tr><td colspan="7" class="tiny">'+esc(e.message)+'</td></tr>'}}
 document.getElementById('rows').addEventListener('click',async function(ev){const btn=ev.target.closest('button[data-action="cancel"]');if(!btn)return;const id=Number(btn.dataset.id||0);if(!id)return;if(!confirm('Cancel this publisher commitment? No Publisher Edition should be generated from this placement after cancellation.'))return;busy(btn,true,'Cancelling…');try{await api('/api/network/admin/placements/'+id+'/cancel',{method:'POST',body:'{}'});btn.textContent='✓ Cancelled';await load()}catch(e){alert(e.message)}finally{busy(btn,false)}});
 document.getElementById('refreshBtn').onclick=function(){const btn=this;busy(btn,true,'Refreshing…');load().finally(()=>busy(btn,false))};if(key)load();
})();
</script></main></body></html>`;
}


function verificationPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manual Network Verification | ContentScale</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#08101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1260px;margin:auto;padding:34px 22px 70px}a{color:#8dd9ff}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap}.crumb{font-size:13px;color:#91a1c2}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin-top:18px}.guide{border-color:#365b92;background:#0a1d34}.guideGrid,.checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:10px}.guideItem,.check{background:#091329;border:1px solid #2b4168;border-radius:12px;padding:13px}.guideItem strong,.check b{display:block;color:#bfdbfe;margin-bottom:6px}.example{display:block;margin-top:7px;color:#93c5fd;font-size:12px}.queue{display:grid;gap:14px}.item{border:1px solid #2b4168;background:#0b1427;border-radius:15px;padding:16px}.item h3{margin:0 0 4px}.pill{display:inline-block;border:1px solid #40577e;border-radius:999px;padding:4px 8px;font-size:11px;margin:2px}.tiny{font-size:12px;color:#91a1c2;line-height:1.55}.expected{color:#86efac;font-weight:850;overflow-wrap:anywhere}.look{color:#cbd5e1;margin-top:5px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.btn{border:1px solid #3c5f99;background:#17376c;color:white;padding:9px 12px;border-radius:10px;cursor:pointer;font-weight:800;text-decoration:none}.btn.secondary{background:#101b31}.btn.good{background:#14532d;border-color:#22c55e}.btn.warn{background:#78350f;border-color:#f59e0b}.btn.bad{background:#7f1d1d;border-color:#ef4444}.btn:disabled{opacity:.6;cursor:wait}.field{margin-top:11px}.field label{display:block;font-size:11px;color:#93a4c5;margin-bottom:5px}.field textarea{width:100%;min-height:75px;background:#081224;color:#fff;border:1px solid #385077;border-radius:9px;padding:9px}.pre{margin-top:10px;padding:10px;border:1px solid #31486f;border-radius:10px;background:#081224}.ok{color:#86efac}.warnText{color:#fcd34d}.auth{padding:14px;border:1px solid #704b1d;background:#2a1b0b;border-radius:12px;color:#ffd89a;margin-top:16px}

button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><main>
<div class="top"><div><div class="crumb"><a href="/network/admin">Network Admin</a> / Manual Verification</div><h1>Manual Verification Queue</h1><div class="tiny">The pre-check helps you. You make the final decision.</div></div><button class="btn secondary" id="refreshBtn">Refresh</button></div>
<div id="auth" class="auth" style="display:none">No valid admin session found. Open <a href="/admin">/admin</a>, log in, then return here.</div>

<section class="card guide">
<h2 style="margin-top:0">What should I look at?</h2>
<div class="guideGrid">
<div class="guideItem"><strong>1. Placement / Opportunity</strong>Is this the correct assignment on the correct publisher website?<span class="example">Example: “Emergency Roof Repair NJ” was assigned to RoofingPublisher.com.</span></div>
<div class="guideItem"><strong>2. Expected brand mention</strong>Find the expected company name visibly and naturally in the article.<span class="example">Example: expected = “Perfect Roofing Team”. You should actually see that name in the article body.</span></div>
<div class="guideItem"><strong>3. Expected backlink</strong>Click the backlink. It must lead to the expected source website/page, not another domain or a broken URL.<span class="example">Example: expected source domain = perfectroofingteam.com.</span></div>
<div class="guideItem"><strong>4. Expected title</strong>Compare the live article title/H1 with the Publisher Edition title. Small editorial edits are okay; a different topic is not.<span class="example">Example: “24-Hour Emergency Roof Repair in NJ” should not become “10 Home Improvement Ideas”.</span></div>
<div class="guideItem"><strong>5. Publisher Edition</strong>Open the exact publication package and compare structure, key sections, brand and backlink with what went live.<span class="example">This prevents a publisher from submitting an unrelated/reused article.</span></div>
<div class="guideItem"><strong>6. SEO / indexability</strong>The article should be public, readable and present as real HTML. No password wall, no noindex, and no JS-only final delivery.<span class="example">Use “Run pre-check” for evidence, but still inspect the live page yourself.</span></div>
</div></section>

<section class="card"><h2 style="margin-top:0">Waiting for your decision</h2><div id="queue" class="queue"><div class="tiny">Loading…</div></div></section>

<script>(function(){
const key=localStorage.getItem('admin_id')||'',auth=document.getElementById('auth');if(!key)auth.style.display='block';
const esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));
const api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401){auth.style.display='block';throw Error('Admin session expired');}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d};
function pre(x){const d=x.latest_details||{};if(!x.latest_result)return '<div class="pre tiny">Pre-check: not run yet.</div>';return '<div class="pre"><b>Automated pre-check: <span class="'+(x.latest_result==='passed'?'ok':'warnText')+'">'+esc(x.latest_result)+'</span></b><div class="tiny">HTTP '+esc(x.latest_http_status||'—')+' · indexable '+(x.latest_indexable?'✓':'✕')+' · canonical '+(x.latest_canonical_ok?'✓':'✕')+' · real HTML '+(d.seo_static_html_present?'✓':'✕')+' · brand '+(x.latest_brand_mention_ok?'✓':'✕')+' · backlink '+(x.latest_source_link_ok?'✓':'✕')+' · content match '+(x.latest_content_match_ok?'✓':'✕')+'</div></div>'}
async function load(){
 const box=document.getElementById('queue');
 try{
   const d=await api('/api/network/admin/verification-queue'),items=(d.items||[]).filter(x=>['submitted','needs_review','verifying'].includes(x.status));
   if(!items.length){box.innerHTML='<div class="tiny">No publisher placements are waiting for manual review.</div>';return}
   box.innerHTML=items.map(x=>{
     const brand=x.brand_mention_required?(x.brand_name||'Brand not set'):'Not required';
     const backlink=x.source_link_required?(x.source_domain||'Source domain not set'):'Not required';
     const title=x.edition_title||x.title||'Publisher Edition title unavailable';
     const packageUrl='/network/admin/publication/'+(x.publication_version_id||'');
     return '<article class="item"><div class="top"><div><h3>'+esc(x.publisher_brand||x.publisher_domain||'Publisher')+'</h3><div class="tiny">'+esc(x.publisher_domain||'')+'</div></div><div><span class="pill">'+esc(x.status)+'</span><span class="pill">Placement #'+esc(x.id)+'</span><span class="pill">Review round '+Math.max(1,Number(x.submission_round||1))+'</span></div></div>'+
     '<div class="checks" style="margin-top:12px">'+
       '<div class="check"><b>Placement / Opportunity</b><div class="expected">'+esc(x.title||'—')+'</div><div class="look">Look for: correct topic + correct publisher.</div></div>'+
       '<div class="check"><b>Expected brand mention</b><div class="expected">'+esc(brand)+'</div><div class="look">Look for this exact brand naturally in the live article.</div></div>'+
       '<div class="check"><b>Expected backlink</b><div class="expected">'+esc(backlink)+'</div><div class="look">Click the live backlink and confirm this destination/source domain.</div></div>'+
       '<div class="check"><b>Expected title</b><div class="expected">'+esc(title)+'</div><div class="look">Compare with the live H1/article title.</div></div>'+
       '<div class="check"><b>Publication Package / Publisher Edition</b><div class="expected">Package #'+esc(x.publication_version_id||'—')+'</div><div class="look">'+(x.publication_version_id?'<a target="_blank" rel="noopener" href="'+esc(packageUrl)+'">Open Publisher Edition</a>':'Package unavailable')+'</div></div>'+
       '<div class="check"><b>Live article</b><div class="expected">'+(x.published_url?'<a target="_blank" rel="noopener" href="'+esc(x.published_url)+'">'+esc(x.published_url)+'</a>':'No live URL')+'</div><div class="look">Open it and inspect the actual article.</div></div>'+
     '</div>'+pre(x)+
     '<div class="field"><label>Your review note / required changes</label><textarea data-note="'+x.id+'" placeholder="Example: Brand mention is correct, but backlink points to homepage instead of the required source page.">'+esc(x.verification_note||'')+'</textarea></div>'+
     '<div class="actions"><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(x.published_url||'#')+'">Open live page</a><button class="btn secondary" data-act="precheck" data-id="'+x.id+'">Run pre-check</button><button class="btn good" data-act="verified" data-id="'+x.id+'">Verify manually</button><button class="btn warn" data-act="needs_changes" data-id="'+x.id+'">Needs changes</button><button class="btn bad" data-act="rejected" data-id="'+x.id+'">Reject</button></div></article>'
   }).join('')
 }catch(e){box.innerHTML='<div class="warnText">'+esc(e.message||e)+'</div>'}
}
document.getElementById('queue').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-act]');if(!b)return;const id=Number(b.dataset.id),act=b.dataset.act,n=(document.querySelector('[data-note="'+id+'"]')||{}).value||'',old=b.textContent;b.disabled=true;b.textContent=act==='precheck'?'Checking…':'Saving…';
 try{
   if(act==='precheck')await api('/api/network/admin/placements/'+id+'/verify-live',{method:'POST',body:'{}'});
   else{
     if(act==='verified'&&!confirm('You are manually verifying this live placement. This can release the placement credits once. Continue?'))return;
     await api('/api/network/admin/placements/'+id+'/manual-review',{method:'POST',body:JSON.stringify({decision:act,note:n})});
   }
   await load();
 }catch(err){alert(err.message||err)}finally{b.disabled=false;b.textContent=old}
});
document.getElementById('refreshBtn').onclick=load;if(key)load();
})();</script></main></body></html>`;
}
function registerNetwork({ app, pool, verifyAdmin, asyncHandler }) {
  if (!app) throw new Error('Network registration requires Express app');
  if (typeof verifyAdmin !== 'function') throw new Error('Network registration requires verifyAdmin');
  const wrap = typeof asyncHandler === 'function' ? asyncHandler : (fn) => (req, res, next) => Promise.resolve(fn(req,res,next)).catch(next);

  app.get('/api/network/health', wrap(async (req, res) => {
    let schema;
    try { schema = await inspectNetworkSchema(pool); }
    catch (err) { schema = { db_connected: false, schema_ready: false, error: err.message }; }
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, module: 'network', enabled: envEnabled(), isolated: true, core_tables_mutated: false, schema });
  }));

  app.post('/api/network/admin/init', verifyAdmin, wrap(async (req, res) => {
    const result = await ensureNetworkTables(pool);
    res.json({ ...result, enabled: envEnabled(), note: 'Only network_* tables were created/verified.' });
  }));

  app.get('/api/network/admin/status', verifyAdmin, wrap(async (req, res) => {
    const schema = await inspectNetworkSchema(pool);
    res.json({ success: true, enabled: envEnabled(), isolated: true, schema });
  }));


  // DISTRIBUTION OPPORTUNITIES — H1 + pitch only. No Publisher Edition generation here.
  // PREWRITE HANDOFF — read-only access to the existing core Prewrite Brief intelligence.
  // Network never alters/deletes prewrite_briefs.
  app.get('/api/network/admin/prewrite-briefs', verifyAdmin, wrap(async (req,res)=>{
    const r=await pool.query(`SELECT id,client_id,keyword,working_title,language,region,brief_json,competitors_scraped,created_at,status
      FROM prewrite_briefs ORDER BY created_at DESC,id DESC LIMIT 300`);
    res.json({success:true,briefs:r.rows,read_only:true,rule:'Existing Prewrite Brief intelligence is referenced by Network; core Prewrite records are never modified here.'});
  }));

  app.get('/api/network/locales', (req,res)=>res.json({success:true,locales:NETWORK_LOCALES.map(x=>({locale:x[0],language:x[1],market:x[2],direction:x[3]}))}));


  app.get('/api/network/admin/prewrite-briefs/:id', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid Prewrite Brief'});
    const r=await pool.query(`SELECT id,client_id,keyword,working_title,language,region,brief_json,competitors_scraped,created_at,status FROM prewrite_briefs WHERE id=$1 LIMIT 1`,[id]);
    const brief=r.rows[0];if(!brief)return res.status(404).json({success:false,error:'Prewrite Brief not found'});
    res.json({success:true,brief,hash:crypto.createHash('sha256').update(JSON.stringify(brief.brief_json||{})).digest('hex'),read_only:true});
  }));

  app.post('/api/network/admin/prewrite-briefs/:id/approve-for-writing', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid Prewrite Brief'});
    try{
      const out=await _networkApproveBriefSnapshot(pool,id,req.admin&&req.admin.id||'admin');
      res.json({success:true,approval:out.approval,brief_id:id,brief_hash:out.brief_hash,readiness:out.readiness,message:'Exact Brief snapshot approved for writing. No article-generation call has happened yet.'});
    }catch(e){res.status(Number(e.status)||500).json({success:false,error:e.message,details:e.details||null});}
  }));

  app.get('/api/network/admin/standalone-content', verifyAdmin, wrap(async (req,res)=>{
    const r=await pool.query(`SELECT id,prewrite_brief_id,title,brand_name,primary_niche,source_html,created_at,source_snapshot,COALESCE((source_snapshot->'standalone_output'->>'content_score')::int,0) AS content_score,COALESCE(source_snapshot->'standalone_output'->>'prewrite_hash','') AS prewrite_hash,COALESCE(source_snapshot->'standalone_output'->'score_parts','{}'::jsonb) AS score_parts FROM network_content WHERE COALESCE(source_snapshot->>'network_kind','')='standalone_content' AND COALESCE(distribution_status,'')<>'deleted' ORDER BY created_at DESC,id DESC LIMIT 300`);
    res.json({success:true,items:r.rows,marketplace:false});
  }));

  app.post('/api/network/admin/standalone-content/generate', verifyAdmin, wrap(async (req,res)=>{
    if(!envEnabled())return res.status(409).json({success:false,error:'Network is disabled'});
    const title=cleanText(req.body?.title,300);if(!title)return res.status(400).json({success:false,error:'Working H1 / title is required'});
    const prewriteId=Number(req.body?.prewrite_brief_id)||null;if(!prewriteId)return res.status(409).json({success:false,error:'Create, review and approve a Prewrite Brief before standalone article generation.'});
    let approvalCtx;try{approvalCtx=await _networkGetValidApproval(pool,prewriteId,Number(req.body&&req.body.approval_id||0)||0)}catch(e){return res.status(Number(e.status)||409).json({success:false,error:e.message});}
    const brief=Object.assign({},approvalCtx.brief,{brief_json:approvalCtx.brief_snapshot}),prewriteHash=approvalCtx.brief_hash,approvedBriefContract=(approvalCtx.contract&&Object.keys(approvalCtx.contract).length)?approvalCtx.contract:buildApprovedBriefContract(approvalCtx.brief_snapshot||{});
    const ownerWebsiteId=Number(req.body?.owner_website_id)||null;let owner=null;if(ownerWebsiteId){const ow=await pool.query(`SELECT id,domain,brand_name,primary_niche,sub_niche FROM network_websites WHERE id=$1 LIMIT 1`,[ownerWebsiteId]);owner=ow.rows[0]||null}
    const locale=normalizeNetworkLocaleInput(req.body?.language||brief?.language||'',req.body?.country||brief?.region||''),cls=classifyNetworkNiche([owner?.primary_niche,owner?.sub_niche,title,brief?.keyword,brief?.working_title].filter(Boolean).join(' ')),primaryNiche=owner?.primary_niche||cls.main_niche||'Other',subNiche=owner?.sub_niche||cls.sub_niche||null,brand=cleanText(req.body?.brand_name||owner?.brand_name||'',200),ownerUrl=owner?.domain?`https://${owner.domain}`:'',prewriteText=brief?JSON.stringify(brief.brief_json||{}).slice(0,48000):'',manual=cleanText(req.body?.google_manual_notes,4000);
    const prompt=`Create one publication-grade standalone ContentScale article. This is NOT a marketplace placement and is NOT tied to a publisher.
Return JSON only with keys: title, html, plain_text, meta_title, meta_description, suggested_slug, schema_json.
CONTENT STANDARD:
- One H1.
- 40-60 word direct answer immediately after H1 in <div class="cs-direct-answer">.
- TL;DR in <div class="cs-tldr">.
- Linked TOC in <nav class="cs-toc">.
- Use the Approved Brief planned H2s exactly once and in order, with stable ids; add depth with H3s/examples rather than inventing new H2s.
- Minimum 1200 useful words; normally 1500-2200. Never pad.
- At least one useful mobile-friendly table wrapped in <div class="cs-table-wrap"><table class="cs-table">...</table></div>.
- Use a FAQ section only for the exact approved FAQ questions in the Brief; never invent extra FAQ questions to hit a count, in <section class="cs-faq">.
EVIDENCE:
- Never invent statistics, quotes, case studies, awards, ratings, prices, certifications, guarantees, service claims or URLs.
- Use only facts and URLs actually supported by the Prewrite evidence/manual notes.
- FULL APPROVED CONTRACT.statistics comes from the Evidence Quality Ladder. Prefer best_source_url when provenance was resolved; use the statistic naturally and never add numbers just to fill a quota.
- FULL APPROVED CONTRACT.expert_quotes contains exact source-verified quotes. Preserve exact wording, named attribution and source_url; never embellish a role.
- FULL APPROVED CONTRACT.expert_insights contains source-verified PARAPHRASES. Attribute them in prose and link source_url, but NEVER place the insight inside quotation marks or present it as a direct quote.
- Authority class matters: prefer primary_verified / provenance_resolved evidence over secondary evidence when both support the same point.
- A researched zero means ContentScale performed the required search and verification depth. It is never permission to invent a substitute.
SEO:
- meta_title must be no longer than 60 characters. meta_description must be 140-160 characters; aim for 150-159 when natural. schema_json must be a valid Article object.
- Language ${locale.language||'en-US'}; market ${locale.market||'not specified'}; topic ${title}; brand ${brand||'not specified'}; niche ${primaryNiche}${subNiche?' / '+subNiche:''}; source ${ownerUrl||'not linked'}.
FULL APPROVED CONTRACT — EXECUTE WHEN PRESENT:
${approvedBriefContract?JSON.stringify(approvedBriefContract).slice(0,30000):'No Approved Brief Contract linked.'}
PREWRITE BRIEF — READ ONLY:
${prewriteText||'No linked Prewrite Brief. Do not invent research or URLs.'}
ADMIN MANUAL GOOGLE NOTES:
${manual||'No manual notes supplied.'}`;
    const ai=await callNetworkGemini(prompt);let d=ai.parsed||{},html=String(d.html||'');
    let fidelity=brief?checkApprovedBriefFidelity(html,brief.brief_json||{},{publisher_domain:owner?.domain||'',internal_candidates:[]}):null;
    if(brief&&fidelity&&!fidelity.passed){
      const repairPrompt=`Repair this standalone article so it fully executes the Approved Brief Contract. Return JSON only with keys: title, html, plain_text, meta_title, meta_description, suggested_slug, schema_json.
Do not restart research. Do not invent facts, statistics, quotes, people or URLs. Preserve correct existing content and repair only what the contract check says is missing.
MISSING CONTRACT GROUPS: ${JSON.stringify(fidelity.missing)}
DETAILS: ${JSON.stringify(fidelity.groups).slice(0,14000)}
FULL APPROVED CONTRACT: ${JSON.stringify(approvedBriefContract).slice(0,30000)}
CURRENT ARTICLE HTML:
${html.slice(0,52000)}`;
      const repaired=await callNetworkGemini(repairPrompt);
      if(repaired&&repaired.parsed&&repaired.parsed.html){d=repaired.parsed;html=String(d.html||'');}
      fidelity=checkApprovedBriefFidelity(html,brief.brief_json||{},{publisher_domain:owner?.domain||'',internal_candidates:[]});
      if(!fidelity.passed){
        return res.status(422).json({success:false,error:'Standalone article did not fully execute the Approved Brief after one targeted repair. Nothing was saved.',stage:'brief_fidelity',missing:fidelity.missing,details:fidelity.groups,counts:fidelity.counts});
      }
    }
    const words=htmlText(html).split(/\s+/).filter(Boolean).length;if(words<1200)throw new Error('Generated article is below the 1200 useful-word publication minimum');
    const _standMeta=safeJsonObject(brief&&brief.brief_json&&brief.brief_json.meta_package),_standApprovedTitle=cleanText(_standMeta.seo_title||'',60),_standApprovedDesc=cleanText(_standMeta.meta_description||'',160);const metaTitle=_standApprovedTitle||cleanText(d.meta_title||d.title||title,60),metaDescription=(_standApprovedDesc.length>=140&&_standApprovedDesc.length<=160)?_standApprovedDesc:cleanText(d.meta_description||'',160);if(!metaTitle||metaTitle.length>60||metaDescription.length<140||metaDescription.length>160)throw new Error('SEO meta policy failed: title must be 1-60 characters and meta description 140-160 characters.');const slug=slugifyNetwork(d.suggested_slug||d.title||title),schema=(d.schema_json&&typeof d.schema_json==='object')?d.schema_json:{},scoreRow={html,meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,schema_json:schema,source_domain:owner?.domain||'',source_link_required:false,generation_input_snapshot:{prewrite_used:true,prewrite_brief_id:prewriteId,approved_prewrite_approval_id:Number(approvalCtx.approval.id),approved_prewrite_hash:prewriteHash,approved_prewrite_at:approvalCtx.approval.approved_at||null,approved_brief_contract:approvedBriefContract||null,publication_settings:{author_name:brand||owner?.brand_name||'Content owner'}}},score=scorePublication(scoreRow,[]),standard=publicationStandardChecks(html),snapshot={network_kind:'standalone_content',market:locale.market||null,language:locale.language||null,niche_classification:cls,google_manual:{notes:manual,admin_only:true},prewrite_summary:{id:brief.id,keyword:brief.keyword,working_title:brief.working_title,created_at:brief.created_at,competitors_scraped:brief.competitors_scraped},approved_prewrite:{approval_id:Number(approvalCtx.approval.id),brief_hash:prewriteHash,approved_at:approvalCtx.approval.approved_at||null},approved_brief_fidelity:fidelity,standalone_output:{meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,schema_json:schema,content_score:score.score,score_parts:score.parts,publication_standard:standard,prewrite_hash:prewriteHash,generation_model:ai.model}};
    const r=await pool.query(`INSERT INTO network_content (owner_website_id,prewrite_brief_id,title,source_type,primary_niche,brand_name,source_html,source_text,source_snapshot,publication_status,distribution_status,desired_placements,verified_placements,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'draft','standalone',1,0,NOW(),NOW()) RETURNING id,title,created_at`,[ownerWebsiteId,prewriteId,cleanText(d.title||title,300),prewriteId?'prewrite_brief':'original',primaryNiche,brand||null,html,cleanText(d.plain_text||htmlText(html),50000),JSON.stringify(snapshot)]);
    res.status(201).json({success:true,item:r.rows[0],content_score:score.score,score_parts:score.parts,publication_standard:standard,prewrite_hash:prewriteHash,marketplace:false});
  }));

  app.get('/api/network/admin/opportunities', verifyAdmin, wrap(async (req, res) => {
    const r = await pool.query(`SELECT c.id,c.owner_website_id,c.prewrite_brief_id,c.title,c.primary_niche,c.brand_name,c.publication_status,c.desired_placements,c.created_at,c.updated_at,
      COALESCE(c.source_snapshot->>'pitch','') AS pitch,
      COALESCE(c.source_snapshot->>'sub_niche','') AS sub_niche,
      COALESCE(c.source_snapshot->>'country','') AS country,
      COALESCE(c.source_snapshot->>'language','') AS language,
      COALESCE(c.source_snapshot->>'prewrite_hash','') AS prewrite_hash,
      COUNT(p.id)::int AS interest_count
      FROM network_content c
      LEFT JOIN network_placements p ON p.content_id=c.id AND p.status NOT IN ('cancelled','rejected')
      WHERE c.source_type IN ('original','prewrite_brief') AND COALESCE(c.source_snapshot->>'network_kind','')='distribution_opportunity'
        AND COALESCE(c.distribution_status,'') <> 'deleted'
      GROUP BY c.id ORDER BY c.created_at DESC,c.id DESC LIMIT 1000`);
    res.json({ success:true, opportunities:r.rows });
  }));

  app.post('/api/network/admin/opportunities', verifyAdmin, wrap(async (req, res) => {
    if (!envEnabled()) return res.status(409).json({ success:false,error:'Network is disabled' });
    const title=cleanText(req.body?.title,300),pitch=cleanText(req.body?.pitch,1400);
    if(!title) return res.status(400).json({success:false,error:'H1 / working title is required'});
    if(!pitch) return res.status(400).json({success:false,error:'Short publisher pitch is required'});
    const desired=Math.max(1,Math.min(5,Number(req.body?.desired_placements)||1));
    const ownerWebsiteId=Number(req.body?.owner_website_id)||null;let ownerWebsite=null;
    if(ownerWebsiteId){const ow=await pool.query('SELECT id,domain,brand_name,primary_niche,sub_niche FROM network_websites WHERE id=$1',[ownerWebsiteId]);ownerWebsite=ow.rows[0]||null;if(!ownerWebsite)return res.status(400).json({success:false,error:'Source website not found'});}
    const prewriteBriefId=Number(req.body?.prewrite_brief_id)||null;let prewriteSummary=null,prewriteHash='';
    if(prewriteBriefId){const pr=await pool.query('SELECT id,keyword,working_title,language,region,brief_json,competitors_scraped,created_at FROM prewrite_briefs WHERE id=$1 LIMIT 1',[prewriteBriefId]);if(!pr.rows[0])return res.status(400).json({success:false,error:'Selected Prewrite Brief not found'});const pb=pr.rows[0];prewriteHash=crypto.createHash('sha256').update(JSON.stringify(pb.brief_json||{})).digest('hex');prewriteSummary={id:pb.id,keyword:pb.keyword,working_title:pb.working_title,language:pb.language,region:pb.region,competitors_scraped:pb.competitors_scraped,created_at:pb.created_at};}
    const localeInput=normalizeNetworkLocaleInput(req.body?.language||cleanText(prewriteSummary&&prewriteSummary.language,80),req.body?.country);const locale=localeInput.language||'en-US',autoClass=classifyNetworkNiche([ownerWebsite&&ownerWebsite.primary_niche,ownerWebsite&&ownerWebsite.sub_niche,title,pitch,prewriteSummary&&prewriteSummary.keyword,prewriteSummary&&prewriteSummary.working_title].filter(Boolean).join(' ')),primaryNiche=(ownerWebsite&&ownerWebsite.primary_niche)||autoClass.main_niche||null,subNiche=(ownerWebsite&&ownerWebsite.sub_niche)||autoClass.sub_niche||null;
    const snap={network_kind:'distribution_opportunity',pitch,sub_niche:subNiche,country:localeInput.market||cleanText(req.body?.country,120),language:locale,direction:localeDirection(locale),full_article_generated:false,prewrite_summary:prewriteSummary,prewrite_hash:prewriteHash,niche_classification:autoClass,google_manual:{required:false,admin_only:true,status:cleanText(req.body?.google_manual_notes,1500)?'checked':'not_checked',notes:cleanText(req.body?.google_manual_notes,1500)}};
    const r=await pool.query(`INSERT INTO network_content (owner_website_id,prewrite_brief_id,title,source_type,primary_niche,brand_name,source_snapshot,publication_status,distribution_status,desired_placements,verified_placements,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'available','offered',$8,0,NOW(),NOW()) RETURNING *`,[ownerWebsiteId,prewriteBriefId,title,prewriteBriefId?'prewrite_brief':'original',primaryNiche,cleanText(req.body?.brand_name,200)||(ownerWebsite&&ownerWebsite.brand_name)||null,JSON.stringify(snap),desired]);
    res.status(201).json({success:true,opportunity:r.rows[0],rule:'Only H1 + pitch stored. No Publisher Edition generated.'});
  }));

  app.post('/api/network/admin/opportunities/:id/interest', verifyAdmin, wrap(async (req, res) => {
    if(req.body?.hard_interest_confirmed!==true)return res.status(409).json({success:false,error:'Hard publication interest must be explicitly confirmed'});
    const contentId=Number(req.params.id),websiteId=Number(req.body?.publisher_website_id);
    if(!contentId||!websiteId)return res.status(400).json({success:false,error:'Opportunity and publisher website are required'});
    const cr=await pool.query(`SELECT * FROM network_content WHERE id=$1 AND source_type IN ('original','prewrite_brief') AND COALESCE(source_snapshot->>'network_kind','')='distribution_opportunity' LIMIT 1`,[contentId]);
    if(!cr.rows[0])return res.status(404).json({success:false,error:'Opportunity not found'});
    const wr=await pool.query('SELECT * FROM network_websites WHERE id=$1 LIMIT 1',[websiteId]);
    const w=wr.rows[0];if(!w)return res.status(404).json({success:false,error:'Publisher website not found'});
    if(!['approved','trusted'].includes(w.status))return res.status(409).json({success:false,error:'Publisher website must be approved before hard interest can be committed'});
    if(!(w.scan_snapshot&&w.scan_snapshot.technical_pass===true))return res.status(409).json({success:false,error:'Publisher website must pass the Network Website Check before content can be written'});
    const max=Number(cr.rows[0].desired_placements)||1;
    const count=await pool.query(`SELECT COUNT(*)::int AS n FROM network_placements WHERE content_id=$1 AND status NOT IN ('cancelled','rejected')`,[contentId]);
    if(Number(count.rows[0].n)>=max)return res.status(409).json({success:false,error:'This opportunity already reached its maximum publisher commitments'});
    try{
      const pr=await pool.query(`INSERT INTO network_placements (content_id,publisher_website_id,status,reward_credits,brand_mention_required,source_link_required,accepted_at,created_at,updated_at)
        VALUES ($1,$2,'accepted',10,TRUE,TRUE,NOW(),NOW(),NOW()) RETURNING *`,[contentId,websiteId]);
      const afterCount=Number(count.rows[0].n)+1;
      await pool.query(`UPDATE network_content SET distribution_status=$2,publication_status=CASE WHEN $2='full' THEN 'paused' ELSE publication_status END,updated_at=NOW() WHERE id=$1`,[contentId,afterCount>=max?'full':'hard_interest']);
      res.status(201).json({success:true,placement:pr.rows[0],eligible_for_publisher_edition:true,placement_count:afterCount,max_placements:max,opportunity_full:afterCount>=max,protection_mode:'seo_indexable_html',content_scale_marker_required:true,rule:'Website was approved before writing. No Publisher Edition generated by this endpoint. Final publication mode is SEO-indexable monitored HTML.'});
    }catch(e){if(e&&e.code==='23505')return res.status(409).json({success:false,error:'This publisher website already committed to this opportunity'});throw e;}
  }));

  app.post('/api/network/admin/opportunities/delete', verifyAdmin, wrap(async (req, res) => {
    const ids=Array.isArray(req.body?.ids)?Array.from(new Set(req.body.ids.map(Number).filter(n=>Number.isInteger(n)&&n>0))).slice(0,500):[];
    if(!ids.length)return res.status(400).json({success:false,error:'Select at least one opportunity'});

    // Active placements block deletion. Cancelled/rejected placements remain as immutable history.
    // We intentionally soft-delete the opportunity instead of physically deleting network_content,
    // because network_placements.content_id uses ON DELETE RESTRICT by design.
    const linked=await pool.query(`SELECT DISTINCT content_id FROM network_placements WHERE content_id=ANY($1::bigint[]) AND status NOT IN ('cancelled','rejected') LIMIT 20`,[ids]);
    if(linked.rows.length)return res.status(409).json({success:false,error:'One or more selected opportunities still have active publisher commitments/placements. Cancel or resolve those placements before deletion.',blocked_ids:linked.rows.map(x=>x.content_id)});

    const r=await pool.query(`UPDATE network_content
      SET publication_status='rejected',
          distribution_status='deleted',
          source_snapshot=jsonb_set(COALESCE(source_snapshot,'{}'::jsonb),'{deleted_at}',to_jsonb(NOW()::text),true),
          updated_at=NOW()
      WHERE id=ANY($1::bigint[])
        AND source_type IN ('original','prewrite_brief')
        AND COALESCE(source_snapshot->>'network_kind','')='distribution_opportunity'
        AND COALESCE(distribution_status,'') <> 'deleted'
      RETURNING id`,[ids]);
    res.json({success:true,deleted:r.rowCount,deleted_ids:r.rows.map(x=>x.id),mode:'soft_delete',history_preserved:true});
  }));

  app.get('/network/prewrite/:id', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');res.type('html').send(prewriteEvidencePage(req.params.id));
  });
  app.get('/network/content-studio', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');res.type('html').send(contentStudioPage());
  });

  app.get('/network/opportunities', (req, res) => {
    if (!envEnabled()) return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');
    res.type('html').send(opportunitiesPage());
  });



  // v513 — role-neutral attention contract, first wired to the main Admin dashboard.
  // It never invents a second workflow; it only points back to the canonical Publisher Edition page,
  // where the same guided state-machine decides the one blue next action and scrolls to it.
  app.get('/api/network/admin/attention', verifyAdmin, wrap(async (req,res)=>{
    const r=await pool.query(`SELECT p.id,p.status,p.published_url,p.verification_decision,p.updated_at,
      c.title,c.brand_name,w.domain AS publisher_domain,pv.id AS publication_version_id,pv.generation_input_snapshot,pv.quality_status,
      vr.result_status AS latest_result,vr.http_status AS latest_http_status,vr.details AS latest_details,vr.checked_at AS latest_checked_at
      FROM network_placements p
      JOIN network_content c ON c.id=p.content_id
      JOIN network_websites w ON w.id=p.publisher_website_id
      LEFT JOIN network_publication_versions pv ON pv.placement_id=p.id
      LEFT JOIN LATERAL (SELECT result_status,http_status,details,checked_at FROM network_verification_runs WHERE placement_id=p.id ORDER BY run_no DESC LIMIT 1) vr ON TRUE
      WHERE p.status NOT IN ('verified','cancelled','rejected')
      ORDER BY p.updated_at DESC,p.id DESC LIMIT 100`);
    const items=r.rows.map(x=>{
      const snap=safeJsonObject(x.generation_input_snapshot),scan=safeJsonObject(snap.official_contentscore_scan),details=safeJsonObject(x.latest_details);
      const previewHash=cleanText(snap.internal_preview_hash||'',128),copiedHash=cleanText(snap.seo_publication_copied_hash||'',128),copiedCurrent=!!(previewHash&&copiedHash&&previewHash===copiedHash);
      const fetchFailed=!!(x.latest_result&&(details.fetch_error||!(Number(x.latest_http_status)>=200&&Number(x.latest_http_status)<400)));
      let next='Continue guided Publisher Edition';
      if(!x.publication_version_id)next='Generate Publisher Edition';
      else if(!scan.score||!previewHash)next='Refresh all & verify';
      else if(x.latest_result==='passed')next='Verify live placement';
      else if(fetchFailed&&!copiedCurrent)next='Copy SEO publication HTML';
      else if(fetchFailed)next='Publish page and retry live pre-check';
      else if(x.latest_result&&x.latest_result!=='passed')next='Review live changes';
      else if(!copiedCurrent)next='Copy SEO publication HTML';
      else next='Publish page and run live pre-check';
      return {role:'admin',kind:'network_publishing',placement_id:Number(x.id),title:cleanText(x.title||'Publisher Edition',300),brand_name:cleanText(x.brand_name||'',220),publisher_domain:cleanText(x.publisher_domain||'',300),status:x.status,next_action:next,updated_at:x.updated_at,url:'/network/publishing/'+Number(x.id)+'?guided=1'};
    });
    res.set('Cache-Control','no-store');res.json({success:true,count:items.length,items,rule:'Open the canonical workflow page. It will auto-scroll to the single blue next action.'});
  }));

  // PUBLISHING — generate exactly one Publisher Edition per committed placement.
  app.get('/api/network/admin/publishing', verifyAdmin, wrap(async (req, res) => {
    const r=await pool.query(`SELECT p.id,p.content_id,p.publisher_website_id,p.status,p.reward_credits,p.accepted_at,p.updated_at,
      c.title,c.brand_name,c.primary_niche,c.source_snapshot->>'pitch' AS pitch,
      w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,
      pv.id AS publication_version_id,pv.title AS edition_title,pv.quality_status,pv.generated_at,
      CASE WHEN pv.generation_input_snapshot ? 'delivery_token' THEN TRUE ELSE FALSE END AS delivery_available
      FROM network_placements p
      JOIN network_content c ON c.id=p.content_id
      JOIN network_websites w ON w.id=p.publisher_website_id
      LEFT JOIN network_publication_versions pv ON pv.placement_id=p.id
      WHERE p.status NOT IN ('cancelled','rejected')
      ORDER BY p.created_at DESC,p.id DESC LIMIT 1000`);
    const items=r.rows.map(x=>Object.assign({},x,{protection_mode:'seo_indexable_html'}));
    res.json({success:true,items,rule:'No Publisher Edition exists before hard interest + approved website.'});
  }));


  app.post('/api/network/admin/placements/:id/delete-from-publishing', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);
    if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    if(req.body?.confirm!==true)return res.status(400).json({success:false,error:'Explicit confirmation is required'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const qr=await client.query(`SELECT p.*,c.desired_placements,c.id AS content_id
        FROM network_placements p JOIN network_content c ON c.id=p.content_id
        WHERE p.id=$1 LIMIT 1 FOR UPDATE OF p,c`,[id]);
      const p=qr.rows[0];
      if(!p){await client.query('ROLLBACK');return res.status(404).json({success:false,error:'Publishing queue item not found'});}
      if(p.status==='verified'||p.verification_decision==='verified'||p.verified_at){
        await client.query('ROLLBACK');return res.status(409).json({success:false,error:'Verified placements cannot be deleted. They are permanent Network history.'});
      }
      const credits=await client.query(`SELECT id FROM network_credit_transactions WHERE placement_id=$1 LIMIT 1`,[id]);
      if(credits.rows[0]){await client.query('ROLLBACK');return res.status(409).json({success:false,error:'This placement already has a credit/reward transaction and cannot be deleted.'});}
      if(!['accepted','generating','ready'].includes(String(p.status||''))){
        await client.query('ROLLBACK');return res.status(409).json({success:false,error:`Placement status "${p.status}" is no longer a simple Publishing queue item. Resolve it from Verification/Placements instead.`});
      }
      const imageIds=await client.query(`SELECT id FROM network_publication_images WHERE placement_id=$1`,[id]);
      const ids=imageIds.rows.map(x=>Number(x.id)).filter(Boolean);
      if(ids.length)await client.query(`DELETE FROM network_image_library WHERE source_image_id=ANY($1::bigint[])`,[ids]);
      const deleted={};let r;
      r=await client.query(`DELETE FROM network_publication_images WHERE placement_id=$1 RETURNING id`,[id]);deleted.images=r.rowCount;
      r=await client.query(`DELETE FROM network_verification_runs WHERE placement_id=$1 RETURNING id`,[id]);deleted.verification_runs=r.rowCount;
      r=await client.query(`DELETE FROM network_placement_review_events WHERE placement_id=$1 RETURNING id`,[id]);deleted.review_events=r.rowCount;
      r=await client.query(`DELETE FROM network_publication_versions WHERE placement_id=$1 RETURNING id`,[id]);deleted.publisher_editions=r.rowCount;
      r=await client.query(`DELETE FROM network_placements WHERE id=$1 RETURNING id`,[id]);deleted.placements=r.rowCount;
      const cr=await client.query(`SELECT COUNT(*)::int AS n FROM network_placements WHERE content_id=$1 AND status NOT IN ('cancelled','rejected')`,[p.content_id]);
      const active=Number(cr.rows[0]?.n||0),max=Math.max(1,Number(p.desired_placements)||1);
      const distribution=active===0?'offered':active>=max?'full':'hard_interest';
      const publication=active>=max?'paused':'available';
      await client.query(`UPDATE network_content SET distribution_status=$2,publication_status=$3,updated_at=NOW() WHERE id=$1`,[p.content_id,distribution,publication]);
      await client.query('COMMIT');
      res.json({success:true,deleted,placement_id:id,content_id:p.content_id,opportunity_active_placements:active,opportunity_distribution_status:distribution,message:'Publishing queue item deleted.'});
    }catch(e){try{await client.query('ROLLBACK')}catch(_){}throw e}
    finally{client.release()}
  }));

  app.post('/api/network/admin/placements/:id/approve-prewrite', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});if(!envEnabled())return _networkGenerationConflictV503(res,'network_disabled','Network is disabled',{placement_id:id,retryable:false,next_action:'Enable the Network environment before approval/generation.'});
    const q=await pool.query(`SELECT p.id,p.status,p.content_id,c.prewrite_brief_id,c.title,w.domain AS publisher_domain,w.scan_snapshot AS publisher_scan FROM network_placements p JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id WHERE p.id=$1 LIMIT 1`,[id]),x=q.rows[0];
    if(!x)return res.status(404).json({success:false,error:'Placement not found'});
    const briefId=Number(req.body&&req.body.brief_id||x.prewrite_brief_id||0);
    if(!briefId)return _networkGenerationConflictV503(res,'prewrite_missing','Link a completed Prewrite Brief before approval.',{placement_id:id,placement_status:x.status,retryable:false,next_action:'Link the saved Prewrite Brief to this opportunity first.'});
    if(Number(x.prewrite_brief_id||0)!==briefId)return _networkGenerationConflictV503(res,'prewrite_link_mismatch','The Brief shown in Prewrite is not the Brief currently linked to this opportunity.',{placement_id:id,placement_status:x.status,brief_id:briefId,retryable:false,next_action:'Reopen or link the current Brief for this opportunity, then approve again. Existing research is not deleted.'});
    try{
      const out=await _networkApproveBriefSnapshot(pool,briefId,req.admin&&req.admin.id||'admin',{publisher_domain:x.publisher_domain||'',publisher_checked_url:cleanText(x.publisher_scan&&x.publisher_scan.checked_url||'',2048)});
      const er=await pool.query(`SELECT generation_input_snapshot,generated_at FROM network_publication_versions WHERE placement_id=$1 LIMIT 1`,[id]),existing=er.rows[0]||null,es=safeJsonObject(existing&&existing.generation_input_snapshot),sameGeneration=!!(existing&&existing.generated_at&&Number(es.approved_prewrite_approval_id||0)===Number(out.approval.id)&&String(es.approved_prewrite_hash||'')===String(out.brief_hash));
      res.json({success:true,approval:out.approval,brief_id:briefId,brief_hash:out.brief_hash,readiness:out.readiness,already_generated_from_this_approval:sameGeneration,requires_generation:!sameGeneration,message:sameGeneration?'This exact approved Brief snapshot already generated the current Publisher Edition.':'Brief snapshot approved and locked. Generation may now start from this exact snapshot.'});
    }catch(e){return res.status(Number(e.status)||500).json({success:false,error:e.message,code:Number(e.status)===409?'brief_approval_blocked':'brief_approval_error',stage:'brief_approval',retryable:Number(e.status)===409,next_action:Number(e.status)===409?'Fix only the listed Brief readiness item(s), then approve again. Existing research remains intact.':'Review the server error and retry when resolved.',details:e.details||null});}
  }));

  app.post('/api/network/admin/placements/:id/reopen-editing', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const q=await client.query(`SELECT p.id,p.status,p.content_id,p.published_url,p.verified_at,p.verification_decision,p.verification_note,p.reviewed_at,p.reward_credits,
        w.domain AS publisher_domain
        FROM network_placements p JOIN network_websites w ON w.id=p.publisher_website_id WHERE p.id=$1 LIMIT 1 FOR UPDATE OF p`,[id]);
      const x=q.rows[0];if(!x){await client.query('ROLLBACK');return res.status(404).json({success:false,error:'Placement not found'})}
      const adminId=cleanText(req.admin?.id||req.headers['x-admin-key']||'admin',200);
      const state=String(x.status||'');
      const priorReopen=await client.query(`SELECT id,created_at,metadata FROM network_placement_review_events WHERE placement_id=$1 AND metadata->>'source'='admin_reopen_editing' ORDER BY id DESC LIMIT 1`,[id]);
      const priorVerified=await client.query(`SELECT id,created_at,published_url,note,metadata FROM network_placement_review_events WHERE placement_id=$1 AND event_type='verified' ORDER BY id DESC LIMIT 1`,[id]);
      const partialV537Recovery=!priorReopen.rows[0]&&['accepted','ready','needs_review'].includes(state)&&!!x.published_url&&!!priorVerified.rows[0]&&!x.verified_at&&!x.verification_decision;
      if(!['submitted','verifying','verified'].includes(state)&&!partialV537Recovery){
        await client.query('ROLLBACK');
        if(priorReopen.rows[0]&&['accepted','ready','needs_review'].includes(state))return res.json({success:true,already_reopened:true,placement:x,previous_url:x.published_url||null,previous_status:state,credits_preserved:true,rule:'This Publisher Edition was already reopened for editing. Continue with Refresh all & verify.'});
        return res.status(409).json({success:false,error:'This placement is not in a live-verification state that needs reopening.',code:'reopen_state_not_required',placement_status:state,next_action:['needs_review','ready','accepted'].includes(state)?'Continue editing and use Refresh all & verify.':'Refresh the Publisher Edition state before retrying.'});
      }
      const inferredVerified=priorVerified.rows[0]||null;
      const previous={status:partialV537Recovery?'verified':state,published_url:x.published_url||inferredVerified?.published_url||null,verified_at:x.verified_at||inferredVerified?.created_at||null,verification_decision:x.verification_decision||(inferredVerified?'verified':null),verification_note:x.verification_note||inferredVerified?.note||null,reviewed_at:x.reviewed_at||inferredVerified?.created_at||null};
      const r=partialV537Recovery
        ? await client.query(`UPDATE network_placements SET status='accepted',updated_at=NOW() WHERE id=$1 RETURNING *`,[id])
        : await client.query(`UPDATE network_placements SET status='accepted',verified_at=NULL,verification_decision=NULL,verification_note=NULL,reviewed_by_admin_id=NULL,reviewed_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *`,[id]);
      if(!priorReopen.rows[0])await client.query(`INSERT INTO network_placement_review_events (placement_id,event_type,actor_type,actor_ref,published_url,note,metadata,created_at)
        VALUES ($1,'needs_changes','admin',$2,$3,$4,$5::jsonb,NOW())`,[id,adminId,previous.published_url||null,'Publisher Edition explicitly reopened for editing before regeneration.',JSON.stringify({source:'admin_reopen_editing',reopen_reason:'content_or_policy_changed_after_live_verification',recovered_partial_v537:partialV537Recovery,previous_status:previous.status,previous_url:previous.published_url,previous_verified_at:previous.verified_at,previous_verification_decision:previous.verification_decision,credits_preserved:true,reward_credits:Number(x.reward_credits||0)})]);
      if(x.content_id)await client.query(`UPDATE network_content SET verified_placements=(SELECT COUNT(*)::int FROM network_placements WHERE content_id=$1 AND status='verified'),distribution_status=CASE WHEN EXISTS(SELECT 1 FROM network_placements WHERE content_id=$1 AND status='verified') THEN 'verified' ELSE 'hard_interest' END,updated_at=NOW() WHERE id=$1`,[x.content_id]);
      await client.query('COMMIT');
      res.json({success:true,placement:r.rows[0],previous_url:previous.published_url,previous_status:previous.status,previous_verified_at:previous.verified_at,credits_preserved:true,recovered_partial_reopen:partialV537Recovery,rule:'The live placement was explicitly reopened for editing. Previous verification remains in review history; existing credit transactions are preserved and remain idempotent. Updated content must be republished and verified again.'});
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
  }));

  app.post('/api/network/admin/placements/:id/generate', verifyAdmin, wrap(async (req, res) => {
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    if(!envEnabled())return _networkGenerationConflictV503(res,'network_disabled','Network is disabled',{placement_id:id,retryable:false,next_action:'Enable the Network environment before generating.'});
    const q=await pool.query(`SELECT p.*,c.title,c.brand_name,c.primary_niche,c.owner_website_id,c.prewrite_brief_id,c.source_snapshot,
      w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,w.scan_snapshot AS publisher_scan,
      ow.domain AS owner_domain,ow.brand_name AS owner_brand
      FROM network_placements p
      JOIN network_content c ON c.id=p.content_id
      JOIN network_websites w ON w.id=p.publisher_website_id
      LEFT JOIN network_websites ow ON ow.id=c.owner_website_id
      WHERE p.id=$1 LIMIT 1`,[id]);
    const x=q.rows[0];if(!x)return res.status(404).json({success:false,error:'Placement not found'});
    const requestedApprovalId=Number(req.body&&req.body.approval_id||0)||0;
    if(!['approved','trusted'].includes(x.publisher_status))return _networkGenerationConflictV503(res,'publisher_not_approved','Publisher website is no longer approved',{placement_id:id,placement_status:x.status,brief_id:x.prewrite_brief_id,approval_id:requestedApprovalId,retryable:false,next_action:'Re-run the Network Website Check and approve the publisher website before generation.'});
    if(!(x.publisher_scan&&x.publisher_scan.technical_pass===true))return _networkGenerationConflictV503(res,'publisher_check_failed','Publisher website no longer has a passing Network Website Check',{placement_id:id,placement_status:x.status,brief_id:x.prewrite_brief_id,approval_id:requestedApprovalId,retryable:true,next_action:'Refresh the Network Website Check. Existing Prewrite research remains intact.'});
    if(!x.prewrite_brief_id)return _networkGenerationConflictV503(res,'prewrite_missing','A completed and approved Prewrite Brief is required before Publisher Edition generation.',{placement_id:id,placement_status:x.status,approval_id:requestedApprovalId,retryable:false,next_action:'Link the completed Prewrite Brief to this opportunity.'});
    let approvalCtx;try{approvalCtx=await _networkGetValidApproval(pool,x.prewrite_brief_id,requestedApprovalId)}catch(e){return _networkGenerationConflictV503(res,e.code||'approval_invalid',e.message,{placement_id:id,placement_status:x.status,brief_id:x.prewrite_brief_id,approval_id:requestedApprovalId,retryable:true,next_action:e.code==='approval_stale'?'Approve the exact current Brief snapshot again, then retry generation. No research needs to be rerun.':'Approve the current Brief snapshot, then retry generation.',details:e.details||null});}
    const existing=await pool.query('SELECT * FROM network_publication_versions WHERE placement_id=$1 LIMIT 1',[id]);
    const existingVersion=existing.rows[0]||null,existingSnap=safeJsonObject(existingVersion&&existingVersion.generation_input_snapshot);
    let stateReconciled=false;
    if(!(existingVersion&&existingVersion.generated_at)&&['ready','needs_review'].includes(String(x.status||''))){
      const rr=await pool.query(`UPDATE network_placements SET status='accepted',updated_at=NOW() WHERE id=$1 AND status IN ('ready','needs_review') RETURNING status`,[id]);
      if(rr.rows[0]){x.status='accepted';stateReconciled=true;}
    }
    const forceRegenerate=!!(req.body&&req.body.force_regenerate===true);
    const exactApprovedGeneration=!!(existingVersion&&existingVersion.generated_at&&Number(existingSnap.approved_prewrite_approval_id||0)===Number(approvalCtx.approval.id)&&String(existingSnap.approved_prewrite_hash||'')===String(approvalCtx.brief_hash));
    const autoRegenerate=!!(existingVersion&&existingVersion.generated_at&&!exactApprovedGeneration);
    const isRegeneration=!!(existingVersion&&existingVersion.generated_at&&(forceRegenerate||autoRegenerate));
    if(existingVersion&&existingVersion.generated_at&&exactApprovedGeneration&&!forceRegenerate){
      return res.json({success:true,already_generated:true,publication_version_id:existingVersion.id,status:x.status,approved_prewrite_approval_id:approvalCtx.approval.id,rule:'This exact approved Brief snapshot already generated the current Publisher Edition.'});
    }
    if(x.status==='generating'){
      const ageMs=Date.now()-new Date(x.updated_at||0).getTime();
      if(Number.isFinite(ageMs)&&ageMs>20*60*1000){
        const recoverTo=existingVersion&&existingVersion.generated_at?'ready':'accepted';
        await pool.query(`UPDATE network_placements SET status=$2,updated_at=NOW() WHERE id=$1 AND status='generating'`,[id,recoverTo]);x.status=recoverTo;stateReconciled=true;
      }else return _networkGenerationConflictV503(res,'generation_in_progress','Publisher Edition generation is already running. Wait for it to finish instead of starting another paid generation.',{placement_id:id,placement_status:x.status,brief_id:x.prewrite_brief_id,approval_id:approvalCtx.approval.id,retryable:true,next_action:'Wait for the running generation to finish. If it remains stuck for more than 20 minutes, retry; ContentScale will recover the stale state automatically.',details:{updated_at:x.updated_at||null}});
    }
    if(!isRegeneration&&x.status!=='accepted')return _networkGenerationConflictV503(res,'placement_not_accepted','This placement cannot start a first generation from its current state.',{placement_id:id,placement_status:x.status,brief_id:x.prewrite_brief_id,approval_id:approvalCtx.approval.id,retryable:false,next_action:'Return the placement to the accepted publishing workflow before starting its first Publisher Edition.'});
    if(isRegeneration&&!['ready','accepted','needs_review'].includes(x.status))return _networkGenerationConflictV503(res,'regeneration_state_blocked','This Publisher Edition cannot be regenerated from its current placement state.',{placement_id:id,placement_status:x.status,brief_id:x.prewrite_brief_id,approval_id:approvalCtx.approval.id,retryable:false,next_action:['submitted','verifying','verified'].includes(String(x.status||''))?'The publication has moved into live verification. Do not silently replace it; explicitly reopen it for editing first.':'Review the placement state in Network Publishing before retrying.'});
    if(x.source_link_required===true&&!x.owner_domain)return _networkGenerationConflictV503(res,'source_link_missing','This placement requires a source link, but the opportunity has no source website.',{placement_id:id,placement_status:x.status,brief_id:x.prewrite_brief_id,approval_id:approvalCtx.approval.id,retryable:false,next_action:'Add or recreate the opportunity with its source website. Existing Prewrite research can remain.'});

    const claimed=isRegeneration
      ? await pool.query(`UPDATE network_placements SET status='generating',updated_at=NOW() WHERE id=$1 AND status IN ('ready','accepted','needs_review') RETURNING id`,[id])
      : await pool.query(`UPDATE network_placements SET status='generating',updated_at=NOW() WHERE id=$1 AND status='accepted' RETURNING id`,[id]);
    if(!claimed.rows[0])return _networkGenerationConflictV503(res,'placement_state_race',isRegeneration?'Regeneration was already started or the placement state changed':'Placement generation was already started by another request',{placement_id:id,placement_status:x.status,brief_id:x.prewrite_brief_id,approval_id:approvalCtx.approval.id,retryable:true,next_action:'Refresh the Publisher Edition state and retry once. ContentScale will not start a duplicate paid generation.'});
    try{
      const snap=x.source_snapshot||{};
      const language=cleanText(snap.language||'en-US',30),country=cleanText(snap.country||'',120),subNiche=cleanText(snap.sub_niche||'',120),pitch=cleanText(snap.pitch||'',1400);
      const ownerUrl=x.owner_domain?`https://${x.owner_domain}`:'';
      const prewriteIntel=Object.assign({},approvalCtx.brief,{brief_json:approvalCtx.brief_snapshot});
      const seedKeyword=cleanText(prewriteIntel&&prewriteIntel.keyword||'',220);
      const prewriteText=JSON.stringify(approvalCtx.brief_snapshot||{}).slice(0,48000),prewriteHash=approvalCtx.brief_hash;
      const fiveAiResearch=_networkFiveAiResearchV500(approvalCtx.brief_snapshot||{});
      if(!fiveAiResearch.complete)throw new Error('Approved Brief lost five-system AI research integrity. Reopen the Brief and complete the missing AI evidence before generation.');
      const googleManual=safeJsonObject(snap.google_manual);
      const generationLinkIntel=linkIntelligenceFromSources({source_domain:x.owner_domain||'',publisher_domain:x.publisher_domain||''},prewriteIntel);
      const _approvedInternalTarget=Array.isArray(approvalCtx.brief_snapshot&&approvalCtx.brief_snapshot.internal_link_targets)?approvalCtx.brief_snapshot.internal_link_targets.find(t=>t&&_networkReaderInternalUrlV500(t.link_to,x.publisher_domain)):null;
      const _requiredInternalUrl=_approvedInternalTarget&&_approvedInternalTarget.link_to||'';
      const _priorManualTargets=Array.isArray(existingSnap&&existingSnap.link_intelligence&&existingSnap.link_intelligence.manual_internal_targets)?existingSnap.link_intelligence.manual_internal_targets:[];
      generationLinkIntel.internal=Array.from(new Set([_requiredInternalUrl].filter(Boolean).concat(_priorManualTargets,generationLinkIntel.internal||[]))).slice(0,30);
      if(generationLinkIntel.internal.length<3&&x.publisher_domain){
        try{
          const discovered=await _networkDiscoverInternalCandidatesV523({publisher_domain:x.publisher_domain,topic:[x.title,x.primary_niche,prewriteIntel&&prewriteIntel.keyword].filter(Boolean).join(' '),start_url:cleanText(x.publisher_scan&&x.publisher_scan.checked_url||'',2048),current_slug:existingVersion&&existingVersion.suggested_slug||''});
          generationLinkIntel.internal=Array.from(new Map(generationLinkIntel.internal.concat(discovered.candidates||[]).map(u=>[_briefUrlKey(u),u])).values()).slice(0,5);
          generationLinkIntel.publisher_discovery_used=true;generationLinkIntel.publisher_discovery_source=discovered.source;
        }catch(_e){generationLinkIntel.publisher_discovery_used=false}
      }
      if(generationLinkIntel.internal.length<3&&x.publisher_domain){
        let home='';try{const c=new URL(cleanText(x.publisher_scan&&x.publisher_scan.checked_url||'',2048));if(normalizeHost(c.hostname)===normalizeHost(x.publisher_domain))home=c.origin+'/';}catch(_e){}if(!home)home='https://'+normalizeHost(x.publisher_domain)+'/';
        if(!generationLinkIntel.internal.some(u=>_briefUrlKey(u)===_briefUrlKey(home)))generationLinkIntel.internal.push(home);generationLinkIntel.internal=generationLinkIntel.internal.slice(0,5);generationLinkIntel.publisher_homepage_fallback=true;generationLinkIntel.internal_selection_reason='Homepage is retained only as a last-resort candidate while three verified same-domain URLs are required.';
      }
      generationLinkIntel.external=await _networkVerifyExternalCandidatesV523(generationLinkIntel.external||[],x.publisher_domain,x.owner_domain||'',5);
      const approvedBriefContract=(approvalCtx.contract&&Object.keys(approvalCtx.contract).length)?approvalCtx.contract:buildApprovedBriefContract(approvalCtx.brief_snapshot||{});
      if(prewriteIntel&&approvedBriefContract&&(approvedBriefContract.evidence_research_completed!==true||approvedBriefContract.evidence_quality_completed!==true)){
        throw new Error('Linked Prewrite Brief must be regenerated with the Evidence Quality Ladder before Publisher Edition generation. ContentScale will not treat unsearched or ungraded evidence as publication-ready.');
      }
      const prompt=`Create ONE original, publication-grade Publisher Edition for an external website. Follow the ContentScale Publication Standard.

APPROVED PREWRITE BRIEF = CONTENT CONTRACT:
- The linked approved Prewrite is not optional inspiration. Execute its planned H2 coverage, real PAA/FAQ questions, entity coverage, evidence/citation hooks, limitations and practical use cases when present.
- INTENT CONTRACT: ${JSON.stringify(approvedBriefContract&&approvedBriefContract.intent_contract||{}).slice(0,2600)}
- The live-SERP PRIMARY intent controls the dominant page format. SECONDARY intent is a real user need to satisfy inside that format, not a reason to silently turn the article into another page type.
- QUERY FORMAT is separate from funnel intent. A vs/comparison query is not automatically commercial. For informational comparisons, teach and compare first; for commercial comparisons, support the decision transparently.
- When intent_bridge is present, execute that bridge in the article: preserve the secondary need through criteria, trade-offs, next-step guidance or explanation as specified, without weakening the primary SERP fit.
- planned_h2s / definitive_outline in the approved contract are the authoritative article structure. Use every planned H2 exactly once, in exactly that order. You may use H3s inside a planned H2, but do not rename, merge, omit, split or reorder the planned H2s.
- Do not silently omit a planned Brief item. If evidence is insufficient for a claim, keep the section but state the limitation without inventing facts.
- Use the exact evidence/source URLs supplied by the Brief where the Brief asks for a citation. Do not replace them with invented URLs.
- Internal links are internal only when they point to the PUBLISHER domain (${x.publisher_domain}). Owner/source-domain links are external evidence from the publisher's perspective.
- Exact approved contract summary: ${JSON.stringify(approvedBriefContract||{}).slice(0,18000)}
- Publisher-internal URL candidates found in the approved evidence: ${JSON.stringify(generationLinkIntel.internal||[]).slice(0,6000)}
- External evidence URL candidates found in the approved evidence: ${JSON.stringify(generationLinkIntel.external||[]).slice(0,9000)}

FIVE-SYSTEM AI RESEARCH — ALL FIVE ARE REQUIRED AND WERE SAVED BEFORE APPROVAL:
${JSON.stringify(fiveAiResearch).slice(0,10000)}
- Use recurring user needs, definitions, caveats and source patterns across the five saved systems to strengthen the article where they are supported by the Brief/evidence.
- Do not claim that the five systems agree unless the saved summaries actually support the same point.
- Google AI Overview findings remain Google-only; ChatGPT, Perplexity, Claude and Copilot evidence must not be relabelled as Google AIO evidence.

STRICT OUTPUT:
- Return JSON only with keys: title, html, plain_text, meta_title, meta_description, suggested_slug, schema_json.
- HTML must be real semantic HTML intended to be published directly in the publisher page source. It must NOT require JavaScript to reveal the article.
- Language: ${language}. Market/country context: ${country||'not specified'}.
- Publisher website: ${x.publisher_domain}. Publisher niche: ${x.primary_niche||''}${subNiche?' / '+subNiche:''}.
- Working H1/topic: ${x.title}.
- Short opportunity pitch: ${pitch}.
- Brand/entity to mention naturally: ${x.brand_name||x.owner_brand||''}.
- Required source/owner link: ${ownerUrl}. Include that exact link naturally once where useful.

CONTENTSCALE WRITING STYLE:
- Direct answer first. Short, decisive paragraphs. No generic AI introduction and no filler conclusion.
- Explain practical consequences, use concrete examples, and use Key Point / Common Mistake callouts only when useful.
- Use the approved planned H2 headings exactly as locked in the Brief. Add H3s/examples inside them when useful; do not invent or rename H2s during writing.
- Never invent claims to make the article sound authoritative.

REQUIRED ARTICLE STRUCTURE:
- One H1.
- Immediately after the H1, a 40-60 word direct answer inside <div class="cs-direct-answer">.
- A concise TL;DR / Key Takeaways block inside <div class="cs-tldr">.
- A real linked table of contents inside <nav class="cs-toc"> using anchor links to the H2 ids.
- Use FULL APPROVED CONTRACT.planned_h2s exactly once, in the approved order, with stable id attributes. Reach depth inside those sections with H3s, examples, evidence and explanation; do not add unapproved H2s.
- At least ONE meaningful mobile-friendly table wrapped exactly as <div class="cs-table-wrap"><table class="cs-table">...</table></div>. Prefer a statistics table when verified statistics exist. If no verified statistics exist, use a factual comparison/decision table without inventing numbers.
- Add a FAQ section only when FULL APPROVED CONTRACT.faq_questions contains approved questions. Use those exact approved questions; do not invent extra FAQ questions to reach a quota. Use <section class="cs-faq"> with each approved question as H3 followed immediately by its answer in one P.

EVIDENCE RULES:
- Do NOT invent years in business, certifications, prices, ratings, guarantees, locations, service claims, statistics, customer counts, case studies, expert quotes or research findings.
- The Prewrite completed the Evidence Quality Ladder. FULL APPROVED CONTRACT.statistics preserves source quality metadata; prefer best_source_url for a statistic when provenance_resolved/primary_verified is true. Use relevant statistics naturally (normally 1-3, never as a quota).
- FULL APPROVED CONTRACT.expert_quotes contains exact source-verified direct quotes. Preserve wording and attribution; render a useful one as <blockquote> with a <cite> linking to source_url. Do not fabricate or embellish a person's role.
- FULL APPROVED CONTRACT.expert_insights contains verified attributed PARAPHRASES backed by exact source excerpts. Use them only as attributed prose with source links; never put them in quotation marks or call them quotes.
- When several sources support the same claim, prefer primary_verified, academic/government/original-research provenance, then provenance_resolved, then source_verified secondary material. Competitor sources are gap/context evidence, not the default authority.
- If the research pass found zero direct quotes but verified attributed insights, use those correctly rather than inventing a quote. If research found no usable expert evidence at all after the required verification depth, do not manufacture substitutes.
- Case studies may appear only when supplied as real case evidence. Otherwise omit them.
- Internal links: include at least 3 UNIQUE contextual links to exact publisher-internal candidates supplied below. Use 3-5 when available; three current verified candidates are mandatory before Ready. Prefer specific relevant pages; use the verified publisher homepage only as a fallback. Use natural varied anchor text. Never invent, reconstruct or substitute an internal URL.
- External links: include at least 3 UNIQUE contextual external evidence/source links; three current verified URLs are mandatory and up to 5 may be used when relevant. Use only exact external URLs supplied by Prewrite/source evidence. Use descriptive natural anchors and never invent an external URL.
- If evidence is missing, write the useful section without the unsupported claim instead of guessing.

SEO / TECHNICAL:
- FOCUS / SEED KEYWORD: ${seedKeyword||'not specified'}.
- When a seed keyword exists, suggested_slug MUST be exactly the slugified seed keyword and nothing longer.
- Use the exact seed keyword phrase naturally in meta_title and meta_description.
- Use the exact seed keyword phrase naturally in the first 10% of body content and in at least one H2/H3/H4. Do not rename locked approved H2s merely for SEO; use a useful H3 when needed.
- Repeat the exact seed phrase naturally across the body several times for topical clarity; do not keyword-stuff. For long-form content, one occurrence is not enough.
- Image SEO is handled by ContentScale metadata: every uploaded image needs descriptive alt text and one image alt must contain the exact seed keyword plus additional descriptive words. Do not fabricate an image description in article HTML.
- Aim for genuine in-depth coverage. APPROVED BRIEF target words: ${approvedBriefContract&&approvedBriefContract.target_words||'not specified'}. Minimum useful words for this Brief: ${approvedBriefContract&&approvedBriefContract.minimum_useful_words||1200}. Never pad with filler; satisfy depth by executing the planned sections, evidence, examples, limitations, comparison and FAQs.
- Allowed HTML includes article, section, nav, div, h1, h2, h3, p, ul, ol, li, strong, em, blockquote, cite, a, table, thead, tbody, tr, th, td. No script/style/iframe/form/input/button.
- schema_json must be a valid Article JSON object, not a script tag. FAQ schema is generated from a real cs-faq section by ContentScale.
- meta_title must be no longer than 60 characters. meta_description must be 140-160 characters; aim for 150-159 when the wording stays natural.
- Do not add a ContentScale credit yourself; the publication layer adds the controlled attribution.
- Do not promise rankings, AI citations or outcomes.

PREWRITE INTELLIGENCE (READ-ONLY; use only facts/URLs actually present):
${prewriteText||'No linked Prewrite Brief. Do not invent research, statistics, quotes or URLs.'}

MANUAL GOOGLE NOTES:
${JSON.stringify(googleManual||{}).slice(0,4000)}`;
      let ai=await callNetworkGemini(prompt),d=ai.parsed||{};
      let title=cleanText(d.title||x.title,300);
      let html=ensureContentScaleAttribution(d.html||'',id);
      let plain=cleanText(d.plain_text||htmlText(html),50000);
      if(!title||htmlText(html).split(/\s+/).filter(Boolean).length<250)throw new Error('Generated edition failed minimum content quality check');
      let briefFidelity=prewriteIntel?checkApprovedBriefFidelity(html,prewriteIntel.brief_json||{},{publisher_domain:x.publisher_domain,internal_candidates:generationLinkIntel.internal||[],required_internal_url:_requiredInternalUrl,approved_contract:approvedBriefContract}):{passed:true,missing:[],groups:{},contract:null,counts:{}};
      let repairUsed=false;
      if(prewriteIntel&&!briefFidelity.passed){
        repairUsed=true;
        const repairPrompt=`Repair the existing Publisher Edition so it fully honors the APPROVED Prewrite Brief. Do not discard good content and do not add unsupported claims. Return JSON only with keys: title, html, plain_text, meta_title, meta_description, suggested_slug, schema_json.

STRICT RULES:
- The approved Brief is a content contract. Every missing contract item listed below must be resolved in the article unless the Brief itself says evidence is unavailable.
- If definitive_outline or outline_order is missing, rebuild the H2 structure to match FULL APPROVED CONTRACT.planned_h2s exactly once and in exact order; preserve useful existing content under the correct canonical H2 instead of dropping it.
- Preserve factual accuracy. Never invent statistics, URLs, case studies, quotes, outcomes or first-hand experience.
- Preserve one H1, direct answer, TL;DR, linked TOC, useful table and semantic HTML.
- If depth is listed as missing, expand the useful planned sections until FULL APPROVED CONTRACT.minimum_useful_words is met, aiming toward target_words. Do not add filler or unsupported facts.
- Answer the exact real PAA/FAQ questions from the Brief when they are missing.
- Include planned H2 topics from the Brief; wording may be natural but the topic may not disappear.
- If entities is listed as missing, explicitly include every item in MISSING CONTRACT GROUPS.entities in natural factual prose. Preserve the recognizable entity name; do not replace it with a vague synonym. Do not invent claims about the entity.
- Include the Brief's required evidence URLs as contextual links supporting the claims they belong to.
- If statistics is listed as missing, incorporate the approved statistic from FULL APPROVED CONTRACT.statistics; cite best_source_url when available, otherwise source_url. Do not add unverified numbers.
- If expert_quotes is listed as missing, incorporate a verified direct quote from FULL APPROVED CONTRACT.expert_quotes as a real <blockquote> with named attribution and source_url.
- If expert_insights is listed as missing, incorporate an approved expert insight as attributed prose with source_url. It is paraphrase_only and must never be rendered as a quotation.
- If evidence_quality is listed as missing, stop: the linked Brief is stale and must be regenerated rather than repaired by the writer.
- If internal_links is listed as missing, bring the article to at least 3 UNIQUE contextual publisher-domain internal links using exact URLs from PUBLISHER INTERNAL CANDIDATES. Target 3-5 when enough relevant candidates exist. Prefer specific pages; homepage is fallback only. Use natural varied anchors. Never invent, reconstruct or substitute an internal URL.
- Do not add a ContentScale attribution; the publication layer controls it.

MISSING CONTRACT GROUPS:
${JSON.stringify(briefFidelity.groups).slice(0,18000)}

FULL APPROVED CONTRACT:
${JSON.stringify(briefFidelity.contract).slice(0,18000)}

PUBLISHER INTERNAL CANDIDATES:
${JSON.stringify(generationLinkIntel.internal||[]).slice(0,6000)}

CURRENT ARTICLE JSON:
${JSON.stringify({title,html,plain_text:plain,meta_title:d.meta_title||'',meta_description:d.meta_description||'',suggested_slug:d.suggested_slug||'',schema_json:d.schema_json||{}}).slice(0,52000)}`;
        const repaired=await callNetworkGemini(repairPrompt),rd=repaired.parsed||{};
        d=Object.assign({},d,rd);ai={parsed:d,model:repaired.model||ai.model};
        title=cleanText(d.title||title||x.title,300);
        html=ensureContentScaleAttribution(d.html||html,id);
        plain=cleanText(d.plain_text||htmlText(html),50000);
        briefFidelity=checkApprovedBriefFidelity(html,prewriteIntel.brief_json||{},{publisher_domain:x.publisher_domain,internal_candidates:generationLinkIntel.internal||[],required_internal_url:_requiredInternalUrl,approved_contract:approvedBriefContract});
      }
      if(prewriteIntel&&!briefFidelity.passed){
        await pool.query(`UPDATE network_placements SET status=$2,updated_at=NOW() WHERE id=$1 AND status='generating'`,[id,isRegeneration?'ready':'accepted']).catch(()=>{});
        return res.status(422).json({success:false,error:'Publisher Edition still misses approved Brief requirements after targeted repair: '+briefFidelity.missing.join(', ')+'. Existing Publisher Edition was left unchanged.',missing:briefFidelity.missing,details:briefFidelity.groups||{},counts:briefFidelity.counts||{},research_rerun:false,saved:false});
      }
      const _approvedMeta=safeJsonObject(approvalCtx.brief_snapshot&&approvalCtx.brief_snapshot.meta_package),_approvedMetaTitle=cleanText(_approvedMeta.seo_title||'',60),_approvedMetaDesc=cleanText(_approvedMeta.meta_description||'',160);
      let metaTitle=_networkSeedMetaTitleV515(seedKeyword,_approvedMetaTitle||cleanText(d.meta_title||title,60));
      let metaDescription=_networkSeedMetaDescriptionV515(seedKeyword,(_approvedMetaDesc.length>=140&&_approvedMetaDesc.length<=160)?_approvedMetaDesc:cleanText(d.meta_description||'',160));
      let slug=seedKeyword?slugifyNetwork(seedKeyword):slugifyNetwork(d.suggested_slug||title);
      if(!metaTitle||metaTitle.length>60||metaDescription.length<140||metaDescription.length>160)throw new Error('SEO meta policy failed after generation: title must be 1-60 characters and meta description 140-160 characters. Edit/finalize the Prewrite SEO Package before approval.');
      let _seedChecks=_networkSeedKeywordChecksV515({html,meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,generation_input_snapshot:{prewrite_keyword:seedKeyword}},[],seedKeyword);
      if(seedKeyword&&!_seedChecks.passed){
        const _seedRepairPrompt=`SURGICAL SEED-KEYWORD SEO REPAIR. Preserve all approved facts, citations, H2 order and useful content. Return JSON only with keys: title, html, plain_text, meta_title, meta_description, suggested_slug, schema_json.

EXACT SEED KEYWORD: ${seedKeyword}
CURRENT CHECKS: ${JSON.stringify(_seedChecks)}

RULES:
- Keep every approved H2 exactly as locked; do NOT rename approved H2s.
- Put the exact seed phrase naturally in at least one useful H3 or H4 if no approved H2 already contains it.
- Put the exact seed phrase naturally in the first 10% of body content.
- Use the exact seed phrase naturally at least ${_seedChecks.minimum_exact_body_mentions||4} times across the body; avoid stuffing and awkward repetition.
- meta_title must contain the exact seed and stay <=60 characters.
- meta_description must contain the exact seed and stay 140-160 characters.
- suggested_slug must be exactly ${slugifyNetwork(seedKeyword)}.
- Do not invent facts, URLs, statistics, quotes, claims or research.

APPROVED CONTRACT:
${JSON.stringify(approvedBriefContract||{}).slice(0,18000)}

CURRENT ARTICLE:
${JSON.stringify({title,html,plain_text:plain,meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,schema_json:d.schema_json||{}}).slice(0,52000)}`;
        const _seedRepair=await callNetworkGemini(_seedRepairPrompt),_sd=safeJsonObject(_seedRepair&&_seedRepair.parsed);
        if(_sd.html){html=ensureContentScaleAttribution(_sd.html,id);plain=cleanText(_sd.plain_text||htmlText(html),50000);title=cleanText(_sd.title||title,300);d=Object.assign({},d,_sd);}
        metaTitle=_networkSeedMetaTitleV515(seedKeyword,cleanText(_sd.meta_title||metaTitle,60));
        metaDescription=_networkSeedMetaDescriptionV515(seedKeyword,cleanText(_sd.meta_description||metaDescription,160));
        slug=slugifyNetwork(seedKeyword);
        briefFidelity=checkApprovedBriefFidelity(html,prewriteIntel.brief_json||{},{publisher_domain:x.publisher_domain,internal_candidates:generationLinkIntel.internal||[],required_internal_url:_requiredInternalUrl,approved_contract:approvedBriefContract});
        _seedChecks=_networkSeedKeywordChecksV515({html,meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,generation_input_snapshot:{prewrite_keyword:seedKeyword}},[],seedKeyword);
        if(!briefFidelity.passed||!_seedChecks.passed){
          await pool.query(`UPDATE network_placements SET status=$2,updated_at=NOW() WHERE id=$1 AND status='generating'`,[id,isRegeneration?'ready':'accepted']).catch(()=>{});
          return res.status(422).json({success:false,error:'Publisher Edition still misses deterministic SEO/Approved Brief requirements after targeted repair. Existing Publisher Edition was left unchanged.',missing_brief:briefFidelity.missing||[],seed_keyword_policy:_seedChecks,research_rerun:false,saved:false});
        }
      }
      let _generationLinkPolicy=_networkPublicationLinkPolicyV522({html,publisher_domain:x.publisher_domain,source_domain:x.owner_domain||''},{publisher_domain:x.publisher_domain,source_domain:x.owner_domain||'',internal_candidates:generationLinkIntel.internal||[],external_candidates:generationLinkIntel.external||[]});
      if(!_generationLinkPolicy.passed&&_generationLinkPolicy.internal.candidate_count>=3&&_generationLinkPolicy.external.candidate_count>=3){
        const _detLink=_networkDeterministicLinkRepairV526(html,_generationLinkPolicy,generationLinkIntel.internal||[],generationLinkIntel.external||[]);
        if(_detLink.changed){html=ensureContentScaleAttribution(_detLink.html,id);plain=cleanText(htmlText(html),50000);briefFidelity=checkApprovedBriefFidelity(html,prewriteIntel.brief_json||{},{publisher_domain:x.publisher_domain,internal_candidates:generationLinkIntel.internal||[],required_internal_url:_requiredInternalUrl,approved_contract:approvedBriefContract});_seedChecks=_networkSeedKeywordChecksV515({html,meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,generation_input_snapshot:{prewrite_keyword:seedKeyword}},[],seedKeyword);_generationLinkPolicy=_networkPublicationLinkPolicyV522({html,publisher_domain:x.publisher_domain,source_domain:x.owner_domain||''},{publisher_domain:x.publisher_domain,source_domain:x.owner_domain||'',internal_candidates:generationLinkIntel.internal||[],external_candidates:generationLinkIntel.external||[]});}
      }
      if(!_generationLinkPolicy.passed&&_generationLinkPolicy.internal.candidate_count>=3&&_generationLinkPolicy.external.candidate_count>=3){
        const _linkRepairPrompt=`SURGICAL PUBLICATION LINK POLICY REPAIR. Preserve the approved article, facts, H2 order, citations, seed-keyword placement and useful content. Return JSON only with keys: title, html, plain_text, meta_title, meta_description, suggested_slug, schema_json.

PUBLICATION LINK POLICY:
- At least 3 UNIQUE contextual internal links to the publisher domain are required; three are mandatory; use up to 5 when genuinely relevant candidates exist.
- At least 3 UNIQUE contextual external editorial/evidence links are required; three are mandatory; use up to 5 when strong candidates exist.
- Use natural varied anchor text. Homepage is internal fallback only.
- Use ONLY exact URLs from the candidate lists below. Never invent, reconstruct, shorten or replace a URL.
- Do not change facts, approved H2 order, meta intent or seed-keyword policy.

CURRENT POLICY:
${JSON.stringify(_generationLinkPolicy).slice(0,8000)}

PUBLISHER INTERNAL CANDIDATES:
${JSON.stringify(generationLinkIntel.internal||[]).slice(0,8000)}

APPROVED EXTERNAL CANDIDATES:
${JSON.stringify(generationLinkIntel.external||[]).slice(0,10000)}

CURRENT ARTICLE:
${JSON.stringify({title,html,plain_text:plain,meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,schema_json:d.schema_json||{}}).slice(0,52000)}`;
        const _lr=await callNetworkGemini(_linkRepairPrompt),_ld=safeJsonObject(_lr&&_lr.parsed);
        if(_ld.html){html=ensureContentScaleAttribution(_ld.html,id);plain=cleanText(_ld.plain_text||htmlText(html),50000);title=cleanText(_ld.title||title,300);d=Object.assign({},d,_ld);}
        briefFidelity=checkApprovedBriefFidelity(html,prewriteIntel.brief_json||{},{publisher_domain:x.publisher_domain,internal_candidates:generationLinkIntel.internal||[],required_internal_url:_requiredInternalUrl,approved_contract:approvedBriefContract});
        _seedChecks=_networkSeedKeywordChecksV515({html,meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,generation_input_snapshot:{prewrite_keyword:seedKeyword}},[],seedKeyword);
        _generationLinkPolicy=_networkPublicationLinkPolicyV522({html,publisher_domain:x.publisher_domain,source_domain:x.owner_domain||''},{publisher_domain:x.publisher_domain,source_domain:x.owner_domain||'',internal_candidates:generationLinkIntel.internal||[],external_candidates:generationLinkIntel.external||[]});
        if(!briefFidelity.passed||!_seedChecks.passed){
          await pool.query(`UPDATE network_placements SET status=$2,updated_at=NOW() WHERE id=$1 AND status='generating'`,[id,isRegeneration?'ready':'accepted']).catch(()=>{});
          return res.status(422).json({success:false,error:'Publisher Edition still misses deterministic Approved Brief / seed-keyword requirements after targeted repair. Existing Publisher Edition was left unchanged.',missing:briefFidelity.missing||[],link_policy:_generationLinkPolicy,seed_keyword_policy:_seedChecks,research_rerun:false,saved:false});
        }
      }
      const schema=(d.schema_json&&typeof d.schema_json==='object')?d.schema_json:{};
      const token=crypto.randomBytes(32).toString('hex');
      const defaultAuthorName=cleanText(x.owner_brand||x.brand_name||'',200);
      const _existingSnap=safeJsonObject(existingVersion&&existingVersion.generation_input_snapshot);
      const _existingSettings=getPublicationSettings(_existingSnap,{author_name:defaultAuthorName,author_url:ownerUrl});
      const generationSnapshot={network_kind:'publisher_edition',delivery_token:token,protection_mode:'seo_indexable_html',content_scale_marker_required:true,source_link:ownerUrl,publisher_domain:x.publisher_domain,language,country,generated_by_admin_id:req.admin&&req.admin.id||null,approved_prewrite_approval_id:Number(approvalCtx.approval.id),approved_prewrite_hash:prewriteHash,approved_prewrite_at:approvalCtx.approval.approved_at||null,prewrite_brief_id:x.prewrite_brief_id||null,prewrite_used:true,prewrite_hash:prewriteHash,prewrite_created_at:prewriteIntel&&prewriteIntel.created_at||null,prewrite_keyword:seedKeyword||prewriteIntel&&prewriteIntel.keyword||null,prewrite_requires_regeneration:false,approved_brief_contract:approvedBriefContract,seed_keyword_policy:_seedChecks||null,publication_link_policy:_generationLinkPolicy||null,brief_fidelity:{passed:!!briefFidelity.passed,missing:briefFidelity.missing||[],groups:briefFidelity.groups||{},counts:briefFidelity.counts||{},repair_used:repairUsed,checked_at:new Date().toISOString()},link_intelligence:{publisher_internal_candidates:generationLinkIntel.internal||[],manual_internal_targets:_priorManualTargets,external_candidates:generationLinkIntel.external||[]},regenerated_from_version:isRegeneration?(existingVersion&&existingVersion.id||null):null,regenerated_at:isRegeneration?new Date().toISOString():null,google_manual_only:true,publication_settings:isRegeneration?_existingSettings:{primary_color:'#111827',accent_color:'#2563eb',author_type:'company',author_name:defaultAuthorName,author_url:ownerUrl,author_bio:'',author_job_title:'',image_mode:'prompt_only'}};
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const vr=await client.query(`INSERT INTO network_publication_versions (placement_id,content_id,publisher_website_id,version_no,title,html,plain_text,meta_title,meta_description,suggested_slug,schema_json,generation_input_snapshot,generation_model,quality_status,generated_at,created_at,updated_at)
          VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,'needs_review',NOW(),NOW(),NOW())
          ON CONFLICT (placement_id) DO UPDATE SET title=EXCLUDED.title,html=EXCLUDED.html,plain_text=EXCLUDED.plain_text,meta_title=EXCLUDED.meta_title,meta_description=EXCLUDED.meta_description,suggested_slug=EXCLUDED.suggested_slug,schema_json=EXCLUDED.schema_json,generation_input_snapshot=EXCLUDED.generation_input_snapshot,generation_model=EXCLUDED.generation_model,quality_status='needs_review',generated_at=NOW(),updated_at=NOW()
          RETURNING id,title,meta_title,meta_description,suggested_slug,quality_status,generated_at`,[id,x.content_id,x.publisher_website_id,title,html,plain,metaTitle,metaDescription,slug,JSON.stringify(schema),JSON.stringify(generationSnapshot),ai.model]);
        await client.query(`UPDATE network_placements SET status='ready',updated_at=NOW() WHERE id=$1`,[id]);
        await client.query(`UPDATE network_content SET source_snapshot=jsonb_set(COALESCE(source_snapshot,'{}'::jsonb),'{full_article_generated}','true'::jsonb,true),distribution_status='edition_ready',updated_at=NOW() WHERE id=$1`,[x.content_id]);
        await client.query('COMMIT');
        res.json({success:true,placement_id:id,status:'ready',publication_version:vr.rows[0],protection_mode:generationSnapshot.protection_mode,seo_html_available:true,state_reconciled:stateReconciled,rule:'Publisher Edition created for SEO-indexable HTML publication. Final placements must expose the article in the publisher page source; JavaScript-only delivery does not qualify.'});
      }catch(e){try{await client.query('ROLLBACK')}catch(_){}throw e}finally{client.release()}
    }catch(e){
      await pool.query(`UPDATE network_placements SET status=$2,updated_at=NOW() WHERE id=$1 AND status='generating'`,[id,isRegeneration?'ready':'accepted']).catch(()=>{});
      throw e;
    }
  }));

  // PUBLICATION PACKAGE — author, style, image prompts/uploads, schema and ContentScore.
  app.get('/api/network/admin/publications/:placementId/package', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT p.id AS placement_id,p.status,p.published_url,p.verification_decision,p.verification_note,p.submitted_at,p.verified_at,p.source_link_required,p.brand_mention_required,
      c.brand_name,c.title AS opportunity_title,c.primary_niche,c.source_snapshot,c.prewrite_brief_id AS current_prewrite_brief_id,
      w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,
      ow.domain AS source_domain,ow.brand_name AS source_brand,
      pv.* FROM network_placements p JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id
      JOIN network_publication_versions pv ON pv.placement_id=p.id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE p.id=$1 LIMIT 1`,[id]);
    const row=r.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const headings=extractH2Headings(row.html);
    const ir=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]);
    let images=ir.rows;
    const _normalizeDraftToken=v=>String(v==null?'':v).toLowerCase().replace(/&amp;/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    const _expectedDraftSubject=img=>{
      if(!img)return '';
      if(String(img.image_role||'featured')==='featured')return cleanText(row.title||'',300);
      const m=String(img.placement_hint||'').match(/^before-h2-num:(\d+)$/);
      if(!m)return '';
      const h=headings.find(x=>Number(x.number)===Number(m[1]||0));
      return cleanText(h&&h.text||'',300);
    };
    // v502: never delete or hide an image draft merely because article/H2 selection changed.
    // Images are an optional owner-controlled workflow. Surface mismatch context in the UI, but keep the draft usable.
    const staleDraftIds=images.filter(img=>String(img.status||'')==='prompt_ready').filter(img=>_normalizeDraftToken(img.image_name)!==_normalizeDraftToken(_expectedDraftSubject(img))).map(img=>Number(img.id||0)).filter(Boolean);
    const quality=scorePublication(row,images);
    const settings=getPublicationSettings(row.generation_input_snapshot,{author_name:row.source_brand||row.brand_name||'',author_url:row.source_domain?`https://${row.source_domain}`:''});
    await pool.query(`UPDATE network_publication_versions SET quality_status=$2,updated_at=NOW() WHERE id=$1`,[row.id,quality.status]).catch(()=>{});
    const renderedPackage=renderEditionHtml(row,images);
    const snapForInternal=safeJsonObject(row.generation_input_snapshot);
    const internalToken=cleanText(snapForInternal.internal_preview_token||'',180);
    const internalScan=safeJsonObject(snapForInternal.official_contentscore_scan);
    const appBase=String(process.env.APP_URL||'https://app.contentscale.site').replace(/\/$/,'');
    const internalUrl=internalToken?`${appBase}/network/internal-content/${encodeURIComponent(internalToken)}`:null;
    // v505: package freshness MUST hash the exact same canonicalized document used by internal-live and the official scanner.
    // Without canonical_url here, every valid scan appeared stale immediately after reload.
    const internalDoc=buildInternalPublicationDocument(row,images,internalUrl?{canonical_url:internalUrl}:{});
    const officialScan=internalScan&&Number.isFinite(Number(internalScan.score))?{
      score:Number(internalScan.score),scanned_at:internalScan.scanned_at||null,
      scanned_hash:internalScan.content_hash||null,current_hash:internalDoc.hash,
      stale:String(internalScan.content_hash||'')!==String(internalDoc.hash),
      canonical_route:internalScan.canonical_route||'/api/scan',
      recommendation_count:Number(internalScan.recommendation_count||0),
      recommendations:Array.isArray(internalScan.recommendations)?internalScan.recommendations:[]
    }:null;
    let prewriteBrief=null;
    const prewriteId=Number(row.current_prewrite_brief_id||row.generation_input_snapshot&&row.generation_input_snapshot.prewrite_brief_id||0);
    if(prewriteId){const pr=await pool.query('SELECT id,keyword,working_title,language,region,brief_json,competitors_scraped,created_at FROM prewrite_briefs WHERE id=$1 LIMIT 1',[prewriteId]);prewriteBrief=pr.rows[0]||null;}
    let _briefJson=safeJsonObject(prewriteBrief&&prewriteBrief.brief_json),_internalAutoUpgrade=null;
    if(prewriteBrief){
      _internalAutoUpgrade=_networkAutoSelectInternalDestinationV502(_briefJson,row.publisher_domain);
      if(_internalAutoUpgrade&&_internalAutoUpgrade.changed){
        _briefJson=_internalAutoUpgrade.brief;prewriteBrief.brief_json=_briefJson;
        await pool.query(`UPDATE prewrite_briefs SET brief_json=$2::jsonb WHERE id=$1`,[prewriteBrief.id,JSON.stringify(_briefJson)]);
        const _ns=safeJsonObject(row.generation_input_snapshot);_ns.prewrite_requires_regeneration=true;_ns.internal_destination_auto_upgraded_at=new Date().toISOString();_ns.internal_destination_auto_upgraded_to=_internalAutoUpgrade.url;delete _ns.official_contentscore_scan;row.generation_input_snapshot=_ns;
        await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,quality_status='needs_review',updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(_ns)]);
      }
    }
    const _arrCount=(...xs)=>{for(const x of xs){if(Array.isArray(x))return x.length}return 0};
    const _numFirst=(...xs)=>{for(const x of xs){const n=Number(x);if(Number.isFinite(n)&&n>0)return n}return null};
    const _reqOutline=buildCanonicalApprovedOutline(_briefJson),_reqOutlineWords=_reqOutline.reduce((n,x)=>n+(Number(x&&x.target_words)||0),0);
    const contentRequirements=prewriteBrief?{
      target_words:_numFirst(_briefJson.target_word_count,_briefJson.recommended_word_count,_briefJson.content_requirements&&_briefJson.content_requirements.target_words,_briefJson.content_requirements&&_briefJson.content_requirements.word_count,_reqOutlineWords),
      planned_h2s:_arrCount(_briefJson.definitive_outline,_briefJson.page_blueprint,_briefJson.blueprint,_briefJson.h2_structure,_briefJson.outline,_briefJson.recommended_structure&&_briefJson.recommended_structure.h2s,_briefJson.content_requirements&&_briefJson.content_requirements.h2s),
      paa_count:_arrCount(_briefJson.paa_questions,_briefJson.people_also_ask,_briefJson.questions),
      faq_count:_arrCount(_briefJson.faq_questions,_briefJson.faqs,_briefJson.content_requirements&&_briefJson.content_requirements.faqs),
      stats_count:_arrCount(_briefJson.evidence&&_briefJson.evidence.statistics,_briefJson.original_statistics,_briefJson.statistics,_briefJson.stats),
      quotes_count:_arrCount(_briefJson.evidence&&_briefJson.evidence.expert_quotes,_briefJson.expert_quotes,_briefJson.quotes),
      expert_insights_count:_arrCount(_briefJson.evidence&&_briefJson.evidence.expert_insights,_briefJson.expert_insights),
      stats_primary_verified:Number(_briefJson.evidence_research&&_briefJson.evidence_research.statistics&&_briefJson.evidence_research.statistics.primary_verified||0),
      stats_provenance_resolved:Number(_briefJson.evidence_research&&_briefJson.evidence_research.statistics&&_briefJson.evidence_research.statistics.provenance_resolved||0),
      stats_research_status:cleanText(_briefJson.evidence_research&&_briefJson.evidence_research.statistics&&_briefJson.evidence_research.statistics.status||'',80),
      quotes_research_status:cleanText(_briefJson.evidence_research&&_briefJson.evidence_research.expert_quotes&&_briefJson.evidence_research.expert_quotes.status||'',80),
      evidence_research_complete:!!(_briefJson.evidence_research&&_briefJson.evidence_research.completed===true),
      evidence_quality_complete:!!(_briefJson.evidence_research&&_briefJson.evidence_research.quality_ladder&&_briefJson.evidence_research.quality_ladder.completed===true),
      evidence_approved_items:Number(_briefJson.evidence_research&&_briefJson.evidence_research.quality_ladder&&_briefJson.evidence_research.quality_ladder.approved_items||0),
      ai_systems_checked:_networkAiEvidenceStateV500(_briefJson).checked_count,
      ai_systems_missing:_networkAiEvidenceStateV500(_briefJson).missing_labels,
      internal_link_targets:_arrCount(_briefJson.internal_link_targets,_briefJson.link_intelligence&&_briefJson.link_intelligence.internal),
      internal_selected_url:String(_briefJson.link_research&&_briefJson.link_research.internal&&_briefJson.link_research.internal.selected_url||(_briefJson.internal_link_targets&&_briefJson.internal_link_targets[0]&&_briefJson.internal_link_targets[0].link_to)||''),
      internal_link_research_status:cleanText(_briefJson.link_research&&_briefJson.link_research.internal&&_briefJson.link_research.internal.status||'',80),
      external_link_targets:_arrCount(_briefJson.external_link_targets,_briefJson.external_sources,_briefJson.official_sources,_briefJson.evidence&&_briefJson.evidence.official_sources),
      brief_id:prewriteBrief.id
    }:null;
    const _currentPrewriteHash=prewriteBrief?crypto.createHash('sha256').update(JSON.stringify(prewriteBrief.brief_json||{})).digest('hex'):'';
    const _generationPrewriteHash=cleanText(row.generation_input_snapshot&&row.generation_input_snapshot.prewrite_hash||'',128);
    const _aiCov=_networkAiEvidenceStateV500(_briefJson),_intCov=_networkInternalDestinationStateV500(_briefJson,row.publisher_domain);
    const prewriteEvidence=prewriteBrief?{id:prewriteBrief.id,keyword:prewriteBrief.keyword,working_title:prewriteBrief.working_title,language:prewriteBrief.language,region:prewriteBrief.region,competitors_scraped:prewriteBrief.competitors_scraped,created_at:prewriteBrief.created_at,link_source:row.current_prewrite_brief_id?'network_content':'generation_snapshot',hash:_currentPrewriteHash,generation_hash:_generationPrewriteHash,generation_match:_generationPrewriteHash===_currentPrewriteHash,requires_regeneration:(_generationPrewriteHash!==_currentPrewriteHash),ai_systems_checked:_aiCov.checked_count,ai_systems_missing:_aiCov.missing_labels,ai_complete:_aiCov.complete,internal_destination:_intCov.selected_url,internal_destination_ready:_intCov.complete,publisher_domain:normalizeHost(row.publisher_domain||''),internal_destination_auto_upgraded:!!(_internalAutoUpgrade&&_internalAutoUpgrade.changed),internal_destination_selection_source:_internalAutoUpgrade&&_internalAutoUpgrade.source||String(_briefJson.link_research&&_briefJson.link_research.internal&&_briefJson.link_research.internal.selection_source||'')}:null;
    const linkIntel=linkIntelligenceFromSources(row,prewriteBrief);
    const savedIntel=(row.generation_input_snapshot&&row.generation_input_snapshot.link_intelligence)||{};
    if(contentRequirements){contentRequirements.internal_link_targets=Math.max(Number(contentRequirements.internal_link_targets||0),Array.isArray(savedIntel.publisher_internal_candidates)?savedIntel.publisher_internal_candidates.length:0);}
    const publicationStandard=publicationStandardChecks(row.html);
    const _internalPolicyCandidates=Array.from(new Set(Array.isArray(savedIntel.publisher_internal_candidates)?savedIntel.publisher_internal_candidates:[]));
    const _externalPolicyCandidates=[].concat(Array.isArray(savedIntel.external_candidates)?savedIntel.external_candidates:[]);
    const linkPolicy=_networkPublicationLinkPolicyV522(row,{publisher_domain:row.publisher_domain,source_domain:row.source_domain,internal_candidates:_internalPolicyCandidates,external_candidates:_externalPolicyCandidates});
    const seedKeywordPolicy=_networkSeedKeywordChecksV515(row,images,prewriteBrief&&prewriteBrief.keyword||'');
    const _metaTitleLen=String(row.meta_title||'').trim().length,_metaDescLen=String(row.meta_description||'').trim().length,_metaPolicyPassed=_metaTitleLen>0&&_metaTitleLen<=60&&_metaDescLen>=140&&_metaDescLen<=160;publicationStandard.meta_policy_passed=_metaPolicyPassed;publicationStandard.meta_title_length=_metaTitleLen;publicationStandard.meta_description_length=_metaDescLen;publicationStandard.seed_keyword_policy_passed=seedKeywordPolicy.passed;
    const briefFidelity=prewriteBrief?checkApprovedBriefFidelity(row.html,_briefJson,{publisher_domain:row.publisher_domain,internal_candidates:linkIntel.internal||[],required_internal_url:_intCov.selected_url||'',approved_contract:safeJsonObject(row.generation_input_snapshot&&row.generation_input_snapshot.approved_brief_contract)}):{passed:false,missing:['prewrite_brief'],groups:{prewrite_brief:['Linked approved Prewrite Brief required']},contract:null,counts:{}};
    const _vr=await pool.query(`SELECT run_no,http_status,indexable,canonical_ok,brand_mention_ok,source_link_ok,content_match_ok,password_protected,result_status,details,checked_at FROM network_verification_runs WHERE placement_id=$1 ORDER BY run_no DESC LIMIT 1`,[id]).catch(()=>({rows:[]}));
    const _historicalVerification=_vr.rows&&_vr.rows[0]||null;const latestVerification=['submitted','verifying','needs_review','verified'].includes(String(row.status||''))?_historicalVerification:null;
    const _internalPreviewCurrent=!!(internalUrl&&cleanText(snapForInternal.internal_preview_hash||'',128)&&String(snapForInternal.internal_preview_hash)===String(internalDoc.hash));
    const _seoCopiedCurrent=!!(snapForInternal.seo_publication_copied_hash&&String(snapForInternal.seo_publication_copied_hash)===String(internalDoc.hash));
    const readiness=_networkPublicationReadinessV527({
      placement_status:row.status,prewrite_linked:!!prewriteBrief,ai_complete:_aiCov.complete,internal_destination_ready:_intCov.complete,
      generation_current:!!(prewriteEvidence&&prewriteEvidence.generation_match&&!prewriteEvidence.requires_regeneration),
      internal_candidate_count:linkPolicy.internal&&linkPolicy.internal.candidate_count,external_candidate_count:linkPolicy.external&&linkPolicy.external.candidate_count,
      internal_used_count:linkPolicy.internal&&linkPolicy.internal.count,external_used_count:linkPolicy.external&&linkPolicy.external.count,
      link_policy_ready:linkPolicy.passed,brief_fidelity_ready:briefFidelity.passed,publication_standard_ready:publicationStandard.passed,
      meta_policy_ready:_metaPolicyPassed,seed_keyword_ready:seedKeywordPolicy.passed,internal_preview_current:_internalPreviewCurrent,
      official_scan_current:!!(officialScan&&!officialScan.stale),official_contentscore:officialScan&&!officialScan.stale?officialScan.score:0,
      seo_copied_current:_seoCopiedCurrent,seo_copied_at:snapForInternal.seo_publication_copied_at||null,live_verification:latestVerification
    });
    res.json({success:true,publication:{placement_id:id,publication_version_id:row.id,title:row.title,html:row.html,rendered_html:renderedPackage.html,plain_text:row.plain_text,meta_title:row.meta_title,meta_description:row.meta_description,suggested_slug:row.suggested_slug,schema_json:renderedPackage.schema,publisher_domain:row.publisher_domain,publisher_brand:row.publisher_brand,source_domain:row.source_domain,source_brand:row.source_brand,brand_name:row.brand_name,status:row.status,quality_status:quality.status,published_url:row.published_url||null,verification_decision:row.verification_decision||null,verification_note:row.verification_note||null,submitted_at:row.submitted_at||null,verified_at:row.verified_at||null},settings,images,quality,publication_standard:publicationStandard,seed_keyword_policy:seedKeywordPolicy,link_policy:linkPolicy,brief_fidelity:briefFidelity,h2_headings:headings,link_intelligence:{prewrite_internal:linkIntel.internal,prewrite_external:linkIntel.external,prewrite_used:linkIntel.prewrite_used,publisher_internal_candidates:Array.from(new Set(Array.isArray(savedIntel.publisher_internal_candidates)?savedIntel.publisher_internal_candidates:[])),manual_internal_targets:Array.isArray(savedIntel.manual_internal_targets)?savedIntel.manual_internal_targets:[],external_candidates:Array.isArray(savedIntel.external_candidates)?savedIntel.external_candidates:[]},prewrite_evidence:prewriteEvidence,current_prewrite_brief_id:Number(row.current_prewrite_brief_id||0),content_requirements:contentRequirements,internal_content:{url:internalUrl,exists:!!internalUrl,current_hash:internalDoc.hash,official_scan:officialScan},delivery_state:{seo_publication_copied_hash:cleanText(snapForInternal.seo_publication_copied_hash||'',128),seo_publication_copied_at:snapForInternal.seo_publication_copied_at||null,seo_publication_copied_current:_seoCopiedCurrent},live_verification:latestVerification,readiness,quality_gate:{minimum_score:readiness.minimum_contentscore,prewrite_integrity_required:true,ai_5_of_5_required:true,ai_5_of_5_complete:_aiCov.complete,internal_destination_required:true,internal_destination_ready:_intCov.complete,brief_fidelity_required:true,brief_fidelity_passed:briefFidelity.passed,meta_policy_required:true,meta_policy_ready:_metaPolicyPassed,seed_keyword_policy_required:seedKeywordPolicy.required,seed_keyword_policy_ready:seedKeywordPolicy.passed,link_policy_required:true,link_policy_ready:linkPolicy.passed,delivery_ready:readiness.delivery_ready,final_ready:readiness.final_ready,official_contentscore_required:true,official_contentscore_ready:readiness.official_scan_current&&Number(readiness.official_contentscore||0)>=Number(readiness.minimum_contentscore||80),images_required:false,images_block_delivery:false},rule:'Images are optional and never block Network delivery. Approved Prewrite Brief is a content contract. Final Network publication must honor that contract and be SEO-indexable HTML present in the publisher page source. JavaScript-only embeds are preview/legacy only and cannot pass final verification.'});
  }));


  // v513 — persist the exact copied publication HTML state so dashboards and guided workflows share one truth.
  app.post('/api/network/admin/publications/:placementId/mark-seo-copied', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT pv.id,pv.generation_input_snapshot,pv.html,pv.title,pv.meta_title,pv.meta_description,pv.suggested_slug,pv.schema_json,c.brand_name,c.source_snapshot,p.brand_mention_required,p.source_link_required,w.domain AS publisher_domain,w.brand_name AS publisher_brand,ow.domain AS source_domain,ow.brand_name AS source_brand
      FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE pv.placement_id=$1 LIMIT 1`,[id]);
    const row=r.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const ir=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]);
    const snap=safeJsonObject(row.generation_input_snapshot),token=cleanText(snap.internal_preview_token||'',180),base=String(process.env.APP_URL||'https://app.contentscale.site').replace(/\/$/,'');
    const internalUrl=token?`${base}/network/internal-content/${encodeURIComponent(token)}`:null;
    const built=buildInternalPublicationDocument(row,ir.rows,internalUrl?{canonical_url:internalUrl}:{});
    const now=new Date().toISOString();
    snap.seo_publication_copied_hash=built.hash;snap.seo_publication_copied_at=now;
    await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(snap)]);
    res.json({success:true,placement_id:id,content_hash:built.hash,copied_at:now,current:true});
  }));

  // v501 — surgical Publisher Edition repair from the immutable Approved Brief.
  // This route never reruns SERP, competitor, PAA or evidence research and only persists on PASS.
  app.post('/api/network/admin/publications/:placementId/repair-brief-fidelity', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const qr=await pool.query(`SELECT pv.*,p.status AS placement_status,c.prewrite_brief_id,pb.keyword AS seed_keyword,w.domain AS publisher_domain,w.brand_name AS publisher_brand,ow.domain AS source_domain,ow.brand_name AS source_brand
      FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id LEFT JOIN prewrite_briefs pb ON pb.id=c.prewrite_brief_id JOIN network_websites w ON w.id=p.publisher_website_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE pv.placement_id=$1 LIMIT 1`,[id]);
    const row=qr.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const briefId=Number(row.prewrite_brief_id||0);if(!briefId)return res.status(409).json({success:false,error:'A linked Prewrite Brief is required before fidelity repair.'});
    const snap=safeJsonObject(row.generation_input_snapshot),requestedApprovalId=Number(req.body&&req.body.approval_id||0),approvalId=requestedApprovalId||Number(snap.approved_prewrite_approval_id||0);
    let approvalCtx;try{approvalCtx=await _networkGetValidApproval(pool,briefId,approvalId)}catch(e){return res.status(Number(e.status)||409).json({success:false,error:e.message,code:e.code||'approval_invalid',details:e.details||null})}
    const brief=safeJsonObject(approvalCtx.brief_snapshot),aiState=_networkAiEvidenceStateV500(brief),intState=_networkInternalDestinationStateV500(brief,row.publisher_domain);
    if(!aiState.complete)return res.status(409).json({success:false,error:'Research integrity is incomplete: '+aiState.checked_count+'/5 AI systems. Complete the missing AI evidence first; existing research is preserved.',missing_ai:aiState.missing_labels});
    if(!intState.complete)return res.status(409).json({success:false,error:'Choose the required publisher-domain internal destination before article repair. No research rerun is needed.'});
    const contract=(snap.approved_brief_contract&&Object.keys(safeJsonObject(snap.approved_brief_contract)).length)?safeJsonObject(snap.approved_brief_contract):buildApprovedBriefContract(brief);
    const savedIntel=safeJsonObject(snap.link_intelligence),internalCandidates=Array.from(new Set(Array.isArray(savedIntel.publisher_internal_candidates)?savedIntel.publisher_internal_candidates:[])).slice(0,30),externalCandidates=[].concat(Array.isArray(savedIntel.external_candidates)?savedIntel.external_candidates:[]).map(x=>normalizeResearchUrl(typeof x==='string'?x:(x&&x.final_url||x&&x.url||''))).filter(Boolean).slice(0,12);
    const seedKeyword=cleanText(row.seed_keyword||snap.prewrite_keyword||'',220);
    let title=cleanText(row.title||'',300),html=String(row.html||''),plain=cleanText(row.plain_text||htmlText(html),50000),metaTitle=_networkSeedMetaTitleV515(seedKeyword,cleanText(row.meta_title||'',60)),metaDescription=_networkSeedMetaDescriptionV515(seedKeyword,cleanText(row.meta_description||'',160)),slug=seedKeyword?slugifyNetwork(seedKeyword):cleanText(row.suggested_slug||'',240),schema=safeJsonObject(row.schema_json);
    const _imgFix=await _networkEnsureSeedImageAltV515(pool,row.id,seedKeyword);
    let _ir=await pool.query(`SELECT id,image_role,image_name,alt_text,caption,suggested_filename,status FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]),images=_ir.rows||[];
    let fidelity=checkApprovedBriefFidelity(html,brief,{publisher_domain:row.publisher_domain,internal_candidates:internalCandidates,required_internal_url:intState.selected_url,approved_contract:contract});
    let linkPolicy=_networkPublicationLinkPolicyV522({html,publisher_domain:row.publisher_domain,source_domain:row.source_domain},{publisher_domain:row.publisher_domain,source_domain:row.source_domain,internal_candidates:internalCandidates,external_candidates:externalCandidates});
    let standard=publicationStandardChecks(html),metaOk=!!(metaTitle&&metaTitle.length<=60&&metaDescription.length>=140&&metaDescription.length<=160),seedPolicy=_networkSeedKeywordChecksV515({html,meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,generation_input_snapshot:{prewrite_keyword:seedKeyword}},images,seedKeyword);
    const standardMissing=()=>[].concat(!standard.direct_answer?['direct_answer']:[],!standard.tldr?['tldr_key_takeaways']:[],!standard.table_of_contents?['linked_table_of_contents']:[],!standard.mobile_friendly_table?['mobile_friendly_table']:[],Number(standard.h2_count||0)<5?['five_h2_sections']:[],seedPolicy&&seedPolicy.required&&!seedPolicy.passed?(seedPolicy.missing||[]).map(x=>'seed_'+x):[]);
    if(fidelity.passed&&linkPolicy.passed&&standard.passed&&metaOk&&seedPolicy.passed)return res.json({success:true,already_passed:true,repair_calls:0,research_rerun:false,image_alt_repaired:!!_imgFix.changed,message:_imgFix.changed?'Publication content already passed; image alt metadata was aligned with the exact seed keyword.':'Approved Brief fidelity, Publication Link Policy, Publication Standard and seed-keyword SEO policy already pass. Nothing was changed.',fidelity,link_policy:linkPolicy,publication_standard:standard,seed_keyword_policy:seedPolicy});
    let deterministicLinkRepair={changed:false,added_internal:[],added_external:[],reason:'not_needed'};
    const onlyLinkPolicyMissing=fidelity.passed&&standard.passed&&metaOk&&seedPolicy.passed&&!linkPolicy.passed;
    if(onlyLinkPolicyMissing&&Number(linkPolicy.internal&&linkPolicy.internal.candidate_count||0)>=3&&Number(linkPolicy.external&&linkPolicy.external.candidate_count||0)>=3){
      deterministicLinkRepair=_networkDeterministicLinkRepairV526(html,linkPolicy,internalCandidates,Array.isArray(savedIntel.external_candidates)?savedIntel.external_candidates:externalCandidates);
      if(deterministicLinkRepair.changed){
        html=ensureContentScaleAttribution(deterministicLinkRepair.html,id);plain=cleanText(htmlText(html),50000);
        fidelity=checkApprovedBriefFidelity(html,brief,{publisher_domain:row.publisher_domain,internal_candidates:internalCandidates,required_internal_url:intState.selected_url,approved_contract:contract});
        linkPolicy=_networkPublicationLinkPolicyV522({html,publisher_domain:row.publisher_domain,source_domain:row.source_domain},{publisher_domain:row.publisher_domain,source_domain:row.source_domain,internal_candidates:internalCandidates,external_candidates:externalCandidates});
        standard=publicationStandardChecks(html);metaOk=!!(metaTitle&&metaTitle.length<=60&&metaDescription.length>=140&&metaDescription.length<=160);seedPolicy=_networkSeedKeywordChecksV515({html,meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,generation_input_snapshot:{prewrite_keyword:seedKeyword}},images,seedKeyword);
      }
    }
    const hard=(fidelity.missing||[]).filter(k=>['evidence_research','evidence_quality','prewrite_brief'].includes(k));
    if(hard.length)return res.status(409).json({success:false,error:'This is not an article-writing defect. The Approved Brief research contract must be fixed first: '+hard.join(', ')+'.',missing:hard,research_rerun:false});
    let repairCalls=0;
    for(let pass=1;pass<=2&&(!fidelity.passed||!linkPolicy.passed||!standard.passed||!metaOk||!seedPolicy.passed);pass++){
      const repairPrompt=`SURGICAL APPROVED-BRIEF FIDELITY REPAIR — PASS ${pass}. Repair ONLY what the fidelity checker says is missing. Preserve all useful current article content, facts, citations, title intent, author-neutral voice and working HTML unless a missing contract item requires a local change. Return JSON only with keys: title, html, plain_text, meta_title, meta_description, suggested_slug, schema_json.

NON-NEGOTIABLE RULES:
- Do not rerun or simulate research. Use only CURRENT ARTICLE + IMMUTABLE APPROVED CONTRACT + supplied exact URLs.
- Never invent statistics, expert quotes, URLs, case studies, credentials, outcomes, locations or first-hand experience.
- planned_h2s are authoritative: each exactly once, exact order. Rehouse existing useful prose rather than deleting it.
- If depth is missing, add useful coverage only from approved outline, PAA/FAQ, entities, quick facts, limitations, use cases and approved evidence. No filler.
- If PAA/FAQ is missing, answer the exact approved questions naturally.
- If evidence/statistics/quotes/insights are missing, use only the exact approved evidence and source URLs in the contract.
- If internal_links is missing, preserve the REQUIRED INTERNAL URL and bring the article to at least 3 UNIQUE publisher-domain internal links using only ALLOWED INTERNAL CANDIDATES. Target 3-5 when enough relevant candidates exist. Use varied descriptive anchors. Never invent or substitute URLs.
- If external_links is missing, add exact URLs from the saved verified/approved external candidates until at least 3 UNIQUE external editorial links are present; target 3-5 when available. Never invent URLs.
- Preserve one H1, direct answer, TL;DR/key takeaways, linked TOC and a useful mobile-friendly table.
- Meta title <=60 characters. Meta description 140-160 characters.
- EXACT SEED KEYWORD: ${seedKeyword||'not specified'}. When present: keep it exact in meta title and meta description; suggested_slug must be exactly ${seedKeyword?slugifyNetwork(seedKeyword):'the current approved slug'}.
- When the seed exists, include the exact phrase naturally in the first 10% of body content and at least one H2/H3/H4. Do not rename locked approved H2s just for SEO; add/use a useful H3/H4 when needed.
- When the seed exists, use the exact phrase naturally at least ${seedPolicy.minimum_exact_body_mentions||4} times in the body. Do not keyword-stuff.
- Image alt text is repaired deterministically by ContentScale, not by inventing image descriptions in article HTML.
- Do not add ContentScale attribution; the server controls it.

MISSING APPROVED-BRIEF GROUPS NOW:
${JSON.stringify(fidelity.groups).slice(0,20000)}

MISSING PUBLICATION-STANDARD ITEMS NOW:
${JSON.stringify(standardMissing())}

APPROVED CONTRACT:
${JSON.stringify(contract).slice(0,22000)}

REQUIRED INTERNAL URL:
${intState.selected_url}

ALLOWED INTERNAL CANDIDATES:
${JSON.stringify(internalCandidates).slice(0,6000)}

SAVED VERIFIED/APPROVED EXTERNAL CANDIDATES:
${JSON.stringify(externalCandidates).slice(0,9000)}

PUBLICATION LINK POLICY NOW:
${JSON.stringify(linkPolicy).slice(0,8000)}

SEED KEYWORD POLICY NOW:
${JSON.stringify(seedPolicy).slice(0,6000)}

CURRENT ARTICLE:
${JSON.stringify({title,html,plain_text:plain,meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,schema_json:schema}).slice(0,56000)}`;
      const repaired=await callNetworkGemini(repairPrompt),d=safeJsonObject(repaired&&repaired.parsed);repairCalls++;
      title=cleanText(d.title||title,300);html=ensureContentScaleAttribution(d.html||html,id);plain=cleanText(d.plain_text||htmlText(html),50000);
      const approvedMeta=safeJsonObject(brief.meta_package),approvedTitle=cleanText(approvedMeta.seo_title||'',60),approvedDesc=cleanText(approvedMeta.meta_description||'',160);
      metaTitle=_networkSeedMetaTitleV515(seedKeyword,approvedTitle||cleanText(d.meta_title||metaTitle||title,60));metaDescription=_networkSeedMetaDescriptionV515(seedKeyword,(approvedDesc.length>=140&&approvedDesc.length<=160)?approvedDesc:cleanText(d.meta_description||metaDescription,160));slug=seedKeyword?slugifyNetwork(seedKeyword):slugifyNetwork(d.suggested_slug||slug||title);schema=(d.schema_json&&typeof d.schema_json==='object'&&!Array.isArray(d.schema_json))?d.schema_json:schema;
      fidelity=checkApprovedBriefFidelity(html,brief,{publisher_domain:row.publisher_domain,internal_candidates:internalCandidates,required_internal_url:intState.selected_url,approved_contract:contract});linkPolicy=_networkPublicationLinkPolicyV522({html,publisher_domain:row.publisher_domain,source_domain:row.source_domain},{publisher_domain:row.publisher_domain,source_domain:row.source_domain,internal_candidates:internalCandidates,external_candidates:externalCandidates});standard=publicationStandardChecks(html);metaOk=!!(metaTitle&&metaTitle.length<=60&&metaDescription.length>=140&&metaDescription.length<=160);seedPolicy=_networkSeedKeywordChecksV515({html,meta_title:metaTitle,meta_description:metaDescription,suggested_slug:slug,generation_input_snapshot:{prewrite_keyword:seedKeyword}},images,seedKeyword);
    }
    if(!fidelity.passed||!linkPolicy.passed||!standard.passed||!seedPolicy.passed)return res.status(422).json({success:false,error:'Targeted repair did not satisfy every Approved Brief / Publication Link Policy / deterministic seed-keyword requirement. The existing Publisher Edition was left unchanged.',missing:[].concat(fidelity.missing||[],linkPolicy.missing||[]),details:{brief:fidelity.groups,link_policy:linkPolicy,publication_standard:standardMissing(),seed_keyword_policy:seedPolicy},counts:fidelity.counts,repair_calls:repairCalls,research_rerun:false,saved:false});
    if(!metaOk)return res.status(422).json({success:false,error:'Targeted repair fixed Brief fidelity but the SEO meta policy still fails. Existing Publisher Edition was left unchanged.',repair_calls:repairCalls,research_rerun:false,saved:false});
    const nextSnap=JSON.parse(JSON.stringify(snap));nextSnap.prewrite_keyword=seedKeyword||nextSnap.prewrite_keyword||null;nextSnap.approved_prewrite_approval_id=Number(approvalCtx.approval.id);nextSnap.approved_prewrite_hash=approvalCtx.brief_hash;nextSnap.approved_prewrite_at=approvalCtx.approval.approved_at||null;nextSnap.prewrite_hash=approvalCtx.brief_hash;nextSnap.approved_brief_contract=(approvalCtx.contract&&Object.keys(safeJsonObject(approvalCtx.contract)).length)?approvalCtx.contract:contract;nextSnap.prewrite_requires_regeneration=false;nextSnap.link_policy_requires_repair=false;nextSnap.publication_link_policy=linkPolicy;nextSnap.seed_keyword_policy=seedPolicy;nextSnap.brief_fidelity={passed:true,missing:[],groups:{},counts:fidelity.counts||{},repair_used:true,targeted_repair:true,repair_calls:repairCalls,deterministic_link_repair:!!deterministicLinkRepair.changed,checked_at:new Date().toISOString()};nextSnap.fidelity_repair_history=Array.isArray(nextSnap.fidelity_repair_history)?nextSnap.fidelity_repair_history:[];nextSnap.fidelity_repair_history.push({at:new Date().toISOString(),mode:'approved_brief_missing_only',repair_calls:repairCalls,research_rerun:false,approved_prewrite_approval_id:Number(approvalCtx.approval.id)});delete nextSnap.official_contentscore_scan;nextSnap.internal_preview_hash=null;
    await pool.query(`UPDATE network_publication_versions SET title=$2,html=$3,plain_text=$4,meta_title=$5,meta_description=$6,suggested_slug=$7,schema_json=$8::jsonb,generation_input_snapshot=$9::jsonb,quality_status='needs_review',updated_at=NOW() WHERE id=$1`,[row.id,title,html,plain,metaTitle,metaDescription,slug,JSON.stringify(schema),JSON.stringify(nextSnap)]);
    await invalidateNetworkRenderedState(pool,id,'publication_link_or_content_repaired');
    res.json({success:true,repair_calls:repairCalls,deterministic_link_repair:!!deterministicLinkRepair.changed,added_internal:deterministicLinkRepair.added_internal||[],added_external:deterministicLinkRepair.added_external||[],research_rerun:false,saved:true,image_alt_repaired:!!_imgFix.changed,message:deterministicLinkRepair.changed?'Publication Link Policy repaired deterministically from the current verified 3 + 3 candidate set; no full regeneration or new research was used.':'Current content contract refreshed without rerunning research. Rebuild the stable internal live URL and rerun ContentScore because publication output changed.',fidelity,link_policy:linkPolicy,publication_standard:standard,seed_keyword_policy:seedPolicy});
  }));



  app.post('/api/network/admin/publications/:placementId/links/revalidate', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT pv.id,pv.generation_input_snapshot,w.domain AS publisher_domain,ow.domain AS source_domain FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE pv.placement_id=$1 LIMIT 1`,[id]);
    const row=r.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const snap=safeJsonObject(row.generation_input_snapshot),li=safeJsonObject(snap.link_intelligence),pub=normalizeHost(row.publisher_domain),internal=[];
    for(const raw of (Array.isArray(li.publisher_internal_candidates)?li.publisher_internal_candidates:[]).slice(0,8)){
      try{const f=await safeFetchHtml(raw),a=analyzeWebsiteHtml({status:f.response.status,html:f.html,finalUrl:f.finalUrl,contentType:f.contentType}),u=normalizeResearchUrl(f.finalUrl||raw);if(a.indexable&&normalizeHost(u)===pub&&!internal.some(x=>_briefUrlKey(x)===_briefUrlKey(u)))internal.push(u)}catch(_e){}
      if(internal.length>=5)break;
    }
    const external=await _networkVerifyExternalCandidatesV523(Array.isArray(li.external_candidates)?li.external_candidates:[],row.publisher_domain,row.source_domain,5);
    const changed=JSON.stringify(internal)!==JSON.stringify((Array.isArray(li.publisher_internal_candidates)?li.publisher_internal_candidates:[]).map(normalizeResearchUrl).filter(Boolean).slice(0,5))||JSON.stringify(external.map(x=>x.final_url||x.url))!==JSON.stringify((Array.isArray(li.external_candidates)?li.external_candidates:[]).map(x=>normalizeResearchUrl(typeof x==='string'?x:(x&&x.final_url||x&&x.url||''))).filter(Boolean).slice(0,5));
    li.publisher_internal_candidates=internal;li.external_candidates=external;li.revalidated_at=new Date().toISOString();snap.link_intelligence=li;
    if(changed){snap.link_policy_requires_repair=true;snap.link_policy_changed_at=new Date().toISOString();delete snap.official_contentscore_scan;snap.internal_preview_hash=null;delete snap.seo_publication_copied_hash;delete snap.seo_publication_copied_at;}
    await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,quality_status=CASE WHEN $3 THEN 'needs_review' ELSE quality_status END,updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(snap),changed]);
    res.json({success:true,internal_count:internal.length,external_count:external.length,changed,requires_link_action:internal.length<3||external.length<3,rule:'Current link candidates were live-revalidated. Any dead/redirected URL stops counting immediately. Three current internal and three current external URLs are required.'});
  }));

  app.post('/api/network/admin/publications/:placementId/links/discover-internal', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT pv.id,pv.generation_input_snapshot,pv.suggested_slug,pv.title,c.prewrite_brief_id,pb.keyword AS seed_keyword,w.domain AS publisher_domain,w.scan_snapshot FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id LEFT JOIN prewrite_briefs pb ON pb.id=c.prewrite_brief_id JOIN network_websites w ON w.id=p.publisher_website_id WHERE pv.placement_id=$1 LIMIT 1`,[id]);
    const row=r.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const snap=safeJsonObject(row.generation_input_snapshot),li=safeJsonObject(snap.link_intelligence),topic=[row.seed_keyword,row.title].filter(Boolean).join(' '),scan=safeJsonObject(row.scan_snapshot);
    const found=await _networkDiscoverInternalCandidatesV523({publisher_domain:row.publisher_domain,topic,start_url:scan.checked_url||'',current_slug:row.suggested_slug});
    const manual=Array.isArray(li.manual_internal_targets)?li.manual_internal_targets:[],manualVerified=[];
    for(const raw of manual.slice(0,12)){
      try{const f=await safeFetchHtml(raw),a=analyzeWebsiteHtml({status:f.response.status,html:f.html,finalUrl:f.finalUrl,contentType:f.contentType}),u=normalizeResearchUrl(f.finalUrl||raw);if(a.indexable&&normalizeHost(u)===normalizeHost(row.publisher_domain))manualVerified.push(u)}catch(_e){}
    }
    const candidates=Array.from(new Map(manualVerified.concat(found.candidates||[]).map(u=>[_briefUrlKey(u),u])).values()).slice(0,5);
    li.publisher_internal_candidates=candidates;li.internal_checked_at=new Date().toISOString();li.internal_discovery_source=found.source;li.internal_discovery_checked=found.checked;
    snap.link_intelligence=li;snap.link_policy_requires_repair=true;snap.link_policy_changed_at=new Date().toISOString();
    await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,quality_status='needs_review',updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(snap)]);
    // v526: additional 3x3 publication-link candidates live in the publication snapshot only.
    // Do not mutate the approved/current Prewrite Brief for post-generation coverage changes.
    res.json({success:true,candidates,count:candidates.length,checked:found.checked,research_rerun:false,requires_refresh:true,rule:'Three current verified internal URLs are required. Sitemap-first discovery is used automatically; same-domain crawl and homepage are fallbacks.'});
  }));

  app.post('/api/network/admin/publications/:placementId/external-link', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT pv.id,pv.generation_input_snapshot,w.domain AS publisher_domain,ow.domain AS source_domain FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE pv.placement_id=$1 LIMIT 1`,[id]);
    const row=r.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const url=normalizeResearchUrl(req.body&&req.body.url||'');if(!url)return res.status(400).json({success:false,error:'Enter a complete valid external https:// URL.'});
    const h=normalizeHost(url),blocked=[normalizeHost(row.publisher_domain),normalizeHost(row.source_domain)].filter(Boolean);if(blocked.some(b=>h===b||h.endsWith('.'+b)))return res.status(400).json({success:false,error:'External source must be outside the publisher and source-company domains.'});
    let f,a,finalUrl;try{f=await safeFetchHtml(url);a=analyzeWebsiteHtml({status:f.response.status,html:f.html,finalUrl:f.finalUrl,contentType:f.contentType});finalUrl=normalizeResearchUrl(f.finalUrl||url)}catch(e){return res.status(422).json({success:false,error:'External URL could not be reached and verified: '+cleanText(e.message,300)})}
    if(!a.indexable||!(f.response.status>=200&&f.response.status<400))return res.status(422).json({success:false,error:'External URL is not a live indexable page.',http_status:f.response.status,indexable:a.indexable});
    const snap=safeJsonObject(row.generation_input_snapshot),li=safeJsonObject(snap.link_intelligence),prior=Array.isArray(li.external_candidates)?li.external_candidates:[],by=new Map();
    prior.forEach(x=>{const u=normalizeResearchUrl(typeof x==='string'?x:(x&&x.final_url||x&&x.url||''));if(u)by.set(_briefUrlKey(u),x)});by.set(_briefUrlKey(finalUrl),{url:finalUrl,final_url:finalUrl,title:a.title||'',http_status:f.response.status,status:'verified',source:'manual_verified'});
    li.external_candidates=Array.from(by.values()).slice(0,5);li.checked_at=new Date().toISOString();snap.link_intelligence=li;snap.link_policy_requires_repair=true;snap.link_policy_changed_at=new Date().toISOString();
    await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,quality_status='needs_review',updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(snap)]);
    res.json({success:true,url:finalUrl,count:li.external_candidates.length,requires_refresh:true,research_rerun:false,rule:'Only live-verified external URLs enter the current candidate set. Three are required.'});
  }));

  app.post('/api/network/admin/publications/:placementId/internal-link', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT pv.id,pv.generation_input_snapshot,pv.html,w.domain AS publisher_domain,c.prewrite_brief_id FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id WHERE pv.placement_id=$1 LIMIT 1`,[id]);
    const row=r.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const raw=cleanText(req.body&&req.body.url||'',1800),anchor=cleanText(req.body&&req.body.anchor_text||'',180);
    let u;try{u=new URL(raw)}catch(_e){return res.status(400).json({success:false,error:'Enter a complete https:// URL.'})}
    if(u.protocol!=='https:')return res.status(400).json({success:false,error:'Internal destination must use https://'});
    const pub=normalizeHost(row.publisher_domain||''),host=normalizeHost(u.hostname);if(!pub||host!==pub)return res.status(400).json({success:false,error:'URL must be on the publisher domain ('+(pub||'unknown')+').'});
    const p=(u.pathname||'').toLowerCase();if(/(?:^|\/)(?:sitemap(?:[_-]index)?|wp-sitemap|robots)(?:[._\/-]|$)/i.test(p)||/\.xml$/i.test(p)||/\/feed\/?$/i.test(p))return res.status(400).json({success:false,error:'Sitemap/XML/feed URLs are discovery files, not contextual article destinations.'});
    let verified;try{verified=await safeFetchHtml(u.toString());const a=analyzeWebsiteHtml({status:verified.response.status,html:verified.html,finalUrl:verified.finalUrl,contentType:verified.contentType});if(!a.indexable)throw new Error('page is not indexable');u=new URL(verified.finalUrl||u.toString());if(normalizeHost(u.hostname)!==pub)throw new Error('redirected outside publisher domain')}catch(e){return res.status(422).json({success:false,error:'Internal URL could not be verified as a live indexable publisher page: '+cleanText(e.message,300)})}
    u.hash='';const clean=(u.origin+u.pathname+u.search).replace(/\/$/,'');const snap=safeJsonObject(row.generation_input_snapshot),li=safeJsonObject(snap.link_intelligence),manual=Array.isArray(li.manual_internal_targets)?li.manual_internal_targets.slice():[];
    if(!manual.includes(clean))manual.push(clean);li.manual_internal_targets=manual.slice(0,12);li.publisher_internal_candidates=Array.from(new Set(li.manual_internal_targets.concat(Array.isArray(li.publisher_internal_candidates)?li.publisher_internal_candidates:[]))).slice(0,30);li.manual_anchor_text=Object.assign({},safeJsonObject(li.manual_anchor_text),{[clean]:anchor||null});snap.link_intelligence=li;snap.link_policy_requires_repair=true;snap.link_policy_changed_at=new Date().toISOString();
    await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,quality_status='needs_review',updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(snap)]);
    // v526: manual coverage URLs are operational publication state; they do not rewrite the approved Brief.
    res.json({success:true,url:clean||u.origin+'/',anchor_text:anchor||null,requires_regeneration:false,requires_refresh:true,research_rerun:false,message:'Publisher-selected internal destination saved and added to the internal-link candidate set. Three unique internal links are required; target 3-5 when relevant pages exist. No research or Gemini call was used.'});
  }));

  app.post('/api/network/admin/publications/:placementId/internal-live', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT pv.id,pv.generation_input_snapshot,pv.html,pv.title,pv.meta_title,pv.meta_description,pv.suggested_slug,pv.schema_json,c.brand_name,c.source_snapshot,p.brand_mention_required,p.source_link_required,w.domain AS publisher_domain,w.brand_name AS publisher_brand,ow.domain AS source_domain,ow.brand_name AS source_brand FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE pv.placement_id=$1 LIMIT 1`,[id]);
    const row=r.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const ir=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]);
    const current=safeJsonObject(row.generation_input_snapshot);
    const token=cleanText(current.internal_preview_token||'',180)||crypto.randomBytes(32).toString('hex');
    const base=String(process.env.APP_URL||'https://app.contentscale.site').replace(/\/$/,'');
    const liveUrl=`${base}/network/internal-content/${token}`;
    const built=buildInternalPublicationDocument(row,ir.rows,{canonical_url:liveUrl});
    const next=Object.assign({},current,{internal_preview_token:token,internal_preview_created_at:current.internal_preview_created_at||new Date().toISOString(),internal_preview_last_built_at:new Date().toISOString(),internal_preview_hash:built.hash});
    await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(next)]);
    res.json({success:true,url:liveUrl,content_hash:built.hash,noindex:true,stable_url:true,expires_at:null,rule:'This noindex internal test URL is stable for this Publisher Edition and is reused on rebuild/refresh.'});
  }));

  app.post('/api/network/admin/publications/:placementId/run-official-contentscore', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT pv.id,pv.generation_input_snapshot,pv.html,pv.title,pv.meta_title,pv.meta_description,pv.suggested_slug,pv.schema_json,c.brand_name,c.source_snapshot,p.brand_mention_required,p.source_link_required,w.domain AS publisher_domain,w.brand_name AS publisher_brand,ow.domain AS source_domain,ow.brand_name AS source_brand FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE pv.placement_id=$1 LIMIT 1`,[id]);
    const row=r.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const current=safeJsonObject(row.generation_input_snapshot),token=cleanText(current.internal_preview_token||'',180);
    if(!token)return res.status(409).json({success:false,error:'Create the internal live URL first.'});
    const ir=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]);
    const base=String(process.env.APP_URL||'https://app.contentscale.site').replace(/\/$/,''),url=`${base}/network/internal-content/${token}`,built=buildInternalPublicationDocument(row,ir.rows,{canonical_url:url}),scannerBase='http://127.0.0.1:'+(process.env.PORT||3000);
    const sr=await fetch(scannerBase+'/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(90000)});
    const scan=await sr.json().catch(()=>({success:false,error:'Official scanner returned invalid JSON'}));
    if(!sr.ok||scan.success===false||!Number.isFinite(Number(scan.score)))return res.status(sr.status||502).json({success:false,error:scan.error||'Official ContentScore scan failed'});
    const rr=scan.recommendations,recs=Array.isArray(rr)?rr:(rr&&Array.isArray(rr.all)?rr.all:[]);
    const saved={score:Number(scan.score),scanned_at:new Date().toISOString(),content_hash:built.hash,canonical_route:'/api/scan',scan_mode:'live_url',recommendation_count:recs.length,recommendations:recs.slice(0,50)};
    const next=Object.assign({},current,{official_contentscore_scan:saved,internal_preview_hash:built.hash,internal_preview_last_built_at:new Date().toISOString()});
    await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(next)]);
    res.json({success:true,url,official_contentscore:saved,canonical_route:'/api/scan'});
  }));

  app.get('/network/internal-content/:token', wrap(async (req,res)=>{
    const token=cleanText(req.params.token,180);if(!token)return res.status(404).send('Not found');
    const r=await pool.query(`SELECT pv.id,pv.generation_input_snapshot,pv.html,pv.title,pv.meta_title,pv.meta_description,pv.suggested_slug,pv.schema_json,c.brand_name,c.source_snapshot,p.brand_mention_required,p.source_link_required,w.domain AS publisher_domain,w.brand_name AS publisher_brand,ow.domain AS source_domain,ow.brand_name AS source_brand FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE pv.generation_input_snapshot->>'internal_preview_token'=$1 LIMIT 1`,[token]);
    const row=r.rows[0];if(!row)return res.status(404).send('Internal content not found');
    const ir=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]);
    const base=String(process.env.APP_URL||'https://app.contentscale.site').replace(/\/$/,'');const liveUrl=`${base}/network/internal-content/${token}`;const built=buildInternalPublicationDocument(row,ir.rows,{canonical_url:liveUrl});
    res.set('Cache-Control','no-store');res.set('X-Robots-Tag','noindex, nofollow, noarchive');res.type('html').send(built.document);
  }));


  app.post('/api/network/admin/publications/:placementId/prewrite-workspace', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const q=await pool.query(`SELECT p.id,c.id AS content_id,c.prewrite_brief_id,c.brand_name,c.title,COALESCE(ow.domain,w.domain) AS research_domain
      FROM network_placements p JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id
      LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE p.id=$1 LIMIT 1`,[id]);
    const x=q.rows[0];if(!x)return res.status(404).json({success:false,error:'Placement not found'});
    let token='',clientId=null,linkedPrewriteId=null;
    if(x.prewrite_brief_id){
      const br=await pool.query(`SELECT pb.id,tc.id AS tracker_client_id,tc.token FROM prewrite_briefs pb JOIN tracker_clients tc ON tc.id=pb.client_id WHERE pb.id=$1 LIMIT 1`,[x.prewrite_brief_id]);
      if(br.rows[0]){linkedPrewriteId=Number(br.rows[0].id)||null;clientId=br.rows[0].tracker_client_id;token=br.rows[0].token}
      else{
        // v473: never emit a stale networkBrief id. If the referenced Brief no longer
        // exists, clear that orphaned content pointer before creating the synthetic workspace.
        await pool.query(`UPDATE network_content SET prewrite_brief_id=NULL,updated_at=NOW() WHERE id=$1 AND prewrite_brief_id=$2`,[x.content_id,x.prewrite_brief_id]).catch(()=>{});
      }
    }
    if(!token){
      const domain='network-placement-'+id+'.internal.contentscale.site',ex=await pool.query(`SELECT id,token FROM tracker_clients WHERE domain=$1 AND (status IS NULL OR status<>'deleted') ORDER BY id LIMIT 1`,[domain]);
      if(ex.rows[0]){clientId=ex.rows[0].id;token=ex.rows[0].token}else{token=crypto.randomBytes(32).toString('hex');const ins=await pool.query(`INSERT INTO tracker_clients(token,domain,name,email,status,max_pages,created_at,updated_at) VALUES($1,$2,$3,NULL,'active',1,NOW(),NOW()) RETURNING id`,[token,domain,cleanText(x.brand_name||x.title||('Placement '+id),180)]);clientId=ins.rows[0].id}
      await pool.query(`UPDATE tracker_clients SET
        name=$2,
        prewrite_briefs_paid=GREATEST(COALESCE(prewrite_briefs_paid,0),9999),
        brand_context=COALESCE(NULLIF(brand_context,''),$3),
        updated_at=NOW()
        WHERE id=$1`,
        [clientId,cleanText(x.brand_name||x.title||('Placement '+id),180),'Network content owner/brand: '+cleanText(x.brand_name||'',180)+'\nResearch domain: '+cleanText(x.research_domain||'',300)]).catch(()=>{});
    }
    res.json({success:true,url:'/track/'+encodeURIComponent(token)+'?networkPlacement='+id+'&networkEmbed=1'+(linkedPrewriteId?'&networkBrief='+encodeURIComponent(linkedPrewriteId):''),linked_prewrite_id:linkedPrewriteId});
  }));

  app.post('/api/network/admin/publications/:placementId/ai-evidence', verifyAdmin, wrap(async (req,res)=>{
    const placementId=Number(req.params.placementId),engine=cleanText(req.body&&req.body.engine||'',40).toLowerCase(),evidence=String(req.body&&req.body.evidence||'').trim();
    const allowed=new Set(['google_aio','chatgpt','perplexity','claude','copilot']);
    if(!placementId)return res.status(400).json({success:false,error:'Invalid placement'});
    if(!allowed.has(engine))return res.status(400).json({success:false,error:'Unknown AI system'});
    if(!evidence)return res.status(400).json({success:false,error:'Paste the AI answer first'});
    const pq=await pool.query(`SELECT p.id,c.id AS content_id,c.prewrite_brief_id,pv.id AS publication_version_id,pv.generation_input_snapshot
      FROM network_placements p JOIN network_content c ON c.id=p.content_id
      LEFT JOIN network_publication_versions pv ON pv.placement_id=p.id
      WHERE p.id=$1 LIMIT 1`,[placementId]);
    const placement=pq.rows[0];
    if(!placement)return res.status(404).json({success:false,error:'Placement not found'});
    const briefId=Number(placement.prewrite_brief_id||0);
    if(!briefId)return res.status(409).json({success:false,error:'Create or link the Prewrite Brief first. The AI answer must belong to a specific Brief.'});
    const client=await pool.connect();
    let checkedCount=0,newHash='',requiresRegeneration=!!placement.publication_version_id,updatedBrief=null;
    try{
      await client.query('BEGIN');
      const br=await client.query(`SELECT id,brief_json FROM prewrite_briefs WHERE id=$1 FOR UPDATE`,[briefId]);
      if(!br.rows[0]){await client.query('ROLLBACK');return res.status(404).json({success:false,error:'Linked Prewrite Brief not found'})}
      const brief=safeJsonObject(br.rows[0].brief_json),ae=safeJsonObject(brief.ai_system_evidence),existing=safeJsonObject(ae[engine]),now=new Date().toISOString();updatedBrief=brief;
      ae[engine]=Object.assign({},existing,{checked:true,source:'manual',manual:true,text:evidence});
      ae.checked_at=now;
      const _five=['google_aio','chatgpt','perplexity','claude','copilot'];
      checkedCount=_five.filter(k=>ae[k]&&ae[k].checked).length;
      ae.checked_count=checkedCount;
      brief.ai_system_evidence=ae;
      brief.research_contract=safeJsonObject(brief.research_contract);brief.research_contract.ai_systems_required=5;brief.research_contract.internal_destination_required=true;
      const wc=safeJsonObject(brief.what_we_checked);
      wc.ai_systems_checked=checkedCount;wc.ai_systems_manual_checked=_five.filter(k=>ae[k]&&ae[k].manual===true).length;wc.ai_systems_status=Object.fromEntries(_five.map(k=>[k,!!(ae[k]&&ae[k].checked)]));wc.ai_systems_missing=_five.filter(k=>!(ae[k]&&ae[k].checked));
      if(engine==='google_aio'){wc.google_direct_answer='manually captured by user ('+evidence.length+' chars)';wc.google_direct_answer_manual_text=evidence;}
      brief.what_we_checked=wc;
      const rawUrls=Array.from(new Set((evidence.match(/https:\/\/[^\s<>\]\[()"'`]+/gi)||[]).map(u=>String(u).replace(/[)\]>,.;]+$/,''))));
      const answerPart=String(evidence).split(/RESOURCES:/i)[0].replace(/^ANSWER:\s*/i,'').trim();
      const aisa=safeJsonObject(brief.ai_systems_analysis);aisa[engine]=Object.assign({},safeJsonObject(aisa[engine]),{checked:true,evidence_source:'manual',answer_summary:answerPart.slice(0,900),citation_sources:rawUrls.map(u=>{let h='';try{h=new URL(u).hostname.replace(/^www\./,'')}catch(_e){}return {source_name:h||'Source',page_title:'',exact_url:u}}),raw_evidence_chars:evidence.length});brief.ai_systems_analysis=aisa;
      newHash=crypto.createHash('sha256').update(JSON.stringify(brief)).digest('hex');
      await client.query(`UPDATE prewrite_briefs SET brief_json=$2::jsonb WHERE id=$1`,[briefId,JSON.stringify(brief)]);
      if(placement.publication_version_id){
        const cur=safeJsonObject(placement.generation_input_snapshot),next=Object.assign({},cur,{prewrite_requires_regeneration:true,prewrite_evidence_updated_at:now});
        delete next.official_contentscore_scan;
        await client.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,quality_status='needs_review',updated_at=NOW() WHERE id=$1`,[placement.publication_version_id,JSON.stringify(next)]);
      }
      await client.query('COMMIT');
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
    const _aiState=_networkAiEvidenceStateV500(updatedBrief||{}),missing=_aiState.missing_labels;
    res.json({success:true,brief_id:briefId,engine,checked_count:checkedCount,missing_ai_systems:missing,missing_ai_system_keys:_aiState.missing,complete_5_of_5:checkedCount===5,hash:newHash,requires_regeneration:requiresRegeneration,message:checkedCount===5?'AI answer saved. Five-system evidence is now complete (5/5).':'AI answer saved, but research is not complete yet: '+checkedCount+'/5 AI systems captured. Missing: '+missing.join(', ')});
  }));

  app.post('/api/network/admin/publications/:placementId/link-prewrite', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId),briefId=Number(req.body&&req.body.brief_id||0);if(!id||!briefId)return res.status(400).json({success:false,error:'placementId and brief_id required'});
    const br=await pool.query(`SELECT id,keyword,working_title,brief_json,created_at FROM prewrite_briefs WHERE id=$1 LIMIT 1`,[briefId]),b=br.rows[0];if(!b)return res.status(404).json({success:false,error:'Prewrite Brief not found'});
    const hash=crypto.createHash('sha256').update(JSON.stringify(b.brief_json||{})).digest('hex'),pr=await pool.query(`SELECT pv.id AS publication_version_id,p.content_id FROM network_placements p LEFT JOIN network_publication_versions pv ON pv.placement_id=p.id WHERE p.id=$1 LIMIT 1`,[id]),p=pr.rows[0];if(!p)return res.status(404).json({success:false,error:'Placement not found'});
    await pool.query(`UPDATE network_content SET prewrite_brief_id=$2,source_type='prewrite_brief',source_snapshot=jsonb_set(jsonb_set(COALESCE(source_snapshot,'{}'::jsonb),'{prewrite_hash}',to_jsonb($3::text),true),'{full_article_generated}','false'::jsonb,true),updated_at=NOW() WHERE id=$1`,[p.content_id,briefId,hash]);
    if(p.publication_version_id){const vr=await pool.query(`SELECT generation_input_snapshot FROM network_publication_versions WHERE id=$1`,[p.publication_version_id]),cur=safeJsonObject(vr.rows[0]&&vr.rows[0].generation_input_snapshot),next=Object.assign({},cur,{prewrite_brief_id:briefId,prewrite_used:true,prewrite_hash:hash,prewrite_created_at:b.created_at||null,prewrite_keyword:b.keyword||null,prewrite_requires_regeneration:true});delete next.official_contentscore_scan;await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,quality_status='needs_review',updated_at=NOW() WHERE id=$1`,[p.publication_version_id,JSON.stringify(next)])}
    res.json({success:true,brief_id:briefId,hash,requires_regeneration:true,message:'Prewrite linked. Regenerate the article so the article is actually based on this Brief.'});
  }));

  app.patch('/api/network/admin/publications/:placementId/settings', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.placementId);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT pv.id,pv.generation_input_snapshot,c.brand_name,ow.domain AS source_domain,ow.brand_name AS source_brand FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE pv.placement_id=$1 LIMIT 1`,[id]);
    const x=r.rows[0];if(!x)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const current=x.generation_input_snapshot&&typeof x.generation_input_snapshot==='object'?x.generation_input_snapshot:{};
    const old=getPublicationSettings(current,{author_name:x.source_brand||x.brand_name||'',author_url:x.source_domain?`https://${x.source_domain}`:''});
    const incoming=req.body||{};
    const settings={
      primary_color:safeHexColor(incoming.primary_color,old.primary_color),accent_color:safeHexColor(incoming.accent_color,old.accent_color),
      author_type:['company','person','publisher'].includes(incoming.author_type)?incoming.author_type:old.author_type,
      author_name:cleanText(incoming.author_name!=null?incoming.author_name:old.author_name,200),author_url:cleanText(incoming.author_url!=null?incoming.author_url:old.author_url,1000),
      author_bio:cleanText(incoming.author_bio!=null?incoming.author_bio:old.author_bio,1000),author_job_title:cleanText(incoming.author_job_title!=null?incoming.author_job_title:old.author_job_title,160),
      image_mode:['off','prompt_only','auto_generate'].includes(incoming.image_mode)?incoming.image_mode:old.image_mode
    };
    const next=Object.assign({},current,{publication_settings:settings});
    delete next.official_contentscore_scan;next.internal_preview_hash=null;next.render_state_invalidated_at=new Date().toISOString();next.render_state_invalidated_reason='publication_settings_changed';await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1`,[x.id,JSON.stringify(next)]);
    res.json({success:true,settings,reverify_required:true});
  }));

  app.get('/api/network/admin/images/library/lookup', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const raw=cleanText(req.query?.name||'',255),key=normalizeImageKey(raw);if(!key)return res.json({success:true,found:false});
    let r=await pool.query(`SELECT id,normalized_key,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM public.network_image_library WHERE normalized_key=$1 OR LOWER(REGEXP_REPLACE(COALESCE(suggested_filename,''),'\.(jpe?g|png|webp)$','','i'))=$1 ORDER BY updated_at DESC LIMIT 1`,[key]);
    let source='library';
    if(!r.rows[0]){
      const hist=await pool.query(`SELECT id AS source_image_id,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM network_publication_images WHERE (LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(suggested_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(original_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(COALESCE(image_name,''),'[^a-z0-9]+','-','g'))=$1) AND COALESCE(alt_text,'')<>'' AND COALESCE(caption,'')<>'' ORDER BY updated_at DESC LIMIT 1`,[key]);
      const h=hist.rows[0];
      if(h){
        await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=CASE WHEN COALESCE(EXCLUDED.prompt,'')<>'' THEN EXCLUDED.prompt ELSE public.network_image_library.prompt END,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[key,cleanText(h.image_name||raw,220),cleanText(h.suggested_filename||raw,220),cleanText(h.alt_text,500),cleanText(h.caption,700),cleanText(h.prompt||'',3000),h.source_image_id]);
        r=await pool.query(`SELECT id,normalized_key,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM public.network_image_library WHERE normalized_key=$1 LIMIT 1`,[key]);
        source='publication_history';
      }
    }
    res.json({success:true,found:!!r.rows[0],image:r.rows[0]||null,source});
  }));

  app.post('/api/network/admin/publications/:placementId/images/resolve-existing-metadata', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId);if(!placementId)return res.status(400).json({success:false,error:'Invalid placement'});
    const rawName=cleanText(req.body?.name||req.body?.original_filename||'',255),key=normalizeImageKey(rawName);if(!key)return res.status(400).json({success:false,error:'Image name is required'});
    let r=await pool.query(`SELECT id,normalized_key,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM public.network_image_library WHERE normalized_key=$1 OR LOWER(REGEXP_REPLACE(COALESCE(suggested_filename,''),'\.(jpe?g|png|webp)$','','i'))=$1 ORDER BY updated_at DESC LIMIT 1`,[key]);
    if(r.rows[0]&&cleanText(r.rows[0].alt_text||'',500)&&cleanText(r.rows[0].caption||'',700))return res.json({success:true,reused:true,source:'library',image:r.rows[0]});
    const hist=await pool.query(`SELECT id AS source_image_id,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM network_publication_images WHERE (LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(suggested_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(original_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(COALESCE(image_name,''),'[^a-z0-9]+','-','g'))=$1) AND COALESCE(alt_text,'')<>'' AND COALESCE(caption,'')<>'' ORDER BY updated_at DESC LIMIT 1`,[key]);
    const h=hist.rows[0];
    if(h){
      await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=CASE WHEN COALESCE(EXCLUDED.prompt,'')<>'' THEN EXCLUDED.prompt ELSE public.network_image_library.prompt END,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[key,cleanText(h.image_name||rawName,220),cleanText(h.suggested_filename||rawName,220),cleanText(h.alt_text,500),cleanText(h.caption,700),cleanText(h.prompt||'',3000),h.source_image_id]);
      r=await pool.query(`SELECT id,normalized_key,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM public.network_image_library WHERE normalized_key=$1 LIMIT 1`,[key]);
      return res.json({success:true,reused:true,source:'publication_history',image:r.rows[0]});
    }
    const pr=await pool.query(`SELECT pv.title,c.primary_niche,c.brand_name,c.source_snapshot,w.domain AS publisher_domain FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id WHERE p.id=$1 LIMIT 1`,[placementId]);
    const x=pr.rows[0];if(!x)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const displayName=cleanText(String(rawName).replace(/\.(jpe?g|png|webp)$/i,'').replace(/[-_]+/g,' '),220)||key.replace(/-/g,' '),lang=cleanText(x.source_snapshot?.language||'en-US',30),country=cleanText(x.source_snapshot?.country||'',120);
    const originalExt=(String(req.body?.original_filename||'').match(/\.(jpe?g|png|webp)$/i)||['.jpg'])[0].toLowerCase();
    const prompt=`Create SEO metadata for an EXISTING editorial image using only its filename/subject and article context. Return JSON only with keys alt_text, caption, suggested_filename. Image filename/subject: ${displayName}. Article: ${x.title}. Brand: ${x.brand_name||''}. Niche: ${x.primary_niche||''}. Publisher: ${x.publisher_domain}. Language: ${lang}. Market: ${country||'not specified'}. Be conservative: do not invent people, numbers, locations, weather conditions, damage severity, colors or objects that are not implied by the filename/subject. Alt text must be concise and describe the likely visible subject naturally, without keyword stuffing. Caption should add useful context without making unsupported claims. Suggested filename must be lowercase, hyphenated and keep extension ${originalExt}.`;
    let d={};let model='fallback';try{const ai=await callNetworkGemini(prompt);d=ai.parsed||{};model=ai.model||model}catch(_e){}
    const human=displayName.replace(/\b\w/g,m=>m.toUpperCase());
    const alt=cleanText(d.alt_text||displayName,500);
    const caption=cleanText(d.caption||human,700);
    let filename=cleanText(d.suggested_filename||slugifyNetwork(displayName)+originalExt,220);if(!/\.(jpe?g|png|webp)$/i.test(filename))filename+=originalExt;
    await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,NULL,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=CASE WHEN COALESCE(public.network_image_library.prompt,'')<>'' THEN public.network_image_library.prompt ELSE EXCLUDED.prompt END,updated_at=NOW()`,[key,displayName,filename,alt,caption,'']);
    r=await pool.query(`SELECT id,normalized_key,image_name,suggested_filename,alt_text,caption,prompt,updated_at FROM public.network_image_library WHERE normalized_key=$1 LIMIT 1`,[key]);
    res.json({success:true,reused:false,source:'generated_from_filename',model,image:r.rows[0]});
  }));

  app.post('/api/network/admin/publications/:placementId/images/existing-upload', verifyAdmin, networkImageUpload.single('image'), wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId);if(!placementId)return res.status(400).json({success:false,error:'Invalid placement'});if(!req.file)return res.status(400).json({success:false,error:'Choose an image file'});
    const mime=String(req.file.mimetype||'').toLowerCase();if(!['image/jpeg','image/png','image/webp'].includes(mime))return res.status(415).json({success:false,error:'Only JPG, PNG or WebP images are supported'});
    const pr=await pool.query(`SELECT pv.id AS publication_version_id FROM network_publication_versions pv WHERE pv.placement_id=$1 LIMIT 1`,[placementId]);const pv=pr.rows[0];if(!pv)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const suppliedName=cleanText(req.body?.image_name,220),original=cleanText(req.file.originalname,255),key=normalizeImageKey(suppliedName||original);if(!key)return res.status(400).json({success:false,error:'Image name is required'});
    let lib=await pool.query(`SELECT image_name,suggested_filename,alt_text,caption,prompt FROM public.network_image_library WHERE normalized_key=$1 ORDER BY updated_at DESC LIMIT 1`,[key]);
    if(!lib.rows[0]){
      const hist=await pool.query(`SELECT id AS source_image_id,image_name,suggested_filename,alt_text,caption,prompt FROM network_publication_images WHERE (LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(suggested_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(original_filename,''),'\.(jpe?g|png|webp)$','','i'),'[^a-z0-9]+','-','g'))=$1 OR LOWER(REGEXP_REPLACE(COALESCE(image_name,''),'[^a-z0-9]+','-','g'))=$1) AND COALESCE(alt_text,'')<>'' AND COALESCE(caption,'')<>'' ORDER BY updated_at DESC LIMIT 1`,[key]);
      const h=hist.rows[0];
      if(h){
        await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=CASE WHEN COALESCE(EXCLUDED.prompt,'')<>'' THEN EXCLUDED.prompt ELSE public.network_image_library.prompt END,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[key,cleanText(h.image_name||suppliedName||original,220),cleanText(h.suggested_filename||original,220),cleanText(h.alt_text,500),cleanText(h.caption,700),cleanText(h.prompt||'',3000),h.source_image_id]);
        lib=await pool.query(`SELECT image_name,suggested_filename,alt_text,caption,prompt FROM public.network_image_library WHERE normalized_key=$1 LIMIT 1`,[key]);
      }
    }
    const remembered=lib.rows[0]||null;
    const imageName=suppliedName||cleanText(remembered?.image_name||key,220),alt=cleanText(req.body?.alt_text||remembered?.alt_text||'',500),caption=cleanText(req.body?.caption||remembered?.caption||'',700),filename=cleanText(req.body?.suggested_filename||remembered?.suggested_filename||original||key+'.jpg',220);
    if(!alt||!caption||!filename)return res.status(400).json({success:false,error:'Alt text, caption and SEO filename are required for an existing image'});
    const role=req.body?.image_role==='featured'?'featured':'supporting',h2Number=Math.max(0,Number(req.body?.h2_number)||0),hint=role==='featured'?'Before article':(h2Number?'before-h2-num:'+h2Number:'');if(role==='supporting'&&!hint)return res.status(400).json({success:false,error:'Choose an H2 number for a supporting image'});
    if(role==='featured')await pool.query(`UPDATE network_publication_images SET image_role='supporting',updated_at=NOW() WHERE placement_id=$1 AND image_role='featured'`,[placementId]);
    const orderR=await pool.query('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM network_publication_images WHERE publication_version_id=$1',[pv.publication_version_id]);
    const ir=await pool.query(`INSERT INTO network_publication_images (publication_version_id,placement_id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,image_data,byte_size,status,sort_order,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'uploaded',$14,NOW(),NOW()) RETURNING id,image_role,image_name,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,updated_at`,[pv.publication_version_id,placementId,role,imageName,cleanText(remembered?.prompt||'',3000),alt,caption,filename,hint,mime,original,req.file.buffer,req.file.size,Number(orderR.rows[0]?.n||0)]);
    const img=ir.rows[0];await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=CASE WHEN EXCLUDED.prompt<>'' THEN EXCLUDED.prompt ELSE public.network_image_library.prompt END,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[key,imageName,filename,alt,caption,cleanText(remembered?.prompt||'',3000),img.id]);
    await invalidateNetworkRenderedState(pool,placementId,'image_added');res.status(201).json({success:true,image:img,reused_metadata:!!remembered,library_key:key,reverify_required:true});
  }));

  app.post('/api/network/admin/publications/:placementId/images/prepare', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const id=Number(req.params.placementId),role=req.body?.image_role==='featured'?'featured':'supporting',h2Number=Math.max(0,Number(req.body?.h2_number)||0);
    if(!id)return res.status(400).json({success:false,error:'Placement is required'});
    const r=await pool.query(`SELECT pv.id AS publication_version_id,pv.title,pv.meta_description,pv.html,c.primary_niche,c.brand_name,c.source_snapshot,c.prewrite_brief_id,w.domain AS publisher_domain FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id WHERE p.id=$1 LIMIT 1`,[id]);
    const x=r.rows[0];if(!x)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const headings=extractH2Headings(x.html),selected=h2Number?headings.find(h=>Number(h.number)===h2Number):null;
    if(role==='supporting'&&!selected)return res.status(400).json({success:false,error:'Choose a valid H2. Supporting image subject is derived from that section.'});
    const name=cleanText(role==='featured'?x.title:selected.text,220);
    if(!name)return res.status(400).json({success:false,error:'Could not derive the image subject from the article structure'});
    let purpose='',cover=[];
    if(role==='supporting'&&x.prewrite_brief_id){
      const br=await pool.query(`SELECT brief_json FROM prewrite_briefs WHERE id=$1 LIMIT 1`,[Number(x.prewrite_brief_id)]);
      const bj=safeJsonObject(br.rows[0]&&br.rows[0].brief_json),section=_networkImageBriefSection(bj,h2Number,name);
      purpose=cleanText(section.purpose||'',900);
      cover=Array.isArray(section.cover)?section.cover.map(v=>cleanText(v,180)).filter(Boolean).slice(0,10):[];
    }
    const usedR=await pool.query(`SELECT image_name,prompt,placement_hint FROM network_publication_images WHERE publication_version_id=$1 AND COALESCE(image_name,'')<>'' ORDER BY id DESC LIMIT 12`,[x.publication_version_id]);
    const usedSubjects=usedR.rows.map(v=>cleanText(v.image_name,220)).filter(Boolean).filter(v=>v.toLowerCase()!==name.toLowerCase());
    const usedPrompts=usedR.rows.map(v=>cleanText(v.prompt||'',1200)).filter(Boolean);
    const lang=cleanText(x.source_snapshot?.language||'en-US',30),country=cleanText(x.source_snapshot?.country||'',120);
    const lockedPrompt=_networkImagePromptText({role,name,purpose,cover,articleTitle:x.title,usedSubjects,usedPrompts,h2Number});
    const metadataPrompt=`Return JSON only with keys alt_text and caption for an editorial image that will be generated from the following LOCKED prompt. Do not rewrite the prompt. Keep alt text and caption faithful to the exact H2/article subject. Do not introduce claims, statistics, brands, people, screenshots or unrelated objects.\n\n${lockedPrompt}`;
    const ai=await callNetworkGemini(metadataPrompt),d=ai.parsed||{};
    const forcedPlacement=role==='featured'?'Before article':'before-h2-num:'+h2Number;
    const fallbackAlt=cleanText(`Editorial illustration for ${name}`,500),fallbackCaption=cleanText(purpose?`${name}: ${purpose}`:name,700);
    const meta={prompt:cleanText(lockedPrompt,3000),alt_text:cleanText(d.alt_text||fallbackAlt,500),caption:cleanText(d.caption||fallbackCaption,700),suggested_filename:cleanText(slugifyNetwork(name)+'.jpg',220),placement_hint:forcedPlacement};
    let ir;
    if(role==='featured'){
      const existing=await pool.query(`SELECT id FROM network_publication_images WHERE publication_version_id=$1 AND image_role='featured' AND status='prompt_ready' ORDER BY updated_at DESC,id DESC LIMIT 1`,[x.publication_version_id]);
      if(existing.rows[0])ir=await pool.query(`UPDATE network_publication_images SET image_name=$3,prompt=$4,alt_text=$5,caption=$6,suggested_filename=$7,placement_hint=$8,updated_at=NOW() WHERE id=$1 AND placement_id=$2 RETURNING id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,status,sort_order`,[existing.rows[0].id,id,name,meta.prompt,meta.alt_text,meta.caption,meta.suggested_filename,meta.placement_hint]);
    }
    if(!ir&&role==='supporting'){
      const draft=await pool.query(`SELECT id FROM network_publication_images WHERE publication_version_id=$1 AND status='prompt_ready' AND image_role='supporting' ORDER BY updated_at DESC,id DESC LIMIT 1`,[x.publication_version_id]);
      if(draft.rows[0]){
        ir=await pool.query(`UPDATE network_publication_images SET image_name=$3,prompt=$4,alt_text=$5,caption=$6,suggested_filename=$7,placement_hint=$8,updated_at=NOW() WHERE id=$1 AND placement_id=$2 RETURNING id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,status,sort_order`,[draft.rows[0].id,id,name,meta.prompt,meta.alt_text,meta.caption,meta.suggested_filename,meta.placement_hint]);
        await pool.query(`DELETE FROM network_publication_images WHERE publication_version_id=$1 AND status='prompt_ready' AND id<>$2`,[x.publication_version_id,draft.rows[0].id]);
      }
    }
    if(!ir){
      const orderR=await pool.query('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM network_publication_images WHERE publication_version_id=$1',[x.publication_version_id]);
      ir=await pool.query(`INSERT INTO network_publication_images (publication_version_id,placement_id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,status,sort_order,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'prompt_ready',$10,NOW(),NOW()) RETURNING id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,status,sort_order`,[x.publication_version_id,id,role,name,meta.prompt,meta.alt_text,meta.caption,meta.suggested_filename,meta.placement_hint,Number(orderR.rows[0]?.n||0)]);
    }
    const saved=ir.rows[0];
    // v496 invariant: exactly one unused generated-image draft per Publisher Edition.
    await pool.query(`DELETE FROM network_publication_images WHERE publication_version_id=$1 AND status='prompt_ready' AND id<>$2`,[x.publication_version_id,saved.id]);
    const libKey=normalizeImageKey(saved.suggested_filename||saved.image_name);if(libKey)await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=EXCLUDED.prompt,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[libKey,saved.image_name,saved.suggested_filename,saved.alt_text,saved.caption,saved.prompt,saved.id]);
    const _divMatches=Array.from(String(saved.prompt||'').matchAll(/VISUAL COMPOSITION LOCK:\s*([a-z0-9-]+)/gi)),_divMatch=_divMatches.length?_divMatches[_divMatches.length-1]:null;res.status(201).json({success:true,image:saved,model:ai.model,reused_featured:role==='featured',derived_subject:true,prompt_source:'server_h2_lock',h2_number:h2Number||0,h2_title:selected&&selected.text||null,diversity_lock:_divMatch&&_divMatch[1]||null,diversity_required:true});
  }));

  app.patch('/api/network/admin/publications/:placementId/images/:imageId/metadata', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId),imageId=Number(req.params.imageId);
    if(!placementId||!imageId)return res.status(400).json({success:false,error:'Placement and image are required'});
    const r=await pool.query(`SELECT i.id,i.image_role,i.placement_hint,i.status,i.image_name,pv.title,pv.html,c.primary_niche,c.brand_name,c.source_snapshot,c.prewrite_brief_id,w.domain AS publisher_domain FROM network_publication_images i JOIN network_publication_versions pv ON pv.id=i.publication_version_id JOIN network_placements p ON p.id=i.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id WHERE i.id=$1 AND i.placement_id=$2 LIMIT 1`,[imageId,placementId]);
    const x=r.rows[0];if(!x)return res.status(404).json({success:false,error:'Image slot not found'});
    if(x.status!=='prompt_ready')return res.status(409).json({success:false,error:'Prompt regeneration is only allowed for an unused generated draft. This image is already uploaded, so its metadata must remain tied to the actual pixels.'});
    let name=cleanText(x.image_name,220),purpose='',cover=[],n=0;
    if(x.image_role==='featured')name=cleanText(x.title,220);
    else{
      const m=String(x.placement_hint||'').match(/^before-h2-num:(\d+)$/);n=m?Number(m[1]):0;const headings=extractH2Headings(x.html),h=headings.find(v=>Number(v.number)===n);
      if(!h)return res.status(400).json({success:false,error:'This generated image slot no longer points to a valid H2. Update placement first.'});
      name=cleanText(h.text,220);
      if(x.prewrite_brief_id){const br=await pool.query(`SELECT brief_json FROM prewrite_briefs WHERE id=$1 LIMIT 1`,[Number(x.prewrite_brief_id)]),bj=safeJsonObject(br.rows[0]&&br.rows[0].brief_json),section=_networkImageBriefSection(bj,n,name);purpose=cleanText(section.purpose||'',900);cover=Array.isArray(section.cover)?section.cover.map(v=>cleanText(v,180)).filter(Boolean).slice(0,10):[];}
    }
    if(!name)return res.status(400).json({success:false,error:'Could not determine image subject'});
    const usedR=await pool.query(`SELECT image_name,prompt,placement_hint FROM network_publication_images WHERE publication_version_id=(SELECT publication_version_id FROM network_publication_images WHERE id=$1 LIMIT 1) AND id<>$1 AND COALESCE(image_name,'')<>'' ORDER BY id DESC LIMIT 12`,[imageId]);
    const usedSubjects=usedR.rows.map(v=>cleanText(v.image_name,220)).filter(Boolean),usedPrompts=usedR.rows.map(v=>cleanText(v.prompt||'',1200)).filter(Boolean),lockedPrompt=_networkImagePromptText({role:x.image_role,name,purpose,cover,articleTitle:x.title,usedSubjects,usedPrompts,h2Number:n});
    const metadataPrompt=`Return JSON only with keys alt_text and caption for an editorial image that will be generated from the following LOCKED prompt. Do not rewrite the image prompt. Keep both fields faithful to the same H2 section and describe only what the locked prompt actually communicates. Do not add claims, statistics, brands, labels, symbolic explanations or objects not implied by the prompt.\n\n${lockedPrompt}`;
    const ai=await callNetworkGemini(metadataPrompt),d=ai.parsed||{};
    const fallbackAlt=cleanText(`Editorial illustration for ${name}`,500),fallbackCaption=cleanText(purpose?`${name}: ${purpose}`:name,700),filename=cleanText(slugifyNetwork(name)+'.jpg',220);
    const u=await pool.query(`UPDATE network_publication_images SET image_name=$3,prompt=$4,alt_text=$5,caption=$6,suggested_filename=$7,updated_at=NOW() WHERE id=$1 AND placement_id=$2 RETURNING id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,status,updated_at`,[imageId,placementId,name,cleanText(lockedPrompt,3000),cleanText(d.alt_text||fallbackAlt,500),cleanText(d.caption||fallbackCaption,700),filename]);
    const saved=u.rows[0],libKey=normalizeImageKey(saved.suggested_filename||saved.image_name);if(libKey)await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,prompt,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,prompt=EXCLUDED.prompt,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[libKey,saved.image_name,saved.suggested_filename,saved.alt_text,saved.caption,saved.prompt,saved.id]);
    res.json({success:true,image:saved,model:ai.model,note:'Prompt rebuilt server-side from the exact H2 and matched Approved Brief section. No model-written creative prompt is allowed to replace the H2 subject.'});
  }));

  app.post('/api/network/admin/publications/:placementId/images/:imageId/upload', verifyAdmin, networkImageUpload.single('image'), wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId),imageId=Number(req.params.imageId);if(!placementId||!imageId)return res.status(400).json({success:false,error:'Invalid image'});
    if(!req.file)return res.status(400).json({success:false,error:'Choose an image file'});
    const mime=String(req.file.mimetype||'').toLowerCase();if(!['image/jpeg','image/png','image/webp'].includes(mime))return res.status(415).json({success:false,error:'Only JPG, PNG or WebP images are supported'});
    const r=await pool.query(`UPDATE network_publication_images SET mime_type=$3,original_filename=$4,image_data=$5,byte_size=$6,status='uploaded',updated_at=NOW() WHERE id=$1 AND placement_id=$2 RETURNING id,image_role,image_name,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status`,[imageId,placementId,mime,cleanText(req.file.originalname,255),req.file.buffer,req.file.size]);
    if(!r.rows[0])return res.status(404).json({success:false,error:'Image slot not found'});const saved=r.rows[0],libKey=normalizeImageKey(saved.suggested_filename||saved.image_name||req.file.originalname);if(libKey)await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,source_image_id=EXCLUDED.source_image_id,updated_at=NOW()`,[libKey,saved.image_name,saved.suggested_filename,saved.alt_text,saved.caption,saved.id]);await invalidateNetworkRenderedState(pool,placementId,'image_file_changed');res.json({success:true,image:saved,library_key:libKey,reverify_required:true});
  }));

  app.patch('/api/network/admin/publications/:placementId/images/:imageId/placement', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId),imageId=Number(req.params.imageId);if(!placementId||!imageId)return res.status(400).json({success:false,error:'Invalid image'});
    const role=req.body?.image_role==='featured'?'featured':'supporting';const h2=firstThreeWords(req.body?.h2_target||'');const h2Number=Math.max(0,Number(req.body?.h2_number)||0);
    const hint=role==='featured'?'Before article':(h2Number?'before-h2-num:'+h2Number:(h2?'before-h2:'+h2:''));
    if(role==='supporting'&&!hint)return res.status(400).json({success:false,error:'Choose an H2 number or H2 title for a supporting image. The system will not silently place it at the end.'});
    if(role==='featured')await pool.query(`UPDATE network_publication_images SET image_role='supporting',updated_at=NOW() WHERE placement_id=$1 AND image_role='featured' AND id<>$2`,[placementId,imageId]);
    const r=await pool.query(`UPDATE network_publication_images SET image_role=$3,placement_hint=$4,updated_at=NOW() WHERE id=$1 AND placement_id=$2 RETURNING id,image_role,image_name,placement_hint,status`,[imageId,placementId,role,hint]);
    if(!r.rows[0])return res.status(404).json({success:false,error:'Image not found'});await invalidateNetworkRenderedState(pool,placementId,'image_placement_changed');res.json({success:true,image:r.rows[0],reverify_required:true});
  }));

  app.delete('/api/network/admin/publications/:placementId/images/:imageId', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkImageLibrary(pool);
    const placementId=Number(req.params.placementId),imageId=Number(req.params.imageId);if(!placementId||!imageId)return res.status(400).json({success:false,error:'Invalid image'});
    const before=await pool.query(`SELECT id,image_name,suggested_filename,alt_text,caption FROM network_publication_images WHERE id=$1 AND placement_id=$2 LIMIT 1`,[imageId,placementId]);
    const img=before.rows[0];if(!img)return res.status(404).json({success:false,error:'Image not found'});
    const libKey=normalizeImageKey(img.suggested_filename||img.image_name||'');
    if(libKey){await pool.query(`INSERT INTO public.network_image_library (normalized_key,image_name,suggested_filename,alt_text,caption,source_image_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,NULL,NOW(),NOW()) ON CONFLICT (normalized_key) DO UPDATE SET image_name=EXCLUDED.image_name,suggested_filename=EXCLUDED.suggested_filename,alt_text=EXCLUDED.alt_text,caption=EXCLUDED.caption,updated_at=NOW()`,[libKey,img.image_name,img.suggested_filename,img.alt_text,img.caption]);}
    const r=await pool.query('DELETE FROM network_publication_images WHERE id=$1 AND placement_id=$2 RETURNING id',[imageId,placementId]);
    await invalidateNetworkRenderedState(pool,placementId,'image_deleted');res.json({success:true,deleted_id:r.rows[0].id,removed_from_article:true,metadata_preserved:true,library_key:libKey||null,reverify_required:true});
  }));


  app.post('/api/network/admin/publications/:placementId/links/suggest-external', verifyAdmin, wrap(async (req,res)=>{
    const placementId=Number(req.params.placementId);if(!placementId)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT pv.id,pv.title,pv.html,pv.generation_input_snapshot,c.primary_niche,c.brand_name,c.source_snapshot,w.domain AS publisher_domain,ow.domain AS source_domain
      FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE p.id=$1 LIMIT 1`,[placementId]);
    const x=r.rows[0];if(!x)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const prompt=`Suggest 6 to 8 authoritative external source URLs that could support factual claims in this article. Return JSON only: {"sources":[{"url":"https://...","reason":"short reason"}]}. Do not suggest the publisher domain or source company domain. Prefer primary sources, government, universities, recognized standards bodies or highly authoritative industry organizations. Do not invent URLs; however every URL will still be live-verified by ContentScale before it can be treated as usable. Article title: ${x.title}. Niche: ${x.primary_niche||''}. Brand: ${x.brand_name||''}. Article text: ${htmlText(x.html).slice(0,9000)}`;
    const ai=await callNetworkGemini(prompt),fresh=Array.isArray(ai.parsed&&ai.parsed.sources)?ai.parsed.sources.slice(0,10):[],current=safeJsonObject(x.generation_input_snapshot),prior=Array.isArray(current.link_intelligence&&current.link_intelligence.external_candidates)?current.link_intelligence.external_candidates:[],list=fresh.concat(prior.map(v=>({url:typeof v==='string'?v:(v&&v.final_url||v&&v.url||''),reason:'previous candidate revalidation'}))).slice(0,14);
    const blocked=new Set([normalizeHost(x.publisher_domain),normalizeHost(x.source_domain)].filter(Boolean));const checked=[];
    for(const item of list){
      const url=normalizeResearchUrl(cleanText(item&&item.url,1600)),reason=cleanText(item&&item.reason,500);if(!url)continue;let parsed;try{parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))continue}catch(_e){continue}let status='failed',http_status=null,final_url=url,title='';
      try{const host=normalizeHost(url);if(blocked.has(host)||Array.from(blocked).some(b=>host.endsWith('.'+b)))continue;await assertPublicHostname(parsed.hostname);const f=await safeFetchHtml(url);http_status=f.response.status;final_url=f.finalUrl||url;status=(http_status>=200&&http_status<400)?'verified':'failed';const tm=String(f.html||'').match(/<title[^>]*>([\s\S]*?)<\/title>/i);title=tm?htmlText(tm[1]).slice(0,220):'';}catch(e){status='failed';}
      checked.push({url,final_url,reason,title,http_status,status});
    }
    const verifiedShortlist=Array.from(new Map(checked.filter(x=>x.status==='verified'&&Number(x.http_status)>=200&&Number(x.http_status)<400).map(x=>Object.assign({},x,{url:normalizeResearchUrl(x.url),final_url:normalizeResearchUrl(x.final_url||x.url)})).filter(x=>x.final_url).map(x=>[_briefUrlKey(x.final_url),x])).values()).slice(0,5);const next=Object.assign({},current,{link_policy_requires_repair:true,link_policy_changed_at:new Date().toISOString(),link_intelligence:Object.assign({},current.link_intelligence||{},{external_candidates:verifiedShortlist,checked_at:new Date().toISOString()})});
    await pool.query('UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1',[x.id,JSON.stringify(next)]);
    res.json({success:true,sources:checked,verified_shortlist:verifiedShortlist,model:ai.model,rule:'Three current live-verified external URLs are required. Suggestions and previous candidates are revalidated; only normalized live pages remain in the shortlist. Refresh all & verify inserts the current verified set into the article.'});
  }));

  app.get('/network/media/:id', wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(404).end();
    const r=await pool.query(`SELECT mime_type,image_data,suggested_filename,status FROM network_publication_images WHERE id=$1 LIMIT 1`,[id]);const x=r.rows[0];if(!x||!x.image_data||!['uploaded','approved'].includes(x.status))return res.status(404).end();
    res.set('Cache-Control','public, max-age=86400');res.set('X-Content-Type-Options','nosniff');res.type(x.mime_type||'application/octet-stream');res.send(x.image_data);
  }));

  app.get('/api/network/admin/placements/:id/seo-html', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const q=await pool.query(`SELECT p.id AS placement_id,p.status,p.source_link_required,p.brand_mention_required,c.brand_name,c.primary_niche,c.source_snapshot,c.prewrite_brief_id AS current_prewrite_brief_id,w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,ow.domain AS source_domain,ow.brand_name AS source_brand,pv.* FROM network_placements p JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id JOIN network_publication_versions pv ON pv.placement_id=p.id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE p.id=$1 LIMIT 1`,[id]);
    const row=q.rows[0];if(!row)return res.status(404).json({success:false,error:'Publisher Edition not found'});
    const ir=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]);
    const resolved=await _networkResolvePublisherReadinessV527(row,ir.rows);
    if(!resolved.readiness.final_ready)return res.status(409).json({success:false,error:'SEO publication HTML is locked until the authoritative Publication Readiness Engine is Ready.',readiness:resolved.readiness,publication_standard:resolved.standard,seed_keyword_policy:resolved.seed,link_policy:resolved.linkPolicy,brief_fidelity:resolved.fidelity});
    const html=buildSeoPublicationHtml(row,ir.rows);
    res.json({success:true,placement_id:id,delivery_mode:'seo_indexable_html',html,readiness:resolved.readiness,publication_standard:resolved.standard,rule:'Paste/publish this as real server-rendered/static HTML on the committed publisher domain. Do not replace it with a JavaScript-only embed. Final live verification checks raw page source for the article.'});
  }));

  app.get('/api/network/admin/placements/:id/delivery', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const r=await pool.query(`SELECT p.status,p.source_link_required,w.status AS publisher_status,w.domain AS publisher_domain,w.brand_name AS publisher_brand,c.brand_name,ow.domain AS source_domain,ow.brand_name AS source_brand,pv.*
      FROM network_placements p JOIN network_websites w ON w.id=p.publisher_website_id JOIN network_content c ON c.id=p.content_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id JOIN network_publication_versions pv ON pv.placement_id=p.id WHERE p.id=$1 LIMIT 1`,[id]);
    const x=r.rows[0];if(!x)return res.status(404).json({success:false,error:'Generated Publisher Edition not found'});
    if(!['ready','submitted','verifying','needs_review','verified'].includes(x.status))return res.status(409).json({success:false,error:'This placement is not available for delivery'});
    const ir=await pool.query(`SELECT id,image_role,image_name,alt_text,caption,suggested_filename,placement_hint,mime_type,byte_size,status,sort_order,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[x.id]);
    const quality=scorePublication(x,ir.rows);
    if(quality.score<85)return res.status(409).json({success:false,error:'Quality Gate not passed yet. Complete the publication package before copying the preview snippet.',content_score:quality.score,minimum_score:85});
    const token=x.generation_input_snapshot&&x.generation_input_snapshot.delivery_token;if(!token)return res.status(409).json({success:false,error:'Legacy preview token missing'});
    res.json({success:true,placement_id:id,status:x.status,content_score:quality.score,protection_mode:'seo_indexable_html',snippet:protectedSnippet('https://app.contentscale.site',id,token,x.title,x.plain_text),publication:{title:x.title,meta_title:x.meta_title,meta_description:x.meta_description,suggested_slug:x.suggested_slug,generated_at:x.generated_at},rule:'Legacy preview snippet only. It does NOT qualify as a final SEO Network placement because JavaScript-only delivery is not accepted for indexable publication.'});
  }));

  // Public controlled content endpoint. Removing the snippet removes the content; revoked placements stop serving it.
  app.get('/network/embed/:token.js', wrap(async (req,res)=>{
    if(!envEnabled())return res.status(404).type('text/javascript').send('/* ContentScale Network disabled */');
    const token=cleanText(req.params.token,128);if(!/^[a-f0-9]{64}$/i.test(token))return res.status(404).type('text/javascript').send('/* Invalid placement */');
    const r=await pool.query(`SELECT p.id AS placement_id,p.status,p.source_link_required,c.brand_name,w.domain AS publisher_domain,w.brand_name AS publisher_brand,ow.domain AS source_domain,ow.brand_name AS source_brand,pv.*
      FROM network_publication_versions pv JOIN network_placements p ON p.id=pv.placement_id JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id
      WHERE pv.generation_input_snapshot->>'delivery_token'=$1 LIMIT 1`,[token]);
    const x=r.rows[0];
    if(!x||!['ready','submitted','verifying','needs_review','verified'].includes(x.status))return res.status(410).type('text/javascript').send('/* ContentScale placement unavailable */');
    const ir=await pool.query(`SELECT id,image_role,image_name,alt_text,caption,suggested_filename,placement_hint,mime_type,byte_size,status,sort_order,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[x.id]);
    const quality=scorePublication(x,ir.rows);if(quality.score<85)return res.status(409).type('text/javascript').send(`/* ContentScale Quality Gate ${quality.score}/100 — placement not released */`);
    const rendered=renderEditionHtml(x,ir.rows);
    res.set('Cache-Control','no-store, max-age=0');res.set('X-Content-Type-Options','nosniff');
    const payload=JSON.stringify(String(rendered.html||'')),schemaPayload=JSON.stringify(JSON.stringify(rendered.schema||{}));
    const js=`(()=>{const s=document.currentScript;if(!s)return;let c=s.previousElementSibling;if(!c||!c.classList||!c.classList.contains('contentscale-network-placement')){c=document.createElement('div');c.className='contentscale-network-placement';s.parentNode.insertBefore(c,s)}c.setAttribute('data-cs-placement','${Number(x.placement_id)}');c.setAttribute('data-cs-score','${Number(quality.score)}');c.innerHTML=${payload};const sid='cs-schema-${Number(x.placement_id)}';if(!document.getElementById(sid)){const j=document.createElement('script');j.type='application/ld+json';j.id=sid;j.text=${schemaPayload};document.head.appendChild(j)}})();`;
    res.type('text/javascript').send(js);
  }));

  app.get('/network/publishing/:placementId', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');res.type('html').send(publishingDetailPage(req.params.placementId));
  });

  app.get('/network/publishing', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');
    res.type('html').send(publishingPage());
  });

  // PLACEMENTS — commitments created only after hard interest + approved site check.
  app.get('/api/network/admin/placements', verifyAdmin, wrap(async (req, res) => {
    const r=await pool.query(`SELECT p.id,p.content_id,p.publisher_website_id,p.status,p.reward_credits,p.brand_mention_required,p.source_link_required,p.published_url,p.accepted_at,p.submitted_at,p.verified_at,p.cancelled_at,p.created_at,p.updated_at,
      c.title,c.brand_name,c.source_snapshot->>'pitch' AS pitch,c.primary_niche,
      w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,w.scan_snapshot AS publisher_scan
      FROM network_placements p
      JOIN network_content c ON c.id=p.content_id
      JOIN network_websites w ON w.id=p.publisher_website_id
      ORDER BY p.created_at DESC,p.id DESC LIMIT 1000`);
    const placements=r.rows.map(x=>Object.assign({},x,{protection_mode:'seo_indexable_html',content_scale_marker_required:true,credits_earned:x.status==='verified'}));
    res.json({success:true,placements,policy:{approved:'seo_indexable_html',trusted:'seo_indexable_html',javascript_only_final_delivery:false,continuous_verification_required:true}});
  }));

  app.post('/api/network/admin/placements/:id/cancel', verifyAdmin, wrap(async (req, res) => {
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const pr=await pool.query('SELECT * FROM network_placements WHERE id=$1 LIMIT 1',[id]);
    const p=pr.rows[0];if(!p)return res.status(404).json({success:false,error:'Placement not found'});
    if(p.status!=='accepted')return res.status(409).json({success:false,error:'Only an accepted placement with no publication in progress can be cancelled here'});
    const vr=await pool.query('SELECT id,generated_at FROM network_publication_versions WHERE placement_id=$1 LIMIT 1',[id]);
    if(vr.rows[0] && vr.rows[0].generated_at)return res.status(409).json({success:false,error:'A Publisher Edition was already generated. Resolve/revoke it through the publishing workflow instead of simple cancellation.'});
    const r=await pool.query(`UPDATE network_placements SET status='cancelled',cancelled_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='accepted' RETURNING *`,[id]);
    const remaining=await pool.query(`SELECT COUNT(*)::int AS n FROM network_placements WHERE content_id=$1 AND status NOT IN ('cancelled','rejected')`,[p.content_id]);
    const cr=await pool.query('SELECT desired_placements FROM network_content WHERE id=$1 LIMIT 1',[p.content_id]);
    const max=Math.max(1,Math.min(5,Number(cr.rows[0]?.desired_placements)||1));
    if(Number(remaining.rows[0].n)<max)await pool.query(`UPDATE network_content SET distribution_status=CASE WHEN $2::int>0 THEN 'hard_interest' ELSE 'offered' END,publication_status='available',updated_at=NOW() WHERE id=$1`,[p.content_id,Number(remaining.rows[0].n)]);
    res.json({success:true,placement:r.rows[0],remaining_commitments:Number(remaining.rows[0].n),max_placements:max,opportunity_reopened:Number(remaining.rows[0].n)<max,rule:'Cancelled before Publisher Edition generation.'});
  }));

  app.get('/network/placements', (req, res) => {
    if (!envEnabled()) return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');
    res.type('html').send(placementsPage());
  });


  // VERIFICATION + CREDIT RELEASE — only after a generated Publisher Edition is live.
  app.get('/api/network/admin/verification-queue', verifyAdmin, wrap(async (req,res)=>{
    const r=await pool.query(`SELECT p.id,p.status,p.reward_credits,p.published_url,p.submitted_at,p.verified_at,
      p.brand_mention_required,p.source_link_required,p.verification_note,p.verification_decision,p.reviewed_at,
      c.title,c.brand_name,c.owner_website_id,
      w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,
      ow.domain AS source_domain,ow.brand_name AS source_brand,
      pv.id AS publication_version_id,pv.title AS edition_title,pv.meta_title,pv.meta_description,pv.suggested_slug,pv.generated_at,pv.quality_status,
      vr.result_status AS latest_result,vr.http_status AS latest_http_status,vr.indexable AS latest_indexable,vr.canonical_ok AS latest_canonical_ok,
      vr.brand_mention_ok AS latest_brand_mention_ok,vr.source_link_ok AS latest_source_link_ok,vr.content_match_ok AS latest_content_match_ok,vr.details AS latest_details,vr.checked_at AS latest_checked_at,
      (SELECT COUNT(*)::int FROM network_placement_review_events re WHERE re.placement_id=p.id AND re.event_type IN ('submitted','resubmitted')) AS submission_round,
      EXISTS(SELECT 1 FROM network_credit_transactions ct JOIN network_credit_wallets cw ON cw.id=ct.wallet_id WHERE ct.placement_id=p.id AND ct.idempotency_key=('placement:'||p.id||':reward:v1')) AS credit_awarded
      FROM network_placements p
      JOIN network_content c ON c.id=p.content_id
      JOIN network_websites w ON w.id=p.publisher_website_id
      LEFT JOIN network_websites ow ON ow.id=c.owner_website_id
      JOIN network_publication_versions pv ON pv.placement_id=p.id
      LEFT JOIN LATERAL (SELECT * FROM network_verification_runs z WHERE z.placement_id=p.id ORDER BY z.run_no DESC LIMIT 1) vr ON TRUE
      WHERE p.status IN ('ready','submitted','verifying','needs_review','verified')
      ORDER BY p.updated_at DESC,p.id DESC LIMIT 1000`);
    res.json({success:true,items:r.rows,rule:'Automated checks are evidence only. Final verification and credit release require a manual admin decision.'});
  }));

  app.post('/api/network/admin/placements/:id/submit-live', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const raw=cleanText(req.body&&req.body.published_url,2048);if(!raw)return res.status(400).json({success:false,error:'Live article URL is required'});
    let live;try{live=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw)}catch(e){return res.status(400).json({success:false,error:'Enter a valid public live URL'})}
    if(!['http:','https:'].includes(live.protocol))return res.status(400).json({success:false,error:'Only http/https URLs are allowed'});
    const q=await pool.query(`SELECT p.id AS placement_id,p.status,p.content_id,p.published_url,p.verified_at,p.verification_decision,p.source_link_required,p.brand_mention_required,c.brand_name,c.primary_niche,c.source_snapshot,c.prewrite_brief_id AS current_prewrite_brief_id,w.domain AS publisher_domain,w.brand_name AS publisher_brand,ow.domain AS source_domain,ow.brand_name AS source_brand,pv.* FROM network_placements p JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id JOIN network_publication_versions pv ON pv.placement_id=p.id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE p.id=$1 LIMIT 1`,[id]);
    const x=q.rows[0];if(!x)return res.status(404).json({success:false,error:'Placement not found'});
    const _submitImages=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[x.id]);
    const _submitResolved=await _networkResolvePublisherReadinessV527(x,_submitImages.rows);
    if(!_submitResolved.readiness.final_ready||!_submitResolved.readiness.seo_copied_current)return res.status(409).json({success:false,error:!_submitResolved.readiness.final_ready?'Publication is not Ready under the authoritative Publication Readiness Engine':'Copy the current SEO publication HTML before starting live verification',readiness:_submitResolved.readiness});
    const verifiedUrlChange=x.status==='verified'&&req.body?.allow_verified_url_change===true;
    if(x.status==='verified'&&!verifiedUrlChange)return res.status(409).json({success:false,error:'This placement is already verified. Use Change live URL to start a controlled new review round.'});
    if(verifiedUrlChange&&String(x.published_url||'').replace(/\/$/,'')===live.toString().replace(/\/$/,''))return res.status(409).json({success:false,error:'Enter a different live URL before starting a new review round.'});
    if(!['ready','submitted','needs_review','verified'].includes(x.status))return res.status(409).json({success:false,error:'Generate the Publisher Edition before submitting a live URL'});
    const host=live.hostname.toLowerCase().replace(/^www\./,'');
    const expected=String(x.publisher_domain||'').toLowerCase().replace(/^www\./,'');
    if(!(host===expected||host.endsWith('.'+expected)))return res.status(409).json({success:false,error:'The live URL must be on the committed publisher website: '+expected});
    await assertPublicHostname(live.hostname);
    const prior=await pool.query(`SELECT COUNT(*)::int AS n FROM network_placement_review_events WHERE placement_id=$1 AND event_type IN ('submitted','resubmitted')`,[id]);
    const eventType=Number(prior.rows[0]?.n||0)>0?'resubmitted':'submitted';
    const previousUrl=cleanText(x.published_url||'',2048),previousStatus=cleanText(x.status||'',40),previousVerifiedAt=x.verified_at||null;
    const r=await pool.query(`UPDATE network_placements SET published_url=$2,status='submitted',submitted_at=NOW(),verified_at=CASE WHEN $3::boolean THEN NULL ELSE verified_at END,verification_decision=NULL,verification_note=NULL,reviewed_by_admin_id=NULL,reviewed_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,live.toString(),verifiedUrlChange]);
    await pool.query(`INSERT INTO network_placement_review_events (placement_id,event_type,actor_type,actor_ref,published_url,note,metadata,created_at)
      VALUES ($1,$2,'admin',$3,$4,NULL,$5::jsonb,NOW())`,[id,eventType,cleanText(req.admin?.id||req.headers['x-admin-key']||'admin',200),live.toString(),JSON.stringify({source:verifiedUrlChange?'admin_verified_url_change':'admin_submit_live',previous_url:previousUrl||null,previous_status:previousStatus||null,previous_verified_at:previousVerifiedAt,url_change:verifiedUrlChange})]);
    if(verifiedUrlChange&&x.content_id){
      await pool.query(`UPDATE network_content SET verified_placements=(SELECT COUNT(*)::int FROM network_placements WHERE content_id=$1 AND status='verified'),distribution_status=CASE WHEN EXISTS(SELECT 1 FROM network_placements WHERE content_id=$1 AND status='verified') THEN 'verified' ELSE 'submitted' END,updated_at=NOW() WHERE id=$1`,[x.content_id]);
    }
    res.json({success:true,placement:r.rows[0],event:eventType,url_change:verifiedUrlChange,previous_url:previousUrl||null,rule:verifiedUrlChange?'Verified live URL changed safely. Previous verification remains in history; the new URL requires a fresh pre-check and manual verification.':'Exact live URL saved as a new review round. Manual verification is still required before credits are earned.'});
  }));

  app.post('/api/network/admin/placements/:id/verify-live', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id);if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    const q=await pool.query(`SELECT p.*,c.brand_name,c.owner_website_id,w.domain AS publisher_domain,w.status AS publisher_status,
      pv.html AS edition_html,pv.generation_input_snapshot,ow.domain AS owner_domain
      FROM network_placements p JOIN network_content c ON c.id=p.content_id JOIN network_websites w ON w.id=p.publisher_website_id
      JOIN network_publication_versions pv ON pv.placement_id=p.id LEFT JOIN network_websites ow ON ow.id=c.owner_website_id WHERE p.id=$1 LIMIT 1`,[id]);
    const x=q.rows[0];if(!x)return res.status(404).json({success:false,error:'Generated placement not found'});
    if(!x.published_url)return res.status(409).json({success:false,error:'Save the exact live URL before verification'});
    if(!['submitted','needs_review','verified'].includes(x.status))return res.status(409).json({success:false,error:'Placement is not ready for live verification'});
    await pool.query(`UPDATE network_placements SET status='verifying',updated_at=NOW() WHERE id=$1 AND status!='verified'`,[id]);
    let fetched,analysis,fetchError='';
    try{fetched=await safeFetchHtml(x.published_url);analysis=analyzeWebsiteHtml({status:fetched.response.status,html:fetched.html,finalUrl:fetched.finalUrl,contentType:fetched.contentType})}catch(e){fetchError=e.message;analysis={http_status:null,indexable:false,canonical:'',technical_pass:false,password_protected:false}}
    const html=String(fetched&&fetched.html||'');
    const snap=x.generation_input_snapshot||{};const token=cleanText(snap.delivery_token,128);
    const legacyJsEmbed=!!token && (html.includes(token)||html.includes('/network/embed/'+token+'.js'));
    const editionHtml=String(x.edition_html||'');
    const liveText=htmlText(html).toLowerCase();
    const brand=cleanText(x.brand_name,250).toLowerCase();
    const owner=cleanText(x.owner_domain,300).toLowerCase();
    const brandOk=!x.brand_mention_required||!brand||liveText.includes(brand);
    const sourceOk=!x.source_link_required||(!owner?false:html.toLowerCase().includes(owner));
    const staticMarker=html.includes(`data-contentscale-placement="${id}"`)||html.includes(`data-contentscale-placement='${id}'`)||html.includes(`ContentScale Network indexable placement ${id}`);
    const contentMatch=publicationTextMatch(editionHtml,html);
    const statusCode=fetched&&fetched.response?fetched.response.status:null;
    const httpOk=Number(statusCode)>=200&&Number(statusCode)<400;
    const noindex=/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)||/<meta\b[^>]*content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i.test(html);
    const passwordProtected=Number(statusCode)===401||Number(statusCode)===403||/password protected|enter password|member login/i.test(htmlText(html).slice(0,3000));
    const canonicalTag=(html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i)||[])[0]||'';
    const canonical=extractAttr(canonicalTag,'href');
    let canonicalOk=true;if(canonical){try{const cu=new URL(canonical,x.published_url),lu=new URL(x.published_url);canonicalOk=cu.hostname.replace(/^www\./,'').toLowerCase()===lu.hostname.replace(/^www\./,'').toLowerCase()}catch(e){canonicalOk=false}}
    const indexable=httpOk&&!noindex&&!passwordProtected;
    const staticHtmlPresent=staticMarker&&contentMatch.matched;
    const jsOnlyDelivery=legacyJsEmbed&&!staticHtmlPresent;
    const passed=httpOk&&indexable&&canonicalOk&&staticHtmlPresent&&brandOk&&sourceOk&&!jsOnlyDelivery;
    const result=passed?'passed':'needs_review';
    const rn=await pool.query('SELECT COALESCE(MAX(run_no),0)+1 AS n FROM network_verification_runs WHERE placement_id=$1',[id]);
    const runNo=Number(rn.rows[0].n)||1;
    const details={seo_static_html_present:staticHtmlPresent,content_text_match:contentMatch,legacy_js_embed_present:legacyJsEmbed,js_only_delivery:jsOnlyDelivery,final_url:fetched&&fetched.finalUrl||x.published_url,canonical:canonical||null,noindex,password_protected:passwordProtected,fetch_error:fetchError||null,required_brand:brand||null,required_source_domain:owner||null};
    await pool.query(`INSERT INTO network_verification_runs (placement_id,run_no,http_status,indexable,canonical_ok,brand_mention_ok,source_link_ok,content_match_ok,password_protected,result_status,details,checked_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,NOW())`,[id,runNo,statusCode,indexable,canonicalOk,brandOk,sourceOk,staticHtmlPresent,passwordProtected,result,JSON.stringify(details)]);
    await pool.query(`UPDATE network_placements SET status=CASE WHEN status='verified' THEN 'verified' ELSE 'needs_review' END,updated_at=NOW() WHERE id=$1`,[id]);
    await pool.query(`INSERT INTO network_placement_review_events (placement_id,event_type,actor_type,actor_ref,published_url,note,metadata,created_at)
      VALUES ($1,$2,'admin',$3,$4,NULL,$5::jsonb,NOW())`,[
        id,passed?'precheck_passed':'precheck_needs_review',
        cleanText(req.admin?.id||req.headers['x-admin-key']||'admin',200),
        x.published_url,
        JSON.stringify({run_no:runNo,result_status:result,checks:{http_ok:httpOk,indexable,canonical_ok:canonicalOk,seo_static_html_present:staticHtmlPresent,brand_mention_ok:brandOk,source_link_ok:sourceOk}})
      ]);
    res.json({
      success:true,
      precheck_passed:passed,
      result_status:result,
      credit_awarded:false,
      credits:x.reward_credits,
      checks:{http_ok:httpOk,indexable,canonical_ok:canonicalOk,seo_static_html_present:staticHtmlPresent,content_match_ok:contentMatch.matched,legacy_js_embed_present:legacyJsEmbed,js_only_delivery:jsOnlyDelivery,brand_mention_ok:brandOk,source_link_ok:sourceOk,password_protected:passwordProtected},
      details,
      rule:passed
        ? 'Pre-check passed. This does NOT verify the placement and does NOT award credits. Open the live page and make the final manual decision.'
        : 'Pre-check found issues. No credits released. Review the live page manually and request changes or reject it.'
    });
  }));


  app.post('/api/network/admin/placements/:id/manual-review', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id),decision=cleanText(req.body?.decision,40).toLowerCase(),note=cleanText(req.body?.note,2000);
    if(!id)return res.status(400).json({success:false,error:'Invalid placement'});
    if(!['verified','needs_changes','rejected'].includes(decision))return res.status(400).json({success:false,error:'Choose verified, needs_changes or rejected'});
    const qr=await pool.query(`SELECT p.*,p.id AS placement_id,c.id AS content_id,c.brand_name,c.title AS opportunity_title,c.primary_niche,c.source_snapshot,c.prewrite_brief_id AS current_prewrite_brief_id,
      w.domain AS publisher_domain,w.brand_name AS publisher_brand,
      ow.domain AS source_domain,ow.brand_name AS source_brand,pv.*,pv.title AS edition_title,
      pa.email AS publisher_email,pa.contact_name AS publisher_contact_name,pa.access_token AS publisher_dashboard_token,
      vr.result_status AS latest_result,vr.run_no AS latest_run_no
      FROM network_placements p
      JOIN network_content c ON c.id=p.content_id
      JOIN network_websites w ON w.id=p.publisher_website_id
      LEFT JOIN network_websites ow ON ow.id=c.owner_website_id
      LEFT JOIN network_publication_versions pv ON pv.placement_id=p.id
      LEFT JOIN network_publisher_accounts pa ON pa.website_id=p.publisher_website_id AND pa.status='active'
      LEFT JOIN LATERAL (SELECT * FROM network_verification_runs z WHERE z.placement_id=p.id ORDER BY z.run_no DESC LIMIT 1) vr ON TRUE
      WHERE p.id=$1
      ORDER BY pa.updated_at DESC NULLS LAST
      LIMIT 1`,[id]);
    const x=qr.rows[0];if(!x)return res.status(404).json({success:false,error:'Placement not found'});
    if(!x.published_url)return res.status(409).json({success:false,error:'No live article URL has been submitted'});
    const adminId=cleanText(req.admin?.id||req.headers['x-admin-key']||'admin',200);

    if(decision==='needs_changes'){
      const reviewNote=note||'Changes requested after manual review';
      await pool.query(`UPDATE network_placements SET status='needs_review',verification_decision='needs_changes',verification_note=$2,reviewed_by_admin_id=$3,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1`,[id,reviewNote,adminId]);
      await pool.query(`INSERT INTO network_placement_review_events (placement_id,event_type,actor_type,actor_ref,published_url,note,metadata,created_at)
        VALUES ($1,'needs_changes','admin',$2,$3,$4,$5::jsonb,NOW())`,[id,adminId,x.published_url,reviewNote,JSON.stringify({precheck_result:x.latest_result||null,verification_run:x.latest_run_no||null})]);
      const publisherNotification=await networkNotifyPublisherReviewDecision(pool,x,'needs_changes',reviewNote);
      return res.json({success:true,status:'needs_review',credits_awarded:false,publisher_email:publisherNotification.state});
    }
    if(decision==='rejected'){
      const reviewNote=note||'Rejected after manual review';
      await pool.query(`UPDATE network_placements SET status='rejected',verification_decision='rejected',verification_note=$2,reviewed_by_admin_id=$3,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1`,[id,reviewNote,adminId]);
      await pool.query(`INSERT INTO network_placement_review_events (placement_id,event_type,actor_type,actor_ref,published_url,note,metadata,created_at)
        VALUES ($1,'rejected','admin',$2,$3,$4,$5::jsonb,NOW())`,[id,adminId,x.published_url,reviewNote,JSON.stringify({precheck_result:x.latest_result||null,verification_run:x.latest_run_no||null})]);
      const publisherNotification=await networkNotifyPublisherReviewDecision(pool,x,'rejected',reviewNote);
      return res.json({success:true,status:'rejected',credits_awarded:false,publisher_email:publisherNotification.state});
    }

    const _reviewImages=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[x.id]);
    const _reviewResolved=await _networkResolvePublisherReadinessV527(x,_reviewImages.rows);
    if(!_reviewResolved.readiness.final_ready||!_reviewResolved.readiness.seo_copied_current)return res.status(409).json({success:false,error:'Manual verification is blocked because the current publication no longer satisfies the authoritative Ready contract.',readiness:_reviewResolved.readiness});

    // Human is the final authority for live-page judgement. It may override a live pre-check with a note,
    // but it may not override a stale/non-Ready publication package.
    if(x.latest_result!=='passed' && !note){
      return res.status(409).json({success:false,error:'The automated pre-check has not passed. You can still verify manually, but enter a review note explaining the override.'});
    }

    let creditAwarded=false;
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      let wr=await client.query('SELECT * FROM network_credit_wallets WHERE website_id=$1 FOR UPDATE',[x.publisher_website_id]);
      if(!wr.rows[0])wr=await client.query(`INSERT INTO network_credit_wallets (website_id,balance,reserved,created_at,updated_at) VALUES ($1,0,0,NOW(),NOW()) ON CONFLICT (website_id) DO UPDATE SET updated_at=NOW() RETURNING *`,[x.publisher_website_id]);
      const wallet=wr.rows[0],key='placement:'+id+':reward:v1';
      const tr=await client.query(`INSERT INTO network_credit_transactions (wallet_id,placement_id,transaction_type,amount,idempotency_key,note,metadata,created_at)
        VALUES ($1,$2,'placement_verified',$3,$4,'Credits released after MANUAL live placement verification',$5::jsonb,NOW())
        ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,[
          wallet.id,id,x.reward_credits,key,
          JSON.stringify({manual_review:true,admin_id:adminId,precheck_result:x.latest_result||null,verification_run:x.latest_run_no||null,published_url:x.published_url,review_note:note||null})
        ]);
      if(tr.rows[0]){
        await client.query('UPDATE network_credit_wallets SET balance=balance+$2,updated_at=NOW() WHERE id=$1',[wallet.id,x.reward_credits]);
        creditAwarded=true;
      }
      await client.query(`UPDATE network_placements
        SET status='verified',verified_at=COALESCE(verified_at,NOW()),verification_decision='verified',verification_note=$2,reviewed_by_admin_id=$3,reviewed_at=NOW(),updated_at=NOW()
        WHERE id=$1`,[id,note||null,adminId]);
      await client.query(`UPDATE network_content SET verified_placements=(SELECT COUNT(*)::int FROM network_placements WHERE content_id=$1 AND status='verified'),distribution_status='verified',updated_at=NOW() WHERE id=$1`,[x.content_id]);
      await client.query('COMMIT');
    }catch(e){try{await client.query('ROLLBACK')}catch(_){}throw e}finally{client.release()}
    await pool.query(`INSERT INTO network_placement_review_events (placement_id,event_type,actor_type,actor_ref,published_url,note,metadata,created_at)
      VALUES ($1,'verified','admin',$2,$3,$4,$5::jsonb,NOW())`,[id,adminId,x.published_url,note||null,JSON.stringify({credits_awarded:creditAwarded,credits:x.reward_credits,precheck_result:x.latest_result||null,verification_run:x.latest_run_no||null})]);
    const publisherNotification=await networkNotifyPublisherReviewDecision(pool,x,'verified',note||'');
    res.json({success:true,status:'verified',credits_awarded:creditAwarded,credits:x.reward_credits,publisher_email:publisherNotification.state,rule:'Verified by manual admin decision. Reward is idempotent and can be awarded only once.'});
  }));

  app.get('/network/verification', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');res.type('html').send(verificationPage());
  });

  // WEBSITE REGISTRY — all writes remain inside network_websites.
  app.get('/api/network/admin/websites', verifyAdmin, wrap(async (req, res) => {
    const r = await pool.query(`SELECT id,domain,canonical_url,brand_name,primary_niche,sub_niche,country,language,cms,ownership_type,status,scan_snapshot,approved_at,suspended_at,created_at,updated_at
      FROM network_websites ORDER BY created_at DESC, id DESC LIMIT 1000`);
    res.json({ success: true, websites: r.rows });
  }));

  app.post('/api/network/admin/websites', verifyAdmin, wrap(async (req, res) => {
    if (!envEnabled()) return res.status(409).json({ success: false, error: 'Network is disabled' });
    const site = normalizeSite(req.body && req.body.domain);
    const ownership = req.body && req.body.ownership_type === 'owned' ? 'owned' : 'external';
    const values = [site.domain, site.canonical_url, cleanText(req.body?.brand_name,200)||null, cleanText(req.body?.primary_niche,120)||null, cleanText(req.body?.sub_niche,120)||null, cleanText(req.body?.country,120)||null, cleanText(req.body?.language,30)||null, cleanText(req.body?.cms,80)||null, ownership];
    try {
      const r = await pool.query(`INSERT INTO network_websites (domain,canonical_url,brand_name,primary_niche,sub_niche,country,language,cms,ownership_type,status,scan_snapshot,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','{}'::jsonb,NOW(),NOW()) RETURNING *`, values);
      res.status(201).json({ success: true, website: r.rows[0] });
    } catch (e) {
      if (e && e.code === '23505') return res.status(409).json({ success: false, error: 'This domain already exists in Network Websites.' });
      throw e;
    }
  }));

  // Hard rule: do not spend a site-check request until hard interest is explicitly confirmed.
  app.post('/api/network/admin/websites/:id/check', verifyAdmin, wrap(async (req, res) => {
    if (req.body?.hard_interest_confirmed !== true) return res.status(409).json({ success: false, error: 'Hard publication interest must be confirmed before the website check.' });
    const wr = await pool.query('SELECT * FROM network_websites WHERE id=$1 LIMIT 1', [req.params.id]);
    if (!wr.rows[0]) return res.status(404).json({ success: false, error: 'Website not found' });
    const w = wr.rows[0];
    const target = w.canonical_url || ('https://' + w.domain);
    let check;
    try {
      const fetched = await safeFetchHtml(target);
      check = analyzeWebsiteHtml({ status: fetched.response.status, html: fetched.html, finalUrl: fetched.finalUrl, contentType: fetched.contentType });
    } catch (e) {
      check = { outcome: 'rejected', technical_pass: false, error: cleanText(e.message,500), checked_url: target, checked_at: new Date().toISOString() };
    }
    check.hard_interest_confirmed = true;
    check.hard_interest_confirmed_at = new Date().toISOString();
    check.checked_by_admin_id = req.admin && req.admin.id || null;
    const ur = await pool.query(`UPDATE network_websites SET scan_snapshot=$2::jsonb, updated_at=NOW() WHERE id=$1 RETURNING *`, [w.id, JSON.stringify(check)]);
    res.json({ success: true, check, website: ur.rows[0], rule: 'No Publisher Edition may be generated until this website is approved.' });
  }));

  app.patch('/api/network/admin/websites/:id/status', verifyAdmin, wrap(async (req, res) => {
    const allowed = new Set(['pending','approved','trusted','suspended','rejected']);
    const status = cleanText(req.body?.status,30).toLowerCase();
    if (!allowed.has(status)) return res.status(400).json({ success: false, error: 'Invalid website status' });
    const r = await pool.query(`UPDATE network_websites SET status=$2,
      approved_at=CASE WHEN $2 IN ('approved','trusted') THEN COALESCE(approved_at,NOW()) ELSE approved_at END,
      suspended_at=CASE WHEN $2='suspended' THEN NOW() ELSE suspended_at END,
      updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id,status]);
    if (!r.rows[0]) return res.status(404).json({ success:false,error:'Website not found' });
    res.json({ success:true,website:r.rows[0] });
  }));

  app.get('/network/websites', (req, res) => {
    if (!envEnabled()) return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(websitesPage());
  });

  // REFERRALS — publishers/members + independent referral partners (scouts).
  // A click earns nothing. A scout reward is tied to the publisher application and only becomes rewardable after genuine activation.
  app.get('/api/network/admin/referrals', verifyAdmin, wrap(async (req,res)=>{
    await pool.query(`ALTER TABLE network_referral_partners ADD COLUMN IF NOT EXISTS access_token TEXT`).catch(()=>{});
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_network_referral_partners_access_token ON network_referral_partners(access_token) WHERE access_token IS NOT NULL`).catch(()=>{});
    const missingScoutTokens=await pool.query(`SELECT id FROM network_referral_partners WHERE access_token IS NULL OR access_token='' LIMIT 500`).catch(()=>({rows:[]}));
    for(const row of (missingScoutTokens.rows||[])){await pool.query(`UPDATE network_referral_partners SET access_token=$2,updated_at=NOW() WHERE id=$1 AND (access_token IS NULL OR access_token='')`,[row.id,crypto.randomBytes(32).toString('hex')]).catch(()=>{});}
    await ensureReferralAdminIdText(pool);
    const codes=await pool.query(`SELECT rc.id,rc.code,rc.label,rc.is_active,rc.created_at,rc.website_id,rc.partner_id,
      w.domain,w.brand_name,p.name AS partner_name,p.email AS partner_email,p.status AS partner_status,p.access_token AS scout_access_token,
      COUNT(rf.id)::int AS events,
      COUNT(rf.id) FILTER (WHERE rf.status='clicked')::int AS clicks,
      COUNT(rf.id) FILTER (WHERE rf.status='registered')::int AS registered,
      COUNT(rf.id) FILTER (WHERE rf.status='activated')::int AS activated,
      COUNT(rf.id) FILTER (WHERE rf.status='rewarded')::int AS rewarded
      FROM network_referral_codes rc
      LEFT JOIN network_websites w ON w.id=rc.website_id
      LEFT JOIN network_referral_partners p ON p.id=rc.partner_id
      LEFT JOIN network_referrals rf ON rf.referral_code_id=rc.id
      WHERE rc.partner_id IS NOT NULL
      GROUP BY rc.id,w.domain,w.brand_name,p.name,p.email,p.status,p.access_token ORDER BY rc.created_at DESC`);
    const partners=await pool.query(`SELECT p.*,
      COUNT(DISTINCT rc.id)::int AS codes,
      COUNT(rf.id) FILTER (WHERE rf.status='registered')::int AS registered_publishers,
      COUNT(rf.id) FILTER (WHERE rf.status IN ('activated','rewarded'))::int AS activated_publishers,
      COUNT(rf.id) FILTER (WHERE rf.status='rewarded')::int AS rewarded_publishers
      FROM network_referral_partners p
      LEFT JOIN network_referral_codes rc ON rc.partner_id=p.id
      LEFT JOIN network_referrals rf ON rf.referral_code_id=rc.id
      GROUP BY p.id ORDER BY p.created_at DESC`);
    const leads=await pool.query(`SELECT rf.id,rf.status,rf.reward_credits,rf.created_at,rf.updated_at,rf.metadata,
      rc.code,rc.partner_id,rc.website_id,p.name AS partner_name,w.domain AS referring_website
      FROM network_referrals rf JOIN network_referral_codes rc ON rc.id=rf.referral_code_id
      LEFT JOIN network_referral_partners p ON p.id=rc.partner_id
      LEFT JOIN network_websites w ON w.id=rc.website_id
      WHERE rf.status<>'clicked' AND rc.partner_id IS NOT NULL ORDER BY rf.created_at DESC LIMIT 250`);
    res.json({success:true,codes:codes.rows,partners:partners.rows,leads:leads.rows,reward_rule:'Clicks and empty signups earn nothing. An independent referrer/scout remains linked to the publisher they introduced. Reward only after the referred publisher becomes a genuine active Network participant.'});
  }));

  app.post('/api/network/admin/referral-partners', verifyAdmin, wrap(async (req,res)=>{
    await ensureReferralAdminIdText(pool);
    const name=cleanText(req.body?.name,200),email=cleanText(req.body?.email,240),label=cleanText(req.body?.label,200),notes=cleanText(req.body?.notes,1200);
    if(!name)return res.status(400).json({success:false,error:'Referrer name is required'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const scoutToken=crypto.randomBytes(32).toString('hex');
      const pr=await client.query(`INSERT INTO network_referral_partners (name,email,label,notes,access_token,created_by_admin_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING *`,[name,email||null,label||null,notes||null,scoutToken,req.admin&&req.admin.id||null]);
      const code=crypto.randomBytes(8).toString('hex');
      const cr=await client.query(`INSERT INTO network_referral_codes (partner_id,code,label,created_by_admin_id,created_at,updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING *`,[pr.rows[0].id,code,label||('Scout: '+name),req.admin&&req.admin.id||null]);
      await client.query('COMMIT');
      res.status(201).json({success:true,partner:pr.rows[0],referral:cr.rows[0],share_url:'https://app.contentscale.site/network/join?ref='+code,dashboard_url:'/network/scout/'+scoutToken,rule:'This link stays attributed to this independent referrer. The referred publisher can apply through it.'});
    }catch(e){
      try{await client.query('ROLLBACK')}catch(_e){}
      if(String(e&&e.code||'')==='23505'){
        return res.status(409).json({
          success:false,
          error:'This publisher application conflicts with an existing publisher account or website. A domain can only have one publisher identity.',
          code:'PUBLISHER_DUPLICATE_CONFLICT',
          constraint:cleanText(e&&e.constraint||'',160)||undefined
        });
      }
      throw e
    }finally{client.release()}
  }));

  app.patch('/api/network/admin/referral-partners/:id/status', verifyAdmin, wrap(async (req,res)=>{
    await ensureReferralAdminIdText(pool);
    const status=cleanText(req.body?.status,30).toLowerCase();
    if(!['active','paused','blocked','revoked'].includes(status))return res.status(400).json({success:false,error:'Invalid partner status'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const r=await client.query(`UPDATE network_referral_partners SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING *`,[req.params.id,status]);
      if(!r.rows[0]){await client.query('ROLLBACK');return res.status(404).json({success:false,error:'Referral partner not found'})}
      await client.query(`UPDATE network_referral_codes SET is_active=$2,updated_at=NOW() WHERE partner_id=$1`,[req.params.id,status==='active']);
      await client.query('COMMIT');
      res.json({success:true,partner:r.rows[0],codes_active:status==='active'});
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
  }));

  app.delete('/api/network/admin/referral-partners/:id', verifyAdmin, wrap(async (req,res)=>{
    await ensureReferralAdminIdText(pool);
    const id=req.params.id;
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const p=await client.query(`SELECT * FROM network_referral_partners WHERE id=$1 FOR UPDATE`,[id]);
      if(!p.rows[0]){await client.query('ROLLBACK');return res.status(404).json({success:false,error:'Referral partner not found'})}
      const meaningful=await client.query(`SELECT COUNT(*)::int AS n FROM network_referrals rf JOIN network_referral_codes rc ON rc.id=rf.referral_code_id WHERE rc.partner_id=$1 AND rf.status<>'clicked'`,[id]);
      if((meaningful.rows[0]?.n||0)>0){
        await client.query(`UPDATE network_referral_partners SET status='revoked',updated_at=NOW() WHERE id=$1`,[id]);
        await client.query(`UPDATE network_referral_codes SET is_active=FALSE,updated_at=NOW() WHERE partner_id=$1`,[id]);
        await client.query('COMMIT');
        return res.status(409).json({success:false,revoked:true,error:'This referrer already has publisher/application history. It was revoked instead of deleted so attribution and reward history remain intact.'});
      }
      await client.query(`DELETE FROM network_referrals WHERE referral_code_id IN (SELECT id FROM network_referral_codes WHERE partner_id=$1)`,[id]);
      await client.query(`DELETE FROM network_referral_codes WHERE partner_id=$1`,[id]);
      await client.query(`DELETE FROM network_referral_partners WHERE id=$1`,[id]);
      await client.query('COMMIT');
      res.json({success:true,deleted:true});
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
  }));

  app.post('/api/network/admin/referrals/code', verifyAdmin, wrap(async (req,res)=>{
    const websiteId=Number(req.body?.website_id)||null,partnerId=Number(req.body?.partner_id)||null;
    if(websiteId&&partnerId)return res.status(400).json({success:false,error:'A referral code belongs to either a publisher/member website or an independent referrer, not both.'});
    if(websiteId){const w=await pool.query('SELECT id FROM network_websites WHERE id=$1',[websiteId]);if(!w.rows[0])return res.status(400).json({success:false,error:'Website not found'});}
    if(partnerId){const p=await pool.query("SELECT id FROM network_referral_partners WHERE id=$1 AND status='active'",[partnerId]);if(!p.rows[0])return res.status(400).json({success:false,error:'Active referral partner not found'});}
    const code=crypto.randomBytes(8).toString('hex');
    const r=await pool.query(`INSERT INTO network_referral_codes (website_id,partner_id,code,label,created_by_admin_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING *`,[websiteId,partnerId,code,cleanText(req.body?.label,160)||null,req.admin&&req.admin.id||null]);
    res.status(201).json({success:true,referral:r.rows[0],share_url:'https://app.contentscale.site/network/join?ref='+code});
  }));

  app.patch('/api/network/admin/referrals/:id/status', verifyAdmin, wrap(async (req,res)=>{
    const status=cleanText(req.body?.status,30).toLowerCase();
    if(!['registered','activated','rewarded','rejected'].includes(status))return res.status(400).json({success:false,error:'Invalid referral status'});
    const r=await pool.query(`UPDATE network_referrals SET status=$2,
      activated_at=CASE WHEN $2 IN ('activated','rewarded') THEN COALESCE(activated_at,NOW()) ELSE activated_at END,
      rewarded_at=CASE WHEN $2='rewarded' THEN COALESCE(rewarded_at,NOW()) ELSE rewarded_at END,
      updated_at=NOW() WHERE id=$1 RETURNING *`,[req.params.id,status]);
    if(!r.rows[0])return res.status(404).json({success:false,error:'Referral not found'});
    res.json({success:true,referral:r.rows[0]});
  }));

  app.post('/api/network/referrals/apply', wrap(async (req,res)=>{
    if(!envEnabled())return res.status(404).json({success:false,error:'Network is not enabled'});
    const code=cleanText(req.body?.ref,120),domainInput=cleanText(req.body?.domain,500),contactName=cleanText(req.body?.contact_name,200),email=cleanText(req.body?.email,240),brand=cleanText(req.body?.brand_name,200),niche=cleanText(req.body?.niche,240),market=cleanText(req.body?.market||req.body?.country,120),language=cleanText(req.body?.language,30),message=cleanText(req.body?.message,1200);
    const nicheClass=classifyNetworkNiche(niche||'');
    if(!code||!domainInput||!email)return res.status(400).json({success:false,error:'Referral code, website and email are required'});
    const cr=await pool.query(`SELECT rc.*,p.status AS partner_status FROM network_referral_codes rc LEFT JOIN network_referral_partners p ON p.id=rc.partner_id WHERE rc.code=$1 AND rc.is_active=TRUE LIMIT 1`,[code]);
    const rc=cr.rows[0];if(!rc)return res.status(404).json({success:false,error:'Referral link is not valid'});
    if(rc.partner_id&&rc.partner_status!=='active')return res.status(409).json({success:false,error:'This referrer link is currently inactive'});
    let site;try{site=normalizeSite(domainInput)}catch(e){return res.status(400).json({success:false,error:'Enter a valid website/domain'})}
    await ensurePublisherApplySchema(pool);
    const token=crypto.randomBytes(32).toString('hex');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const ar=await client.query(`INSERT INTO network_publisher_applications (domain,brand_name,contact_name,email,niche,niche_main,niche_sub,niche_topics,niche_confidence,market,language,message,referral_code,metadata,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14::jsonb,NOW(),NOW()) RETURNING *`,[site.domain,brand||null,contactName||null,email,niche||null,nicheClass.main_niche,nicheClass.sub_niche,JSON.stringify(nicheClass.topics),nicheClass.confidence,market||null,language||null,message||null,code,JSON.stringify({source:'public_referral_application',canonical_url:site.canonical_url,niche_classification:nicheClass,market,language})]);
      const acc=await client.query(`INSERT INTO network_publisher_accounts (application_id,email,contact_name,access_token,status,created_at,updated_at) VALUES ($1,$2,$3,$4,'pending',NOW(),NOW()) RETURNING id,status`,[ar.rows[0].id,email,contactName||null,token]);
      const meta={publisher_domain:site.domain,publisher_url:site.canonical_url,brand_name:brand||null,contact_name:contactName||null,email,niche:niche||null,niche_main:nicheClass.main_niche,niche_sub:nicheClass.sub_niche,niche_topics:nicheClass.topics,message:message||null,source:'public_referral_application',publisher_application_id:ar.rows[0].id,publisher_account_id:acc.rows[0].id};
      const rr=await client.query(`INSERT INTO network_referrals (referral_code_id,referred_member_ref,status,reward_credits,metadata,created_at,updated_at) VALUES ($1,$2,'registered',10,$3::jsonb,NOW(),NOW()) RETURNING *`,[rc.id,site.domain,JSON.stringify(meta)]);
      await client.query('COMMIT');
      const refLabel=rc.partner_id
        ? ((await pool.query('SELECT name FROM network_referral_partners WHERE id=$1',[rc.partner_id]).catch(()=>({rows:[]}))).rows[0]?.name || 'Independent scout')
        : ((await pool.query('SELECT brand_name,domain FROM network_websites WHERE id=$1',[rc.website_id]).catch(()=>({rows:[]}))).rows[0]?.brand_name || 'Publisher referral');
      const ownerNotification=await networkNotifyOwnerPublisherApplication(pool,ar.rows[0],{source:'Referral publisher application',referred_by:refLabel});
      res.status(201).json({success:true,application_id:ar.rows[0].id,referral_application_id:rr.rows[0].id,status:'registered',dashboard_url:'/network/publisher/'+token,owner_notification:ownerNotification.state,message:'Application received. The referral remains linked to the person or publisher who introduced you.'});
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
  }));

  app.get('/network/join', wrap(async (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    const code=cleanText(req.query?.ref,120);
    const qr=code?await pool.query(`SELECT rc.id,rc.code,rc.label,rc.partner_id,rc.website_id,rc.is_active,p.name AS partner_name,p.status AS partner_status,w.brand_name,w.domain FROM network_referral_codes rc LEFT JOIN network_referral_partners p ON p.id=rc.partner_id LEFT JOIN network_websites w ON w.id=rc.website_id WHERE rc.code=$1 LIMIT 1`,[code]):{rows:[]};
    const ref=qr.rows[0];
    if(!ref||!ref.is_active||(ref.partner_id&&ref.partner_status!=='active'))return res.status(404).type('html').send('<h1>Referral link not available</h1>');
    await pool.query(`INSERT INTO network_referrals (referral_code_id,status,reward_credits,metadata,created_at,updated_at) VALUES ($1,'clicked',0,$2::jsonb,NOW(),NOW())`,[ref.id,JSON.stringify({source:'join_page'})]);
    const referredBy=ref.partner_name||ref.brand_name||ref.domain||'a ContentScale Network member';
    res.set('Cache-Control','no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Join ContentScale Network</title><style>body{font-family:Inter,system-ui;background:#08101f;color:#eef4ff;margin:0}main{max-width:760px;margin:auto;padding:40px 20px}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:24px}label{display:block;font-size:12px;color:#9fb1d6;margin:12px 0 6px}input,textarea{width:100%;box-sizing:border-box;background:#091329;color:#fff;border:1px solid #35507a;border-radius:9px;padding:11px}button{margin-top:16px;background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:11px 16px;font-weight:700;cursor:pointer}.note{color:#9aabd0;line-height:1.6}.ok{color:#86efac}.bad{color:#fca5a5}
button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><main><div class="card"><h1>Join as a publisher</h1><p class="note">You were invited by <strong>${String(referredBy).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</strong>. Submit your website interest below. Your application stays linked to that referrer so ContentScale can track who introduced the publisher.</p><form id="f"><input type="hidden" name="ref" value="${String(code).replace(/"/g,'&quot;')}"><label>Website/domain *</label><input name="domain" placeholder="example.com" required><label>Business / brand name</label><input name="brand_name"><label>Your name</label><input name="contact_name"><label>Email *</label><input name="email" type="email" required><label>What does your website mainly cover?</label><input id="publisherNiche" name="niche" placeholder="For example: SEO, roofing, accounting, AI marketing…" autocomplete="off"><div class="niche-help">You do not need to know the main niche, sub-niche or topic. ContentScale classifies it for you.</div><div id="publisherNichePreview" class="niche-preview"></div><label>Message</label><textarea name="message" rows="4"></textarea><button id="b">Send publisher application</button><div id="m" class="note"></div></form></div></main><script>
const ni=document.getElementById('niche'),np=document.getElementById('nichePreview');let nt;
async function classifyNiche(){const v=ni.value.trim();if(!v){np.textContent='';return}try{const r=await fetch('/api/network/niches/classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({niche:v})}),d=await r.json(),c=d.classification||{};np.textContent='ContentScale: '+(c.main_niche||'Other')+' → '+(c.sub_niche||v)+(c.topics&&c.topics.length?' · '+c.topics.join(' · '):'')}catch(e){np.textContent='ContentScale will classify this during review.'}}
if(ni){ni.oninput=()=>{clearTimeout(nt);nt=setTimeout(classifyNiche,350)};ni.onblur=classifyNiche}
document.getElementById('f').onsubmit=async e=>{e.preventDefault();const b=document.getElementById('b'),m=document.getElementById('m');b.disabled=true;b.textContent='Sending…';m.textContent='';try{const o=Object.fromEntries(new FormData(e.target).entries()),r=await fetch('/api/network/referrals/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not submit');m.className='ok';m.innerHTML='✓ Application received and linked to your referrer.'+(d.dashboard_url?' <a style="color:#8dd9ff;font-weight:800" href="'+d.dashboard_url+'">Open your private publisher dashboard →</a>':'');b.textContent='✓ Sent'}catch(err){m.className='bad';m.textContent='✕ '+err.message;b.disabled=false;b.textContent='Send publisher application'}};</script></body></html>`);
  }));

  app.get('/network/referrals',(req,res)=>{if(!envEnabled())return res.status(404).send('Network is not enabled.');res.set('Cache-Control','no-store');res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Publisher Scouts</title><style>body{font-family:Inter,system-ui;background:#08101f;color:#eef4ff;margin:0}main{max-width:1180px;margin:auto;padding:34px 20px}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin:16px 0}a{color:#8dd9ff}.note,.tiny{color:#9aabd0;line-height:1.5}.tiny{font-size:12px}label{display:block;font-size:12px;color:#9fb1d6;margin:10px 0 6px}input,textarea,select{width:100%;box-sizing:border-box;background:#091329;color:#fff;border:1px solid #35507a;border-radius:9px;padding:10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.btn{background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:10px 13px;font-weight:700;cursor:pointer}.btn:disabled{opacity:.6}.btn.warn{background:#7c2d12;border-color:#c2410c}.btn.danger{background:#7f1d1d;border-color:#dc2626}.btn.secondary{background:#172554;border-color:#35507a}.row{border-top:1px solid #26375c;padding:12px 0}.stats{display:flex;gap:12px;flex-wrap:wrap}.pill{background:#132443;border:1px solid #35507a;border-radius:999px;padding:4px 8px;font-size:12px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}
button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><main><p><a href="/network/admin">← Network admin</a></p><div class="card"><h1>Publisher Scouts</h1><p class="note">Independent scouts do not need to be publishers. Their unique link permanently attributes a referred publisher application to them. The current referral reward is 10 credits only after a genuine publisher becomes active and the referral is marked rewarded. Clicks and empty signups earn 0. Revoke disables links while preserving history. Delete is only allowed when there is no real publisher/application history.</p></div><div class="card"><h2>Add independent referrer / scout</h2><div class="grid"><div><label>Name *</label><input id="pName"></div><div><label>Email</label><input id="pEmail" type="email"></div><div><label>Label</label><input id="pLabel" placeholder="e.g. Roofing outreach Philippines"></div></div><label>Notes</label><textarea id="pNotes" rows="2"></textarea><button class="btn" id="createPartner" style="margin-top:12px">Create scout + referral link</button><div id="created" class="note" style="margin-top:10px"></div></div><div class="card"><h2>Scout links</h2><div id="codes" class="note">Loading…</div></div><div class="card"><h2>Referred publisher applications</h2><div id="leads" class="note">Loading…</div></div></main><script>(function(){const key=localStorage.getItem('admin_id')||'',esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c)),api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt),d=await r.json();if(!r.ok){const e=Error(d.error||'Request failed');e.payload=d;e.status=r.status;throw e}return d};async function load(){try{const d=await api('/api/network/admin/referrals');document.getElementById('codes').innerHTML=(d.codes||[]).map(x=>'<div class="row"><strong>'+(x.partner_name?'Scout: '+esc(x.partner_name):'Member/Publisher: '+esc(x.brand_name||x.domain||x.label||'General'))+'</strong> <span class="pill">'+esc(x.partner_status|| (x.is_active?'active':'inactive'))+'</span><div class="tiny">'+esc(x.label||'')+'</div><div style="margin:6px 0"><input readonly value="https://app.contentscale.site/network/join?ref='+esc(x.code)+'"></div><div class="stats"><span class="pill">Clicks '+x.clicks+'</span><span class="pill">Applications '+x.registered+'</span><span class="pill">Activated '+x.activated+'</span><span class="pill">Rewarded '+x.rewarded+'</span></div>'+(x.partner_id?'<div class="actions">'+(x.scout_access_token?'<a class="btn" target="_blank" href="/network/scout/'+esc(x.scout_access_token)+'">Open scout dashboard</a>':'')+'<button class="btn secondary" data-partner-status="active" data-partner="'+x.partner_id+'">Activate</button><button class="btn warn" data-partner-status="revoked" data-partner="'+x.partner_id+'">Revoke</button><button class="btn danger" data-delete-partner="'+x.partner_id+'">Delete person</button></div>':'')+'</div>').join('')||'No referral links yet.';document.getElementById('leads').innerHTML=(d.leads||[]).map(x=>{const m=x.metadata||{};return '<div class="row"><strong>'+esc(m.brand_name||m.publisher_domain||x.referred_member_ref||'Publisher')+'</strong> · '+esc(x.status)+'<div class="tiny">'+esc(m.publisher_domain||'')+' · '+esc(m.contact_name||'')+' · '+esc(m.email||'')+'<br>Referred by: '+esc(x.partner_name||x.referring_website||'member')+'</div><div style="margin-top:8px"><button class="btn" data-status="activated" data-id="'+x.id+'">Mark activated</button> <button class="btn" data-status="rewarded" data-id="'+x.id+'">Mark rewarded</button> <button class="btn" data-status="rejected" data-id="'+x.id+'">Reject</button></div></div>'}).join('')||'No publisher applications yet.'}catch(e){document.getElementById('codes').textContent=e.message}}document.getElementById('createPartner').onclick=async function(){const b=this;b.disabled=true;b.textContent='Creating…';try{const d=await api('/api/network/admin/referral-partners',{method:'POST',body:JSON.stringify({name:document.getElementById('pName').value,email:document.getElementById('pEmail').value,label:document.getElementById('pLabel').value,notes:document.getElementById('pNotes').value})});document.getElementById('created').innerHTML='✓ Created: <strong>'+esc(d.share_url)+'</strong>'+(d.dashboard_url?'<br><a class="btn" target="_blank" href="'+esc(d.dashboard_url)+'">Open scout dashboard</a>':'');document.getElementById('pName').value='';document.getElementById('pEmail').value='';document.getElementById('pLabel').value='';document.getElementById('pNotes').value='';await load()}catch(e){alert(e.message)}finally{b.disabled=false;b.textContent='Create scout + referral link'}};document.getElementById('codes').onclick=async e=>{const sb=e.target.closest('[data-partner-status]');if(sb){sb.disabled=true;const old=sb.textContent;sb.textContent='Saving…';try{await api('/api/network/admin/referral-partners/'+sb.dataset.partner+'/status',{method:'PATCH',body:JSON.stringify({status:sb.dataset.partnerStatus})});await load()}catch(err){alert(err.message);sb.disabled=false;sb.textContent=old}return}const db=e.target.closest('[data-delete-partner]');if(!db)return;if(!confirm('Delete this referrer? If publisher/application history exists, ContentScale will revoke the person instead to preserve attribution.'))return;db.disabled=true;db.textContent='Deleting…';try{await api('/api/network/admin/referral-partners/'+db.dataset.deletePartner,{method:'DELETE'});await load()}catch(err){if(err.payload&&err.payload.revoked){alert(err.message);await load()}else{alert(err.message);db.disabled=false;db.textContent='Delete person'}}};document.getElementById('leads').onclick=async e=>{const b=e.target.closest('[data-status]');if(!b)return;b.disabled=true;const old=b.textContent;b.textContent='Saving…';try{await api('/api/network/admin/referrals/'+b.dataset.id+'/status',{method:'PATCH',body:JSON.stringify({status:b.dataset.status})});await load()}catch(err){alert(err.message);b.disabled=false;b.textContent=old}};load()})();</script></body></html>`) });

  // PUBLIC NETWORK LANDING — server-rendered/indexable. Sponsored content is always labeled.

  app.get('/network/assets/verified-business-og.png',(req,res)=>{
    res.set('Cache-Control','public, max-age=86400');
    res.type('image/png').send(Buffer.from('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','base64'));
  });

  // ------------------------------------------------------------------
  // BUSINESS DIRECTORY — acquisition layer before Publishing Network.
  // Imported records are NOT verified. Verification is explicit and manual.
  // ------------------------------------------------------------------
  app.get('/api/network/directory', wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    if(!envEnabled())return res.status(404).json({success:false,error:'Network is not enabled'});
    const q=cleanText(req.query?.q,180).toLowerCase();
    const params=[];let where=`status IN ('imported','unclaimed','claim_pending','verified')`;
    if(q){params.push('%'+q+'%');where+=` AND (LOWER(business_name) LIKE $${params.length} OR LOWER(COALESCE(domain,'')) LIKE $${params.length} OR LOWER(COALESCE(primary_niche,'')) LIKE $${params.length} OR LOWER(COALESCE(sub_niche,'')) LIKE $${params.length} OR LOWER(COALESCE(market,'')) LIKE $${params.length})`}
    const r=await pool.query(`SELECT * FROM network_directory_businesses WHERE ${where} ORDER BY CASE WHEN status='verified' THEN 0 ELSE 1 END,updated_at DESC LIMIT 500`,params);
    res.set('Cache-Control','public, max-age=60');
    res.json({success:true,businesses:r.rows.map(publicDirectoryBusiness)});
  }));

  app.post('/api/network/directory/request', wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    if(!envEnabled())return res.status(409).json({success:false,error:'Network is disabled'});
    const businessName=cleanText(req.body?.business_name,220),claimName=cleanText(req.body?.claim_name||req.body?.contact_name,200),
      claimEmail=cleanText(req.body?.claim_email||req.body?.email,320).toLowerCase(),
      market=cleanText(req.body?.market||req.body?.country,120)||null,language=cleanText(req.body?.language,30)||null,
      nicheInput=cleanText(req.body?.niche,240),description=cleanText(req.body?.description,1200)||null;
    if(!businessName)return res.status(400).json({success:false,error:'Business name is required'});
    if(!claimEmail||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimEmail))return res.status(400).json({success:false,error:'Enter a valid email address'});
    let site=null;
    if(req.body?.domain){try{site=normalizeSite(req.body.domain)}catch(e){return res.status(400).json({success:false,error:e.message||'Enter a valid public website/domain'})}}
    const cls=classifyNetworkNiche(nicheInput||'');
    let slug=networkSlug(businessName+(market?' '+market:''));
    const existing=site?.domain
      ? await pool.query(`SELECT * FROM network_directory_businesses WHERE LOWER(domain)=LOWER($1) LIMIT 1`,[site.domain])
      : await pool.query(`SELECT * FROM network_directory_businesses WHERE slug=$1 LIMIT 1`,[slug]);
    if(existing.rows[0]){
      if(existing.rows[0].status==='verified')return res.status(409).json({success:false,error:'This business is already verified.'});
      const r=await pool.query(`UPDATE network_directory_businesses SET
        business_name=$2,domain=COALESCE($3,domain),canonical_url=COALESCE($4,canonical_url),description=COALESCE($5,description),
        primary_niche=COALESCE($6,primary_niche),sub_niche=COALESCE($7,sub_niche),
        topic_tags=CASE WHEN $8::jsonb='[]'::jsonb THEN topic_tags ELSE $8::jsonb END,
        market=COALESCE($9,market),language=COALESCE($10,language),
        status='claim_pending',claim_name=$11,claim_email=$12,claim_message=$13,claim_submitted_at=NOW(),
        metadata=COALESCE(metadata,'{}'::jsonb)||$14::jsonb,updated_at=NOW()
        WHERE id=$1 RETURNING *`,[
          existing.rows[0].id,businessName,site?.domain||null,site?.canonical_url||null,description,
          cls.main_niche,cls.sub_niche,JSON.stringify(cls.topics),market,language,claimName||null,claimEmail,
          cleanText(req.body?.claim_message,1500)||null,JSON.stringify({claim_source:'public_request',niche_classification:cls})
        ]);
      const claimToken=await ensureBusinessClaimDashboardToken(pool,r.rows[0]);const notification=await networkNotifyDirectoryClaim(pool,r.rows[0],'claim_submitted');return res.json({success:true,profile:publicDirectoryBusiness(r.rows[0]),dashboard_url:'/network/business/'+claimToken,message:'Verification request received.',notification});
    }
    let trySlug=slug,seq=2;
    while((await pool.query('SELECT 1 FROM network_directory_businesses WHERE slug=$1 LIMIT 1',[trySlug])).rows[0])trySlug=(slug+'-'+seq++).slice(0,180);
    const r=await pool.query(`INSERT INTO network_directory_businesses
      (slug,business_name,domain,canonical_url,description,source,primary_niche,sub_niche,topic_tags,market,language,status,claim_name,claim_email,claim_message,claim_submitted_at,metadata,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,'public_request',$6,$7,$8::jsonb,$9,$10,'claim_pending',$11,$12,$13,NOW(),$14::jsonb,NOW(),NOW()) RETURNING *`,[
        trySlug,businessName,site?.domain||null,site?.canonical_url||null,description,cls.main_niche,cls.sub_niche,JSON.stringify(cls.topics),
        market,language,claimName||null,claimEmail,cleanText(req.body?.claim_message,1500)||null,
        JSON.stringify({claim_source:'public_request',niche_classification:cls})
      ]);
    const claimToken=await ensureBusinessClaimDashboardToken(pool,r.rows[0]);const notification=await networkNotifyDirectoryClaim(pool,r.rows[0],'claim_submitted');res.status(201).json({success:true,profile:publicDirectoryBusiness(r.rows[0]),dashboard_url:'/network/business/'+claimToken,message:'Verification request received.',notification});
  }));

  app.post('/api/network/directory/:slug/claim', wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    if(!envEnabled())return res.status(409).json({success:false,error:'Network is disabled'});
    const slug=cleanText(req.params.slug,190),name=cleanText(req.body?.claim_name||req.body?.contact_name,200),
      email=cleanText(req.body?.claim_email||req.body?.email,320).toLowerCase(),
      message=cleanText(req.body?.claim_message||req.body?.message,1500),
      businessScope=cleanText(req.body?.business_scope||'',40).toLowerCase(),
      serviceArea=cleanText(req.body?.service_area||'',400);
    if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({success:false,error:'Enter a valid email address'});
    const r=await pool.query(`UPDATE network_directory_businesses SET
      status='claim_pending',claim_name=$2,claim_email=$3,claim_message=$4,claim_submitted_at=NOW(),
      metadata=COALESCE(metadata,'{}'::jsonb)||$5::jsonb,updated_at=NOW()
      WHERE slug=$1 AND status IN ('imported','unclaimed','claim_pending') RETURNING *`,[
        slug,name||null,email,message||null,JSON.stringify({last_claim_source:'public_profile',business_scope:businessScope||null,service_area:serviceArea||null})
      ]);
    if(!r.rows[0])return res.status(404).json({success:false,error:'Business not found or already verified'});
    const claimToken=await ensureBusinessClaimDashboardToken(pool,r.rows[0]);const notification=await networkNotifyDirectoryClaim(pool,r.rows[0],'claim_submitted');res.json({success:true,profile:publicDirectoryBusiness(r.rows[0]),dashboard_url:'/network/business/'+claimToken,message:'Claim submitted.',notification});
  }));


  app.patch('/api/network/admin/directory/:id/facts', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    const id=Number(req.params.id)||0;if(!id)return res.status(400).json({success:false,error:'Invalid business'});
    const current=(await pool.query('SELECT * FROM network_directory_businesses WHERE id=$1 LIMIT 1',[id])).rows[0];
    if(!current)return res.status(404).json({success:false,error:'Business not found'});
    const businessName=cleanText(req.body?.business_name,220)||current.business_name;
    const nicheInput=cleanText(req.body?.niche,240)||[current.primary_niche,current.sub_niche].filter(Boolean).join(' ');
    const cls=classifyNetworkNiche(nicheInput);
    const normalized=normalizeNetworkLocaleInput(req.body?.language,req.body?.market||req.body?.country);
    const market=normalized.market||cleanText(req.body?.market||req.body?.country,120)||current.market||current.country||null;
    const language=normalized.language||cleanText(req.body?.language,80)||current.language||null;
    const meta=Object.assign({},safeJsonObject(current.metadata));
    meta.contact_email=cleanText(req.body?.contact_email,320).toLowerCase()||null;
    meta.business_scope=cleanText(req.body?.business_scope,40).toLowerCase()||null;
    meta.service_area=cleanText(req.body?.service_area,400)||null;
    meta.admin_facts_updated_at=new Date().toISOString();
    const r=await pool.query(`UPDATE network_directory_businesses SET
      business_name=$2,primary_niche=$3,sub_niche=$4,topic_tags=$5::jsonb,
      market=$6,language=$7,metadata=$8::jsonb,updated_at=NOW()
      WHERE id=$1 RETURNING *`,[id,businessName,cls.main_niche,cls.sub_niche,JSON.stringify(cls.topics),market,language,JSON.stringify(meta)]);
    res.json({success:true,business:r.rows[0],profile_url:'/network/directory/'+r.rows[0].slug});
  }));

  app.get('/api/network/admin/directory', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    const r=await pool.query(`SELECT * FROM network_directory_businesses ORDER BY CASE status WHEN 'claim_pending' THEN 0 WHEN 'unclaimed' THEN 1 WHEN 'imported' THEN 2 WHEN 'verified' THEN 3 ELSE 4 END,updated_at DESC LIMIT 2000`);
    const counts=await pool.query(`SELECT status,COUNT(*)::int AS n FROM network_directory_businesses GROUP BY status`);
    res.json({success:true,businesses:r.rows,counts:Object.fromEntries(counts.rows.map(x=>[x.status,Number(x.n||0)]))});
  }));

  app.post('/api/network/admin/directory/import', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    if(!envEnabled())return res.status(409).json({success:false,error:'Network is disabled'});
    const incoming=Array.isArray(req.body?.businesses)?req.body.businesses.slice(0,500):[req.body||{}];
    let created=0,updated=0,skipped=0;const results=[];
    for(const x of incoming){
      const businessName=cleanText(x.business_name||x.name,220);if(!businessName){skipped++;continue}
      let site=null;if(x.domain||x.website){try{site=normalizeSite(x.domain||x.website)}catch(e){skipped++;results.push({business_name:businessName,error:'Invalid domain'});continue}}
      const nicheInput=cleanText(x.niche||x.category,240),cls=classifyNetworkNiche(nicheInput||''),market=cleanText(x.market||x.country,120)||null,language=cleanText(x.language,30)||null,contactEmail=cleanText(x.contact_email||'',320).toLowerCase()||null,businessScope=cleanText(x.business_scope||'',40).toLowerCase()||null,serviceArea=cleanText(x.service_area||'',400)||null;
      let found=site?.domain?(await pool.query(`SELECT * FROM network_directory_businesses WHERE LOWER(domain)=LOWER($1) LIMIT 1`,[site.domain])).rows[0]:null;
      if(found){
        const r=await pool.query(`UPDATE network_directory_businesses SET
          business_name=COALESCE(NULLIF($2,''),business_name),description=COALESCE($3,description),
          source=COALESCE(NULLIF($4,''),source),source_ref=COALESCE($5,source_ref),
          primary_niche=COALESCE($6,primary_niche),sub_niche=COALESCE($7,sub_niche),
          topic_tags=CASE WHEN $8::jsonb='[]'::jsonb THEN topic_tags ELSE $8::jsonb END,
          market=COALESCE($9,market),language=COALESCE($10,language),
          metadata=COALESCE(metadata,'{}'::jsonb)||$11::jsonb,updated_at=NOW()
          WHERE id=$1 RETURNING *`,[
            found.id,businessName,cleanText(x.description,1200)||null,cleanText(x.source,80)||'lead_crawler',cleanText(x.source_ref,240)||null,
            cls.main_niche,cls.sub_niche,JSON.stringify(cls.topics),market,language,
            JSON.stringify({imported_by_admin:true,is_test:x.is_test===true,niche_input:nicheInput||null,contact_email:contactEmail,business_scope:businessScope,service_area:serviceArea})
          ]);
        updated++;results.push({id:r.rows[0].id,slug:r.rows[0].slug,action:'updated'});continue;
      }
      let slug=networkSlug(businessName+(market?' '+market:'')),candidate=slug,n=2;
      while((await pool.query('SELECT 1 FROM network_directory_businesses WHERE slug=$1 LIMIT 1',[candidate])).rows[0])candidate=(slug+'-'+n++).slice(0,180);
      const r=await pool.query(`INSERT INTO network_directory_businesses
        (slug,business_name,domain,canonical_url,description,source,source_ref,primary_niche,sub_niche,topic_tags,market,country,language,status,metadata,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,'unclaimed',$14::jsonb,NOW(),NOW()) RETURNING *`,[
          candidate,businessName,site?.domain||null,site?.canonical_url||null,cleanText(x.description,1200)||null,
          cleanText(x.source,80)||'lead_crawler',cleanText(x.source_ref,240)||null,cls.main_niche,cls.sub_niche,JSON.stringify(cls.topics),
          market,cleanText(x.country,120)||market,language,JSON.stringify({imported_by_admin:true,is_test:x.is_test===true,niche_input:nicheInput||null,contact_email:contactEmail,business_scope:businessScope,service_area:serviceArea})
        ]);
      created++;results.push({id:r.rows[0].id,slug:r.rows[0].slug,action:'created'});
    }
    res.json({success:true,created,updated,skipped,results});
  }));

  app.post('/api/network/admin/directory/:id/check', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    const id=Number(req.params.id)||0;if(!id)return res.status(400).json({success:false,error:'Invalid business'});
    const qr=await pool.query('SELECT * FROM network_directory_businesses WHERE id=$1 LIMIT 1',[id]);
    const x=qr.rows[0];if(!x)return res.status(404).json({success:false,error:'Business not found'});
    if(!x.domain&&!x.canonical_url)return res.status(409).json({success:false,error:'Add a website/domain before checking this business'});
    const target=x.canonical_url||('https://'+x.domain);let check;
    try{const fetched=await safeFetchHtml(target);check=analyzeWebsiteHtml({status:fetched.response.status,html:fetched.html,finalUrl:fetched.finalUrl,contentType:fetched.contentType})}
    catch(e){check={outcome:'rejected',technical_pass:false,error:cleanText(e.message,500),checked_url:target,checked_at:new Date().toISOString()}}
    check.checked_by_admin_id=cleanText(req.admin?.id||req.headers['x-admin-key']||'admin',200);
    const r=await pool.query(`UPDATE network_directory_businesses SET website_check=$2::jsonb,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,JSON.stringify(check)]);
    res.json({success:true,business:r.rows[0],check});
  }));

  app.post('/api/network/admin/directory/:id/review', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    const id=Number(req.params.id)||0,decision=cleanText(req.body?.decision,30).toLowerCase(),note=cleanText(req.body?.note,1200);
    if(!id||!['verified','rejected'].includes(decision))return res.status(400).json({success:false,error:'Choose verified or rejected'});
    if(decision==='rejected'&&!note)return res.status(400).json({success:false,error:'Add a rejection reason so the record explains why it was rejected.'});
    const qr=await pool.query('SELECT * FROM network_directory_businesses WHERE id=$1 LIMIT 1',[id]);const x=qr.rows[0];
    if(!x)return res.status(404).json({success:false,error:'Business not found'});
    const check=safeJsonObject(x.website_check),override=req.body?.override===true;
    if(decision==='verified'&&check.technical_pass!==true&&!override)return res.status(409).json({success:false,error:'Run the website check first. If you verified it manually, use an override with a review note.'});
    if(decision==='verified'&&check.technical_pass!==true&&(!note||note.length<8))return res.status(409).json({success:false,error:'Manual override requires a short review note.'});
    const adminId=cleanText(req.admin?.id||req.headers['x-admin-key']||'admin',200);
    const meta=Object.assign({},safeJsonObject(x.metadata),{last_admin_review:{decision,note:note||null,admin_id:adminId,at:new Date().toISOString(),manual_override:override&&check.technical_pass!==true}});
    const r=await pool.query(`UPDATE network_directory_businesses SET status=$2,
      verified_at=CASE WHEN $2='verified' THEN NOW() ELSE verified_at END,
      verified_by_admin_id=CASE WHEN $2='verified' THEN $3 ELSE verified_by_admin_id END,
      metadata=$4::jsonb,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,decision,adminId,JSON.stringify(meta)]);
    const claimToken=await ensureBusinessClaimDashboardToken(pool,r.rows[0]);const notification=await networkNotifyDirectoryClaim(pool,r.rows[0],decision,note||'');res.json({success:true,business:r.rows[0],dashboard_url:'/network/business/'+claimToken,profile_url:'/network/directory/'+r.rows[0].slug,share_card_url:decision==='verified'?('/network/directory/'+r.rows[0].slug+'/share.svg'):null,notification});
  }));

  app.delete('/api/network/admin/directory/:id/test', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    const id=Number(req.params.id)||0,confirmText=cleanText(req.body?.confirm,80);
    if(!id)return res.status(400).json({success:false,error:'Invalid business'});
    if(confirmText!=='DELETE TEST DATA')return res.status(400).json({success:false,error:'Type DELETE TEST DATA to confirm'});
    const qr=await pool.query('SELECT * FROM network_directory_businesses WHERE id=$1 LIMIT 1',[id]);const x=qr.rows[0];
    if(!x)return res.status(404).json({success:false,error:'Business not found'});
    const meta=safeJsonObject(x.metadata);
    if(x.status==='verified'&&meta.is_test!==true)return res.status(409).json({success:false,error:'Verified real businesses are protected.'});
    await pool.query('DELETE FROM network_directory_businesses WHERE id=$1',[id]);
    res.json({success:true,deleted_id:id,deleted_business:x.business_name});
  }));

  app.delete('/api/network/admin/directory/test-data', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    if(cleanText(req.body?.confirm,80)!=='DELETE ALL TEST DATA')return res.status(400).json({success:false,error:'Type DELETE ALL TEST DATA to confirm'});
    const r=await pool.query(`DELETE FROM network_directory_businesses WHERE COALESCE((metadata->>'is_test')::boolean,FALSE)=TRUE RETURNING id,business_name`);
    res.json({success:true,deleted:r.rowCount,items:r.rows});
  }));

  app.get('/network/directory/:slug/share.svg', wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    const slug=cleanText(req.params.slug,190);
    const qr=await pool.query(`SELECT * FROM network_directory_businesses WHERE slug=$1 AND status='verified' LIMIT 1`,[slug]);const x=qr.rows[0];
    if(!x)return res.status(404).send('Verified business not found');
    const escSvg=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    const niche=[x.primary_niche,x.sub_niche].filter(Boolean).join(' → ')||'Verified Business';
    res.set('Cache-Control','public, max-age=300');res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07111f"/><stop offset="1" stop-color="#172554"/></linearGradient><linearGradient id="g" x1="0" x2="1"><stop stop-color="#8b5cf6"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>
      <rect width="1200" height="630" fill="url(#bg)"/><rect x="52" y="52" width="1096" height="526" rx="34" fill="#0e1b30" stroke="#35507a" stroke-width="2"/>
      <line x1="104" y1="117" x2="154" y2="91" stroke="#38bdf8" stroke-width="5" opacity=".75"/><line x1="104" y1="117" x2="168" y2="144" stroke="#38bdf8" stroke-width="5" opacity=".75"/><line x1="104" y1="117" x2="130" y2="169" stroke="#38bdf8" stroke-width="5" opacity=".75"/>
      <circle cx="104" cy="117" r="22" fill="url(#g)"/><circle cx="154" cy="91" r="11" fill="#38bdf8"/><circle cx="168" cy="144" r="12" fill="#8b5cf6"/><circle cx="130" cy="169" r="9" fill="#38bdf8"/>
      <text x="215" y="128" fill="#dbeafe" font-size="31" font-family="Arial,sans-serif" font-weight="700">ContentScale Network</text>
      <text x="95" y="255" fill="#ffffff" font-size="58" font-family="Arial,sans-serif" font-weight="800">${escSvg(x.business_name)}</text>
      <text x="95" y="320" fill="#86efac" font-size="30" font-family="Arial,sans-serif" font-weight="700">✓ Verified Business</text>
      <text x="95" y="378" fill="#bfdbfe" font-size="25" font-family="Arial,sans-serif">${escSvg(niche)}</text>
      <text x="95" y="425" fill="#9fb1cb" font-size="22" font-family="Arial,sans-serif">${escSvg(directoryCountryName(x.market||x.country))}${x.language?' · '+escSvg(directoryLanguageName(x.language)):''}</text>
      <text x="95" y="495" fill="#ffffff" font-size="22" font-family="Arial,sans-serif" font-weight="700">Be verified. Be mentioned. Be discovered.</text>
      <text x="95" y="535" fill="#8dd9ff" font-size="19" font-family="Arial,sans-serif">app.contentscale.site/network/directory/${escSvg(x.slug)}</text>
    </svg>`);
  }));

  app.get('/network/directory/admin', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Business Verification Cockpit</title><style>
body{margin:0;background:#07111f;color:#eef4ff;font-family:Inter,system-ui}.wrap{max-width:1350px;margin:auto;padding:28px 18px 70px}a{color:#8dd9ff}.card{background:#0e1b30;border:1px solid #29466e;border-radius:18px;padding:18px;margin:13px 0}.muted,.tiny{color:#9fb1cb;line-height:1.55}.tiny{font-size:12px}.btn{background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:9px 12px;font-weight:800;cursor:pointer;text-decoration:none}.good{background:#166534;border-color:#22c55e}.bad{background:#7f1d1d;border-color:#ef4444}.secondary{background:#101b31;border-color:#35507a}.row{border-top:1px solid #26375c;padding:15px 0}.row:first-child{border-top:0}.row.verifiedRow{border-left:3px solid #22c55e;padding-left:12px}.row.rejectedRow{border-left:3px solid #ef4444;padding-left:12px}.row.claimRow{border-left:3px solid #f59e0b;padding-left:12px}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.pill{display:inline-block;border:1px solid #35507a;border-radius:999px;padding:4px 8px;font-size:11px}.pill.ok{border-color:#22c55e;color:#86efac}.pill.bad{border-color:#ef4444;color:#fecaca}.pill.warn{border-color:#f59e0b;color:#fde68a}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.field label{display:block;font-size:11px;color:#9fb1cb;margin:7px 0 4px}.field input,.field select{width:100%;box-sizing:border-box;background:#081529;color:#fff;border:1px solid #35547b;border-radius:9px;padding:9px}.tour{border-color:#7c3aed}.steps{display:grid;grid-template-columns:repeat(6,minmax(220px,1fr));gap:16px;overflow-x:auto;padding:8px 6px 14px}.step{background:#09182a;border:1px solid #31527f;border-radius:12px;padding:15px;min-width:220px;transition:border-color .18s,box-shadow .18s,transform .18s}.step.done{border-color:#166534}.step.active{border:2px solid #3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.12),0 8px 22px rgba(0,0,0,.18);transform:translateY(-1px)}.step.active b{color:#bfdbfe}.nextGuide{border:1px solid #3b82f6;background:#0b1b35;border-radius:12px;padding:10px 12px;margin:10px 0;color:#dbeafe}.brandline{display:flex;align-items:center;gap:12px;margin-bottom:12px}.csnet{width:64px;height:64px;position:relative;flex:0 0 64px}.csnet i{position:absolute;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#38bdf8);box-shadow:0 0 18px rgba(56,189,248,.22)}.csnet i:nth-child(1){width:27px;height:27px;left:4px;top:18px}.csnet i:nth-child(2){width:15px;height:15px;left:34px;top:4px}.csnet i:nth-child(3){width:13px;height:13px;left:43px;top:31px}.csnet i:nth-child(4){width:10px;height:10px;left:24px;top:49px}.csnet:before,.csnet:after{content:'';position:absolute;height:2px;background:#38bdf8;transform-origin:left center;opacity:.75}.csnet:before{width:32px;left:24px;top:20px;transform:rotate(-25deg)}.csnet:after{width:34px;left:25px;top:34px;transform:rotate(11deg)}.reason{margin-top:5px;color:#fecaca}code{color:#bfdbfe}
button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}@keyframes csButtonSpin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}@media(max-width:800px){.grid{grid-template-columns:1fr 1fr}}
</style></head><body><div class="wrap"><p><a href="/network/admin">← Network Cockpit</a></p>
<div class="card tour"><div class="brandline"><span class="csnet" aria-hidden="true"><i></i><i></i><i></i><i></i></span><div><div class="tiny">CONTENTSCALE NETWORK</div><h1 style="margin:3px 0">Business Verification Cockpit</h1><p class="muted" style="margin:4px 0">Verify businesses first. Publishing is optional and comes later.</p></div></div><div class="steps"><div class="step" data-step="1"><b>1 · Import / claim</b><div class="tiny">Business enters the Directory.</div></div><div class="step" data-step="2"><b>2 · Review facts</b><div class="tiny">Check business facts, local reach and classification.</div></div><div class="step" data-step="3"><b>3 · Check website</b><div class="tiny">Run the real website check.</div></div><div class="step" data-step="4"><b>4 · Verify / reject</b><div class="tiny">Admin makes the decision.</div></div><div class="step" data-step="5"><b>5 · Public profile</b><div class="tiny">Review what the business owner sees.</div></div><div class="step" data-step="6"><b>6 · Publisher handoff</b><div class="tiny">Invite the verified business into Publishing.</div></div></div><div id="nextGuide" class="nextGuide">Loading next action…</div></div>
<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><h2 style="margin-bottom:3px">Import a business</h2><div class="tiny">Country and language are standardized so NL never means both “Netherlands” and “Dutch”.</div></div><button class="btn secondary" id="refreshBtn">Refresh</button></div><div class="grid"><div class="field"><label>Business name *</label><input id="iName"></div><div class="field"><label>Website/domain</label><input id="iDomain"></div><div class="field"><label>Contact email</label><input id="iContactEmail" type="email" placeholder="Optional · admin use only"></div><div class="field"><label>Niche / category</label><input id="iNiche" placeholder="SEO, roofing, accounting…"></div><div class="field"><label>Country / market</label><select id="iMarket"><option value="">Select country / market</option><option value="NL">Netherlands (NL)</option><option value="BE">Belgium (BE)</option><option value="US">United States (US)</option><option value="GB">United Kingdom (GB)</option><option value="DE">Germany (DE)</option><option value="FR">France (FR)</option><option value="ES">Spain (ES)</option><option value="IT">Italy (IT)</option><option value="PT">Portugal (PT)</option><option value="CA">Canada (CA)</option><option value="AU">Australia (AU)</option><option value="IE">Ireland (IE)</option><option value="CH">Switzerland (CH)</option><option value="AT">Austria (AT)</option><option value="SE">Sweden (SE)</option><option value="NO">Norway (NO)</option><option value="DK">Denmark (DK)</option><option value="FI">Finland (FI)</option><option value="PL">Poland (PL)</option><option value="PH">Philippines (PH)</option><option value="AE">United Arab Emirates (AE)</option><option value="SA">Saudi Arabia (SA)</option><option value="IN">India (IN)</option><option value="SG">Singapore (SG)</option></select></div><div class="field"><label>Language / locale</label><select id="iLanguage"><option value="">Select language / locale</option><option value="nl-NL">Dutch — Netherlands (nl-NL)</option><option value="nl-BE">Dutch — Belgium (nl-BE)</option><option value="en-US">English — United States (en-US)</option><option value="en-GB">English — United Kingdom (en-GB)</option><option value="en-AU">English — Australia (en-AU)</option><option value="en-CA">English — Canada (en-CA)</option><option value="de-DE">German — Germany (de-DE)</option><option value="fr-FR">French — France (fr-FR)</option><option value="es-ES">Spanish — Spain (es-ES)</option><option value="it-IT">Italian — Italy (it-IT)</option><option value="pt-PT">Portuguese — Portugal (pt-PT)</option><option value="pt-BR">Portuguese — Brazil (pt-BR)</option><option value="fil-PH">Filipino — Philippines (fil-PH)</option><option value="en-PH">English — Philippines (en-PH)</option><option value="ar-SA">Arabic — Saudi Arabia (ar-SA)</option><option value="ar-AE">Arabic — UAE (ar-AE)</option><option value="hi-IN">Hindi — India (hi-IN)</option><option value="id-ID">Indonesian — Indonesia (id-ID)</option><option value="ms-MY">Malay — Malaysia (ms-MY)</option></select></div><div class="field"><label>Business reach</label><select id="iScope"><option value="">Select reach</option><option value="local">Local business</option><option value="regional">Regional business</option><option value="national">National business</option><option value="online">Online / global</option></select></div><div class="field"><label>Service area</label><input id="iServiceArea" placeholder="e.g. New Jersey (NJ)"></div><div class="field"><label>Source</label><select id="iSource"><option value="lead_crawler">Lead Crawler</option><option value="manual_import">Manual import</option><option value="directory_claim">Directory claim</option><option value="quick_scan">Quick Scan</option><option value="ceo_report">CEO Report</option><option value="referral">Referral</option><option value="publisher_signup">Publisher signup</option></select></div><div class="field"><label>Test record?</label><input id="iTest" type="checkbox" style="width:auto"></div></div><button class="btn" id="importBtn" style="margin-top:10px">Import to directory</button><span id="importMsg" class="tiny"></span><p class="tiny">Automatic/batch import uses the same endpoint with <code>{"businesses":[...]}</code>.</p></div>
<div id="editOverlay" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.78);padding:24px;overflow:auto"><div class="card" style="max-width:760px;margin:5vh auto"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 style="margin:0">Edit business facts</h2><button class="btn secondary" id="editClose">Close</button></div><p class="tiny">Correct the same Directory record. Do not create a duplicate business.</p><div class="grid"><div class="field"><label>Business name</label><input id="eName"></div><div class="field"><label>Niche / category</label><input id="eNiche"></div><div class="field"><label>Country / market</label><input id="eMarket" placeholder="United States, US, Nederland…"></div><div class="field"><label>Language / locale</label><input id="eLanguage" placeholder="Dutch, Nederlands, English, en-US…"></div><div class="field"><label>Business reach</label><select id="eScope"><option value="">Not specified</option><option value="local">Local business</option><option value="regional">Regional business</option><option value="national">National business</option><option value="online">Online / global</option></select></div><div class="field"><label>Service area</label><input id="eServiceArea" placeholder="e.g. New Jersey (NJ)"></div><div class="field"><label>Contact email</label><input id="eContactEmail" type="email" placeholder="Admin only"></div></div><div style="margin-top:14px"><button class="btn" id="editSave">Save business facts</button> <span class="tiny" id="editMsg"></span></div></div></div><div class="card"><h2>Directory records</h2><div id="counts" class="tiny"></div><div id="rows">Loading…</div></div>
<div class="card"><h2>Test data cleanup</h2><p class="muted">Test records can be removed without touching verified real businesses.</p><button class="btn bad" id="deleteAllTests">Delete all marked test data</button></div></div>
<script>(function(){const key=localStorage.getItem('admin_id')||'',esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c)),api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt),t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(!r.ok)throw Error(d.error||('Request failed '+r.status));return d};let lastLoad=0;
function reviewReason(x){const m=x.metadata||{},r=m.last_admin_review||{};if(x.status==='rejected')return r.note||((x.website_check||{}).error)||'No rejection reason saved';return r.note||''}
function setGuide(step,label){document.querySelectorAll('[data-step]').forEach(el=>{const n=Number(el.dataset.step||0);el.classList.toggle('done',n<step);el.classList.toggle('active',n===step)});document.getElementById('nextGuide').innerHTML='<b>Next action · Step '+step+'</b><div class="tiny">'+esc(label)+'</div>'}async function load(){lastLoad=Date.now();const d=await api('/api/network/admin/directory');document.getElementById('counts').textContent=Object.entries(d.counts||{}).map(([k,v])=>k+': '+v).join(' · ');const all=d.businesses||[];window.directoryRows=all;let guideStep=1,guide='Import or receive the first business claim.';if(all.length){const pending=all.find(x=>x.status==='claim_pending'||x.status==='unclaimed'||x.status==='imported');const checked=pending&&pending.website_check&&pending.website_check.technical_pass===true;if(pending&&!checked){guideStep=3;guide='Run Check website for '+pending.business_name+' and inspect the result.'}else if(pending&&checked){guideStep=4;guide='Website check passed. Verify or reject '+pending.business_name+'.'}else if(all.find(x=>x.status==='verified')){guideStep=5;guide='Open the verified public profile and confirm all facts are visible. Then continue to Publisher handoff.'}}setGuide(guideStep,guide);document.getElementById('rows').innerHTML=all.map(x=>{const check=x.website_check||{},isTest=x.metadata&&x.metadata.is_test===true,reason=reviewReason(x),cls=x.status==='verified'?'verifiedRow':x.status==='rejected'?'rejectedRow':x.status==='claim_pending'?'claimRow':'',pill=x.status==='verified'?'ok':x.status==='rejected'?'bad':x.status==='claim_pending'?'warn':'';return '<div class="row '+cls+'"><b>'+esc(x.business_name)+'</b> <span class="pill '+pill+'">'+esc(x.status)+'</span>'+(isTest?' <span class="pill">TEST</span>':'')+'<div class="tiny">'+esc(x.domain||'No website')+' · '+esc([x.primary_niche,x.sub_niche].filter(Boolean).join(' → ')||'No classification')+' · '+esc(x.market||x.country||'No country')+' · '+esc(x.language||'No language')+'<br>Lead contact: '+esc((x.metadata&&x.metadata.contact_email)||'—')+' · Reach: '+esc((x.metadata&&x.metadata.business_scope)||'—')+' · Service area: '+esc((x.metadata&&x.metadata.service_area)||'—')+'<br>Claim: '+esc(x.claim_name||'—')+' · '+esc(x.claim_email||'—')+'<br>Website check: '+esc(check.outcome||'not run')+(check.technical_pass===true?' · technical pass ✓':'')+(check.error?'<div class="reason">Check detail: '+esc(check.error)+'</div>':'')+(reason?'<div class="reason">Review reason: '+esc(reason)+'</div>':'')+'</div><div class="actions"><button class="btn secondary" data-edit="'+x.id+'">Edit facts</button><a class="btn secondary" target="_blank" href="/network/directory/'+encodeURIComponent(x.slug)+'">Open profile ↗</a>'+(x.status==='verified'?'<a class="btn good" target="_blank" href="/network/directory/'+encodeURIComponent(x.slug)+'/share.svg">Share graphic ↗</a>':'')+'<button class="btn secondary" data-check="'+x.id+'">Check website</button>'+(x.status!=='verified'?'<button class="btn good" data-review="verified" data-id="'+x.id+'">Verify business</button>':'')+(x.status!=='verified'?'<button class="btn bad" data-review="rejected" data-id="'+x.id+'">Reject</button>':'')+(isTest||x.status!=='verified'?'<button class="btn bad" data-delete="'+x.id+'">Delete test/unverified record</button>':'')+'</div></div>'}).join('')||'<p class="muted">No directory businesses yet.</p>'}
document.getElementById('refreshBtn').onclick=load;window.addEventListener('focus',()=>{if(Date.now()-lastLoad>30000)load()});
document.getElementById('importBtn').onclick=async()=>{const b=document.getElementById('importBtn'),m=document.getElementById('importMsg');b.disabled=true;b.classList.add('busy');b.textContent='Importing…';m.style.color='#bfdbfe';m.textContent='Importing business…';try{await api('/api/network/admin/directory/import',{method:'POST',body:JSON.stringify({business_name:document.getElementById('iName').value,domain:document.getElementById('iDomain').value,contact_email:document.getElementById('iContactEmail').value,niche:document.getElementById('iNiche').value,market:document.getElementById('iMarket').value,language:document.getElementById('iLanguage').value,business_scope:document.getElementById('iScope').value,service_area:document.getElementById('iServiceArea').value,source:document.getElementById('iSource').value,is_test:document.getElementById('iTest').checked})});m.style.color='#86efac';m.textContent='✓ Imported successfully';b.textContent='✓ Imported';await load();setTimeout(()=>{b.textContent='Import to directory'},1400)}catch(e){m.style.color='#fca5a5';m.textContent='✕ '+(e.message||e);b.textContent='✕ Import failed'}finally{b.disabled=false;b.classList.remove('busy')}};
document.getElementById('rows').onclick=async e=>{const c=e.target.closest('[data-check]'),rv=e.target.closest('[data-review]'),del=e.target.closest('[data-delete]'),edit=e.target.closest('[data-edit]');if(edit){const x=(window.directoryRows||[]).find(r=>String(r.id)===String(edit.dataset.edit));if(!x)return;document.getElementById('editOverlay').style.display='block';document.getElementById('editOverlay').dataset.id=x.id;document.getElementById('eName').value=x.business_name||'';document.getElementById('eNiche').value=[x.primary_niche,x.sub_niche].filter(Boolean).join(' / ');document.getElementById('eMarket').value=x.market||x.country||'';document.getElementById('eLanguage').value=x.language||'';document.getElementById('eScope').value=(x.metadata&&x.metadata.business_scope)||'';document.getElementById('eServiceArea').value=(x.metadata&&x.metadata.service_area)||'';document.getElementById('eContactEmail').value=(x.metadata&&x.metadata.contact_email)||'';document.getElementById('editMsg').textContent='';return;}if(c){c.disabled=true;c.textContent='Checking…';try{const d=await api('/api/network/admin/directory/'+c.dataset.check+'/check',{method:'POST',body:'{}'});alert('Website check: '+(d.check.outcome||'unknown')+'\\nTechnical pass: '+String(d.check.technical_pass===true)+(d.check.error?'\\nDetail: '+d.check.error:''));await load()}catch(err){alert(err.message);c.disabled=false;c.textContent='Check website'}return}if(rv){const decision=rv.dataset.review,id=rv.dataset.id;let body={decision};if(decision==='rejected'){const reason=prompt('Why are you rejecting this business? This reason will be saved in Admin history.');if(!reason)return;body.note=reason}if(decision==='verified'){const row=rv.closest('.row'),failed=!row.textContent.includes('technical pass ✓');if(failed){if(!confirm('Automated website check is not passing. Continue only if you verified the business manually.'))return;const note=prompt('Enter the manual verification / override note:');if(!note)return;body.override=true;body.note=note}}rv.disabled=true;rv.textContent=decision==='verified'?'Verifying…':'Rejecting…';try{const d=await api('/api/network/admin/directory/'+id+'/review',{method:'POST',body:JSON.stringify(body)});if(d.profile_url&&decision==='verified')alert('Verified.\\nProfile: '+location.origin+d.profile_url+'\\nShare graphic: '+location.origin+d.share_card_url);await load()}catch(err){alert(err.message);await load()}return}if(del){if(prompt('Type DELETE TEST DATA to remove this record:')!=='DELETE TEST DATA')return;try{await api('/api/network/admin/directory/'+del.dataset.delete+'/test',{method:'DELETE',body:JSON.stringify({confirm:'DELETE TEST DATA'})});await load()}catch(err){alert(err.message)}}};
document.getElementById('editClose').onclick=()=>{document.getElementById('editOverlay').style.display='none'};document.getElementById('editSave').onclick=async function(){const overlay=document.getElementById('editOverlay'),id=overlay.dataset.id,b=this,m=document.getElementById('editMsg');b.disabled=true;b.textContent='Saving…';m.textContent='Saving business facts…';try{await api('/api/network/admin/directory/'+id+'/facts',{method:'PATCH',body:JSON.stringify({business_name:document.getElementById('eName').value,niche:document.getElementById('eNiche').value,market:document.getElementById('eMarket').value,language:document.getElementById('eLanguage').value,business_scope:document.getElementById('eScope').value,service_area:document.getElementById('eServiceArea').value,contact_email:document.getElementById('eContactEmail').value})});m.style.color='#86efac';m.textContent='✓ Saved';b.textContent='✓ Saved';await load();setTimeout(()=>{overlay.style.display='none';b.disabled=false;b.textContent='Save business facts'},800)}catch(e){m.style.color='#fca5a5';m.textContent='✕ '+e.message;b.disabled=false;b.textContent='Save business facts'}};document.getElementById('deleteAllTests').onclick=async()=>{if(prompt('Type DELETE ALL TEST DATA to remove all records marked as test:')!=='DELETE ALL TEST DATA')return;try{const d=await api('/api/network/admin/directory/test-data',{method:'DELETE',body:JSON.stringify({confirm:'DELETE ALL TEST DATA'})});alert('Deleted '+d.deleted+' test record(s).');await load()}catch(e){alert(e.message)}};if(!key)location.href='/admin?next='+encodeURIComponent('/network/directory/admin');else load().catch(e=>{document.getElementById('rows').innerHTML='<p class="muted" style="color:#fca5a5">'+esc(e.message||e)+'</p>'})})();</script></body></html>`);
  });

  app.get('/network/directory/:slug', wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    const slug=cleanText(req.params.slug,190);if(slug==='admin')return res.status(404).send('Not found');
    const qr=await pool.query('SELECT * FROM network_directory_businesses WHERE slug=$1 LIMIT 1',[slug]);const x=qr.rows[0];
    if(!x)return res.status(404).type('html').send('<h1>Business not found</h1>');
    const e=escapeHtmlAttr,verified=x.status==='verified',niche=[x.primary_niche,x.sub_niche].filter(Boolean).join(' → ')||'Not classified yet';
    const joinUrl='/network?brand='+encodeURIComponent(x.business_name)+'&domain='+encodeURIComponent(x.domain||'')+'&niche='+encodeURIComponent(x.sub_niche||x.primary_niche||'')+'&market='+encodeURIComponent(x.market||x.country||'')+'&language='+encodeURIComponent(x.language||'')+'#join';
    res.set('Cache-Control','no-store');res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(x.business_name)} · ContentScale Business Directory</title><meta name="description" content="${e(x.business_name)} business profile on ContentScale Network. Be verified, be mentioned and create more opportunities to be discovered."><meta property="og:type" content="website"><meta property="og:title" content="${e(x.business_name)} · ContentScale Network"><meta property="og:description" content="Be verified. Be mentioned. Be discovered."><meta property="og:image" content="https://app.contentscale.site/network/assets/verified-business-og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="https://app.contentscale.site/network/assets/verified-business-og.png"><style>body{margin:0;background:#07111f;color:#eef4ff;font-family:Inter,system-ui}.wrap{max-width:920px;margin:auto;padding:30px 18px 70px}a{color:#8dd9ff}.card{background:#0e1b30;border:1px solid #29466e;border-radius:20px;padding:24px;margin:15px 0}.pill{display:inline-block;border:1px solid #35507a;border-radius:999px;padding:6px 10px;font-size:12px}.verified{border-color:#22c55e;color:#86efac}.muted{color:#9fb1cb;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.metric{background:#09182a;border:1px solid #263f65;border-radius:12px;padding:14px}.btn{display:inline-block;background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:10px;padding:11px 15px;font-weight:800;text-decoration:none;cursor:pointer}.btn.good{background:#166534;border-color:#22c55e}.field label{display:block;font-size:12px;color:#9fb1cb;margin:9px 0 5px}.field input,.field textarea{width:100%;box-sizing:border-box;background:#081529;color:#fff;border:1px solid #35547b;border-radius:9px;padding:11px}.actions{display:flex;gap:9px;flex-wrap:wrap}.valuegrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.value{background:#09182a;border:1px solid #31527f;border-radius:14px;padding:16px}.value h3{margin:0 0 7px}.brandline{display:flex;align-items:center;gap:12px}.csnet{width:58px;height:58px;position:relative;flex:0 0 58px}.csnet i{position:absolute;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#38bdf8)}.csnet i:nth-child(1){width:25px;height:25px;left:3px;top:17px}.csnet i:nth-child(2){width:13px;height:13px;left:31px;top:4px}.csnet i:nth-child(3){width:12px;height:12px;left:40px;top:29px}.csnet i:nth-child(4){width:9px;height:9px;left:22px;top:45px}.csnet:before,.csnet:after{content:'';position:absolute;height:2px;background:#38bdf8;transform-origin:left center;opacity:.75}.csnet:before{width:29px;left:21px;top:19px;transform:rotate(-25deg)}.csnet:after{width:30px;left:22px;top:31px;transform:rotate(11deg)}@media(max-width:650px){.grid,.valuegrid{grid-template-columns:1fr}}
button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button.done:disabled::after{display:none!important}button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><div class="wrap"><p><a href="/network/directory">← Business Directory</a></p><div class="card"><div class="brandline"><span class="csnet" aria-hidden="true"><i></i><i></i><i></i><i></i></span><div><div class="pill ${verified?'verified':''}">${e(directoryStatusCopy(x.status))}</div><h1 style="margin:7px 0">${e(x.business_name)}</h1></div></div><p class="muted">${e(x.description||'Business profile in the ContentScale directory.')}</p><div class="grid"><div class="metric"><strong>Website</strong><div>${x.domain?`<a target="_blank" rel="noopener" href="${e(x.canonical_url||('https://'+x.domain))}">${e(x.domain)}</a>`:'—'}</div></div><div class="metric"><strong>Classification</strong><div>${e(niche)}</div></div><div class="metric"><strong>Country / market</strong><div>${e(directoryCountryName(x.market||x.country))}${(x.market||x.country)?` <span class="muted">(${e(String(x.market||x.country).toUpperCase())})</span>`:''} </div></div><div class="metric"><strong>Language</strong><div>${e(directoryLanguageName(x.language))}${x.language?` <span class="muted">(${e(x.language)})</span>`:''} </div></div><div class="metric"><strong>Business reach</strong><div>${e((safeJsonObject(x.metadata).business_scope||'Not specified').replace(/^./,c=>c.toUpperCase()))}</div></div><div class="metric"><strong>Service area</strong><div>${e(safeJsonObject(x.metadata).service_area||'Not specified')}</div></div></div></div>${verified?`<div class="card"><h2>Why verification matters</h2><div class="valuegrid"><div class="value"><h3>Be verified.</h3><div class="muted">Establish a trusted public business profile.</div></div><div class="value"><h3>Be mentioned.</h3><div class="muted">Create relevant third-party references beyond your own domain.</div></div><div class="value"><h3>Be discovered.</h3><div class="muted">Create more opportunities for customers, search engines and AI systems to encounter your business.</div></div></div><p class="muted" style="margin-top:14px">ContentScale checked this business profile and website according to the information available at review time. Verification does not guarantee rankings, AI citations or every business claim.</p><div class="actions"><a class="btn good" href="/network/directory/${e(x.slug)}/share.svg" target="_blank">Open verification graphic</a><button class="btn" id="copyProfile">Copy profile link</button><button class="btn secondary" id="shareLinkedIn">Share on LinkedIn</button><button class="btn secondary" id="shareFacebook">Share on Facebook</button></div></div><div class="card"><div class="pill verified">STEP 2</div><h2>Publish one. Get one published.</h2><p class="muted">Join the ContentScale publishing network and start with a simple 1-for-1 exchange: publish one relevant article from another verified member and get one original article prepared for placement for your business. After that, continue through the marketplace.</p><a class="btn" href="${e(joinUrl)}">Join the Publishing Network →</a></div>`:`<div class="card"><h2>Are you the owner?</h2>${x.status==='claim_pending'?`<div style="border:1px solid #f59e0b;background:#2a1d08;border-radius:12px;padding:11px 13px;margin-bottom:12px"><b style="color:#fde68a">Claim already submitted</b><div class="muted">ContentScale is reviewing this business. Personal claimant details are hidden on the public profile.</div></div>`:''}<p class="muted">Verify or correct this business information. ContentScale reviews the website before the profile can become Verified.</p><form id="claimForm"><div class="grid"><div class="field"><label>Your name</label><input name="claim_name"></div><div class="field"><label>Email *</label><input name="claim_email" type="email" required></div><div class="field"><label>Business reach</label><select name="business_scope" style="width:100%;box-sizing:border-box;background:#081529;color:#fff;border:1px solid #35547b;border-radius:9px;padding:11px"><option value="">Select reach</option><option value="local"${safeJsonObject(x.metadata).business_scope==='local'?' selected':''}>Local business</option><option value="regional"${safeJsonObject(x.metadata).business_scope==='regional'?' selected':''}>Regional business</option><option value="national"${safeJsonObject(x.metadata).business_scope==='national'?' selected':''}>National business</option><option value="online"${safeJsonObject(x.metadata).business_scope==='online'?' selected':''}>Online / global</option></select></div><div class="field"><label>Service area</label><input name="service_area" value="${e(safeJsonObject(x.metadata).service_area||'')}" placeholder="e.g. New Jersey (NJ)"></div></div><div class="field"><label>Corrections / message</label><textarea name="claim_message" rows="4"></textarea></div><button class="btn" id="claimBtn">Claim & verify this business</button><div id="claimMsg" class="muted" style="margin-top:8px"></div></form></div>`}<div class="card"><h2>What happens next?</h2><p class="muted"><strong>1. Verify your business.</strong> Build a public profile that can be shared and discovered. <strong>2. Join the publishing network.</strong> Choose to exchange relevant third-party content and mentions. Verification alone never enrolls a business automatically.</p></div></div><script>const copy=document.getElementById('copyProfile');if(copy)copy.onclick=async()=>{await navigator.clipboard.writeText(location.href);copy.textContent='✓ Copied'};const li=document.getElementById('shareLinkedIn');if(li)li.onclick=()=>window.open('https://www.linkedin.com/sharing/share-offsite/?url='+encodeURIComponent(location.href),'_blank','noopener');const fb=document.getElementById('shareFacebook');if(fb)fb.onclick=()=>window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(location.href),'_blank','noopener');const f=document.getElementById('claimForm');if(f)f.onsubmit=async ev=>{ev.preventDefault();const b=document.getElementById('claimBtn'),m=document.getElementById('claimMsg');b.disabled=true;b.textContent='Submitting…';try{const body=Object.fromEntries(new FormData(f).entries()),r=await fetch('/api/network/directory/${e(x.slug)}/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not submit');m.style.color='#86efac';const mail=d.notification&&d.notification.claimant&&d.notification.claimant.state;b.classList.add('done');b.textContent='✓ Submitted';m.innerHTML='✓ Claim submitted. '+(mail==='sent'?'Confirmation email sent. ':mail==='not_configured'?'Claim saved; email confirmation is not configured yet. ':mail==='failed'?'Claim saved, but the confirmation email failed to send. ':'ContentScale will review the website and your information. ')+(d.dashboard_url?'<a href="'+d.dashboard_url+'" style="color:#8dd9ff;font-weight:800">Open your guided business dashboard →</a>':'')}catch(err){m.style.color='#fca5a5';m.textContent='✕ '+err.message;b.classList.remove('done');b.disabled=false;b.textContent='Claim & verify this business'}};</script></body></html>`);
  }));

  app.get('/network/directory', wrap(async (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ContentScale Business Directory</title><style>body{margin:0;background:#07111f;color:#eef4ff;font-family:Inter,system-ui}.wrap{max-width:1150px;margin:auto;padding:30px 18px 70px}a{color:#8dd9ff}.hero,.card{background:#0e1b30;border:1px solid #29466e;border-radius:20px;padding:22px;margin:15px 0}.muted{color:#9fb1cb;line-height:1.6}.search{display:flex;gap:9px;flex-wrap:wrap}.search input{flex:1;min-width:240px;background:#081529;color:#fff;border:1px solid #35547b;border-radius:10px;padding:12px}.btn{background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:10px;padding:11px 15px;font-weight:800;text-decoration:none;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.biz{background:#09182a;border:1px solid #263f65;border-radius:15px;padding:16px}.pill{display:inline-block;border:1px solid #35507a;border-radius:999px;padding:4px 8px;font-size:11px}.verified{border-color:#22c55e;color:#86efac}.field label{display:block;font-size:12px;color:#9fb1cb;margin:8px 0 5px}.field input,.field textarea{width:100%;box-sizing:border-box;background:#081529;color:#fff;border:1px solid #35547b;border-radius:9px;padding:10px}.formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}@media(max-width:650px){.formgrid{grid-template-columns:1fr}}
button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><div class="wrap"><p><a href="/network">← ContentScale Network</a></p><div class="hero"><div class="pill">STEP 1</div><h1>Verify your business</h1><p class="muted">Find your business, claim the profile, correct the information and submit it for review. Verified businesses get a public profile they can share, plus a clear path into third-party content and visibility. Imported profiles stay Unclaimed until actually reviewed.</p><div class="search"><input id="q" placeholder="Search business, website, niche or market"><button class="btn" id="searchBtn">Search directory</button></div></div><div id="results" class="grid"></div><div class="card"><h2>Can't find your business?</h2><p class="muted">Submit it here. ContentScale will classify the niche automatically and place it in the verification queue.</p><form id="requestForm"><div class="formgrid"><div class="field"><label>Business name *</label><input name="business_name" required></div><div class="field"><label>Website/domain</label><input name="domain" placeholder="example.com"></div><div class="field"><label>Your name</label><input name="claim_name"></div><div class="field"><label>Email *</label><input name="claim_email" type="email" required></div><div class="field"><label>What does the business mainly do?</label><input name="niche" placeholder="SEO, roofing, accounting…"></div><div class="field"><label>Market / country</label><input name="market"></div><div class="field"><label>Language / locale</label><input name="language" placeholder="en-US, nl-NL…"></div></div><div class="field"><label>Short description / corrections</label><textarea name="description" rows="3"></textarea></div><button class="btn" id="requestBtn">Submit for verification</button><div id="requestMsg" class="muted" style="margin-top:8px"></div></form></div></div><script>(function(){const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c));async function load(){const q=document.getElementById('q').value.trim(),r=await fetch('/api/network/directory'+(q?'?q='+encodeURIComponent(q):'')),d=await r.json();document.getElementById('results').innerHTML=(d.businesses||[]).map(x=>'<a class="biz" style="text-decoration:none;color:inherit" href="/network/directory/'+encodeURIComponent(x.slug)+'"><span class="pill '+(x.status==='verified'?'verified':'')+'">'+esc(x.status==='verified'?'Verified ✓':'Unclaimed')+'</span><h3>'+esc(x.business_name)+'</h3><div class="muted">'+esc(x.domain||'No website yet')+'<br>'+esc([x.primary_niche,x.sub_niche].filter(Boolean).join(' → ')||'Not classified')+'<br>'+esc(x.market||x.country||'')+'</div></a>').join('')||'<div class="card"><p class="muted">No matching businesses yet. Submit it below.</p></div>'}document.getElementById('searchBtn').onclick=load;document.getElementById('q').onkeydown=e=>{if(e.key==='Enter')load()};load();document.getElementById('requestForm').onsubmit=async e=>{e.preventDefault();const b=document.getElementById('requestBtn'),m=document.getElementById('requestMsg');b.disabled=true;b.textContent='Submitting…';try{const body=Object.fromEntries(new FormData(e.target).entries()),r=await fetch('/api/network/directory/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not submit');m.style.color='#86efac';m.innerHTML='✓ Verification request received. '+(d.dashboard_url?'<a href="'+esc(d.dashboard_url)+'">Open your guided business dashboard →</a>':'<a href="/network/directory/'+encodeURIComponent(d.profile.slug)+'">Open profile →</a>');b.textContent='✓ Submitted';load()}catch(err){m.style.color='#fca5a5';m.textContent=err.message;b.disabled=false;b.textContent='Submit for verification'}}})();</script></body></html>`);
  }));

  app.get('/network', wrap(async (req, res) => {
    if (!envEnabled()) return res.status(404).send('Network is not enabled.');
    let ads=[];
    try {
      const ar=await pool.query(`SELECT id,company_name,headline,description,target_url,logo_url,niche,locale,placement
        FROM network_ads
        WHERE status='active'
          AND (starts_at IS NULL OR starts_at<=NOW())
          AND (ends_at IS NULL OR ends_at>=NOW())
          AND placement IN ('homepage','homepage_featured')
        ORDER BY CASE WHEN placement='homepage_featured' THEN 0 ELSE 1 END,created_at DESC
        LIMIT 8`);
      ads=ar.rows;
      if(ads.length) await pool.query(`UPDATE network_ads SET impressions=impressions+1,updated_at=NOW() WHERE id = ANY($1::bigint[])`,[ads.map(x=>Number(x.id))]);
    } catch (_) { ads=[]; }
    const e=escapeHtmlAttr;
    const adCards=ads.map(a=>`<article class="sponsor-card"><div class="sponsor-label">Sponsored</div>${a.logo_url?`<img class="sponsor-logo" src="${e(a.logo_url)}" alt="${e(a.company_name)} logo" loading="lazy">`:''}<h3>${e(a.headline||a.company_name)}</h3><p>${e(a.description||'')}</p>${a.niche?`<div class="sponsor-niche">${e(a.niche)}</div>`:''}<a class="text-link" rel="sponsored noopener" href="/network/ad/${Number(a.id)}/click">Visit ${e(a.company_name)} →</a></article>`).join('');
    res.set('Cache-Control','public, max-age=120');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ContentScale Network — Get Backlinks. Get Cited. Get Discovered.</title><meta name="description" content="Join the ContentScale Network to earn real third-party placements, backlinks and brand mentions through relevant publishers."><meta name="robots" content="index,follow"><link rel="canonical" href="https://app.contentscale.site/network"><meta property="og:title" content="ContentScale Network — Get Backlinks. Get Cited."><meta property="og:description" content="Real publisher placements, backlinks, brand mentions and verified distribution."><style>
    :root{--bg:#07111f;--panel:#0e1b30;--panel2:#11233d;--line:#263f65;--text:#f3f7ff;--muted:#a8b7cf;--brand:#7c3aed;--brand2:#38bdf8;--good:#86efac;--max:1180px}*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:linear-gradient(180deg,#06101d,#0a1324 55%,#07111f);color:var(--text)}a{color:inherit}.wrap{max-width:var(--max);margin:auto;padding:0 22px}.nav{display:flex;align-items:center;justify-content:space-between;padding:18px 0}.brand{display:flex;align-items:center;gap:11px;font-weight:900;text-decoration:none}.logo{width:42px;height:42px}.navlinks{display:flex;gap:18px;align-items:center}.navlinks a{font-size:14px;color:#d8e4f6;text-decoration:none}.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:10px;padding:12px 17px;font-weight:800;text-decoration:none;border:1px solid #6d4bd1;background:var(--brand);color:#fff}.btn.secondary{background:#10213b;border-color:#355680}.hero{padding:74px 0 46px;text-align:center}.eyebrow{display:inline-block;border:1px solid #365376;background:#0d1b30;border-radius:999px;padding:7px 11px;font-size:12px;color:#b9c9df}.hero h1{font-size:clamp(40px,7vw,76px);line-height:1.02;max-width:980px;margin:20px auto 18px;letter-spacing:-.035em}.gradient{background:linear-gradient(90deg,#a78bfa,#38bdf8);-webkit-background-clip:text;color:transparent}.hero p{max-width:790px;margin:0 auto;color:var(--muted);font-size:19px;line-height:1.65}.hero-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:28px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:38px auto 0;max-width:940px;align-items:stretch}.metric{border:1px solid var(--line);background:#0b182b;border-radius:14px;padding:15px 14px;min-height:92px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.metric strong{display:block;font-size:23px;line-height:1.15}.metric span{font-size:12px;color:var(--muted);line-height:1.35;margin-top:5px;max-width:190px}section{padding:48px 0}.section-title{font-size:32px;margin:0 0 10px}.section-copy{color:var(--muted);max-width:760px;line-height:1.65}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:22px}.card,.sponsor-card{background:var(--panel);border:1px solid var(--line);border-radius:17px;padding:22px}.card h3,.sponsor-card h3{margin:0 0 9px}.card p,.sponsor-card p{color:var(--muted);line-height:1.55}.step{font-size:12px;color:#93c5fd;font-weight:900;letter-spacing:.08em}.sponsored{background:#09182a;border-block:1px solid #17304f}.sponsor-label{display:inline-block;font-size:10px;text-transform:uppercase;letter-spacing:.1em;border:1px solid #52657b;color:#c9d5e4;padding:4px 7px;border-radius:5px;margin-bottom:12px}.sponsor-logo{max-width:120px;max-height:44px;object-fit:contain;display:block;margin-bottom:12px;background:white;border-radius:7px;padding:4px}.sponsor-niche{font-size:12px;color:#9fb1cb;margin:10px 0}.text-link{color:#8dd9ff;text-decoration:none;font-weight:800}.forms{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}.form{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px}label{display:block;font-size:12px;color:#aebed5;margin:11px 0 6px}input,textarea{width:100%;background:#081529;color:#fff;border:1px solid #35547b;border-radius:9px;padding:11px;font:inherit}.form button{margin-top:14px}.status{font-size:13px;margin-top:10px;color:#9fb1cb}.niche-help{font-size:12px;color:#93a4c5;line-height:1.5;margin-top:5px}.niche-preview{display:none;margin-top:9px;border:1px solid #31527f;background:#09182b;border-radius:10px;padding:10px}.niche-preview.show{display:block}.niche-path{font-weight:900;color:#bfdbfe}.niche-topics{font-size:11px;color:#9fb1cb;margin-top:5px}.small{font-size:12px;color:#8294ae}.footer{padding:38px 0;border-top:1px solid #19304f;color:#8ea0b9}.mobile-only{display:none}@media(max-width:820px){.cards{grid-template-columns:1fr}.metrics{grid-template-columns:1fr 1fr}.forms{grid-template-columns:1fr}.navlinks a:not(.btn){display:none}.hero{padding-top:48px}.hero p{font-size:17px}}@media(max-width:480px){.metrics{grid-template-columns:1fr}.hero-actions .btn{width:100%}}
    
button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><div class="wrap"><nav class="nav"><a class="brand" href="/network"><svg class="logo" viewBox="0 0 64 64" aria-label="ContentScale Network logo"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#8b5cf6"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="#111d33" stroke="#38547a"/><circle cx="20" cy="22" r="6" fill="url(#g)"/><circle cx="44" cy="20" r="5" fill="url(#g)"/><circle cx="42" cy="44" r="7" fill="url(#g)"/><circle cx="19" cy="45" r="4" fill="url(#g)"/><path d="M25 22l14-2M23 27l15 13M23 43l12 1M44 25l-1 12" stroke="#b9d9ff" stroke-width="3" stroke-linecap="round"/></svg><span>ContentScale <span style="color:#8dd9ff">Network</span></span></a><div class="navlinks"><a href="/network/directory">Verify a Business</a><a href="#join">Publishing Network</a><a href="#sponsored">Sponsored</a><a class="btn secondary" href="/network/admin">Admin</a></div></nav></div><main><section class="hero"><div class="wrap"><span class="eyebrow">Publisher distribution for the AI-search era</span><h1>Get Backlinks. <span class="gradient">Get Cited.</span> Get Discovered.</h1><p>Publish original, relevant content on real third-party websites. Build backlinks, brand mentions and external evidence — then verify every placement inside ContentScale.</p><div class="hero-actions"><a class="btn" href="/network/directory">1 · Verify your business</a><a class="btn secondary" href="#join">2 · Join the publishing network</a><a class="btn secondary" href="#advertise">Advertise</a></div><div class="metrics"><div class="metric"><strong>Real sites</strong><span>Checked + approved publisher websites</span></div><div class="metric"><strong>Unique content</strong><span>Publisher-specific editions</span></div><div class="metric"><strong>Verified</strong><span>Live URL and SEO checks</span></div><div class="metric"><strong>Trackable</strong><span>Placements, referrals and results</span></div></div></div></section><section id="paths"><div class="wrap"><h2 class="section-title">Two clear steps</h2><p class="section-copy">Business verification and publishing are separate. A business can be verified without becoming a publisher.</p><div class="cards"><article class="card"><div class="step">STEP 1</div><h3>Verify your business</h3><p>Find or claim your directory profile, correct the information and submit it for review. Verified businesses receive a public profile and share graphic.</p><a class="text-link" href="/network/directory">Find or verify my business →</a></article><article class="card"><div class="step">STEP 2</div><h3>Join the publishing network</h3><p>After verification, opt in to publishing. Start with one give / one receive exchange, then continue through the marketplace and credits.</p><a class="text-link" href="#join">Join the publishing network →</a></article><article class="card"><div class="step">OPTIONAL</div><h3>Sponsored visibility</h3><p>Advertising is separate from business verification and organic publisher matching. Sponsored placements are clearly labeled.</p><a class="text-link" href="#advertise">Request advertising →</a></article></div></div></section><section id="how"><div class="wrap"><h2 class="section-title">Built for real publisher placements</h2><p class="section-copy">The Network is designed around relevant third-party publication, not mass link drops. Each placement can be matched to niche, language and market, then verified after publication.</p><div class="cards"><article class="card"><div class="step">01 · MATCH</div><h3>Find relevant publishers</h3><p>Opportunities are matched to approved websites by niche, market and language.</p></article><article class="card"><div class="step">02 · PUBLISH</div><h3>Unique Publisher Edition</h3><p>Each publisher receives an original edition instead of a duplicate or lightly spun article.</p></article><article class="card"><div class="step">03 · VERIFY</div><h3>Backlink + citation evidence</h3><p>ContentScale verifies the live page, indexability, required links and placement evidence.</p></article></div></div></section>${ads.length?`<section id="sponsored" class="sponsored"><div class="wrap"><h2 class="section-title">Featured companies</h2><p class="section-copy">Paid homepage visibility. Sponsored placements are labeled and kept separate from organic publisher matching.</p><div class="cards">${adCards}</div></div></section>`:''}<section id="join"><div class="wrap"><div class="forms"><div class="form"><div class="step">STEP 2</div><h2 class="section-title">Join the publishing network</h2><p class="section-copy">Apply here only when you want to participate in publishing. After approval, the first onboarding goal is simple: one publication you give and one publication you receive before the wider marketplace.</p><form id="publisherForm"><label>Website / domain *</label><input name="domain" placeholder="example.com" required><label>Business / brand</label><input name="brand_name"><label>Your name</label><input name="contact_name"><label>Email *</label><input name="email" type="email" required><label>What does your website mainly cover?</label><input id="publisherNiche" name="niche" placeholder="For example: SEO, roofing, accounting, AI marketing…"><div id="publisherNichePreview" class="niche-preview"></div><label>Market / country</label><input id="publisherMarket" name="market" placeholder="United States, US, Nederland, NL…"><label>Language / locale</label><input id="publisherLanguage" name="language" placeholder="Dutch, Nederlands, English, en-US…"><div class="small" id="publisherLocaleHint">Write naturally. ContentScale converts recognized country/language names to a locale code; unknown languages are still accepted.</div><div class="niche-preview" id="publisherLocalePreview"></div><label>Message</label><textarea name="message" rows="3"></textarea><button class="btn" id="publisherButton">Submit publisher application</button><div class="status" id="publisherStatus"></div></form></div><div class="form" id="advertise"><h2 class="section-title">Advertise on the homepage</h2><p class="section-copy">Companies can request clearly labeled sponsored visibility on the ContentScale Network homepage. Every request is manually reviewed before it can go live.</p><form id="adForm"><label>Company *</label><input name="company_name" required><label>Contact name</label><input name="contact_name"><label>Contact email *</label><input name="contact_email" type="email" required><label>Headline *</label><input name="headline" placeholder="What should visitors see?" required><label>Website URL *</label><input name="target_url" type="url" placeholder="https://example.com" required><label>Logo URL</label><input name="logo_url" type="url" placeholder="https://example.com/logo.png"><label>Niche</label><input name="niche"><label>Short description</label><textarea name="description" rows="3"></textarea><button class="btn" id="adButton">Request sponsored placement</button><div class="status" id="adStatus"></div></form></div></div><p class="small" style="margin-top:16px">Sponsored visibility does not buy organic recommendations, Network verification results or editorial preference.</p></div></section></main><footer class="footer"><div class="wrap"><strong>ContentScale Network</strong> · Get Backlinks. Get Cited. Get Discovered.<br><span class="small">Publisher placements remain subject to approval and verification. Visibility or AI citation is never guaranteed.</span></div></footer><script>
    const nh=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));
    async function readJsonSafe(r){const t=await r.text();try{return t?JSON.parse(t):{}}catch(e){return{error:r.ok?'Unexpected server response':'Server error ('+r.status+'). Please try again or contact ContentScale.'}}}
    async function classifyPublisherNiche(){const input=document.getElementById('publisherNiche'),box=document.getElementById('publisherNichePreview');if(!input||!box)return;const v=input.value.trim();if(!v){box.className='niche-preview';box.innerHTML='';return}try{const r=await fetch('/api/network/niches/classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({niche:v})}),d=await readJsonSafe(r);if(!r.ok||!d.success)throw Error(d.error||'Could not classify');const c=d.classification||{};box.className='niche-preview show';box.innerHTML='<div class="small">ContentScale classification</div><div class="niche-path">'+nh(c.main_niche||'Other')+' → '+nh(c.sub_niche||v)+'</div>'+(c.topics&&c.topics.length?'<div class="niche-topics">Topics: '+c.topics.map(nh).join(' · ')+'</div>':'')+'<div class="niche-topics">Confidence: '+nh(c.confidence||'low')+(c.needs_confirmation?' · checked again during website approval':'')+'</div>'}catch(e){box.className='niche-preview show';box.innerHTML='<div class="niche-topics">We will classify this during review. You can still submit your application.</div>'}}
    let nicheTimer;const nicheInput=document.getElementById('publisherNiche');if(nicheInput){nicheInput.addEventListener('input',()=>{clearTimeout(nicheTimer);nicheTimer=setTimeout(classifyPublisherNiche,350)});nicheInput.addEventListener('blur',classifyPublisherNiche)}
    let localeTimer;async function previewPublisherLocale(){const lang=document.getElementById('publisherLanguage'),market=document.getElementById('publisherMarket'),box=document.getElementById('publisherLocalePreview');if(!lang||!market||!box)return;const lv=lang.value.trim(),mv=market.value.trim();if(!lv&&!mv){box.className='niche-preview';box.innerHTML='';return}try{const r=await fetch('/api/network/locale/normalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:lv,market:mv})}),d=await readJsonSafe(r);if(!r.ok||!d.success)throw Error(d.error||'Could not resolve locale');const x=d.resolved||{};box.className='niche-preview show';box.innerHTML='<div class="small">ContentScale will store</div><div class="niche-path">Market: '+nh(x.market||mv||'—')+' · Language: '+nh(x.language||lv||'—')+'</div>'}catch(e){box.className='niche-preview show';box.innerHTML='<div class="niche-topics">Your wording will still be accepted and reviewed manually.</div>'}}['publisherLanguage','publisherMarket'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('input',()=>{clearTimeout(localeTimer);localeTimer=setTimeout(previewPublisherLocale,350)})});
    const qp=new URLSearchParams(location.search);
    if(qp.get('brand'))document.querySelector('#publisherForm [name="brand_name"]').value=qp.get('brand');
    if(qp.get('domain'))document.querySelector('#publisherForm [name="domain"]').value=qp.get('domain');
    if(qp.get('niche')){document.getElementById('publisherNiche').value=qp.get('niche');classifyPublisherNiche()}
    if(qp.get('market'))document.getElementById('publisherMarket').value=qp.get('market');
    if(qp.get('language'))document.getElementById('publisherLanguage').value=qp.get('language');
    async function submitForm(form,statusEl,button,path,success){form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;const old=button.textContent;button.textContent='Sending…';statusEl.textContent='';try{const body=Object.fromEntries(new FormData(form).entries()),r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await readJsonSafe(r);if(!r.ok){const extra=d.error_id?' Error ID: '+d.error_id+(d.db_code?' · '+d.db_code:''):'';throw Error((d.error||('Request failed ('+r.status+')'))+extra)}statusEl.style.color='#86efac';const nc=d.niche_classification;statusEl.innerHTML='✓ '+success+(nc?'<br><span style="color:#bfdbfe">Classified: '+nh(nc.main_niche)+' → '+nh(nc.sub_niche)+'</span>':'')+(d.dashboard_url?' <br><a style="color:#8dd9ff;font-weight:800" href="'+d.dashboard_url+'">Open your private publisher dashboard →</a>':'');button.textContent='✓ Sent';form.reset();const np=document.getElementById('publisherNichePreview');if(np){np.className='niche-preview';np.innerHTML=''}}catch(err){statusEl.style.color='#fca5a5';statusEl.textContent='✕ '+err.message;button.disabled=false;button.textContent=old}})}
    submitForm(document.getElementById('publisherForm'),document.getElementById('publisherStatus'),document.getElementById('publisherButton'),'/api/network/publishers/apply','Publisher application received.');
    submitForm(document.getElementById('adForm'),document.getElementById('adStatus'),document.getElementById('adButton'),'/api/network/advertising/apply','Sponsored placement request received for review.');
    </script></body></html>`);
  }));


  app.post('/api/network/locale/normalize', wrap(async (req,res)=>{
    const resolved=normalizeNetworkLocaleInput(req.body?.language,req.body?.market||req.body?.country);
    res.json({success:true,input:{language:cleanText(req.body?.language,80)||null,market:cleanText(req.body?.market||req.body?.country,120)||null},resolved});
  }));

  app.post('/api/network/niches/classify', wrap(async (req,res)=>{
    if(!envEnabled())return res.status(409).json({success:false,error:'Network is disabled'});
    const classification=classifyNetworkNiche(req.body?.niche || req.body?.q || '');
    return res.json({success:true,classification});
  }));

  app.post('/api/network/publishers/apply', wrap(async (req,res)=>{
    if(!envEnabled()) return res.status(409).json({success:false,error:'Network is disabled'});

    let site;
    try{site=normalizeSite(req.body?.domain)}
    catch(err){return res.status(400).json({success:false,error:err.message||'Enter a valid public website/domain'})}

    const email=cleanText(req.body?.email,320).toLowerCase();
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      return res.status(400).json({success:false,error:'Enter a valid email address'});
    }

    // Self-heal Network publisher tables before using current fields.
    // This helper is module-level, so the registerNetwork pool must be passed explicitly.
    try{
      await ensurePublisherApplySchema(pool);
    }catch(e){
      const incident='PUB-SCHEMA-'+Date.now().toString(36).toUpperCase();
      console.error('[network publisher apply schema] incident='+incident,e);
      return res.status(500).json({
        success:false,
        error:'Publisher signup database preparation failed.',
        error_id:incident,
        db_code:cleanText(e && e.code || '',30)||undefined,
        constraint:cleanText(e && e.constraint || '',160)||undefined
      });
    }

    const brand=cleanText(req.body?.brand_name,200)||null;
    const contact=cleanText(req.body?.contact_name,180)||null;
    const niche=cleanText(req.body?.niche,240)||null;
    const nicheClass=classifyNetworkNiche(niche||'');
    const localeInput=normalizeNetworkLocaleInput(req.body?.language,req.body?.market||req.body?.country);
    const market=localeInput.market||cleanText(req.body?.market||req.body?.country,120)||null;
    const language=localeInput.language||cleanText(req.body?.language,80)||null;
    const message=cleanText(req.body?.message,2000)||null;
    const client=await pool.connect();

    try{
      await client.query('BEGIN');

      // A website/domain may have only ONE live publisher identity.
      // Same domain + same email can resume; same domain + different email is
      // blocked so we never expose or create a second publisher dashboard.
      const domainOwner=await client.query(`
        SELECT pa.id,pa.email,pa.status,a.id AS account_id,a.status AS account_status,
               a.website_id,w.status AS website_status
        FROM network_publisher_applications pa
        LEFT JOIN network_publisher_accounts a ON a.application_id=pa.id
        LEFT JOIN network_websites w ON w.id=a.website_id
        WHERE LOWER(pa.domain)=LOWER($1)
          AND pa.status IN ('pending','approved','activated')
        ORDER BY CASE pa.status WHEN 'activated' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,pa.id DESC
        LIMIT 1
        FOR UPDATE OF pa
      `,[site.domain]);
      if(domainOwner.rows[0] && String(domainOwner.rows[0].email||'').toLowerCase()!==email){
        await client.query('ROLLBACK');
        return res.status(409).json({
          success:false,
          error:'This website is already registered in the ContentScale Network under another publisher application. Do not create a second publisher account for the same domain. Ask the Network admin to review the existing publisher record.',
          code:'PUBLISHER_DOMAIN_ALREADY_REGISTERED'
        });
      }

      // Do not create endless duplicate pending applications for the same
      // domain/email. Resume the existing pending/approved application instead.
      const existing=await client.query(`
        SELECT pa.*,a.id AS account_id,a.access_token,a.status AS account_status
        FROM network_publisher_applications pa
        LEFT JOIN network_publisher_accounts a ON a.application_id=pa.id
        WHERE LOWER(pa.domain)=LOWER($1) AND LOWER(pa.email)=LOWER($2)
          AND pa.status IN ('pending','approved','activated')
        ORDER BY pa.id DESC
        LIMIT 1
        FOR UPDATE OF pa
      `,[site.domain,email]);

      let appRow, accountRow, token, resumed=false;

      if(existing.rows[0]){
        resumed=true;
        appRow=existing.rows[0];
        token=appRow.access_token || crypto.randomBytes(32).toString('hex');

        await client.query(`
          UPDATE network_publisher_applications
          SET brand_name=COALESCE($2,brand_name),
              contact_name=COALESCE($3,contact_name),
              niche=COALESCE($4,niche),
              niche_main=$5,
              niche_sub=$6,
              niche_topics=$7::jsonb,
              niche_confidence=$8,
              market=COALESCE($9,market),
              language=COALESCE($10,language),
              message=COALESCE($11,message),
              metadata=COALESCE(metadata,'{}'::jsonb) || $12::jsonb,
              updated_at=NOW()
          WHERE id=$1
        `,[appRow.id,brand,contact,niche,nicheClass.main_niche,nicheClass.sub_niche,JSON.stringify(nicheClass.topics),nicheClass.confidence,market,language,message,JSON.stringify({source:'network_landing',canonical_url:site.canonical_url,last_resubmitted_at:new Date().toISOString(),niche_classification:nicheClass,market,language})]);

        if(appRow.account_id){
          const ar=await client.query(`
            UPDATE network_publisher_accounts
            SET email=$2,contact_name=COALESCE($3,contact_name),
                access_token=COALESCE(NULLIF(access_token,''),$4),updated_at=NOW()
            WHERE id=$1
            RETURNING id,status,access_token
          `,[appRow.account_id,email,contact,token]);
          accountRow=ar.rows[0];
          token=accountRow.access_token;
        }else{
          const ar=await client.query(`
            INSERT INTO network_publisher_accounts
              (application_id,email,contact_name,access_token,status,created_at,updated_at)
            VALUES ($1,$2,$3,$4,'pending',NOW(),NOW())
            RETURNING id,status,access_token
          `,[appRow.id,email,contact,token]);
          accountRow=ar.rows[0];
        }

        const rr=await client.query(`SELECT * FROM network_publisher_applications WHERE id=$1`,[appRow.id]);
        appRow=rr.rows[0];
      }else{
        token=crypto.randomBytes(32).toString('hex');
        const r=await client.query(`
          INSERT INTO network_publisher_applications
            (domain,brand_name,contact_name,email,niche,niche_main,niche_sub,niche_topics,niche_confidence,market,language,message,metadata,created_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb,NOW(),NOW())
          RETURNING *
        `,[site.domain,brand,contact,email,niche,nicheClass.main_niche,nicheClass.sub_niche,JSON.stringify(nicheClass.topics),nicheClass.confidence,market,language,message,JSON.stringify({source:'network_landing',canonical_url:site.canonical_url,niche_classification:nicheClass,market,language})]);
        appRow=r.rows[0];

        const a=await client.query(`
          INSERT INTO network_publisher_accounts
            (application_id,email,contact_name,access_token,status,created_at,updated_at)
          VALUES ($1,$2,$3,$4,'pending',NOW(),NOW())
          RETURNING id,status,access_token
        `,[appRow.id,email,contact,token]);
        accountRow=a.rows[0];
      }

      await client.query('COMMIT');

      // Notification failure must never turn a successful application into HTTP 500.
      let ownerNotification={state:'not_attempted'};
      try{
        ownerNotification=await networkNotifyOwnerPublisherApplication(pool,appRow,{
          source:resumed?'Network landing · existing application resumed':'Network landing'
        });
      }catch(notifyErr){
        console.warn('[network publisher apply] owner notification failed:',notifyErr && notifyErr.message || notifyErr);
        ownerNotification={state:'failed',error:cleanText(notifyErr && notifyErr.message || notifyErr,500)};
      }

      return res.status(resumed?200:201).json({
        success:true,
        resumed,
        application_id:appRow.id,
        application_status:appRow.status,
        account:accountRow,
        dashboard_url:'/network/publisher/'+token,
        owner_notification:ownerNotification.state,
        niche_classification:nicheClass,
        note:resumed
          ? 'Your existing publisher application was found and your private dashboard link has been restored.'
          : 'Publisher application received. Keep this private dashboard link. Referral features appear automatically after the publisher website is approved.'
      });
    }catch(e){
      try{await client.query('ROLLBACK')}catch(_e){}
      console.error('[network publisher apply]',e);
      const code=String(e && e.code || '');
      if(code==='23505'){
        return res.status(409).json({success:false,error:'This publisher application already exists. Refresh the page and try again to restore the existing dashboard.'});
      }
      if(code==='23502' || code==='23514'){
        return res.status(400).json({success:false,error:'Publisher application data did not pass validation. Check the domain and email and try again.'});
      }
      const incident='PUB-'+Date.now().toString(36).toUpperCase();
      console.error('[network publisher apply] incident='+incident+' code='+(e&&e.code||'')+' constraint='+(e&&e.constraint||''));
      return res.status(500).json({
        success:false,
        error:'Could not save the publisher application.',
        error_id:incident,
        db_code:cleanText(e && e.code || '',30)||undefined,
        constraint:cleanText(e && e.constraint || '',160)||undefined,
        next:'Your application was not confirmed. Please retry once. If it fails again, send ContentScale the error ID shown here.'
      });
    }finally{
      client.release();
    }
  }));

  // Publisher applications become dashboard accounts first; referral links are created automatically only after website approval.
  app.post('/api/network/admin/publisher-applications/:id/review', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id)||0,status=cleanText(req.body?.status,30).toLowerCase();
    if(!id||!['approved','rejected'].includes(status))return res.status(400).json({success:false,error:'Choose approved or rejected'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const ar=await client.query('SELECT * FROM network_publisher_applications WHERE id=$1 FOR UPDATE',[id]);
      const appRow=ar.rows[0];if(!appRow){await client.query('ROLLBACK');return res.status(404).json({success:false,error:'Publisher application not found'})}
      if(status==='rejected'){
        await client.query("UPDATE network_publisher_applications SET status='rejected',updated_at=NOW() WHERE id=$1",[id]);
        await client.query("UPDATE network_publisher_accounts SET status='revoked',updated_at=NOW() WHERE application_id=$1",[id]);
        await client.query('COMMIT');return res.json({success:true,status:'rejected'});
      }
      const site=normalizeSite(appRow.domain);
      let wr=await client.query('SELECT * FROM network_websites WHERE LOWER(domain)=LOWER($1) LIMIT 1',[site.domain]);
      if(!wr.rows[0])wr=await client.query(`INSERT INTO network_websites (domain,canonical_url,brand_name,primary_niche,sub_niche,topic_tags,country,language,ownership_type,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,'external','pending',NOW(),NOW()) RETURNING *`,[site.domain,site.canonical_url,appRow.brand_name||site.domain,appRow.niche_main||appRow.niche||null,appRow.niche_sub||null,JSON.stringify(Array.isArray(appRow.niche_topics)?appRow.niche_topics:[]),appRow.market||null,appRow.language||null]);
      let website=wr.rows[0];
      if(website){
        const uw=await client.query(`UPDATE network_websites SET
          primary_niche=COALESCE(primary_niche,$2),
          sub_niche=COALESCE(sub_niche,$3),
          topic_tags=CASE WHEN COALESCE(jsonb_array_length(topic_tags),0)=0 THEN $4::jsonb ELSE topic_tags END,
          country=COALESCE(country,$5),
          language=COALESCE(language,$6),
          updated_at=NOW()
          WHERE id=$1 RETURNING *`,[website.id,appRow.niche_main||appRow.niche||null,appRow.niche_sub||null,JSON.stringify(Array.isArray(appRow.niche_topics)?appRow.niche_topics:[]),appRow.market||null,appRow.language||null]);
        website=uw.rows[0]||website;
      }

      // One publisher account per website/domain is an invariant.
      // If another application already owns this website, fail clearly instead
      // of hitting the UNIQUE(network_publisher_accounts.website_id) constraint.
      const ownerAcc=await client.query(`
        SELECT a.id,a.application_id,a.status,a.access_token,pa.email,pa.brand_name
        FROM network_publisher_accounts a
        LEFT JOIN network_publisher_applications pa ON pa.id=a.application_id
        WHERE a.website_id=$1 AND a.application_id IS DISTINCT FROM $2
        LIMIT 1
        FOR UPDATE OF a
      `,[website.id,id]);
      if(ownerAcc.rows[0]){
        await client.query('ROLLBACK');
        return res.status(409).json({
          success:false,
          error:'This website is already linked to another publisher account. A domain can only have one publisher account. Review or remove the existing publisher record before approving this application.',
          code:'PUBLISHER_WEBSITE_ALREADY_LINKED',
          existing_account_id:ownerAcc.rows[0].id,
          existing_application_id:ownerAcc.rows[0].application_id,
          existing_status:ownerAcc.rows[0].status
        });
      }

      let acc=await client.query('SELECT * FROM network_publisher_accounts WHERE application_id=$1 LIMIT 1',[id]);
      if(!acc.rows[0])acc=await client.query(`INSERT INTO network_publisher_accounts (application_id,website_id,email,contact_name,access_token,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'pending',NOW(),NOW()) RETURNING *`,[id,website.id,appRow.email,appRow.contact_name||null,crypto.randomBytes(32).toString('hex')]);
      else acc=await client.query(`UPDATE network_publisher_accounts SET website_id=$2,email=$3,contact_name=$4,status=CASE WHEN status='revoked' THEN 'pending' ELSE status END,updated_at=NOW() WHERE id=$1 RETURNING *`,[acc.rows[0].id,website.id,appRow.email,appRow.contact_name||null]);
      await client.query("UPDATE network_publisher_applications SET status='approved',updated_at=NOW() WHERE id=$1",[id]);
      await client.query('COMMIT');
      res.json({success:true,status:'approved',website_id:website.id,website_status:website.status,dashboard_url:'/network/publisher/'+acc.rows[0].access_token,note:website.status==='approved'||website.status==='trusted'?'Publisher dashboard is active.':'Website created/linked as pending. Approve it in Network Websites; the referral link will then appear automatically in the publisher dashboard.'});
    }catch(e){try{await client.query('ROLLBACK')}catch(_e){}throw e}finally{client.release()}
  }));


  // v516 — Unified guided role dashboards. Same contract everywhere:
  // blue = act now, green = complete, grey = waiting/not applicable; one active action at a time.
  app.get('/api/network/business/:token/dashboard', wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    const token=cleanText(req.params.token,128);
    if(!/^[a-f0-9]{64}$/i.test(token))return res.status(404).json({success:false,error:'Business dashboard not found'});
    const r=await pool.query(`SELECT * FROM network_directory_businesses WHERE metadata->>'claim_access_token'=$1 LIMIT 1`,[token]);
    const b=r.rows[0];if(!b)return res.status(404).json({success:false,error:'Business dashboard not found'});
    const profileUrl='/network/directory/'+encodeURIComponent(b.slug||'');
    let next={kind:'waiting',label:'Waiting for ContentScale verification',target:'review',href:null};
    if(b.status==='verified')next={kind:'action',label:'Open verified business profile',target:'profile',href:profileUrl};
    else if(b.status==='rejected')next={kind:'waiting',label:'Review completed · no action available',target:'review',href:null};
    res.set('Cache-Control','no-store');
    res.json({success:true,business:publicDirectoryBusiness(b),claim:{name:b.claim_name||null,email:b.claim_email||null,submitted_at:b.claim_submitted_at||null},website_check:b.website_check||{},next_action:next,profile_url:profileUrl});
  }));

  app.get('/network/business/:token',(req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    const token=cleanText(req.params.token,128);if(!/^[a-f0-9]{64}$/i.test(token))return res.status(404).send('Business dashboard not found.');
    res.set('Cache-Control','no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Business Dashboard · ContentScale Network</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#07101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:980px;margin:auto;padding:30px 18px 70px}a{color:#8dd9ff}.card{background:#0d172b;border:1px solid #2a3e63;border-radius:16px;padding:18px;margin:14px 0}.tiny{font-size:12px;color:#9fb1d6;line-height:1.5}.flow{display:grid;gap:10px}.step{border:1px solid #33476e;border-radius:13px;padding:14px;background:#0a1427}.step.done{border-color:#22c55e;background:#0d271c}.step.active{border-color:#3b82f6;background:#102752;box-shadow:0 0 0 1px rgba(59,130,246,.35)}.step.locked{opacity:.58}.btn{display:inline-flex;align-items:center;border:1px solid #3f65a4;border-radius:10px;padding:10px 13px;font-weight:900;text-decoration:none;background:#101b31;color:#dbeafe}.btn.next{background:#1d4ed8;border-color:#60a5fa;color:#fff;animation:pulse 1.7s ease-in-out infinite}.btn.done{background:#14532d;border-color:#22c55e;color:#dcfce7}.btn.locked{background:#172033;border-color:#334155;color:#94a3b8;pointer-events:none}@keyframes pulse{50%{box-shadow:0 0 0 6px rgba(59,130,246,.13)}}@media(prefers-reduced-motion:reduce){.btn.next{animation:none}}
</style></head><body><main><div class="tiny">CONTENTSCALE NETWORK · BUSINESS</div><h1>Business Dashboard</h1><div id="app"><div class="card">Loading your next action…</div></div></main><script>(function(){const token=${JSON.stringify(token)},esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));async function load(){const root=document.getElementById('app');try{const r=await fetch('/api/network/business/'+token+'/dashboard',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not load business dashboard');const b=d.business||{},verified=b.status==='verified',rejected=b.status==='rejected',active=d.next_action&&d.next_action.kind==='action';root.innerHTML='<div class="card"><h2>'+esc(b.business_name||'Business')+'</h2><div class="tiny">'+esc(b.domain||'')+' · '+esc(b.primary_niche||'')+' · status: '+esc(b.status||'')+'</div></div><div class="card" id="guided"><h2>Follow the blue action</h2><div class="tiny">Blue = do this now · Green = complete · Grey = waiting / not needed.</div><div class="flow" style="margin-top:12px"><div class="step done"><b>1 · Claim submitted ✓</b><div class="tiny">Your business verification request is saved.</div></div><div class="step '+(verified||rejected?'done':'locked')+'" id="review"><b>2 · ContentScale verification '+(verified?'✓':rejected?'completed':'pending')+'</b><div class="tiny">'+(verified?'Your business is verified.':rejected?'The review has finished.':'No action needed from you while ContentScale reviews the business.')+'</div></div><div class="step '+(active?'active':'locked')+'" id="profile"><b>3 · Verified profile</b><div class="tiny">'+(verified?'Open the verified public profile and check the published business facts.':'Available after verification.')+'</div><div style="margin-top:10px">'+(active?'<a class="btn next" id="nextAction" href="'+esc(d.next_action.href)+'">Open verified profile</a>':'<span class="btn locked">Waiting</span>')+'</div></div></div></div>'+(verified?'<div class="card"><h2>Optional next step</h2><p class="tiny">Publishing is optional. If you want to join as a publisher, use the public Network application with this same business website.</p><a class="btn" href="/network#join">Publisher options</a></div>':'');const n=document.getElementById('nextAction');if(n)setTimeout(()=>n.scrollIntoView({behavior:'smooth',block:'center'}),180)}catch(e){root.innerHTML='<div class="card">✕ '+esc(e.message)+'</div>'}}load()})();</script></body></html>`);
  });

  async function scoutDashboardData(token){
    await pool.query(`ALTER TABLE network_referral_partners ADD COLUMN IF NOT EXISTS access_token TEXT`).catch(()=>{});
    const pr=await pool.query(`SELECT * FROM network_referral_partners WHERE access_token=$1 LIMIT 1`,[token]);
    const p=pr.rows[0];if(!p)return null;
    const cr=await pool.query(`SELECT * FROM network_referral_codes WHERE partner_id=$1 ORDER BY id ASC LIMIT 1`,[p.id]);
    const code=cr.rows[0]||null;let referrals=[],stats={clicks:0,registered:0,activated:0,rewarded:0,reward_credits:0};
    if(code){const rr=await pool.query(`SELECT id,referred_member_ref,status,reward_credits,metadata,created_at,activated_at,rewarded_at FROM network_referrals WHERE referral_code_id=$1 ORDER BY created_at DESC LIMIT 100`,[code.id]);referrals=rr.rows;const sr=await pool.query(`SELECT COUNT(*) FILTER (WHERE status='clicked')::int AS clicks,COUNT(*) FILTER (WHERE status='registered')::int AS registered,COUNT(*) FILTER (WHERE status='activated')::int AS activated,COUNT(*) FILTER (WHERE status='rewarded')::int AS rewarded,COALESCE(SUM(reward_credits) FILTER (WHERE status='rewarded'),0)::int AS reward_credits FROM network_referrals WHERE referral_code_id=$1`,[code.id]);stats=sr.rows[0]||stats;}
    const pending=referrals.find(x=>x.status==='registered'),active=referrals.find(x=>x.status==='activated');
    let next={kind:'action',label:'Copy your referral link',target:'share'};
    if(p.status!=='active')next={kind:'waiting',label:'Scout account is '+p.status,target:'status'};
    else if(pending)next={kind:'waiting',label:'Referred publisher is waiting for ContentScale approval',target:'activity'};
    else if(active)next={kind:'waiting',label:'Publisher activated · waiting for reward decision',target:'activity'};
    return{partner:p,code,referrals,stats,share_url:code?('https://app.contentscale.site/network/join?ref='+code.code):null,next_action:next};
  }

  app.get('/api/network/scout/:token/dashboard',wrap(async(req,res)=>{const token=cleanText(req.params.token,128);if(!/^[a-f0-9]{64}$/i.test(token))return res.status(404).json({success:false,error:'Scout dashboard not found'});const d=await scoutDashboardData(token);if(!d)return res.status(404).json({success:false,error:'Scout dashboard not found'});res.set('Cache-Control','no-store');res.json({success:true,...d})}));
  app.get('/network/scout/:token',(req,res)=>{if(!envEnabled())return res.status(404).send('Network is not enabled.');const token=cleanText(req.params.token,128);if(!/^[a-f0-9]{64}$/i.test(token))return res.status(404).send('Scout dashboard not found.');res.set('Cache-Control','no-store');res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Scout Dashboard · ContentScale Network</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#07101f;color:#eef4ff;font-family:Inter,system-ui}main{max-width:980px;margin:auto;padding:30px 18px 70px}a{color:#8dd9ff}.card{background:#0d172b;border:1px solid #2a3e63;border-radius:16px;padding:18px;margin:14px 0}.tiny{font-size:12px;color:#9fb1d6;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px}.metric{background:#091426;border:1px solid #293d60;border-radius:12px;padding:13px}.metric strong{display:block;font-size:25px}.btn{display:inline-flex;align-items:center;border:1px solid #3f65a4;border-radius:10px;padding:10px 13px;font-weight:900;background:#101b31;color:#fff;text-decoration:none;cursor:pointer}.btn.next{background:#1d4ed8;border-color:#60a5fa;animation:pulse 1.7s ease-in-out infinite}.btn.done{background:#14532d;border-color:#22c55e}.btn.locked{background:#172033;border-color:#334155;color:#94a3b8}.step{border:1px solid #33476e;border-radius:13px;padding:14px;background:#0a1427;margin:9px 0}.step.active{border-color:#3b82f6;background:#102752}.step.done{border-color:#22c55e;background:#0d271c}.step.locked{opacity:.6}@keyframes pulse{50%{box-shadow:0 0 0 6px rgba(59,130,246,.13)}}@media(prefers-reduced-motion:reduce){.btn.next{animation:none}}</style></head><body><main><div class="tiny">CONTENTSCALE NETWORK · SCOUT</div><h1>Scout Dashboard</h1><div id="app"><div class="card">Loading your next action…</div></div></main><script>(function(){const token=${JSON.stringify(token)},esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));async function load(){const root=document.getElementById('app');try{const r=await fetch('/api/network/scout/'+token+'/dashboard',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not load scout dashboard');const a=d.next_action||{},canShare=a.kind==='action'&&!!d.share_url;root.innerHTML='<div class="card"><h2>'+esc(d.partner&&d.partner.name||'Scout')+'</h2><div class="tiny">Status: '+esc(d.partner&&d.partner.status||'')+'</div></div><div class="card" id="guided"><h2>Follow the blue action</h2><div class="tiny">Blue = do this now · Green = complete · Grey = waiting.</div><div class="step '+(canShare?'active':'done')+'" id="share"><b>1 · Share your referral link '+(!canShare?'✓':'')+'</b><div class="tiny">Introduce real website owners who may want to publish in the Network.</div>'+(d.share_url?'<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><input id="shareUrl" readonly value="'+esc(d.share_url)+'" style="flex:1;min-width:260px;background:#091329;color:#fff;border:1px solid #35507a;border-radius:9px;padding:10px"><button class="btn '+(canShare?'next':'done')+'" id="copyLink">'+(canShare?'Copy referral link':'✓ Referral link ready')+'</button></div>':'<span class="btn locked">Waiting for referral code</span>')+'</div><div class="step '+(a.kind==='waiting'?'locked':'locked')+'" id="activity"><b>2 · Publisher progress</b><div class="tiny">'+esc(a.kind==='waiting'?a.label:'After someone applies, their status appears here automatically.')+'</div></div></div><div class="card"><h2>Referral activity</h2><div class="grid"><div class="metric"><strong>'+Number(d.stats.clicks||0)+'</strong><span>Clicks</span></div><div class="metric"><strong>'+Number(d.stats.registered||0)+'</strong><span>Applications</span></div><div class="metric"><strong>'+Number(d.stats.activated||0)+'</strong><span>Activated</span></div><div class="metric"><strong>'+Number(d.stats.rewarded||0)+'</strong><span>Rewarded</span></div></div></div>';const b=document.getElementById('copyLink');if(b&&d.share_url)b.onclick=async function(){this.disabled=true;this.textContent='Copying…';try{await navigator.clipboard.writeText(d.share_url);this.className='btn done';this.textContent='✓ Copied';document.getElementById('activity').scrollIntoView({behavior:'smooth',block:'center'})}catch(e){this.disabled=false;this.textContent='Copy referral link'}};const n=document.querySelector('.btn.next');if(n)setTimeout(()=>n.scrollIntoView({behavior:'smooth',block:'center'}),180)}catch(e){root.innerHTML='<div class="card">✕ '+esc(e.message)+'</div>'}}load()})();</script></body></html>`)});

  async function publisherDashboardData(token){
    const ar=await pool.query(`SELECT a.*,pa.domain AS application_domain,pa.brand_name AS application_brand,pa.status AS application_status,w.domain,w.brand_name,w.status AS website_status,w.primary_niche,w.country,w.language
      FROM network_publisher_accounts a LEFT JOIN network_publisher_applications pa ON pa.id=a.application_id LEFT JOIN network_websites w ON w.id=a.website_id WHERE a.access_token=$1 LIMIT 1`,[token]);
    let a=ar.rows[0];if(!a)return null;
    if(a.status!=='revoked'&&a.status!=='suspended'&&a.website_id&&['approved','trusted'].includes(a.website_status)){
      if(a.status!=='active'){await pool.query("UPDATE network_publisher_accounts SET status='active',updated_at=NOW() WHERE id=$1",[a.id]);a.status='active'}
      if(a.application_id){
        await pool.query("UPDATE network_publisher_applications SET status='activated',updated_at=NOW() WHERE id=$1 AND status<>'rejected'",[a.application_id]).catch(()=>{});
        await pool.query("UPDATE network_referrals SET status='activated',activated_at=COALESCE(activated_at,NOW()),updated_at=NOW() WHERE status='registered' AND metadata->>'publisher_application_id'=$1",[String(a.application_id)]).catch(()=>{});
      }
      let cr=await pool.query('SELECT * FROM network_referral_codes WHERE website_id=$1 AND partner_id IS NULL ORDER BY id ASC LIMIT 1',[a.website_id]);
      if(!cr.rows[0])cr=await pool.query(`INSERT INTO network_referral_codes (website_id,code,label,is_active,created_at,updated_at) VALUES ($1,$2,$3,TRUE,NOW(),NOW()) RETURNING *`,[a.website_id,crypto.randomBytes(8).toString('hex'),'Publisher referral · '+(a.brand_name||a.domain||a.application_brand||a.application_domain)]);
      else if(!cr.rows[0].is_active)cr=await pool.query('UPDATE network_referral_codes SET is_active=TRUE,updated_at=NOW() WHERE id=$1 RETURNING *',[cr.rows[0].id]);
      a.referral=cr.rows[0];
    }else if(a.website_id){
      const cr=await pool.query('SELECT * FROM network_referral_codes WHERE website_id=$1 AND partner_id IS NULL ORDER BY id ASC LIMIT 1',[a.website_id]);
      if(cr.rows[0])a.referral=cr.rows[0];
    }
    let stats={clicks:0,applications:0,activated:0,rewarded:0,reward_credits:0};let referrals=[];
    if(a.referral){
      const sr=await pool.query(`SELECT COUNT(*) FILTER (WHERE status='clicked')::int AS clicks,COUNT(*) FILTER (WHERE status='registered')::int AS applications,COUNT(*) FILTER (WHERE status='activated')::int AS activated,COUNT(*) FILTER (WHERE status='rewarded')::int AS rewarded,COALESCE(SUM(reward_credits) FILTER (WHERE status='rewarded'),0)::int AS reward_credits FROM network_referrals WHERE referral_code_id=$1`,[a.referral.id]);
      stats=sr.rows[0]||stats;
      const rr=await pool.query(`SELECT id,referred_member_ref,status,reward_credits,created_at,activated_at,rewarded_at FROM network_referrals WHERE referral_code_id=$1 AND status<>'clicked' ORDER BY created_at DESC LIMIT 100`,[a.referral.id]);referrals=rr.rows;
    }
    let placements=[];
    if(a.website_id){const pr=await pool.query(`SELECT p.id,p.status,p.published_url,p.reward_credits,p.accepted_at,p.submitted_at,p.verified_at,p.verification_note,p.verification_decision,p.reviewed_at,c.title,pv.id AS publication_version_id,pv.title AS edition_title,pv.quality_status,pv.generated_at FROM network_placements p JOIN network_content c ON c.id=p.content_id LEFT JOIN network_publication_versions pv ON pv.placement_id=p.id WHERE p.publisher_website_id=$1 ORDER BY p.created_at DESC LIMIT 100`,[a.website_id]);placements=pr.rows}
    await pool.query('UPDATE network_publisher_accounts SET last_seen_at=NOW() WHERE id=$1',[a.id]).catch(()=>{});
    const actionablePlacement=placements.find(x=>x.publication_version_id&&x.status!=='verified'&&(!x.published_url||x.status==='needs_review'||x.verification_decision==='needs_changes'));
    let nextAction={kind:'waiting',label:'Waiting for ContentScale',target:'status',placement_id:null};
    if(a.application_status==='pending')nextAction={kind:'waiting',label:'Waiting for application approval',target:'status',placement_id:null};
    else if(!a.website_id||!['approved','trusted'].includes(a.website_status))nextAction={kind:'waiting',label:'Waiting for publisher website approval',target:'status',placement_id:null};
    else if(actionablePlacement)nextAction={kind:'action',label:actionablePlacement.status==='needs_review'?'Fix and resubmit publication':'Open publication package',target:'placement',placement_id:actionablePlacement.id};
    else if(placements.some(x=>['submitted','verifying','needs_review'].includes(x.status)))nextAction={kind:'waiting',label:'Waiting for ContentScale manual verification',target:'placements',placement_id:null};
    else if(placements.length===0)nextAction={kind:'waiting',label:'Publisher active · waiting for a matched placement',target:'placements',placement_id:null};
    return{account:a,stats,referrals,placements,next_action:nextAction,share_url:a.referral?('https://app.contentscale.site/network/join?ref='+a.referral.code):null};
  }


  async function publisherPlacementAccess(token,placementId){
    const ar=await pool.query(`SELECT a.id AS account_id,a.website_id,a.status AS account_status,w.domain,w.brand_name,w.status AS website_status
      FROM network_publisher_accounts a LEFT JOIN network_websites w ON w.id=a.website_id
      WHERE a.access_token=$1 LIMIT 1`,[token]);
    const a=ar.rows[0];if(!a||!a.website_id)return null;
    const pr=await pool.query(`SELECT p.id AS placement_id,p.status,p.published_url,p.source_link_required,p.brand_mention_required,p.publisher_website_id,
      c.brand_name,c.primary_niche,c.source_snapshot,c.title AS opportunity_title,c.prewrite_brief_id AS current_prewrite_brief_id,
      w.domain AS publisher_domain,w.brand_name AS publisher_brand,w.status AS publisher_status,
      ow.domain AS source_domain,ow.brand_name AS source_brand,pv.*
      FROM network_placements p
      JOIN network_content c ON c.id=p.content_id
      JOIN network_websites w ON w.id=p.publisher_website_id
      LEFT JOIN network_websites ow ON ow.id=c.owner_website_id
      LEFT JOIN network_publication_versions pv ON pv.placement_id=p.id
      WHERE p.id=$1 AND p.publisher_website_id=$2 LIMIT 1`,[placementId,a.website_id]);
    const p=pr.rows[0];if(!p)return null;
    return{account:a,placement:p};
  }

  async function _networkResolvePublisherReadinessV527(row,images){
    const snap=safeJsonObject(row.generation_input_snapshot),prewriteId=Number(row.current_prewrite_brief_id||snap.prewrite_brief_id||0);
    let brief=null;if(prewriteId){const br=await pool.query('SELECT id,keyword,working_title,brief_json FROM prewrite_briefs WHERE id=$1 LIMIT 1',[prewriteId]);brief=br.rows[0]||null;}
    const briefJson=safeJsonObject(brief&&brief.brief_json),ai=_networkAiEvidenceStateV500(briefJson),intState=_networkInternalDestinationStateV500(briefJson,row.publisher_domain);
    const currentHash=brief?crypto.createHash('sha256').update(JSON.stringify(brief.brief_json||{})).digest('hex'):'';
    const generationHash=cleanText(snap.prewrite_hash||'',128),generationCurrent=!!(brief&&generationHash&&generationHash===currentHash&&!snap.prewrite_requires_regeneration);
    const standard=publicationStandardChecks(row.html||''),metaTitleLen=String(row.meta_title||'').trim().length,metaDescLen=String(row.meta_description||'').trim().length,metaReady=metaTitleLen>0&&metaTitleLen<=60&&metaDescLen>=140&&metaDescLen<=160;
    standard.meta_policy_passed=metaReady;standard.meta_title_length=metaTitleLen;standard.meta_description_length=metaDescLen;
    const seed=_networkSeedKeywordChecksV515(row,images,brief&&brief.keyword||'');standard.seed_keyword_policy_passed=seed.passed;
    const saved=safeJsonObject(snap.link_intelligence),internalCandidates=Array.from(new Set(Array.isArray(saved.publisher_internal_candidates)?saved.publisher_internal_candidates:[])),externalCandidates=Array.isArray(saved.external_candidates)?saved.external_candidates:[];
    const linkPolicy=_networkPublicationLinkPolicyV522(row,{publisher_domain:row.publisher_domain,source_domain:row.source_domain,internal_candidates:internalCandidates,external_candidates:externalCandidates});
    const linkIntel=brief?linkIntelligenceFromSources(row,brief):{internal:[]};
    const fidelity=brief?checkApprovedBriefFidelity(row.html||'',briefJson,{publisher_domain:row.publisher_domain,internal_candidates:linkIntel.internal||[],required_internal_url:intState.selected_url||'',approved_contract:safeJsonObject(snap.approved_brief_contract)}):{passed:false,missing:['prewrite_brief'],groups:{},counts:{}};
    const token=cleanText(snap.internal_preview_token||'',180),base=String(process.env.APP_URL||'https://app.contentscale.site').replace(/\/$/,''),internalUrl=token?`${base}/network/internal-content/${encodeURIComponent(token)}`:null;
    const internalDoc=buildInternalPublicationDocument(row,images,internalUrl?{canonical_url:internalUrl}:{}),scan=safeJsonObject(snap.official_contentscore_scan),scanCurrent=!!(scan&&Number.isFinite(Number(scan.score))&&String(scan.content_hash||'')===String(internalDoc.hash));
    const vr=await pool.query(`SELECT run_no,http_status,indexable,canonical_ok,brand_mention_ok,source_link_ok,content_match_ok,password_protected,result_status,details,checked_at FROM network_verification_runs WHERE placement_id=$1 ORDER BY run_no DESC LIMIT 1`,[Number(row.placement_id||0)]).catch(()=>({rows:[]}));
    const latest=['submitted','verifying','needs_review','verified'].includes(String(row.status||''))?(vr.rows&&vr.rows[0]||null):null;
    const copiedCurrent=!!(snap.seo_publication_copied_hash&&String(snap.seo_publication_copied_hash)===String(internalDoc.hash));
    const readiness=_networkPublicationReadinessV527({placement_status:row.status,prewrite_linked:!!brief,ai_complete:ai.complete,internal_destination_ready:intState.complete,generation_current:generationCurrent,internal_candidate_count:linkPolicy.internal&&linkPolicy.internal.candidate_count,external_candidate_count:linkPolicy.external&&linkPolicy.external.candidate_count,internal_used_count:linkPolicy.internal&&linkPolicy.internal.count,external_used_count:linkPolicy.external&&linkPolicy.external.count,link_policy_ready:linkPolicy.passed,brief_fidelity_ready:fidelity.passed,publication_standard_ready:standard.passed,meta_policy_ready:metaReady,seed_keyword_ready:seed.passed,internal_preview_current:!!(internalUrl&&cleanText(snap.internal_preview_hash||'',128)&&String(snap.internal_preview_hash)===String(internalDoc.hash)),official_scan_current:scanCurrent,official_contentscore:scanCurrent?Number(scan.score||0):0,seo_copied_current:copiedCurrent,seo_copied_at:snap.seo_publication_copied_at||null,live_verification:latest});
    return{readiness,standard,seed,linkPolicy,fidelity,brief,internalDoc,internalUrl,scanCurrent,latest};
  }

  app.get('/api/network/publisher/:token/placements/:placementId/package', wrap(async (req,res)=>{
    const token=cleanText(req.params.token,128),id=Number(req.params.placementId);
    if(!/^[a-f0-9]{64}$/i.test(token)||!id)return res.status(404).json({success:false,error:'Publication package not found'});
    const access=await publisherPlacementAccess(token,id);if(!access)return res.status(404).json({success:false,error:'Publication package not found'});
    const row=access.placement;
    if(!row.id)return res.status(409).json({success:false,error:'Publisher Edition has not been generated yet'});
    const ir=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]);
    const images=ir.rows,quality=scorePublication(row,images),resolved=await _networkResolvePublisherReadinessV527(row,images),standard=resolved.standard,seedKeywordPolicy=resolved.seed,deliveryReady=!!resolved.readiness.final_ready;
    let seoHtml=null,schema=null;
    if(deliveryReady){seoHtml=buildSeoPublicationHtml(row,images);schema=renderEditionHtml(row,images).schema;}
    const hr=await pool.query(`SELECT id,event_type,actor_type,published_url,note,metadata,created_at FROM network_placement_review_events WHERE placement_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[id]);
    res.set('Cache-Control','no-store');
    res.json({
      success:true,
      review_history:hr.rows,
      placement:{id:row.placement_id,status:row.status,published_url:row.published_url||null,title:row.title||row.opportunity_title,publisher_domain:row.publisher_domain,source_domain:row.source_domain},
      publication:{title:row.title,meta_title:row.meta_title,meta_description:row.meta_description,suggested_slug:row.suggested_slug,quality_status:row.quality_status,generated_at:row.generated_at,schema_json:schema},
      quality,
      publication_standard:standard,
      seed_keyword_policy:seedKeywordPolicy,
      link_policy:resolved.linkPolicy,
      brief_fidelity:resolved.fidelity,
      readiness:resolved.readiness,
      delivery_ready:deliveryReady,
      seo_html:seoHtml,
      rule:'Publish the supplied SEO HTML as real page-source HTML on the approved publisher domain. JavaScript-only embeds do not qualify. After publishing, submit the exact live article URL for verification.'
    });
  }));

  app.post('/api/network/publisher/:token/placements/:placementId/mark-seo-copied', wrap(async (req,res)=>{
    const token=cleanText(req.params.token,128),id=Number(req.params.placementId);
    if(!/^[a-f0-9]{64}$/i.test(token)||!id)return res.status(404).json({success:false,error:'Publication package not found'});
    const access=await publisherPlacementAccess(token,id);if(!access)return res.status(404).json({success:false,error:'Publication package not found'});
    const row=access.placement;if(!row.id)return res.status(409).json({success:false,error:'Publisher Edition has not been generated yet'});
    const ir=await pool.query(`SELECT id,image_role,image_name,prompt,alt_text,caption,suggested_filename,placement_hint,mime_type,original_filename,byte_size,status,sort_order,created_at,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]);
    const resolved=await _networkResolvePublisherReadinessV527(row,ir.rows);if(!resolved.readiness.final_ready)return res.status(409).json({success:false,error:'Publication package is not Ready yet',readiness:resolved.readiness});
    const snap=safeJsonObject(row.generation_input_snapshot),now=new Date().toISOString();snap.seo_publication_copied_hash=resolved.internalDoc.hash;snap.seo_publication_copied_at=now;
    await pool.query(`UPDATE network_publication_versions SET generation_input_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify(snap)]);
    res.json({success:true,copied_hash:resolved.internalDoc.hash,copied_at:now,rule:'Publisher copy state is now persisted server-side and participates in the authoritative Publication Readiness Engine.'});
  }));

  app.post('/api/network/publisher/:token/placements/:placementId/submit-live', wrap(async (req,res)=>{
    const token=cleanText(req.params.token,128),id=Number(req.params.placementId);
    if(!/^[a-f0-9]{64}$/i.test(token)||!id)return res.status(404).json({success:false,error:'Placement not found'});
    const access=await publisherPlacementAccess(token,id);if(!access)return res.status(404).json({success:false,error:'Placement not found'});
    if(access.account.account_status!=='active')return res.status(409).json({success:false,error:'Publisher account must be active before submitting a live placement'});
    const raw=cleanText(req.body?.published_url,2048);if(!raw)return res.status(400).json({success:false,error:'Enter the exact live article URL'});
    let u;try{u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw Error()}catch(_){return res.status(400).json({success:false,error:'Enter a valid http/https live article URL'})}
    const liveHost=u.hostname.toLowerCase().replace(/^www\./,'');
    const pubHost=String(access.account.domain||'').toLowerCase().replace(/^www\./,'');
    if(!pubHost||!(liveHost===pubHost||liveHost.endsWith('.'+pubHost)))return res.status(409).json({success:false,error:'The live article URL must be on your approved publisher domain'});
    const row=access.placement;
    if(!row.id)return res.status(409).json({success:false,error:'Publisher Edition has not been generated yet'});
    const ir=await pool.query(`SELECT id,image_role,image_name,alt_text,caption,suggested_filename,placement_hint,mime_type,byte_size,status,sort_order,updated_at FROM network_publication_images WHERE publication_version_id=$1 ORDER BY sort_order,id`,[row.id]);
    const resolved=await _networkResolvePublisherReadinessV527(row,ir.rows);
    if(!resolved.readiness.final_ready||!resolved.readiness.seo_copied_current)return res.status(409).json({success:false,error:!resolved.readiness.final_ready?'Publication package is not Ready for live submission yet':'Copy the current SEO publication HTML before submitting the live URL',readiness:resolved.readiness,publication_standard:resolved.standard,seed_keyword_policy:resolved.seed,link_policy:resolved.linkPolicy});
    if(row.status==='verified')return res.status(409).json({success:false,error:'This placement is already verified and locked. Contact ContentScale if a new publication is required.'});
    const prior=await pool.query(`SELECT COUNT(*)::int AS n FROM network_placement_review_events WHERE placement_id=$1 AND event_type IN ('submitted','resubmitted')`,[id]);
    const eventType=Number(prior.rows[0]?.n||0)>0?'resubmitted':'submitted';
    await pool.query(`UPDATE network_placements SET published_url=$2,status='submitted',submitted_at=NOW(),verification_decision=NULL,verification_note=NULL,reviewed_by_admin_id=NULL,reviewed_at=NULL,updated_at=NOW() WHERE id=$1`,[id,u.toString()]);
    await pool.query(`INSERT INTO network_placement_review_events (placement_id,event_type,actor_type,actor_ref,published_url,note,metadata,created_at)
      VALUES ($1,$2,'publisher',$3,$4,NULL,$5::jsonb,NOW())`,[id,eventType,String(access.account.account_id||''),u.toString(),JSON.stringify({source:'publisher_dashboard'})]);
    res.json({success:true,status:'submitted',event:eventType,published_url:u.toString(),next:'A new manual review round has started. ContentScale will email you after the decision.'});
  }));

  app.get('/api/network/publisher/:token/dashboard', wrap(async (req,res)=>{
    const token=cleanText(req.params.token,128);if(!/^[a-f0-9]{64}$/i.test(token))return res.status(404).json({success:false,error:'Publisher dashboard not found'});
    const d=await publisherDashboardData(token);if(!d)return res.status(404).json({success:false,error:'Publisher dashboard not found'});
    res.set('Cache-Control','no-store');res.json({success:true,...d});
  }));

  app.get('/network/publisher/:token', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    const token=cleanText(req.params.token,128);if(!/^[a-f0-9]{64}$/i.test(token))return res.status(404).send('Publisher dashboard not found.');
    res.set('Cache-Control','no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Publisher Dashboard · ContentScale Network</title><style>body{font-family:Inter,system-ui;background:#08101f;color:#eef4ff;margin:0}main{max-width:1100px;margin:auto;padding:34px 20px}.top{display:flex;justify-content:space-between;gap:15px;align-items:center;flex-wrap:wrap}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin:16px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.metric{background:#091329;border:1px solid #26375c;border-radius:12px;padding:16px}.metric strong{font-size:24px;display:block}.note,.tiny{color:#9aabd0;line-height:1.55}.tiny{font-size:12px}.pill{display:inline-block;border:1px solid #35507a;border-radius:999px;padding:4px 9px;font-size:12px}.row{border-top:1px solid #26375c;padding:12px 0}.share{display:flex;gap:8px;flex-wrap:wrap}.share input{flex:1;min-width:260px;background:#091329;color:#fff;border:1px solid #35507a;border-radius:9px;padding:10px}.btn{background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:10px 13px;font-weight:800;cursor:pointer}.btn:disabled{opacity:.6}.guide{border-color:#7c3aed}.guidegrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:9px}.guideitem{background:#091329;border:1px solid #31527f;border-radius:12px;padding:12px}.guideitem.done{border-color:#22c55e;background:#0d271c}.guideitem.active{border-color:#3b82f6;background:#102752}.guideitem.locked{opacity:.58}.btn.next{background:#1d4ed8!important;border-color:#60a5fa!important;animation:guidedPulse 1.7s ease-in-out infinite}.btn.done{background:#14532d!important;border-color:#22c55e!important}.btn.locked{background:#172033!important;border-color:#334155!important;color:#94a3b8!important;pointer-events:none}@keyframes guidedPulse{50%{box-shadow:0 0 0 6px rgba(59,130,246,.13)}}.statusbox{border:1px solid #31527f;background:#0a1629;border-radius:12px;padding:11px 13px;margin:10px 0}.statusbox.wait{border-color:#f59e0b}.statusbox.ok{border-color:#22c55e}a{color:#8dd9ff}
button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><main><div class="top"><div><div class="tiny">CONTENTSCALE NETWORK</div><h1 style="margin:5px 0">Publisher Dashboard</h1></div><a href="/network">Public Network →</a></div><div id="app"><div class="card">Loading publisher dashboard…</div></div></main><script>(function(){const token=${JSON.stringify(token)},esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));async function load(){const root=document.getElementById('app');try{const r=await fetch('/api/network/publisher/'+token+'/dashboard',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not load dashboard');const a=d.account||{},active=a.status==='active',name=a.brand_name||a.application_brand||a.domain||a.application_domain||'Publisher',na=d.next_action||{};const nextCard='<div class="card guide" id="nextActionCard"><h2>Next action</h2><div class="tiny">Blue = do this now · Green = complete · Grey = waiting.</div><div style="margin-top:10px">'+(na.kind==='action'?'<a class="btn next" id="publisherNextAction" href="/network/publisher/'+token+'/placement/'+Number(na.placement_id||0)+'?guided=1">'+esc(na.label||'Open next action')+'</a>':'<span class="btn locked">'+esc(na.label||'Waiting')+'</span>')+'</div></div>';root.innerHTML=nextCard+'<div class="card guide"><h2>Your publishing-network steps</h2><div class="guidegrid"><div class="guideitem"><b>1 · Wait for approval</b><div class="tiny">ContentScale checks the application and then the publisher website.</div></div><div class="guideitem"><b>2 · Starter exchange</b><div class="tiny">Start with 1 give + 1 receive. Your request begins as only an H1/topic + short pitch.</div></div><div class="guideitem"><b>3 · Publish</b><div class="tiny">Open the Publisher Edition, publish the SEO HTML, then submit the exact live URL.</div></div><div class="guideitem"><b>4 · Manual review</b><div class="tiny">ContentScale reviews the live page. Fix and resubmit when changes are requested.</div></div><div class="guideitem"><b>5 · Marketplace</b><div class="tiny">After the starter exchange, continue through normal opportunities and credits.</div></div></div></div><div class="card"><h2>'+esc(name)+'</h2><div class="statusbox '+(a.application_status==='pending'?'wait':'')+'"><b>Publisher application</b><div class="tiny">'+(a.application_status==='pending'?'Waiting for ContentScale Admin approval.':a.application_status==='approved'?'Approved ✓':'Status: '+esc(a.application_status||'pending'))+'</div></div><div class="statusbox '+(!a.website_id?'wait':(active?'ok':'wait'))+'"><b>Website review</b><div class="tiny">'+(!a.website_id?'Not started yet. After the publisher application is approved, ContentScale links this same business website for review.':active?'Website approved ✓ · Publisher active.':'Website linked · waiting for website approval.')+'</div></div><p class="note">'+(active?'Your publisher onboarding is complete. The publisher account and Network Website are two stages of the same onboarding record.':'You do not need to create a second business or website. Continue with the same application; Admin takes over until website approval.')+'</p></div>'+(d.share_url?'<div class="card"><h2>My Referral Link</h2><p class="note">Share this with website owners who may want to become ContentScale Network publishers. The current referral reward is 10 credits only after a genuine publisher becomes active and the referral is marked rewarded. Clicks and empty signups earn 0 credits.</p><div class="share"><input id="shareUrl" readonly value="'+esc(d.share_url)+'"><button class="btn" id="copyBtn">Copy link</button></div></div>':'<div class="card"><h2>My Referral Link</h2><p class="note">Waiting for website approval. As soon as your publisher website becomes approved/trusted, ContentScale creates the referral link automatically and it will appear here.</p></div>')+'<div class="card"><h2>Referral activity</h2><div class="grid"><div class="metric"><strong>'+Number(d.stats.clicks||0)+'</strong><span>Clicks</span></div><div class="metric"><strong>'+Number(d.stats.applications||0)+'</strong><span>Applications</span></div><div class="metric"><strong>'+Number(d.stats.activated||0)+'</strong><span>Activated</span></div><div class="metric"><strong>'+Number(d.stats.rewarded||0)+'</strong><span>Rewarded</span></div><div class="metric"><strong>'+Number(d.stats.reward_credits||0)+'</strong><span>Referral credits · 10 per rewarded activation</span></div></div><div>'+((d.referrals||[]).map(x=>'<div class="row"><strong>'+esc(x.referred_member_ref||'Publisher')+'</strong> <span class="pill">'+esc(x.status)+'</span><div class="tiny">'+new Date(x.created_at).toLocaleString()+'</div></div>').join('')||'<p class="note">No referred publisher applications yet.</p>')+'</div></div><div class="card"><h2>My Network Placements</h2><p class="note">When a Publisher Edition is ready, open the package, copy the SEO HTML into your CMS, publish it as a normal indexable page, then submit the exact live URL.</p>'+((d.placements||[]).map(x=>'<div class="row"><strong>'+esc(x.edition_title||x.title||'Publication')+'</strong> <span class="pill">'+esc(x.status)+'</span><div class="tiny">'+(x.publication_version_id?'<a class="btn '+((na.kind==='action'&&Number(na.placement_id)===Number(x.id))?'next':(x.status==='verified'?'done':'locked'))+'" style="display:inline-block;margin:8px 8px 4px 0;text-decoration:none" href="/network/publisher/'+token+'/placement/'+x.id+'?guided=1">'+(x.status==='verified'?'✓ Verified':((na.kind==='action'&&Number(na.placement_id)===Number(x.id))?'Open next action':'Waiting'))+'</a>':'Publisher Edition not generated yet')+(x.published_url?'<br>Live: <a target="_blank" rel="noopener" href="'+esc(x.published_url)+'">'+esc(x.published_url)+'</a>':'<br>Not published yet')+
(x.verification_decision?'<br><span class="pill">Review: '+esc(String(x.verification_decision).replace(/_/g,' '))+'</span>':'')+
(x.verification_note?'<div class="tiny" style="margin-top:6px"><strong>Review note:</strong> '+esc(x.verification_note)+'</div>':'')+
'</div></div>').join('')||'<p class="note">No placements assigned yet.</p>')+'</div>';const b=document.getElementById('copyBtn');if(b)b.onclick=async()=>{b.disabled=true;b.textContent='Copying…';try{await navigator.clipboard.writeText(document.getElementById('shareUrl').value);b.textContent='✓ Copied'}catch(e){b.disabled=false;b.textContent='Copy link'}};const next=document.getElementById('publisherNextAction');if(next)setTimeout(()=>next.scrollIntoView({behavior:'smooth',block:'center'}),180)}catch(e){root.innerHTML='<div class="card"><h2>Dashboard unavailable</h2><p class="note">'+esc(e.message)+'</p></div>'}}load()})();</script></body></html>`);
  });


  app.get('/network/publisher/:token/placement/:placementId', (req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    const token=cleanText(req.params.token,128),placementId=Number(req.params.placementId);
    if(!/^[a-f0-9]{64}$/i.test(token)||!placementId)return res.status(404).send('Publication package not found.');
    res.set('Cache-Control','no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Publication Package · ContentScale Network</title><style>
body{font-family:Inter,system-ui;background:#08101f;color:#eef4ff;margin:0}main{max-width:1080px;margin:auto;padding:32px 18px 70px}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin:16px 0}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.note,.tiny{color:#9aabd0;line-height:1.55}.tiny{font-size:12px}.pill{display:inline-block;border:1px solid #35507a;border-radius:999px;padding:4px 9px;font-size:12px}.ok{color:#86efac}.warn{color:#fcd34d}.btn{background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:10px 13px;font-weight:800;cursor:pointer;text-decoration:none}.btn.good{background:#166534;border-color:#22c55e}.btn.next{background:#1d4ed8;border-color:#60a5fa;animation:guidedPulse 1.7s ease-in-out infinite}.btn.done{background:#14532d;border-color:#22c55e}.btn.locked{background:#172033;border-color:#334155;color:#94a3b8}.guidedCard.active{border-color:#3b82f6;background:#102752}.guidedCard.done{border-color:#22c55e;background:#0d271c}.guidedCard.locked{opacity:.62}@keyframes guidedPulse{50%{box-shadow:0 0 0 6px rgba(59,130,246,.13)}}.btn:disabled{opacity:.6;cursor:wait}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.field label{display:block;font-size:11px;color:#9aabd0;margin:0 0 5px}.field input,.field textarea{width:100%;box-sizing:border-box;background:#091329;color:#fff;border:1px solid #35507a;border-radius:9px;padding:10px}.field textarea{min-height:220px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}.actions{display:flex;gap:8px;flex-wrap:wrap}.statusbox{padding:12px;border-radius:10px;border:1px solid #35507a;background:#091329}a{color:#8dd9ff}

button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><main><div class="top"><div><div class="tiny">CONTENTSCALE NETWORK · PUBLISHER</div><h1>Publication Package</h1></div><a href="/network/publisher/${token}">← Publisher Dashboard</a></div><div id="app"><div class="card">Loading publication package…</div></div></main><script>(function(){const token=${JSON.stringify(token)},pid=${placementId},esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));async function load(){const root=document.getElementById('app');try{const r=await fetch('/api/network/publisher/'+token+'/placements/'+pid+'/package',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not load package');const p=d.placement||{},pub=d.publication||{},q=d.quality||{},st=d.publication_standard||{},ready=!!d.delivery_ready,h=d.review_history||[],copied=!!(d.readiness&&d.readiness.seo_copied_current);const verified=p.status==='verified',waitingReview=['submitted','verifying'].includes(String(p.status||'')),needsResubmit=String(p.status||'')==='needs_review';const history='<div class="card"><h2>Review history</h2><p class="note">Every submission, pre-check and manual decision is kept here so previous feedback is never lost.</p>'+(h.length?h.map(function(x){return '<div class="statusbox" style="margin-top:8px"><strong>'+esc(String(x.event_type||'').replace(/_/g,' '))+'</strong> <span class="tiny">· '+esc(new Date(x.created_at).toLocaleString())+'</span>'+(x.published_url?'<div class="tiny"><a target="_blank" rel="noopener" href="'+esc(x.published_url)+'">'+esc(x.published_url)+'</a></div>':'')+(x.note?'<div class="tiny" style="margin-top:5px"><b>Note:</b> '+esc(x.note)+'</div>':'')+'</div>'}).join(''):'<p class="note">No review events yet.</p>')+'</div>';root.innerHTML='<div class="card"><h2>'+esc(pub.title||p.title||'Publisher Edition')+'</h2><span class="pill">Placement: '+esc(p.status||'')+'</span> <span class="pill">ContentScore: '+Number(q.score||0)+'/100</span><p class="note">'+esc(d.rule||'')+'</p></div><div class="card"><h2>Publication readiness</h2><div class="grid"><div class="statusbox"><strong class="'+(Number(q.score||0)>=80?'ok':'warn')+'">ContentScore '+Number(q.score||0)+'/100</strong></div><div class="statusbox"><strong class="'+(st.passed?'ok':'warn')+'">Publication Standard '+(st.passed?'passed ✓':'not complete')+'</strong></div><div class="statusbox"><strong class="'+(ready?'ok':'warn')+'">'+(ready?'SEO HTML ready ✓':'Waiting for final package')+'</strong></div></div></div>'+(ready?'<div class="card guidedCard '+(verified||p.published_url?'done':(!copied?'active':'done'))+'" id="copyCard"><h2>SEO publication HTML</h2><p class="note">Paste this into the publisher CMS as real HTML. Do not use a JavaScript-only embed for the final Network placement.</p><div class="actions"><button class="btn '+(!p.published_url&&!copied?'next':'done')+'" id="copyHtml">'+(copied||p.published_url?'✓ SEO HTML copied':'Copy SEO HTML')+'</button><button class="btn" id="copyMeta">Copy meta</button></div><div class="field" style="margin-top:12px"><label>HTML</label><textarea id="seoHtml" readonly>'+esc(d.seo_html||'')+'</textarea></div><div class="grid" style="margin-top:12px"><div class="field"><label>Meta title</label><input id="metaTitle" readonly value="'+esc(pub.meta_title||'')+'"></div><div class="field"><label>Meta description</label><input id="metaDescription" readonly value="'+esc(pub.meta_description||'')+'"></div><div class="field"><label>Suggested slug</label><input readonly value="'+esc(pub.suggested_slug||'')+'"></div></div></div><div class="card guidedCard '+(verified?'done':(waitingReview?'locked':((copied||needsResubmit)?'active':'locked')))+'" id="submitCard"><h2>After you publish</h2><p class="note">Enter the exact live article URL. ContentScale will place it in the verification queue. Credits are awarded only after a ContentScale admin manually verifies the live page. You will receive an email with the decision.</p><div class="field"><label>Exact live article URL</label><input id="liveUrl" placeholder="https://'+esc(p.publisher_domain||'publisher.com')+'/article" value="'+esc(p.published_url||'')+'"></div><div class="actions" style="margin-top:10px"><button class="btn '+(verified?'done':(waitingReview?'locked':((copied||needsResubmit)?'next':'locked')))+'" id="submitLive" '+(waitingReview||verified?'disabled':'')+'>'+(verified?'✓ Verified':waitingReview?'Waiting for review':needsResubmit?'Resubmit live URL':'I published it · submit live URL')+'</button></div><div id="msg" class="note" style="margin-top:8px"></div></div>':'<div class="card"><h2>Package not ready yet</h2><p class="note">ContentScale has not released the SEO HTML because the quality gate or Publication Standard is not complete. Nothing needs to be published yet.</p></div>')+history;if(ready){document.getElementById('copyHtml').onclick=async function(){this.disabled=true;this.textContent='Copying…';try{await navigator.clipboard.writeText(d.seo_html||'');const mr=await fetch('/api/network/publisher/'+token+'/placements/'+pid+'/mark-seo-copied',{method:'POST'}),mx=await mr.json();if(!mr.ok)throw Error(mx.error||'Could not save copy state');this.className='btn done';this.textContent='✓ SEO HTML copied';const sc=document.getElementById('submitCard'),sb=document.getElementById('submitLive');if(sc){sc.classList.remove('locked');sc.classList.add('active');sc.scrollIntoView({behavior:'smooth',block:'center'})}if(sb&&!waitingReview&&!verified){sb.disabled=false;sb.className='btn next'}}catch(e){this.disabled=false;this.textContent='Copy SEO HTML'}};document.getElementById('copyMeta').onclick=async function(){this.disabled=true;this.textContent='Copying…';try{await navigator.clipboard.writeText((pub.meta_title||'')+'\\n'+(pub.meta_description||''));this.textContent='✓ Copied'}catch(e){this.disabled=false;this.textContent='Copy meta'}};document.getElementById('submitLive').onclick=async function(){const b=this,m=document.getElementById('msg'),url=document.getElementById('liveUrl').value.trim();if(!url)return m.textContent='Enter the exact live URL first.';b.disabled=true;b.textContent='Submitting…';try{const r=await fetch('/api/network/publisher/'+token+'/placements/'+pid+'/submit-live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({published_url:url})}),x=await r.json();if(!r.ok)throw Error(x.error||'Could not submit');m.className='ok';m.textContent='✓ Live URL submitted. Waiting for manual ContentScale verification.';b.className='btn done';b.textContent='✓ Submitted';setTimeout(()=>document.querySelector('.card:last-child')?.scrollIntoView({behavior:'smooth',block:'center'}),200)}catch(e){m.className='warn';m.textContent='✕ '+e.message;b.disabled=false;b.textContent='Submit live URL'}};const active=document.querySelector('.btn.next');if(active)setTimeout(()=>active.scrollIntoView({behavior:'smooth',block:'center'}),180)}}catch(e){root.innerHTML='<div class="card"><h2>Publication package unavailable</h2><p class="note">'+esc(e.message)+'</p></div>'}}load()})();</script></body></html>`);
  });

  app.post('/api/network/advertising/apply', wrap(async (req,res)=>{
    if(!envEnabled()) return res.status(409).json({success:false,error:'Network is disabled'});
    const company=cleanText(req.body?.company_name,220),headline=cleanText(req.body?.headline,240),email=cleanText(req.body?.contact_email,320);
    if(!company||!headline||!email||!email.includes('@')) return res.status(400).json({success:false,error:'Company, headline and valid contact email are required'});
    let target; try{target=normalizeSite(req.body?.target_url).canonical_url}catch(err){return res.status(400).json({success:false,error:'Enter a valid advertiser website URL'})}
    let logo=null;if(cleanText(req.body?.logo_url,2048)){try{logo=new URL(cleanText(req.body.logo_url,2048));if(!['http:','https:'].includes(logo.protocol))throw Error();logo=logo.toString()}catch(_){return res.status(400).json({success:false,error:'Logo URL must be a valid http/https URL'})}}
    const r=await pool.query(`INSERT INTO network_ads (company_name,contact_name,contact_email,headline,description,target_url,logo_url,niche,locale,placement,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'homepage','pending',NOW(),NOW()) RETURNING *`,[company,cleanText(req.body?.contact_name,180)||null,email,headline,cleanText(req.body?.description,900)||null,target,logo,cleanText(req.body?.niche,160)||null,cleanText(req.body?.locale,30)||'en-US']);
    const ownerNotification=await networkNotifyOwnerAdRequest(pool,r.rows[0]);
    await pool.query(`UPDATE network_ads SET owner_email_status=$2,owner_email_error=$3,owner_email_sent_at=$4,updated_at=NOW() WHERE id=$1`,[
      r.rows[0].id,
      ownerNotification.state,
      ownerNotification.error||null,
      ownerNotification.sent_at||null
    ]).catch(()=>{});
    res.status(201).json({success:true,ad:{id:r.rows[0].id,status:r.rows[0].status},owner_notification:ownerNotification.state,note:'Pending admin approval. Sponsored content is kept separate from organic recommendations.'});
  }));

  app.get('/network/ad/:id/click', wrap(async (req,res)=>{
    const id=Number(req.params.id)||0;if(!id)return res.status(404).send('Not found');
    const r=await pool.query(`UPDATE network_ads SET clicks=clicks+1,updated_at=NOW() WHERE id=$1 AND status='active' AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>=NOW()) RETURNING target_url`,[id]);
    if(!r.rows[0])return res.status(404).send('Advertisement is not active');
    res.redirect(302,r.rows[0].target_url);
  }));

  app.get('/api/network/admin/advertising', verifyAdmin, wrap(async (req,res)=>{
    const [ads,apps]=await Promise.all([
      pool.query(`SELECT * FROM network_ads ORDER BY created_at DESC LIMIT 500`),
      pool.query(`SELECT a.*,pa.access_token,pa.status AS account_status,pa.website_id FROM network_publisher_applications a LEFT JOIN network_publisher_accounts pa ON pa.application_id=a.id ORDER BY a.created_at DESC LIMIT 500`)
    ]);
    res.json({success:true,ads:ads.rows,publisher_applications:apps.rows});
  }));

  app.patch('/api/network/admin/advertising/:id', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id)||0;if(!id)return res.status(400).json({success:false,error:'Invalid advertisement'});
    const allowed=new Set(['pending','active','paused','rejected','expired']),status=cleanText(req.body?.status,30);if(!allowed.has(status))return res.status(400).json({success:false,error:'Invalid status'});
    const placement=['homepage','homepage_featured','niche'].includes(cleanText(req.body?.placement,30))?cleanText(req.body?.placement,30):'homepage';
    const starts=cleanText(req.body?.starts_at,60)||null,ends=cleanText(req.body?.ends_at,60)||null;
    const r=await pool.query(`UPDATE network_ads SET status=$2,placement=$3,starts_at=$4::timestamptz,ends_at=$5::timestamptz,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,status,placement,starts,ends]);
    if(!r.rows[0])return res.status(404).json({success:false,error:'Advertisement not found'});res.json({success:true,ad:r.rows[0]});
  }));

  app.delete('/api/network/admin/advertising/:id', verifyAdmin, wrap(async (req,res)=>{
    const id=Number(req.params.id)||0;if(!id)return res.status(400).json({success:false,error:'Invalid advertisement'});
    const r=await pool.query(`DELETE FROM network_ads WHERE id=$1 AND status IN ('pending','rejected') RETURNING id`,[id]);
    if(!r.rows[0])return res.status(409).json({success:false,error:'Only pending or rejected ads can be deleted. Pause/expire active history instead.'});res.json({success:true,deleted:true,id});
  }));


  app.get('/network/publisher-applications',(req,res)=>{
    if(!envEnabled())return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Publisher Applications | ContentScale Network</title><style>
body{font-family:Inter,system-ui;background:#08101f;color:#eef4ff;margin:0}main{max-width:1120px;margin:auto;padding:34px 20px}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin:16px 0}a{color:#8dd9ff}.note,.tiny{color:#9aabd0;line-height:1.5}.tiny{font-size:12px}.row{border-top:1px solid #26375c;padding:16px 0}.row:first-child{border-top:0}.btn{display:inline-flex;align-items:center;background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:9px 12px;font-weight:700;cursor:pointer;text-decoration:none}.btn.danger{background:#7f1d1d;border-color:#dc2626}.btn:disabled{opacity:.65;cursor:wait}.pill{display:inline-block;border:1px solid #35507a;border-radius:999px;padding:3px 8px;font-size:12px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.statusbox{border:1px solid #31527f;background:#0a1629;border-radius:12px;padding:12px;margin-top:10px}.wait{border-color:#f59e0b}.ok{border-color:#22c55e}
button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease}button:not(:disabled):hover,.btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22)}
button:disabled::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .65s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body><main><p><a href="/network/admin">← Network admin</a></p><div class="card"><h1>Publisher intake</h1><p class="note">This page is only for publisher applications. Advertising is handled separately. One publisher application becomes one linked Network Website after Admin approval; they are two stages of the same onboarding flow, not two unrelated signups.</p><div class="statusbox wait"><b>Stage 1 · Publisher application</b><div class="tiny">Admin approves the publisher identity and creates/links its website record.</div></div><div class="statusbox"><b>Stage 2 · Website review</b><div class="tiny">Admin checks the actual site. Only after website approval does the publisher become active.</div></div></div><div class="card"><h2>Publisher applications</h2><div id="apps">Loading…</div></div></main><script>(function(){
const key=localStorage.getItem('admin_id')||'',esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c));
async function api(path,opt){opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt),t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401||r.status===403){location.href='/admin?next='+encodeURIComponent('/network/publisher-applications');throw Error('Admin session required')}if(!r.ok)throw Error(d.error||('Request failed: '+r.status));return d}
async function load(){const root=document.getElementById('apps');try{const d=await api('/api/network/admin/advertising');root.innerHTML=(d.publisher_applications||[]).map(x=>{const m=x.metadata||{},n=m.owner_notification||{},mail=n.state||'unknown';let next='';if(x.status==='pending')next='<button class="btn" data-review="approved" data-id="'+x.id+'">Approve + link website</button><button class="btn danger" data-review="rejected" data-id="'+x.id+'">Reject</button>';else if(x.status==='approved')next='<a class="btn" href="/network/websites">Next: review linked website →</a>';else if(x.status==='activated')next='<span class="pill" style="border-color:#22c55e;color:#86efac">Publisher active ✓</span>';else next='<span class="pill" style="border-color:#ef4444;color:#fecaca">No further action</span>';return '<div class="row"><strong>'+esc(x.brand_name||x.domain)+'</strong> <span class="pill">'+esc(x.status)+'</span><div class="tiny">'+esc(x.domain)+' · '+esc(x.contact_name||'')+' · '+esc(x.email||'')+'<br>Niche: '+esc(x.niche||'—')+' · Market: '+esc(x.market||'—')+' · Language: '+esc(x.language||'—')+'<br>Notification to Network owner: '+esc(mail)+'</div><div class="actions">'+next+(x.access_token&&x.status!=='rejected'?'<a class="btn" target="_blank" href="/network/publisher/'+esc(x.access_token)+'">Open publisher dashboard</a>':'')+'</div></div>'}).join('')||'<p class="note">No publisher applications yet.</p>'}catch(e){root.innerHTML='<p style="color:#fca5a5">✕ '+esc(e.message||e)+'</p>'}}
document.getElementById('apps').onclick=async e=>{const b=e.target.closest('[data-review]');if(!b)return;const id=b.dataset.id,status=b.dataset.review;if(status==='rejected'&&!confirm('Reject this publisher application?'))return;b.disabled=true;b.textContent=status==='approved'?'Approving…':'Rejecting…';try{await api('/api/network/admin/publisher-applications/'+id+'/review',{method:'POST',body:JSON.stringify({status})});b.textContent='✓ Done';await load()}catch(err){b.disabled=false;b.textContent='✕ Failed';alert(err.message)}};load();
})();</script></body></html>`);
  });

  app.get('/network/advertising',(req,res)=>{if(!envEnabled())return res.status(404).send('Network is not enabled.');res.set('Cache-Control','no-store');res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Network Advertising</title><style>body{font-family:Inter,system-ui;background:#08101f;color:#eef4ff;margin:0}main{max-width:1180px;margin:auto;padding:34px 20px}.card{background:#0f1930;border:1px solid #26375c;border-radius:18px;padding:20px;margin:16px 0}a{color:#8dd9ff}.note,.tiny{color:#9aabd0;line-height:1.5}.tiny{font-size:12px}.row{border-top:1px solid #26375c;padding:14px 0}.btn{background:#2459a9;color:#fff;border:1px solid #4b78be;border-radius:9px;padding:9px 12px;font-weight:700;cursor:pointer}.btn:disabled{opacity:.6}.danger{background:#7f1d1d;border-color:#dc2626}select,input{background:#091329;color:#fff;border:1px solid #35507a;border-radius:8px;padding:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.pill{display:inline-block;border:1px solid #35507a;border-radius:999px;padding:3px 8px;font-size:12px}.stats{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body><main><p><a href="/network/admin">← Network admin</a> · <a href="/network" target="_blank">View public landing</a></p><div class="card"><h1>Homepage Advertising</h1><p class="note">Sponsored companies are clearly labeled on the public Network homepage and remain separate from organic publisher matching. Activate only after review.</p></div><div class="card"><h2>Advertising requests</h2><div id="ads">Loading…</div></div><div class="card"><h2>Publisher applications</h2><p class="note">Every new publisher signup is listed here. Owner email status shows whether ContentScale sent you the signup notification.</p><div id="apps">Loading…</div></div></main><script>(function(){const key=localStorage.getItem('admin_id')||'',esc=s=>String(s==null?'':s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c)),api=async(path,opt)=>{opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key},opt.headers||{});const r=await fetch(path,opt),d=await r.json();if(r.status===401||r.status===403){location.href='/admin?next='+encodeURIComponent('/network/advertising');throw Error('Admin session required')}if(!r.ok)throw Error(d.error||'Request failed');return d};async function load(){try{const d=await api('/api/network/admin/advertising');document.getElementById('ads').innerHTML=(d.ads||[]).map(x=>{const mail=x.owner_email_status||'unknown',ctr=Number(x.impressions||0)>0?((Number(x.clicks||0)/Number(x.impressions||1))*100).toFixed(1)+'%':'—';const live=x.status==='active'&&(!x.starts_at||new Date(x.starts_at)<=new Date())&&(!x.ends_at||new Date(x.ends_at)>=new Date());return '<div class="row"><strong>'+esc(x.company_name)+'</strong> · '+esc(x.headline)+' <span class="pill">'+esc(x.status)+'</span> '+(live?'<span class="pill" style="border-color:#22c55e;color:#86efac">LIVE</span>':'')+'<div class="tiny">'+esc(x.contact_name||'')+' · '+esc(x.contact_email||'')+'<br>'+esc(x.target_url||'')+' · '+esc(x.niche||'')+'<br>Owner email: '+esc(mail)+(x.owner_email_error?' · '+esc(x.owner_email_error):'')+'</div><div class="stats"><span class="pill">Impressions '+Number(x.impressions||0)+'</span><span class="pill">Clicks '+Number(x.clicks||0)+'</span><span class="pill">CTR '+ctr+'</span><span class="pill">Placement '+esc(x.placement||'homepage')+'</span></div><div class="grid"><select data-placement="'+x.id+'"><option value="homepage" '+(x.placement==='homepage'?'selected':'')+'>Homepage</option><option value="homepage_featured" '+(x.placement==='homepage_featured'?'selected':'')+'>Homepage featured</option><option value="niche" '+(x.placement==='niche'?'selected':'')+'>Niche</option></select><input data-start="'+x.id+'" type="datetime-local"><input data-end="'+x.id+'" type="datetime-local"><select data-status="'+x.id+'"><option>pending</option><option>active</option><option>paused</option><option>rejected</option><option>expired</option></select><button class="btn" data-save="'+x.id+'">Save</button><button class="btn danger" data-delete="'+x.id+'">Delete</button></div><div class="tiny" style="margin-top:8px">Start: '+esc(x.starts_at||'immediately when active')+' · End: '+esc(x.ends_at||'no end date')+'</div></div>'}).join('')||'No advertising requests yet.';document.querySelectorAll('[data-status]').forEach(n=>{const id=n.dataset.status,x=(d.ads||[]).find(a=>String(a.id)===String(id));if(x)n.value=x.status});document.getElementById('apps').innerHTML=(d.publisher_applications||[]).map(x=>{const m=x.metadata||{},n=m.owner_notification||{},source=m.source||'network_landing';const mail=n.state||'unknown';const mailLabel=mail==='sent'?'Owner email: sent ✓':mail==='failed'?'Owner email: failed':mail==='not_configured'?'Owner email: not configured':'Owner email: unknown';const next=x.status==='pending'
  ? '<button class="btn" data-pub-review="approved" data-pub-id="'+x.id+'">Approve + link website</button><button class="btn danger" data-pub-review="rejected" data-pub-id="'+x.id+'">Reject</button>'
  : x.status==='approved'
    ? '<a class="btn" href="/network/websites">Next: review website →</a>'
    : x.status==='activated'
      ? '<span class="pill" style="border-color:#22c55e;color:#86efac">Publisher active ✓</span>'
      : '<span class="pill" style="border-color:#ef4444;color:#fecaca">No further action</span>';
return '<div class="row"><strong>'+esc(x.brand_name||x.domain)+'</strong> <span class="pill">'+esc(x.status)+'</span><div class="tiny">'+esc(x.domain)+' · '+esc(x.contact_name||'')+' · '+esc(x.email)+' · '+esc(x.niche||'')+'<br>Source: '+esc(source)+(x.referral_code?' · Referral: '+esc(x.referral_code):'')+'<br>'+esc(mailLabel)+(n.error?' · '+esc(n.error):'')+'</div><div class="stats">'+next+(x.access_token&&x.status!=='rejected'?'<a class="btn" target="_blank" href="/network/publisher/'+esc(x.access_token)+'">Open dashboard</a>':'')+'</div></div>'}).join('')||'No publisher applications yet.'}catch(e){document.getElementById('ads').textContent=e.message}}document.getElementById('ads').onclick=async e=>{const save=e.target.closest('[data-save]');if(save){const id=save.dataset.save;save.disabled=true;save.textContent='Saving…';try{await api('/api/network/admin/advertising/'+id,{method:'PATCH',body:JSON.stringify({status:document.querySelector('[data-status="'+id+'"]')?.value,placement:document.querySelector('[data-placement="'+id+'"]')?.value,starts_at:document.querySelector('[data-start="'+id+'"]')?.value||null,ends_at:document.querySelector('[data-end="'+id+'"]')?.value||null})});save.textContent='✓ Saved';await load()}catch(err){alert(err.message);save.disabled=false;save.textContent='Save'}return}const del=e.target.closest('[data-delete]');if(del){if(!confirm('Delete this pending/rejected ad request?'))return;del.disabled=true;try{await api('/api/network/admin/advertising/'+del.dataset.delete,{method:'DELETE'});await load()}catch(err){alert(err.message);del.disabled=false}}};document.getElementById('apps').onclick=async e=>{const b=e.target.closest('[data-pub-review]');if(!b)return;const id=b.dataset.pubId,status=b.dataset.pubReview;if(status==='rejected'&&!confirm('Reject this publisher application?'))return;b.disabled=true;const old=b.textContent;b.textContent=status==='approved'?'Approving…':'Rejecting…';try{const d=await api('/api/network/admin/publisher-applications/'+id+'/review',{method:'POST',body:JSON.stringify({status})});if(d.dashboard_url)alert((d.note||'Publisher reviewed.')+String.fromCharCode(10,10)+'Private dashboard: '+location.origin+d.dashboard_url);await load()}catch(err){alert(err.message);b.disabled=false;b.textContent=old}};load()})();</script></body></html>`)});

  // Admin-only navigation hub. Public visitors use /network.
  // The HTML shell contains no privileged data. It validates the existing ContentScale
  // admin session against the protected Network API before revealing navigation.
  // All Network admin APIs remain server-side protected by verifyAdmin.

  // v445 — One-page Network cockpit.
  // Read-only aggregation for the dashboard; mutations continue to use the existing
  // protected workflow endpoints so the cockpit cannot bypass existing invariants.

  app.get('/api/network/admin/reset-status', verifyAdmin, wrap(async (req,res)=>{
    const discovered=await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname='public'
        AND tablename LIKE 'network\\_%' ESCAPE '\\'
        AND tablename <> 'network_schema_meta'
      ORDER BY tablename
    `);
    const tables=discovered.rows.map(x=>String(x.tablename||'')).filter(t=>/^network_[a-z0-9_]+$/.test(t));
    const counts={};let total=0;
    for(const t of tables){
      const r=await pool.query(`SELECT COUNT(*)::bigint AS n FROM "${t}"`);
      const n=Number(r.rows[0]?.n||0);counts[t]=n;total+=n;
    }
    res.json({success:true,total,tables:counts,table_count:tables.length,empty:total===0});
  }));

  // FULL TEST RESET — wipe every operational network_* table, preserve schema meta only.
  app.post('/api/network/admin/reset-network-data', verifyAdmin, wrap(async (req,res)=>{
    if(cleanText(req.body?.confirm,100)!=='RESET ALL NETWORK TEST DATA'){
      return res.status(400).json({success:false,error:'Type RESET ALL NETWORK TEST DATA exactly to confirm'});
    }

    const client=await pool.connect();
    try{
      await client.query('BEGIN');

      const discovered=await client.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname='public'
          AND tablename LIKE 'network\\_%' ESCAPE '\\'
          AND tablename <> 'network_schema_meta'
        ORDER BY tablename
      `);

      const tables=discovered.rows
        .map(x=>String(x.tablename||''))
        .filter(t=>/^network_[a-z0-9_]+$/.test(t));

      const counts={};
      for(const t of tables){
        const r=await client.query(`SELECT COUNT(*)::bigint AS n FROM "${t}"`);
        counts[t]=Number(r.rows[0]?.n||0);
      }

      if(tables.length){
        const identifiers=tables.map(t=>`"${t}"`).join(',');
        // All Network tables are truncated together. Unexpected outside
        // foreign-key references will make PostgreSQL block the reset.
        await client.query(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY`);
      }

      await client.query(`INSERT INTO network_schema_meta (singleton,schema_version,updated_at)
        VALUES (TRUE,$1,NOW())
        ON CONFLICT (singleton)
        DO UPDATE SET schema_version=$1,updated_at=NOW()`,[NETWORK_SCHEMA_VERSION]);

      const remaining={};
      let remainingTotal=0;
      for(const t of tables){
        const r=await client.query(`SELECT COUNT(*)::bigint AS n FROM "${t}"`);
        const n=Number(r.rows[0]?.n||0);
        remaining[t]=n;
        remainingTotal+=n;
      }
      if(remainingTotal!==0){
        throw new Error('Network reset verification failed: one or more Network tables still contain data');
      }

      await client.query('COMMIT');

      const deletedTotal=Object.values(counts).reduce((a,n)=>a+Number(n||0),0);
      res.json({
        success:true,
        scope:'all_network_operational_tables',
        test_mode:true,
        core_tables_touched:false,
        schema_preserved:true,
        schema_version:NETWORK_SCHEMA_VERSION,
        tables_reset:tables,
        deleted_counts:counts,
        deleted_total:deletedTotal,
        remaining_counts:remaining,
        remaining_total:0,
        message:'All ContentScale Network test data was removed. Every operational network_* table is empty. Only network_schema_meta was preserved.'
      });
    }catch(e){
      try{await client.query('ROLLBACK')}catch(_){}
      throw e;
    }finally{
      client.release();
    }
  }));


  app.get('/api/network/admin/cockpit', verifyAdmin, wrap(async (req,res)=>{
    await ensureNetworkDirectorySchema(pool);
    const errors=[];
    async function rows(name,sql,params=[]){
      try{return (await pool.query(sql,params)).rows}
      catch(e){errors.push({section:name,error:cleanText(e && e.message || e,500)});return[]}
    }
    async function one(name,sql,params=[]){
      const r=await rows(name,sql,params);return r[0]||{}
    }
    let schema;
    try{schema=await inspectNetworkSchema(pool)}
    catch(e){
      schema={schema_ready:false,schema_version:null,expected_schema_version:NETWORK_SCHEMA_VERSION,error:cleanText(e&&e.message||e,500)};
      errors.push({section:'schema',error:schema.error});
    }

    const [
      websiteCounts,
      contentCounts,
      placementCounts,
      publisherCounts,
      accountCounts,
      adCounts,
      referralCounts,
      creditSummary,
      pendingPublishers,
      pendingAds,
      pendingWebsites,
      reviewQueue,
      recentEvents,
      directoryCounts,
      pendingDirectoryClaims
    ] = await Promise.all([
      rows('website_counts',`SELECT status,COUNT(*)::int AS n FROM network_websites GROUP BY status`),
      rows('content_counts',`SELECT publication_status,COUNT(*)::int AS n FROM network_content GROUP BY publication_status`),
      rows('placement_counts',`SELECT status,COUNT(*)::int AS n FROM network_placements GROUP BY status`),
      rows('publisher_counts',`SELECT status,COUNT(*)::int AS n FROM network_publisher_applications GROUP BY status`),
      rows('account_counts',`SELECT status,COUNT(*)::int AS n FROM network_publisher_accounts GROUP BY status`),
      rows('ad_counts',`SELECT status,COUNT(*)::int AS n,COALESCE(SUM(impressions),0)::bigint AS impressions,COALESCE(SUM(clicks),0)::bigint AS clicks FROM network_ads GROUP BY status`),
      rows('referral_counts',`SELECT status,COUNT(*)::int AS n FROM network_referrals GROUP BY status`),
      one('credit_summary',`SELECT
        COALESCE((SELECT SUM(balance) FROM network_credit_wallets),0)::int AS wallet_balance,
        COALESCE((SELECT SUM(reserved) FROM network_credit_wallets),0)::int AS reserved,
        COALESCE((SELECT SUM(amount) FROM network_credit_transactions WHERE transaction_type='placement_verified'),0)::int AS verified_rewards`),
      rows('pending_publishers',`SELECT pa.*,a.access_token,a.website_id,COALESCE(a.status,'pending') AS account_status
        FROM network_publisher_applications pa
        LEFT JOIN network_publisher_accounts a ON a.application_id=pa.id
        WHERE pa.status='pending'
        ORDER BY pa.created_at ASC LIMIT 20`),
      rows('pending_ads',`SELECT * FROM network_ads WHERE status='pending' ORDER BY created_at ASC LIMIT 20`),
      rows('pending_websites',`SELECT id,domain,brand_name,primary_niche,country,language,status,created_at
        FROM network_websites WHERE status='pending' ORDER BY created_at ASC LIMIT 20`),
      rows('review_queue',`SELECT p.id,p.status,p.published_url,p.submitted_at,p.verification_note,
        c.title AS opportunity_title,c.brand_name,
        w.domain AS publisher_domain,w.brand_name AS publisher_brand,
        pv.id AS publication_version_id,pv.title AS edition_title,
        COALESCE((SELECT COUNT(*)::int FROM network_placement_review_events re
          WHERE re.placement_id=p.id AND re.event_type IN ('submitted','resubmitted')),0) AS review_round
        FROM network_placements p
        JOIN network_content c ON c.id=p.content_id
        JOIN network_websites w ON w.id=p.publisher_website_id
        LEFT JOIN network_publication_versions pv ON pv.placement_id=p.id
        WHERE p.status IN ('submitted','needs_review','verifying')
        ORDER BY COALESCE(p.submitted_at,p.updated_at) ASC LIMIT 25`),
      rows('recent_events',`SELECT re.id,re.placement_id,re.event_type,re.actor_type,re.published_url,re.note,re.created_at,
        w.domain AS publisher_domain,c.title AS opportunity_title
        FROM network_placement_review_events re
        JOIN network_placements p ON p.id=re.placement_id
        JOIN network_websites w ON w.id=p.publisher_website_id
        JOIN network_content c ON c.id=p.content_id
        ORDER BY re.created_at DESC,re.id DESC LIMIT 20`),
      rows('directory_counts',`SELECT status,COUNT(*)::int AS n FROM network_directory_businesses GROUP BY status`),
      rows('pending_directory_claims',`SELECT * FROM network_directory_businesses WHERE status='claim_pending' ORDER BY claim_submitted_at ASC NULLS LAST,updated_at ASC LIMIT 20`)
    ]);

    const toMap=(r,key)=>Object.fromEntries((r||[]).map(x=>[x[key],Number(x.n||0)]));
    const websites=toMap(websiteCounts,'status');
    const content=toMap(contentCounts,'publication_status');
    const placements=toMap(placementCounts,'status');
    const publishers=toMap(publisherCounts,'status');
    const accounts=toMap(accountCounts,'status');
    const referrals=toMap(referralCounts,'status');
    const directory=toMap(directoryCounts,'status');
    const ads=Object.fromEntries((adCounts||[]).map(x=>[x.status,{
      count:Number(x.n||0),
      impressions:Number(x.impressions||0),
      clicks:Number(x.clicks||0)
    }]));

    const attentionCount =
      Number(directory.claim_pending||0)+
      Number(publishers.pending||0)+
      Number(websites.pending||0)+
      Number(ads.pending?.count||0)+
      Number(placements.submitted||0)+
      Number(placements.needs_review||0)+
      Number(placements.verifying||0)+
      Number(referrals.registered||0);

    res.set('Cache-Control','no-store');
    res.json({
      success:true,
      degraded:errors.length>0,
      errors,
      schema,
      attention_count:attentionCount,
      counts:{directory,websites,content,placements,publishers,accounts,ads,referrals,credits:creditSummary},
      queues:{
        pending_directory_claims:pendingDirectoryClaims,
        pending_publishers:pendingPublishers,
        pending_ads:pendingAds,
        pending_websites:pendingWebsites,
        review:reviewQueue,
        recent_events:recentEvents
      },
      logic:[
        {step:1,key:'directory',title:'Verify business',what:'Import an unclaimed profile or review an owner claim.',next:'Check the website and verify/reject the business. Publishing is optional.',href:'/network/directory/admin'},
        {step:2,key:'publishers',title:'Publisher intake',what:'A verified business may opt in as a publisher, or a publisher can apply directly.',next:'Approve the application, then review the publisher website.',href:'/network/publisher-applications'},
        {step:3,key:'websites',title:'Publisher website',what:'Check the actual site, niche, language and quality.',next:'Approve/trust the site before it can take an opportunity.',href:'/network/websites'},
        {step:4,key:'opportunities',title:'Starter / marketplace request',what:'Capture an H1/topic + short pitch. New publishers start with 1 give + 1 receive.',next:'Match only after real publishing interest.',href:'/network/opportunities'},
        {step:5,key:'publishing',title:'Publisher Edition',what:'Generate one original edition for that specific committed publisher.',next:'Pass ContentScore + Publication Standard, then release the package.',href:'/network/publishing'},
        {step:6,key:'verification',title:'Publish + manual review',what:'Publisher publishes the SEO HTML and submits the exact live URL.',next:'Verify, request changes or reject. Credits only after manual Verify.',href:'/network/verification'},
        {step:7,key:'marketplace',title:'Marketplace + credits',what:'After the starter exchange, continue through normal opportunities, referrals and credits.',next:'Keep history and attribution intact.',href:'/network/placements'}
      ]
    });
  }));

  app.get('/network/admin', (req, res) => {
    if (!envEnabled()) return res.status(404).send('Network is not enabled.');
    res.set('Cache-Control','no-store');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ContentScale Network Cockpit</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#07101f;color:#eef4ff;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}a{color:#8dd9ff}main{max-width:1500px;margin:auto;padding:26px 18px 70px}.top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7dd3fc;font-weight:900}.top h1{font-size:clamp(30px,5vw,52px);margin:5px 0 7px}.muted,.tiny{color:#96a7ca;line-height:1.5}.tiny{font-size:12px}.actions{display:flex;gap:8px;flex-wrap:wrap}.btn{display:inline-flex;align-items:center;gap:6px;background:#17376c;color:#fff;border:1px solid #3f65a4;border-radius:10px;padding:9px 12px;font-weight:850;text-decoration:none;cursor:pointer}.btn.good{background:#14532d;border-color:#22c55e}.btn.warn{background:#78350f;border-color:#f59e0b}.btn.bad{background:#7f1d1d;border-color:#ef4444}.btn.secondary{background:#101b31;border-color:#33476e}.btn:disabled{opacity:.55;cursor:wait}.health{display:flex;gap:7px;flex-wrap:wrap;margin:13px 0}.pill{display:inline-block;border:1px solid #35507a;border-radius:999px;padding:5px 9px;font-size:11px;background:#101b31}.pill.ok{border-color:#22c55e;color:#86efac}.pill.warn{border-color:#f59e0b;color:#fde68a}.pill.bad{border-color:#ef4444;color:#fecaca}.hero{background:linear-gradient(135deg,#0c1a31,#101a31);border:1px solid #2b4168;border-radius:20px;padding:20px;margin:14px 0}.attention{border-color:#7c3aed;background:linear-gradient(135deg,#17102b,#10182d)}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;margin:14px 0}.kpi{background:#0b1629;border:1px solid #263b62;border-radius:13px;padding:13px}.kpi b{display:block;font-size:27px}.kpi span{font-size:11px;color:#9fb1d6}.flow{display:grid;grid-template-columns:repeat(7,minmax(210px,1fr));gap:16px;overflow-x:auto;padding:8px 6px 12px}.step{min-width:210px;background:#0b1629;border:1px solid #2b4168;border-radius:14px;padding:16px;position:relative;display:flex;flex-direction:column;min-height:285px}.step .num{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#2459a9;font-weight:950;margin-bottom:8px}.step h3{margin:0 0 6px;font-size:15px}.step p{margin:0 0 9px;color:#9fb1d6;font-size:12px;line-height:1.45}.step .next{color:#dbeafe;font-size:11px;min-height:47px;margin-top:auto}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{background:#0d172b;border:1px solid #2a3e63;border-radius:16px;padding:16px;min-width:0}.card h2{margin:0 0 8px;font-size:18px}.queue{display:grid;gap:9px}.row{border:1px solid #293d60;border-radius:11px;padding:11px;background:#091426}.rowHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.row strong{overflow-wrap:anywhere}.meta{font-size:12px;color:#9badcf;line-height:1.55;overflow-wrap:anywhere}.rowActions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.empty{padding:14px;border:1px dashed #345071;border-radius:10px;color:#7890b8}.event{padding:9px 0;border-top:1px solid #243653}.event:first-child{border-top:0}.gate{position:fixed;inset:0;z-index:99999;background:#07101f;display:flex;align-items:center;justify-content:center;padding:24px}.gateBox{max-width:470px;width:100%;background:#101a30;border:1px solid #2a3e63;border-radius:18px;padding:26px}.sectionTitle{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px}.sectionTitle h2{margin:0}.urgent{box-shadow:0 0 0 1px rgba(124,58,237,.2),0 14px 40px rgba(76,29,149,.12)}

.actionState{display:flex;align-items:center;gap:11px;margin-top:12px;padding:12px 14px;border-radius:12px;border:1px solid #33476e;background:#0a1528}
.actionState .stateIcon{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:16px;font-weight:950;background:#15233d;color:#9fb1d6;flex:0 0 28px}
.actionState.loading{border-color:#3b82f6;background:#0b1b35}.actionState.loading .stateIcon{color:#bfdbfe}.actionState.loading .stateIcon:before{content:"";width:13px;height:13px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:csSpinState .7s linear infinite}
.actionState.loading .stateIcon{font-size:0}
.actionState.success{border-color:#22c55e;background:#092619}.actionState.success .stateIcon{background:#14532d;color:#86efac}
.actionState.error{border-color:#ef4444;background:#2a0d14}.actionState.error .stateIcon{background:#7f1d1d;color:#fecaca}
.actionState.confirm{border-color:#f59e0b;background:#2a1d08}.actionState.confirm .stateIcon{background:#78350f;color:#fde68a}
@keyframes csSpinState{to{transform:rotate(360deg)}}
.resetCard code{color:#bfdbfe}
@media(max-width:980px){.grid2{grid-template-columns:1fr}.flow{grid-template-columns:repeat(7,210px)}}@media(max-width:640px){main{padding:18px 10px 50px}.kpis{grid-template-columns:1fr 1fr}}

button,.btn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease,opacity .16s ease}
button:not(:disabled):hover,.btn:not([aria-disabled="true"]):hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.22);filter:brightness(1.08)}
button:not(:disabled):active,.btn:not([aria-disabled="true"]):active{transform:translateY(0) scale(.97);box-shadow:none}
button:disabled,.btn.busy{cursor:wait!important;position:relative;opacity:.72!important}
button:disabled::after,.btn.busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:csButtonSpin .65s linear infinite}
@keyframes csButtonSpin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){button,.btn{transition:none!important}button:not(:disabled):hover,.btn:hover,button:not(:disabled):active,.btn:active{transform:none!important}button:disabled::after,.btn.busy::after{animation:none!important}}
</style></head><body>
<div id="gate" class="gate"><div class="gateBox"><div class="eyebrow">Protected administration</div><h2>Network Cockpit</h2><p id="gateText" class="muted">Checking your existing ContentScale admin session…</p><button id="loginBtn" class="btn" style="display:none">Open ContentScale Admin Login</button></div></div>
<main id="main" style="display:none">
<div class="top"><div><div class="eyebrow">CONTENTSCALE NETWORK · CONTROL CENTER</div><h1>Network Cockpit</h1><div class="muted">TEST MODE · Guided handoff: Business/Publisher acts → Admin takes over for approval → user continues → Admin verifies. Reset everything again before launch.</div></div><div class="actions"><a class="btn secondary" target="_blank" href="/network">Public Network ↗</a><a class="btn good" href="/network/directory/admin">Business Verification</a><button class="btn secondary" id="initBtn">Run Network init</button><button class="btn" id="refreshBtn">Refresh cockpit</button></div></div>
<div class="health" id="health"></div><section class="card" style="border-color:#f59e0b;background:#23190b"><strong style="color:#fde68a">TEST MODE</strong><div class="tiny" style="margin-top:5px">Everything created in ContentScale Network is test data until you finish the complete role-by-role test. Before launch, use <b>Delete ALL Network test data</b> one final time so production starts empty.</div></section>

<section class="hero"><div class="sectionTitle"><div><div class="eyebrow">ADMIN TOUR</div><h2>What you do, in order</h2></div><a class="btn good" href="/network/directory/admin">Open Step 1 · Business Verification</a></div><div class="flow"><div class="step"><div class="num">1</div><h3>Verify business</h3><p>Import or review a claim. Check the real website, niche and market.</p><div class="next"><b>Press:</b> Check website → Verify business.</div></div><div class="step"><div class="num">2</div><h3>Publisher opt-in</h3><p>A verified business may choose publishing. Do not enroll it automatically.</p><div class="next"><b>Press:</b> Approve + link website, then review the website.</div></div><div class="step"><div class="num">3</div><h3>Starter exchange</h3><p>New publishers begin with 1 give + 1 receive. Capture H1/topic + short pitch first.</p><div class="next"><b>Go to:</b> Opportunities after real intent.</div></div><div class="step"><div class="num">4</div><h3>Generate after match</h3><p>Once an approved website commits, generate that publisher's unique edition.</p><div class="next"><b>Go to:</b> Publishing.</div></div><div class="step"><div class="num">5</div><h3>Verify live page</h3><p>Publisher submits the live URL. You manually verify before credits.</p><div class="next"><b>Go to:</b> Manual Verification.</div></div><div class="step"><div class="num">6</div><h3>Marketplace</h3><p>After starter exchange, continue through normal opportunities, referrals and credits.</p><div class="next"><b>Watch:</b> placements and history.</div></div></div></section><section class="hero attention urgent">
<div class="sectionTitle"><div><div class="eyebrow">DO THIS FIRST</div><h2>Needs your attention</h2></div><span class="pill warn" id="attentionBadge">Loading…</span></div>
<div class="kpis" id="actionKpis"></div>
</section>

<section class="hero"><div class="sectionTitle"><div><div class="eyebrow">THE WHOLE LOGIC</div><h2>Network workflow</h2></div></div><div class="flow" id="flow"></div></section>

<div class="kpis" id="overviewKpis"></div>

<div class="grid2">
<section class="card"><div class="sectionTitle"><h2>1. Publisher applications</h2><a href="/network/publisher-applications">Open all →</a></div><p class="tiny">Application approval is only the first gate. Press “Approve + link website” here, then go to Publisher Websites and run the website check before approving the website itself.</p><div id="publishers" class="queue"></div></section>
<section class="card"><div class="sectionTitle"><h2>2. Websites waiting for review</h2><a href="/network/websites">Open websites →</a></div><p class="tiny">Open Publisher Websites, press “Check website”, inspect the result, then approve only if the site is suitable. Application approval alone is not enough.</p><div id="websites" class="queue"></div></section>
<section class="card"><div class="sectionTitle"><h2>3. Manual verification queue</h2><a href="/network/verification">Open verification →</a></div><p class="tiny">These publishers submitted live URLs. You make the final decision.</p><div id="verification" class="queue"></div></section>
<section class="card"><div class="sectionTitle"><h2>4. Advertising requests</h2><a href="/network/advertising">Open advertising →</a></div><p class="tiny">Sponsored visibility remains separate from organic publisher matching.</p><div id="ads" class="queue"></div></section>
</div>

<section class="card" style="margin-top:12px"><div class="sectionTitle"><h2>Recent Network activity</h2><a href="/network/verification">Review history →</a></div><div id="events"></div></section>

<section class="card resetCard" id="resetCard" style="margin-top:14px;border-color:#31527f"><div class="sectionTitle"><div><div class="eyebrow" style="color:#8dd9ff">TEST MODE · RESET TOOLS</div><h2>Everything in Network is test data until launch</h2></div><span class="pill" id="resetCountBadge">Checking test data…</span></div><p class="muted">During this test phase, every Network record is disposable test data. This reset empties every operational <code>network_*</code> table — including businesses, users, publisher accounts, websites, opportunities/posts, Publisher Editions, placements, verification history, credits, referrals, ads and images. Core ContentScale is not touched.</p><div id="resetState" class="actionState idle"><span class="stateIcon">●</span><div><strong>Ready</strong><div class="tiny">Nothing happens silently. Every action below shows loading, success ✓ or failure ✕.</div></div></div><div class="actions" style="margin-top:12px"><button class="btn" id="resetNetworkBtn">Delete ALL Network test data</button><button class="btn" id="resetConfirmBtn" style="display:none">Confirm delete now</button><button class="btn secondary" id="resetCancelBtn" style="display:none">Cancel</button></div><div id="resetNetworkMsg" class="tiny" style="margin-top:9px"></div></section>
<section class="hero" style="margin-top:14px"><div class="sectionTitle"><div><div class="eyebrow">ALL MODULES</div><h2>Direct controls</h2></div></div><div class="actions">
<a class="btn good" href="/network/directory/admin">Business Verification</a>
<a class="btn" href="/network/websites">Publisher Websites</a>
<a class="btn" href="/network/opportunities">Opportunities</a>
<a class="btn" href="/network/publishing">Publishing</a>
<a class="btn" href="/network/placements">Placements</a>
<a class="btn good" href="/network/verification">Manual Verification</a>
<a class="btn" href="/network/referrals">Publisher Scouts</a>
<a class="btn" href="/network/publisher-applications">Publisher Applications</a><a class="btn" href="/network/advertising">Advertising</a>
</div></section>
</main>
<script>(function(){
const gate=document.getElementById('gate'),main=document.getElementById('main'),gt=document.getElementById('gateText'),login=document.getElementById('loginBtn');
let key='';try{key=localStorage.getItem('admin_id')||''}catch(e){}
const esc=v=>String(v==null?'':v).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));
const dt=v=>{try{return v?new Date(v).toLocaleString():'—'}catch(e){return '—'}};
function goLogin(){location.href='/admin?next='+encodeURIComponent('/network/admin')}login.onclick=goLogin;
async function api(path,opt){opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','x-admin-key':key,'Accept':'application/json'},opt.headers||{});const r=await fetch(path,opt),t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(e){}if(r.status===401||r.status===403){try{localStorage.removeItem('admin_id')}catch(e){}throw Error('AUTH')}if(!r.ok||d.success===false)throw Error(d.error||('Request failed: '+r.status));return d}
function count(obj,k){return Number((obj||{})[k]||0)}
function adCount(obj,k){return Number(((obj||{})[k]||{}).count||0)}
function kpi(n,label,href){return '<a class="kpi" href="'+href+'" style="text-decoration:none;color:inherit"><b>'+n+'</b><span>'+esc(label)+'</span></a>'}
function flowCard(x){return '<div class="step"><div class="num">'+x.step+'</div><h3>'+esc(x.title)+'</h3><p>'+esc(x.what)+'</p><div class="next"><b>Next:</b> '+esc(x.next)+'</div><a class="btn secondary" href="'+esc(x.href)+'" style="margin-top:12px;justify-content:center;min-width:84px">Open</a></div>'}
async function load(){
 const rb=document.getElementById('refreshBtn');rb.disabled=true;rb.textContent='Refreshing…';
 try{
  const d=await api('/api/network/admin/cockpit'),c=d.counts||{},q=d.queues||{},s=d.schema||{};
  document.getElementById('health').innerHTML=
   '<span class="pill '+(s.schema_ready?'ok':'bad')+'">Schema '+esc(s.schema_version)+' / '+esc(s.expected_schema_version)+'</span>'+
   '<span class="pill '+(s.schema_ready?'ok':'bad')+'">'+(s.schema_ready?'Schema ready ✓':'Schema needs init')+'</span>'+
   '<span class="pill ok">Network enabled</span>'+
   '<span class="pill">Core tables untouched</span>'+
   (d.degraded?'<span class="pill warn">Cockpit partial · '+Number((d.errors||[]).length)+' data warning(s)</span>':'<span class="pill ok">Cockpit data healthy ✓</span>');
  document.getElementById('attentionBadge').textContent=Number(d.attention_count||0)+' action item'+(Number(d.attention_count||0)===1?'':'s');
  document.getElementById('actionKpis').innerHTML=
   kpi(count(c.directory,'claim_pending'),'Business claims','/network/directory/admin')+
   kpi(count(c.publishers,'pending'),'Publisher applications','/network/publisher-applications')+
   kpi(count(c.websites,'pending'),'Websites pending','/network/websites')+
   kpi(count(c.placements,'submitted')+count(c.placements,'needs_review')+count(c.placements,'verifying'),'Manual reviews','/network/verification')+
   kpi(adCount(c.ads,'pending'),'Advertising requests','/network/advertising')+
   kpi(count(c.referrals,'registered'),'Referral activations','/network/referrals');
  document.getElementById('flow').innerHTML=(d.logic||[]).map(flowCard).join('');
  document.getElementById('overviewKpis').innerHTML=
   kpi(count(c.directory,'verified'),'Verified businesses','/network/directory/admin')+
   kpi(count(c.accounts,'active'),'Active publishers','/network/publisher-applications')+
   kpi(count(c.websites,'approved')+count(c.websites,'trusted'),'Approved / trusted websites','/network/websites')+
   kpi(count(c.content,'available'),'Open opportunities','/network/opportunities')+
   kpi(count(c.placements,'ready'),'Publisher Editions ready','/network/publishing')+
   kpi(count(c.placements,'verified'),'Verified placements','/network/verification')+
   kpi(Number(c.credits?.wallet_balance||0),'Credits in wallets','/network/verification');

  document.getElementById('publishers').innerHTML=(q.pending_publishers||[]).map(x=>{
    const m=x.metadata||{},n=m.owner_notification||{},mail=n.state||'unknown';
    return '<div class="row"><div class="rowHead"><div><strong>'+esc(x.brand_name||x.domain)+'</strong><div class="meta">'+esc(x.domain)+' · '+esc(x.contact_name||'')+' · '+esc(x.email||'')+'<br>Declared: '+esc(x.niche||'—')+'<br>Classification: '+esc(x.niche_main||'Other')+' → '+esc(x.niche_sub||x.niche||'—')+(Array.isArray(x.niche_topics)&&x.niche_topics.length?'<br>Topics: '+x.niche_topics.map(esc).join(' · '):'')+' · Source: '+esc(m.source||'network_landing')+'<br>Owner email: '+esc(mail)+' · Applied: '+esc(dt(x.created_at))+'</div></div><span class="pill warn">pending</span></div><div class="rowActions"><button class="btn good" data-pub="approved" data-id="'+x.id+'">Approve + link website</button><button class="btn bad" data-pub="rejected" data-id="'+x.id+'">Reject</button></div></div>'
  }).join('')||'<div class="empty">No publisher applications waiting.</div>';

  document.getElementById('websites').innerHTML=(q.pending_websites||[]).map(x=>
    '<div class="row"><div class="rowHead"><div><strong>'+esc(x.brand_name||x.domain)+'</strong><div class="meta">'+esc(x.domain)+'<br>'+esc(x.primary_niche||'No niche')+' · '+esc(x.country||'No country')+' · '+esc(x.language||'No language')+'<br>Added: '+esc(dt(x.created_at))+'</div></div><span class="pill warn">pending</span></div><div class="rowActions"><a class="btn" href="/network/websites">Review website</a></div></div>'
  ).join('')||'<div class="empty">No websites waiting for review.</div>';

  document.getElementById('verification').innerHTML=(q.review||[]).map(x=>
    '<div class="row"><div class="rowHead"><div><strong>'+esc(x.publisher_brand||x.publisher_domain)+'</strong><div class="meta">'+esc(x.publisher_domain)+'<br>Opportunity: '+esc(x.edition_title||x.opportunity_title||'—')+'<br>Review round '+Math.max(1,Number(x.review_round||1))+' · Submitted: '+esc(dt(x.submitted_at))+'</div></div><span class="pill warn">'+esc(x.status)+'</span></div><div class="rowActions">'+(x.published_url?'<a class="btn secondary" target="_blank" rel="noopener" href="'+esc(x.published_url)+'">Open live page ↗</a>':'')+'<a class="btn good" href="/network/verification">Review manually</a></div></div>'
  ).join('')||'<div class="empty">Nothing is waiting for manual verification.</div>';

  document.getElementById('ads').innerHTML=(q.pending_ads||[]).map(x=>
    '<div class="row"><div class="rowHead"><div><strong>'+esc(x.company_name)+'</strong><div class="meta">'+esc(x.contact_name||'')+' · '+esc(x.contact_email||'')+'<br>'+esc(x.headline||'')+'<br>'+esc(x.target_url||'')+' · '+esc(x.niche||'—')+'<br>Requested: '+esc(dt(x.created_at))+'</div></div><span class="pill warn">pending</span></div><div class="rowActions"><a class="btn" href="/network/advertising">Review advertising</a></div></div>'
  ).join('')||'<div class="empty">No advertising requests waiting.</div>';

  document.getElementById('events').innerHTML=
   ((d.errors||[]).length?'<div class="row" style="border-color:#f59e0b"><strong>Data warnings</strong><div class="meta">'+(d.errors||[]).map(e=>esc(e.section)+': '+esc(e.error)).join('<br>')+'</div></div>':'')+
   ((q.recent_events||[]).map(x=>
    '<div class="event"><strong>'+esc(String(x.event_type||'').replace(/_/g,' '))+'</strong> · '+esc(x.publisher_domain||'')+'<div class="meta">'+esc(x.opportunity_title||'')+' · '+esc(dt(x.created_at))+(x.note?'<br>Note: '+esc(x.note):'')+'</div></div>'
  ).join('')||'<div class="empty">No review history yet.</div>');
 }catch(e){
   if(e.message==='AUTH'){gate.style.display='flex';main.style.display='none';gt.textContent='Your ContentScale admin session is not valid. Log in first.';login.style.display='inline-flex';}
   else alert(e.message||e);
 }finally{rb.disabled=false;rb.textContent='Refresh cockpit'}
}
document.getElementById('publishers').onclick=async e=>{
 const b=e.target.closest('[data-pub]');if(!b)return;const status=b.dataset.pub,id=b.dataset.id;
 if(status==='rejected'&&!confirm('Reject this publisher application?'))return;
 b.disabled=true;const old=b.textContent;b.textContent=status==='approved'?'Approving…':'Rejecting…';
 try{const d=await api('/api/network/admin/publisher-applications/'+id+'/review',{method:'POST',body:JSON.stringify({status})});if(d.dashboard_url&&status==='approved')alert('Publisher approved.\\n\\nPrivate dashboard: '+location.origin+d.dashboard_url);await load()}catch(err){alert(err.message||err);b.disabled=false;b.textContent=old}
};
document.getElementById('initBtn').onclick=async function(){const b=this;if(!confirm('Run Network schema init? This only creates/verifies network_* tables.'))return;b.disabled=true;b.textContent='Initializing…';try{const d=await api('/api/network/admin/init',{method:'POST',body:'{}'});alert('Network init complete. Schema version '+d.schema_version+'.');await load()}catch(e){alert(e.message||e)}finally{b.disabled=false;b.textContent='Run Network init'}};
 const resetBtn=document.getElementById('resetNetworkBtn'),resetConfirm=document.getElementById('resetConfirmBtn'),resetCancel=document.getElementById('resetCancelBtn'),resetState=document.getElementById('resetState'),resetMsg=document.getElementById('resetNetworkMsg'),resetBadge=document.getElementById('resetCountBadge');
 if(!resetBtn||!resetConfirm||!resetCancel||!resetState||!resetMsg||!resetBadge){
   console.error('ContentScale Network reset controls are missing from /network/admin');
 } else {
function setResetState(kind,title,detail){
 resetState.className='actionState '+kind;
 const icon=kind==='success'?'✓':kind==='error'?'✕':kind==='confirm'?'!':'●';
 resetState.innerHTML='<span class="stateIcon">'+icon+'</span><div><strong>'+esc(title)+'</strong><div class="tiny">'+esc(detail||'')+'</div></div>';
}
async function refreshResetStatus(){
 try{
   const d=await api('/api/network/admin/reset-status');
   resetBadge.className='pill '+(d.empty?'ok':'warn');
   resetBadge.textContent=d.empty?'Network empty ✓':Number(d.total||0)+' Network test record(s)';
   if(d.empty && !resetConfirm.offsetParent)setResetState('success','Network is empty','There are 0 operational Network records. You can start the clean test.');
   return d;
 }catch(e){
   resetBadge.className='pill bad';resetBadge.textContent='Could not count data';
   if(String(e.message)!=='AUTH')setResetState('error','Could not check Network data',e.message||e);
   throw e;
 }
}
resetBtn.onclick=async function(){
 resetBtn.style.display='none';
 resetConfirm.style.display='inline-flex';
 resetCancel.style.display='inline-flex';
 setResetState('confirm','Confirm full test reset','This will permanently delete ALL current Network test data. Core ContentScale stays untouched.');
 resetMsg.textContent='Second click required: press “Confirm delete now”.';
};
resetCancel.onclick=function(){
 resetBtn.style.display='inline-flex';resetConfirm.style.display='none';resetCancel.style.display='none';
 resetMsg.textContent='';setResetState('idle','Ready','Reset cancelled. No data was changed.');
};
resetConfirm.onclick=async function(){
 resetConfirm.disabled=true;resetCancel.disabled=true;
 resetConfirm.textContent='Deleting…';
 setResetState('loading','Deleting ALL Network test data','Please wait. The server is emptying every operational network_* table and then verifying the result.');
 resetMsg.style.color='#bfdbfe';resetMsg.textContent='Working… do not close this page.';
 try{
   const d=await api('/api/network/admin/reset-network-data',{method:'POST',body:JSON.stringify({confirm:'RESET ALL NETWORK TEST DATA'})});
   const status=await api('/api/network/admin/reset-status');
   if(Number(d.remaining_total||0)!==0 || Number(status.total||0)!==0)throw Error('Reset finished but Network data is still present.');
   setResetState('success','Network completely empty ✓','All operational Network tables were verified at 0 records. Core ContentScale was untouched.');
   resetMsg.style.color='#86efac';
   resetMsg.textContent='✓ Deleted '+Number(d.deleted_total||0)+' record(s) across '+Number((d.tables_reset||[]).length)+' Network table(s). Remaining: 0.';
   resetBadge.className='pill ok';resetBadge.textContent='Network empty ✓';
   resetConfirm.textContent='✓ Deleted';
   resetConfirm.style.display='none';resetCancel.style.display='none';resetBtn.style.display='inline-flex';
   resetBtn.textContent='Reset again';
   await load();
 }catch(e){
   setResetState('error','Reset failed ✕',e.message||e);
   resetMsg.style.color='#fca5a5';resetMsg.textContent='✕ '+(e.message||e);
   resetConfirm.disabled=false;resetCancel.disabled=false;resetConfirm.textContent='Try delete again';
 }
};
refreshResetStatus().catch(()=>{});
 }
document.getElementById('refreshBtn').onclick=load;
let cockpitLastLoad=Date.now();window.addEventListener('focus',()=>{if(Date.now()-cockpitLastLoad>30000){cockpitLastLoad=Date.now();load()}});
if(!key){gt.textContent='Enter your ContentScale admin username and password first.';login.style.display='inline-flex';return}
api('/api/network/admin/status').then(()=>{gate.remove();main.style.display='block';load()}).catch(e=>{gt.textContent=e.message==='AUTH'?'Your admin session is not valid. Log in with ContentScale Admin.':'Could not verify the Network admin session.';login.style.display='inline-flex'});
})();</script></body></html>`);
  });

  return { registered: true, enabled: envEnabled(), schema_version: NETWORK_SCHEMA_VERSION };
}

module.exports = { registerNetwork, ensureNetworkTables, ensureNetworkDirectorySchema, inspectNetworkSchema, NETWORK_SCHEMA_VERSION, NETWORK_TABLES };
