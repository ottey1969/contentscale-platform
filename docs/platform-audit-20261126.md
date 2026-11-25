# ContentScale-platformaudit · 26 november 2026

Scope van dit rapport is de eerste audit- en herstelslice op [PR #570](https://github.com/ottey1969/contentscale-platform/pull/570). De onderstaande resultaten gelden voor de uitgevoerde tests. De volledige platformaudit en productievalidatie staan nog open.

## Inventarisatie

De broninventarisatie omvatte 307 getrackte bestanden onder `src`, 119 onder `public`, 17 CI-workflows en 277 Node-testbestanden. Een lexicale scan vond 1.722 registratieregels met `app` of `router`, 170 unieke tabelnamen in `CREATE TABLE IF NOT EXISTS` en 98 unieke expliciete `process.env`-namen. De scan omvat historische bronkopieën en mist dynamisch samengestelde routes. De aantallen zijn bronindicaties en nog geen runtime-inventaris. Express en PostgreSQL vormen de serverkern. Andere directe afhankelijkheden zijn Puppeteer, bcryptjs, express-rate-limit, compression, SendGrid Mail, axios, multer, ws, dotenv, cors, helmet, morgan, joi en uuid.

| Gebied | Geïnventariseerde bron en routes |
| --- | --- |
| Publieke UI, Tracker en beheer | `public/`, Tracker-templates en routehandlers in `src/index.js`, statische en SEO-regels in `index.cjs` |
| Prospectfunnel en leadgeneratie | `src/prospect/`, Quick Scan en Audit20 in `src/index.js`, `public/lead-crawler.html` |
| GSC, Growth en metingen | `src/gsc-report/`, `src/growth-free/`, `src/tracker-growth-*.cjs`, `src/rank-free/`; bestaande GSC-exports, Tracker-snapshots en brongebonden histories |
| Pre-Write, publicatie en bewijs | `src/prewrite-*.cjs`, `src/implementation-report.cjs`, `src/tracker-proof-sources.cjs`, case-study-routes in `src/index.js` |
| Netwerk en klanttoegang | `src/register-network.js`, `src/network/`, Tracker-, share- en administratieve toegangsroutes |
| Infrastructuur | `db/`, `migrations/`, Dockerfile, Railway-configuratie, `scripts/prepare-canonical-production.cjs` en `.github/workflows/` |

De repo heeft nog meerdere historische app-kopieën en compatibiliteitspatches in het bouwproces. De migratie-inventaris staat in [Canonical Architecture Migration](canonical-architecture-migration.md). Volledige consolidatie van route-eigenaarschap, bedrijfsidentiteit, paginastatussen en bewijsprojecties vereist een route- en datamodelaudit. Deze slice heeft de bestaande bronnen, cycli en opslag gebruikt.

## Auditmatrix

Een herstelstatus geldt uitsluitend voor het expliciet genoemde defect. Alle wijzigingen in deze tabel staan op [PR #570](https://github.com/ottey1969/contentscale-platform/pull/570). Een streepje betekent dat deze slice geen defect of oplossing heeft vastgesteld. `NOT TESTED` betekent dat de volledige gebruikersreis niet aantoonbaar is uitgevoerd, ook als deeltests groen zijn.

| Module / functie | Gebruikersreis | Bevinding en oorzaak | Prioriteit | Oplossing | Regressie en resultaat | Status | Commit / PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | Inloggen → overzicht → module openen | — | — | — | Geen volledige browserreis | NOT TESTED | — |
| Quick Scan en Audit20 | Prospect → Quick Scan → Audit20 → interesse | — | — | — | Handler-, kwaliteits- en contracttests geslaagd; volledige writable reis open | NOT TESTED | — |
| Lead Crawler | Import → kwalificatie → verificatie → approval | — | — | — | Nicheregressie geslaagd; volledige browserreis open | NOT TESTED | — |
| Contact Intelligence | Prospect → contactbewijs → outreach | — | — | — | Geen volledige reis | NOT TESTED | — |
| GSC Audit | Import → paginaonderzoek → nieuwe meting → historie | — | — | — | GSC-historie en Free Growth-koppeling in geïsoleerde database geslaagd; volledige alternatieve instroom open | NOT TESTED | — |
| Free Growth | URL → research → uitvoering → publicatie → meting | — | — | — | CI-browserworkflow en geïsoleerde bewijsregressies; volledige reis langs alle instroompunten open | NOT TESTED | — |
| Growth | Priority → research → treatment → uitvoering | — | — | — | Unit-, route- en CMS-handoffcontroles; volledige browserreis open | NOT TESTED | — |
| Tracker | Meten → case afronden → heropenen → cyclus selecteren | Caseweergave las meetpunten van alle cycli op basis van pagina-ID | P1 | Meetpunten begrensd tot de gekozen cyclus. De beschermde baseline blijft de aparte beginmeting | `tracker-case-study-end-e2e.test.cjs`, volledige server en geïsoleerde PostgreSQL-engine geslaagd | FIXED AND VERIFIED | `de4458e` / #570 |
| Opportunity Finder | Opportunity → review → bestemming en Brief | — | — | — | Bestaande tests in `npm test`; geen afzonderlijke browserreis | NOT TESTED | — |
| Competitor Intelligence | SERP → marktmatch → bron en aanbeveling | — | — | — | Evidence- en bronkwaliteitscontroles geslaagd; volledige reis open | NOT TESTED | — |
| Cannibalization | Zoekintentie → overlap → paginabesluit | — | — | — | Regels voor evidence en redirects getest; volledige browserreis open | NOT TESTED | — |
| Pre-Write Brief | Onderzoek → CREATE/EXPAND → openen en hervatten | — | — | — | Research- en Growth-handoffbrowsertests, rapport-HTTP-tests; volledige ononderbroken reis open | NOT TESTED | — |
| Citation Brief | Scan → broncontrole → goedkeuring → uitvoering | — | — | — | Geen volledige reis | NOT TESTED | — |
| ContentScore | Invoer → score → uitvoering → herscan → vergelijking | — | — | — | GSC- en Growth-scorehistorietests geslaagd; volledige browserreis open | NOT TESTED | — |
| GRAAF | Scan → analyse → aanbeveling → meting | — | — | — | Test gedeelde historie geslaagd; volledige browserreis open | NOT TESTED | — |
| AI Visibility | AI-antwoord → broncontrole → citatie → meting | — | — | — | Intentie- en bronregressies en vijf-engine mijlpaaltests; volledige providerreis open | NOT TESTED | — |
| External AI | Brief kopiëren → uitvoering → rapport terug | — | — | — | Contracttests; uitvoering door externe AI valt buiten de uitgevoerde tests | NOT TESTED | — |
| Implementation Reports | Rapport invoeren → bewaren → ophalen | — | — | — | HTTP-tests tegen geïsoleerde database geslaagd, gekoppelde externe uitvoering open | NOT TESTED | — |
| Publicatie | Expliciet melden → exacte URL controleren → bewaren | — | — | — | Geïsoleerde publicatie- en verificatietests geslaagd; geen klantwebsite gepubliceerd | NOT TESTED | — |
| Proof & History | Selecteer cyclus → bekijk baseline en metingen | Verkeerde meetperiode in de cyclusweergave | P1 | Afgesloten cyclus gebruikt het feitelijke einde, metingen zonder vastgestelde eindgrens blijven onbekend | Actieve en afgesloten cyclus met twee verschillende metingen door de echte HTTP-route getest | FIXED AND VERIFIED | `de4458e` / #570 |
| ContentScale Network | Pre-Write → approval → generatie → AI Evidence → monitoring | — | — | — | Beide Network Pre-Write-regressies geslaagd; volledige Network-acquisitie en monitoring open | NOT TESTED | — |
| Admin | Inloggen → beheer → rolgrenzen | Publieke Gemini Live-diagnostiek gaf interne configuratiegegevens vrij | P0 | Diagnostiek achter bestaande adminmiddleware, beperkt tot configuratiestatus | Routeaansluiting en serverboot gecontroleerd; complete Admin-reis open | NOT TESTED | `75d3481` / #570 |
| Klantomgeving | Klantlink → eigen pagina → bewijs en historie | — | — | — | Exacte paginakoppeling en andere klant in HTTP-tests; volledige omgeving open | NOT TESTED | — |
| E-mail en notificaties | Trigger → eenmalige verzending → retry | — | — | — | Golden Owner-digestcontrole geslaagd; geen echte mail verzonden | NOT TESTED | — |
| Schedulers en automatische taken | Planning → uitvoeren → opnieuw uitvoeren → afsluiten | — | — | — | Case-afsluiting en scanre-autorisatie geslaagd; overige jobs open | NOT TESTED | — |
| Gemini Live | Browser → server → provider → sessie | Herbruikbare servercredential zat in het openbare antwoord | P0 | Alleen een kortlevend, eenmalig providertoken via de gedocumenteerde Live API | `gemini-live-token.test.cjs`: HTTP, 2/2 geslaagd met mock, inclusief limiet en foutgevallen | FIXED AND VERIFIED | `75d3481`, `dfe0eb8` / #570 |
| GSC, Gemini-onderzoek, ChatGPT, Perplexity, Claude, Copilot, Firecrawl, Serper | Providerbron → fouten en fallback → verwerking | — | — | — | Bestaande contracttests met fixtures; geen matrix van alle provideruitvalscenario’s | NOT TESTED | — |
| WordPress, SendGrid en Railway | CMS-write, e-mailbezorging en productie-deploy | Geïsoleerde testscope en expliciete publicatie- en mergevoorwaarden | — | — | Geen productiewrite, mailbezorging of deployment uitgevoerd | BLOCKED | — |
| EN, NL en ES | Navigatie → vertaalde velden → hervatten | — | — | — | Deeltests in echte Chromium, inclusief NL/ES Free Growth; geen volledige dekking per viewport en scherm | NOT TESTED | — |
| CI en lint | Bron wijzigen → CI → kwaliteitspoort | ESLint miste configuratie. Een oude statische browserkopie begon met een afgebroken script | P2 | Configuratie en CI-lint toegevoegd, afgebroken duplicaat verwijderd | `npm run lint`, syntax en CI-lint | FIXED AND VERIFIED | `864e500` / #570 |

## Testuitvoering en grenzen

- Lokaal: `npm test` registreerde 536 tests, 532 geslaagd, 0 mislukt en 4 overgeslagen wegens omgevingsvoorwaarden. Extra runs registreerden 23 gerichte tests, 9 database/HTTP-tests, 2 tests rond de echte case-study-server, 6 echte Chromium-tests en 56 module- en funneltests. In die extra runs slaagden 95 tests en werd 1 overgeslagen. Totaal over deze runs: 632 geregistreerd, 627 geslaagd, 0 mislukt, 5 overgeslagen. Testgevallen kunnen in meerdere runs terugkomen. De voorafgaande regressieruns faalden op de beoogde defecten.
- `npm run build` slaagde bij de intake en na de reparaties. De gegenereerde bronwijzigingen zijn teruggezet en niet gecommit. De compatibiliteitsbuild, geïsoleerde serverboot en de PostgreSQL-tests zijn afzonderlijk gecontroleerd. `npm run lint` slaagde na de reparatie.
- CI: de bestaande pipeline bevat aparte browser-, PostgreSQL-, Network-, canonical- en regressiegates. De Gemini Live-HTTP-regressie en lint zijn aan de bestaande algemene workflow toegevoegd. Alle 10 controles waren groen op codecommit `864e500`, inclusief de browser- en PostgreSQL-jobs. GitHub toont de resultaten per commit. [PR-controles](https://github.com/ottey1969/contentscale-platform/pull/570/checks)
- De baseline van Perfect Roofing Team, productiehistorie en WordPress zijn niet gewijzigd. De regressie gebruikt testrecords. Provideracceptatie van Gemini Live en daadwerkelijk productiegebruik zijn niet gevalideerd. Als de eerdere route met een echte credential was uitgerold, valt credentialrotatie onder het beheer van de provider. Er is in deze slice geen echte credential opgevraagd. Het actieve Live-model blijft configureerbaar via `GEMINI_LIVE_MODEL` en een expliciete `GEMINI_KEY_LIVE` is vereist.
- Openstaand zijn de runtime-inventarisatie van de volledige applicatie, handmatige browserdekking per hoofdreis, de resterende auth- en datagrenscontrole, providerstoringen per integratie, en zuivere end-to-end runs van de gehele prospect- en Network-ketens. Historische resultaten zonder bewezen koppeling houden hun bestaande toegangsvoorwaarde.
