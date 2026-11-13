# Universal Character Card Exporter

[English](README.md) · [Español](README.es.md) · [日本語](README.ja.md) · [Italiano](README.it.md) · **Deutsch** · [Русский](README.ru.md)

Eine Browser-Erweiterung, die einen Charakter von **JanitorAI**, **Emochi**, **Polybuzz**, **Character.ai**, **Crushon.ai** oder **Saucepan.ai** liest und als portable Charakterkarte speichert — zum Sichern oder zum Umziehen auf ein anderes Frontend. Kein Konto, kein Build, kein Server. Sie läuft in deinem Browser, mit deiner eigenen Sitzung.

**Neu in 0.11.1:** Das Panel zeigt die laufende Version und die PNG-Blöcke, die es geschrieben hat — damit lässt sich „No se detectaron metadatos PNG" dem Datei oder dem Leser zuordnen; das JSON trägt jetzt auch die flachen V1-Felder, die alte Importeure lesen. Alle Details im [Changelog](CHANGELOG.md) und im [Devlog](#devlog).

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
| SillyTavern-Karte als PNG | `.png` | Wie oben, mit der Karte im Bild-Chunk |
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
   ├─ src/emochi.js     liest Emochi (Charakterseiten und Lab)
   ├─ src/polybuzz.js   liest Polybuzz
   ├─ src/cai.js        liest Character.ai
   ├─ src/crushon.js    liest Crushon.ai
   │       ▲
   │       └─ src/intercept.js + src/harvest.js
   │          (Seiten, die den Datensatz nur ihrem eigenen Client geben)
           │
           ▼
     ein Kartenobjekt
     { name, creator, avatarUrl, gender, tags,
       fields: { description, personality, scenario,
                 greeting, altGreetings, exampleDialogue },
       lorebooks[], scriptRefs[] }
           │
           ├─ src/exporters.js  ──▶ .card.json / .png / .lorebook.json / .jai.json / .txt
           └─ src/panel.js      ──▶ die Oberfläche auf der Seite: Blockliste, Checkboxen, Export
