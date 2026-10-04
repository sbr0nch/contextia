# Mappa di copertura (livelli x superfici)

Misurata il 2026-10-04. Base: `main` @ `ecaa583` (v2.0.4). Node 22.22; la suite e'
verde anche su Node 20.20, la versione del CI. Aggiornata a fine lotto: browser veri
(Chromium 141, Chrome for Testing 154, Firefox 157), Windows e macOS in CI.

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
| Test (unit + acceptance) | 595 | 3.981 (motore 3.742, CLI 153, estensione 54, acceptance 32; 3.015 del motore sono la legge dei contesti) |
| Casi di processo (docs 20, pack 7, proxy 26, browser: dom 15, a11y 19, schermate 18, Firefox 14) | 32 | 119 |
| `verify` | 7,6 s | 25 s (le leggi sui dati ostili da sole ne valgono circa 7) |
| `npm audit` | 3 moderate, solo dev (vitest, path traversal nel mock) | invariato; `--omit=dev`: 0. Il rimedio e' vitest 5, che richiede Node >= 22.12: il prodotto dichiara Node >= 20 e il CI lo prova, quindi non lo prendo (la PR dependabot resta rossa per questo) |
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
| D18 | proxy redact | il corpo passava per parse e stringify: `9007199254740993` diventava `...992`, `1.10` diventava `1.1`, una chiave ripetuta spariva, un segreto in una chiave non era letto | lettore che registra dove sta ogni stringa e chiave; il redact e' fatto sul testo originale; ogni occorrenza di una chiave doppia e' scansionata, in ogni modo | `json.test.ts` (80.000 documenti contro `JSON.parse`), `proxy-behaviour.test.ts` |
| D19 | proxy, memoria | un corpo da 300 MB portava il proxy a 1.268 MB (letto intero, senza tetto) | oltre 64 MB: 413 senza inoltro (picco 130 MB); tetto di scansione da 5 a 32 MB | `proxy-behaviour.test.ts` |
| D21 | proxy, Windows e macOS | dopo un 413 il client vedeva ECONNRESET (Windows) o EPIPE (macOS) invece della risposta | il resto del corpo e' letto e scartato (al piu' 30 s) | CI `Platforms` |
| D22 | CLI | una porta occupata: `Unhandled error event`; un upstream irraggiungibile: `TypeError: fetch failed` | messaggio con porta e motivo, exit 1; il 502 nomina upstream e causa | `process-faults.mjs` (15 casi, processi veri) |
| D23 | hook del plugin | il blocco poteva andare perso su una pipe asincrona: `process.exit()` subito dopo `write()` | esce dal callback della scrittura | `hook.test.ts` (4 casi con stdout ritardato) |
| D24 | estensione | un invio da un secondo editor (la modifica di un messaggio) era giudicato sul testo del primo: un segreto passava, un editor pulito era fermato | l'editor si prende dall'evento | `test:dom` (5 casi) |
| D25 | estensione, accessibilita' | 85 checkbox senza nome, popup senza titolo e senza landmark, indicatore `div` senza ruolo ne' tastiera, contrasto 1,6:1 (minimo 4,5:1), blocco annunciato per 4 s | titoli, ruoli, nomi; l'indicatore e' un bottone con dialogo; pannello quasi opaco; `role=alert` | `test:a11y` (19 controlli) |
| D26 | estensione, Block | un Invio sull'indicatore o su "Redact all" era letto come un invio e fermato: da tastiera non si risolveva il blocco | gli eventi dell'interfaccia propria non sono giudicati | `test:a11y` |
| D27 | estensione | con lo storage non leggibile il popup girava per sempre e la pagina delle opzioni restava bianca con un errore non gestito | messaggio e "Riprova" | `test:states` |
| D28 | estensione, Firefox 157 | traccia di scorrimento bianca nella lista scura; il titolo del pannello addossato ai pulsanti (visti guardando le foto, non da un controllo) | `scrollbar-color`, pannello da 320 px | `test:firefox` (2 controlli) |
| D29 | motore | `env_secret` vedeva `KEY=valore` solo a inizio riga: `OPENAI_API_KEY=sk-... python app.py` passava (32 casi su 3.015 nei contesti) | maiuscolo anche a meta' riga; `$VAR`, letterali regex e valori con `( ) { } , ;` non sono valori | `context.test.ts`, fixture |
| D30 | proxy `--reversible` | un segnaposto spezzato su piu' eventi in streaming restava segnaposto | le stringhe di un campo sono unite in ordine prima del restauro | `proxy-reversible.test.ts` (3 formati, ogni posizione) |
| D31 | proxy redact e warn (regressione mia, trovata dalla revisione indipendente) | una chiave ripetuta in un punto qualsiasi rendeva il corpo "ambiguo" e lo inoltrava senza scansione: in redact il segreto passava, mentre prima `JSON.parse` lo faceva redigere | ogni occorrenza di ogni stringa e' scansionata e redatta per posizione, in ogni modo | `proxy-behaviour.test.ts` (3 modi, segreto nell'occorrenza ombreggiata) |
| D32 | proxy | `patchJson` cercava ogni chiave in una lista: 60.000 chiavi riscritte, 6,4 s sul ciclo di eventi | mappa per posizione | `json.test.ts` (1,5 s di tetto) |
| D33 | motore | `env_secret` quadratico su testo denso di parole chiave senza `=` (`AUTHAUTH...`: 3,3 s a 80 KB, 23 s nella legge) | nome intorno alla parola chiave limitato a 64 caratteri | `hostile.test.ts` (3 forme nuove) |
| D34 | estensione | un invio da un form con piu' editor (prompt di sistema e messaggio) era giudicato sul primo editor: un segreto nel secondo passava | si giudicano tutti gli editor del form | `test:dom` (4 casi, il primo rosso sul codice vecchio) |

