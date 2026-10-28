# Growth — rapporten 11 en 12: oorzaken, herstel en productieacceptatie

Basis: `main` @ `3791138` (PR #190). Rapporten van 28-10-2026: 11 = `contentscale.site/international-seo/`,
12 = `perfectroofingteam.com/wind-damage-roof-repair-nj/`. Beide beslissingen zijn lokaal gereproduceerd door de
echte rapportdata door de huidige code te sturen (`tests/growth-reports-11-12-regression.test.cjs`).

## Beslisketen (zoals de code hem werkelijk uitvoert)

`tracker-growth-automatic-routes.cjs › analyze()`
1. Bronpagina lezen: `fetchPublicGrowthHtml` (+ beperkte browserfallback `growth-safe-browser-renderer.cjs`).
2. Query + bestemming: `analyzeGrowthEvidence` → `chooseGrowthNextAction` → `selectGrowthQuery` (`growth-query-selection.cjs`).
3. `resolveGrowthPageIntent` → werkquery; **nieuw:** `deriveMarket` (markt van de bronpagina).
4. SERP: `discoverGrowthCompetitorsWithFallback` (Bing RSS gratis → alleen Serper.dev), filter `rejectLead` (`growth-serp-quality.cjs`).
5. Concurrenten lezen in batches van 3, browserfallback voor JS-pagina's, 401/403/406/429 gerespecteerd.
6. Intentie: `inferSerpIntent` + `classifyDestinationIntent` (`growth-reader-task-coverage.cjs`).
7. Lezerstaken: `analyzeReaderTaskCoverage` → `deriveReaderTasksDetailed` / `destinationStatus` (`growth-derived-reader-tasks.cjs`).
8. Beslissing: `decideGrowthEditorialAction` (`growth-editorial-decision-gate.cjs`) → `NO_CHANGE | IMPROVE_EXISTING | NEW_DISTINCT_PAGE | DATA_BLOCKED`.
9. Eigenaar (POST `/complete`): concept → `produceVerifiedEditorialOpportunity` → gate opnieuw → `decideOwnerGrowthEdit`
   (claim guard) → `buildOwnerHandoffPackage` → work packet / report_completion / UI / downloads.

## Oorzakenmatrix

| # | Waar | Beschikbaar bewijs | Wat ging verloren / welke voorwaarde blokkeerde | Terecht? | Generieke correctie | Regressietest |
|---|---|---|---|---|---|---|
| 1 | `classifyTitle` (`growth-reader-task-coverage.cjs`) | R11: 9 verse Serper-resultaten, 7 duidelijk informatief | Regex `\bbest\b` (commercieel) werd vóór `best practices` (informatief) getoetst → Moz en Semrush = `COMMERCIAL_COMPARISON`; "Getting Started … Quick Reference" = `UNCLASSIFIED`. 5/9 < 60% → `SERP_INTENT_EVIDENCE` | **Nee** — classificatiefout | Instructieve `best …`-frasen uitgezonderd; meer taalneutrale gidsmarkers; onleesbare titel wordt opnieuw geclassificeerd via de H1 van de daadwerkelijk gelezen pagina | tests 1, 1b, 2 |
| 2 | Gate `SERP_INTENT_EVIDENCE` | idem | Melding was een vaste zin ("fewer than three … agree") ook bij 5 overeenstemmende resultaten | Melding misleidend | Blokkade toont werkelijke telling per klasse en methode | test 2b |
| 3 | `fetchPublicGrowthHtml` (cap 120 KB ruwe bytes) + renderer `slice(0,120000)` | R12: bestemmingspagina (WordPress) en 2 JS-concurrenten | Inline CSS/JS/SVG vulde de cap vóór de artikeltekst → bestemming `truncated` → `COMPLETE_DESTINATION_HTML`; gerenderde JS-pagina's 0 leesbare woorden | **Nee** — artefact van de lezer | Onderzoekslezingen (`RESEARCH_FETCH`) streamen tot 2,5 MB, verwijderen alleen niet-leesbare markup (behoudt koppen, tekst, links, canonical, hreflang, JSON-LD) en cappen daarna 300 KB leesbare HTML. CMS-export ongewijzigd | tests 6a, 6b |
| 4 | Gate, truncatie | R12: de enige gedeelde taak (verzekeringsclaim) staat aantoonbaar op de bestemming | Afgekapte pagina blokkeerde vóór de taakvergelijking, ook waar aanwezigheid bewezen was | Deels — afwezigheid is onbewijsbaar, aanwezigheid niet | Truncatie blokkeert alleen een **lacune**-claim (`COMPLETE_DESTINATION_HTML` met genoemde taken); volledig gedekte taken mogen `NO_CHANGE` (ladder blijft `destination_fully_examined:false`) | tests 3, 7 |
| 5 | Gate, `NO_CHANGE` | — | `NO_CHANGE` kon volgen op afgekapte concurrentcaptures (taken na de afkapping onbekend) | **Lek** | `NO_CHANGE` vereist ≥ 2 volledig gelezen concurrentsites, anders `COMPLETE_COMPETITOR_HTML` | test 7 |
| 6 | `selectGrowthQuery` (`growth-query-selection.cjs`) | R12: 12 GSC-rijen van de windpagina (import 08-10-2026), waarvan 10 wind-specifiek | Sortering puur op impressies → "storm damage roof repair" (pos. 87) won en verplaatste het onderzoek naar de algemene stormpagina, die zelf geen GSC-rijen heeft | **Nee** voor de keuze; verplaatsing op zich is terecht omdat de bronpagina een **vergrendelde Case Study** is | Topische bronpagina (niet homepage, niet merk): rangorde eerst op overeenkomst met het eigen onderwerp, dan impressies. Onvergrendeld: query die het eigen keyword dekt blijft op de bronpagina (`SOURCE_PAGE_TOPIC_COVERS_QUERY`), zusterpagina als overlap gemeld. Vergrendeld: naar de wind-zusterpagina. Homepage/hub-gedrag ongewijzigd | tests 4, 4b, 4c |
| 7 | `rejectLead` / Serper-aanroep | R12: keyword `wind damage roof repair nj`, URL `…-nj/` | Markt alleen uit de query; GSC-query zonder "nj" → geen regiofilter, Serper `gl:us` landelijk → concurrenten uit Michigan/South Carolina | **Nee** | `deriveMarket` (query + tracker-keyword + URL-slug); Serper `location` ("New Jersey, United States"); andere-staat-aanbieders afgewezen; plaatsloze gidsen blijven als `NO_REGION_STATED_GENERAL_SOURCE`; `SAME_MARKET` wordt eerst gelezen | tests 5, 5b, 5c |
| 8 | `decideOwnerGrowthEdit` vs producer | — | Twee onafhankelijke draft-controles met verschillende taakregels → `copy_ready:true` mogelijk terwijl `verified_gap:false` | **Inconsistentie** | `copy_ready` volgt uitsluitend de producer; één `evidence_status`-ladder (`growth-evidence-status.cjs`) in gate, work packet, report_completion, eigenaarspakket en UI | tests 10 + e2e "evidence status is identical…" |
| 9 | Labels | — | `intent_resolution.source` zei `TRACKER_KEYWORD` bij een GSC-query; waarschuwing heette `SERPAPI_GOOGLE_*` | Misleidend | Bron uit de selectie; `SERPER_GOOGLE_*`; GSC-reden vermeldt importdatum en "historical, not a current ranking" | test 5c |

### Antwoorden op de drie R12-vragen
- **A. Bestemming** — Verplaatsen weg van de windpagina is juist zolang die als Case Study vergrendeld is (geen wijzigingen op de
  bronpagina). De keuze voor de *stormpagina* was fout: de bronpagina-rijen werden puur op volume gerangschikt. Nu wint de
  windgerelateerde rij (`roof wind damage repair`) met de dedicated wind-zusterpagina als doel; bronrijen worden nooit als
  bestemmingsdata gepresenteerd.
- **B. Geografie** — De zoekopdracht was onvoldoende geografisch afgebakend (markt alleen uit de query). Nu komt de markt uit de
  bronpagina zelf en wordt Serper gelokaliseerd.
- **C. NO_CHANGE** — Bereikbaar wanneer alle gedeelde taken aantoonbaar gedekt zijn, ≥ 2 concurrentsites volledig gelezen zijn,
  intentie bevestigd is. Met alleen marktconforme concurrenten bleven in R12 te weinig leesbare sites over → terecht `DATA_BLOCKED`.

### R11: kon Growth zelfstandig beslissen?
Ja. Met dezelfde onderzoeksdata geeft de keten nu `IMPROVE_EXISTING` voor `task_analyz` ("Measuring and analyzing international
SEO performance", Moz + Semrush), geplaatst na "What Is International SEO & Why It Matters…". `task_cultur` wordt niet voorgesteld
(al gedekt). `verified_gap`/`copy_ready` blijven `false` tot een concept de producer-controles doorstaat. Geen query-uitzondering.

## Bewijsladder (identiek in alle uitvoer)
`search_intent_confirmed`, `competitor_content_observed`, `destination_fully_examined`, `missing_task_established`,
`draft_checked`, `factual_claims_confirmed` (altijd `false`, eigenaar), `publication_approved` (altijd `false`).
`copy_ready` = `verified_gap` = `draft_checked`.

## Bekende beperkingen
- Intentie- en taakherkenning blijven lexicaal/patroongebaseerd (geen semantisch bewijs); de ladder zegt dat expliciet.
- Marktherkenning dekt Amerikaanse staten (bestaande `US`-tabel); andere landen krijgen geen regiofilter.
- De echte HTML van de rapportpagina's zit niet in de rapporten; fixtures testen de beslislaag, de leeslaag is synthetisch getest.
- 9 testbestanden buiten `npm test` faalden al vóór deze wijziging (zie PR-beschrijving); ongewijzigd.

## Productieacceptatie (na Railway-deploy)
1. Controleer in Railway dat de deploy de commit van deze PR draait en `SERPER_API_KEY` gezet is (geen `SERPAPI_*` nodig).
2. Draai Growth "complete" (eigenaar) voor **page 2324** (`/international-seo/`) en **page 2413** (`/wind-damage-roof-repair-nj/`), download beide JSON's.
3. Rapport international-seo — verwacht:
   - `serp_intent.status = SERP_INTENT_OBSERVED`, `intent = INFORMATIONAL_GUIDE`;
   - `editorial_decision_gate.decision` = `IMPROVE_EXISTING` (of `NO_CHANGE` als de pagina intussen meet/analyse behandelt);
   - bij `IMPROVE_EXISTING` + geaccepteerd concept: `copy_ready = verified_gap = editorial_work_packet.evidence_verified = true`;
     bij afgewezen concept: alle drie `false` en `copy_status` noemt de reden.
4. Rapport wind-damage — verwacht:
   - `query_selection.destination.url` = `/emergency-roofing/wind-damage-roof-repair/` (zolang de Case Study vergrendeld is) en een wind-query;
   - `search_discovery.market.states = ["NJ"]`, `scope.location = "New Jersey, United States"`; geen Michigan/South Carolina in `fetched_competitor_urls`;
   - geen `COMPLETE_DESTINATION_HTML` tenzij `missing_evidence[0].detail` concrete taken noemt;
   - `DATA_BLOCKED` alleen met een blokkade die het echte tekort beschrijft (bv. `READABLE_COMPETITOR_ARTICLES` met diagnose).
5. In beide: `evidence_status` gelijk in `editorial_decision_gate`, `editorial_work_packet.evidence_ladder`, `report_completion.evidence_status`;
   tabel "Evidence status" in het eigenaarspakket; `publication_approved:false`; Case Study ongewijzigd.