```

1. **Lesen.** Der Leser der Seite, auf der du bist, holt den Charakter. Jeder macht es anders, weil jede Seite eine andere Oberfläche anbietet: JanitorAI hat eine interne JSON-API, Emochi ein Next.js-Backend mit kompiliertem Prompt, Polybuzz eine serverseitig gerenderte Nuxt-Nutzlast plus eine REST-API, und Character.ai sowie Crushon.ai geben den Datensatz nur ihrer eigenen Seite — dort fängt die Erweiterung ab, was die Seite bereits geholt hat, statt selbst zu fragen.
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

### Character.ai

1. Öffne einen Charakter auf [character.ai](https://character.ai) mit aktiver Sitzung (`character.ai/character/...`).
2. Lass die Seite fertig laden, dann **Extract card** → **Quick scan**.
3. Exportieren.

| Kartenfeld | Quelle in Character.ai |
|---|---|
| Name, Ersteller, Avatar | der Charakterdatensatz |
| Description | `title` (der Slogan), gefolgt von `description` (dem About-Text) |
| Greeting | `greeting` |
| Beispielgespräch | `definition` — die Freitext-Definition des Erstellers, wenn sie öffentlich ist |

**Zur Definition.** Character.ai versteckt die Definition eines Charakters hinter einem zweiten Schalter des Erstellers, **Definition Visibility**, getrennt von der Charakter-Sichtbarkeit. Ist er aus, schickt die Seite den Text niemandem, also bleibt der Block für Beispielgespräche leer und das Panel sagt das in einer Fußnote. Alle anderen Felder sind unabhängig davon da.

Der Leser arbeitet, indem er die Anfragen der Seite beobachtet: ein kleines Skript in der Welt der Seite (`src/intercept.js`) kopiert den `Authorization`-Header in ein verstecktes Tag und sendet jede JSON-Antwort als DOM-Ereignis erneut aus, wo der Leser sie aufnimmt. Es ändert nie eine Anfrage und schickt nie eine eigene mit deinem Token. Wenn die Seite den Aufruf noch nicht gemacht hat, fragt der Leser in dieser Reihenfolge: im Kontext der Seite selbst mit dem erfassten Header und ihren Cookies, derselbe Aufruf über den Service Worker mit Cookies, die Nutzlasten und die serverseitig gerenderten Daten, und zuletzt die Charakterseite als HTML mit dem aus dem Stream geschnittenen Datensatz. Der Header wird so verwendet, wie die Seite ihn gesendet hat: Die Seite hat sowohl `Token` als auch `Bearer` benutzt, und ein neu zusammengesetztes Schema ergibt ein 401.

### Crushon.ai

1. Öffne einen Charakter auf [crushon.ai](https://crushon.ai) (`crushon.ai/character/...`).
2. Lass die Seite fertig laden, dann **Extract card** → **Quick scan**.
3. Exportieren.

Crushon wird vollständig im Client gerendert, also liest der Leser den Datensatz, den die Seite selbst gerendert hat, statt eine API aufzurufen. Die Feld-Aliase decken jede Schreibweise ab, die die Seite über die Releases hinweg benutzt hat: `firstMessage` / `first_mes` / `greeting`, `description` / `introduction` / `intro`, `avatar` / `avatarUrl` / `image`, `mes_example` / `exampleDialogue` / `dialogue`. Wenn die Seite den Charakter noch nicht geholt hat, lade sie neu und scanne erneut.

**Zu den Feldnamen.** Der Importeur von Crushon bildet eine Tavern-Karte umgekehrt ab: die `personality` der Karte wird Crushons *Introduction*, die `description` der Karte wird Crushons *Personality*. Der Leser schreibt, was Crushon veröffentlicht, in das Kartenfeld, das dasselbe bedeutet — ein Durchlauf durch beide Werkzeuge lässt den Text also dort, wo er war.

### Saucepan.ai

1. Öffne einen Companion auf [saucepan.ai](https://saucepan.ai) (`saucepan.ai/companion/...`), angemeldet, wenn du die Definition und die Lorebooks willst.
2. Lass die Seite fertig laden, dann **Extract card** → **Quick scan**. **Deep scan** ergänzt die Lorebooks.
3. Exportieren.

| Kartenfeld | Quelle in Saucepan.ai |
|---|---|
| Name, Ersteller, Avatar | der Companion-Datensatz |
| Beschreibung | der Untertitel (`short_description`), dann Profil → **Description** |
| Persönlichkeit | Core → **Information**, dazu Fortgeschritten → **Advanced Prompt** und **Formatting Instructions**, wenn der Ersteller sie gefüllt hat |
| Begrüßung | der erste öffentliche Eintrag unter Nachrichten → **Starting Messages** |
| Alternative Begrüßungen | jede weitere öffentliche Startnachricht |
| Beispielgespräch | Nachrichten → **Example Dialogue** |
| Tags | die Tags des Companions plus seine Fandoms |
| Lorebooks | jedes angehängte Lorebook, ein Eintrag pro Kapitel |

**Proxies sind ein Feld, kein Riegel.** Saucepan versieht jeden Companion mit einer Provider-Richtlinie — *custom and vetted*, *vetted only* oder *internal only*, letzteres heißt kein externes Modell. Diese Richtlinie steht in der Hinweiszeile der Karte und nichts weiter hängt davon ab; ein Companion exportiert gleich, ob sein Ersteller Proxies erlaubt oder nicht.

**Warum die Beschreibung manchmal verschlüsselt aussieht.** Es ist keine Verschlüsselung, es ist eine Fragmentliste. `GET /api/v2/companions/{id}` liefert die Description als `{mask, version, fragments: [{key, proof, text}]}`, wobei die meisten Fragmente Köder mit zufälligem Text sind: `"signal glance window but"`, `"simple quiet maybe almost"`. Ein Fragment ist echt nur dann, wenn sein `proof` zu einem FNV-1a-Hash seines eigenen Textes passt, gesät mit der Maske und mit `key ^ mask`; die Überlebenden werden nach `key ^ mask` sortiert und zusammengefügt. `decodeFragments` in `src/saucepan.js` ist diese Routine, und die Tests führen sie gegen Fragmente aus einer echten Antwort aus. Ohne sie würdest du Fülltext exportieren.

**Öffentliche Companions, mit oder ohne offene Definition.** Der öffentliche Datensatz trägt immer Name, Untertitel, Description, Tags, Fandoms, Portrait und die Provider-Richtlinie, also exportiert ein öffentlicher Companion immer als Charakterkarte. Die Definition — Core, Beispielgespräch, Advanced Prompt, Formatierung — ist eine eigene Route und ein eigener Schalter des Erstellers namens **Definition Visibility**. Ist er aus, schickt Saucepan den Text an niemanden, die Karte kommt mit leeren Blöcken heraus, und das Panel nennt die Blöcke, die der Ersteller geschlossen hat. Startnachrichten werden ebenfalls nur ausgeliefert, wenn das Szenario öffentlich ist; gibt es keine, bleibt der Begrüßungsblock leer und das Panel sagt es.

**Companions, die dir gehören**, werden über `GET /api/v1/companion/editable` gelesen, das den rohen Editor-Datensatz zurückgibt: Core-Text, Beispielgespräch, Advanced Prompt, Formatierungsanweisungen und jedes Startszenario unabhängig von seiner Sichtbarkeit. Die Eigentümerschaft wird bei jedem Scan geprüft, also kommen deine eigenen Bots auch bei geschlossener Definition Visibility vollständig zurück.

---

## Tavo: Warum die Karte ohne Bild ankam

Zwei getrennte Fehler, beide in 0.11.0 geschlossen.

**Das PNG war eine gültige Karte, aber nur im V2-Block.** Ein Karten-PNG trägt sein JSON in base64-kodierten `tEXt`-Blöcken: `chara` für Spezifikation V2, `ccv3` für V3. Die Erweiterung schrieb nur `chara`. Tavo liest `ccv3`, findet nichts und antwortet *„No se detectaron metadatos PNG"* auf eine völlig gültige Datei. Jetzt werden beide geschrieben, in derselben Reihenfolge und Form wie bei SillyTavern, und die Tests prüfen beide Blöcke und ihre CRCs gegen `zlib.crc32`.

**Das JSON hat kein Bildfeld.** Die Spezifikation V2/V3 ist reiner Text, deshalb legt Tavo die Figur mit leerem Portrait an. Die Erweiterung bettet das Portrait jetzt als base64-Data-URI in 512×512 (~40 KB) in `avatar`, `data.avatar` und `data.extensions.avatar` ein; liest ein Frontend eines davon, ist das Bild ohne Netzwerkanfrage da. Sind die Bytes nicht zu holen, steht dort die öffentliche URL.

**Das Portrait blieb wegen eines fehlenden Headers bei den Initialen.** Der alte Weg lud den Avatar mit `<img crossOrigin="anonymous">`, was `Access-Control-Allow-Origin` in der Antwort verlangt. `image-cdn.flowgpt.com` und `cdn.mokio.ai`, die beiden Emochi-CDN, senden ihn nicht: Der Ladevorgang scheiterte, bevor ein Byte ankam, und der Export fiel still auf die Initialen-Kachel zurück. Jetzt holt `background.js` die Bytes unter einer Host-Berechtigung — der Worker ist nicht CORS-gebunden —, gibt sie als base64 zurück, und das Content-Skript dekodiert sie mit `createImageBitmap`. `cdn.polyspeak.ai`, `characterai.io` und `ella.janitorai.com` senden den Header; `cdn.crushon.ai` nicht und verlangt zusätzlich Cookies.

Chrome deaktiviert die Erweiterung nach dem Update einmal, weil das Manifest Host-Berechtigungen für diese CDN ergänzt. Auf der Erweiterungsseite wieder aktivieren.

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
11. **Wiederverwenden vor dem Schreiben.** Character.ai und Crushon.ai geben den Datensatz nur ihrem eigenen JavaScript, also deckt ein Mechanismus beide ab: ein Sniffer in der Welt der Seite und ein bewertender Durchlauf über die Nutzlasten. Eine neue Datei pro Seite, zwei geteilte, und die Exporter blieben unberührt.
12. **Die Herkunft eines Ansatzes nennen.** Das Interception-Muster stammt von [taquantas Exporter](https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter), und die Nennung steht oben in der Datei und in diesem README, nicht nur in einer Commit-Nachricht.
13. **Sagen, was nicht geprüft ist.** Beide neuen Seiten antworten einer Maschine ohne Browser mit Cloudflare `403`; die Verträge sind also dokumentiert, der Live-Lesetest nicht. Das steht an drei Stellen, statt übergangen zu werden.

**Dieses Werkzeug ist in aktiver Entwicklung und wird weiter aktualisiert.** Neue Seiten kommen dazu, kaputte Leser werden repariert, und die API-Notizen werden korrigiert, wenn eine Seite sich ändert. Wenn etwas bricht, liegt es meist daran, dass eine Seite ihre Nutzlast verändert hat — und das ist behebbar.

---

## Devlog

Die Aufzeichnung, wie jedes Release tatsächlich erreicht wurde: was versucht wurde, was scheiterte und was der Fehlschlag gelehrt hat. Neuestes zuerst. Die Kurzfassung steht im [Changelog](CHANGELOG.md); das hier ist die lange.

### 0.9.0 — zwei geschlossene Seiten, ein Mechanismus und ein Emochi-Parser mit drei Fehlern

**Emochi zuerst, weil es die Priorität war.** Zwei Meldungen waren offen: fehlende Persönlichkeit und fehlendes Szenario bei manchen Bots, und `characterExampleConversation`, das nie auf der Karte ankam.

Der Fehler mit den Beispielgesprächen war in zehn Minuten erledigt. Die Definitionsroute liefert `characterExampleConversation` als **Array von Zügen**, und der Leser wandte `String(...)` darauf an. Ein Array wird in manchen Laufzeiten zu `"[object Object],[object Object]"` und im `s()`-Helfer des Normalisierers zu `""` — in keinem Fall Dialog. Jetzt wird es als Züge geparst, und der Parser akzeptiert `{role, content}`, `{user, ai}`, `{isUser, text}` und einen `{dialogue: [...]}`-Wrapper, weil Emochis eigener Recorder die erste Form nutzt, die Karten-Importeure die zweite, und die übrigen in Datensätzen von vor einem Schemawechsel auftauchen.

Der Fehler mit der Persönlichkeit dauerte länger und bestand aus drei gestapelten, getrennten Defekten:

1. **Die Schlussanweisung wurde als Grenze behandelt.** Jeder kompilierte Prompt endet mit `Do not write as {{user}} or assume {{user}}'s reaction or response.` Der Leser schnitt dort ab und verwarf den ganzen Rest. Das ist richtig für einen Prompt, der mit der Regel endet — also für den, den der Compiler erzeugt. Es ist falsch, sobald ein Ersteller die Regel in seinem eigenen Hintergrund oder Beispielgespräch zitiert, und das passiert häufiger als man denkt: Leute fügen die Regel absichtlich in ihr Beispiel ein, um sie dem Modell beizubringen. Jeder Abschnitt nach dem Zitat verschwand. Die Korrektur: den Satz dort entfernen und den umgebenden Text behalten.
2. **Die Abschnittsgrammatik akzeptierte genau eine Formulierung.** Die Marker waren `'s personality:`, `'s background:`, `scenario of role-play:`. Wer `Personality:` schrieb — großes P, kein Possessiv, weil er seinen eigenen Prompt statt des Builders nutzte — bekam ein leeres Ergebnis, und der ganze Prompt fiel in den Zweig „keine Marker, behandle es als Persönlichkeit“. Es gibt jetzt einen zweiten, zeilenverankerten Markersatz, der die Abweichung toleriert, und der Durchlauf mit mehr erkannten Abschnitten gewinnt. Bei Gleichstand bleibt die strenge Grammatik, damit Compiler-Prompts exakt wie vorher geparst werden.
3. **Der Hinweis auf leere Abschnitte war eine Vermutung.** Der Leser sagte „der Ersteller hat Persönlichkeit und Beispielgespräch leer gelassen“, sobald diese Felder leer blieben — auch wenn der Parser das Layout gar nicht erkannt hatte, die Felder also wegen des Parsers leer waren. Der Hinweis feuert jetzt nur noch, wenn auch die Namenszeile erkannt wurde, das Layout also wirklich verstanden war.

