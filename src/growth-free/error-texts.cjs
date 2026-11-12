'use strict';
// Messages of the Free Growth server for visitors in Dutch and Spanish (owner 2026-11-12: "Spanish is Spanish, English is
// English"). The server writes them in English; this table gives the same message in the visitor's language. Messages
// only the owner sees (admin) stay in English. Unknown messages stay as they are.
const EXACT = {
  'Choose the AI system you used': { nl: 'Kies het AI-systeem dat je gebruikte', es: 'Elige el sistema de IA que usaste' },
  'Choose the Search Console export (ZIP or CSV) first.': { nl: 'Kies eerst de Search Console-export (ZIP of CSV).', es: 'Elige primero la exportación de Search Console (ZIP o CSV).' },
  'Choose the language from the list, for example Dutch.': { nl: 'Kies de taal uit de lijst, bijvoorbeeld Nederlands.', es: 'Elige el idioma de la lista, por ejemplo español.' },
  'Choose the market from the list, for example nl — Netherlands (several separated by commas).': { nl: 'Kies de markt uit de lijst, bijvoorbeeld nl — Nederland (meerdere gescheiden door komma\'s).', es: 'Elige el mercado de la lista, por ejemplo es — España (varios separados por comas).' },
  'Concepts for this check are being written right now. Wait a moment and reload.': { nl: 'De concepten voor deze check worden nu geschreven. Wacht even en herlaad de pagina.', es: 'Los borradores de este análisis se están escribiendo ahora. Espera un momento y recarga la página.' },
  'Could not analyse the answer. Please try again.': { nl: 'Het antwoord kon niet worden geanalyseerd. Probeer het opnieuw.', es: 'No se pudo analizar la respuesta. Inténtalo de nuevo.' },
  'Could not save the selection': { nl: 'De keuze kon niet worden opgeslagen', es: 'No se pudo guardar la selección' },
  'Could not send your request. Please try again.': { nl: 'Je aanvraag kon niet worden verstuurd. Probeer het opnieuw.', es: 'No se pudo enviar tu solicitud. Inténtalo de nuevo.' },
  'Enough suggestions for now; try again in an hour or enter the search term yourself.': { nl: 'Genoeg suggesties voor nu; probeer het over een uur opnieuw of vul de zoekterm zelf in.', es: 'Suficientes sugerencias por ahora; inténtalo dentro de una hora o escribe tú la búsqueda.' },
  'Enter a keyword (search term) or the page address first.': { nl: 'Vul eerst een zoekwoord of het adres van de pagina in.', es: 'Escribe primero una palabra clave o la dirección de la página.' },
  'Enter a valid email address (up to 5, separated by commas)': { nl: 'Vul een geldig e-mailadres in (maximaal 5, gescheiden door komma\'s)', es: 'Escribe un email válido (hasta 5, separados por comas)' },
  'Enter a valid email address or leave it empty': { nl: 'Vul een geldig e-mailadres in of laat het leeg', es: 'Escribe un email válido o déjalo vacío' },
  'Enter a valid email address': { nl: 'Vul een geldig e-mailadres in', es: 'Escribe un email válido' },
  'Enter at most 5 email addresses': { nl: 'Vul maximaal 5 e-mailadressen in', es: 'Escribe como máximo 5 emails' },
  'Enter the customer question first: your pasted AI answers are checked against it.': { nl: 'Vul eerst de klantvraag in: je geplakte AI-antwoorden worden daarmee vergeleken.', es: 'Escribe primero la pregunta del cliente: tus respuestas de IA pegadas se comparan con ella.' },
  'Enter your name': { nl: 'Vul je naam in', es: 'Escribe tu nombre' },
  'Every selected item has been written already. Select other items, or download the editor brief.': { nl: 'Alles wat je koos is al geschreven. Kies andere onderwerpen, of download de editor-brief.', es: 'Todo lo que elegiste ya está escrito. Elige otros temas o descarga el brief para el editor.' },
  'Invalid invitation': { nl: 'Ongeldige uitnodiging', es: 'Invitación no válida' },
  'Invalid selection': { nl: 'Ongeldige keuze', es: 'Selección no válida' },
  'Not found': { nl: 'Niet gevonden', es: 'No encontrado' },
  'Page elements are added by the editor; select a topic or question to write.': { nl: 'Pagina-elementen voeg je zelf toe; kies een onderwerp of vraag om te laten schrijven.', es: 'Los elementos de página los añades tú; elige un tema o una pregunta para escribir.' },
  'Paste each AI answer at the AI system you used (one answer per system).': { nl: 'Plak elk AI-antwoord bij het AI-systeem dat je gebruikte (één antwoord per systeem).', es: 'Pega cada respuesta de IA en el sistema que usaste (una respuesta por sistema).' },
  'Paste the complete answer first': { nl: 'Plak eerst het volledige antwoord', es: 'Pega primero la respuesta completa' },
  'Personal approval is required. Request access at https://contentscale.site/.': { nl: 'Persoonlijke goedkeuring is nodig. Vraag toegang aan via https://nl.contentscale.site/.', es: 'Se necesita aprobación personal. Solicita acceso en https://es.contentscale.site/.' },
  'Please accept the storage notice': { nl: 'Vink eerst het vakje over opslaan aan', es: 'Acepta primero el aviso de almacenamiento' },
  'Please tick the contact box': { nl: 'Vink het vakje voor contact aan', es: 'Marca la casilla de contacto' },
  'Research has not finished': { nl: 'Het onderzoek is nog niet klaar', es: 'La investigación aún no ha terminado' },
  'Result not found': { nl: 'Uitslag niet gevonden', es: 'Resultado no encontrado' },
  'Select at least one topic or question first.': { nl: 'Kies eerst minstens één onderwerp of vraag.', es: 'Elige primero al menos un tema o una pregunta.' },
  'Selection contains an item outside this report': { nl: 'De keuze bevat een onderdeel dat niet in dit rapport staat', es: 'La selección contiene un elemento que no está en este informe' },
  'Temporarily unavailable': { nl: 'Tijdelijk niet beschikbaar', es: 'No disponible temporalmente' },
  'The AI rewrite limit for this check is reached; change the title and description yourself.': { nl: 'De limiet voor herschrijven met AI is bereikt voor deze check; pas de titel en beschrijving zelf aan.', es: 'Se alcanzó el límite de reescritura con IA de este análisis; cambia tú el título y la descripción.' },
  'The Search Console file could not be saved. Please try again.': { nl: 'Het Search Console-bestand kon niet worden opgeslagen. Probeer het opnieuw.', es: 'No se pudo guardar el archivo de Search Console. Inténtalo de nuevo.' },
  'The Search Console file is larger than 3 MB. Export only this page.': { nl: 'Het Search Console-bestand is groter dan 3 MB. Exporteer alleen deze pagina.', es: 'El archivo de Search Console pesa más de 3 MB. Exporta solo esta página.' },
  'The automatic sentence repair limit for this check is reached; change the marked sentences yourself.': { nl: 'De limiet voor automatisch herstellen van zinnen is bereikt voor deze check; pas de gemarkeerde zinnen zelf aan.', es: 'Se alcanzó el límite de reparación automática de frases de este análisis; cambia tú las frases marcadas.' },
  'The check has not finished': { nl: 'De check is nog niet klaar', es: 'El análisis aún no ha terminado' },
  'The date could not be saved. Please try again.': { nl: 'De datum kon niet worden opgeslagen. Probeer het opnieuw.', es: 'No se pudo guardar la fecha. Inténtalo de nuevo.' },
  'The free check is temporarily unavailable': { nl: 'De gratis check is tijdelijk niet beschikbaar', es: 'El análisis gratuito no está disponible temporalmente' },
  'The writing limit for this check is reached. Download the editor brief instead.': { nl: 'De schrijflimiet voor deze check is bereikt. Download in plaats daarvan de editor-brief.', es: 'Se alcanzó el límite de escritura de este análisis. Descarga el brief para el editor.' },
  'The writing limit for this check is reached.': { nl: 'De schrijflimiet voor deze check is bereikt.', es: 'Se alcanzó el límite de escritura de este análisis.' },
  'This answer is too long; paste only the answer and its sources': { nl: 'Dit antwoord is te lang; plak alleen het antwoord en de bronnen', es: 'Esta respuesta es demasiado larga; pega solo la respuesta y sus fuentes' },
  'This free check is not activated here': { nl: 'Deze gratis check is hier niet geactiveerd', es: 'Este análisis gratuito no está activado aquí' },
  'This free check is not activated on this website': { nl: 'Deze gratis check is niet geactiveerd op deze website', es: 'Este análisis gratuito no está activado en esta web' },
  'This invitation only works with the email address it was sent to': { nl: 'Deze uitnodiging werkt alleen met het e-mailadres waarnaar hij is gestuurd', es: 'Esta invitación solo funciona con el email al que se envió' },
  'This is an answer to the company quick-scan prompt (company profile or QUESTION 1–4), not to the prompt for this search term. Copy the prompt shown here, paste it into a new chat with web search on, and paste that answer.': { nl: 'Dit is een antwoord op de prompt van de bedrijfsscan (bedrijfsprofiel of QUESTION 1–4), niet op de prompt voor deze zoekterm. Kopieer de prompt die hier staat, plak hem in een nieuwe chat met webzoeken aan, en plak dat antwoord.', es: 'Esta es una respuesta al prompt del análisis de empresa (perfil de empresa o QUESTION 1–4), no al prompt de esta búsqueda. Copia el prompt que aparece aquí, pégalo en un chat nuevo con búsqueda web activada y pega esa respuesta.' },
  'This writing run took too long and another run took over, so this text was not stored. It is shown here so it is not lost.': { nl: 'Deze schrijfronde duurde te lang en een andere ronde nam het over, dus deze tekst is niet opgeslagen. Hij staat hier zodat hij niet verloren gaat.', es: 'Esta ronda de escritura tardó demasiado y otra ronda tomó el relevo, así que este texto no se guardó. Se muestra aquí para que no se pierda.' },
  "Today's free checks are used up. Please try again tomorrow.": { nl: 'De gratis checks van vandaag zijn op. Probeer het morgen opnieuw.', es: 'Los análisis gratuitos de hoy se han agotado. Inténtalo mañana.' },
  "Today's AI writing for free checks is used up. Download the editor brief, or try again tomorrow.": { nl: 'Het schrijven met AI voor gratis checks is voor vandaag op. Download de editor-brief, of probeer het morgen opnieuw.', es: 'La escritura con IA de los análisis gratuitos se ha agotado por hoy. Descarga el brief para el editor o inténtalo mañana.' },
  'Too many attempts. Try again in 15 minutes.': { nl: 'Te veel pogingen. Probeer het over 15 minuten opnieuw.', es: 'Demasiados intentos. Inténtalo dentro de 15 minutos.' },
  'Unavailable': { nl: 'Niet beschikbaar', es: 'No disponible' },
  'Writing is not available for this check. Sign in as the owner, or download the editor brief.': { nl: 'Schrijven is niet beschikbaar voor deze check. Download de editor-brief.', es: 'La escritura no está disponible para este análisis. Descarga el brief para el editor.' },
  'Writing is not available right now. Your selection works with the editor brief.': { nl: 'Schrijven is nu niet beschikbaar. Je keuze werkt met de editor-brief.', es: 'La escritura no está disponible ahora. Tu selección funciona con el brief para el editor.' },
  'Your page could not be read publicly. Enter the search term yourself.': { nl: 'Je pagina kon niet openbaar worden gelezen. Vul de zoekterm zelf in.', es: 'No se pudo leer tu página públicamente. Escribe tú la búsqueda.' },
  'Your page could not be read right now. Try again in a moment.': { nl: 'Je pagina kon nu niet worden gelezen. Probeer het zo opnieuw.', es: 'No se pudo leer tu página ahora. Inténtalo de nuevo en un momento.' },
  // Web address checks (engine.cjs).
  'Enter a full web address, e.g. https://example.com/page/': { nl: 'Vul een volledig webadres in, bijv. https://voorbeeld.nl/pagina/', es: 'Escribe una dirección web completa, p. ej. https://ejemplo.es/pagina/' },
  'Enter a public website address': { nl: 'Vul het adres van een openbare website in', es: 'Escribe la dirección de una web pública' },
  'Only http(s) web pages can be checked': { nl: 'Alleen http(s)-webpagina\'s kunnen worden gecontroleerd', es: 'Solo se pueden analizar páginas web http(s)' },
  'This looks like a question or text, not a web address. Enter the page address here (e.g. https://example.com/page/) and the question under Search term.': { nl: 'Dit lijkt een vraag of tekst, geen webadres. Vul hier het adres van de pagina in (bijv. https://voorbeeld.nl/pagina/) en de vraag bij Vraag van je klant.', es: 'Parece una pregunta o un texto, no una dirección web. Escribe aquí la dirección de la página (p. ej. https://ejemplo.es/pagina/) y la pregunta en Pregunta del cliente.' },
  'This web address is too long': { nl: 'Dit webadres is te lang', es: 'Esta dirección web es demasiado larga' },
  'Web addresses with a login are not supported': { nl: 'Webadressen met een login worden niet ondersteund', es: 'No se admiten direcciones web con inicio de sesión' },
};
// Messages with a variable part.
const PATTERNS = [
  [/^AI could not write the text: (.*)$/s, { nl: 'AI kon de tekst niet schrijven: $1', es: 'La IA no pudo escribir el texto: $1' }],
  [/^Not enough evidence in this check to write: (.*)$/s, { nl: 'Te weinig bewijs in deze check om te schrijven: $1', es: 'No hay pruebas suficientes en este análisis para escribir: $1' }],
  [/^Search Console file: (.*)$/s, { nl: 'Search Console-bestand: $1', es: 'Archivo de Search Console: $1' }],
  [/^Use the e-mail address of your rank tracker \((.*)\)\.$/, { nl: 'Gebruik het e-mailadres van je rank tracker ($1).', es: 'Usa el email de tu rastreador de posiciones ($1).' }],
  [/^You used the (\d+) free Growth checks from your rank tracker for this week\. Try again in a few days\.$/, { nl: 'Je hebt de $1 gratis Growth-checks van je rank tracker voor deze week gebruikt. Probeer het over een paar dagen opnieuw.', es: 'Ya usaste los $1 análisis Growth gratuitos de tu rastreador de esta semana. Inténtalo dentro de unos días.' }],
  [/^The free limit is (\d+) checks per day\. Try again tomorrow, or ask for the paid service\.$/, { nl: 'De gratis limiet is $1 checks per dag. Probeer het morgen opnieuw, of vraag naar de betaalde dienst.', es: 'El límite gratuito es de $1 análisis al día. Inténtalo mañana o pregunta por el servicio de pago.' }],
];
function translateError(msg, lang) {
  if (typeof msg !== 'string' || lang === 'en' || !['nl', 'es'].includes(lang)) return msg;
  const exact = EXACT[msg]; if (exact && exact[lang]) return exact[lang];
  for (const [re, t] of PATTERNS) if (re.test(msg)) return msg.replace(re, t[lang]);
  return msg;
}
module.exports = { translateError, EXACT, PATTERNS };
