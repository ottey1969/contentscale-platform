'use strict';
// Texts of the free rank tracker in English, Dutch and Spanish (the languages of the ContentScale sites).
// Another language falls back to English. Positions are shown as measured; nothing is rounded up or estimated.
const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const T = {
  en: {
    cMark: 'I have changed this page', cUndo: 'undo', cSaved: 'Noted. We follow this keyword from today’s position.',
    cWaiting: (d, p, n, c) => 'You changed this page on ' + d + ' (position ' + p + ' that day). Google often needs 2–6 weeks to process a change. ' + (c ? 'Last check: position ' + (n == null ? 'not found' : n) + '. ' : 'No new check yet. ') + 'As long as it does not rise, this stays your best opportunity.',
    cGrowing: (d, p, n) => 'Up from position ' + p + ' to ' + n + ' since your change on ' + d + '. It is still your best opportunity: a few more places put it in the top 3.',
    cNoGrowth: (d, p, n, w) => w + ' weeks after your change on ' + d + ' there is no growth yet (position ' + p + ' → ' + (n == null ? 'not found' : n) + '). Run the Growth check again: the pages above you may have changed too.',
    cRow: (d, p) => 'changed on ' + d + ' (position ' + p + ' then)', cAgain: 'Run the free Growth check again',
    gChip: (p, i) => 'pos. ' + p + ' · ' + i + ' impr.',
    gTitle: 'Search Console (optional)', gLead: 'Add your real clicks, impressions and average position from Google Search Console. No Google sign-in: you upload the export.',
    gHow: 'In Search Console: Performance → optionally a filter Country = the country you track → Export → Download CSV. Upload the ZIP here.',
    gUpload: 'Upload Search Console export', gDelete: 'Remove Search Console data', gPeriod: (a, b) => 'Period ' + a + ' – ' + b, gCountry: c => 'Country filter: ' + c,
    gAllCountries: 'All countries: the export has no country filter, so the numbers are not only for the country you track.', gPage: p => 'Filtered on one page (' + p + '): the numbers are for that page only.',
    gRow: (c, i, p) => 'Search Console: ' + c + ' clicks · ' + i + ' impressions' + (p ? ' · avg. position ' + p : ''), gTotals: (c, i) => c + ' clicks and ' + i + ' impressions in total',
    gOppTitle: 'Opportunities from Search Console', gOppLead: 'Search terms that already get impressions with an average position of 4–20: just outside the top. Track one to follow it every week.',
    gOther: host => 'This export is of another website. In Search Console, choose the property of ' + host + ' and export again.', gSaved: 'Saved.', gNone: 'No export uploaded yet.',
    bTitle: 'Your best opportunity now', bText: (kw, pos) => '“' + kw + '” is at position ' + pos + ' in Google. A few places higher puts it in front of many more people.',
    bGsc: (i, c) => 'Search Console: ' + i + ' impressions and ' + c + ' clicks in the period.', bCta: 'Improve this page with the free Growth check',
    bTip: 'The Growth check compares your page with the pages above you. There you can also upload a Search Console export filtered on this page.',
    dSuggest: 'Google also suggests these searches; add them on your dashboard with one click:',
    trend: 'Trend', best: n => 'best ' + n, top3: 'Top 3 in Google', growthFor: 'Improve this page with the free Growth check',
    sTitle: 'Keywords Google suggests', sLead: 'Google shows these related searches and questions next to your results. Add one with a click; it is checked in the next round.',
    sAdd: 'Add', sFull: n => 'You track ' + n + ' keywords, the maximum. Remove one above to add a suggestion.', sAdded: 'Added; the first check runs now.',
    failed: (why, when) => 'last attempt failed (' + why + '); next try ' + when,
    noProvider: 'Checks are not running yet: the Google search connection is not set up on the server. Your keywords are saved and will be checked as soon as it is.',
    aSubject: 'Your free rank tracker link', aIntro: host => 'You already track ' + esc(host) + '. Open your dashboard to see your positions or change your keywords.', aButton: 'Open your dashboard',
    title: 'Free rank tracker', lead: 'Track where your website ranks in Google for up to 10 keywords, in the country you choose. Checked automatically every week; you get an e-mail when something changes.',
    email: 'Your e-mail', site: 'Your website', country: 'Country', language: 'Search language', keywords: 'Keywords (one per line, up to 10)',
    consent: 'Also send me occasional tips about ranking and AI search (optional).', submit: 'Start tracking',
    how: 'How it works', how1: 'We check the Google results for each keyword in the country and language you chose, without personal settings.',
    how2: 'We look through the top 30. Your best position counts; if you are not there, we say “not in the top 30”.',
    how3: 'Every week a new check. One e-mail per week with your positions and what changed.',
    note: 'A position is a snapshot of Google at that moment. Positions move a little every day; look at the trend over several weeks.',
    sent: 'Check your inbox: we sent a link to confirm your e-mail. Tracking starts as soon as you click it.',
    errEmail: 'Enter a valid e-mail address.', errKeywords: 'Enter at least one keyword.', errLimit: 'Too many sign-ups from this connection today. Try again tomorrow.',
    errEmailOff: 'E-mail is not available right now, so we cannot send the confirmation link. Try again later.',
    otherEngine: e => 'In this country many people search with ' + e + ' instead of Google; a Google position says less here.',
    dash: 'Your rankings', kw: 'Keyword', pos: 'Position', change: 'Change', page: 'Your page', checked: 'Checked', notTop: n => 'not in top ' + n, noResults: 'Google showed no results', notShown: n => 'not found in the ' + n + ' results Google showed',
    pending: 'first check is running', next: 'Next check', addKw: 'Keywords (up to 10, one per line)', save: 'Save keywords',
    stop: 'Stop e-mails', forget: 'Delete my data', forgetConfirm: 'Delete your account and all positions? This cannot be undone.',
    upsell: 'Not on page 1 yet? The free Growth check compares your page with the pages that do rank and says what is missing.',
    upsellLink: 'Run the free Growth check',
    vSubject: 'Confirm your free rank tracker', vIntro: host => 'Click the button to start tracking ' + esc(host) + ' in Google. The first check runs right away.', vButton: 'Confirm and start',
    vIgnore: 'Did not sign up? Ignore this e-mail; nothing happens without a click.',
    dSubject: host => 'Your Google positions for ' + host, dIntro: (host, c) => 'Your weekly check of ' + esc(host) + ' in Google (' + esc(c) + '):',
    dOpen: 'Open your dashboard', dStop: 'Stop these e-mails',
    ch: { FIRST: 'first check', ENTERED_PAGE_ONE: 'now on page 1', LEFT_PAGE_ONE: 'dropped off page 1', ENTERED_RESULTS: 'now in the top 30', LEFT_RESULTS: 'no longer in the top 30', UP: 'up', DOWN: 'down', OTHER_PAGE: 'another page of yours now ranks' },
  },
  nl: {
    cMark: 'Ik heb deze pagina aangepast', cUndo: 'ongedaan maken', cSaved: 'Genoteerd. We volgen dit zoekwoord vanaf de positie van vandaag.',
    cWaiting: (d, p, n, c) => 'Je hebt deze pagina op ' + d + ' aangepast (positie ' + p + ' op die dag). Google heeft vaak 2–6 weken nodig om een aanpassing te verwerken. ' + (c ? 'Laatste meting: positie ' + (n == null ? 'niet gevonden' : n) + '. ' : 'Nog geen nieuwe meting. ') + 'Zolang hij niet stijgt, blijft dit je beste kans.',
    cGrowing: (d, p, n) => 'Gestegen van positie ' + p + ' naar ' + n + ' sinds je aanpassing op ' + d + '. Het blijft je beste kans: nog een paar plekken en je staat in de top 3.',
    cNoGrowth: (d, p, n, w) => w + ' weken na je aanpassing op ' + d + ' nog geen groei (positie ' + p + ' → ' + (n == null ? 'niet gevonden' : n) + '). Doe de Growth-check opnieuw: ook de pagina’s boven je kunnen veranderd zijn.',
    cRow: (d, p) => 'aangepast op ' + d + ' (toen positie ' + p + ')', cAgain: 'Doe de gratis Growth-check opnieuw',
    gChip: (p, i) => 'pos. ' + p + ' · ' + i + ' vert.',
    gTitle: 'Search Console (optioneel)', gLead: 'Voeg je echte klikken, vertoningen en gemiddelde positie uit Google Search Console toe. Zonder Google-login: je uploadt de export.',
    gHow: 'In Search Console: Prestaties → eventueel filter Land = het land dat je volgt → Exporteren → CSV downloaden. Upload de ZIP hier.',
    gUpload: 'Search Console-export uploaden', gDelete: 'Search Console-gegevens verwijderen', gPeriod: (a, b) => 'Periode ' + a + ' – ' + b, gCountry: c => 'Landfilter: ' + c,
    gAllCountries: 'Alle landen: de export heeft geen landfilter, dus de cijfers gelden niet alleen voor het land dat je volgt.', gPage: p => 'Gefilterd op één pagina (' + p + '): de cijfers gelden alleen voor die pagina.',
    gRow: (c, i, p) => 'Search Console: ' + c + ' klikken · ' + i + ' vertoningen' + (p ? ' · gem. positie ' + p : ''), gTotals: (c, i) => c + ' klikken en ' + i + ' vertoningen in totaal',
    gOppTitle: 'Kansen uit Search Console', gOppLead: 'Zoektermen die al vertoningen krijgen met een gemiddelde positie van 4–20: net buiten de top. Volg er een om hem elke week te meten.',
    gOther: host => 'Deze export is van een andere website. Kies in Search Console de property van ' + host + ' en exporteer opnieuw.', gSaved: 'Opgeslagen.', gNone: 'Nog geen export geüpload.',
    bTitle: 'Je beste kans nu', bText: (kw, pos) => '“' + kw + '” staat op positie ' + pos + ' in Google. Een paar plekken hoger zien veel meer mensen je.',
    bGsc: (i, c) => 'Search Console: ' + i + ' vertoningen en ' + c + ' klikken in de periode.', bCta: 'Verbeter deze pagina met de gratis Growth-check',
    bTip: 'De Growth-check vergelijkt je pagina met de pagina’s boven je. Daar kun je ook een Search Console-export uploaden die op deze pagina is gefilterd.',
    dSuggest: 'Google stelt ook deze zoekopdrachten voor; voeg ze met één klik toe op je overzicht:',
    trend: 'Verloop', best: n => 'beste ' + n, top3: 'Top 3 in Google', growthFor: 'Verbeter deze pagina met de gratis Growth-check',
    sTitle: 'Zoekwoorden die Google voorstelt', sLead: 'Google toont deze verwante zoekopdrachten en vragen naast je resultaten. Voeg er een toe met één klik; die wordt in de volgende ronde gemeten.',
    sAdd: 'Toevoegen', sFull: n => 'Je volgt ' + n + ' zoekwoorden, het maximum. Haal er hierboven een weg om een voorstel toe te voegen.', sAdded: 'Toegevoegd; de eerste meting start nu.',
    failed: (why, when) => 'laatste poging mislukt (' + why + '); nieuwe poging ' + when,
    noProvider: 'De metingen draaien nog niet: de koppeling met Google is op de server nog niet ingesteld. Je zoekwoorden zijn opgeslagen en worden gemeten zodra die er is.',
    aSubject: 'De link naar je gratis rank tracker', aIntro: host => 'Je volgt ' + esc(host) + ' al. Open je overzicht om je posities te zien of je zoekwoorden aan te passen.', aButton: 'Open je overzicht',
    title: 'Gratis rank tracker', lead: 'Volg waar je website in Google staat voor maximaal 10 zoekwoorden, in het land dat je kiest. Elke week automatisch gecontroleerd; je krijgt een e-mail als er iets verandert.',
    email: 'Je e-mailadres', site: 'Je website', country: 'Land', language: 'Zoektaal', keywords: 'Zoekwoorden (één per regel, maximaal 10)',
    consent: 'Stuur me af en toe tips over ranken en AI-zoeken (optioneel).', submit: 'Begin met volgen',
    how: 'Zo werkt het', how1: 'We controleren de Google-resultaten voor elk zoekwoord in het land en de taal die je kiest, zonder persoonlijke instellingen.',
    how2: 'We kijken in de top 30. Je beste positie telt; sta je er niet in, dan zeggen we “niet in de top 30”.',
    how3: 'Elke week een nieuwe meting. Eén e-mail per week met je posities en wat er veranderde.',
    note: 'Een positie is een momentopname van Google. Posities schommelen elke dag een beetje; kijk naar de trend over meerdere weken.',
    sent: 'Kijk in je inbox: we stuurden een link om je e-mailadres te bevestigen. Het volgen begint zodra je erop klikt.',
    errEmail: 'Vul een geldig e-mailadres in.', errKeywords: 'Vul minstens één zoekwoord in.', errLimit: 'Vandaag te veel aanmeldingen vanaf deze verbinding. Probeer het morgen opnieuw.',
    errEmailOff: 'E-mail is nu niet beschikbaar, dus we kunnen de bevestigingslink niet sturen. Probeer het later opnieuw.',
    otherEngine: e => 'In dit land zoeken veel mensen met ' + e + ' in plaats van Google; een Google-positie zegt hier minder.',
    dash: 'Je posities', kw: 'Zoekwoord', pos: 'Positie', change: 'Verandering', page: 'Je pagina', checked: 'Gemeten', notTop: n => 'niet in top ' + n, noResults: 'Google toonde geen resultaten', notShown: n => 'niet gevonden in de ' + n + ' resultaten die Google toonde',
    pending: 'eerste meting loopt', next: 'Volgende meting', addKw: 'Zoekwoorden (maximaal 10, één per regel)', save: 'Zoekwoorden opslaan',
    stop: 'Stop e-mails', forget: 'Verwijder mijn gegevens', forgetConfirm: 'Je account en alle posities verwijderen? Dit kan niet ongedaan worden gemaakt.',
    upsell: 'Nog niet op pagina 1? De gratis Growth-check vergelijkt je pagina met de pagina’s die wel ranken en zegt wat er ontbreekt.',
    upsellLink: 'Doe de gratis Growth-check',
    vSubject: 'Bevestig je gratis rank tracker', vIntro: host => 'Klik op de knop om ' + esc(host) + ' in Google te gaan volgen. De eerste meting start meteen.', vButton: 'Bevestigen en starten',
    vIgnore: 'Niet aangemeld? Negeer deze e-mail; zonder klik gebeurt er niets.',
    dSubject: host => 'Je Google-posities voor ' + host, dIntro: (host, c) => 'Je wekelijkse meting van ' + esc(host) + ' in Google (' + esc(c) + '):',
    dOpen: 'Open je overzicht', dStop: 'Stop deze e-mails',
    ch: { FIRST: 'eerste meting', ENTERED_PAGE_ONE: 'nu op pagina 1', LEFT_PAGE_ONE: 'van pagina 1 af', ENTERED_RESULTS: 'nu in de top 30', LEFT_RESULTS: 'niet meer in de top 30', UP: 'gestegen', DOWN: 'gedaald', OTHER_PAGE: 'er rankt nu een andere pagina van je' },
  },
  es: {
    cMark: 'He modificado esta página', cUndo: 'deshacer', cSaved: 'Anotado. Seguimos esta palabra clave desde la posición de hoy.',
    cWaiting: (d, p, n, c) => 'Modificaste esta página el ' + d + ' (posición ' + p + ' ese día). Google suele necesitar de 2 a 6 semanas para procesar un cambio. ' + (c ? 'Última comprobación: posición ' + (n == null ? 'no encontrada' : n) + '. ' : 'Aún no hay una nueva comprobación. ') + 'Mientras no suba, sigue siendo tu mejor oportunidad.',
    cGrowing: (d, p, n) => 'Ha subido de la posición ' + p + ' a la ' + n + ' desde tu cambio del ' + d + '. Sigue siendo tu mejor oportunidad: unos puestos más y estás en el top 3.',
    cNoGrowth: (d, p, n, w) => w + ' semanas después de tu cambio del ' + d + ' aún no hay crecimiento (posición ' + p + ' → ' + (n == null ? 'no encontrada' : n) + '). Vuelve a hacer el análisis Growth: las páginas que están por encima también pueden haber cambiado.',
    cRow: (d, p) => 'modificada el ' + d + ' (entonces posición ' + p + ')', cAgain: 'Vuelve a hacer el análisis Growth gratuito',
    gChip: (p, i) => 'pos. ' + p + ' · ' + i + ' impr.',
    gTitle: 'Search Console (opcional)', gLead: 'Añade tus clics, impresiones y posición media reales de Google Search Console. Sin iniciar sesión en Google: subes la exportación.',
    gHow: 'En Search Console: Rendimiento → si quieres, filtro País = el país que sigues → Exportar → Descargar CSV. Sube aquí el ZIP.',
    gUpload: 'Subir exportación de Search Console', gDelete: 'Borrar datos de Search Console', gPeriod: (a, b) => 'Periodo ' + a + ' – ' + b, gCountry: c => 'Filtro de país: ' + c,
    gAllCountries: 'Todos los países: la exportación no tiene filtro de país, así que las cifras no son solo del país que sigues.', gPage: p => 'Filtrada por una página (' + p + '): las cifras son solo de esa página.',
    gRow: (c, i, p) => 'Search Console: ' + c + ' clics · ' + i + ' impresiones' + (p ? ' · posición media ' + p : ''), gTotals: (c, i) => c + ' clics y ' + i + ' impresiones en total',
    gOppTitle: 'Oportunidades de Search Console', gOppLead: 'Búsquedas que ya tienen impresiones con una posición media de 4–20: justo fuera del top. Sigue una para medirla cada semana.',
    gOther: host => 'Esta exportación es de otra web. En Search Console elige la propiedad de ' + host + ' y exporta de nuevo.', gSaved: 'Guardado.', gNone: 'Aún no has subido ninguna exportación.',
    bTitle: 'Tu mejor oportunidad ahora', bText: (kw, pos) => '«' + kw + '» está en la posición ' + pos + ' en Google. Unos puestos más arriba te ve mucha más gente.',
    bGsc: (i, c) => 'Search Console: ' + i + ' impresiones y ' + c + ' clics en el periodo.', bCta: 'Mejora esta página con el análisis Growth gratuito',
    bTip: 'El análisis Growth compara tu página con las que están por encima. Allí también puedes subir una exportación de Search Console filtrada por esa página.',
    dSuggest: 'Google también sugiere estas búsquedas; añádelas con un clic en tu panel:',
    trend: 'Evolución', best: n => 'mejor ' + n, top3: 'Top 3 en Google', growthFor: 'Mejora esta página con el análisis Growth gratuito',
    sTitle: 'Palabras clave que sugiere Google', sLead: 'Google muestra estas búsquedas relacionadas y preguntas junto a tus resultados. Añade una con un clic; se comprueba en la siguiente ronda.',
    sAdd: 'Añadir', sFull: n => 'Sigues ' + n + ' palabras clave, el máximo. Quita una arriba para añadir una sugerencia.', sAdded: 'Añadida; la primera comprobación empieza ahora.',
    failed: (why, when) => 'el último intento falló (' + why + '); nuevo intento ' + when,
    noProvider: 'Las comprobaciones aún no funcionan: la conexión con Google no está configurada en el servidor. Tus palabras clave están guardadas y se comprobarán en cuanto lo esté.',
    aSubject: 'El enlace a tu rastreador de posiciones gratuito', aIntro: host => 'Ya sigues ' + esc(host) + '. Abre tu panel para ver tus posiciones o cambiar tus palabras clave.', aButton: 'Abrir tu panel',
    title: 'Rastreador de posiciones gratuito', lead: 'Sigue en qué posición aparece tu web en Google para hasta 10 palabras clave, en el país que elijas. Se comprueba automáticamente cada semana y recibes un e-mail cuando algo cambia.',
    email: 'Tu e-mail', site: 'Tu web', country: 'País', language: 'Idioma de búsqueda', keywords: 'Palabras clave (una por línea, hasta 10)',
    consent: 'Envíame de vez en cuando consejos sobre posicionamiento y búsqueda con IA (opcional).', submit: 'Empezar a seguir',
    how: 'Cómo funciona', how1: 'Comprobamos los resultados de Google para cada palabra clave en el país y el idioma que elijas, sin ajustes personales.',
    how2: 'Revisamos el top 30. Cuenta tu mejor posición; si no estás, lo indicamos como “fuera del top 30”.',
    how3: 'Cada semana una nueva comprobación. Un e-mail semanal con tus posiciones y lo que ha cambiado.',
    note: 'Una posición es una foto de Google en ese momento. Las posiciones se mueven un poco cada día; fíjate en la tendencia de varias semanas.',
    sent: 'Revisa tu bandeja de entrada: te enviamos un enlace para confirmar tu e-mail. El seguimiento empieza en cuanto hagas clic.',
    errEmail: 'Introduce un e-mail válido.', errKeywords: 'Introduce al menos una palabra clave.', errLimit: 'Demasiados registros desde esta conexión hoy. Inténtalo mañana.',
    errEmailOff: 'El e-mail no está disponible ahora, así que no podemos enviar el enlace de confirmación. Inténtalo más tarde.',
    otherEngine: e => 'En este país mucha gente busca con ' + e + ' en lugar de Google; una posición en Google dice menos aquí.',
    dash: 'Tus posiciones', kw: 'Palabra clave', pos: 'Posición', change: 'Cambio', page: 'Tu página', checked: 'Comprobado', notTop: n => 'fuera del top ' + n, noResults: 'Google no mostró resultados', notShown: n => 'no aparece en los ' + n + ' resultados que mostró Google',
    pending: 'primera comprobación en curso', next: 'Próxima comprobación', addKw: 'Palabras clave (hasta 10, una por línea)', save: 'Guardar palabras clave',
    stop: 'Dejar de recibir e-mails', forget: 'Borrar mis datos', forgetConfirm: '¿Borrar tu cuenta y todas las posiciones? No se puede deshacer.',
    upsell: '¿Aún no estás en la página 1? El análisis Growth gratuito compara tu página con las que sí posicionan y te dice qué falta.',
    upsellLink: 'Haz el análisis Growth gratuito',
    vSubject: 'Confirma tu rastreador de posiciones gratuito', vIntro: host => 'Haz clic en el botón para empezar a seguir ' + esc(host) + ' en Google. La primera comprobación empieza enseguida.', vButton: 'Confirmar y empezar',
    vIgnore: '¿No te has registrado? Ignora este e-mail; sin un clic no pasa nada.',
    dSubject: host => 'Tus posiciones en Google para ' + host, dIntro: (host, c) => 'Tu comprobación semanal de ' + esc(host) + ' en Google (' + esc(c) + '):',
    dOpen: 'Abrir tu panel', dStop: 'Dejar de recibir estos e-mails',
    ch: { FIRST: 'primera comprobación', ENTERED_PAGE_ONE: 'ahora en la página 1', LEFT_PAGE_ONE: 'fuera de la página 1', ENTERED_RESULTS: 'ahora en el top 30', LEFT_RESULTS: 'ya no está en el top 30', UP: 'sube', DOWN: 'baja', OTHER_PAGE: 'ahora posiciona otra página tuya' },
  },
};
const langOf = l => (T[String(l || '').slice(0, 2).toLowerCase()] ? String(l).slice(0, 2).toLowerCase() : 'en');
const t = l => T[langOf(l)];