Alle drei sind durch Tests abgedeckt, die aus den scheiternden Formen geschrieben wurden, nicht aus den funktionierenden.

**Dann Polybuzz' Beispielgespräche.** Im Ticket war ein Screenshot des *Estilo de diálogo*-Editors: Zeilen mit Avatar daneben sind `{{user}}`, Zeilen ohne sind `{{char}}`. Das Bundle der Erstellungsseite bestätigte die Form: `dialogueStyleObj` ist ein Array aus `{user, ai}`-Paaren, ein Eintrag pro Austausch, und der Detaildatensatz gibt es unter `dialogueStyle.dialogue` zurück. Beides wird jetzt in Kartenzeilen geparst. Der flache `conversationExample`-String ist dieselben Daten als `user;ai` pro Zeile, und auch diese Form wird umgeschrieben.

Eine Falle: ein reiner String unter `dialogueStyle` ist das **Stil-Label** (`Descriptivo, frases cortas`), kein Dialog. Die erste Version des Parsers schrieb fröhlich ein Stil-Label in `{{char}}: Descriptivo, frases cortas` um und steckte es in den Beispielblock. Die Tests fingen es. Strings werden jetzt nie Dialog; nur Arrays und `user;ai`-Text.

**Dann Character.ai.** Der Ansatz stammt von [taquantas Exporter](https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter), der dasselbe Problem gelöst hat: Den Datensatz holt nur das JavaScript der Seite selbst, mit einem `Authorization: Token <hex>`-Header, den die Erweiterung nicht ausstellen kann. Die Referenzimplementierung führt ein Skript in der Welt der Seite (`MAIN`) aus, überschreibt `fetch` und `XMLHttpRequest` und legt den Header im DOM ab. Das ist der einzige Weg, einen Header zu sehen, den der Browser außerhalb deines Kontexts hinzufügt.