## 3. Mappa

| # | Superficie | Livello | Domanda | Sonda | Esito | Dove |
|---|---|---|---|---|---|---|
| 1 | motore, rilevatori | 3 | trovano i positivi, non i negativi | fixture + acceptance (FP < 2%) | VERDE | `detectors.test`, `acceptance` |
| 2 | motore | 3/11 | dati ostili, tetto, confini | 28 forme x 83 rilevatori; confini esatti | VERDE | `hostile.test`, `boundaries.test` |
| 3 | motore | R | le regole riscritte trovano quello che trovavano | 20.000 input casuali per rilevatore vs la regex originale | VERDE | `equivalence.test` |
| 4 | proxy | 3/C | ogni forma di richiesta reale | 15 forme, processo vero | VERDE (D2, D15, D16) | `proxy-shapes.test` |
| 5 | proxy | 5b | cosa arriva all'upstream | upstream registrante, intestazioni, metodi, tetti | VERDE | `proxy-behaviour.test` |
| 6 | proxy | 7 | upstream che cade, client che sparisce, richiesta malformata, 50 concorrenti | processo vero | VERDE | `test:proxy` |
| 7 | proxy | 7/5c | `--reversible` valido | JSON, SSE, testo; PEM, quote, backslash | VERDE per risposte non a flusso e per segnaposto spezzati su piu' eventi (3 formati, ogni posizione, upstream finto: D30); **NON PROVATO** con un modello vero | `proxy-reversible.test` |
| 8 | proxy | 4 | pagine locali: pagina web, Host estraneo | richieste con `Origin` e `Host` falsi | VERDE (D11) | `proxy-local.test` |
| 9 | proxy | 11 | bomba di decompressione, annidamento 200.000, 5 MB | gzip/deflate/brotli | VERDE (D12) | `proxy-local.test`, `proxy-shapes.test` |
| 10 | proxy | 11 | JSON con chiavi duplicate, numeri oltre 2^53, segreto in una chiave | 80.000 documenti casuali e mutati contro `JSON.parse` | VERDE (D18) | `json.test` |
| 11 | CLI `scan`/`redact` | 5b/10 | dotfile, symlink, file grandi, pipe | processo vero | VERDE (D4, D5, D13) | `test:docs` |
| 12 | CLI | 3/S | l'anteprima non rivela il segreto | tutte le lunghezze 1..300 | VERDE (D6) | `core.test`, `mask.test` |
| 13 | CLI | 5c | exit code onesti, help | processo vero | VERDE (D7) | `test:docs` |
| 14 | CLI | E | `--json` valido: vuoto, nomi con virgolette/newline/tab/accenti, 3000 righe su pipe | processo vero | VERDE | `test:docs` |
| 15 | hook plugin | 7/11 | blocca sempre; cosa fa se non puo' leggere | processo vero, 16 casi | VERDE (D8) | `hook.test` |
| 16 | estensione | 5a | Invio subito dopo il segreto in Block; secondo editor | Chromium 141 e Chrome for Testing 154 | VERDE (D9, D24) | `test:dom` |
| 17 | estensione | 3 | composer a blocchi (Lexical, ProseMirror, Quill, textarea) | Chromium vero | VERDE | `test:dom` |
| 18 | estensione | 3/S | log senza il segreto; default che mantengono la privacy | `storage.test` (default `localStatsEnabled: false`) | VERDE | `storage.test` |
| 19 | estensione | 11 | zero rete salvo loopback opt-in | `no-network.test`, `reporter.test` | VERDE | idem |
| 20 | estensione | 8 | impostazioni salvate da release vecchie | nomi delle chiavi di storage, forma parziale | GIALLO: **simulato**, non su un'installazione vera | `storage.test` |
| 21 | estensione | 12/P/V/GV | accessibilita', contrasto, larghezze | axe-core + tastiera su popup, opzioni, indicatore; pagina bianca, grigia, scura; 3 larghezze | VERDE (D25, D26) | `test:a11y` |
| 22 | pacchetti | 8 | installazione da fuori workspace | `test:pack` | VERDE | `test:pack` |
| 23 | pacchetti | 8 | il bundle del plugin e' il motore corrente | rebuild e confronto byte per byte | VERDE | `test:pack` |
| 24 | repo | 8 | clone pulito -> verify verde | `test:clean` | VERDE (D10) | `scripts/test-clean-clone.mjs` |
| 25 | release | 8 | installazione e uso di OGNI release vecchia | 10 release CLI installate e usate su un fixture | misurato a mano: tutte installano e rispondono uguale; nessuna legge nel repo | GIALLO |
| 26 | motore, CLI, estensione | M | mutation testing | Stryker sulle suite unit, in una copia con TypeScript 5; job settimanale | vedi sezione 4 | GIALLO: `content.ts`, `ui.ts`, `options.ts`, `popup.ts` e `cli.ts` non muovono (logica DOM o di processo, coperta da test che Stryker non conta) |
| 27 | motore | R/D | contro un oracolo indipendente | detect-secrets su 570 segreti casuali | misurato; script nel repo, non in CI | GIALLO |
| 28 | tutto | 6/T | tempo, job, fusi | non applicabile (nessun job) | n/a | - |
| 29 | proxy, hook, CLI | S | segreti esca in stderr, 403, anteprime, stats | 403 e motivi dell'hook senza il valore; anteprime <= 1/5; stats solo conteggi | VERDE per gli output elencati; **non** per log di terzi | `proxy-behaviour`, `hook.test` |
| 30 | estensione | P/V | ogni schermata in 18 stati: vuoto, con attivita', storage in errore, impronta, bloccato, testo troppo lungo; 360-1280 px | scrive l'errore, testo leggibile, nessuno scorrimento laterale, impronta percettiva di ogni foto | VERDE (D27); l'impronta dice "e' cambiata", non "e' brutta": le foto vanno guardate | `test:states` |
| 31 | estensione | 5a/P | Firefox 157 vero: installazione, popup, opzioni, digitazione vera, Block, Redact all | controllo remoto di Firefox (Marionette), `claude.ai` mappato su un server locale HTTPS | VERDE (D28); popup e opzioni come schede, non nella cornice della barra | `test:firefox` |
| 32 | CLI, proxy, hook, pacchetti | 8 | Windows e macOS, Node 20 e 22 | `Platforms` in CI | VERDE per `verify`, `test:docs`, `test:pack`, `test:proxy`; **NON PROVATI** SIGTERM e SIGINT su Windows e la memoria su Windows | `.github/workflows/platforms.yml` |
| 33 | motore | 3 | ogni fixture trovata nei contesti reali (virgolette, frase, code fence, CRLF, 90 KB prima, due volte, prima di un comando) | 3.015 casi | VERDE (D29) | `context.test` |
| 34 | motore | 3 | falsi positivi su codice di altri | 3.322 file (21 MB) di `node_modules`, 83 rilevatori: 7 risultati (2 chiavi PEM di prova, 4 `utente:password@` di esempio, 1 `tokenValue = scanString(...)`) | misura; l'ultimo e' un falso positivo noto di `env_secret` a inizio riga | script non nel repo |


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
| motore: `detect` | 81,2% (insieme) | 92,4% |
| motore: `redact`, `custom`, `_util` | (insieme) | 94,1%, 92,9%, 95,7% (i rimasti sono mutanti equivalenti) |
| CLI: `proxy.ts` | 60,7% | 75,8% (include il codice nuovo: `restoreStream`, lettura del corpo, scansione di ogni stringa) |
| CLI: `core.ts` | 79,8% | 83,3% |
| CLI: `json.ts` (nuovo) | n/a | 94,6% |
| estensione: gate, storage, reporter, mask | 69,1% (insieme) | 100% (quattro moduli) |
| estensione: `send-button.ts` | 75,6% | 86,7% |
| estensione: `composer.ts` | 49,5% | invariato: logica DOM, coperta da `test:dom` che Stryker non conta |

