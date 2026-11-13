# Universal Character Card Exporter

[English](README.md) · [Español](README.es.md) · [日本語](README.ja.md) · **Italiano** · [Deutsch](README.de.md) · [Русский](README.ru.md)

Un'estensione per browser che legge un personaggio da **JanitorAI**, **Emochi**, **Polybuzz**, **Character.ai**, **Crushon.ai** o **Saucepan.ai** e lo salva come scheda personaggio portabile, così puoi farne un backup o portarlo su un altro frontend. Nessun account, nessuna compilazione, nessun server. Funziona nel tuo browser, con la tua sessione.

**Novità in 0.11.1:** il pannello mostra la versione in esecuzione e i blocchi PNG che ha scritto, così «No se detectaron metadatos PNG» si può ricondurre al file o al lettore; il JSON ora porta anche i campi piatti V1, che è quello che leggono gli importatori vecchi. Tutti i dettagli nel [changelog](CHANGELOG.md) e nel [devlog](#devlog).

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
| Scheda SillyTavern in PNG | `.png` | Come sopra, con la scheda incorporata nel chunk dell'immagine |
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
   ├─ src/emochi.js     legge Emochi (pagine personaggio e Lab)
   ├─ src/polybuzz.js   legge Polybuzz
   ├─ src/cai.js        legge Character.ai
   ├─ src/crushon.js    legge Crushon.ai
   │       ▲
   │       └─ src/intercept.js + src/harvest.js
   │          (siti che consegnano il record solo al proprio client)
           │
           ▼
     un oggetto scheda
     { name, creator, avatarUrl, gender, tags,
       fields: { description, personality, scenario,
                 greeting, altGreetings, exampleDialogue },
       lorebooks[], scriptRefs[] }
           │
           ├─ src/exporters.js  ──▶ .card.json / .png / .lorebook.json / .jai.json / .txt
           └─ src/panel.js      ──▶ l'interfaccia in pagina: elenco blocchi, caselle, pulsanti
```

1. **Leggere.** Il lettore del sito su cui ti trovi raccoglie il personaggio. Ognuno lo fa a modo suo, perché ogni sito espone una superficie diversa: JanitorAI ha un'API JSON interna, Emochi ha un backend Next.js con un prompt compilato, Polybuzz ha un payload Nuxt renderizzato lato server più un'API REST, mentre Character.ai e Crushon.ai consegnano il record solo alla propria pagina — per questi due l'estensione intercetta ciò che la pagina ha già scaricato invece di chiederlo.
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

### Character.ai

1. Apri un personaggio su [character.ai](https://character.ai) con la sessione attiva (`character.ai/character/...`).
2. Lascia che la pagina finisca di caricare, poi **Extract card** → **Quick scan**.
3. Esporta.

| Campo della scheda | Origine in Character.ai |
|---|---|
| Nome, autore, avatar | il record del personaggio |
| Description | `title` (lo slogan) seguito da `description` (il testo «About») |
| Greeting | `greeting` |
| Dialogo di esempio | `definition` — la definizione in testo libero dell'autore, quando è pubblica |

**Sulla definizione.** Character.ai nasconde la definizione di un personaggio dietro un secondo interruttore dell'autore, **Definition Visibility**, separato dalla visibilità del personaggio. Quando è spento, il sito non invia il testo a nessuno, quindi il blocco del dialogo di esempio esce vuoto e il pannello lo dice in una nota a piè di pagina. Tutti gli altri campi ci sono comunque.

Il lettore lavora osservando le richieste della pagina stessa: un piccolo script nel mondo della pagina (`src/intercept.js`) copia l'header `Authorization` in un tag nascosto e ritrasmette ogni risposta JSON come evento DOM, che il lettore raccoglie. Non modifica mai una richiesta e non ne invia una propria con il tuo token. Quando la pagina non ha ancora fatto la chiamata, il lettore chiede in quest'ordine: il contesto della pagina stessa con l'header catturato e i suoi cookie, la stessa chiamata tramite il service worker con i cookie, i payload e i dati renderizzati dal server, e infine la pagina del personaggio scaricata come HTML con il record ritagliato dallo stream. L'header viene usato così come lo ha inviato la pagina: il sito ha usato sia `Token` sia `Bearer`, e ricostruire lo schema produce un 401.

### Crushon.ai

1. Apri un personaggio su [crushon.ai](https://crushon.ai) (`crushon.ai/character/...`).
2. Lascia che la pagina finisca di caricare, poi **Extract card** → **Quick scan**.
3. Esporta.

Crushon è interamente renderizzato lato client, quindi il lettore legge il record che la pagina ha già renderizzato invece di chiamare un'API. Gli alias dei campi coprono ogni grafia che il sito ha usato tra le versioni: `firstMessage` / `first_mes` / `greeting`, `description` / `introduction` / `intro`, `avatar` / `avatarUrl` / `image`, `mes_example` / `exampleDialogue` / `dialogue`. Se la pagina non ha ancora richiesto il personaggio, ricaricala e riscansiona.

**Nota sui nomi dei campi.** L'importatore di Crushon mappa una scheda Tavern al contrario: la `personality` della scheda diventa l'*Introduction* di Crushon, e la `description` della scheda diventa la *Personality* di Crushon. Il lettore riporta ciò che Crushon pubblica nel campo che significa la stessa cosa sulla scheda, così il passaggio per entrambi gli strumenti lascia il testo dov'era.

### Saucepan.ai

1. Apri un companion su [saucepan.ai](https://saucepan.ai) (`saucepan.ai/companion/...`), con la sessione attiva se vuoi la definizione e i lorebook.
2. Lascia che la pagina finisca di caricare, poi **Extract card** → **Quick scan**. **Deep scan** aggiunge i lorebook.
3. Esporta.

| Campo della scheda | Origine in Saucepan.ai |
|---|---|
| Nome, autore, avatar | il record del companion |
| Descrizione | lo slogan (`short_description`), poi Profilo → **Description** |
| Personalità | Core → **Information**, più Avanzato → **Advanced Prompt** e **Formatting Instructions** quando l'autore li ha compilati |
| Saluto | la prima voce pubblica di Messaggi → **Starting Messages** |
| Saluti alternativi | ogni altro messaggio iniziale pubblico |
| Dialogo di esempio | Messaggi → **Example Dialogue** |
| Tag | quelli del companion più i suoi fandom |
| Lorebook | ogni lorebook collegato, una voce per capitolo |

**I proxy sono un campo, non un cancello.** Saucepan etichetta ogni companion con una politica dei provider — *custom and vetted*, *vetted only* oppure *internal only*, l'ultima significa nessun modello esterno. Quella politica compare nella riga di nota della scheda e nient'altro dipende da lei; un companion si esporta allo stesso modo che i proxy siano permessi o no.

**Perché la descrizione a volte sembra cifrata.** Non è cifratura, è una lista di frammenti. `GET /api/v2/companions/{id}` restituisce la Description come `{mask, version, fragments: [{key, proof, text}]}`, dove la maggior parte dei frammenti sono esche con testo casuale: `"signal glance window but"`, `"simple quiet maybe almost"`. Un frammento è reale solo se il suo `proof` coincide con un hash FNV-1a del suo stesso testo, con seme dato dalla maschera e da `key ^ mask`; i superstiti vengono ordinati per `key ^ mask` e uniti. `decodeFragments` in `src/saucepan.js` è quella routine, e i test la eseguono su frammenti copiati da una risposta reale. Senza, esporteresti riempitivo.

**Companion pubblici, con o senza definizione aperta.** Il record pubblico porta sempre nome, slogan, Description, tag, fandom, ritratto e politica dei provider, quindi un companion pubblico si esporta sempre come scheda personaggio. La definizione — Core, dialogo di esempio, prompt avanzato, formato — è un'altra rotta e un altro interruttore dell'autore chiamato **Definition Visibility**. Quando è chiuso, Saucepan non invia il testo a nessuno, la scheda esce con quei blocchi vuoti e il pannello dice quali blocchi ha chiuso l'autore. I messaggi iniziali vengono serviti comunque solo quando lo scenario è pubblico; quando non ce n'è nessuno, il blocco del saluto resta vuoto e il pannello lo dice.

**I companion che possiedi** si leggono con `GET /api/v1/companion/editable`, che restituisce il record grezzo dell'editor: testo di Core, dialogo di esempio, prompt avanzato, istruzioni di formato e ogni scenario iniziale a prescindere dal suo livello di accesso. La proprietà viene rilevata a ogni scansione, quindi i tuoi bot escono completi anche con Definition Visibility chiuso.

---

## Tavo: perché la scheda arrivava senza immagine

Due guasti distinti, entrambi chiusi in 0.11.0.

**Il PNG era una scheda valida, ma solo nel blocco V2.** Un PNG di scheda tiene il JSON in blocchi `tEXt` in base64: `chara` per la specifica V2 e `ccv3` per la V3. L'estensione scriveva solo `chara`. Tavo legge `ccv3`, non lo trova e risponde *«No se detectaron metadatos PNG»* su un file perfettamente valido. Ora vengono scritti entrambi, nello stesso ordine e formato che usa SillyTavern, e i test controllano entrambi i blocchi e i loro CRC contro `zlib.crc32`.

**Il JSON non ha un campo immagine.** La specifica V2/V3 è solo testo, quindi Tavo crea il personaggio con il ritratto vuoto. L'estensione ora incorpora il ritratto come data URI base64 da 512×512 (~40 KB) in `avatar`, `data.avatar` e `data.extensions.avatar`; se il frontend legge uno di questi, l'immagine compare senza nessuna richiesta di rete. Se i byte non sono recuperabili, viene scritta l'URL pubblico.

**Il ritratto restava sulle iniziali per un'intestazione assente.** La via precedente caricava l'avatar con `<img crossOrigin="anonymous">`, che richiede `Access-Control-Allow-Origin` sulla risposta. `image-cdn.flowgpt.com` e `cdn.mokio.ai`, i due CDN di Emochi, non la inviano: il caricamento falliva prima di ricevere un byte e l'esportazione ripiegava sul riquadro con le iniziali senza avvisare. Ora `background.js` scarica i byte sotto un permesso di host — il worker non è soggetto a CORS —, li restituisce in base64 e il content script li decodifica con `createImageBitmap`. `cdn.polyspeak.ai`, `characterai.io` e `ella.janitorai.com` la intestazione la mandano; `cdn.crushon.ai` no e in più chiede i cookie.

Chrome disattiva l'estensione una volta dopo l'aggiornamento, perché il manifest aggiunge permessi di host per quei CDN. Riattivala nella pagina delle estensioni.

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
11. **Riutilizzare prima di scrivere.** Character.ai e Crushon.ai consegnano il record solo al proprio JavaScript, quindi un solo meccanismo copre entrambi: uno sniffer nel mondo della pagina e una scansione con punteggio dei payload. Un file nuovo per sito, più due condivisi, e gli esportatori non sono stati toccati.
12. **Citare la fonte di un approccio.** Il pattern di intercettazione viene dall'[esportatore di taquanta](https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter), e il credito sta in cima al file e in questo README, non solo in un messaggio di commit.
13. **Dire ciò che non è verificato.** Entrambi i siti nuovi rispondono `403` di Cloudflare a una macchina senza browser, quindi i contratti sono documentati e la lettura dal vivo no. È scritto in tre punti invece di essere sorvolato.

**Questo strumento è in sviluppo attivo e continuerà a ricevere aggiornamenti.** Si aggiungono siti, si riparano lettori rotti e le note API vengono corrette quando un sito cambia. Se qualcosa si rompe, di solito è perché un sito ha cambiato la forma del payload, e si può sistemare.

---

## Devlog

Il resoconto di come si è arrivati davvero a ogni versione: cosa è stato provato, cosa ha fallito e cosa ha insegnato il fallimento. Il più recente per primo. La versione breve è nel [changelog](CHANGELOG.md); questa è quella lunga.

### 0.9.0 — due siti chiusi, un solo meccanismo, e un parser Emochi con tre bug

**Prima Emochi, perché era la priorità.** C'erano due segnalazioni aperte: personalità e scenario mancanti su alcuni bot, e `characterExampleConversation` che non arrivava mai alla scheda.

Il bug delle conversazioni di esempio è durato dieci minuti. La rotta di definizione restituisce `characterExampleConversation` come **array di turni**, e il lettore ci applicava `String(...)`. Un array diventa `"[object Object],[object Object]"` in alcuni runtime e `""` nell'helper `s()` del normalizzatore — in nessun caso dialogo. Ora viene analizzato come turni, e il parser accetta `{role, content}`, `{user, ai}`, `{isUser, text}` e un wrapper `{dialogue: [...]}`, perché il registratore di Emochi usa la prima forma, gli importatori di schede la seconda, e le altre compaiono in record precedenti a un cambio di schema.

Il bug della personalità ha richiesto più tempo ed erano tre difetti separati impilati:

1. **L'istruzione di chiusura era trattata come un confine.** Ogni prompt compilato termina con `Do not write as {{user}} or assume {{user}}'s reaction or response.` Il lettore tagliava lì e buttava via tutta la coda. È corretto per un prompt che finisce con la regola, cioè quello che produce il compilatore. È sbagliato nel momento in cui un autore cita la regola dentro il proprio background o il proprio dialogo di esempio, cosa che succede più spesso di quanto si pensi: c'è chi incolla la regola nel proprio esempio di proposito, per insegnarla al modello. Ogni sezione dopo la citazione spariva. La correzione è rimuovere quella frase dove appare e conservare il testo attorno.
2. **La grammatica delle sezioni accettava una sola formulazione esatta.** I marcatori erano `'s personality:`, `'s background:`, `scenario of role-play:`. Un autore che ha scritto `Personality:` — maiuscola, senza possessivo, perché ha scritto il proprio prompt invece di usare il builder — otteneva un parsing vuoto, e l'intero prompt finiva nel ramo «nessun marcatore, trattalo come personalità». Ora c'è un secondo insieme di marcatori ancorato alla riga che tollera la deriva, e vince la passata che riconosce più sezioni. In caso di parità resta la grammatica stretta, così i prompt prodotti dal compilatore si analizzano esattamente come prima.
3. **La nota di sezione vuota era una supposizione.** Il lettore diceva «l'autore ha lasciato vuoti personalità e dialogo di esempio» ogni volta che quei campi uscivano bianchi — anche quando il parser non aveva riconosciuto affatto il layout, e quindi erano bianchi per colpa del parser. Ora la nota scatta solo quando è stata riconosciuta anche la riga del nome, cioè quando il layout è stato capito davvero.

Tutti e tre sono coperti da test scritti dalle forme che fallivano, non da quelle che passavano.

**Poi i dialoghi di esempio di Polybuzz.** Il ticket aveva uno screenshot dell'editor *Estilo de diálogo*: le righe con l'avatar accanto sono `{{user}}`, quelle senza sono `{{char}}`. Leggendo il bundle della pagina di creazione la forma è stata confermata: `dialogueStyleObj` è un array di coppie `{user, ai}`, una voce per scambio, e il record di dettaglio lo restituisce sotto `dialogueStyle.dialogue`. Entrambi ora vengono analizzati in righe della scheda. La stringa piatta `conversationExample` è lo stesso dato come `user;ai` per riga, e anche quella forma viene riscritta.

Una trappola: una stringa semplice sotto `dialogueStyle` è l'**etichetta di stile** (`Descriptivo, frases cortas`), non dialogo. La prima versione del parser riscriveva allegramente un'etichetta di stile in `{{char}}: Descriptivo, frases cortas` e la infilava nel blocco esempi. I test l'hanno preso. Ora le stringhe non diventano mai dialogo; solo gli array e il testo `user;ai`.

**Poi Character.ai.** L'approccio viene dall'[esportatore di taquanta](https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter), che ha risolto lo stesso problema: il record lo chiede solo il JavaScript della pagina, con un header `Authorization: Token <hex>` che l'estensione non può coniare. L'implementazione di riferimento esegue uno script nel mondo della pagina (`MAIN`), intercetta `fetch` e `XMLHttpRequest`, e salva l'header nel DOM. È l'unico modo per vedere un header che il browser aggiunge fuori dal tuo contesto.

Due modifiche. Il token va in un meta tag con namespace proprio invece che in uno che può collidere. E ogni risposta JSON che la pagina riceve viene ritrasmessa come evento DOM che porta una **stringa** — gli oggetti non attraversano il confine tra uno script `MAIN` e un content script isolato, le stringhe sì. Quella singola modifica ha trasformato lo sniffer da «cattura il token e ripeti la chiamata» a «cattura il token *e* la risposta», così il lettore continua a funzionare quando la ripetizione viene rifiutata.

La definizione è il campo interessante. Character.ai la chiude dietro **Definition Visibility**, un secondo interruttore separato dalla visibilità del personaggio, e quando è spento il testo non viene inviato a nessuno. Quindi una scheda con il blocco del dialogo di esempio vuoto è una impostazione dell'autore, non una lettura fallita, e il pannello dice esattamente questo invece di mostrare un errore.

**Poi Crushon.ai.** Interamente renderizzato lato client, dietro un muro anti-bot. Non c'è un'API pubblica da ripetere e le chiamate della pagina portano stato di sessione, quindi il lettore non chiama nulla: percorre i payload che la pagina ha già ricevuto e assegna un punteggio a ogni oggetto in base a quanti nomi di campo noti contiene. Vince il più ricco. Gli alias coprono le grafie usate tra le versioni, perché mancarne una costa l'intero campo.

La parte condivisa dei due lettori è `src/harvest.js`: raccolta dei payload, rilettura del token e la scansione con punteggio. Due lettori nuovi, due file condivisi, zero modifiche a `exporters.js` o `panel.js` — la regola che ogni lettore riempie lo stesso oggetto scheda è ciò che lo ha reso possibile, ed è il motivo per cui il prossimo sito costa un file.

**Cosa non è stato verificato.** Entrambi gli host nuovi rispondono `403` di Cloudflare alla macchina su cui è stato costruito, quindi nessuno dei due lettori è stato esercitato contro un browser con sessione. Ciò che è stato verificato: l'endpoint neo è vivo e risponde `{"status":"NOT_OK","error":"bad request"}` a un id sintetico, cioè la rotta che si lamenta del corpo e non del chiamante. I contratti dei campi vengono dall'implementazione funzionante di taquanta. È scritto come non verificato nel changelog, nella lista To-do e qui, perché un lettore non esercitato è un'affermazione diversa da uno che lo è stato.

### 0.8.0 — il fork prende un nome e sei lingue

Il repository portava ancora il nome originale mentre supportava quattro siti. Rinominato in **Universal Character Card Exporter**, che è ciò che fa. Issues è stato abilitato nello stesso momento, perché la sezione sulla segnalazione bug mandava le persone a una scheda che non esisteva.

La documentazione è passata a sei lingue in una sola passata. Il riferimento API sito per sito resta in inglese e lo dice in cima alla sezione: è materiale di riferimento che invecchia più in fretta, e sei copie di un documento vecchio sono sei volte la manutenzione senza alcun guadagno. Le traduzioni rimandano lì.

La sezione Polybuzz è stata riscritta. Prima diceva che il background «non è recuperabile» come conclusione. Ora l'evidenza sta sotto: l'etichetta privata per design nel form di creazione, la scansione esaustiva delle rotte, il `210002` sul bot di qualcun altro, il test di controllo `ZZZ-123` su due account. Un risultato negativo affermato non vale niente; un risultato negativo con il suo metodo allegato vale qualcosa.

### 0.7.13 — personalità dai tag dell'autore

Polybuzz non pubblica né background né campo personalità, il che lasciava le schede con il blocco Personality vuoto. L'albero dei tag veniva già richiesto per la lista tag della scheda, quindi è stato letto con più attenzione: ogni tag finisce sotto uno di quattro genitori, e `Personalidad` contiene 41 parole di temperamento scelte a mano dall'autore. È la caratterizzazione dell'autore, scritta da lui, pubblicata dal sito.

L'incrocio è onesto in un modo preciso: i tag di genere, origine e identità restano fuori da Personality e rimangono nella lista tag, e un `systemRole` reale ha ancora la precedenza sui tag quando esiste. Misurato su 10 bot dal vivo: 10/10 hanno prodotto un blocco Personality reale. Una lista di tag è più sottile di un background scritto, ma sono parole dell'autore invece di una supposizione.

### 0.7.10 – 0.7.12 — un'eco non è un campo

Tre versioni, un'idea. `getsceneconfig` con un id di scena risponde con il testo di introduzione compilato come fallback. Cinque scansioni con sessione su bot non posseduti dall'account hanno restituito un `systemRole` identico carattere per carattere a `sceneBrief`. È così che il server renderizza un background vuoto, non un secondo campo che per caso coincide. Un'eco esatta ora viene trattata come assenza, ogni rotta conserva la propria risposta invece della prima non vuota, e il pannello mostra una nota a piè di pagina invece di un banner, perché un campo privato dell'autore è il caso normale.

Lo scenario è uscito dallo stesso lavoro: i saluti di Polybuzz spesso si aprono con una didascalia (`*Bangchan es tu esposo*`), che è la premessa dell'autore. Viene promossa alla lettera quando il record non porta `templateIntro`. Non si parafrasa mai nulla.

---

## Changelog

Storia completa delle versioni, con ogni correzione e il suo motivo: **[CHANGELOG.md](CHANGELOG.md)**.

Versione breve:

| Versione | Cosa è arrivato |
|---|---|
| 0.11.1 | Il pannello mostra la versione in esecuzione e i blocchi del PNG scritto; il JSON porta anche i campi piatti V1; 107 test |
| 0.11.0 | PNG con `chara` + `ccv3`, ritratti scaricati dal worker così un CDN senza CORS non dà più le iniziali, JSON con il ritratto come data URI; 106 test |
| 0.10.0 | Lettore Saucepan.ai: decodifica dei frammenti, due rotte di lettura, lorebook, politica dei provider nella nota; 103 test |
| 0.9.1 | Character.ai: schema di autenticazione preservato, scaletta di lettura a freddo, fallback sui dati renderizzati, 92 test |
| 0.9.0 | Lettori Character.ai e Crushon.ai, dialoghi di esempio Polybuzz, correzioni al parser Emochi, Emochi Lab, 92 test |
| 0.8.0 | Rinomina, documentazione in sei lingue, sezione crediti, riscrittura delle prove Polybuzz, Issues abilitato |
| 0.7.13 | Personality di Polybuzz dai tag `Personalidad` dell'autore |
| 0.7.12 | Scenario di Polybuzz dalla didascalia del saluto |
| 0.7.11 | Candidati per rotta, così un'eco non può nascondere un background reale |
| 0.7.10 | Catena di configurazione consapevole della conversazione, pannello silenzioso |
| 0.7.0 – 0.7.9 | Supporto Polybuzz, dall'inizio alla fine |
| 0.6.0 – 0.6.1 | Lettore Emochi e scansione profonda della cronologia prompt |
| 0.5.0 e precedenti | JanitorAI, ereditato dall'estensione originale di erpocalypse |

---

## To-do

- [x] **Aggiungere il supporto a Character.ai.** Fatto in 0.9.0. La definizione dipende ancora dall'interruttore Definition Visibility dell'autore.
- [x] **Aggiungere il supporto a Crushon.ai.** Fatto in 0.9.0, leggendo ciò che la pagina renderizza.
- [x] **Priorità — Emochi: alcuni bot non mostrano personalità o scenario.** Risolto in 0.9.0. Tre cause, tutte nel parser: l'istruzione di chiusura trattata come confine di taglio, la grammatica delle sezioni che accettava una sola formulazione, e la nota «l'autore l'ha lasciato vuoto» che scattava su un layout non riconosciuto. Dettagli nel [changelog](CHANGELOG.md).
- [x] **Priorità — Emochi: le conversazioni di esempio non vengono recuperate.** Risolto in 0.9.0. `characterExampleConversation` arriva come array di turni e la conversione a stringa lo riduceva a `""`. Ora viene analizzato come turni.
- [x] **Supporto Emochi Lab.** Gli URL di Story, Soundstage e LiveRoom vengono letti come lo stesso record di prompt, prendendo l'ultimo segmento del percorso come id. La sessione non autenticata non ha mai mostrato la forma reale degli URL del Lab, quindi una superficie con un tipo di record diverso segnala la rotta fallita invece di restituire mezza scheda.
- [x] **Aggiungere il supporto a Saucepan AI.** Fatto in 0.10.0. I companion pubblici si esportano con la Description e con ogni messaggio iniziale pubblico; la definizione e i lorebook richiedono una sessione attiva, e la definizione anche l'interruttore Definition Visibility dell'autore. Le rotte definizione ed editable sono documentate dal codice del client che le consuma, non da una chiamata autenticata; se una ti torna vuota, un issue con il messaggio del pannello è esattamente ciò che serve.
- [ ] **Aggiungere il supporto a WyvernChat.com.**
- [ ] **Verificare i lettori Character.ai e Crushon.ai con una sessione attiva.** Entrambi gli host rispondono `403` di Cloudflare alla macchina su cui è stata costruita questa versione, quindi i contratti sono verificati ma la lettura dal vivo no. Se uno dei due lettori non funziona per te, un issue con il messaggio del pannello è esattamente ciò che serve.
- [ ] **Aggiungere il supporto a Chub.ai e Venus.chub.ai.**

Un lettore che funziona a metà su un sito supportato è peggio di un sito in più che funziona del tutto: per questo i due punti Emochi sono rimasti sopra l'aggiunta di nuovi siti finché non sono stati chiusi.

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

`src/scraper.js` legge JanitorAI, `src/emochi.js` Emochi, `src/polybuzz.js` Polybuzz, `src/cai.js` Character.ai e `src/crushon.js` Crushon.ai. Tutti e cinque riempiono la stessa forma di scheda, quindi esportatori e pannello non sanno mai su che sito sei. `src/exporters.js` converte, `src/panel.js` e `src/panel.css` sono il pannello in pagina, `background.js` è il service worker per le richieste che un content script non può fare (CORS, header proibiti).

Due file esistono solo per i siti che non pubblicano mai il proprio record su un'API: `src/intercept.js` gira nel mondo della pagina stessa (`world: "MAIN"`, `document_start`) e copia nel DOM ciò che la pagina già sa; `src/harvest.js` raccoglie quei payload e assegna un punteggio a ogni oggetto contro una lista di nomi di campo noti. Aggiungere un terzo sito chiuso costa un file che dichiara le sue chiavi.

**Il registro API sito per sito è nel README inglese** ([Developer reference](README.md#developer-reference-english-only)). Resta in inglese di proposito: è materiale di riferimento e la parte che invecchia più in fretta quando un sito cambia. Verrà tradotto quando si stabilizza.

---

## Licenza

[MIT](LICENSE).