Zwei Änderungen daran. Das Token landet in einem Meta-Tag mit eigenem Namensraum statt in einem, das kollidieren kann. Und jede JSON-Antwort, die die Seite erhält, wird als DOM-Ereignis erneut ausgesandt, das einen **String** trägt — Objekte überqueren die Grenze zwischen einem `MAIN`-Skript und einem isolierten Content-Script nicht, Strings schon. Diese eine Änderung machte aus dem Sniffer „Token fangen und Aufruf wiederholen“ ein „Token *und* Antwort fangen“, sodass der Leser auch dann funktioniert, wenn die Wiederholung abgelehnt wird.

Die Definition ist das interessante Feld. Character.ai legt sie hinter **Definition Visibility**, einen zweiten Schalter getrennt von der Charakter-Sichtbarkeit, und ist er aus, wird der Text niemandem geschickt. Eine Karte mit leerem Beispielblock ist also eine Einstellung des Erstellers, kein Fehlschlag beim Lesen, und das Panel sagt genau das, statt einen Fehler zu zeigen.

**Dann Crushon.ai.** Vollständig im Client gerendert, hinter einer Bot-Mauer. Es gibt keine öffentliche API zum Wiederholen, und die Aufrufe der Seite tragen Sitzungszustand, also ruft der Leser nichts auf: er läuft durch die Nutzlasten, die die Seite schon erhalten hat, und bewertet jedes Objekt danach, wie viele bekannte Feldnamen es trägt. Der reichste Treffer gewinnt. Die Aliase decken die Schreibweisen ab, die die Seite über Releases hinweg genutzt hat, denn eine verpasste Schreibweise kostet das ganze Feld.

