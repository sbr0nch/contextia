# Mappa di copertura (livelli x superfici)

Misurata il 2026-10-04 su `main` @ `ecaa583` (v2.0.4), Node 22.22 e Node 20.20.
Questa e' la fotografia **prima** di qualsiasi correzione. La sezione "Dopo" in
fondo viene aggiornata alla chiusura.

Legenda: **VERDE** = misurato e tenuto da una legge che resta nel repo.
**GIALLO** = in parte. **VUOTO** = non ancora misurato. **ROSSO** = misurato e
ha trovato un difetto (la riga dice quale e dove finisce la correzione).

## Passo 0: fotografia

| Cosa | Misura |
|---|---|
| `npm ci` su cartella pulita | 5,3 s |
| `npm run verify` su clone pulito | **ROSSO**: si ferma al typecheck dell'estensione (`Cannot find module '@sbr0nch/contextia-engine'`): il motore non ha `dist/` e i tipi si risolvono da li. Funziona solo dopo un build manuale del motore. |
| `npm run verify` dopo build del motore | verde, 7,6 s; 498 test motore (100% righe/rami/funzioni), 41 CLI, 24 estensione, 32 acceptance |
| `test:docs` / `test:pack` / `test:proxy` / `test:dom` | 11/11, 6/6, 8/8, 7/7; 1,8 s / 2,4 s / 4,2 s / 12,9 s |
| Node 20.20 (versione del CI) | stessa suite verde |
| `npm audit` | 3 moderate, tutte **solo dev** (vitest/@vitest/mocker, path traversal nel mock-redirect). `npm audit --omit=dev`: 0. Il pacchetto pubblicato non ha dipendenze a runtime (il CLI incorpora il motore con esbuild). |
| Licenze nel grafo | MIT 69, Apache-2.0 6, BSD 5, ISC 3, MPL-2.0 3 (dev), tutte compatibili con MIT per uso dev; nessuna a runtime. |
| Rilevatori | 83 (68 critical attivi, 15 warning spenti). Il README dice "50+". |

## Superfici

S1 motore (`detect`, `redact`, `customFindings`) · S2 rilevatori (83) ·
S3 `contextia scan` · S4 `contextia redact` · S5 proxy HTTP (richieste, stats, eventi, dashboard) ·
S6 `contextia run` · S7 hook del plugin Claude Code · S8 estensione: content script ·
S9 estensione: storage/log/reporter/background · S10 pacchetti e rilascio · S11 comandi nei documenti.

## Mappa

