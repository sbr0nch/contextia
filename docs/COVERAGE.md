# Mappa di copertura (livelli x superfici)

Misurata il 2026-10-04. Base: `main` @ `ecaa583` (v2.0.4). Node 22.22; la suite e'
verde anche su Node 20.20, la versione del CI.

Legenda: **VERDE** = misurato e tenuto da una legge che resta nel repo e che e'
stata vista diventare rossa (sabotando il codice, o sul codice vecchio). Fanno
eccezione poche leggi di guardia su un comportamento gia' corretto (per esempio
"`scan` salta ancora `.git` e `node_modules`"), che non possono essere rosse sul codice
vecchio.
**GIALLO** = in parte. **VUOTO** = non misurato. Una riga con "NON PROVATO"
dentro e' un verde parziale.

## 1. Fotografia (passo 0)

| Cosa | Prima | Dopo |
|---|---|---|
| `npm ci && npm run verify` su clone pulito | **falliva dopo 1 s** (il motore non aveva `dist/`, il typecheck dell'estensione non lo trovava). La CI di `main` e' rossa sugli ultimi 5 push, release 2.0.4 compresa | verde in 19 s (`npm run test:clean`) |
| Test (unit + acceptance) | 595 | 901 (motore 692, CLI 123, estensione 54, acceptance 32) |
| Casi di processo (docs, pack, proxy, browser) | 32 | 44 |
| `verify` | 7,6 s | 25 s (le leggi sui dati ostili da sole ne valgono circa 7) |
| `npm audit` | 3 moderate, solo dev (vitest, path traversal nel mock) | invariato; `--omit=dev`: 0 |
| Dipendenze a runtime | 0 (il CLI incorpora il motore) | 0 |
| Licenze nel grafo | MIT, Apache-2.0, BSD, ISC; 3 MPL-2.0 solo dev | invariato |
| Rilevatori | 83 (il README dice "50+") | 83 |
| Release pubblicate | 10 CLI (0.1.0 ... 2.0.3), 9 motore | vedi riga 28 |

## 2. Difetti trovati, in ordine di rischio

Peso = misura fatta prima di correggere. Ogni correzione ha la sua legge, vista rossa.

| # | Dove | Peso misurato | Correzione | Legge |
|---|---|---|---|---|
| D2 | proxy | 9 forme di richiesta su 13 portavano il segreto all'upstream senza avviso: `tool_result` (dove torna il `.env` che l'agente ha letto), `tool_use`, argomenti delle chiamate, tutta l'API Responses, prompt legacy, Gemini | lettura generica iterativa di ogni stringa; firma solo nella prosa | `proxy-shapes.test.ts` |
| D15 | proxy (regressione mia, trovata dal revisore) | le esenzioni "base64" e "thinking" erano troppo larghe: un documento di testo, un prefisso `data:` o un oggetto `thinking` nascondevano segreti | esenzioni strette: solo i campi firmati di `thinking` e base64 lungo, senza spazi, dichiarato media | `proxy-shapes.test.ts` |
| D16 | proxy | solo POST e PUT venivano scansionati: un PATCH o DELETE passava | ogni metodo con corpo | `proxy-behaviour.test.ts` |
| D3 | proxy `--reversible` | risposta JSON e SSE non valide con un segreto che ha newline, virgolette o backslash (chiave PEM, URL con password) | restauro con escape JSON per JSON e event-stream | `proxy-reversible.test.ts` |
| D11 | proxy, pagine locali | una pagina web ha iniettato 99.999 eventi falsi "leaked"; stats e dashboard rispondevano a un `Host` estraneo (DNS rebinding) | `Host` loopback e `Origin` solo estensione o assente | `proxy-local.test.ts` |
| D12 | proxy | una gzip da 400 KB veniva espansa a 400 MB (e inoltrata) | tetto di decompressione a 5 MB | `proxy-local.test.ts` |
| D1 | motore, ReDoS | `email` 6,4 s, `internal_hostname` 6,3 s, `db_connection_string` 3,7 s su 80 KB (x4 a ogni raddoppio); `private_key` 11,7 s su 1 MB | `email` e `db_connection_string` partono da `@` e `://`; `private_key` accoppia BEGIN e END; `internal_hostname` con etichette atomiche | `hostile.test.ts`, `equivalence.test.ts` |
| D20 | motore (trovato dal revisore) | `internal_hostname` ancora 19,6 s su 1 MB di etichette da 63 caratteri | atomiche + un `.tld` entro 253 caratteri: 1,3 s | `hostile.test.ts` |
| D14 | motore | 14 rilevatori non riconoscevano un token che finisce con `-` o `.` (circa 1 su 64): `\b` dopo un non-word | `(?!\w)` | `token-end.test.ts` |
| D9 | estensione, modalita' Block | un Invio entro ~100 ms dalla comparsa del segreto passava (Chromium vero) | riscansione prima di ogni decisione | `test:dom` (3 casi) |
| D8 | hook del plugin | un crash (bundle mancante, prompt non testo, stdin illeggibile) = il prompt partiva | blocca con un motivo | `hook.test.ts` (16 casi, processo vero) |
| D4 | CLI `scan .` | saltava `.env.production`, `.env.local`, `.aws/credentials`, i symlink; presente in tutte le 10 release | legge i dotfile, segue i symlink a file, un file sotto due nomi una volta | `test:docs` |
| D5 | CLI | un file oltre il tetto del motore: "0 secrets found", exit 0, e `redact` stampava la coda in chiaro | scansione a finestre; ogni finestra possiede la sua zona centrale (contesto 250.000 caratteri per lato) | `core.test.ts`, `test:docs` |
| D13 | CLI `--json` | su pipe l'output si fermava a 65.536 byte su 807.789: JSON non valido | `process.exitCode` invece di `process.exit()` | `test:docs` |
| D6 | CLI e estensione | l'anteprima mostrava 8 caratteri di tutto cio' che supera 10: 2/3 di una password da 12 | al massimo un quinto | `core.test.ts`, `mask.test.ts` |
| D7 | CLI | `contextia scna .` stampava l'help ed usciva 0; `--port abc` stack trace | exit 2 con messaggio | `test:docs` |
| D10 | build | `verify` falliva su clone pulito | build del motore prima di typecheck/test; `test:clean` | CI + `test:clean` |
| D17 | CLI (regressione mia, trovata dal revisore) | finestre con 64 KB di sovrapposizione: chiave piu' lunga persa, token a cavallo riportato due volte | vedi D5 | `core.test.ts` (griglia di posizioni, indipendente dalle costanti) |