Der gemeinsame Teil beider Leser ist `src/harvest.js`: Nutzlast-Sammlung, Token-Rücklesen und der bewertende Durchlauf. Zwei neue Leser, zwei geteilte Dateien, null Änderungen an `exporters.js` oder `panel.js` — die Regel, dass jeder Seitenleser dasselbe Kartenobjekt füllt, machte das möglich, und sie ist der Grund, warum die nächste Seite eine Datei kostet.

**Was nicht geprüft werden konnte.** Beide neuen Hosts antworten der Maschine, auf der das gebaut wurde, mit Cloudflare `403`; keiner der beiden Leser lief also gegen einen angemeldeten Browser. Geprüft wurde: der neo-Endpunkt lebt und antwortet einer synthetischen ID mit `{"status":"NOT_OK","error":"bad request"}`, also beschwert sich die Route über den Body, nicht über den Aufrufer. Die Feldverträge stammen aus taquantas funktionierender Implementierung. Es steht als ungeprüft im Changelog, in der To-do-Liste und hier, weil ein nicht ausgeführter Leser eine andere Behauptung ist als einer, der lief.

### 0.8.0 — der Fork bekommt einen Namen und sechs Sprachen

Das Repository trug noch seinen ursprünglichen Namen, während es vier Seiten unterstützte. Umbenannt in **Universal Character Card Exporter**, was es tut. Issues wurde gleichzeitig aktiviert, weil der Abschnitt zum Melden von Fehlern die Leute auf einen Tab schickte, den es nicht gab.