| # | Superficie | Livello | Domanda | Sonda | Nel repo | Ultima esecuzione | Esito |
|---|---|---|---|---|---|---|---|
| 1 | S1/S2 | 3 | Ogni rilevatore trova i suoi positivi e non i negativi? | fixture per rilevatore + acceptance (FP < 2%, zero critici mancati) | si | 2026-10-04 | VERDE |
| 2 | S1 | 3 | Il motore regge dati ostili (unicode, vuoto, 1 MB)? | `detect.test`, `perf.test` | si (poco) | 2026-10-04 | GIALLO |
| 3 | S2 | 11/G | Un input ostile da 1 MB blocca un rilevatore? | 25 generatori avversari x 83 rilevatori, worker con timeout | no | 2026-10-04 | **ROSSO** D1 |
| 4 | S5 | 3/C | Il proxy legge ogni forma di richiesta reale (Anthropic, OpenAI chat, Responses, tool_result, tool_use)? | 16 forme con segreto esca, processo reale + upstream finto | no | 2026-10-04 | **ROSSO** D2 |
| 5 | S5 | 5b | In redact il body che arriva all'upstream e' davvero senza segreto? | `proxy.test` (2 forme) | si | 2026-10-04 | GIALLO |
| 6 | S5 | 7 | Upstream giu', client che sparisce, richiesta malformata, 50 concorrenti | `test:proxy` (8 casi) | si | 2026-10-04 | VERDE |
| 7 | S5 | 7/5c | `--reversible` restituisce una risposta valida col segreto restaurato? | segreto PEM multi-riga, risposta JSON e SSE | no | 2026-10-04 | **ROSSO** D3 |
| 8 | S5 | 4/11 | Dashboard/stats/eventi: XSS, extra campi, cardinalita', loopback | `proxy.test` (escape, parseEventBatch, MAX_STAT_KEYS) | si | 2026-10-04 | VERDE |
| 9 | S5 | 4 | Altro origine (pagina web) o Host non-loopback che parla col proxy locale | non misurato | no | - | VUOTO |
| 10 | S5 | 11 | Fuzz del body (JSON profondo, gzip bomb, content-length bugiardo) | non misurato | no | - | VUOTO |
| 11 | S5 | 9 | 50 richieste concorrenti, vault per-richiesta | `test:proxy` | si | 2026-10-04 | VERDE |
| 12 | S3 | 5b/10 | `scan .` guarda tutti i file che contengono segreti? | cartella con `.env.production`, `.env.local`, `.aws/credentials`, `vendor/`, symlink | no | 2026-10-04 | **ROSSO** D4 |
| 13 | S3/S4 | 3/11 | Input piu' lungo del tetto: il CLI dice "pulito"? | file da 1,1 MB col segreto in coda | no | 2026-10-04 | **ROSSO** D5 |
| 14 | S3 | 10/S | L'anteprima in output (`maskValue`) nasconde il segreto? | password da 12 e 15 caratteri | no | 2026-10-04 | **ROSSO** D6 |
| 15 | S3/S6 | 3 | Comando sbagliato / `--port abc`: il CLI esce con un codice onesto? | `contextia scna .`, `--port abc` | no | 2026-10-04 | **ROSSO** D7 |
| 16 | S3/S4/S6/S11 | 5c | I comandi documentati fanno quello che dicono (exit code, formato) | `test:docs` (11 casi) | si | 2026-10-04 | VERDE |
| 17 | S3 | E | `--json` valido e stabile | non misurato | no | - | VUOTO |
| 18 | S7 | 7/11 | L'hook blocca sempre un prompt con segreto? Cosa fa se crasha? | payload non-stringa, `engine.js` mancante, config rotta | no | 2026-10-04 | **ROSSO** D8 |
| 19 | S7 | 7 | Prompt oltre il tetto: l'hook blocca | codice presente, nessun test | no | - | GIALLO |
| 20 | S8 | 5a | In Block, un Invio subito dopo la comparsa del segreto viene fermato? | Chromium vero, Invio a 0/20/50/100/200/400 ms | no | 2026-10-04 | **ROSSO** D9 |
| 21 | S8 | 3 | Il content script legge composer a blocchi (Lexical, ProseMirror, Quill, textarea) | `test:dom` (7 casi, Chromium) | si | 2026-10-04 | VERDE |
| 22 | S8/S9 | 3/S | Il log non contiene mai il segreto | `storage.test`, `logEntryFor` | si | 2026-10-04 | VERDE |
| 23 | S8/S9 | 11 | L'estensione non fa mai rete (salvo loopback opt-in) | `no-network.test`, `reporter.test` | si | 2026-10-04 | VERDE |
| 24 | S9 | 8 | Aggiornamento da impostazioni salvate da release vecchie | non misurato | no | - | VUOTO |
| 25 | S8 | 12/P/V/GV | Contrasto, aria, larghezze, tema chiaro/scuro, foto approvate | solo `screenshots.mjs` (non e' una legge) | no | - | VUOTO |
| 26 | S10 | 8 | Il pacchetto npm si installa e si importa da fuori workspace | `test:pack` (6 casi) | si | 2026-10-04 | VERDE |
| 27 | S10 | 8 | Un clone pulito passa `npm run verify` | clone pulito | no | 2026-10-04 | **ROSSO** D10 |
| 28 | S10 | 8 | Aggiornamento da OGNI release pubblicata (0.1.0 ... 2.0.3) | non misurato (serve npm registry) | no | - | VUOTO |
| 29 | S10 | 8 | `vendor/engine.js` del plugin e' quello del motore corrente | `npm run build` lo rigenera, nessun controllo che sia aggiornato | no | 2026-10-04 | GIALLO |
| 30 | S1-S9 | M | Mutation testing: quante modifiche al codice i test NON notano | non ancora | no | - | VUOTO |
| 31 | S1/S2 | R/D | Precisione/copertura contro un oracolo indipendente | corpus interno; nessun oracolo esterno | no | - | GIALLO |
| 32 | tutte | 6/T | Il tempo (job, scadenze, ora legale) | non applicabile: nessun job programmato | - | - | n/a |
| 33 | S5 | S | Segreti esca in log/stderr/stats del proxy | `proxy.test`, stderr durante probe | parziale | 2026-10-04 | GIALLO |

Difetti, in ordine di rischio: D2, D3, D1, D9, D8, D4, D5, D7, D6, D10.

## Cosa NON e' misurato in questa fase

Browser reali oltre Chromium (Firefox, Edge, Safari: dichiarati in `docs/BROWSERS.md`,
non provati); Windows e macOS (CLI, proxy, `run`, gestione di Ctrl+C); siti reali
(ChatGPT, Claude, Gemini: il DOM e' finto, ricostruito dai test); le release
npm vecchie; l'accessibilita' dell'interfaccia; un oracolo indipendente per i
falsi positivi/negativi; il comportamento con un agente vero (Claude Code,
Cursor) dietro il proxy.