function positionText(r, L) {
  if (!r) return '—';
  if (r.status === 'FOUND') return String(r.position);
  if (r.status === 'NOT_IN_RESULTS' && r.depth === 0) return L.noResults;
  if (r.status === 'NOT_IN_RESULTS') return r.all_results_shown || (r.depth && r.depth < 30) ? L.notShown(r.depth) : L.notTop(r.depth || 30);
  return '—';
}
function changeText(c, L) {
  if (!c) return '';
  const word = L.ch[c.kind] || '';
  return (c.from != null && c.to != null && c.kind !== 'FIRST') ? word + ' (' + c.from + ' → ' + c.to + ')' : word;
}

function verifyEmail(lang, { host, link }) {
  const L = t(lang);
  return { subject: L.vSubject, html: '<p>' + L.vIntro(host) + '</p><p><a href="' + esc(link) + '" style="display:inline-block;background:#6d28d9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">' + esc(L.vButton) + '</a></p><p style="color:#666;font-size:13px">' + esc(L.vIgnore) + '</p>' };
}

function accessEmail(lang, { host, link }) {
  const L = t(lang);
  return { subject: L.aSubject, html: '<p>' + L.aIntro(host) + '</p><p><a href="' + esc(link) + '" style="display:inline-block;background:#6d28d9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">' + esc(L.aButton) + '</a></p><p style="color:#666;font-size:13px">' + esc(L.vIgnore) + '</p>' };
}