Die Dokumentation ging in einem Durchgang auf sechs Sprachen. Die API-Referenz pro Seite bleibt auf Englisch und sagt das oben im Abschnitt: Es ist Referenzmaterial, das am schnellsten veraltet, und sechs Kopien eines veralteten Dokuments sind sechsmal die Pflege ohne Gewinn. Die Übersetzungen verlinken dorthin.

Der Polybuzz-Abschnitt wurde neu geschrieben. Vorher stand dort „nicht abrufbar“ als Schlussfolgerung. Jetzt steht die Evidenz darunter — das privat-by-design-Label im Erstellungsformular, der erschöpfende Routen-Sweep, das `210002` beim Bot eines anderen, der `ZZZ-123`-Kontrolltest auf zwei Konten. Ein behauptetes negatives Ergebnis ist nichts wert; ein negatives Ergebnis mit angehängter Methode ist etwas wert.

### 0.7.13 — Persönlichkeit aus den Tags des Erstellers

Polybuzz veröffentlicht weder Hintergrund noch Persönlichkeitsfeld, was Karten mit leerem Personality-Block hinterließ. Der Tag-Baum wurde ohnehin für die Tag-Liste der Karte geholt, also wurde er genauer gelesen: Jeder Tag liegt unter einem von vier Eltern, und `Personalidad` enthält 41 Temperamentswörter, die der Ersteller von Hand wählt. Das ist die Charakterisierung des Erstellers, von ihm geschrieben, von der Seite veröffentlicht.

Die Verknüpfung ist in einem präzisen Sinn ehrlich: Genre-, Herkunfts- und Identitäts-Tags bleiben aus Personality heraus und in der Tag-Liste, und ein echter `systemRole` schlägt die Tags weiterhin, wenn es einen gibt. Gemessen an 10 Live-Bots: 10/10 ergaben einen echten Personality-Block. Eine Tag-Liste ist dünner als ein geschriebener Hintergrund, aber es sind die Worte des Erstellers statt einer Vermutung.