## 3. Mappa

| # | Superficie | Livello | Domanda | Sonda | Esito | Dove |
|---|---|---|---|---|---|---|
| 1 | motore, rilevatori | 3 | trovano i positivi, non i negativi | fixture + acceptance (FP < 2%) | VERDE | `detectors.test`, `acceptance` |
| 2 | motore | 3/11 | dati ostili, tetto, confini | 28 forme x 83 rilevatori; confini esatti | VERDE | `hostile.test`, `boundaries.test` |
| 3 | motore | R | le regole riscritte trovano quello che trovavano | 20.000 input casuali per rilevatore vs la regex originale | VERDE | `equivalence.test` |
| 4 | proxy | 3/C | ogni forma di richiesta reale | 15 forme, processo vero | VERDE (D2, D15, D16) | `proxy-shapes.test` |
| 5 | proxy | 5b | cosa arriva all'upstream | upstream registrante, intestazioni, metodi, tetti | VERDE | `proxy-behaviour.test` |
| 6 | proxy | 7 | upstream che cade, client che sparisce, richiesta malformata, 50 concorrenti | processo vero | VERDE | `test:proxy` |
| 7 | proxy | 7/5c | `--reversible` valido | JSON, SSE, testo; PEM, quote, backslash | VERDE per risposte non a flusso; **NON PROVATO** quando il modello spezza il token su piu' eventi SSE | `proxy-reversible.test` |
| 8 | proxy | 4 | pagine locali: pagina web, Host estraneo | richieste con `Origin` e `Host` falsi | VERDE (D11) | `proxy-local.test` |
| 9 | proxy | 11 | bomba di decompressione, annidamento 200.000, 5 MB | gzip/deflate/brotli | VERDE (D12) | `proxy-local.test`, `proxy-shapes.test` |
| 10 | proxy | 11 | JSON con chiavi duplicate, numeri oltre 2^53, segreto in una chiave | non coperto | GIALLO: vedi "non risolto" | - |
| 11 | CLI `scan`/`redact` | 5b/10 | dotfile, symlink, file grandi, pipe | processo vero | VERDE (D4, D5, D13) | `test:docs` |
| 12 | CLI | 3/S | l'anteprima non rivela il segreto | tutte le lunghezze 1..300 | VERDE (D6) | `core.test`, `mask.test` |
| 13 | CLI | 5c | exit code onesti, help | processo vero | VERDE (D7) | `test:docs` |
| 14 | CLI | E | `--json` valido: vuoto, nomi con virgolette/newline/tab/accenti, 3000 righe su pipe | processo vero | VERDE | `test:docs` |
| 15 | hook plugin | 7/11 | blocca sempre; cosa fa se non puo' leggere | processo vero, 16 casi | VERDE (D8) | `hook.test` |
| 16 | estensione | 5a | Invio subito dopo il segreto in Block | Chromium vero | VERDE (D9) | `test:dom` |
| 17 | estensione | 3 | composer a blocchi (Lexical, ProseMirror, Quill, textarea) | Chromium vero | VERDE | `test:dom` |
| 18 | estensione | 3/S | log senza il segreto; default che mantengono la privacy | `storage.test` (default `localStatsEnabled: false`) | VERDE | `storage.test` |
| 19 | estensione | 11 | zero rete salvo loopback opt-in | `no-network.test`, `reporter.test` | VERDE | idem |
| 20 | estensione | 8 | impostazioni salvate da release vecchie | nomi delle chiavi di storage, forma parziale | GIALLO: **simulato**, non su un'installazione vera | `storage.test` |
| 21 | estensione | 12/P/V/GV | accessibilita', contrasto, larghezze, tema | non misurato | VUOTO | - |
| 22 | pacchetti | 8 | installazione da fuori workspace | `test:pack` | VERDE | `test:pack` |
| 23 | pacchetti | 8 | il bundle del plugin e' il motore corrente | rebuild e confronto byte per byte | VERDE | `test:pack` |
| 24 | repo | 8 | clone pulito -> verify verde | `test:clean` | VERDE (D10) | `scripts/test-clean-clone.mjs` |
| 25 | release | 8 | installazione e uso di OGNI release vecchia | 10 release CLI installate e usate su un fixture | misurato a mano: tutte installano e rispondono uguale; nessuna legge nel repo | GIALLO |
| 26 | motore | M | mutation testing | Stryker sul motore e sul codice nuovo | vedi sezione 4 | GIALLO |
| 27 | motore | R/D | contro un oracolo indipendente | detect-secrets su 570 segreti casuali | misurato; script nel repo, non in CI | GIALLO |
| 28 | tutto | 6/T | tempo, job, fusi | non applicabile (nessun job) | n/a | - |
| 29 | proxy, hook, CLI | S | segreti esca in stderr, 403, anteprime, stats | 403 e motivi dell'hook senza il valore; anteprime <= 1/5; stats solo conteggi | VERDE per gli output elencati; **non** per log di terzi | `proxy-behaviour`, `hook.test` |