function digestEmail(lang, { host, countryLabel, rows, dashboard, stop, suggestions = [], best = null }) {
  const L = t(lang);
  const tr = rows.map(r => '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc(r.keyword) + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:700">' + esc(positionText(r.curr, L)) + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc(changeText(r.change, L)) + '</td></tr>').join('');
  return { subject: L.dSubject(host), html: '<p>' + L.dIntro(host, countryLabel) + '</p><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px"><tr><th align="left" style="padding:6px 10px">' + esc(L.kw) + '</th><th align="left" style="padding:6px 10px">' + esc(L.pos) + '</th><th align="left" style="padding:6px 10px">' + esc(L.change) + '</th></tr>' + tr + '</table>'
    + (best ? '<div style="border:2px solid #6d28d9;border-radius:10px;padding:12px 16px;margin:16px 0"><p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:#6d28d9;font-weight:700;text-transform:uppercase">' + esc(L.bTitle) + '</p><p style="margin:0 0 8px"><strong>' + esc(L.bText(best.keyword, best.position)) + '</strong></p>'
      + (best.follow ? '<p style="margin:0 0 8px">' + esc(best.follow) + '</p>' : '')
      + (best.show_cta ? '<p style="margin:0"><a href="' + esc(best.link) + '" style="display:inline-block;background:#6d28d9;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">' + esc(best.cta) + ' →</a></p>' : '<p style="margin:0"><a href="' + esc(best.link) + '">' + esc(best.cta) + ' →</a></p>') + '</div>' : '')
    + (suggestions.length ? '<p>' + esc(L.dSuggest) + ' ' + suggestions.map(esc).join(', ') + '</p>' : '')
    + '<p style="color:#666;font-size:13px">' + esc(L.note) + '</p><p><a href="' + esc(dashboard) + '">' + esc(L.dOpen) + '</a> · <a href="' + esc(stop) + '">' + esc(L.dStop) + '</a></p>' };
}

// The follow-up line after "I changed this page" (dashboard and e-mail), from gsc.followUp().
function followText(f, L) {
  if (!f) return '';
  if (f.status === 'GROWING') return L.cGrowing(f.since, f.from, f.to);
  if (f.status === 'NO_GROWTH') return L.cNoGrowth(f.since, f.from, f.to, Math.floor(f.days / 7));
  return L.cWaiting(f.since, f.from, f.to, f.checks_since);
}

module.exports = { followText, T, t, langOf, esc, positionText, changeText, verifyEmail, accessEmail, digestEmail };