### 0.7.10 – 0.7.12 — ein Echo ist kein Feld

Drei Releases, eine Idee. `getsceneconfig` mit einer Szenen-ID antwortet mit dem kompilierten Einleitungstext als Fallback. Fünf angemeldete Scans von Bots, die das Konto nicht besitzt, ergaben ein `systemRole`, das zeichengleich mit `sceneBrief` war. So rendert der Server einen leeren Hintergrund, nicht ein zweites Feld, das zufällig übereinstimmt. Ein exaktes Echo gilt jetzt als Abwesenheit, jede Route behält ihre eigene Antwort statt der ersten nicht-leeren, und das Panel zeigt eine Fußnote statt eines Banners, weil ein erstellerprivates Feld der Normalfall ist.

Das Szenario kam aus derselben Arbeit: Polybuzz-Begrüßungen beginnen oft mit einer Regieanweisung (`*Bangchan es tu esposo*`), und das ist die Prämisse des Erstellers. Sie wird wortgleich übernommen, wenn der Datensatz kein `templateIntro` trägt. Paraphrasiert wird nie etwas.

---

## Changelog

Vollständige Release-Historie mit jeder Korrektur und ihrem Grund: **[CHANGELOG.md](CHANGELOG.md)**.

Kurzfassung:

| Version | Was kam |
|---|---|
| 0.11.1 | Panel zeigt die laufende Version und die geschriebenen PNG-Blöcke; das JSON trägt auch die flachen V1-Felder; 107 Tests |
| 0.11.0 | PNG mit `chara` + `ccv3`, Portraits über den Worker geholt, damit ein CDN ohne CORS nicht mehr die Initialen liefert, JSON mit dem Portrait als Data-URI; 106 Tests |
| 0.10.0 | Leser für Saucepan.ai: Fragment-Dekodierung, zwei Lesepfade, Lorebooks, Provider-Richtlinie in der Hinweiszeile; 103 Tests |
| 0.9.1 | Character.ai: Auth-Schema beibehalten, Kaltstart-Leiter, Fallback auf gerenderte Daten, 92 Tests |
| 0.9.0 | Leser für Character.ai und Crushon.ai, Polybuzz-Beispielgespräche, Emochi-Parser-Korrekturen, Emochi Lab, 92 Tests |
| 0.8.0 | Umbenennung, Dokumentation in sechs Sprachen, Credit-Abschnitt, Polybuzz-Evidenz neu geschrieben, Issues aktiviert |
| 0.7.13 | Polybuzz-Personality aus den `Personalidad`-Tags des Erstellers |
| 0.7.12 | Polybuzz-Szenario aus der Regieanweisung der Begrüßung |
| 0.7.11 | Kandidaten pro Route, damit ein Echo keinen echten Hintergrund verdeckt |
| 0.7.10 | Gesprächsbewusste Config-Kette, leises Panel |
| 0.7.0 – 0.7.9 | Polybuzz-Unterstützung, von Anfang bis Ende |
| 0.6.0 – 0.6.1 | Emochi-Leser und Tiefenscan der Prompt-Historie |
| 0.5.0 und früher | JanitorAI, übernommen aus erpocalypses ursprünglicher Erweiterung |

---

## To-do