## 4. Numeri

**Prima/dopo con lo stesso script** (`node scripts/benchmarks.mjs --root <albero>`,
albero vecchio costruito da `ecaa583`):

| | Prima | Dopo |
|---|---|---|
| `email`, punti e lettere, 80 KB | 6.432 ms (x4,2 a ogni raddoppio) | 0 ms |
| `internal_hostname`, 80 KB | 6.309 ms (x3,8) | 47 ms |
| `db_connection_string`, 80 KB | 3.728 ms (x4,1) | 0 ms |
| `private_key`, 1 MB di BEGIN senza END | 11.737 ms (x4) | 1 ms |
| Forme di richiesta che perdono il segreto (redact) | 9 su 13 | 0 su 13 |
| `--reversible` con chiave PEM: risposta JSON / SSE valida | no / no | si / si |
| Velocita' su testo normale | 28 ms/MB | 28 ms/MB |

Il tempo di scansione su testo normale non cambia: le correzioni non costano velocita'.
La forma di `email` e `db_connection_string` in questa tabella non contiene `@` ne' `://`,
quindi "0 ms" e' il percorso veloce; i casi con `@` e `://` sono nella legge `hostile.test.ts`.

**Mutation testing** (Stryker; solo le suite unit, i test di processo non contano):

| Modulo | Prima | Dopo |
|---|---|---|
| motore: `detect`, `redact`, `custom`, helper | 81,2% | 93,7% (i 12 che restano sono mutanti equivalenti) |
| CLI: `proxy.ts` | 60,7% | 78,1% |
| CLI: `core.ts` | 79,8% | 83,2% |
| estensione: gate, storage, reporter, mask | 69,1% (insieme) | 100% (quattro moduli) |
| estensione: `send-button.ts` | 75,6% | 86,7% |
| estensione: `composer.ts` | 49,5% | invariato: logica DOM, coperta da `test:dom` che Stryker non conta |

