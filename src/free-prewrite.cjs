'use strict';

const { createHash } = require('node:crypto');
const { pricingEvidenceUrl } = require('./prewrite-quality.cjs');
const { parse } = require('parse5');
const { validateUrl, fetchPublicGrowthHtml } = require('./growth-public-html-reader.cjs');
const { isBotCheck } = require('./gsc-report/site-audit.cjs');
const { resolveTarget, editorInstructions, registerRoutes } = require('./prewrite-implementation.cjs');
const weeklyLimit = require('./free-weekly-limit.cjs');
const { ownerSessionValid } = require('./owner-session.cjs');
const aiFetch = require('./prewrite-ai-fetch.cjs');

const ROOT = '/free-pre-write';
const API = '/api/free-pre-write';
const hash = value => createHash('sha256').update(value).digest('hex');
const texts = {
  en: ['Free Pre-Write Brief', 'Website', 'Topic or customer question', 'Search country', 'Generate brief', 'Save this private URL to reopen your report.', 'Research in progress…', 'Research could not be completed.', 'Open in Free Growth', 'Copy or download this brief for External AI', 'Proof & History', 'Paste at least 200 characters of approved page text', 'Approve text', 'Implementation Report (JSON)', 'Save report', 'Confirm publication', 'Verify live page', 'Saved', 'Verification pending', 'Open an earlier report', 'Private report URL', 'Open'],
  nl: ['Gratis Pre-Write Brief', 'Website', 'Onderwerp of klantvraag', 'Land voor zoekonderzoek', 'Maak een brief', 'Bewaar deze privélink om je rapport opnieuw te openen.', 'Onderzoek loopt…', 'Het onderzoek kon niet worden afgerond.', 'Open in Free Growth', 'Kopieer of download deze brief voor externe AI', 'Bewijs en historie', 'Plak minstens 200 tekens goedgekeurde paginatekst', 'Keur tekst goed', 'Implementatierapport (JSON)', 'Sla rapport op', 'Bevestig publicatie', 'Verifieer de livepagina', 'Opgeslagen', 'Verificatie in afwachting', 'Open een eerder rapport', 'Privélink naar rapport', 'Open'],
  es: ['Brief gratuito de Pre-Write', 'Sitio web', 'Tema o pregunta del cliente', 'País de búsqueda', 'Generar brief', 'Guarda este enlace privado para volver a abrir el informe.', 'Investigación en curso…', 'No se pudo completar la investigación.', 'Abrir en Free Growth', 'Copia o descarga este brief para la IA externa', 'Evidencias e historial', 'Pega al menos 200 caracteres de texto aprobado', 'Aprobar texto', 'Informe de implementación (JSON)', 'Guardar informe', 'Confirmar publicación', 'Verificar página publicada', 'Guardado', 'Verificación pendiente', 'Abrir un informe anterior', 'Enlace privado del informe', 'Abrir']
};
// The intent follows the live Google results first; the owner corrects it afterwards, on the result (owner 2026-11-28),
// with the professional term next to the plain words.
const intentLabels = {
  en: ['Correct the search intent', 'Automatic (follows Google)', 'Informational: learn or understand', 'Commercial: compare options before buying', 'Transactional: buy, hire or use a tool', 'Navigational: find a specific website'],
  nl: ['Corrigeer de zoekintentie', 'Automatisch (volgt Google)', 'Informatief: leren of begrijpen', 'Commercieel: opties vergelijken vóór aankoop', 'Transactioneel: kopen, inhuren of een tool gebruiken', 'Navigatie: een bepaalde website vinden'],
  es: ['Corregir la intención de búsqueda', 'Automática (sigue a Google)', 'Informacional: aprender o entender', 'Comercial: comparar opciones antes de comprar', 'Transaccional: comprar, contratar o usar una herramienta', 'Navegacional: encontrar un sitio web concreto']
};
// The five AI systems, as in the Tracker (owner 2026-11-28: "ai systemen wel").
const aiEngines = ['google_aio', 'chatgpt', 'perplexity', 'claude', 'copilot'];
const aiLabels = {
  en: ['AI answers (optional)', 'Ask the question in each AI system and paste the complete answer with its sources. Without answers, Perplexity is checked automatically.', 'Question you asked the AI systems', 'Which Google source?', 'Not checked', 'Google AI Overview', 'Gemini', 'No AI Overview shown', 'Google AI Overview or Gemini', 'ChatGPT Search', 'Perplexity', 'Claude', 'Microsoft Copilot'],
  nl: ['AI-antwoorden (optioneel)', 'Stel de vraag in elk AI-systeem en plak het volledige antwoord met de bronnen. Zonder antwoorden wordt Perplexity automatisch gecontroleerd.', 'Vraag die je aan de AI-systemen stelde', 'Welke Google-bron?', 'Niet gecontroleerd', 'Google AI-overzicht', 'Gemini', 'Geen AI-overzicht getoond', 'Google AI-overzicht of Gemini', 'ChatGPT Search', 'Perplexity', 'Claude', 'Microsoft Copilot'],
  es: ['Respuestas de IA (opcional)', 'Haz la pregunta en cada sistema de IA y pega la respuesta completa con sus fuentes. Sin respuestas, Perplexity se comprueba automáticamente.', 'Pregunta que hiciste a los sistemas de IA', '¿Qué fuente de Google?', 'No comprobado', 'Google AI Overview', 'Gemini', 'No se mostró AI Overview', 'Google AI Overview o Gemini', 'ChatGPT Search', 'Perplexity', 'Claude', 'Microsoft Copilot']
};
// The exact research prompt of the Tracker Pre-Write, filled in for the question, ready to copy (owner 2026-11-28).
const promptLabels = {
  en: ['Prompt to paste into each AI system', 'Copy prompt', 'Copied. Paste it into each AI system and paste the full answer below.', 'Select the text and copy it with Ctrl+C / Cmd+C.'],
  nl: ['Prompt om in elk AI-systeem te plakken', 'Kopieer prompt', 'Gekopieerd. Plak hem in elk AI-systeem en plak het volledige antwoord hieronder.', 'Selecteer de tekst en kopieer met Ctrl+C / Cmd+C.'],
  es: ['Prompt para pegar en cada sistema de IA', 'Copiar prompt', 'Copiado. Pégalo en cada sistema de IA y pega la respuesta completa abajo.', 'Selecciona el texto y cópialo con Ctrl+C / Cmd+C.']
};
// The owner's fetch buttons, one per AI system and one for all (owner 2026-11-28). Hidden for visitors.
const fetchLabels = {
  en: ['Fetch automatically', 'Fetch all answers', 'Fetching…', 'Not connected (no API key)', 'Could not fetch', 'Fill in the question or the topic first.', 'Asks each connected AI system the question above and fills in its answer with the sources it cites. Owner only.'],
  nl: ['Automatisch ophalen', 'Alle antwoorden ophalen', 'Bezig met ophalen…', 'Niet gekoppeld (geen API-sleutel)', 'Ophalen mislukt', 'Vul eerst de vraag of het onderwerp in.', 'Stelt de vraag hierboven aan elk gekoppeld AI-systeem en vult het antwoord in met de bronnen die het noemt. Alleen voor de eigenaar.'],
  es: ['Obtener automáticamente', 'Obtener todas las respuestas', 'Obteniendo…', 'No conectado (sin clave API)', 'No se pudo obtener', 'Escribe primero la pregunta o el tema.', 'Hace la pregunta de arriba a cada sistema de IA conectado y rellena su respuesta con las fuentes que cita. Solo para el propietario.']
};
function aiFields(lang) {
  const l = aiLabels[lang];
  const p = promptLabels[lang];
  const f = fetchLabels[lang];
  const sources = ['', 'ai_overview', 'gemini', 'no_ai_overview'].map((value, index) => `<option value="${value}">${l[4 + index]}</option>`).join('');
  return `<fieldset class="ai"><legend>${l[0]}</legend><p>${l[1]}</p><label>${l[2]}<input name="ai-question" maxlength="300"></label>
    <label>${p[0]}<textarea class="ai-prompt" rows="12" readonly></textarea></label><p><button type="button" class="ai-prompt-copy">${p[1]}</button> <span class="ai-prompt-status" role="status"></span></p>
    <label>${l[3]}<select name="google-source">${sources}</select></label>
    <p class="ai-fetch-row" hidden><button type="button" class="ai-fetch-all">${f[1]}</button> <span>${f[6]}</span></p>
    ${aiEngines.map((engine, index) => `<label>${l[8 + index]}<textarea name="ai-${engine}" rows="4" maxlength="12000"></textarea></label><p class="ai-fetch-row" hidden><button type="button" class="ai-fetch" data-engine="${engine}">${f[0]}</button> <span class="ai-fetch-note" data-engine="${engine}" role="status"></span></p>`).join('')}</fieldset>`;
}
function manualEvidence(raw) {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const out = { ai_question: text(raw.ai_question, 300), google_source: ['ai_overview', 'gemini', 'no_ai_overview'].includes(raw.google_source) ? raw.google_source : '' };
  for (const engine of aiEngines) out[engine] = text(raw[engine], 12000);
  if (out.ai_question) out.ai_question_source = 'free_pre_write_owner';
  return out;
}
const intents = ['', 'informational', 'commercial', 'transactional', 'navigational'];
const busyTexts = { en: 'Two briefs are being researched right now. Try again in a few minutes.', nl: 'Er worden nu twee briefs onderzocht. Probeer het over een paar minuten opnieuw.', es: 'Ahora se están investigando dos briefs. Inténtalo de nuevo en unos minutos.' };
const dailyTexts = { en: 'Today\'s free briefs are used up. Try again tomorrow.', nl: 'De gratis briefs van vandaag zijn op. Probeer het morgen opnieuw.', es: 'Los briefs gratuitos de hoy se han agotado. Inténtalo mañana.' };
const unavailableTexts = { en: 'The brief service is temporarily unavailable. Your text is kept; try again in a moment.', nl: 'De briefdienst is tijdelijk niet beschikbaar. Je tekst blijft bewaard; probeer het zo opnieuw.', es: 'El servicio no está disponible temporalmente. Tu texto se conserva; inténtalo de nuevo en un momento.' };
// The result page as numbered steps, each saying what it is for (owner 2026-11-28: "onduidelijk approved text, waarom,
// wat moet ik dit voor gebruiken"). The brief to copy comes first, right under the decision.
const workflowTexts = {
  en: { step1: 'Step 1 · Copy or download the brief', step1Why: 'Give this to your writer or paste it into an external AI (ChatGPT, Claude, Gemini). It contains the decision, the page plan and the instructions for writing the page.',
    copy: 'Copy brief', download: 'Download (.txt)', copied: 'Copied. Paste it into your AI or send it to your writer.',
    correct: 'Optional · Correct the search intent', correctWhy: 'Only if the brief misjudged what the searcher wants. A correction makes a new version of this brief and does not use your weekly free brief.',
    step2: 'Step 2 · Approve the final page text', step2Why: 'When the page text is written and you agree with it, paste it here and approve it. ContentScale stores exactly this text, so it can later check that the live page really shows it. Nothing is published.',
    step3: 'Step 3 · Save the Implementation Report (optional)', step3Why: 'The external AI returns a short JSON report after it has made the page (the brief asks for it): what changed, and whether it is published. Paste it here as your record of the change.',
    step4: 'Step 4 · After publishing: confirm and verify', step4Why: 'Once the page is live, confirm the publication (records the date), then verify: ContentScale reads the live page and checks that your approved text is on it. The result appears under Proof & History.' },
  nl: { step1: 'Stap 1 · Kopieer of download de brief', step1Why: 'Geef deze aan je schrijver of plak hem in een externe AI (ChatGPT, Claude, Gemini). Hij bevat het besluit, het paginaplan en de instructies om de pagina te schrijven.',
    copy: 'Kopieer brief', download: 'Download (.txt)', copied: 'Gekopieerd. Plak hem in je AI of stuur hem naar je schrijver.',
    correct: 'Optioneel · Corrigeer de zoekintentie', correctWhy: 'Alleen als de brief verkeerd inschat wat de zoeker wil. Een correctie maakt een nieuwe versie van deze brief en kost je wekelijkse gratis brief niet.',
    step2: 'Stap 2 · Keur de definitieve paginatekst goed', step2Why: 'Als de paginatekst geschreven is en je ermee akkoord bent, plak je hem hier en keur je hem goed. ContentScale bewaart precies deze tekst, zodat later te controleren is dat de livepagina hem echt toont. Er wordt niets gepubliceerd.',
    step3: 'Stap 3 · Sla het implementatierapport op (optioneel)', step3Why: 'De externe AI geeft na het maken van de pagina een kort JSON-rapport terug (de brief vraagt daarom): wat er veranderd is en of het gepubliceerd is. Plak het hier als vastlegging van de wijziging.',
    step4: 'Stap 4 · Na publicatie: bevestig en verifieer', step4Why: 'Staat de pagina live, bevestig dan de publicatie (legt de datum vast) en verifieer: ContentScale leest de livepagina en controleert dat je goedgekeurde tekst erop staat. De uitkomst staat onder Bewijs en historie.' },
  es: { step1: 'Paso 1 · Copia o descarga el brief', step1Why: 'Dáselo a tu redactor o pégalo en una IA externa (ChatGPT, Claude, Gemini). Contiene la decisión, el plan de la página y las instrucciones para escribirla.',
    copy: 'Copiar brief', download: 'Descargar (.txt)', copied: 'Copiado. Pégalo en tu IA o envíaselo a tu redactor.',
    correct: 'Opcional · Corrige la intención de búsqueda', correctWhy: 'Solo si el brief juzgó mal lo que busca el usuario. Una corrección crea una nueva versión de este brief y no gasta tu brief gratuito semanal.',
    step2: 'Paso 2 · Aprueba el texto final de la página', step2Why: 'Cuando el texto esté escrito y estés de acuerdo, pégalo aquí y apruébalo. ContentScale guarda exactamente este texto para comprobar después que la página publicada lo muestra. No se publica nada.',
    step3: 'Paso 3 · Guarda el informe de implementación (opcional)', step3Why: 'La IA externa devuelve un breve informe JSON tras crear la página (el brief lo pide): qué cambió y si está publicada. Pégalo aquí como registro del cambio.',
    step4: 'Paso 4 · Tras publicar: confirma y verifica', step4Why: 'Cuando la página esté publicada, confirma la publicación (registra la fecha) y verifica: ContentScale lee la página publicada y comprueba que tu texto aprobado está en ella. El resultado aparece en Evidencias e historial.' }
};
// Shown on the form before anyone fills it in (owner 2026-11-28: "niemand hoeft te gokken").
const availabilityTexts = {
  en: { ok: (left, limit) => `Today ${left} of the ${limit} free briefs are still available. One free brief per person per week.`,
    daily: limit => `Today's ${limit} free briefs are used up, for all visitors together. You can try again tomorrow.`, owner: 'Owner mode: no limit.' },
  nl: { ok: (left, limit) => `Vandaag nog ${left} van de ${limit} gratis briefs beschikbaar. Eén gratis brief per persoon per week.`,
    daily: limit => `De ${limit} gratis briefs van vandaag zijn op, voor alle bezoekers samen. Morgen kan het weer.`, owner: 'Eigenaarsmodus: geen limiet.' },
  es: { ok: (left, limit) => `Hoy quedan ${left} de los ${limit} briefs gratuitos. Un brief gratuito por persona y semana.`,
    daily: limit => `Los ${limit} briefs gratuitos de hoy se han agotado, para todos los visitantes. Mañana se puede de nuevo.`, owner: 'Modo propietario: sin límite.' }
};
const inputErrors = {
  en: { AI_ANSWERS: 'The AI answers could not be read. Paste plain text into the answer fields.', WEBSITE: 'Enter the full website address, for example https://example.com/.',
    PRICING_URL: 'The pricing page must be a public https page on the same website as above (same domain, no ? or #). Leave the field empty if you have none.',
    LINK: 'This private link is not valid. Reload the page and try again.', TOPIC: 'Enter a topic or customer question (at most 300 characters).',
    COUNTRY: 'Enter the search country as two letters, for example ES.', LANGUAGE: 'The language or intent choice is not valid. Reload the page and try again.',
    EMAIL: 'Enter a valid e-mail address.' },
  nl: { AI_ANSWERS: 'De AI-antwoorden konden niet worden gelezen. Plak gewone tekst in de antwoordvelden.', WEBSITE: 'Vul het volledige websiteadres in, bijvoorbeeld https://voorbeeld.nl/.',
    PRICING_URL: 'De prijspagina moet een openbare https-pagina op dezelfde website zijn als hierboven (zelfde domein, zonder ? of #). Laat het veld leeg als je die niet hebt.',
    LINK: 'Deze privélink is niet geldig. Herlaad de pagina en probeer het opnieuw.', TOPIC: 'Vul een onderwerp of klantvraag in (maximaal 300 tekens).',
    COUNTRY: 'Vul het zoekland in met twee letters, bijvoorbeeld NL.', LANGUAGE: 'De taal- of intentiekeuze is niet geldig. Herlaad de pagina en probeer het opnieuw.',
    EMAIL: 'Vul een geldig e-mailadres in.' },
  es: { AI_ANSWERS: 'No se pudieron leer las respuestas de IA. Pega texto normal en los campos de respuesta.', WEBSITE: 'Escribe la dirección completa del sitio, por ejemplo https://ejemplo.es/.',
    PRICING_URL: 'La página de precios debe ser una página https pública del mismo sitio web (mismo dominio, sin ? ni #). Deja el campo vacío si no tienes ninguna.',
    LINK: 'Este enlace privado no es válido. Recarga la página e inténtalo de nuevo.', TOPIC: 'Escribe un tema o pregunta del cliente (máximo 300 caracteres).',
    COUNTRY: 'Escribe el país de búsqueda con dos letras, por ejemplo ES.', LANGUAGE: 'La elección de idioma o intención no es válida. Recarga la página e inténtalo de nuevo.',
    EMAIL: 'Escribe un email válido.' }
};
// Owner 2026-11-28: one free brief per person per week, counted on the e-mail address (and the same browser or IP).
const limitTexts = {
  en: ['E-mail address', 'One free brief per person per week. Your e-mail is only used for this limit and is not stored as text.'],
  nl: ['E-mailadres', 'Eén gratis brief per persoon per week. Je e-mailadres wordt alleen voor deze limiet gebruikt en niet als tekst opgeslagen.'],
  es: ['Email', 'Un brief gratuito por persona y semana. Tu email solo se usa para este límite y no se guarda como texto.']
};
// The waiting page follows the real research step (owner 2026-11-28: "nu weet ik niet of het werkt of niet").
const STEP_OF = { website: 1, start: 1, completion: 1, sitemap: 1, serp: 2, competitor_scrape: 3, gemini: 4, gemini_parse: 4,
  quality_gate: 5, evidence_quality_ladder: 5, link_validation: 5, fact_safety: 5, finalize: 5, persistence: 5, complete: 5 };