- [x] **Unterstützung für Character.ai hinzufügen.** Erledigt in 0.9.0. Die Definition hängt weiterhin am Definition-Visibility-Schalter des Erstellers.
- [x] **Unterstützung für Crushon.ai hinzufügen.** Erledigt in 0.9.0, liest, was die Seite rendert.
- [x] **Priorität — Emochi: Bei manchen Bots fehlen Persönlichkeit und Szenario.** Behoben in 0.9.0. Drei Ursachen, alle im Parser: die Schlussanweisung wurde als Schnittgrenze behandelt, die Abschnittsgrammatik akzeptierte nur eine exakte Formulierung, und der Hinweis „der Ersteller hat es leer gelassen“ feuerte bei einem Layout, das nicht erkannt worden war. Details im [Changelog](CHANGELOG.md).
- [x] **Priorität — Emochi: Beispielgespräche werden nicht abgerufen.** Behoben in 0.9.0. `characterExampleConversation` kommt als Array von Zügen, und die String-Umwandlung machte `""` daraus. Jetzt wird es als Züge geparst.
- [x] **Emochi-Lab-Unterstützung.** Story-, Soundstage- und LiveRoom-URLs werden gegen denselben Prompt-Datensatz gelesen, wobei das letzte Pfadsegment als ID dient. Die abgemeldete Sitzung hat die tatsächliche URL-Form des Lab nie gezeigt; nutzt eine Oberfläche einen anderen Datensatztyp, meldet das Panel also die fehlgeschlagene Route statt einer halben Karte.
- [x] **Unterstützung für Saucepan AI hinzufügen.** Erledigt in 0.10.0. Öffentliche Companions exportieren mit der Description und jeder öffentlichen Startnachricht; Definition und Lorebooks brauchen eine angemeldete Sitzung, die Definition zusätzlich den Schalter Definition Visibility des Erstellers. Die Routen für Definition und Editable sind aus dem Client-Code dokumentiert, der sie konsumiert, nicht aus einem angemeldeten Aufruf — kommt dir eine leer zurück, ist ein Issue mit der Panel-Meldung genau das Richtige.
- [ ] **Unterstützung für WyvernChat.com hinzufügen.**
- [ ] **Die Leser für Character.ai und Crushon.ai mit einer angemeldeten Sitzung prüfen.** Beide Hosts antworten der Maschine, auf der dieses Release gebaut wurde, mit Cloudflare `403`; die Verträge sind also geprüft, der Live-Lesetest nicht. Wenn einer der beiden Leser bei dir scheitert, ist ein Issue mit der Panel-Meldung genau das, was gebraucht wird.
- [ ] **Unterstützung für Chub.ai und Venus.chub.ai hinzufügen.**

Ein Leser, der auf einer unterstützten Seite halb funktioniert, ist schlechter als eine weitere Seite, die ganz funktioniert — deshalb lagen die beiden Emochi-Punkte über neuer Seitenunterstützung, bis sie geschlossen waren.

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

`src/scraper.js` liest JanitorAI, `src/emochi.js` Emochi, `src/polybuzz.js` Polybuzz, `src/cai.js` Character.ai und `src/crushon.js` Crushon.ai. Alle fünf füllen dieselbe Kartenform, Exporter und Panel wissen also nie, auf welcher Seite du bist. `src/exporters.js` konvertiert, `src/panel.js` und `src/panel.css` sind das Panel auf der Seite, `background.js` ist der Service Worker für Anfragen, die ein Content-Script nicht stellen kann (CORS, verbotene Header).

Zwei Dateien existieren nur für die Seiten, die ihren Datensatz nie über eine API veröffentlichen: `src/intercept.js` läuft in der Welt der Seite (`world: "MAIN"`, `document_start`) und kopiert ins DOM, was die Seite schon weiß; `src/harvest.js` sammelt diese Nutzlasten und bewertet jedes Objekt gegen eine Liste bekannter Feldnamen. Eine dritte geschlossene Seite kostet eine Datei, die ihre Schlüssel nennt.

**Die API-Aufzeichnung je Seite steht im englischen README** ([Developer reference](README.md#developer-reference-english-only)). Sie bleibt bewusst englisch: Es ist Referenzmaterial und der Teil, der am schnellsten veraltet, wenn eine Seite sich ändert. Übersetzt wird sie, sobald sie stabil ist.

---

## Lizenz

[MIT](LICENSE).
