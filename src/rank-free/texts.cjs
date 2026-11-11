'use strict';
// Texts of the free rank tracker in English, Dutch and Spanish (the languages of the ContentScale sites).
// Another language falls back to English. Positions are shown as measured; nothing is rounded up or estimated.
const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const T = {
  en: {
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
    dash: 'Your rankings', kw: 'Keyword', pos: 'Position', change: 'Change', page: 'Your page', checked: 'Checked', notTop: n => 'not in top ' + n,
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
    dash: 'Je posities', kw: 'Zoekwoord', pos: 'Positie', change: 'Verandering', page: 'Je pagina', checked: 'Gemeten', notTop: n => 'niet in top ' + n,
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
    failed: (why, when) => 'el último intento falló (' + why + '); nuevo intento ' + when,
    noProvider: 'Las comprobaciones aún no funcionan: la conexión con Google no está configurada en el servidor. Tus palabras clave están guardadas y se comprobarán en cuanto lo esté.',
    aSubject: 'El enlace a tu rank tracker gratuito', aIntro: host => 'Ya sigues ' + esc(host) + '. Abre tu panel para ver tus posiciones o cambiar tus palabras clave.', aButton: 'Abrir tu panel',
    title: 'Rank tracker gratuito', lead: 'Sigue en qué posición aparece tu web en Google para hasta 10 palabras clave, en el país que elijas. Se comprueba automáticamente cada semana y recibes un e-mail cuando algo cambia.',
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
    dash: 'Tus posiciones', kw: 'Palabra clave', pos: 'Posición', change: 'Cambio', page: 'Tu página', checked: 'Comprobado', notTop: n => 'fuera del top ' + n,
    pending: 'primera comprobación en curso', next: 'Próxima comprobación', addKw: 'Palabras clave (hasta 10, una por línea)', save: 'Guardar palabras clave',
    stop: 'Dejar de recibir e-mails', forget: 'Borrar mis datos', forgetConfirm: '¿Borrar tu cuenta y todas las posiciones? No se puede deshacer.',
    upsell: '¿Aún no estás en la página 1? El análisis Growth gratuito compara tu página con las que sí posicionan y te dice qué falta.',
    upsellLink: 'Haz el análisis Growth gratuito',
    vSubject: 'Confirma tu rank tracker gratuito', vIntro: host => 'Haz clic en el botón para empezar a seguir ' + esc(host) + ' en Google. La primera comprobación empieza enseguida.', vButton: 'Confirmar y empezar',
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
  if (r.status === 'NOT_IN_RESULTS') return L.notTop(r.depth || 30);
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

function digestEmail(lang, { host, countryLabel, rows, dashboard, stop }) {
  const L = t(lang);
  const tr = rows.map(r => '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc(r.keyword) + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:700">' + esc(positionText(r.curr, L)) + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc(changeText(r.change, L)) + '</td></tr>').join('');
  return { subject: L.dSubject(host), html: '<p>' + L.dIntro(host, countryLabel) + '</p><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px"><tr><th align="left" style="padding:6px 10px">' + esc(L.kw) + '</th><th align="left" style="padding:6px 10px">' + esc(L.pos) + '</th><th align="left" style="padding:6px 10px">' + esc(L.change) + '</th></tr>' + tr + '</table>'
    + '<p style="color:#666;font-size:13px">' + esc(L.note) + '</p><p><a href="' + esc(dashboard) + '">' + esc(L.dOpen) + '</a> · <a href="' + esc(stop) + '">' + esc(L.dStop) + '</a></p>' };
}

module.exports = { T, t, langOf, esc, positionText, changeText, verifyEmail, accessEmail, digestEmail };