Misurati con `node scripts/mutation.mjs` (le soglie dello script stanno poco sotto questi valori;
gira ogni settimana in CI). In `restoreStream` i rimasti sono equivalenti: guardie che ricadono
sullo stesso percorso.

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

Chiuso in questo lotto, e tolto da qui: il redact che riscriveva il JSON (D18), le chiavi
doppie e i segreti nelle chiavi (D18, D31), il corpo letto senza tetto (D19), il token
reversibile spezzato (D30, con un upstream finto), il secondo editor (D24).

- **`--reversible` tiene la risposta fino alla fine** e poi la restaura: l'agente la riceve
  tutta insieme, non a pezzi. Il caso del segnaposto spezzato e' provato con un server
  finto in tre formati di flusso, **non** con un modello vero.
- **Flusso di risposta in `--reversible`**: un campo `data:` su piu' righe non unisce i pezzi (il
  segnaposto resta tale: non e' una fuga); `pieceAt` e' lineare per segnaposto (lento solo con
  migliaia di segnaposto in un flusso lungo). Chiusi in questo lotto: il BOM e l'escape in
  `partial_json`.
- **Hook**: se `block()` stesso lancia (stdout chiuso) dentro il `.catch`, l'uscita e' 1, non
  bloccante. Caso limite non corretto.