Il motore aveva il 100% di copertura di righe e 36 modifiche su 191 che i test non notavano.

**Prima/dopo su dati veri**: 9.809 file (76,7 MB) e 83 rilevatori, vecchio contro
nuovo: 6.827 risultati identici; l'unica differenza e' `internal_hostname` su due
file CSS (un elenco di parole chiave letto come hostname da 2.573 caratteri: il nuovo
si ferma a 253, come il DNS). Nessuna perdita.

**Oracolo** (`node scripts/oracle.mjs`): 570 segreti casuali, uno per file, 19 tipi,
5 contesti (.env, JSON, sorgente, markdown, log), generati da me dai formati
pubblici dei fornitori, non dalle regex di nessuno dei due strumenti.

| | Contextia | detect-secrets (solo pattern) | detect-secrets (default) |
|---|---|---|---|
| segreti trovati | 570/570 (prima della D14: 561) | 366/570 | 410/570 |
| contesto "sorgente" (`client("AKIA...")`) | 114/114 | 6/114 | 6/114 |
| falsi positivi su 5.151 file di terzi (`node_modules` pulito, senza il bundle del nostro CLI) | 8 in 7 file | 4 in 3 | 182 in 51 |

Il divario sul contesto "sorgente" e' una scelta di progetto di detect-secrets (filtro
sui riferimenti indiretti), non un suo difetto. Escluso quel contesto, detect-secrets
(default) trova 404/456 e Contextia 456/456. **Il corpus lo ho costruito io, e
Contextia ha meno falsi positivi del default di detect-secrets ma il doppio dei suoi
soli pattern (8 contro 4: esempi con credenziali finte nella documentazione di terzi).** Non va citato senza questa frase.

**Release pubblicate** (installate da npm e usate su un fixture): tutte e 10 le
release del CLI installano, segnalano il segreto (exit 1), producono JSON valido e
escono 0 su file pulito. **Nessuna** (da 0.1.0) legge `.env.local` in una scansione
di cartella: D4 c'era dall'inizio. L'import del motore fallisce in tutte tranne la
2.0.3 (gia' noto, corretto li').

## 5. Non risolto (dichiarato, non nascosto)

- **Redact riscrive il JSON**: un corpo con un segreto passa per `JSON.parse` e
  `JSON.stringify`, quindi numeri oltre 2^53 e `1.10` cambiano (`9007199254740993` ->
  `9007199254740992`). Pre-esistente.
- **Token reversibili spezzati su piu' eventi SSE** (il modello li tokenizza): il
  segreto non viene restaurato. Riprodotto con un upstream finto, **non** con un
  modello vero. Idem un upstream che scrive `⟨`.
- **Costo di molte stringhe piccole**: 100.000 stringhe da 2 caratteri (500 KB) bloccano
  il proxy per 2,1 s. Un corpo da 5 MB puo' tenerlo occupato molti secondi.
- **Chiavi duplicate nel JSON**: `JSON.parse` tiene l'ultima; se l'upstream tiene la
  prima, la differenza non e' coperta. Un segreto in una chiave oggetto non e' letto.
