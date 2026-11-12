# Universal Character Card Exporter

[English](README.md) · [Español](README.es.md) · [日本語](README.ja.md) · [Italiano](README.it.md) · **Deutsch** · [Русский](README.ru.md)

Eine Browser-Erweiterung, die einen Charakter von **JanitorAI**, **Emochi** oder **Polybuzz** liest und als portable Charakterkarte speichert — zum Sichern oder zum Umziehen auf ein anderes Frontend. Kein Konto, kein Build, kein Server. Sie läuft in deinem Browser, mit deiner eigenen Sitzung.

> Kostenlos und Open Source. Wenn sie dir hilft und du die ursprüngliche Arbeit unterstützen willst, schau bei [inkwell.rip](https://inkwell.rip) vorbei. Das hält Werkzeuge wie dieses am Leben.

---

## Danksagung

Dieses Projekt ist ein **Fork** von **[Character Card Extractor / JAI Card Extractor](https://github.com/erpocalypse/jai-card-extractor)** von **[erpocalypse](https://github.com/erpocalypse)**. Die ursprüngliche Erweiterung, der JanitorAI-Leser, das Panel, die Export-Pipeline und die gesamte Arbeit am Kartenformat stammen von dort.

**Wer das hier benutzt, forkt, weiterverteilt oder darauf aufbaut, muss den ursprünglichen Autor nennen und auf [github.com/erpocalypse/jai-card-extractor](https://github.com/erpocalypse/jai-card-extractor) verlinken.** Das ist eine Bedingung dieses Forks, keine Bitte.

Dieser Fork wird von **[mxchu666](https://github.com/mxchu666)** gepflegt. Er ergänzt Emochi- und Polybuzz-Unterstützung, die einheitliche Karten-Pipeline und die Dokumentation, die du gerade liest.

**Wie dieser Fork entstanden ist.** Der Code wurde mit **OpenCode** geschrieben, das **DeepSeek v4.1-flash:free** ausführt. Jeden Prompt, den ich dem Agenten gegeben habe, habe ich auf Spanisch geschrieben und **selbst von Hand ins Englische übersetzt**, bevor ich ihn verwendet habe. Die Befunde, die Tests und die API-Notizen im Entwicklerteil sind das Ergebnis dieser Arbeit und gegen die live laufenden Seiten geprüft.

---

## Was exportiert wird

| Format | Datei | Gelesen von |
|---|---|---|
| SillyTavern-Charakterkarte | `.card.json` | SillyTavern, Tavo, Agnai, RisuAI, Inkwell, die meisten Frontends |
| SillyTavern-Karte als PNG | `.card.png` | Wie oben, mit der Karte im Bild-Chunk |
| Lorebook / World Info | `.lorebook.json` | SillyTavern, Tavo |
| JanitorAI-JSON | `.jai.json` | Am nächsten am Originaldatensatz |
| Klartext | `.txt` | Alles, was Text lesen kann |

Alles läuft lokal. Nichts wird hochgeladen, es gibt keine Analyse und keinen fremden Code.

---

## Wie das Werkzeug tatsächlich funktioniert

Die Erweiterung besteht aus vier kleinen Teilen mit je einer Aufgabe und einer einzigen Regel, die alles zusammenhält: **jeder Seitenleser erzeugt dasselbe Kartenobjekt**.

```
Seite der Website
   │
   ├─ src/scraper.js    liest JanitorAI
   ├─ src/emochi.js     liest Emochi
   └─ src/polybuzz.js   liest Polybuzz
           │
           ▼
     ein Kartenobjekt
     { name, creator, avatarUrl, gender, tags,
       fields: { description, personality, scenario,
                 greeting, altGreetings, exampleDialogue },
       lorebooks[], scriptRefs[] }
           │
           ├─ src/exporters.js  ──▶ .card.json / .card.png / .lorebook.json / .jai.json / .txt
           └─ src/panel.js      ──▶ die Oberfläche auf der Seite: Blockliste, Checkboxen, Export
```

1. **Lesen.** Der Leser der Seite, auf der du bist, holt den Charakter. Jeder macht es anders, weil jede Seite eine andere Oberfläche anbietet: JanitorAI hat eine interne JSON-API, Emochi ein Next.js-Backend mit kompiliertem Prompt, Polybuzz eine serverseitig gerenderte Nuxt-Nutzlast plus eine REST-API.
2. **Normalisieren.** Der Rohdatensatz wird in das Kartenobjekt oben abgeflacht. Hier werden die Feldnamen der Seiten übersetzt: `sceneBrief` von Polybuzz wird `description`, `speechText` wird `greeting`, `templateIntro` wird `scenario`. Nichts wird erfunden. Ist ein Feld nicht veröffentlicht, bleibt es leer.
3. **Anzeigen.** Das Panel listet jeden gefundenen Block mit Checkbox und Vorschau, damit du eine eingeschleuste Jailbreak-Zeile oder einen mitgelieferten System-Prompt abwählen kannst. Der Zähler oben (`x/y kept`) sagt genau, was geschrieben wird.
4. **Exportieren.** `toBlocks()` wandelt die markierten Blöcke ins Zielformat. Der Exporter kennt die Seite nicht: Er hat nie von Emochi oder Polybuzz gehört, er kennt nur das Kartenobjekt. Deshalb bekommt jede Seite alle fünf Formate gratis.
5. **Speichern.** Ein Blob wird erzeugt und über ein `<a download>` geklickt. Nichts geht durchs Netz.

In `toBlocks()` gibt es eine bewusste Schutzregel: Ist ein Personality-Block zeichengleich mit dem Description-Block, wird er stillschweigend verworfen. Fast immer schiebt ein Server ein Feld in ein anderes, statt dass ein Autor denselben Absatz zweimal schreibt.

### Warum eine Erweiterung und keine Website

Jede dieser Seiten legt mindestens einen Teil der Daten hinter eine angemeldete Sitzung. Eine Web-App bräuchte deine Cookies; eine Erweiterung kann die Sitzung nutzen, die der Browser ohnehin hat, ohne je dein Passwort zu sehen. Genau deshalb lebt das Werkzeug dort, wo es lebt.

---

## Installation (etwa zwei Minuten)

Du musst nicht programmieren können. Es gibt nichts zu bauen oder zu kompilieren.

1. **Projekt herunterladen.** Grüner **Code**-Button auf der GitHub-Seite, dann **Download ZIP**. Entpacke es an einen dauerhaften Ort, etwa den Desktop.
2. **Erweiterungsseite öffnen.** Chrome: `chrome://extensions`. Edge: `edge://extensions`.
3. **Entwicklermodus** einschalten (Schalter oben rechts).
4. **Entpackte Erweiterung laden** und den Ordner mit der `manifest.json` auswählen.

> Wird dieser Ordner verschoben oder gelöscht, funktioniert die Erweiterung nicht mehr. Leg sie an einen dauerhaften Ort.

---

## Verwendung

### JanitorAI

1. Öffne einen Charakter auf [janitorai.com](https://janitorai.com), angemeldet.
2. Klicke unten rechts auf **Extract card**.
3. **Quick scan** liest den Charakter. **Deep scan** läuft zusätzlich durch alle angehängten Lorebooks — langsamer, vollständiger.
4. Hake ab, was du nicht willst. **Select all** / **Select none** sind dafür da.
5. Exportformat wählen.

Hat ein Charakter mehr als ein Lorebook, erscheint nach dem Deep Scan ein **Separate books**-Button, damit ein geteiltes World Book als eigene wiederverwendbare Datei gespeichert wird.

### Emochi

1. Öffne einen Charakter auf [emochi.com](https://emochi.com) (`emochi.com/character/...`).
2. **Quick scan** liest die öffentliche Nutzlast: Name, Tagline/Beschreibung, Willkommensnachricht, Tags, Avatar, Ersteller.
3. **Deep scan** fragt zusätzlich die Erstellerdefinition ab: Persönlichkeit, Szenario, Beispielgespräche. Diese Route antwortet nur für Charaktere auf **deinem eigenen Konto**; melde dich vorher an.

Manche Emochi-Charaktere haben wirklich nirgends gespeicherten Persönlichkeits- oder Szenariotext, weil die Seite sie über Tags steuert und die Persona erst im Chat erzeugt. Das ist eine Eigenschaft des Charakters, kein fehlgeschlagenes Auslesen.

### Polybuzz

1. Öffne einen Charakter auf [polybuzz.ai](https://polybuzz.ai) (`polybuzz.ai/es/character/chat/...`).
2. **Extract card** → **Quick scan**.
3. Exportieren.

Eine Polybuzz-Karte enthält, was die Seite veröffentlicht:

| Kartenfeld | Quelle in Polybuzz |
|---|---|
| Description | `sceneBrief` — die kurze Einleitung |
| Greeting | `speechText` — die Eröffnungsnachricht |
| Scenario | `templateIntro` bei Template-Bots, sonst die Regieanweisung, die der Ersteller oben in die Begrüßung geschrieben hat |
| Personality | die **Personalidad**-Tags des Erstellers (`Frío`, `Celoso`, `Tsundere`…) plus den Dialogstil, wenn veröffentlicht |
| Gender | `sceneGender`, als Zeile `Gender: Male/Female/Non-binary` in der Beschreibung |
| Tags, Avatar, Name, Ersteller | der Szenendatensatz |

---

## Polybuzz: Die Hintergrundinformationen sind nicht abrufbar. Hier ist der Grund.

Polybuzz' Anleitung zum Erstellen nennt sieben Bestandteile eines Charakters: Name, Geschlecht, kurze Einleitung, Begrüßung, Tags, **Hintergrund** und **Dialogstil** (dazu das Beispielgespräch, das den Stil lehrt). Eine öffentliche Seite veröffentlicht fünf davon. Die anderen zwei — `systemRole` (der Hintergrund, bezeichnet als *Antecedentes*) und `conversationExample` (die Beispielgespräche) — **werden niemandem außer dem Ersteller dieses Charakters geschickt**. Das ist kein fehlender Endpunkt und nichts, was diese oder eine andere Erweiterung umgehen könnte, denn **die Daten werden serverseitig zusammengesetzt und nie an einen Nicht-Eigentümer serialisiert**.

Die Belege, kurz:

- Das Erstellformular selbst zeigt das Feld als `Antecedentes (Visto en privado)` — *Antecedentes, privat einsehbar*. Es ist per Design eine Notiz nur für den Ersteller.
- Jede schreibgeschützte API-Route, die der Web-Client kennt, wurde gegen öffentliche Bots mit frischer Gastsitzung aufgerufen. Die einzige, die den Schlüssel überhaupt enthält, ist `scene/detailguest`, und sie liefert `""`.
- Die Eigentümerroute `scene/getscenedetail` antwortet `210002` für einen Bot, den dein Konto nicht besitzt. Dieser Code ist eindeutig: Der Server verweigert den Datensatz.
- Über alle 225 nachgeladenen JavaScript-Chunks der Seite hinweg erscheinen `systemRole` und `conversationExample` in **einer** Datei: der Erstellseite. Keine andere Seite fragt sie ab, also kann keine andere Seite sie anzeigen.
- Ein kontrollierter Test entscheidet es: Ein Bot, in dessen Antecedentes die Markierung `ZZZ-123` steht, aus einem zweiten Konto gescannt, zeigte die Markierung nie. Der Wert verlässt die Sitzung des Erstellers nicht.
- Das Modell zu bitten, seine Anweisungen zu zitieren, funktioniert auch nicht. Die Chat-Pipeline baut den System-Prompt serverseitig, und der Stream transportiert nur Textstücke. Als ein Bot nach seiner eigenen Lebensgeschichte gefragt wurde, erfand er selbstbewusst eine Kindheit, die er nicht hatte. Paraphrase ist nicht der gespeicherte Text, und diese Erweiterung gibt keine Generierung als Abruf aus.

**Was die Erweiterung stattdessen tut:** Sie nutzt die Felder, die Polybuzz tatsächlich veröffentlicht, und sagt das in einer Fußnote unter der Blockliste. Personality kommt aus den Tag-Wahlen des Erstellers, Scenario aus der Eröffnungs-Regieanweisung der Begrüßung, wörtlich. Nichts wird umformuliert, nichts erfunden.

Gehört dir der Charakter, werden die drei angemeldeten Routen bei jedem Scan weiterhin gefragt, und deine eigenen Bots kommen vollständig zurück.

---

## Wie dieser Fork entstanden ist, von Anfang bis Ende

Ein kurzer Bericht, weil die Form des Prozesses erklärt, warum die Grenzen oben verlässlich sind.

1. **Mit dem Originalwerkzeug anfangen.** Die vorgelagerte Erweiterung las bereits JanitorAI. Sie wurde die Basis, und die Regel für alles Weitere lautete: niemals das geerbte Verhalten ändern, nur daneben ergänzen.
2. **Einen Leser hinzufügen, keinen Sonderfall.** Emochi kam als `src/emochi.js`, das dasselbe Kartenobjekt füllt, sodass `exporters.js` und `panel.js` unverändert blieben.
3. **Die echte Nutzlast finden.** Emochi ist eine Next.js-App auf FlowGPTs Backend; die nützlichen Daten stecken in einem kompilierten `initPrompt`-String im öffentlichen Prompt-Objekt. Dieser String wird zurück in Persönlichkeit, Hintergrund, Szenario und Beispielgespräch geparst.
4. **Messen statt annehmen.** Die Aussage, Emochi veröffentliche für etwa ein Drittel der Charaktere eine Definition, stammt aus drei unabhängigen Live-Stichproben (30, 19 und 9 Charaktere) und deren Auszählung. Es ist ein Veröffentlichungs-Flag (`visibility: true`), kein Login-Gate.
5. **Polybuzz genauso ergänzen.** Nuxt rendert den Charakter serverseitig in die Seite, die Nutzlast liegt also als Devalue-Array im DOM. Dieses Array wird expandiert und durchsucht. Ein Content-Script sieht `window.__NUXT__` nicht, deshalb wird der `<script id="__NUXT_DATA__">`-Tag verwendet.
6. **Die API aufzählen, nicht raten.** Das JavaScript-Bundle der Seite deklariert 214 Request-Konfigurationen. Jede schreibgeschützte wurde gegen öffentliche Bots aufgerufen. So kam die Schlussfolgerung „der Hintergrund ist unerreichbar" zustande — nicht durch einen Fehlversuch, sondern durch Erschöpfen der Oberfläche.
7. **Das Negative mit einer Kontrolle beweisen.** Der `ZZZ-123`-Versuch über zwei Konten verwandelte „wir finden es nicht" in „es ist nicht da, um gefunden zu werden".
8. **Das Panel leise halten.** Ein fehlendes erstellerprivates Feld ist der Normalfall, kein Fehler. Das Panel zeigt eine Fußnote, kein Banner. Nur ein echter Ausfall (abgemeldet, keine Route antwortet) bekommt eine Meldung.
9. **Alles testen, was testbar ist.** `node --test` deckt die Leser, den Normalisierer, die Exporter und den Block-Builder ab. 71 Tests zum Zeitpunkt dieses Schreibens. Jede API-Aussage in diesem README wurde gegen die Live-Seite geprüft; nicht prüfbare sind als solche markiert.
10. **Aufschreiben.** Der Entwicklerteil existiert, damit die nächste Person es nicht neu herleiten muss.

**Dieses Werkzeug ist in aktiver Entwicklung und wird weiter aktualisiert.** Neue Seiten kommen dazu, kaputte Leser werden repariert, und die API-Notizen werden korrigiert, wenn eine Seite sich ändert. Wenn etwas bricht, liegt es meist daran, dass eine Seite ihre Nutzlast verändert hat — und das ist behebbar.

---

## To-do

- [ ] **Unterstützung für Character.ai hinzufügen.**
- [ ] **Unterstützung für Saucepan AI hinzufügen.**
- [ ] **Unterstützung für WyvernChat.com hinzufügen.**
- [ ] **Priorität — Emochi: Bei manchen Bots fehlen Persönlichkeit und Szenario.** Ein Teil der Emochi-Charaktere speichert wirklich keine Definition, aber die Ausfallrate ist höher, als die Messung des Veröffentlichungs-Flags erwarten lässt. Das muss isoliert werden: Nutzlast, Parser oder Charakter?
- [ ] **Priorität — Emochi: Beispielgespräche werden nicht abgerufen.** Die Definitionsroute trägt `characterExampleConversation`; sie erreicht die Karte nicht. Das bricht die Treue der Beispieldialoge und muss funktionieren, bevor Emochi als fertig gelten kann.

Die beiden Emochi-Punkte haben Vorrang vor neuen Seiten. Ein Leser, der auf einer unterstützten Seite halb funktioniert, ist schlechter als eine weitere Seite, die ganz funktioniert.

---

## Fehler melden

Nutze den **[Issues-Tab](https://github.com/mxchu666/Universal-Character-Card-Exporter/issues)**. Er ist aktiviert. Bitte gib an:

- Die Seite und die Charakter-URL.
- Welche Version du hast — **fahre mit der Maus über die Fußzeile des Export-Panels, die Version steht im Tooltip**.
- Was du erwartet hast und was du bekommen hast. Ein Screenshot des Panels ist das Nützlichste, was du anhängen kannst.
- Jede Meldung, die das Panel gezeigt hat. Bei einer fehlgeschlagenen Abfrage nennt das Panel Route und Antwortcode — genau dieser Text wird für die Reparatur gebraucht.

Funktionswünsche sind am selben Ort willkommen.

---

## Ist das erlaubt?

Es ist ein persönliches Backup-Werkzeug. Es liest, was du angemeldet ohnehin siehst, und speichert es in einem offenen Format. Es umgeht keine Paywall und schaltet nichts frei, was du sonst nicht sehen könntest.

Die Nutzungsbedingungen der Seiten können automatisierten Zugriff dennoch einschränken. Nutze es für deine eigenen Charaktere und persönliche Backups, nenne Ersteller, wenn du ihre Arbeit weitergibst, und überlaste die Seiten nicht.

## Datenschutz

- Gelesene Charakterdaten verlassen deinen Browser nie. Keine Analyse, kein fremder Code.
- Keine besonderen Berechtigungen. Die Erweiterung läuft nur auf Seiten, die du selbst öffnest.
- Die einzigen Netzwerkaufrufe gehen an die Seite, auf der du bereits bist.

---

## Für Entwickler

Die Erweiterung ist reines JavaScript, ohne Abhängigkeiten und ohne Build-Schritt. Ändere `src/` und lade sie auf der Erweiterungsseite neu.

```sh
node --test
```

`src/scraper.js` liest JanitorAI, `src/emochi.js` Emochi, `src/polybuzz.js` Polybuzz. Alle drei füllen dieselbe Kartenform, Exporter und Panel wissen also nie, auf welcher Seite du bist. `src/exporters.js` konvertiert, `src/panel.js` und `src/panel.css` sind das Panel auf der Seite, `background.js` ist der Service Worker für Anfragen, die ein Content-Script nicht stellen kann (CORS, verbotene Header).

**Die API-Aufzeichnung je Seite steht im englischen README** ([Developer reference](README.md#developer-reference-english-only)). Sie bleibt bewusst englisch: Es ist Referenzmaterial und der Teil, der am schnellsten veraltet, wenn eine Seite sich ändert. Übersetzt wird sie, sobald sie stabil ist.

---

## Lizenz

[MIT](LICENSE).
