'use strict';
// The Free Growth result page in Dutch and Spanish (owner 2026-11-12: "Spanish is Spanish, English is English").
// The page is built in English; a translation layer in the browser replaces every text it finds here. Placeholders keep
// the data as it is: {n} a number, {q} a quoted text “…”, {u} a web address, {d} a site name (example.com), {e} the
// names of AI systems. Data (headings and words of your page or of other sites, search terms) is never translated.
// [English, Dutch, Spanish]
const ROWS = [
  // Page frame
  ['Your Growth check result', 'Uitslag van je Growth-check', 'Resultado de tu análisis Growth'],
  ['← New check', '← Nieuwe check', '← Nuevo análisis'],
  ['Working', 'Bezig', 'Trabajando'],
  ['Checking your page…', 'Je pagina wordt gecontroleerd…', 'Analizando tu página…'],
  ['Reading your page and the pages that rank for your search. This usually takes under a minute. You can keep this page open; the link also works later.', 'We lezen je pagina en de pagina\'s die voor je zoekopdracht in Google staan. Dit duurt meestal minder dan een minuut. Je kunt deze pagina open laten; de link werkt ook later.', 'Leemos tu página y las páginas que aparecen para tu búsqueda. Suele tardar menos de un minuto. Puedes dejar esta página abierta; el enlace también funciona después.'],
  ['Result · Google + AI', 'Uitslag · Google + AI', 'Resultado · Google + IA'],
  ['Your page in Google and in AI answers', 'Je pagina in Google en in AI-antwoorden', 'Tu página en Google y en las respuestas de IA'],
  ['Page:', 'Pagina:', 'Página:'],
  ['ContentScale · Free Growth check', 'ContentScale · Gratis Growth-check', 'ContentScale · Análisis Growth gratuito'],
  ['Not finished', 'Niet klaar', 'Sin terminar'],
  ['The check could not finish', 'De check kon niet worden afgerond', 'El análisis no pudo terminar'],
  ['Try again', 'Opnieuw proberen', 'Intentar de nuevo'],
  // Do this now
  ['STEP {n} OF {n} · DO THIS NOW', 'STAP {n} VAN {n} · DOE DIT NU', 'PASO {n} DE {n} · HAZ ESTO AHORA'],
  ['Step {n} of {n} · do this now', 'Stap {n} van {n} · doe dit nu', 'Paso {n} de {n} · haz esto ahora'],
  ['Choose what to add to your page', 'Kies wat je aan je pagina toevoegt', 'Elige qué añadir a tu página'],
  ['Start with the topics marked Recommended or “{q}”. Tick what fits your business.', 'Begin met de onderwerpen met Aanbevolen of “AI noemt dit ook”. Vink aan wat bij je bedrijf past.', 'Empieza por los temas marcados como Recomendado o “La IA también lo cita”. Marca lo que encaja con tu negocio.'],
  ['Choose topics', 'Kies onderwerpen', 'Elegir temas'], ['Choose topics →', 'Kies onderwerpen →', 'Elegir temas →'],
  ['Let AI write the {n} chosen topic(s)', 'Laat AI de {n} gekozen onderwerp(en) schrijven', 'Deja que la IA escriba los {n} tema(s) elegido(s)'],
  ['You chose what goes on your page. AI writes it now; you check everything before anything is downloaded.', 'Je hebt gekozen wat er op je pagina komt. AI schrijft het nu; jij controleert alles voordat er iets wordt gedownload.', 'Elegiste qué va en tu página. La IA lo escribe ahora; tú lo revisas todo antes de descargar nada.'],
  ['Go to step {n}: write', 'Naar stap {n}: schrijven', 'Ir al paso {n}: escribir'], ['Go to step {n}: write →', 'Naar stap {n}: schrijven →', 'Ir al paso {n}: escribir →'],
  ['Go to step {n}', 'Naar stap {n}', 'Ir al paso {n}'], ['Go to step {n} →', 'Naar stap {n} →', 'Ir al paso {n} →'],
  ['Check the text and download the CMS package', 'Controleer de tekst en download het CMS-pakket', 'Revisa el texto y descarga el paquete CMS'],
  ['AI wrote {n} section(s). Read them, keep what is true for your business, then download the package for your website.', 'AI schreef {n} sectie(s). Lees ze, houd wat klopt voor je bedrijf en download dan het pakket voor je website.', 'La IA escribió {n} sección(es). Léelas, conserva lo que es cierto para tu negocio y descarga el paquete para tu web.'],
  ['Check the text', 'Controleer de tekst', 'Revisar el texto'], ['Check the text →', 'Controleer de tekst →', 'Revisar el texto →'],
  ['Look at what the competitor pages have', 'Bekijk wat de pagina\'s van concurrenten hebben', 'Mira lo que tienen las páginas de la competencia'],
  ['There was too little evidence to propose new text, but you can still see what the ranking pages cover and you do not.', 'Er was te weinig bewijs om nieuwe tekst voor te stellen, maar je ziet wel wat de pagina\'s in Google behandelen en jij niet.', 'No hubo pruebas suficientes para proponer texto nuevo, pero puedes ver qué tratan las páginas de Google y tú no.'],
  ['See the comparison', 'Bekijk de vergelijking', 'Ver la comparación'], ['See the comparison →', 'Bekijk de vergelijking →', 'Ver la comparación →'],
  ['Nothing to add for this search', 'Niets toe te voegen voor deze zoekopdracht', 'Nada que añadir para esta búsqueda'],
  ['Your page already covers what the ranking pages cover. See what was checked below.', 'Je pagina behandelt al wat de pagina\'s in Google behandelen. Hieronder zie je wat is gecontroleerd.', 'Tu página ya trata lo que tratan las páginas de Google. Abajo ves qué se analizó.'],
  ['See what was checked', 'Bekijk wat is gecontroleerd', 'Ver qué se analizó'], ['See what was checked →', 'Bekijk wat is gecontroleerd →', 'Ver qué se analizó →'],
  ['Download the editor brief', 'Download de editor-brief', 'Descarga el brief para el editor'],
  ['You chose {n} topic(s). AI writing is not available for this check, so hand the brief to whoever writes your page.', 'Je koos {n} onderwerp(en). Schrijven met AI is niet beschikbaar voor deze check; geef de brief aan wie je pagina schrijft.', 'Elegiste {n} tema(s). La escritura con IA no está disponible para este análisis; pasa el brief a quien escriba tu página.'],
  ['Go to the brief', 'Naar de brief', 'Ir al brief'], ['Go to the brief →', 'Naar de brief →', 'Ir al brief →'],
  ['Measure the effect', 'Meet het effect', 'Mide el efecto'],
  ['You recorded the publication date. Upload a new Search Console export after about four weeks to compare before and after.', 'Je hebt de publicatiedatum vastgelegd. Upload na ongeveer vier weken een nieuwe Search Console-export om voor en na te vergelijken.', 'Registraste la fecha de publicación. Sube una nueva exportación de Search Console después de unas cuatro semanas para comparar antes y después.'],
  ['Also:', 'Ook:', 'Además:'],
  ['{n} thing(s) to do yourself', '{n} ding(en) om zelf te doen', '{n} cosa(s) que hacer tú'],
  ['(schema, Bing, listings, facts) — Growth does not write these.', '(schema, Bing, vermeldingen, feiten) — Growth schrijft deze niet.', '(schema, Bing, directorios, datos) — Growth no los escribe.'],
  ['Workflow progress', 'Voortgang', 'Progreso'],
  ['{n}. Choose', '{n}. Kiezen', '{n}. Elegir'], ['{n}. Write', '{n}. Schrijven', '{n}. Escribir'], ['{n}. Publish & measure', '{n}. Publiceren & meten', '{n}. Publicar y medir'],
  ['✓ Choose', '✓ Kiezen', '✓ Elegir'], ['✓ Write', '✓ Schrijven', '✓ Escribir'],
  ['Next action', 'Volgende stap', 'Siguiente paso'], ['↑ Top', '↑ Boven', '↑ Arriba'], ['Back to the top', 'Terug naar boven', 'Volver arriba'],
  // What the check found
  ['What the check found', 'Wat de check vond', 'Qué encontró el análisis'],
  ['Google:', 'Google:', 'Google:'], ['AI answers:', 'AI-antwoorden:', 'Respuestas de IA:'], ['Search Console:', 'Search Console:', 'Search Console:'],
  ['{n} topic(s) the ranking pages have and your page does not ({n} recommended)', '{n} onderwerp(en) die de pagina\'s in Google hebben en jouw pagina niet ({n} aanbevolen)', '{n} tema(s) que tienen las páginas de Google y tu página no ({n} recomendados)'],
  ['{n} topic(s) the ranking pages have and your page does not', '{n} onderwerp(en) die de pagina\'s in Google hebben en jouw pagina niet', '{n} tema(s) que tienen las páginas de Google y tu página no'],
  ['{n} topic(s) on the pages AI cites that your page does not cover', '{n} onderwerp(en) op de pagina\'s die AI noemt en die jouw pagina niet behandelt', '{n} tema(s) en las páginas que cita la IA y que tu página no trata'],
  ['the pages AI cites are being compared', 'de pagina\'s die AI noemt worden vergeleken', 'se están comparando las páginas que cita la IA'],
  ['not checked yet', 'nog niet gecontroleerd', 'aún no analizado'], ['export used', 'export gebruikt', 'exportación usada'], ['evidence', 'bewijs', 'pruebas'],
  ['Cited by {n} of {n} AI systems with a source list', 'Genoemd door {n} van {n} AI-systemen met een bronnenlijst', 'Citada por {n} de {n} sistemas de IA con lista de fuentes'],
  ['Cited by {n} of {n} AI system with a source list', 'Genoemd door {n} van {n} AI-systeem met een bronnenlijst', 'Citada por {n} de {n} sistema de IA con lista de fuentes'],
  ['Not cited by AI: {n} of {n} AI systems with a source list', 'Niet genoemd door AI: {n} van {n} AI-systemen met een bronnenlijst', 'No citada por la IA: {n} de {n} sistemas de IA con lista de fuentes'],
  ['Not cited by AI: {n} of {n} AI system with a source list', 'Niet genoemd door AI: {n} van {n} AI-systeem met een bronnenlijst', 'No citada por la IA: {n} de {n} sistema de IA con lista de fuentes'],
  ['AI answers not checked yet', 'AI-antwoorden nog niet gecontroleerd', 'Respuestas de IA aún no analizadas'],
  ['Not verified: no source list in the pasted answers', 'Niet gecontroleerd: geen bronnenlijst in de geplakte antwoorden', 'Sin verificar: no hay lista de fuentes en las respuestas pegadas'],
  // Steps
  ['Choose what to add', 'Kies wat je toevoegt', 'Elige qué añadir'],
  ['Tick the topics you want on your page', 'Vink de onderwerpen aan die je op je pagina wilt', 'Marca los temas que quieres en tu página'],
  ['{n} topic(s) chosen — change your choice here', '{n} onderwerp(en) gekozen — pas je keuze hier aan', '{n} tema(s) elegido(s) — cambia tu elección aquí'],
  ['Evidence required before writing', 'Eerst bewijs nodig voordat er geschreven wordt', 'Se necesitan pruebas antes de escribir'],
  ['Write the text', 'Schrijf de tekst', 'Escribe el texto'],
  ['AI writes the chosen topics; you check them', 'AI schrijft de gekozen onderwerpen; jij controleert ze', 'La IA escribe los temas elegidos; tú los revisas'],
  ['Text written for {n} topic(s) — check it and download the CMS package', 'Tekst geschreven voor {n} onderwerp(en) — controleer hem en download het CMS-pakket', 'Texto escrito para {n} tema(s) — revísalo y descarga el paquete CMS'],
  ['Nothing to write: no content differences', 'Niets te schrijven: geen verschillen in inhoud', 'Nada que escribir: no hay diferencias de contenido'],
  ['No approved content recommendation', 'Geen goedgekeurd inhoudsadvies', 'Ninguna recomendación de contenido aprobada'],
  ['Publish & measure', 'Publiceren & meten', 'Publicar y medir'],
  ['After you put the text on your site: record the date', 'Nadat je de tekst op je site hebt gezet: leg de datum vast', 'Cuando pongas el texto en tu web: registra la fecha'],
  ['Published on {n}-{n}-{n} — compare before and after here', 'Gepubliceerd op {n}-{n}-{n} — vergelijk hier voor en na', 'Publicado el {n}-{n}-{n} — compara aquí antes y después'],
  // Step 1
  ['Choose what goes on your page', 'Kies wat er op je pagina komt', 'Elige qué va en tu página'],
  ['What pages Google ranks and pages AI cites have and your page does not. Tick what fits your business; AI writes only what you tick, in step {n}.', 'Wat de pagina\'s in Google en de pagina\'s die AI noemt hebben en jouw pagina niet. Vink aan wat bij je bedrijf past; AI schrijft alleen wat je aanvinkt, in stap {n}.', 'Lo que tienen las páginas de Google y las que cita la IA y tu página no. Marca lo que encaja con tu negocio; la IA solo escribe lo que marques, en el paso {n}.'],
  ['What pages Google ranks have and your page does not. Tick what fits your business; AI writes only what you tick, in step {n}.', 'Wat de pagina\'s in Google hebben en jouw pagina niet. Vink aan wat bij je bedrijf past; AI schrijft alleen wat je aanvinkt, in stap {n}.', 'Lo que tienen las páginas de Google y tu página no. Marca lo que encaja con tu negocio; la IA solo escribe lo que marques, en el paso {n}.'],
  ['Start here ({n})', 'Begin hier ({n})', 'Empieza aquí ({n})'],
  ['Recommended', 'Aanbevolen', 'Recomendado'], ['AI cites this too', 'AI noemt dit ook', 'La IA también lo cita'],
  ['Google · {n} page', 'Google · {n} pagina', 'Google · {n} página'], ['Google · {n} pages', 'Google · {n} pagina\'s', 'Google · {n} páginas'],
  ['Why?', 'Waarom?', '¿Por qué?'], ['Why and how', 'Waarom en hoe', 'Por qué y cómo'],
  ['Questions two ranking pages answer ({n})', 'Vragen die twee pagina\'s in Google beantwoorden ({n})', 'Preguntas que responden dos páginas de Google ({n})'],
  ['Not on your page ({n})', 'Niet op je pagina ({n})', 'No está en tu página ({n})'],
  ['Partly on your page ({n})', 'Deels op je pagina ({n})', 'En parte en tu página ({n})'],
  ['Could not be matched to your page ({n})', 'Kon niet aan je pagina worden gekoppeld ({n})', 'No se pudo relacionar con tu página ({n})'],
  ['Sections on the ranking pages (not grouped) ({n})', 'Secties op de pagina\'s in Google (niet gegroepeerd) ({n})', 'Secciones de las páginas de Google (sin agrupar) ({n})'],
  ['Probably not relevant to this search ({n})', 'Waarschijnlijk niet relevant voor deze zoekopdracht ({n})', 'Probablemente no relevante para esta búsqueda ({n})'],
  ['Probably not relevant to this search (no section proposed, not written) ({n})', 'Waarschijnlijk niet relevant voor deze zoekopdracht (geen sectie voorgesteld, niet geschreven) ({n})', 'Probablemente no relevante para esta búsqueda (sin sección propuesta, no se escribe) ({n})'],
  ['Add a new section; you choose where.', 'Voeg een nieuwe sectie toe; jij kiest waar.', 'Añade una sección nueva; tú eliges dónde.'],
  ['Extend your section “{q}”.', 'Breid je sectie “{q}” uit.', 'Amplía tu sección “{q}”.'],
  // The question asked to the AI systems (owner 2026-11-12: a real Google question, the best match for the search term).
  ['Question asked:', 'Gestelde vraag:', 'Pregunta realizada:'],
  ['Google searched with “{q}”: the full question is too long for one Google search.', 'Google is gezocht met “{q}”: de volledige vraag is te lang voor één Google-zoekopdracht.', 'Se buscó en Google con “{q}”: la pregunta completa es demasiado larga para una sola búsqueda en Google.'],
  ['the best real Google question for “{q}”', 'de best passende echte Google-vraag voor “{q}”', 'la pregunta real de Google que mejor encaja con “{q}”'],
  ['People also ask', 'Mensen vragen ook', 'Otras preguntas de los usuarios'], ['Related search', 'Gerelateerde zoekopdracht', 'Búsqueda relacionada'],
  ['Check your page first: this section was not compared with it.', 'Controleer eerst je pagina: deze sectie is er niet mee vergeleken.', 'Revisa primero tu página: esta sección no se comparó con ella.'],
  ['Add this element yourself (it is not written by Growth).', 'Voeg dit element zelf toe (Growth schrijft het niet).', 'Añade tú este elemento (Growth no lo escribe).'],
  ['Not on your page', 'Niet op je pagina', 'No está en tu página'], ['Partly on your page', 'Deels op je pagina', 'En parte en tu página'],
  ['Not matched to your page', 'Niet aan je pagina gekoppeld', 'No relacionado con tu página'],
  ['Closest on your page: “{q}”', 'Meest vergelijkbaar op je pagina: “{q}”', 'Lo más parecido en tu página: “{q}”'],
  ['Search demand: not measured (not low)', 'Zoekvraag: niet gemeten (niet laag)', 'Demanda de búsqueda: no medida (no baja)'],
  ['Search Console has data for this page, but no query shares the item\'s own words.', 'Search Console heeft gegevens voor deze pagina, maar geen zoekopdracht deelt de eigen woorden van dit onderwerp.', 'Search Console tiene datos de esta página, pero ninguna búsqueda comparte las palabras propias de este tema.'],
  ['Queries this page already appears for in Search Console that share the item\'s words. Observed, not a forecast.', 'Zoekopdrachten waarvoor deze pagina al in Search Console verschijnt en die woorden met dit onderwerp delen. Waargenomen, geen voorspelling.', 'Búsquedas para las que esta página ya aparece en Search Console y que comparten palabras con este tema. Observado, no una previsión.'],
  ['business fit: your decision', 'past het bij je bedrijf: jouw beslissing', 'encaje con tu negocio: tu decisión'],
  ['{n} selected', '{n} gekozen', '{n} elegido(s)'],
  ['· choices saved, not automatically approved or verified', '· keuzes opgeslagen, niet automatisch goedgekeurd of gecontroleerd', '· elecciones guardadas, no aprobadas ni verificadas automáticamente'],
  ['{n} selected · saved', '{n} gekozen · opgeslagen', '{n} elegido(s) · guardado'],
  ['Selection not saved', 'Keuze niet opgeslagen', 'Selección no guardada'],
  ['Include all H{n} topics', 'Alle H{n}-onderwerpen kiezen', 'Incluir todos los temas H{n}'], ['Clear', 'Wissen', 'Borrar'],
  ['A CMS package is limited to {n} reviewed text sections.', 'Een CMS-pakket bevat maximaal {n} gecontroleerde tekstsecties.', 'Un paquete CMS admite como máximo {n} secciones de texto revisadas.'],
  ['Next: let AI write your chosen H{n}s', 'Volgende: laat AI je gekozen H{n}\'s schrijven', 'Siguiente: deja que la IA escriba tus H{n} elegidos'],
  ['Tick the H{n}s you want above. Then AI writes the text for you here.', 'Vink hierboven de H{n}\'s aan die je wilt. Dan schrijft AI hier de tekst voor je.', 'Marca arriba los H{n} que quieres. Después la IA escribe aquí el texto.'],
  ['Choose a topic above first', 'Kies eerst hierboven een onderwerp', 'Elige primero un tema arriba'],
  ['AI writes the text for the {n} chosen H{n}(s); you check it before anything is downloaded. Nothing is published.', 'AI schrijft de tekst voor de {n} gekozen H{n}(\'s); jij controleert hem voordat er iets wordt gedownload. Er wordt niets gepubliceerd.', 'La IA escribe el texto de los {n} H{n} elegido(s); tú lo revisas antes de descargar nada. No se publica nada.'],
  ['✍ Write the {n} chosen H{n}(s) with AI', '✍ Laat AI de {n} gekozen H{n}(\'s) schrijven', '✍ Escribir con IA los {n} H{n} elegido(s)'],
  ['Export your selection (optional)', 'Exporteer je keuze (optioneel)', 'Exporta tu selección (opcional)'],
  ['The editor brief contains your selected observations, not a verified content recommendation.', 'De editor-brief bevat je gekozen waarnemingen, geen gecontroleerd inhoudsadvies.', 'El brief para el editor contiene tus observaciones elegidas, no una recomendación de contenido verificada.'],
  ['Download editor brief', 'Download editor-brief', 'Descargar brief para el editor'], ['Copy', 'Kopiëren', 'Copiar'],
  ['Select at least one item.', 'Kies minstens één onderdeel.', 'Elige al menos un elemento.'],
  ['{n} item(s) in the brief.', '{n} onderdeel/onderdelen in de brief.', '{n} elemento(s) en el brief.'],
  ['Copied ({n} item(s)).', 'Gekopieerd ({n} onderdeel/onderdelen).', 'Copiado ({n} elemento(s)).'],
  ['No section is proposed or written:', 'Er wordt geen sectie voorgesteld of geschreven:', 'No se propone ni se escribe ninguna sección:'],
  // Do it yourself / also seen
  ['Do it yourself ({n} open)', 'Zelf doen ({n} open)', 'Hazlo tú ({n} pendiente(s))'],
  ['Growth does not write these: they are settings, data or facts only you can confirm. Tick one when it is done.', 'Growth schrijft deze niet: het zijn instellingen, gegevens of feiten die alleen jij kunt bevestigen. Vink er een aan als het klaar is.', 'Growth no escribe estos: son ajustes, datos o hechos que solo tú puedes confirmar. Marca uno cuando esté hecho.'],
  ['Done ({n})', 'Klaar ({n})', 'Hecho ({n})'], ['Google', 'Google', 'Google'], ['AI', 'AI', 'IA'],
  ['Add structured data (schema):', 'Voeg gestructureerde gegevens (schema) toe:', 'Añade datos estructurados (schema):'],
  ['Add:', 'Toevoegen:', 'Añadir:'],
  ['State on your page:', 'Noem op je pagina:', 'Indica en tu página:'], ['Cover on your page:', 'Behandel op je pagina:', 'Trata en tu página:'],
  ['a price or price range', 'een prijs of prijsklasse', 'un precio o rango de precios'], ['a response or arrival time', 'een reactie- of aankomsttijd', 'un tiempo de respuesta o de llegada'],
  ['a licence or registration number', 'een vergunning- of registratienummer', 'un número de licencia o registro'], ['insurance or insurance-claim help', 'verzekering of hulp bij een schadeclaim', 'seguro o ayuda con el parte al seguro'],
  ['a warranty or guarantee', 'een garantie', 'una garantía'], ['numbered process steps', 'genummerde stappen', 'pasos numerados'],
  ['A price or price range', 'Een prijs of prijsklasse', 'Un precio o rango de precios'], ['A response or arrival time', 'Een reactie- of aankomsttijd', 'Un tiempo de respuesta o de llegada'],
  ['A licence or registration number', 'Een vergunning- of registratienummer', 'Un número de licencia o registro'], ['Insurance or insurance-claim help', 'Verzekering of hulp bij een schadeclaim', 'Seguro o ayuda con el parte al seguro'],
  ['A warranty or guarantee', 'Een garantie', 'Una garantía'], ['Numbered process steps', 'Genummerde stappen', 'Pasos numerados'],
  ['The pages AI cites state it ({d}); your page does not. Only add it when it is true for your business.', 'De pagina\'s die AI noemt vermelden het ({d}); jouw pagina niet. Voeg het alleen toe als het klopt voor je bedrijf.', 'Las páginas que cita la IA lo indican ({d}); tu página no. Añádelo solo si es cierto para tu negocio.'],
  ['On the pages AI cites ({d}), not on your page. Not in the Google list, so Growth does not write it: add it yourself if it fits.', 'Op de pagina\'s die AI noemt ({d}), niet op je pagina. Niet in de Google-lijst, dus Growth schrijft het niet: voeg het zelf toe als het past.', 'En las páginas que cita la IA ({d}), no en tu página. No está en la lista de Google, así que Growth no lo escribe: añádelo tú si encaja.'],
  ['Example from {d}:', 'Voorbeeld van {d}:', 'Ejemplo de {d}:'],
  ['Get the page into Bing', 'Zorg dat de pagina in Bing staat', 'Consigue que la página esté en Bing'],
  ['{e} does not cite you. {e} find pages through the Bing index.', '{e} noemt je niet. {e} vinden pagina\'s via de index van Bing.', '{e} no te cita. {e} encuentran páginas a través del índice de Bing.'],
  ['{e} do not cite you. {e} find pages through the Bing index.', '{e} noemen je niet. {e} vinden pagina\'s via de index van Bing.', '{e} no te citan. {e} encuentran páginas a través del índice de Bing.'],
  ['Open Bing Webmaster Tools (bing.com/webmasters) and import your site from Google Search Console.', 'Open Bing Webmaster Tools (bing.com/webmasters) en importeer je site vanuit Google Search Console.', 'Abre Bing Webmaster Tools (bing.com/webmasters) e importa tu web desde Google Search Console.'],
  ['Submit your XML sitemap.', 'Dien je XML-sitemap in.', 'Envía tu sitemap XML.'],
  ['Submit this page URL with URL Submission, and again after every important change.', 'Dien de URL van deze pagina in via URL Submission, en opnieuw na elke belangrijke wijziging.', 'Envía la URL de esta página con URL Submission, y de nuevo tras cada cambio importante.'],
  ['Make your business listings consistent', 'Maak je bedrijfsvermeldingen gelijk', 'Unifica los datos de tu negocio en los directorios'],
  ['{e} does not cite you. AI systems often rely on directories and review sites to confirm a business.', '{e} noemt je niet. AI-systemen gebruiken vaak bedrijvengidsen en reviewsites om een bedrijf te bevestigen.', '{e} no te cita. Los sistemas de IA suelen apoyarse en directorios y webs de opiniones para confirmar un negocio.'],
  ['{e} do not cite you. AI systems often rely on directories and review sites to confirm a business.', '{e} noemen je niet. AI-systemen gebruiken vaak bedrijvengidsen en reviewsites om een bedrijf te bevestigen.', '{e} no te citan. Los sistemas de IA suelen apoyarse en directorios y webs de opiniones para confirmar un negocio.'],
  ['Check the directories that matter in your market (for local services, for example Yelp, BBB, Angi, Houzz, Nextdoor and your local chamber of commerce).', 'Controleer de bedrijvengidsen die in je markt tellen (voor lokale diensten bijvoorbeeld Google Bedrijfsprofiel, Trustpilot, Werkspot, Yelp en de Kamer van Koophandel).', 'Revisa los directorios que importan en tu mercado (para servicios locales, por ejemplo Google Business Profile, Páginas Amarillas, Yelp, Habitissimo y tu cámara de comercio).'],
  ['Use exactly the same business name, address, phone number and website URL everywhere, matching your website.', 'Gebruik overal precies dezelfde bedrijfsnaam, adres, telefoonnummer en website-URL, gelijk aan je website.', 'Usa en todas partes exactamente el mismo nombre, dirección, teléfono y URL, igual que en tu web.'],
  ['Link to this page where a listing allows a service URL.', 'Link naar deze pagina waar een vermelding een URL voor een dienst toestaat.', 'Enlaza a esta página donde un directorio permita una URL de servicio.'],
  ['Also seen ({n}) — nothing to do now', 'Ook gezien ({n}) — nu niets te doen', 'También visto ({n}) — nada que hacer ahora'],
  ['Only on your page — keep it ({n})', 'Alleen op jouw pagina — houd het ({n})', 'Solo en tu página — consérvalo ({n})'],
  ['Not on the ranking pages read (compared by heading words). Unique is not proof that it is correct or strong; it is not rewritten.', 'Niet op de gelezen pagina\'s in Google (vergeleken op woorden in koppen). Uniek is geen bewijs dat het klopt of sterk is; het wordt niet herschreven.', 'No está en las páginas de Google leídas (comparado por palabras de los títulos). Ser único no prueba que sea correcto o fuerte; no se reescribe.'],
  ['Not proposed and not written. Tick one only if you know it belongs on this page.', 'Niet voorgesteld en niet geschreven. Vink er alleen een aan als je weet dat het op deze pagina hoort.', 'No propuesto ni escrito. Marca uno solo si sabes que pertenece a esta página.'],
  // Step 2
  ['Generate draft text for evidence-supported selected topics using AI, then review it before creating the CMS package.', 'Laat AI concepttekst schrijven voor de gekozen onderwerpen met bewijs, en controleer die voordat je het CMS-pakket maakt.', 'Genera con IA un borrador para los temas elegidos con pruebas y revísalo antes de crear el paquete CMS.'],
  ['Research did not establish enough evidence to safely draft new text. Your H{n} selections are observations, not verified recommendations. Export the editor brief in step {n}.', 'Het onderzoek vond te weinig bewijs om veilig nieuwe tekst te schrijven. Je gekozen H{n}\'s zijn waarnemingen, geen gecontroleerde adviezen. Exporteer de editor-brief in stap {n}.', 'La investigación no encontró pruebas suficientes para escribir texto nuevo con seguridad. Tus H{n} elegidos son observaciones, no recomendaciones verificadas. Exporta el brief en el paso {n}.'],
  ['The automatic writing limit for this check has been reached. Previously prepared copy remains available for review.', 'De limiet voor automatisch schrijven is bereikt voor deze check. Eerder geschreven tekst blijft beschikbaar.', 'Se alcanzó el límite de escritura automática de este análisis. El texto preparado antes sigue disponible.'],
  ['Write the chosen H{n}s with AI (up to {n} more H{n}s for this check)', 'Laat AI de gekozen H{n}\'s schrijven (nog maximaal {n} H{n}\'s voor deze check)', 'Escribir con IA los H{n} elegidos (hasta {n} H{n} más en este análisis)'],
  ['AI writes {n} H{n}s per round; this check has {n} round(s) left, so up to {n} H{n}s. One click uses as many rounds as needed. You check everything before download. Nothing is published.', 'AI schrijft {n} H{n}\'s per ronde; deze check heeft nog {n} ronde(s), dus maximaal {n} H{n}\'s. Eén klik gebruikt zoveel rondes als nodig. Jij controleert alles voor de download. Er wordt niets gepubliceerd.', 'La IA escribe {n} H{n} por ronda; a este análisis le quedan {n} ronda(s), así que hasta {n} H{n}. Un clic usa las rondas necesarias. Lo revisas todo antes de descargar. No se publica nada.'],
  ['Concepts for your selection', 'Concepten voor je keuze', 'Borradores para tu selección'],
  ['AI wrote concepts for your selection. Check every sentence before using it.', 'AI schreef concepten voor je keuze. Controleer elke zin voordat je hem gebruikt.', 'La IA escribió borradores para tu selección. Revisa cada frase antes de usarla.'],
  ['Concept for review · place after “{q}”', 'Concept om te controleren · plaats na “{q}”', 'Borrador para revisar · colocar después de “{q}”'],
  ['Concept for review · place inside “{q}”', 'Concept om te controleren · plaats in “{q}”', 'Borrador para revisar · colocar dentro de “{q}”'],
  ['Concept for review', 'Concept om te controleren', 'Borrador para revisar'], [' · you choose the place', ' · jij kiest de plek', ' · tú eliges el lugar'],
  ['Write this H{n} again with AI', 'Laat AI deze H{n} opnieuw schrijven', 'Volver a escribir este H{n} con IA'],
  ['CMS package for your editor', 'CMS-pakket voor je editor', 'Paquete CMS para tu editor'],
  ['The same package as the Tracker: approved text, exact placement on your page, SEO title and description, and a measurement plan. Edit the text, remove what you do not want, approve and download. Nothing is published.', 'Hetzelfde pakket als in de Tracker: goedgekeurde tekst, de exacte plek op je pagina, SEO-titel en -beschrijving, en een meetplan. Pas de tekst aan, haal weg wat je niet wilt, keur goed en download. Er wordt niets gepubliceerd.', 'El mismo paquete que en el Tracker: texto aprobado, ubicación exacta en tu página, título y descripción SEO, y un plan de medición. Edita el texto, quita lo que no quieras, aprueba y descarga. No se publica nada.'],
  ['Include all prepared H{n}s', 'Alle geschreven H{n}\'s opnemen', 'Incluir todos los H{n} preparados'], ['Exclude all', 'Alles uitsluiten', 'Excluir todo'],
  ['✓ Prepared H{n}s included', '✓ Geschreven H{n}\'s opgenomen', '✓ H{n} preparados incluidos'],
  ['{n} prepared H{n}(s) included. Review the text and approve before downloading.', '{n} geschreven H{n}(\'s) opgenomen. Controleer de tekst en keur goed voor de download.', '{n} H{n} preparado(s) incluido(s). Revisa el texto y aprueba antes de descargar.'],
  ['Include H{n} · prepared text available', 'H{n} opnemen · geschreven tekst beschikbaar', 'Incluir H{n} · texto preparado disponible'],
  ['Heading (H{n})', 'Kop (H{n})', 'Título (H{n})'], ['Review or edit prepared text', 'Bekijk of bewerk de geschreven tekst', 'Revisa o edita el texto preparado'],
  ['Section text (blank line separates paragraphs)', 'Tekst van de sectie (lege regel scheidt alinea\'s)', 'Texto de la sección (una línea en blanco separa párrafos)'],
  ['Placement: after “{q}”', 'Plaats: na “{q}”', 'Ubicación: después de “{q}”'], ['Placement: inside “{q}”', 'Plaats: in “{q}”', 'Ubicación: dentro de “{q}”'],
  ['Placement: the editor chooses', 'Plaats: de editor kiest', 'Ubicación: la elige el editor'],
  ['Check before downloading:', 'Controleer voor de download:', 'Revisa antes de descargar:'],
  ['for each sentence, rewrite it in the text, keep it when it is true for your business, or remove it.', 'herschrijf elke zin in de tekst, houd hem als hij klopt voor je bedrijf, of haal hem weg.', 'para cada frase, reescríbela en el texto, consérvala si es cierta para tu negocio o elimínala.'],
  ['Not in the package (section not included):', 'Niet in het pakket (sectie niet opgenomen):', 'No está en el paquete (sección no incluida):'],
  ['Show in the text', 'Laat zien in de tekst', 'Mostrar en el texto'], ['It is true — keep it', 'Het klopt — houden', 'Es cierto — conservar'],
  ['Remove this sentence', 'Haal deze zin weg', 'Eliminar esta frase'], ['Undo', 'Ongedaan maken', 'Deshacer'],
  ['✓ Kept — you confirmed it is true for your business.', '✓ Gehouden — je bevestigde dat het klopt voor je bedrijf.', '✓ Conservada — confirmaste que es cierta para tu negocio.'],
  ['Removed or rewritten by you.', 'Weggehaald of herschreven door jou.', 'Eliminada o reescrita por ti.'],
  ['Restore the original — it is true', 'Zet het origineel terug — het klopt', 'Restaurar el original — es cierto'],
  ['Remove all flagged sentences you did not keep ({n})', 'Haal alle gemarkeerde zinnen weg die je niet hield ({n})', 'Eliminar todas las frases marcadas que no conservaste ({n})'],
  ['This page presents me as a person', 'Deze pagina presenteert mij als persoon', 'Esta página me presenta como persona'],
  ['SEO title', 'SEO-titel', 'Título SEO'], ['Meta description', 'Metabeschrijving', 'Meta descripción'], ['Website system (CMS)', 'Websitesysteem (CMS)', 'Sistema de la web (CMS)'],
  ['Other / not sure', 'Anders / weet ik niet', 'Otro / no lo sé'], ['Custom built', 'Op maat gebouwd', 'Hecho a medida'],
  ['Internal link', 'Interne link', 'Enlace interno'], ['Page of this website to link to', 'Pagina van deze website om naar te linken', 'Página de esta web a la que enlazar'],
  ['Link words (what the reader clicks)', 'Linktekst (waar de lezer op klikt)', 'Texto del enlace (lo que pulsa el lector)'],
  ['I reviewed the page, the sections and the link. Every statement is true for this business.', 'Ik heb de pagina, de secties en de link gecontroleerd. Elke bewering klopt voor dit bedrijf.', 'He revisado la página, las secciones y el enlace. Cada afirmación es cierta para este negocio.'],
  ['Download CMS package (ZIP)', 'Download CMS-pakket (ZIP)', 'Descargar paquete CMS (ZIP)'],
  ['Checking the package…', 'Het pakket wordt gecontroleerd…', 'Comprobando el paquete…'], ['Checking the sentences…', 'De zinnen worden gecontroleerd…', 'Comprobando las frases…'],
  ['Not ready.', 'Nog niet klaar.', 'Aún no está listo.'], ['Not ready yet:', 'Nog niet klaar:', 'Aún no está listo:'],
  ['Open the package editor for your selection ({n})', 'Open de pakketeditor voor je keuze ({n})', 'Abrir el editor del paquete para tu selección ({n})'],
  ['Advanced: prepare a CMS package with your own verified text (optional)', 'Geavanceerd: maak een CMS-pakket met je eigen gecontroleerde tekst (optioneel)', 'Avanzado: prepara un paquete CMS con tu propio texto verificado (opcional)'],
  ['No AI text has been prepared yet. Use the blue automatic preparation button above; prepared H{n} text appears here for your review. You do not have to write every paragraph yourself.', 'Er is nog geen AI-tekst geschreven. Gebruik de blauwe knop hierboven; de geschreven H{n}-tekst verschijnt hier om te controleren. Je hoeft niet elke alinea zelf te schrijven.', 'Aún no hay texto de IA preparado. Usa el botón azul de arriba; el texto H{n} preparado aparece aquí para revisarlo. No tienes que escribir cada párrafo tú.'],
  ['A CMS package needs approved factual text, not H{n} headings alone. Your editor brief is in step {n}.', 'Een CMS-pakket heeft goedgekeurde, feitelijke tekst nodig, niet alleen H{n}-koppen. Je editor-brief staat in stap {n}.', 'Un paquete CMS necesita texto factual aprobado, no solo títulos H{n}. Tu brief está en el paso {n}.'],
  ['AI cannot write text for this check yet', 'AI kan nog geen tekst schrijven voor deze check', 'La IA aún no puede escribir texto para este análisis'],
  ['What you can do', 'Wat je kunt doen', 'Qué puedes hacer'], ['New check for this page →', 'Nieuwe check voor deze pagina →', 'Nuevo análisis de esta página →'],
  ['Or download the editor brief (Export your selection, below) and let someone write from it.', 'Of download de editor-brief (Exporteer je keuze, hieronder) en laat iemand daarmee schrijven.', 'O descarga el brief (Exporta tu selección, abajo) y deja que alguien escriba a partir de él.'],
  ['Run a new check for this page with a more specific search term, the way a customer types it in Google (for example with your service and town), or with the right country and language.', 'Start een nieuwe check voor deze pagina met een specifiekere zoekterm, zoals een klant hem in Google typt (bijvoorbeeld met je dienst en plaats), of met het juiste land en de juiste taal.', 'Haz un nuevo análisis de esta página con una búsqueda más concreta, como la escribe un cliente en Google (por ejemplo con tu servicio y tu ciudad), o con el país y el idioma correctos.'],
  // Step 3
  ['Record publication and compare results', 'Leg de publicatie vast en vergelijk de resultaten', 'Registra la publicación y compara los resultados'],
  ['The change is live: enter the date', 'De wijziging staat live: vul de datum in', 'El cambio está publicado: introduce la fecha'],
  ['Date the change went live', 'Datum waarop de wijziging live ging', 'Fecha en que se publicó el cambio'],
  ['Save the date', 'Datum opslaan', 'Guardar la fecha'], ['Change the date', 'Datum wijzigen', 'Cambiar la fecha'], ['Remove the date', 'Datum verwijderen', 'Quitar la fecha'],
  ['Choose the date first.', 'Kies eerst de datum.', 'Elige primero la fecha.'], ['Not saved', 'Niet opgeslagen', 'No guardado'],
  ['Before', 'Voor', 'Antes'], ['After', 'Na', 'Después'], ['Period', 'Periode', 'Periodo'], ['Clicks', 'Klikken', 'Clics'], ['Impressions', 'Vertoningen', 'Impresiones'], ['Average position', 'Gemiddelde positie', 'Posición media'],
  ['No export yet', 'Nog geen export', 'Aún sin exportación'], ['No e-mail reminder.', 'Geen herinnering per e-mail.', 'Sin recordatorio por email.'], ['The reminder is stopped.', 'De herinnering is gestopt.', 'El recordatorio está detenido.'],
  // Evidence
  ['What was checked — evidence (Google · AI answers {n}/{n} · Search Console)', 'Wat is gecontroleerd — bewijs (Google · AI-antwoorden {n}/{n} · Search Console)', 'Qué se analizó — pruebas (Google · respuestas de IA {n}/{n} · Search Console)'],
  ['What was checked — evidence (Google · AI answers · Search Console)', 'Wat is gecontroleerd — bewijs (Google · AI-antwoorden · Search Console)', 'Qué se analizó — pruebas (Google · respuestas de IA · Search Console)'],
  ['AI answers', 'AI-antwoorden', 'Respuestas de IA'], ['Google search', 'Zoeken in Google', 'Búsqueda en Google'],
  ['What the competitor pages have that your page does not ({n})', 'Wat de pagina\'s van concurrenten hebben en jouw pagina niet ({n})', 'Lo que tienen las páginas de la competencia y tu página no ({n})'],
  ['What the competitor pages have', 'Wat de pagina\'s van concurrenten hebben', 'Lo que tienen las páginas de la competencia'],
  ['What Google showed for this search, and the headings of the pages that could be read, compared with your page.', 'Wat Google voor deze zoekopdracht toonde, en de koppen van de pagina\'s die gelezen konden worden, vergeleken met jouw pagina.', 'Lo que mostró Google para esta búsqueda y los títulos de las páginas que se pudieron leer, comparados con tu página.'],
  ['Observations only: there was not enough evidence for advice, but this is what Google showed and what the pages that could be read contain.', 'Alleen waarnemingen: er was te weinig bewijs voor advies, maar dit is wat Google toonde en wat de leesbare pagina\'s bevatten.', 'Solo observaciones: no hubo pruebas suficientes para aconsejar, pero esto es lo que mostró Google y lo que contienen las páginas legibles.'],
  ['Read', 'Gelezen', 'Leída'], ['Not read', 'Niet gelezen', 'No leída'], ['Could not be opened', 'Kon niet worden geopend', 'No se pudo abrir'],
  ['Opened, but too little readable text', 'Geopend, maar te weinig leesbare tekst', 'Abierta, pero con poco texto legible'],
  ['{n} of {n} heading(s) not on your page', '{n} van {n} kop(pen) niet op je pagina', '{n} de {n} título(s) no están en tu página'],
  ['Not on your page (heading words)', 'Niet op je pagina (woorden in koppen)', 'No está en tu página (palabras de los títulos)'],
  ['Similar heading on your page', 'Vergelijkbare kop op je pagina', 'Título parecido en tu página'], ['not on your page', 'niet op je pagina', 'no está en tu página'],
  ['partly on your page', 'deels op je pagina', 'en parte en tu página'], ['on your page', 'op je pagina', 'en tu página'], ['Not compared', 'Niet vergeleken', 'No comparado'],
  ['Side by side: what the competitor says, and your page', 'Naast elkaar: wat de concurrent zegt, en jouw pagina', 'Lado a lado: lo que dice la competencia y tu página'],
  ['The competitor’s own words, for comparison only: write your own text with facts you can stand behind, never copy theirs.', 'De eigen woorden van de concurrent, alleen om te vergelijken: schrijf je eigen tekst met feiten waar je achter staat, kopieer nooit die van hen.', 'Las palabras de la competencia, solo para comparar: escribe tu propio texto con hechos que puedas respaldar, nunca copies el suyo.'],
  ['Your page:', 'Jouw pagina:', 'Tu página:'], ['What to do:', 'Wat te doen:', 'Qué hacer:'], ['no matching section', 'geen passende sectie', 'ninguna sección equivalente'],
  ['Add this topic to my choice', 'Voeg dit onderwerp toe aan mijn keuze', 'Añadir este tema a mi selección'], ['Copy for the editor', 'Kopieer voor de editor', 'Copiar para el editor'], ['Copied.', 'Gekopieerd.', 'Copiado.'],
  ['Your page’s headings ({n})', 'Koppen van je pagina ({n})', 'Títulos de tu página ({n})'],
  ['Research limitations and next research options', 'Grenzen van het onderzoek en vervolgopties', 'Límites de la investigación y próximas opciones'],
  ['Research scope and limitations', 'Reikwijdte en grenzen van het onderzoek', 'Alcance y límites de la investigación'],
  ['Search details (term, market, pages read)', 'Zoekgegevens (term, markt, gelezen pagina\'s)', 'Datos de la búsqueda (término, mercado, páginas leídas)'],
  ['Search term', 'Zoekterm', 'Búsqueda'], ['entered by you', 'door jou ingevuld', 'escrita por ti'], ['derived from your page', 'afgeleid van je pagina', 'deducida de tu página'],
  ['Google shows mostly', 'Google toont vooral', 'Google muestra sobre todo'], ['local service pages', 'pagina\'s van lokale dienstverleners', 'páginas de servicios locales'],
  ['Ranking results considered', 'Bekeken resultaten', 'Resultados considerados'], ['of {n} Google results received', 'van {n} ontvangen Google-resultaten', 'de {n} resultados de Google recibidos'],
  ['Ranking pages read in full', 'Volledig gelezen pagina\'s', 'Páginas leídas por completo'], ['Searched in', 'Gezocht in', 'Buscado en'],
  ['Download complete research data (optional)', 'Download alle onderzoeksgegevens (optioneel)', 'Descargar todos los datos de la investigación (opcional)'],
  ['The JSON contains the full research for independent analysis.', 'De JSON bevat het volledige onderzoek voor eigen analyse.', 'El JSON contiene la investigación completa para un análisis independiente.'],
  ['Download JSON', 'Download JSON', 'Descargar JSON'],
  // AI tab
  ['Number = sources the AI answer listed. Links inside its text are not counted.', 'Getal = bronnen die het AI-antwoord noemde. Links in de tekst zelf tellen niet mee.', 'Número = fuentes que citó la respuesta de IA. Los enlaces dentro del texto no cuentan.'],
  ['not checked', 'niet gecontroleerd', 'no analizado'], ['does not cite you', 'noemt je niet', 'no te cita'], ['cites your site', 'noemt je site', 'cita tu web'], ['cites this page', 'noemt deze pagina', 'cita esta página'],
  ['no sources given', 'geen bronnen gegeven', 'sin fuentes'], ['no source list pasted — not verified', 'geen bronnenlijst geplakt — niet gecontroleerd', 'sin lista de fuentes pegada — sin verificar'],
  ['Sources mentioned in the AI answers ({n})', 'Bronnen genoemd in de AI-antwoorden ({n})', 'Fuentes mencionadas en las respuestas de IA ({n})'],
  ['— in {n} of {n} AI answers', '— in {n} van {n} AI-antwoorden', '— en {n} de {n} respuestas de IA'], ['— in {n} of {n} AI answers · also ranks in Google', '— in {n} van {n} AI-antwoorden · staat ook in Google', '— en {n} de {n} respuestas de IA · también aparece en Google'],
  ['These source mentions are AI visibility observations, not verified content gaps. Growth compares the readable ranking pages automatically and labels missing evidence separately.', 'Deze bronvermeldingen zijn waarnemingen over zichtbaarheid in AI, geen gecontroleerde gaten in je inhoud. Growth vergelijkt de leesbare pagina\'s in Google automatisch en markeert ontbrekend bewijs apart.', 'Estas menciones de fuentes son observaciones de visibilidad en IA, no huecos de contenido verificados. Growth compara automáticamente las páginas legibles de Google y marca aparte las pruebas que faltan.'],
  ['What the pages AI cites have that your page does not', 'Wat de pagina\'s die AI noemt hebben en jouw pagina niet', 'Lo que tienen las páginas que cita la IA y tu página no'],
  ['For the AI systems that do not cite you: the pages they cite, read and compared with your page. Observations only; add only what is true for your business, in your own words.', 'Voor de AI-systemen die je niet noemen: de pagina\'s die zij wel noemen, gelezen en vergeleken met jouw pagina. Alleen waarnemingen; voeg alleen toe wat klopt voor je bedrijf, in je eigen woorden.', 'Para los sistemas de IA que no te citan: las páginas que sí citan, leídas y comparadas con tu página. Solo observaciones; añade solo lo que sea cierto para tu negocio, con tus palabras.'],
  ['Facts they state and your page does not', 'Feiten die zij noemen en jouw pagina niet', 'Datos que ellos indican y tu página no'],
  ['Topics they cover and your page does not ({n})', 'Onderwerpen die zij behandelen en jouw pagina niet ({n})', 'Temas que ellos tratan y tu página no ({n})'],
  ['Compared by topic: a section on your page that answers the same question counts, also when worded differently.', 'Vergeleken op onderwerp: een sectie op je pagina die dezelfde vraag beantwoordt telt mee, ook als hij anders verwoord is.', 'Comparado por tema: cuenta una sección de tu página que responde a la misma pregunta, aunque esté redactada de otra forma.'],
  ['Compared by heading words only: check each one, your page may answer it in other words.', 'Alleen vergeleken op woorden in koppen: controleer elk onderwerp, je pagina beantwoordt het misschien in andere woorden.', 'Comparado solo por palabras de los títulos: revisa cada uno, tu página quizá lo responda con otras palabras.'],
  ['(partly on your page)', '(deels op je pagina)', '(en parte en tu página)'], ['(not sure: check whether your page answers this)', '(niet zeker: controleer of je pagina dit beantwoordt)', '(no es seguro: revisa si tu página lo responde)'],
  ['Page elements they have and your page does not', 'Pagina-elementen die zij hebben en jouw pagina niet', 'Elementos de página que ellos tienen y tu página no'],
  ['Pages AI cites ({n})', 'Pagina\'s die AI noemt ({n})', 'Páginas que cita la IA ({n})'],
  ['The pages AI cites are being read now (your saved AI answers are used, nothing to paste again). The comparison appears here by itself in a moment.', 'De pagina\'s die AI noemt worden nu gelezen (je opgeslagen AI-antwoorden worden gebruikt, niets opnieuw plakken). De vergelijking verschijnt hier zo vanzelf.', 'Se están leyendo las páginas que cita la IA (se usan tus respuestas guardadas, no hace falta pegar de nuevo). La comparación aparecerá aquí en un momento.'],
  ['Add this topic to my choice in step {n}', 'Voeg dit onderwerp toe aan mijn keuze in stap {n}', 'Añadir este tema a mi selección en el paso {n}'],
  ['Added to your choice in step {n}.', 'Toegevoegd aan je keuze in stap {n}.', 'Añadido a tu selección en el paso {n}.'],
  ['This topic is not in the list of step {n}.', 'Dit onderwerp staat niet in de lijst van stap {n}.', 'Este tema no está en la lista del paso {n}.'],
  ['Advanced · Recheck an AI answer (optional)', 'Geavanceerd · Een AI-antwoord opnieuw controleren (optioneel)', 'Avanzado · Volver a analizar una respuesta de IA (opcional)'],
  ['Advanced · Add independent AI answers manually ({n} unchecked)', 'Geavanceerd · Zelf AI-antwoorden toevoegen ({n} niet gecontroleerd)', 'Avanzado · Añadir respuestas de IA a mano ({n} sin analizar)'],
  ['Only check another AI answer if you want to; this never blocks the Google research.', 'Controleer alleen een ander AI-antwoord als je dat wilt; dit houdt het Google-onderzoek nooit tegen.', 'Analiza otra respuesta de IA solo si quieres; nunca bloquea la investigación de Google.'],
  ['Choose the AI system.', 'Kies het AI-systeem.', 'Elige el sistema de IA.'], ['Copy the prompt and paste it into a', 'Kopieer de prompt en plak hem in een', 'Copia el prompt y pégalo en un'],
  ['new chat with web search on', 'nieuwe chat met webzoeken aan', 'chat nuevo con búsqueda web activada'],
  ['Paste the complete answer below, including the source links.', 'Plak hieronder het volledige antwoord, met de bronlinks.', 'Pega abajo la respuesta completa, con los enlaces de las fuentes.'],
  ['AI system', 'AI-systeem', 'Sistema de IA'], ['Prompt (the same for every AI system)', 'Prompt (dezelfde voor elk AI-systeem)', 'Prompt (el mismo para cada sistema de IA)'],
  ['Copy prompt', 'Kopieer prompt', 'Copiar prompt'], ['Copied ✓', 'Gekopieerd ✓', 'Copiado ✓'], ['Answer from the AI system', 'Antwoord van het AI-systeem', 'Respuesta del sistema de IA'],
  ['Paste the complete answer here', 'Plak hier het volledige antwoord', 'Pega aquí la respuesta completa'], ['Analyse answer', 'Analyseer antwoord', 'Analizar respuesta'],
  ['Paste the answer first.', 'Plak eerst het antwoord.', 'Pega primero la respuesta.'], ['Analysing…', 'Bezig met analyseren…', 'Analizando…'],
  ['AI answers differ per user, location, account and time. This shows only the answers you pasted, at the moment you ran them.', 'AI-antwoorden verschillen per gebruiker, plaats, account en moment. Dit toont alleen de antwoorden die jij plakte, op het moment dat je ze opvroeg.', 'Las respuestas de IA varían según el usuario, el lugar, la cuenta y el momento. Esto muestra solo las respuestas que pegaste, en el momento en que las obtuviste.'],
  // Search Console tab
  ['Search Console', 'Search Console', 'Search Console'], ['(optional)', '(optioneel)', '(opcional)'],
  ['Verified for this page.', 'Gecontroleerd voor deze pagina.', 'Verificada para esta página.'],
  ['Verified for this page: the export is filtered on exactly this page. Used as evidence in the research.', 'Gecontroleerd voor deze pagina: de export is gefilterd op precies deze pagina. Gebruikt als bewijs in het onderzoek.', 'Verificada para esta página: la exportación está filtrada exactamente en esta página. Se usó como prueba en la investigación.'],
  ['Search terms with the most impressions', 'Zoektermen met de meeste vertoningen', 'Búsquedas con más impresiones'],
  ['Upload another Search Console export (optional)', 'Upload nog een Search Console-export (optioneel)', 'Sube otra exportación de Search Console (opcional)'],
  ['Upload a Search Console export (ZIP or CSV)', 'Upload een Search Console-export (ZIP of CSV)', 'Sube una exportación de Search Console (ZIP o CSV)'],
  ['Upload export', 'Export uploaden', 'Subir exportación'], ['Choose the export file first.', 'Kies eerst het exportbestand.', 'Elige primero el archivo exportado.'],
  ['Your search term “{q}”: {n} impressions, {n} clicks, position {n}.', 'Je zoekterm “{q}”: {n} vertoningen, {n} klikken, positie {n}.', 'Tu búsqueda “{q}”: {n} impresiones, {n} clics, posición {n}.'],
  ['— {n} impressions, {n} clicks, position {n}', '— {n} vertoningen, {n} klikken, positie {n}', '— {n} impresiones, {n} clics, posición {n}'],
  // Hire
  ['Paid · done for you', 'Betaald · wij doen het voor je', 'De pago · lo hacemos por ti'], ['Want this done for you?', 'Wil je dat wij dit voor je doen?', '¿Quieres que lo hagamos por ti?'],
  ['Book a call', 'Plan een gesprek', 'Reserva una llamada'], ['Or leave your details:', 'Of laat je gegevens achter:', 'O deja tus datos:'],
  ['Name', 'Naam', 'Nombre'], ['Email', 'E-mail', 'Email'], ['Company / website (optional)', 'Bedrijf / website (optioneel)', 'Empresa / web (opcional)'], ['Phone (optional)', 'Telefoon (optioneel)', 'Teléfono (opcional)'],
  ['What would you like help with? (optional)', 'Waarmee wil je hulp? (optioneel)', '¿En qué quieres ayuda? (opcional)'], ['Contact me about this request.', 'Neem contact met me op over deze aanvraag.', 'Contactadme sobre esta solicitud.'],
  ['Ask ContentScale to do it', 'Vraag ContentScale het te doen', 'Pide a ContentScale que lo haga'],
  ['Thank you — your request was received.', 'Bedankt — je aanvraag is ontvangen.', 'Gracias — hemos recibido tu solicitud.'], ['You will get a reply by email.', 'Je krijgt antwoord per e-mail.', 'Recibirás respuesta por email.'],
  // Engine-generated (summary.cjs, gap list, AI summary)
  ['No ranking or traffic increase is promised. Nothing was changed on your website.', 'Er wordt geen hogere positie of meer verkeer beloofd. Er is niets aan je website veranderd.', 'No se promete mejor posición ni más tráfico. No se ha cambiado nada en tu web.'],
  ['Only this one page was checked, not the rest of your website.', 'Alleen deze ene pagina is gecontroleerd, niet de rest van je website.', 'Solo se analizó esta página, no el resto de tu web.'],
  ['Leave the rest of the page as it is.', 'Laat de rest van de pagina zoals hij is.', 'Deja el resto de la página como está.'],
  ['Look at the topics in the list below and choose only what belongs on your page; nothing is written by itself.', 'Bekijk de onderwerpen in de lijst hieronder en kies alleen wat op je pagina hoort; er wordt niets vanzelf geschreven.', 'Mira los temas de la lista de abajo y elige solo lo que pertenece a tu página; no se escribe nada por sí solo.'],
  ['Check again in about three months, or when your Search Console clicks for this search drop.', 'Controleer opnieuw over ongeveer drie maanden, of als je klikken in Search Console voor deze zoekopdracht dalen.', 'Vuelve a analizar en unos tres meses, o cuando bajen tus clics en Search Console para esta búsqueda.'],
  ['No change required — {n} topic from the ranking pages to consider.', 'Geen aanpassing nodig — {n} onderwerp van de pagina\'s in Google om te overwegen.', 'No hace falta cambiar nada — {n} tema de las páginas de Google para considerar.'],
  ['No change required — {n} topics from the ranking pages to consider.', 'Geen aanpassing nodig — {n} onderwerpen van de pagina\'s in Google om te overwegen.', 'No hace falta cambiar nada — {n} temas de las páginas de Google para considerar.'],
  ['No change required — {n} topic from the ranking pages to consider', 'Geen aanpassing nodig — {n} onderwerp van de pagina\'s in Google om te overwegen', 'No hace falta cambiar nada — {n} tema de las páginas de Google para considerar'],
  ['No change required — {n} topics from the ranking pages to consider', 'Geen aanpassing nodig — {n} onderwerpen van de pagina\'s in Google om te overwegen', 'No hace falta cambiar nada — {n} temas de las páginas de Google para considerar'],
  ['Only one ranking page could be read.', 'Er kon maar één pagina in Google worden gelezen.', 'Solo se pudo leer una página de Google.'],
  ['Your Search Console export, filtered on exactly this page ({n}-{n}-{n} – {n}-{n}-{n}), was used in the research.', 'Je Search Console-export, gefilterd op precies deze pagina ({n}-{n}-{n} – {n}-{n}-{n}), is in het onderzoek gebruikt.', 'Tu exportación de Search Console, filtrada exactamente en esta página ({n}-{n}-{n} – {n}-{n}-{n}), se usó en la investigación.'],
  ['ranking page covers it', 'pagina in Google behandelt het', 'página de Google lo trata'], ['ranking pages cover it', 'pagina\'s in Google behandelen het', 'páginas de Google lo tratan'],
  ['only partly on your page', 'maar deels op je pagina', 'solo en parte en tu página'], ['shares words with the search term', 'deelt woorden met de zoekterm', 'comparte palabras con la búsqueda'],
  ['no word in common with the search term', 'geen woord gemeen met de zoekterm', 'ninguna palabra en común con la búsqueda'], ['AI grouped these sections as one topic', 'AI groepeerde deze secties als één onderwerp', 'la IA agrupó estas secciones en un tema'],
  ['{n} fragment of competitor text to work from', '{n} fragment concurrententekst om mee te werken', '{n} fragmento de texto de la competencia para trabajar'], ['{n} fragments of competitor text to work from', '{n} fragmenten concurrententekst om mee te werken', '{n} fragmentos de texto de la competencia para trabajar'],
  ['a single competitor section, not grouped', 'één sectie van een concurrent, niet gegroepeerd', 'una sola sección de la competencia, sin agrupar'], ['not compared with your page', 'niet vergeleken met je pagina', 'no comparado con tu página'],
  ['An FAQ or question-and-answer section', 'Een FAQ of sectie met vragen en antwoorden', 'Una sección de preguntas frecuentes'], ['A table (comparison or overview)', 'Een tabel (vergelijking of overzicht)', 'Una tabla (comparación o resumen)'],
  ['Bulleted or numbered lists ({n}+ items)', 'Opsommingen of genummerde lijsten ({n}+ punten)', 'Listas con viñetas o numeradas ({n}+ elementos)'], ['An embedded video', 'Een ingesloten video', 'Un vídeo insertado'], ['Images', 'Afbeeldingen', 'Imágenes'],
  ['A named author', 'Een auteur met naam', 'Un autor con nombre'], ['A published or updated date', 'Een publicatie- of bijwerkdatum', 'Una fecha de publicación o actualización'], ['Headings phrased as questions', 'Koppen als vraag', 'Títulos en forma de pregunta'],
  ['Length', 'Lengte', 'Longitud'],
  // Added after the first browser check
  ['({n} of {n} checked)', '({n} van {n} gecontroleerd)', '({n} de {n} analizados)'], ['({n} of {n} checked · complete)', '({n} van {n} gecontroleerd · compleet)', '({n} de {n} analizados · completo)'],
  ['Cited by {n} of {n} AI systems with a source list.', 'Genoemd door {n} van {n} AI-systemen met een bronnenlijst.', 'Citada por {n} de {n} sistemas de IA con lista de fuentes.'],
  ['{e} list exactly this page as a source.', '{e} noemen precies deze pagina als bron.', '{e} citan exactamente esta página como fuente.'],
  ['{e} lists exactly this page as a source.', '{e} noemt precies deze pagina als bron.', '{e} cita exactamente esta página como fuente.'],
  ['AI lists your website as a source, but a different page than the one checked.', 'AI noemt je website als bron, maar een andere pagina dan de gecontroleerde.', 'La IA cita tu web como fuente, pero otra página distinta de la analizada.'],
  ['None of the source lists you pasted contains a page of your website for this search.', 'Geen van de geplakte bronnenlijsten bevat een pagina van je website voor deze zoekopdracht.', 'Ninguna de las listas de fuentes que pegaste contiene una página de tu web para esta búsqueda.'],
  ['on {n} of {n} ranking page(s)', 'op {n} van {n} pagina(\'s) in Google', 'en {n} de {n} página(s) de Google'], ['on {n} ranking page(s)', 'op {n} pagina(\'s) in Google', 'en {n} página(s) de Google'],
  ['{n} ranking page covers it', '{n} pagina in Google behandelt het', '{n} página de Google lo trata'], ['{n} ranking pages cover it', '{n} pagina\'s in Google behandelen het', '{n} páginas de Google lo tratan'],
  ['Sites AI cites for “{q}”', 'Sites die AI noemt voor “{q}”', 'Webs que cita la IA para “{q}”'],
  ['not used: {n} × login, privacy or category page', 'niet gebruikt: {n} × inlog-, privacy- of categoriepagina', 'no usadas: {n} × página de inicio de sesión, privacidad o categoría'],
  ['AI only writes when at least {n} pages that Google ranks for your search term could be read and compared (here: {n}). Otherwise the text would be guesswork about your business.', 'AI schrijft alleen als minstens {n} pagina\'s die Google voor je zoekterm toont gelezen en vergeleken konden worden (hier: {n}). Anders zou de tekst gissen naar je bedrijf zijn.', 'La IA solo escribe si se pudieron leer y comparar al menos {n} páginas que Google muestra para tu búsqueda (aquí: {n}). Si no, el texto serían conjeturas sobre tu negocio.'],
  ['The reader-task check found no missing task shared by two or more ranking pages (it checked {n} task). The topic comparison found {n} topic on two or more ranking pages that is missing or only partly on this page: “{q}”. Growth writes no proposal by itself; choose them in the list only if they belong on your page.', 'De controle op lezersvragen vond geen ontbrekende vraag die twee of meer pagina\'s in Google delen (er is {n} vraag gecontroleerd). De vergelijking op onderwerp vond {n} onderwerp op twee of meer pagina\'s dat ontbreekt of maar deels op deze pagina staat: “{q}”. Growth schrijft zelf geen voorstel; kies ze in de lijst alleen als ze op je pagina horen.', 'La comprobación de preguntas del lector no encontró ninguna pregunta que falte y que compartan dos o más páginas de Google (se comprobó {n} pregunta). La comparación por temas encontró {n} tema en dos o más páginas que falta o está solo en parte en esta página: “{q}”. Growth no escribe propuestas por sí solo; elígelos en la lista solo si pertenecen a tu página.'],
  ['Your editor puts the package on your website; nothing is published by this check. Once the change is live, enter the date here. About four weeks later you get one e-mail with the two periods to compare in Search Console, and this page shows them side by side.', 'Je editor zet het pakket op je website; deze check publiceert niets. Staat de wijziging live, vul dan hier de datum in. Ongeveer vier weken later krijg je één e-mail met de twee periodes om in Search Console te vergelijken, en deze pagina zet ze naast elkaar.', 'Tu editor pone el paquete en tu web; este análisis no publica nada. Cuando el cambio esté publicado, introduce aquí la fecha. Unas cuatro semanas después recibes un email con los dos periodos que comparar en Search Console, y esta página los muestra lado a lado.'],
  ['Performance → filter Page → "Exact URL" → this page → Export → Download CSV. Stored with this check only. The Google research is not run again.', 'Prestaties → filter Pagina → "Exacte URL" → deze pagina → Exporteren → CSV downloaden. Alleen bij deze check opgeslagen. Het Google-onderzoek wordt niet opnieuw gedaan.', 'Rendimiento → filtrar Página → "URL exacta" → esta página → Exportar → Descargar CSV. Se guarda solo con este análisis. La investigación de Google no se repite.'],
  ['These sentences are changed in the', 'Deze zinnen worden aangepast in het', 'Estas frases se cambian en el'], ['CMS package below', 'CMS-pakket hieronder', 'paquete CMS de abajo'],
  [', not here: AI replaces them there automatically (checked), or click a yellow sentence to change it yourself.', ', niet hier: AI vervangt ze daar automatisch (gecontroleerd), of klik op een gele zin om hem zelf aan te passen.', ', no aquí: la IA las sustituye allí automáticamente (comprobado), o pulsa una frase amarilla para cambiarla tú.'],
  ['Change it in the CMS package below', 'Pas het aan in het CMS-pakket hieronder', 'Cámbialo en el paquete CMS de abajo'],
  ['(a personal brand, for example you as a specialist): “{q}” and “{q}” are allowed in the title, description and text.', '(een persoonlijk merk, bijvoorbeeld jij als specialist): “{q}” en “{q}” mogen in de titel, beschrijving en tekst.', '(una marca personal, por ejemplo tú como especialista): “{q}” y “{q}” se permiten en el título, la descripción y el texto.'],
  ['Read the two sections in full; if the existing page leaves a practical reader question unanswered, prepare an original evidence-based addition for review.', 'Lees de twee secties helemaal; laat de bestaande pagina een praktische lezersvraag open, schrijf dan een eigen, onderbouwde aanvulling om te controleren.', 'Lee las dos secciones completas; si la página actual deja sin responder una pregunta práctica del lector, prepara un añadido propio y fundamentado para revisar.'],
  ['E-mail is not set up on this server, so no e-mail will arrive. Come back to this page after {t}; the steps below work without it.', 'E-mail is niet ingesteld op deze server, dus er komt geen e-mail. Kom na {t} terug naar deze pagina; de stappen hieronder werken ook zonder.', 'El email no está configurado en este servidor, así que no llegará ningún email. Vuelve a esta página después del {t}; los pasos de abajo funcionan sin él.'],
  ['One e-mail on {t} to {m}: which two periods to export from Search Console.', 'Eén e-mail op {t} naar {m}: welke twee periodes je uit Search Console exporteert.', 'Un email el {t} a {m}: qué dos periodos exportar de Search Console.'],
  ['One e-mail on {t} to : which two periods to export from Search Console.', 'Eén e-mail op {t}: welke twee periodes je uit Search Console exporteert.', 'Un email el {t}: qué dos periodos exportar de Search Console.'],
  ['E-mail me ({m}) once, about four weeks later. You can stop it with the link in the e-mail.', 'Mail me ({m}) één keer, ongeveer vier weken later. Je kunt het stoppen via de link in de e-mail.', 'Envíame un email ({m}) una vez, unas cuatro semanas después. Puedes pararlo con el enlace del email.'],
  ['E-mail me () once, about four weeks later. You can stop it with the link in the e-mail.', 'Mail me één keer, ongeveer vier weken later. Je kunt het stoppen via de link in de e-mail.', 'Envíame un email una vez, unas cuatro semanas después. Puedes pararlo con el enlace del email.'],
  ['Published on {t}.', 'Gepubliceerd op {t}.', 'Publicado el {t}.'], ['The reminder was sent on {t}.', 'De herinnering is verstuurd op {t}.', 'El recordatorio se envió el {t}.'],
  ['I write the missing sections in your voice, check every fact with you, publish nothing without your approval and measure the result in Search Console after {n} days.', 'Ik schrijf de ontbrekende secties in jouw stem, controleer elk feit met je, publiceer niets zonder jouw akkoord en meet het resultaat na {n} dagen in Search Console.', 'Escribo las secciones que faltan con tu voz, compruebo cada dato contigo, no publico nada sin tu aprobación y mido el resultado en Search Console a los {n} días.'],
  ['No section proposed: the AI judged that this topic does not serve someone searching this term', 'Geen sectie voorgesteld: AI oordeelde dat dit onderwerp iemand die deze zoekterm gebruikt niet helpt', 'No se propone sección: la IA consideró que este tema no sirve a quien hace esta búsqueda'],
  ['Add it yourself only if you know it belongs on this page.', 'Voeg het alleen zelf toe als je weet dat het op deze pagina hoort.', 'Añádelo tú solo si sabes que pertenece a esta página.'],
  ['✓ Found on your page now', '✓ Staat nu op je pagina', '✓ Ya está en tu página'], ['Copy the code', 'Kopieer de code', 'Copiar el código'],
  ['Copy the code below. Values marked FILL IN are not on your page: fill them in or remove that line. Never add a value that is not true.', 'Kopieer de code hieronder. Waarden met FILL IN staan niet op je pagina: vul ze in of haal die regel weg. Voeg nooit een waarde toe die niet klopt.', 'Copia el código de abajo. Los valores con FILL IN no están en tu página: rellénalos o quita esa línea. Nunca añadas un valor que no sea cierto.'],
  ['WordPress: paste it in a Custom HTML block on this page, or in WPCode as an HTML snippet that runs only on this page. Rank Math and Yoast can set the same in their Schema settings.', 'WordPress: plak het in een blok Aangepaste HTML op deze pagina, of in WPCode als HTML-snippet dat alleen op deze pagina draait. Rank Math en Yoast kunnen hetzelfde instellen bij hun Schema-instellingen.', 'WordPress: pégalo en un bloque HTML personalizado en esta página, o en WPCode como fragmento HTML que solo se ejecuta en esta página. Rank Math y Yoast pueden configurar lo mismo en sus ajustes de Schema.'],
  ['Test it with the Schema Markup Validator ({d}) and Google’s Rich Results Test ({d}/test/rich-results).', 'Test het met de Schema Markup Validator ({d}) en de Rich Results Test van Google ({d}/test/rich-results).', 'Pruébalo con el Schema Markup Validator ({d}) y la prueba de resultados enriquecidos de Google ({d}/test/rich-results).'],
  ['Reopen this result afterwards: the item is ticked off by itself as soon as your page has it.', 'Open deze uitslag daarna opnieuw: het punt wordt vanzelf afgevinkt zodra je pagina het heeft.', 'Vuelve a abrir este resultado después: el punto se marca solo en cuanto tu página lo tenga.'],
  ['On the pages AI cites ({d}), not on your page. Not in the Google list, so Growth does not write it: add it yourself if it fits. “{q}”', 'Op de pagina\'s die AI noemt ({d}), niet op je pagina. Niet in de Google-lijst, dus Growth schrijft het niet: voeg het zelf toe als het past. “{q}”', 'En las páginas que cita la IA ({d}), no en tu página. No está en la lista de Google, así que Growth no lo escribe: añádelo tú si encaja. “{q}”'],
  ['The pages AI cites state it ({d}); your page does not. Only add it when it is true for your business. Example from {d}: “{q}”', 'De pagina\'s die AI noemt vermelden het ({d}); jouw pagina niet. Voeg het alleen toe als het klopt voor je bedrijf. Voorbeeld van {d}: “{q}”', 'Las páginas que cita la IA lo indican ({d}); tu página no. Añádelo solo si es cierto para tu negocio. Ejemplo de {d}: “{q}”'],
  ['— on {d}', '— op {d}', '— en {d}'], ['— {d}', '— {d}', '— {d}'],
  ['Open Bing Webmaster Tools ({d}/webmasters) and import your site from Google Search Console.', 'Open Bing Webmaster Tools ({d}/webmasters) en importeer je site vanuit Google Search Console.', 'Abre Bing Webmaster Tools ({d}/webmasters) e importa tu web desde Google Search Console.'],
  ['competitor supported', 'onderbouwd door concurrenten', 'respaldado por la competencia'], ['page supported', 'onderbouwd door je pagina', 'respaldado por tu página'],
  ['owner supplied', 'door jou aangeleverd', 'aportado por ti'], ['insufficient evidence', 'onvoldoende bewijs', 'pruebas insuficientes'],
];
// Prefixes: the part after them is translated on its own (it is often data that stays as it is).
const PREFIXES = [
  ['Why: ', 'Waarom: ', 'Por qué: '], ['Seen on: ', 'Gezien op: ', 'Visto en: '], ['Answers: ', 'Beantwoordt: ', 'Responde: '], ['Search term: ', 'Zoekterm: ', 'Búsqueda: '],
  ['Add structured data (schema): ', 'Voeg gestructureerde gegevens (schema) toe: ', 'Añade datos estructurados (schema): '], ['Add: ', 'Toevoegen: ', 'Añadir: '],
  ['State on your page: ', 'Noem op je pagina: ', 'Indica en tu página: '], ['Cover on your page: ', 'Behandel op je pagina: ', 'Trata en tu página: '],
  ['Structured data: ', 'Gestructureerde gegevens: ', 'Datos estructurados: '], ['May overlap with ', 'Overlapt misschien met ', 'Puede solaparse con '],
  ['· cited by ', '· genoemd door ', '· citada por '], ['Example from ', 'Voorbeeld van ', 'Ejemplo de '],
  ['No section proposed: the AI judged that this topic does not serve someone searching this term ', 'Geen sectie voorgesteld: AI oordeelde dat dit onderwerp iemand die deze zoekterm gebruikt niet helpt ', 'No se propone sección: la IA consideró que este tema no sirve a quien hace esta búsqueda '],
  ['basis: ', 'basis: ', 'base: '], ['sources: ', 'bronnen: ', 'fuentes: '],
  ['· ', '· ', '· '], ['— ', '— ', '— '],
];
// Endings translated on their own, after the text before them.
const SUFFIXES = [[/ \((\d+) of (\d+)\)$/, ' ($1 van $2)', ' ($1 de $2)'], [/\. Add it yourself only if you know it belongs on this page\.$/, '. Voeg het alleen zelf toe als je weet dat het op deze pagina hoort.', '. Añádelo tú solo si sabes que pertenece a esta página.']];
const ENGINE_NAMES = ['Gemini / Google AI Overview (identify exact source)', 'ChatGPT Search', 'Perplexity', 'Claude', 'Microsoft Copilot'];
const LANGS = ['nl', 'es'];
// {lang: {normalized English: translation}}
function table() {
  const out = { nl: {}, es: {} };
  for (const [en, nl, es] of ROWS) { out.nl[en] = nl; out.es[en] = es; }
  return out;
}
// The translation layer for the browser: translates every text node (and placeholders, titles, labels) it knows, now and
// whenever the page changes. Never inside a text field, a quote of another site, or code. Runs in the browser.
function uiTranslator(T, P, E, S, AND) {
  S = (S || []).map(function (x) { return [new RegExp(x[0], 'g'.replace('g', '')), x[1]]; });
  var esc = function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var EN = '(?:' + E.map(esc).join('|') + ')', ERE = new RegExp(EN + '(?:(?:, | and )' + EN + ')*', 'g');
  var DOM = /(?:[a-z0-9][a-z0-9-]*\.)+(?:com|net|org|nl|es|be|de|fr|uk|eu|io|co|dev|site|app|info|biz|us|ca|au|example)(?![a-z0-9-])(?:, (?:[a-z0-9][a-z0-9-]*\.)+(?:com|net|org|nl|es|be|de|fr|uk|eu|io|co|dev|site|app|info|biz|us|ca|au|example)(?![a-z0-9-]))*/gi;
  function norm(s) {
    var v = { u: [], m: [], t: [], e: [], q: [], d: [], n: [] };
    s = s.replace(/https?:\/\/\S+/g, function (m) { v.u.push(m); return '{u}'; });
    s = s.replace(/[^\s(),:]+@[^\s(),:]+/g, function (m) { v.m.push(m); return '{m}'; });
    s = s.replace(/\b(?:(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}|\d{1,2} (?:de )?[a-zé]+ (?:de )?\d{4})\b/g, function (m) { v.t.push(m); return '{t}'; });
    s = s.replace(ERE, function (m) { v.e.push(m); return '{e}'; });
    s = s.replace(/“[^”]*”/g, function (m) { v.q.push(m.slice(1, -1)); return '“{q}”'; });
    s = s.replace(DOM, function (m) { v.d.push(m); return '{d}'; });
    s = s.replace(/\d+(?:[.,]\d+)?/g, function (m) { v.n.push(m); return '{n}'; });
    return { k: s, v: v };
  }
  function fill(t, v) { var i = { u: 0, m: 0, t: 0, e: 0, q: 0, d: 0, n: 0 }; return t.replace(/\{(u|m|t|e|q|d|n)\}/g, function (m, k) { var x = v[k][i[k]++]; if (x != null && k === 'e' && AND) x = x.replace(/ and /g, ' ' + AND + ' '); return x == null ? m : x; }); }
  function tr(s) {
    if (!s || !/[A-Za-z]{2}/.test(s)) return null;
    var r = norm(s); if (Object.prototype.hasOwnProperty.call(T, r.k)) return fill(T[r.k], r.v);
    for (var i = 0; i < P.length; i++) if (s.indexOf(P[i][0]) === 0) { var rest = s.slice(P[i][0].length); var y0 = tr(rest); return P[i][1] + (y0 == null ? rest : y0); }
    for (var j = 0; j < S.length; j++) { var mm = s.match(S[j][0]); if (mm) { var head = s.slice(0, mm.index), h = tr(head); return (h == null ? head : h) + s.slice(mm.index).replace(S[j][0], S[j][1]); } }
    if (s.indexOf(' · ') >= 0) { var parts = s.split(' · '), c = 0, out = parts.map(function (x) { var y = tr(x); if (y != null) { c++; return y; } return x; }); if (c) return out.join(' · '); }
    return null;
  }
  var SKIP = 'script,style,textarea,blockquote,code,pre,input,[data-no-translate],.pkgText,.pkgFlagText';
  function text(n) {
    var p = n.parentElement; if (!p || p.closest(SKIP)) return; var raw = n.nodeValue; if (n.__tr === raw) return;
    var m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/), y = tr(m[2].replace(/\s+/g, ' '));
    if (y != null && y !== m[2]) n.nodeValue = m[1] + y + m[3];
    n.__tr = n.nodeValue;
  }
  function attrs(el) { ['placeholder', 'title', 'aria-label'].forEach(function (a) { var v = el.getAttribute && el.getAttribute(a); if (v) { var y = tr(v); if (y != null && y !== v) el.setAttribute(a, y); } }); }
  function walk(root) {
    if (root.nodeType === 3) return text(root);
    if (root.nodeType !== 1 || (root.closest && root.closest('script,style'))) return;
    attrs(root); root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(attrs);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n, list = []; while ((n = w.nextNode())) list.push(n); list.forEach(text);
  }
  window.__uiTranslate = function (s) { var y = tr(String(s)); return y == null ? String(s) : y; };
  var c0 = window.confirm, p0 = window.prompt, a0 = window.alert;
  window.confirm = function (x) { return c0.call(window, window.__uiTranslate(x)); };
  window.prompt = function (x, d) { return p0.call(window, window.__uiTranslate(x), d); };
  window.alert = function (x) { return a0.call(window, window.__uiTranslate(x)); };
  var run = function () {
    walk(document.body);
    new MutationObserver(function (ms) { ms.forEach(function (m) { if (m.type === 'characterData') text(m.target); else m.addedNodes.forEach(walk); }); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
}
function clientScript(lang) {
  if (!LANGS.includes(lang)) return '';
  const t = table()[lang], p = PREFIXES.map(r => [r[0], r[LANGS.indexOf(lang) + 1]]);
  const json = x => JSON.stringify(x).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
  const sfx = SUFFIXES.map(r => [r[0].source, r[LANGS.indexOf(lang) + 1]]);
  return '(' + uiTranslator.toString() + ')(' + json(t) + ',' + json(p) + ',' + json(ENGINE_NAMES) + ',' + json(sfx) + ',' + json(lang === 'nl' ? 'en' : 'y') + ');';
}
module.exports = { ROWS, PREFIXES, SUFFIXES, ENGINE_NAMES, LANGS, table, clientScript };
