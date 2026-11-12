# Universal Character Card Exporter

[English](README.md) · [Español](README.es.md) · [日本語](README.ja.md) · **Italiano** · [Deutsch](README.de.md) · [Русский](README.ru.md)

Un'estensione per browser che legge un personaggio da **JanitorAI**, **Emochi** o **Polybuzz** e lo salva come scheda personaggio portabile, così puoi farne un backup o portarlo su un altro frontend. Nessun account, nessuna compilazione, nessun server. Funziona nel tuo browser, con la tua sessione.

> Gratis e open source. Se ti è utile e vuoi sostenere il lavoro originale, dai un'occhiata a [inkwell.rip](https://inkwell.rip). È quello che tiene in vita strumenti come questo.

---

## Crediti

Questo progetto è un **fork** di **[Character Card Extractor / JAI Card Extractor](https://github.com/erpocalypse/jai-card-extractor)** di **[erpocalypse](https://github.com/erpocalypse)**. L'estensione originale, il lettore di JanitorAI, il pannello, la pipeline di export e tutto il lavoro sul formato delle schede vengono da lì.

**Se usi, fork, ridistribuisci o costruisci sopra questo progetto, devi attribuire il credito all'autore originale e linkare [github.com/erpocalypse/jai-card-extractor](https://github.com/erpocalypse/jai-card-extractor).** È una condizione di questo fork, non una richiesta.

Questo fork è mantenuto da **[mxchu666](https://github.com/mxchu666)**. Aggiunge il supporto per Emochi e Polybuzz, la pipeline unificata delle schede e la documentazione che stai leggendo.

**Come è nato questo fork.** Il codice è stato scritto con **OpenCode** che eseguiva **DeepSeek v4.1-flash:free**. Ogni prompt che ho fornito all'agente l'ho scritto in spagnolo e l'ho tradotto in inglese a mano, uno per uno, prima di usarlo. I risultati, le verifiche e le note API nella sezione per sviluppatori sono il prodotto di quel lavoro, controllati sui siti dal vivo.

---

## Cosa esporta

| Formato | File | Lo leggono |
|---|---|---|
| Scheda SillyTavern | `.card.json` | SillyTavern, Tavo, Agnai, RisuAI, Inkwell, la maggior parte dei frontend |
| Scheda SillyTavern in PNG | `.card.png` | Come sopra, con la scheda incorporata nel chunk dell'immagine |
| Lorebook / World Info | `.lorebook.json` | SillyTavern, Tavo |
| JSON di JanitorAI | `.jai.json` | Il più vicino al record originale |
| Testo semplice | `.txt` | Qualunque cosa legga testo |

Tutto avviene in locale. Niente viene caricato, non c'è analytics e non viene caricato codice esterno.

---

## Come funziona lo strumento

L'estensione è composta da quattro piccoli pezzi con un compito ciascuno, e da una sola regola che tiene insieme tutto: **ogni lettore di sito produce lo stesso oggetto scheda**.

```
pagina del sito
   │
   ├─ src/scraper.js    legge JanitorAI
   ├─ src/emochi.js     legge Emochi
   └─ src/polybuzz.js   legge Polybuzz
           │
           ▼
     un oggetto scheda
     { name, creator, avatarUrl, gender, tags,
       fields: { description, personality, scenario,
                 greeting, altGreetings, exampleDialogue },
       lorebooks[], scriptRefs[] }
           │
           ├─ src/exporters.js  ──▶ .card.json / .card.png / .lorebook.json / .jai.json / .txt
           └─ src/panel.js      ──▶ l'interfaccia in pagina: elenco blocchi, caselle, pulsanti
```

1. **Leggere.** Il lettore del sito su cui ti trovi raccoglie il personaggio. Ognuno lo fa a modo suo, perché ogni sito espone una superficie diversa: JanitorAI ha un'API JSON interna, Emochi ha un backend Next.js con un prompt compilato, Polybuzz ha un payload Nuxt renderizzato lato server più un'API REST.
2. **Normalizzare.** Il record grezzo viene appiattito nell'oggetto scheda qui sopra. Qui si traducono i nomi dei campi: `sceneBrief` di Polybuzz diventa `description`, `speechText` diventa `greeting`, `templateIntro` diventa `scenario`. Nulla viene inventato. Se un campo non è pubblicato, resta vuoto.
3. **Mostrare.** Il pannello elenca ogni blocco trovato con casella e anteprima, così puoi togliere una riga di jailbreak o un prompt di sistema finito dentro. Il contatore in alto (`x/y kept`) dice esattamente cosa verrà scritto.
4. **Esportare.** `toBlocks()` trasforma i blocchi spuntati nel formato scelto. L'esportatore è indipendente dal sito: non ha mai sentito parlare di Emochi o Polybuzz, conosce solo l'oggetto scheda. È per questo che ogni sito ottiene i cinque formati gratis.
5. **Salvare.** Si crea un Blob e lo si clicca tramite un `<a download>`. Nulla attraversa la rete.

C'è una protezione voluta in `toBlocks()`: se un blocco Personality risulta identico carattere per carattere al blocco Description, viene scartato in silenzio. Quasi sempre è un server che riversa un campo nell'altro, non un autore che scrive due volte lo stesso paragrafo.

### Perché un'estensione e non un sito web

Ognuno di questi siti mette almeno parte dei dati dietro una sessione autenticata. Un'app web avrebbe bisogno dei tuoi cookie; un'estensione può prendere in prestito la sessione che il browser ha già, senza mai vedere la tua password. È tutta qui la ragione per cui lo strumento vive dove vive.

---

## Installazione (circa due minuti)

Non serve saper programmare. Non c'è nulla da compilare.

1. **Scarica il progetto.** Clicca il pulsante verde **Code** nella pagina GitHub, poi **Download ZIP**. Estrai in un posto permanente, tipo il Desktop.
2. **Apri la pagina delle estensioni.** Chrome: `chrome://extensions`. Edge: `edge://extensions`.
3. **Attiva la modalità sviluppatore** (interruttore in alto a destra).
4. Clicca **Load unpacked** / **Carica estensione non pacchettizzata** e scegli la cartella che contiene `manifest.json`.

> Se sposti o cancelli quella cartella, l'estensione smette di funzionare. Tienila in un posto permanente.

---

## Usarla

### JanitorAI

1. Apri un personaggio su [janitorai.com](https://janitorai.com) con la sessione attiva.
2. Clicca **Extract card** in basso a destra.
3. **Quick scan** legge il personaggio. **Deep scan** percorre anche tutti i lorebook collegati: più lento, più completo.
4. Togli la spunta a ciò che non vuoi. **Select all** / **Select none** servono a questo.
5. Scegli un formato di esportazione.

Se un personaggio ha più di un lorebook, dopo la scansione profonda appare un pulsante **Separate books**, così un world book condiviso si salva come file riutilizzabile.

### Emochi

1. Apri un personaggio su [emochi.com](https://emochi.com) (`emochi.com/character/...`).
2. **Quick scan** legge il payload pubblico: nome, tagline/descrizione, messaggio di benvenuto, tag, avatar, autore.
3. **Deep scan** chiede in più la definizione dell'autore: personalità, scenario, conversazioni di esempio. Quella rotta risponde solo per i personaggi del **tuo account**; accedi prima.

Alcuni personaggi Emochi non hanno davvero testo di personalità o scenario salvato da nessuna parte, perché il sito li guida tramite tag e genera la persona al momento della chat. È una proprietà del personaggio, non una lettura fallita.

### Polybuzz

1. Apri un personaggio su [polybuzz.ai](https://polybuzz.ai) (`polybuzz.ai/es/character/chat/...`).
2. Clicca **Extract card** → **Quick scan**.
3. Esporta.

Una scheda Polybuzz esce con ciò che il sito pubblica:

| Campo della scheda | Origine in Polybuzz |
|---|---|
| Description | `sceneBrief` — l'introduzione breve |
| Greeting | `speechText` — il messaggio di apertura |
| Scenario | `templateIntro` se il bot è basato su template; altrimenti la didascalia che l'autore ha scritto in cima al saluto |
| Personality | i tag **Personalidad** scelti dall'autore (`Frío`, `Celoso`, `Tsundere`…), più lo stile di dialogo quando è pubblicato |
| Gender | `sceneGender`, come riga `Gender: Male/Female/Non-binary` nella descrizione |
| Tag, avatar, nome, autore | il record della scena |

---

## Polybuzz: le informazioni di background non sono recuperabili. Ecco perché.

La guida alla creazione di Polybuzz elenca sette cose di cui è fatto un personaggio: nome, genere, introduzione breve, saluto, tag, **background** e **stile di dialogo** (più il dialogo di esempio che insegna lo stile). Una pagina pubblica ne pubblica cinque. Le altre due — `systemRole` (il background, etichettato *Antecedentes*) e `conversationExample` (i dialoghi di esempio) — **non vengono inviate a nessuno tranne che all'autore di quel personaggio**. Non è un endpoint mancante né qualcosa che questa o altre estensioni possano aggirare, perché **i dati vengono assemblati lato server e non vengono mai serializzati verso un non-proprietario**.

Le prove, in breve:

- Il modulo di creazione stesso mostra il campo come `Antecedentes (Visto en privado)` — *Antecedentes, visto in privato*. È una nota riservata all'autore per design.
- Tutte le rotte API di sola lettura che il client web conosce sono state chiamate contro bot pubblici con una sessione ospite nuova. L'unica che contiene la chiave è `scene/detailguest`, e restituisce `""`.
- La rotta del proprietario `scene/getscenedetail` risponde `210002` per un bot che il tuo account non possiede. Quel codice è definitivo: il server rifiuta il record.
- Nei 225 chunk JavaScript caricati in modo differito, `systemRole` e `conversationExample` compaiono in **un** file: la pagina di creazione. Nessun'altra pagina li chiede, quindi nessun'altra pagina può mostrarli.
- Un esperimento controllato chiude la questione: un bot creato con il marcatore `ZZZ-123` nei suoi Antecedentes, poi scansionato da un secondo account, non ha mai mostrato il marcatore. Il valore non lascia la sessione dell'autore.
- Chiedere al modello di recitare le proprie istruzioni non funziona. La pipeline della chat costruisce il prompt di sistema lato server e lo stream trasporta solo frammenti di testo. L'unica volta che a un bot è stata chiesta la propria biografia, si è inventato un'infanzia che non aveva: la parafrasi non è il testo salvato, e questa estensione non spaccia una generazione per un recupero.

**Cosa fa invece l'estensione:** usa i campi che Polybuzz pubblica davvero, e lo dice in una nota a piè di pagina sotto l'elenco dei blocchi. Personality viene dai tag scelti dall'autore; Scenario dalla didascalia d'apertura del saluto, alla lettera; nulla viene parafrasato e nulla inventato.

Se il personaggio è tuo, le tre rotte autenticate vengono comunque interrogate a ogni scansione, e i tuoi bot tornano completi.

---

## Come è stato costruito questo fork, dall'inizio alla fine

Un breve resoconto, perché la forma del processo spiega perché i limiti sopra sono affidabili.

1. **Partire dallo strumento originale.** L'estensione a monte leggeva già JanitorAI. È diventata la base, e la regola per tutto il resto è stata: non cambiare mai il comportamento ereditato, aggiungi solo accanto.
2. **Aggiungere un lettore, non un caso speciale.** Emochi è stato aggiunto come `src/emochi.js` che riempie lo stesso oggetto scheda, così `exporters.js` e `panel.js` non hanno richiesto alcuna modifica.
3. **Trovare il payload vero.** Emochi è un'app Next.js sul backend di FlowGPT; i dati utili stanno in una stringa `initPrompt` compilata dentro l'oggetto pubblico del prompt. Quella stringa viene ri-parsata in personalità, background, scenario e dialogo di esempio.
4. **Misurare, non supporre.** L'affermazione che Emochi pubblichi una definizione per circa un terzo dei personaggi viene dal campionamento di tre liste dal vivo indipendenti (30, 19 e 9 personaggi) e dal contarli. È un flag di pubblicazione (`visibility: true`), non un cancello di login.
5. **Aggiungere Polybuzz allo stesso modo.** Nuxt rende il personaggio lato server dentro la pagina, quindi il payload è nel DOM come array devalue. Quell'array viene espanso e cercato. Un content script non vede `window.__NUXT__`, quindi si usa il tag `<script id="__NUXT_DATA__">`.
6. **Enumerare l'API, non indovinarla.** Il bundle JavaScript del sito dichiara 214 configurazioni di richiesta. Tutte quelle di sola lettura sono state chiamate contro bot pubblici. È così che si è arrivati alla conclusione "il background è irraggiungibile": non fallendo una volta, ma esaurendo la superficie.
7. **Dimostrare il negativo con un controllo.** L'esperimento `ZZZ-123`, fatto su due account, è ciò che ha trasformato "non lo troviamo" in "non c'è da trovare".
8. **Tenere il pannello zitto.** Un campo privato dell'autore mancante è il caso normale, non un errore. Il pannello mostra una nota a piè di pagina, non un banner. Solo un guasto reale (disconnesso, nessuna rotta che risponde) riceve un messaggio.
9. **Testare tutto ciò che è testabile.** `node --test` copre i lettori, il normalizzatore, gli esportatori e il costruttore di blocchi. 71 test al momento della scrittura. Ogni affermazione API in questo README è stata verificata sui siti dal vivo, e quelle non verificabili sono marcate come tali.
10. **Scriverlo.** La sezione per sviluppatori esiste perché la prossima persona non debba ri-derivare tutto.

**Questo strumento è in sviluppo attivo e continuerà a ricevere aggiornamenti.** Si aggiungono siti, si riparano lettori rotti e le note API vengono corrette quando un sito cambia. Se qualcosa si rompe, di solito è perché un sito ha cambiato la forma del payload, e si può sistemare.

---

## To-do

- [ ] **Aggiungere il supporto a Character.ai.**
- [ ] **Aggiungere il supporto a Saucepan AI.**
- [ ] **Aggiungere il supporto a WyvernChat.com.**
- [ ] **Priorità — Emochi: alcuni bot non mostrano personalità o scenario.** Una parte dei personaggi Emochi non salva davvero alcuna definizione, ma il tasso di fallimento resta più alto di quanto preveda la misura del flag di pubblicazione. Va isolato: è il payload, il parser o il personaggio?
- [ ] **Priorità — Emochi: le conversazioni di esempio non vengono recuperate.** La rotta di definizione trasporta `characterExampleConversation`; non arriva alla scheda. Questo rompe la fedeltà del dialogo di esempio e deve funzionare prima di poter considerare concluso il supporto Emochi.

I due punti Emochi hanno priorità sull'aggiunta di nuovi siti. Un lettore che funziona a metà su un sito supportato è peggio di un sito in più che funziona del tutto.

---

## Segnalare bug

Usa la **[scheda Issues](https://github.com/mxchu666/Universal-Character-Card-Exporter/issues)**. È abilitata. Includi:

- Il sito e l'URL del personaggio.
- Che versione hai — **passa il cursore sul piè di pagina del pannello di export e la versione appare nel tooltip**.
- Cosa ti aspettavi e cosa hai ottenuto. Uno screenshot del pannello è la cosa più utile che puoi allegare.
- Qualsiasi messaggio mostrato dal pannello. Quando una ricerca fallisce, il pannello nomina la rotta e il codice di risposta, e quel testo è esattamente ciò che serve per la correzione.

Le richieste di funzionalità sono benvenute nello stesso posto.

---

## È permesso?

È uno strumento di backup personale. Legge ciò che puoi già vedere da connesso e lo salva in un formato aperto. Non aggira paywall e non sblocca nulla che non potresti comunque vedere.

I termini dei siti possono comunque limitare l'accesso automatizzato. Usalo per i tuoi personaggi e i tuoi backup personali, accredita gli autori quando ricondividi il loro lavoro e non martellare i siti.

## Privacy

- I dati dei personaggi scansionati non lasciano mai il browser. Nessun analytics, nessun codice esterno.
- Nessun permesso speciale. L'estensione gira solo sulle pagine dei siti che apri tu.
- Le uniche chiamate di rete sono verso il sito su cui sei già.

---

## Per sviluppatori

L'estensione è JavaScript puro, senza dipendenze e senza build. Modifica `src/` e ricarica dalla pagina delle estensioni.

```sh
node --test
```

`src/scraper.js` legge JanitorAI, `src/emochi.js` Emochi, `src/polybuzz.js` Polybuzz. Tutti e tre riempiono la stessa forma di scheda, quindi esportatori e pannello non sanno mai su che sito sei. `src/exporters.js` converte, `src/panel.js` e `src/panel.css` sono il pannello in pagina, `background.js` è il service worker per le richieste che un content script non può fare (CORS, header proibiti).

**Il registro API sito per sito è nel README inglese** ([Developer reference](README.md#developer-reference-english-only)). Resta in inglese di proposito: è materiale di riferimento e la parte che invecchia più in fretta quando un sito cambia. Verrà tradotto quando si stabilizza.

---

## Licenza

[MIT](LICENSE).