- **Costo di molte stringhe piccole**: 100.000 stringhe da 2 caratteri (500 KB) bloccano
  il proxy per 2,1 s. Un corpo da 32 MB puo' tenerlo occupato molti secondi.
- **Il contenuto di un blocco `thinking`** (firmato) non e' letto ne' riscritto.
- **Block rifiuta corpi oltre 32 MB** (e redact/warn li inoltrano con un avviso); oltre
  64 MB la risposta e' 413. Il corpo e' letto in memoria: circa quattro volte la sua misura.
- **Un match singolo oltre 250.000 caratteri** non si trova nella scansione a finestre.
- **`env_secret`**: una chiave in minuscolo a meta' riga non e' letta (scelta: letta, segnalava
  144 frammenti di codice minificato in 3.322 file); `tokenValue = scanString(...)` a inizio
  riga resta un falso positivo; un segreto fatto di sole lettere non e' letto (scelta
  dichiarata nel codice).
- **Estensione**: Auto-redact durante il keydown dipende dall'editor, non provato su editor veri.
- **Popup**: misurato come scheda a tutta larghezza, non nella cornice della barra del browser.

## 6. Cosa NON e' provato

- **Windows e macOS**: `verify`, `test:docs`, `test:pack`, `test:proxy` passano in CI su
  Node 20 e 22. **Non provati**: SIGTERM e SIGINT su Windows (il test dice "NON PROVATO"), la
  memoria su Windows, Ctrl+C reale in `contextia run`.