- **Il contenuto di un blocco `thinking`** (firmato) non e' letto ne' riscritto.
- **Block rifiuta corpi oltre 5 MB** (anche un'immagine legittima) e non scansiona oltre.
  Il corpo e' letto interamente in memoria prima di questo controllo.
- **Estensione**: la riscansione guarda il primo composer visibile, non quello da cui
  parte l'Invio; con un secondo editor (modifica di un messaggio) non provato. Auto-redact
  durante il keydown dipende dall'editor, non provato.
- **Un match singolo oltre 250.000 caratteri** non si trova nella scansione a finestre.

## 6. Cosa NON e' provato

Windows e macOS (CLI, proxy, `contextia run`, Ctrl+C, il `process.exit` del hook su
pipe); Firefox, Edge e Safari (dichiarati in `docs/BROWSERS.md`); i siti veri
(ChatGPT, Claude, Gemini: il DOM dei test e' ricostruito); un agente vero dietro il
proxy (Claude Code, Cursor, Windsurf: il README promette Cursor e Windsurf, non
provati); modelli veri nelle risposte in streaming; accessibilita' e contrasto
dell'estensione; aggiornamento dell'estensione su un'installazione vera; un
fuzzer vero sul proxy (solo casi mirati); mutation testing di `cli.ts`, `content.ts`,
`options.ts`, `ui.ts`; la cronologia degli store (Chrome serve la 2.0.1 secondo il
messaggio della release 2.0.4, non verificato).

---

# Valutazione a ruoli

Giudizio = verde, giallo, rosso. Prova = misurato in questa sessione. "non misurato"
e' una risposta valida.

| Figura | Giudizio | La prova | Cosa manca per alzarlo |
|---|---|---|---|
| **CEO / owner** | rosso oggi, giallo dopo il rilascio | la 2.0.4 e' uscita con la CI rossa; chi usa il proxy con un agente (tool_result, Responses) non era protetto in 9 forme su 13. Il difetto e' presente da sempre (D4 in tutte le 10 release) | rilascio di una nuova versione; avviso agli utenti del proxy; non pubblicare i numeri prima |
| **CTO / architetto** | giallo | zero dipendenze runtime; 1 solo autore (21 commit, tutti `sbr0nch`); `proxy.ts` e' il punto singolo di guasto per chi lo usa; la scansione a finestre raddoppia il lavoro sui file oltre 1 MB; Stryker non funziona con TypeScript 7 | un secondo manutentore; mutation testing in CI (richiede una versione compatibile) |
| **CISO / sicurezza** | giallo | SECURITY.md esiste con un canale privato e una promessa di risposta "entro pochi giorni" (nessun SLA, nessun advisory pubblicato: non verificato); superficie locale chiusa (D11, D12); il guardiano ora fallisce chiuso. Aperti: sezione 5 | decisione sulle voci di sezione 5; un advisory per D2 |
| **Prodotto / UX** | giallo | `scan .` ora fa quello che dice; messaggi d'errore chiari; un nuovo utente **non e' stato provato**; nessuna misura di accessibilita' | prova con una persona vera; misura WCAG |
| **QA** | verde con riserva | 901 test + 44 casi di processo, nessuno saltato (`skip`/`only`: 0); ogni legge nuova vista rossa; punteggio di mutazione 78-100% sul codice toccato. Riserva: `composer.ts` 49,5% e il resto dell'estensione non muta | mutation testing di `content.ts`, `ui.ts`, `options.ts` |
| **Ops / SRE** | giallo | installazione pulita 19 s; 10 release installate e usate; nessuno stato lato server (niente backup da ripristinare); rollback = pubblicare una versione nuova (npm non permette di ritirarne una). Windows/macOS non provati | prova su Windows e macOS; un job notturno con `test:clean` e le release vecchie |
| **Supporto / utenti** | giallo | di cosa si lamenteranno per primo: Block che rifiuta un corpo oltre 5 MB (immagini); l'hook che blocca quando non legge stdin; il CLI che ora esce 2 su un comando sbagliato | messaggi con la via d'uscita per il primo e il secondo |
| **Sales / marketing** | giallo | il README dice "50+" (sono 83); promette Cursor e Windsurf (non provati); "nothing leaves your machine": coerente con i test. I numeri dell'oracolo sono su un corpus costruito da me | provare Cursor/Windsurf; un corpus esterno per il confronto |
| **Legale / privacy** | verde | MIT; nessuna dipendenza runtime; `PRIVACY.md` coerente con i test di zero-rete e di log senza segreti; il proxy inoltra solo la richiesta dell'agente | nulla di misurato che manchi |
| **Maintainer open source** | giallo | CHANGELOG e versioni chiari; 5 push con CI rossa non notati, release compresa; dependabot attivo; bus factor 1 | notifica sulla CI rossa; una persona in piu' |
| **Nuovo contributore** | verde | clone pulito -> `verify` verde in 19 s (prima falliva in 1 s); CONTRIBUTING corretto; Playwright serve solo per `test:dom` | nulla di misurato che manchi |
| **Chi lo usa come dipendenza** | giallo | API del motore invariata (stessi export); da 2.0.3 importabile. Cambiano comportamenti: exit 2 su comando sconosciuto, anteprime piu' corte, il proxy blocca di piu', alcuni span dei rilevatori | numero di versione che lo dica (consiglio minore, 2.1.0); nota nel CHANGELOG |

## Dove le figure si contraddicono

- **CEO e marketing contro CISO.** Il CEO vuole rilasciare subito e pubblicare i dati
  ("incredibili"). Il CISO dice che il rilascio deve precedere ogni pubblicazione: i
  numeri "prima" sono una mappa dei punti deboli di chi non ha aggiornato. Ho dato
  ragione al CISO sull'ordine.
- **CISO contro Supporto e Ops.** Il guardiano che fallisce chiuso (hook senza motore
  o senza stdin) e' giusto per la sicurezza e blocca tutti i prompt se il bundle e'
  rotto. Ho scelto fail-closed, coerente con quello che il codice gia' faceva per i
  prompt troppo lunghi. Resta una scelta tua.
- **CISO contro Prodotto.** Block rifiuta un corpo oltre 5 MB: sicuro, ma rifiuta
  un'immagine legittima. Non risolto.
- **Marketing contro QA.** Marketing vuole "570 su 570"; QA dice che il corpus l'ha
  scritto la stessa persona che ha corretto il rilevatore. Non va citato senza il
  limite scritto sopra.
- **CTO contro Ops.** Le finestre raddoppiano il costo sui file grandi; Ops preferisce
  completezza a velocita'. Ho scelto completezza.
- **Maintainer contro trasparenza.** Per togliere ogni riferimento a strumenti dai
  commit ho riscritto la cronologia del mio branch (prima di ogni PR). Cosa persa: nulla,
  il contenuto e' identico; il vecchio hash non esiste piu'.

## Raccomandazione

Ordine:

1. **Ripristinare l'accesso GitHub della sessione** (il push e' bloccato dalla sessione
   con 403) e aprire la PR.
2. **Rileggere la PR** (la parte a rischio: `proxy.ts`, `cli.ts`/`core.ts`, `guard.mjs`,
   `content.ts`, i quattro rilevatori).
3. **Rilasciare 2.1.0** (non 2.0.5: ci sono cambiamenti di comportamento) con
   CHANGELOG; aggiornare insieme plugin, npm, estensione (la Chrome Web Store serve la
   2.0.1, secondo il messaggio della release).
4. **Solo dopo**, pubblicare sul sito la pagina con prima/dopo, usando
   `scripts/benchmarks.mjs` (riproducibile) e `scripts/oracle.mjs` con le sue
   riserve scritte.

Cosa mi farebbe cambiare idea: una prova con un modello vero in streaming che mostri
il token reversibile spezzato (priorita' sul punto 3); un fallimento su Windows del
hook o del proxy; il revisore che trova una seconda regressione nelle correzioni.

## Cosa serve a te (separato da cio' che faccio io)

- Riconnettere GitHub: https://claude.ai/connect-github (e la GitHub App sul repo).
- Decidere: numero di versione (2.1.0?), hook fail-closed o no, se e quando pubblicare.
- Macchine e account: **Windows** e **macOS** (CLI, proxy, `run`, Ctrl+C, hook);
  **Firefox, Edge, Safari**; account veri su **ChatGPT, Claude, Gemini** per provare
  l'estensione sul DOM vero; un'installazione di **Claude Code**, **Cursor** e
  **Windsurf** per provare il proxy con un agente vero (e un modello in streaming per
  il token reversibile); i permessi di pubblicazione su **npm**, **Chrome Web Store**
  e **AMO**; un secondo manutentore.