const stepTexts = {
  en: ['Reading your website (the sitemap is found automatically)', 'Checking Google results', 'Reading the pages that rank', 'Writing the brief with AI', 'Checking facts, links and quality', 'Step § of 5', 'Still working… this usually takes 1 to 3 minutes.'],
  nl: ['Je website lezen (de sitemap wordt vanzelf gevonden)', 'Google-resultaten bekijken', 'De pagina’s lezen die goed scoren', 'De brief schrijven met AI', 'Feiten, links en kwaliteit controleren', 'Stap § van 5', 'Bezig… dit duurt meestal 1 tot 3 minuten.'],
  es: ['Leyendo tu sitio web (el sitemap se encuentra solo)', 'Revisando los resultados de Google', 'Leyendo las páginas que posicionan', 'Escribiendo el brief con IA', 'Comprobando datos, enlaces y calidad', 'Paso § de 5', 'Trabajando… suele tardar de 1 a 3 minutos.']
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const credentials = req => /^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization') || '')?.[1];

function page(lang, result) {
  const t = texts[lang];
  const labels = intentLabels[lang];
  const intent = `<label>${labels[0]}<select name="intent">${intents.map((value, index) => `<option value="${value}">${labels[index + 1]}</option>`).join('')}</select></label>`;
  const price = {
    en: ['Public URL for prices or quote policy (optional)', 'Add a public page showing your prices or that you quote on request.', 'Repair draft with pricing evidence'],
    nl: ['Openbare URL voor prijzen of offertebeleid (optioneel)', 'Voeg een openbare pagina toe met je prijzen of de vermelding ‘op aanvraag’.', 'Herstel concept met prijsbewijs'],
    es: ['URL pública de precios o presupuestos (opcional)', 'Añade una página pública con tus precios o con la indicación de que se ofrecen bajo consulta.', 'Reparar borrador con evidencia de precios']
  }[lang];
  const priceInput = `<label>${price[0]}<input name="pricing-source" type="url" maxlength="500"></label>`;
  const steps = stepTexts[lang];
  const progress = `<section id="progress" hidden aria-live="polite"><div class="pulse" aria-hidden="true"><span></span><span></span><span></span></div>
    <p id="progress-step" class="kicker"></p><ol id="progress-list">${steps.slice(0, 5).map(x => `<li>${x}</li>`).join('')}</ol>
    <div class="bar" aria-hidden="true"><div id="progress-bar"></div></div><p id="progress-time" class="note">${steps[6]}</p></section>`;
  const w = workflowTexts[lang];
  const control = result ? `<p>${t[5]}</p><p id="status" role="status"></p>${progress}<section id="decision" hidden></section>
    <section id="handoff" hidden><h2>${w.step1}</h2><p class="note">${w.step1Why}</p>
      <p class="actions"><button type="button" id="copy-brief">${w.copy}</button> <a id="download" class="button-link" download="pre-write-brief.txt">${w.download}</a> <span id="copy-brief-status" role="status" class="note"></span></p>
      <textarea id="editor" rows="15" readonly></textarea></section>
    <form id="intent-adjust" hidden><h2>${w.correct}</h2><p class="note">${w.correctWhy}</p>${intent}${priceInput}${aiFields(lang)}<button type="submit">${labels[0]}</button> <button type="button" id="repair-pricing" hidden>${price[2]}</button></form>
    <section id="implementation" hidden>
      <h2>${w.step2}</h2><p class="note">${w.step2Why}</p>
      <label>${t[11]}<textarea id="copy" rows="5" minlength="200" maxlength="12000"></textarea></label><button id="approve" type="button">${t[12]}</button>
      <h2>${w.step3}</h2><p class="note">${w.step3Why}</p>
      <label>${t[13]}<textarea id="report" rows="7" maxlength="16000"></textarea></label><button id="save" type="button">${t[14]}</button>
      <h2>${w.step4}</h2><p class="note">${w.step4Why}</p>
      <button id="publish" type="button">${t[15]}</button> <button id="verify" type="button">${t[16]}</button></section>
    <section id="history" hidden><h2>${t[10]}</h2><div id="entries"></div><details><summary>${t[0]}</summary><pre id="research"></pre></details></section>` :
    `<p id="availability" class="note" role="status"></p><form id="intake"><label>${t[1]}<input name="website" type="url" placeholder="https://" maxlength="500" required></label>
    <label>${t[2]}<input name="keyword" maxlength="300" required></label>
    <label>${limitTexts[lang][0]}<input name="email" type="email" maxlength="200" autocomplete="email" required></label><p class="note">${limitTexts[lang][1]}</p>
    <label>${t[3]}<input name="country" value="${{en:'US',nl:'NL',es:'ES'}[lang]}" pattern="[A-Za-z]{2}" maxlength="2" required></label>
    ${priceInput}${aiFields(lang)}<button type="submit">${t[4]}</button></form><p id="status" role="status"></p>
    <form id="reopen"><h2>${t[19]}</h2><label>${t[20]}<input name="link" type="url" required></label><button>${t[21]}</button></form>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${t[0]}</title>
    <style>button{transition:transform .12s ease,box-shadow .2s ease,filter .2s ease;cursor:pointer}button:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 16px rgba(67,56,202,.28);filter:brightness(1.06)}button:active:not(:disabled){transform:translateY(0) scale(.97);box-shadow:none}button:disabled{cursor:default;opacity:.75}button[aria-busy=true]{opacity:1;cursor:progress}button[aria-busy=true]::before{content:'';display:inline-block;width:12px;height:12px;margin-right:8px;vertical-align:-2px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:pw-spin .7s linear infinite}@keyframes pw-spin{to{transform:rotate(360deg)}}.ai-prompt-copy.done,#copy-brief.done{animation:pw-pop .45s ease}@keyframes pw-pop{0%{transform:scale(1)}40%{transform:scale(1.08)}100%{transform:scale(1)}}@media (prefers-reduced-motion:reduce){button,button:hover,button:active{transition:none;transform:none}button[aria-busy=true]::before{animation-duration:2s}.ai-prompt-copy.done,#copy-brief.done{animation:none}}#progress{background:white;border:1px solid #cbd5e1;border-radius:10px;padding:20px;margin:16px 0}#progress .kicker{font-weight:700;color:#4338ca;margin:8px 0}.pulse{display:flex;gap:8px;height:18px;align-items:center}.pulse span{width:12px;height:12px;border-radius:50%;background:#4338ca;animation:pw-bounce 1.2s ease-in-out infinite}.pulse span:nth-child(2){animation-delay:.15s}.pulse span:nth-child(3){animation-delay:.3s}@keyframes pw-bounce{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}#progress-list{padding-left:22px;margin:12px 0}#progress-list li{margin:6px 0;color:#64748b}#progress-list li.done{color:#15803d}#progress-list li.done::marker{content:'✓  '}#progress-list li.now{color:#172337;font-weight:700}.bar{height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden}#progress-bar{height:100%;width:8%;border-radius:99px;transition:width .8s ease;background:linear-gradient(90deg,#4338ca,#818cf8,#4338ca);background-size:200% 100%;animation:pw-shine 1.6s linear infinite}@keyframes pw-shine{from{background-position:200% 0}to{background-position:0 0}}.note{color:#64748b;font-size:14px}#availability{margin:12px 0 0}#handoff{border:2px solid #4338ca}#handoff h2,#implementation h2,#intent-adjust h2{font-size:1.1rem;margin:18px 0 4px}#handoff h2{margin-top:0}.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.button-link{display:inline-block;padding:8px 12px;border:1px solid #1d4ed8;color:#1d4ed8;border-radius:6px;text-decoration:none;font-weight:600}#editor{width:100%;box-sizing:border-box}#availability.blocked{color:#b91c1c;font-weight:700;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px}@media (prefers-reduced-motion:reduce){.pulse span,#progress-bar{animation:none}#progress-bar{transition:none}}body{margin:0;padding:24px;background:#f5f7fc;color:#172337;font:16px system-ui}main{margin:auto;max-width:750px}form,section{background:white;border:1px solid #cbd5e1;border-radius:10px;padding:20px;margin:16px 0}label{display:block;margin:12px 0}fieldset{border:1px solid #cbd5e1;border-radius:8px;margin:12px 0}input,textarea,select{display:block;width:100%;box-sizing:border-box;padding:8px;border:1px solid #64748b;border-radius:4px;font:inherit}button{padding:8px 12px;background:#1d4ed8;color:white;border:0;border-radius:6px;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#1d4ed8}</style></head>
    <body><main><nav aria-label="Language"><a href="${ROOT}?lang=en">EN</a> · <a href="${ROOT}?lang=nl">NL</a> · <a href="${ROOT}?lang=es">ES</a></nav><h1>${t[0]}</h1>${control}</main><script>window.prewriteLabels=${JSON.stringify(t)};window.prewritePricingHelp=${JSON.stringify(price[1])};window.prewriteSteps=${JSON.stringify(steps || stepTexts[lang])};window.prewritePromptTexts=${JSON.stringify(promptLabels[lang])};window.prewriteFetchTexts=${JSON.stringify(fetchLabels[lang])};window.prewriteWorkflow=${JSON.stringify({ copied: workflowTexts[lang].copied })};</script><script src="/prewrite-ai-answer-research.js" defer></script>
    <script src="/free-prewrite.js" defer></script></body></html>`;
}

function view(row, strip) {
  const brief = strip(row.brief_json);
  let target, instructions, growth_url;
  if (['open', 'approved', 'published'].includes(row.status)) {
    target = resolveTarget(brief, row.public_site);
    if (target.mode === 'CREATE') instructions = editorInstructions(brief, row.public_site);
    else growth_url = '/free-growth?' + new URLSearchParams({
      url: target.url, query: row.keyword, lang: row.language, language: row.language,
      market: String(row.region || '').toUpperCase().replace(/^UK$/, 'GB')
    });
  }
  return { status: row.status, language: row.language, target, instructions, growth_url, brief, website: row.public_site, keyword: row.keyword, region: row.region };
}

// Site discovery (owner 2026-11-28): the homepage links, robots.txt "Sitemap:" lines, a sitemap index (Rank Math, Yoast) and
// its child sitemaps, plus pages on a sister subdomain that the site itself links to (a scanner on app.example.com).
async function discoverSite(site, { fetchHtml = fetchPublicGrowthHtml, homeReader } = {}) {
  const { sameSite } = require('./prewrite-quality.cjs');
  const home = await (homeReader || fetchHtml)(site, { redirects: 2, limit: 300000 });
  const canonical = validateUrl(home.final_url);
  if (home.status !== 200 || isBotCheck(home.html) || canonical.hostname.replace(/^www\./, '') !== new URL(site).hostname.replace(/^www\./, '')) {
    throw Error('Website unavailable');
  }
  site = canonical.origin + '/';
  const urls = new Set();
  const sister = new Set();
  const pending = [parse(home.html)];
  while (pending.length && urls.size < 500) {
    const node = pending.pop();
    const href = node.tagName === 'a' && node.attrs.find(attr => attr.name === 'href')?.value;
    if (href && !href.startsWith('#')) {
      try {
        const url = validateUrl(new URL(href, home.final_url).href);
        if (url.origin === canonical.origin && !url.search) urls.add(url.href);
        else if (!url.search && url.protocol === 'https:' && sameSite(url.href, canonical.href) && sister.size < 10) sister.add(url.href);
      } catch {}
    }
    pending.push(...(node.childNodes || []));
  }
  const { importSitemap } = require('./growth-free/sitemap-import.cjs');
  const locs = xml => [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(match => match[1].replace(/&amp;/g, '&'));
  const sameOrigin = value => { try { return new URL(value).origin === canonical.origin; } catch { return false; } };
  const read = async (url, options) => { try { return await fetchHtml(url, options); } catch { return null; } };
  const candidates = [];
  const robots = await read(new URL('/robots.txt', site).href, { redirects: 1, allowText: true, limit: 100000 });
  if (robots?.status === 200) for (const match of String(robots.html || '').matchAll(/^\s*sitemap:\s*(\S+)/gim)) if (sameOrigin(match[1])) candidates.push(match[1]);
  const defaults = [new URL('/sitemap_index.xml', site).href, new URL('/sitemap.xml', site).href, new URL('/wp-sitemap.xml', site).href];
  candidates.push(...defaults);
  const seen = new Set();
  let fromSitemaps = 0;
  const queue = [...new Set(candidates)];
  while (queue.length && seen.size < 12 && fromSitemaps < 1000) {
    const url = queue.shift();
    if (seen.has(url) || (fromSitemaps && defaults.includes(url))) continue;
    seen.add(url);
    const file = await read(url, { redirects: 2, allowSitemapXml: true, limit: 500000 });
    if (file?.status !== 200 || file.truncated || !file.html) continue;
    if (/<(?:[A-Za-z_][\w.-]*:)?sitemapindex(?:\s|>)/i.test(file.html)) {
      // Pages first, then posts; skip media, tag, author and category sitemaps.
      const children = locs(file.html).filter(sameOrigin).filter(child => !/(?:attachment|media|image|video|author|tag|category|product_cat)/i.test(child))
        .sort((a, b) => (/page/i.test(b) - /page/i.test(a)) || (/post/i.test(b) - /post/i.test(a)));
      queue.unshift(...children.slice(0, 6));
      continue;
    }
    try {
      for (const value of importSitemap({ content_base64: Buffer.from(file.html).toString('base64') }, site).urls) {
        const candidate = new URL(value);
        if (candidate.origin === canonical.origin && !candidate.search && !urls.has(candidate.href)) { urls.add(candidate.href); fromSitemaps++; }
        else if (candidate.origin === canonical.origin && !candidate.search) fromSitemaps++;
      }
    } catch {}
  }
  for (const url of sister) urls.add(url);
  return { site, urls: Array.from(urls), sitemap_urls: fromSitemaps };
}

function publicBriefData(brief) {
  return JSON.parse(JSON.stringify(brief), (key, value) =>
    /(?:^|_)(?:generation_usage|api_key|prompt|access_token)(?:_|$)/i.test(key) ? undefined : value);
}

const defaultDiscover = site => discoverSite(site, { homeReader: require('./growth-free-firecrawl-reader.cjs').createFallbackReader({ module:'FREE_PREWRITE' }) });

// The running step of a free brief, for the waiting page. Its own small table, so prewrite_briefs is not changed.
const progressReady = new WeakMap();
function ensureProgress(pool) {
  if (!progressReady.has(pool)) progressReady.set(pool, pool.query(`CREATE TABLE IF NOT EXISTS free_prewrite_progress(
    brief_id INTEGER PRIMARY KEY, progress JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(error => { progressReady.delete(pool); throw error; }));
  return progressReady.get(pool);
}
async function saveProgress(pool, briefId, stage) {
  if (!Object.hasOwn(STEP_OF, stage)) return;
  try {
    await ensureProgress(pool);
    await pool.query(`INSERT INTO free_prewrite_progress(brief_id,progress,updated_at) VALUES($1,$2,NOW())
      ON CONFLICT(brief_id) DO UPDATE SET progress=EXCLUDED.progress,updated_at=NOW()`, [briefId, { stage }]);
  } catch { /* The waiting page falls back to the general message; research continues. */ }
}
async function readProgress(pool, row) {
  let stage = 'website', elapsed = null;
  try {
    await ensureProgress(pool);
    const found = (await pool.query(`SELECT p.progress, GREATEST(0, EXTRACT(EPOCH FROM (LOCALTIMESTAMP - b.created_at)))::int AS elapsed
      FROM prewrite_briefs b LEFT JOIN free_prewrite_progress p ON p.brief_id=b.id WHERE b.id=$1`, [row.id])).rows[0];
    stage = found?.progress?.stage || stage;
    elapsed = Number.isFinite(found?.elapsed) ? found.elapsed : null;
  } catch {}
  return { stage, step: STEP_OF[stage] || 1, steps: 5, elapsed_seconds: elapsed };
}

function registerFreePrewrite(app, pool, { generate, strip = publicBriefData, discover = defaultDiscover, dailyLimit = 5, verification,
  perWeek = weeklyLimit.perWeek('FREE_PREWRITE'), fetchAiAnswer = aiFetch.fetchAiAnswer, aiEnv = process.env } = {}) {
  const privateHeaders = (req, res, next) => {
    res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer')
      .set('X-Robots-Tag', 'noindex').set('Content-Security-Policy', "frame-ancestors 'none'");
    next();
  };
  app.use([ROOT, API], privateHeaders);
  for (const path of [ROOT, ROOT + '/r']) {
    app.get(path, (req, res) => res.type('html').send(page(Object.hasOwn(texts, req.query.lang) ? req.query.lang : 'en', path.endsWith('/r'))));
  }

  async function lookup(req) {
    const key = credentials(req);
    if (!key) return null;
    return (await pool.query(`SELECT id,status,keyword,language,region,public_site,brief_json
      FROM prewrite_briefs WHERE client_id IS NULL AND public_access_hash=$1`, [hash(key)])).rows[0] || null;
  }

  async function scope(req) {
    const row = await lookup(req);
    if (!row) return { error: 'Brief not found', code: 404 };
    if (!['open', 'approved', 'published'].includes(row.status)) return { error: 'Brief unavailable', code: 409 };
    if (resolveTarget(row.brief_json, row.public_site).mode !== 'CREATE') return { error: 'Continue in Free Growth', code: 409 };
    return { briefId: row.id, clientId: null };
  }

  app.post(API, async (req, res) => {
    let site, priceSource;
    const { keyword, region, language, intentOverride = '', pricingSource } = req.body || {};
    // Every refusal says which field is wrong, in the page language (owner 2026-11-28: a bare 400 told him nothing).
    const lang = Object.hasOwn(texts, language) ? language : 'en';
    const refuse = code => res.status(400).json({ success: false, code, error: inputErrors[lang][code] || inputErrors.en[code] });
    const manualAiEvidence = manualEvidence(req.body?.manualAiEvidence);
    if (!manualAiEvidence) return refuse('AI_ANSWERS');
    try {
      const url = validateUrl(req.body?.website);
      site = url.origin + '/';
    } catch { return refuse('WEBSITE'); }
    try { priceSource = pricingEvidenceUrl(site, pricingSource); } catch { return refuse('PRICING_URL'); }
    const key = credentials(req);
    if (!key) return refuse('LINK');
    if (typeof keyword !== 'string' || !keyword.trim() || keyword.length > 300) return refuse('TOPIC');
    if (typeof region !== 'string' || !/^[a-z]{2}$/i.test(region)) return refuse('COUNTRY');
    if (typeof language !== 'string' || !Object.hasOwn(texts, language) || !intents.includes(intentOverride)) return refuse('LANGUAGE');
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().slice(0, 200) : '';
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const revisionOf = typeof req.body?.revisionOf === 'string' && /^[a-f0-9]{64}$/.test(req.body.revisionOf) ? req.body.revisionOf : null;
    if (email && !emailOk) return refuse('EMAIL');
    if (!emailOk && !revisionOf) return refuse('EMAIL');
    if (!generate || dailyLimit < 1) return res.status(503).json({ success: false, code: 'UNAVAILABLE', error: unavailableTexts[lang] });
    const owner = ownerSessionValid(req);
    let db;
    let row;
    let weekly = null;
    try {
      // The same private link sent twice is the same brief.
      if ((await pool.query('SELECT id FROM prewrite_briefs WHERE public_access_hash=$1', [hash(key)])).rows[0]) return res.status(202).json({ success: true });
      // One free brief per person per week. Correcting the intent of your own brief (revisionOf = its private key) is free,
      // up to three times. The owner is not limited.
      if (!owner && perWeek > 0) {
        let rootRef = null;
        if (revisionOf) {
          const previous = (await pool.query('SELECT id,public_site,keyword FROM prewrite_briefs WHERE public_access_hash=$1 AND client_id IS NULL', [hash(revisionOf)])).rows[0];
          if (previous && previous.public_site === site && previous.keyword === keyword.trim()) rootRef = 'prewrite:' + previous.id;
        }
        weekly = await weeklyLimit.reserve(pool, { tool: 'FREE_PREWRITE', id: weeklyLimit.identity(req, res, { email }), limit: perWeek, rootRef });
        if (!weekly.ok) {
          return res.status(429).json({ success: false, code: 'WEEKLY_LIMIT', retry_at: weekly.retry_at,
            error: weeklyLimit.limitMessage('FREE_PREWRITE', weekly.limit, weekly.retry_at, language, { contactUrl: process.env.GROWTH_FREE_CONTACT_URL || '' }) });
        }
        if (!weekly.correction && !emailOk) { await weeklyLimit.refund(pool, weekly.usage_id); weekly = null; return refuse('EMAIL'); }
      }
      db = await pool.connect();
      await db.query('BEGIN');
      await db.query("SELECT pg_advisory_xact_lock(hashtext('free-prewrite-generation'))");
      const existing = (await db.query('SELECT id FROM prewrite_briefs WHERE public_access_hash=$1', [hash(key)])).rows[0];
      if (existing) {
        await db.query('COMMIT');
        if (weekly) await weeklyLimit.refund(pool, weekly.usage_id).catch(() => {});
        return res.status(202).json({ success: true });
      }
      const { rows: [quota] } = await db.query(`SELECT COUNT(*) FILTER (
        WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC'))::int AS daily,
        COUNT(*) FILTER (WHERE status='generating' AND created_at >= NOW() - INTERVAL '15 minutes')::int AS active
        FROM prewrite_briefs WHERE public_access_hash IS NOT NULL`);
      if ((!owner && quota.daily >= dailyLimit) || quota.active >= 2) {
        await db.query('ROLLBACK');
        if (weekly) await weeklyLimit.refund(pool, weekly.usage_id).catch(() => {});
        const busyNow = quota.active >= 2;
        return res.status(429).json({ success: false, code: busyNow ? 'BUSY' : 'DAILY_TOTAL', error: (busyNow ? busyTexts : dailyTexts)[lang] });
      }
      row = (await db.query(`INSERT INTO prewrite_briefs (keyword,language,region,brief_json,status,public_site,public_access_hash)
        VALUES ($1,$2,$3,'{}','generating',$4,$5) RETURNING id`, [keyword.trim(), language, region.toLowerCase(), site, hash(key)])).rows[0];
      await db.query('COMMIT');
    } catch (error) {
      if (db) await db.query('ROLLBACK').catch(() => {});
      if (weekly) await weeklyLimit.refund(pool, weekly.usage_id).catch(() => {});
      console.error('[free-prewrite]', error.code || error.name);
      return res.status(503).json({ success: false, code: 'UNAVAILABLE', error: unavailableTexts[lang] });
    } finally { db?.release(); }
    if (weekly) await weeklyLimit.attach(pool, weekly.usage_id, 'prewrite:' + row.id).catch(() => {});
    res.status(202).json({ success: true });
    const stage = name => saveProgress(pool, row.id, name);
    try {
      await stage('website');
      const discovered = await discover(site);
      if (discovered.site !== site) {
        await pool.query("UPDATE prewrite_briefs SET public_site=$2 WHERE id=$1 AND status='generating'", [row.id, discovered.site]);
      }
      await generate({ id: row.id, site: discovered.site, urls: discovered.urls, sitemapUrls: discovered.sitemap_urls || 0, keyword: keyword.trim(), language, region: region.toLowerCase(), intentOverride, pricingSource: priceSource, manualAiEvidence, stage });
    } catch (error) {
      console.warn('[free-prewrite] generation failed', error.code || error.name);
    } finally {
      const failed = await pool.query("UPDATE prewrite_briefs SET status='failed' WHERE id=$1 AND status='generating'", [row.id]).catch(() => null);
      // A brief that could not be made is given back.
      if (failed?.rowCount && weekly) await weeklyLimit.refund(pool, weekly.usage_id).catch(() => {});
    }
  });
  // The owner fetches the answer of each AI system for the question (owner 2026-11-28: "per vraag moet ik de search in AI
  // kunnen opvragen"). Owner only: every call is a paid API call. A visitor keeps pasting answers by hand.
  app.get(API + '/ai-answer/engines', (req, res) => {
    if (!ownerSessionValid(req)) return res.json({ owner: false });
    res.json({ owner: true, engines: aiFetch.configuredEngines(aiEnv) });
  });
  app.post(API + '/ai-answer', async (req, res) => {
    if (!ownerSessionValid(req)) return res.status(403).json({ success: false, code: 'OWNER_ONLY' });
    const { engine, question, language = '', country = '' } = req.body || {};
    if (!aiFetch.ENGINES.includes(engine)) return res.status(400).json({ success: false, code: 'ENGINE' });
    if (typeof question !== 'string' || !question.trim() || question.length > 300) return res.status(400).json({ success: false, code: 'QUESTION' });
    const out = await fetchAiAnswer(engine, question.trim(), { env: aiEnv,
      language: /^[a-z]{2}$/i.test(language) ? language.toLowerCase() : '', country: /^[a-z]{2}$/i.test(country) ? country.toLowerCase() : '' });
    const ok = out && (out.status === 'SUCCESS' || out.status === 'NO_AI_OVERVIEW');
    res.status(ok ? 200 : out && out.status === 'NOT_CONFIGURED' ? 409 : 502).json({ success: !!ok, engine, status: out && out.status,
      text: ok ? String(out.text || '') : '', google_source: out && out.google_source || '', provider: out && out.provider || '', note: out && out.note || '' });
  });
  app.get(API + '/availability', async (req, res) => {
    const lang = Object.hasOwn(texts, req.query.lang) ? req.query.lang : 'en';
    const t = availabilityTexts[lang];
    try {
      const { rows: [quota] } = await pool.query(`SELECT COUNT(*) FILTER (
        WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC'))::int AS daily,
        COUNT(*) FILTER (WHERE status='generating' AND created_at >= NOW() - INTERVAL '15 minutes')::int AS active
        FROM prewrite_briefs WHERE public_access_hash IS NOT NULL`);
      const now = new Date();
      const resets = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
      const left = Math.max(0, dailyLimit - quota.daily);
      const owner = ownerSessionValid(req);
      const base = { success: true, daily_limit: dailyLimit, daily_left: left, daily_resets_at: resets, owner };
      if (quota.active >= 2) return res.json({ ...base, can_start: false, reason: 'BUSY', message: busyTexts[lang] });
      if (owner) return res.json({ ...base, can_start: true, reason: null, message: t.owner });
      if (left <= 0) return res.json({ ...base, can_start: false, reason: 'DAILY_TOTAL', message: t.daily(dailyLimit) });
      if (perWeek > 0) {
        const week = await weeklyLimit.peek(pool, { tool: 'FREE_PREWRITE', id: weeklyLimit.identity(req, res, {}), limit: perWeek });
        if (!week.ok) return res.json({ ...base, can_start: false, reason: 'WEEKLY_LIMIT', weekly_retry_at: week.retry_at,
          message: weeklyLimit.limitMessage('FREE_PREWRITE', week.limit, week.retry_at, lang, { contactUrl: process.env.GROWTH_FREE_CONTACT_URL || '' }) });
      }
      res.json({ ...base, can_start: true, reason: null, message: t.ok(left, dailyLimit) });
    } catch {
      res.status(503).json({ success: false, code: 'UNAVAILABLE', error: unavailableTexts[lang] });
    }
  });
  app.get(API + '/result', async (req, res) => {
    try {
      if (!credentials(req)) return res.status(404).json({ success: false });
      await pool.query(`UPDATE prewrite_briefs SET status='failed' WHERE public_access_hash=$1
        AND status='generating' AND created_at < NOW() - INTERVAL '15 minutes'`, [hash(credentials(req))]);
      const row = await lookup(req);
      if (!row) return res.status(404).json({ success: false });
      const progress = row.status === 'generating' ? await readProgress(pool, row) : undefined;
      res.json({ success: true, ...view(row, strip), ...(progress ? { progress } : {}) });
    } catch {
      res.status(503).json({ success: false });
    }
  });
  app.post(API + '/approve', async (req, res) => {
    try {
      const access = await scope(req);
      if (access.error) return res.status(access.code).json({ success: false });
      const text = req.body?.text;
      if (typeof text !== 'string' || text.trim().length < 200 || text.length > 12000) return res.status(400).json({ success: false });
      const approved = await pool.query(`UPDATE prewrite_briefs SET status='approved',approved_at=NOW(),specialist_html=$2
        WHERE id=$1 AND client_id IS NULL AND status IN ('open','approved')`, [access.briefId, '<p>' + esc(text.trim()) + '</p>']);
      res.status(approved.rowCount ? 200 : 409).json({ success: Boolean(approved.rowCount) });
    } catch {
      res.status(503).json({ success: false });
    }
  });
  registerRoutes(app, pool, (_token, _id, req) => scope(req), {
    ...verification, publicPath: API,
    resolveRepair: async (_token, _id, req) => {
      const row = await lookup(req);
      return row ? { briefId: row.id, clientId: null } : { code: 404, error: 'Brief not found' };
    }
  });
}

async function resolveGrowthSource(pool, key, url, query) {
  if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) return null;
  const { rows: [row] } = await pool.query(`SELECT id,brief_json,public_site,keyword
    FROM prewrite_briefs WHERE public_access_hash=$1 AND client_id IS NULL AND status='open'`, [hash(key)]);
  if (!row || row.keyword !== query) return null;
  const target = resolveTarget(row.brief_json, row.public_site);
  return target.mode !== 'CREATE' && target.url === url ? row.id : null;
}

async function sourceForGrowth(pool, id, url, query) {
  const { rows: [row] } = await pool.query(`SELECT brief_json,public_site,keyword,created_at
    FROM prewrite_briefs WHERE id=$1 AND public_access_hash IS NOT NULL AND client_id IS NULL AND status='open'`, [id]);
  if (!row || row.keyword !== query) return null;
  const target = resolveTarget(row.brief_json, row.public_site);
  return target.mode !== 'CREATE' && target.url === url
    ? { target, recorded_at: row.created_at, brief: publicBriefData(row.brief_json) } : null;
}

module.exports = { registerFreePrewrite, resolveGrowthSource, sourceForGrowth, discoverSite };