- **Browser**: Chromium 141, Chrome for Testing 154 e Firefox 157 (add-on temporaneo, tastiera
  vera). **Non provati**: Edge, Safari, Chrome stabile con l'installazione dallo store (da
  Chrome 137 `--load-extension` non funziona piu' nelle build di marca), l'add-on firmato di
  AMO, l'aggiornamento da una versione vecchia su un'installazione vera.
- **Siti veri** (ChatGPT, Claude, Gemini): il DOM e' ricostruito, la pagina e' un finto
  locale; l'aspetto dell'indicatore sopra il CSS vero di quei siti non e' stato visto.
- **Un agente vero dietro il proxy** (Claude Code, Cursor, Windsurf, aider): non eseguiti; il
  README lo dice. **Un modello vero** in streaming: non provato.
- **Mutation testing** di `cli.ts`, `content.ts`, `ui.ts`, `options.ts`, `popup.ts`: non
  muovono con Stryker (DOM e processi), sono coperti dai test di processo e di browser.
- Un fuzzer vero sul proxy (solo casi mirati); la cronologia degli store (Chrome serve la
  2.0.1 secondo il messaggio della release 2.0.4, non verificato).

---

# Valutazione a ruoli

Giudizio = verde, giallo, rosso. Prova = misurato in questa sessione. "non misurato"
e' una risposta valida.

| Figura | Giudizio | La prova | Cosa manca per alzarlo |
|---|---|---|---|
| **CEO / owner** | giallo | la 2.1.0 e' sul GitHub con le note, ma non e' mai stata pubblicata su npm (l'ultima e' la 2.0.3) e il tag porta ancora 2.0.4 nei file. Deciso: il prossimo rilascio e' la **2.2.0**, che contiene tutto; `check:versions` impedisce che si ripeta; il workflow `Release` pubblica da un tag | tu: impostare il Trusted Publisher su npm, spingere il tag, caricare i due zip negli store (`docs/RELEASING.md`); i numeri sul sito dopo |
| **CTO / architetto** | giallo | zero dipendenze a runtime; 1 solo autore; `proxy.ts` e' il punto singolo di guasto per chi lo usa; `--reversible` trattiene la risposta fino alla fine; mutation testing settimanale in CI. Node 20 e' fuori supporto dal 30 aprile 2026, ma il codice funziona e si prova ancora su 20: il minimo dichiarato resta Node >= 20 (alzarlo e' un cambio di rottura per un vantaggio solo di sviluppo: vitest 5, che chiude un audit solo dev, chiede Node >= 22.12) | un secondo manutentore; alzare il minimo a Node 22 nella prossima maggiore |
| **CISO / sicurezza** | giallo | superficie locale chiusa (D11, D12); guardiano che fallisce chiuso e consegna il blocco anche su pipe asincrona (D8, D23); il proxy legge ogni stringa, le chiavi, e scansiona ogni occorrenza di una chiave doppia (D2, D18, D31); tetti di memoria (D19). Aperti: sezione 5 (blocchi `thinking` non letti, 2,1 s con 100.000 stringhe piccole, match oltre 250.000 caratteri). SECURITY.md ha un canale privato; nessun advisory pubblicato per D2 (non verificato) | decisione sulle voci di sezione 5; un advisory per D2 |
| **Prodotto / UX** | giallo | accessibilita' misurata con axe e tastiera (19 controlli), 18 schermate in stati diversi, e viste in un Firefox vero, dove sono emersi due difetti visivi che Chromium non mostrava (D28). **Non provato**: una persona vera al primo uso, i siti veri con il loro CSS | prova con una persona; l'indicatore sopra le pagine vere |
| **QA** | verde con riserva | 3.981 test + 119 casi di processo, nessuno saltato; ogni legge nuova vista rossa (anche i controlli di Firefox, sabotando il codice); browser: Chromium 141, Chrome for Testing 154 e Firefox 157 in locale, Chromium e Firefox del runner in CI; sistemi: Linux, Windows, macOS in CI; punteggio di mutazione: motore, proxy, core, lettore JSON ed estensione (vedi sezione 4). Riserva: `cli.ts`, `content.ts`, `ui.ts`, `options.ts`, `popup.ts` non muovono con Stryker | nulla di misurato che manchi, a parte la riserva |
| **Ops / SRE** | giallo | installazione pulita 19 s; CI verde su Linux, Windows e macOS, Node 20 e 22; job settimanali (Platforms, Mutation); nessuno stato lato server; rollback = pubblicare una versione nuova. **Non provati**: SIGTERM e SIGINT su Windows, memoria su Windows | provare Ctrl+C reale su Windows |
| **Supporto / utenti** | giallo | di cosa si lamenteranno per primo: l'hook che blocca quando non legge stdin; Block che rifiuta un corpo oltre 32 MB (prima 5 MB); `--reversible` che consegna la risposta tutta insieme; il CLI che esce 2 su un comando sbagliato | messaggi con la via d'uscita per i primi due |
| **Sales / marketing** | giallo | il README ora dice solo cio' che e' stato misurato (83 rilevatori, agenti non eseguiti, streaming con server finto). I numeri dell'oracolo sono su un corpus costruito da me; il sito non e' stato toccato | provare Cursor e Windsurf; un corpus esterno; pubblicare solo prima/dopo che reggono |
| **Legale / privacy** | verde | MIT; nessuna dipendenza runtime; `PRIVACY.md` coerente con i test di zero-rete e di log senza segreti; il test su Firefox forza connessioni dirette e mappa `claude.ai` su un server locale, nessun sito vero e' stato contattato | nulla di misurato che manchi |
| **Maintainer open source** | giallo | CI verde sui tre sistemi; CHANGELOG con v2.2.0; `check:versions` in CI e nel rilascio; la PR dependabot su vitest 5 resta rossa per il vincolo di Node (decisione sopra); bus factor 1 | una persona in piu' |
| **Nuovo contributore** | verde | clone pulito -> `verify` verde in 19 s; i controlli di browser chiedono Playwright (dom, a11y, schermate), Firefox e openssl (Firefox), `npm ci` (mutation); `test:firefox` dice "NON PROVATO" invece di fallire se manca Firefox | nulla di misurato che manchi |
| **Chi lo usa come dipendenza** | giallo | API del motore invariata; cambiano comportamenti: exit 2 su comando sbagliato, anteprime piu' corte, il proxy blocca di piu' e inoltra fino a 32 MB, `env_secret` trova piu' casi, pannello dell'estensione da 320 px | un numero di versione che lo dica; la nota "Behaviour that changes" nel CHANGELOG (scritta) |

## Dove le figure si contraddicono

- **CEO e marketing contro CISO.** Il CEO vuole pubblicare i dati ("incredibili"). Il CISO dice
  che il rilascio deve precedere ogni pubblicazione: i numeri "prima" sono una mappa dei punti
  deboli di chi non ha aggiornato. Il rilascio 2.1.0 e' uscito; ho lasciato il sito com'e'.
- **CISO contro Supporto e Ops.** Il guardiano che fallisce chiuso e' giusto per la sicurezza e
  blocca tutti i prompt se il bundle e' rotto. Ho scelto fail-closed, coerente con i prompt troppo
  lunghi. Resta una scelta tua.
- **CISO contro Prodotto.** Il tetto di scansione passa da 5 a 32 MB: un'immagine legittima non e'
  piu' rifiutata in Block, ma un corpo piu' grande tiene il proxy occupato piu' a lungo. Scelto 32 MB.
- **CTO contro Maintainer e Ops (nuova).** vitest 5 chiude l'audit di sviluppo ma chiede Node
  >= 22.12; il prodotto dichiara Node >= 20. Ho tenuto vitest 4 e il minimo a 20: non cambio cio'
  che dichiariamo ai clienti per una vulnerabilita' solo di sviluppo (il grafo di produzione ha 0).
- **Marketing contro QA.** Marketing vuole "570 su 570"; QA dice che il corpus l'ha scritto la
  stessa persona che ha corretto il rilevatore. Non va citato senza il limite scritto sopra.
- **CTO contro Ops.** Le finestre raddoppiano il costo sui file grandi; Ops preferisce
  completezza a velocita'. Ho scelto completezza.
- **Release contro codice (nuova).** Il tag `v2.1.0` e le note sono pubblicati, ma il codice
  sotto il tag si presenta come 2.0.4 e npm non l'ha mai avuta. Scelto: la prossima e' la 2.2.0,
  che la sostituisce; la 2.1.0 resta sul GitHub come storia.

## Raccomandazione

Decisioni prese (con le ragioni, dopo averle cercate):

- **Versione 2.2.0**: la 2.1.0 non e' mai arrivata su npm e il suo tag ha i file a 2.0.4; questo lotto
  aggiunge cambi di comportamento (tetto di scansione da 5 a 32 MB, `env_secret` piu' ampio).
- **Minimo Node resta >= 20**: Node 20 e' fuori supporto, ma alzare il minimo rompe chi lo usa per
  un vantaggio solo di sviluppo. vitest 5 (che chiede Node >= 22.12) non si prende; l'avviso dell'audit
  e' solo dev e il grafo di produzione ne ha 0. Il workflow di rilascio gira su Node 24, come
  chiede il trusted publishing di npm (Node >= 22.14, npm >= 11.5.1).
- **Tetto di scansione 32 MB**, **hook che fallisce chiuso**, **negozi non automatizzati** (un
  caricamento e' pubblico e non si puo' provare da qui): invariati.

Ordine da qui:

1. Fondere questa PR con la CI verde.
2. **Tu**, una volta: su npmjs.com, per `@sbr0nch/contextia` e `@sbr0nch/contextia-engine`,
   Settings, Trusted Publisher, GitHub Actions, repository `sbr0nch/contextia`, workflow `release.yml`.
3. `git tag v2.2.0 && git push origin v2.2.0`: il workflow `Release` controlla tag e versioni, prova
   tutto, pubblica su npm e allega pacchetti, zip e `SHA256SUMS` al rilascio.
4. **Tu**: caricare `contextia-chrome-2.2.0.zip` sul Chrome Web Store e `contextia-firefox-2.2.0.zip`
   (con `contextia-source-2.2.0.zip` e `packages/extension/BUILDING.md`) su AMO.
5. Solo dopo, il sito, con `scripts/benchmarks.mjs` e `scripts/oracle.mjs` e le loro riserve.

Cosa mi farebbe cambiare idea: un difetto in `--reversible` o nel proxy mostrato da un agente vero con
un modello vero in streaming; un fallimento di `contextia run` con Ctrl+C su Windows.

## Cosa serve a te (separato da cio' che faccio io)

- I tre passi sopra (Trusted Publisher, tag, caricamento negli store): sono gli unici che richiedono
  i tuoi account.
- **Per chiudere cio' che non e' provato**: una macchina **Windows** e una **macOS** reali (Ctrl+C in
  `run`, SIGTERM, memoria); **Edge e Safari**; account veri su **ChatGPT, Claude, Gemini** per vedere
  l'indicatore sul DOM e sul CSS veri; **Claude Code**, **Cursor**, **Windsurf** e **aider** con una
  chiave API per provare il proxy con un agente vero e un modello in streaming; un secondo manutentore.
