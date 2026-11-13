# Universal Character Card Exporter

**English** · [Español](README.es.md) · [日本語](README.ja.md) · [Italiano](README.it.md) · [Deutsch](README.de.md) · [Русский](README.ru.md)

A browser extension that reads a character from **JanitorAI**, **Emochi**, **Polybuzz**, **Character.ai**, **Crushon.ai** or **Saucepan.ai** and saves it as a portable character card, so you can back it up or move it to another frontend. No account, no build step, no server. It runs in your own browser, on your own session.

**New in 0.10.0:** Saucepan.ai, including the shuffled-shard description the site serves instead of plain text. Full detail in the [changelog](CHANGELOG.md) and in the [devlog](#devlog).

> Free and open source. If you find it useful and want to support the original work, check out [inkwell.rip](https://inkwell.rip). That is what keeps tools like this coming.

---

## Credit where it is due

This project is a **fork** of **[Character Card Extractor / JAI Card Extractor](https://github.com/erpocalypse/jai-card-extractor)** by **[erpocalypse](https://github.com/erpocalypse)**. The original extension, the JanitorAI reader, the panel, the exporter pipeline and the card format work all come from there.

**If you use, fork, redistribute or build on this, you must credit the original creator and link back to [github.com/erpocalypse/jai-card-extractor](https://github.com/erpocalypse/jai-card-extractor).** That is a condition of this fork, not a request.

This fork is maintained by **[mxchu666](https://github.com/mxchu666)**. It adds Emochi and Polybuzz support, the multi-site card pipeline, and the documentation you are reading.

**How this fork was made.** The code was written with **OpenCode** running **DeepSeek v4.1-flash:free**. Every prompt I supplied to the agent was written in Spanish and I translated all of them into English myself, by hand, before feeding them in. The findings, the probes and the API notes in the developer section are the result of that work, verified against the live sites.

---

## What it exports

| Format | File | Read by |
|---|---|---|
| SillyTavern character card | `.card.json` | SillyTavern, Tavo, Agnai, RisuAI, Inkwell, most frontends |
| SillyTavern card as PNG | `.card.png` | Same as above, with the card embedded in the image chunk |
| Lorebook / World Info | `.lorebook.json` | SillyTavern, Tavo |
| JanitorAI JSON | `.jai.json` | Closest to the original record |
| Plain text | `.txt` | Anything that reads text |

Everything happens locally. Nothing is uploaded, there is no analytics, and no outside code is loaded.

---

## How the tool actually works

The extension is four small pieces with one job each, and a single rule that holds the whole thing together: **every site reader produces the same card object**.

```
site page
   │
   ├─ src/scraper.js    reads JanitorAI
   ├─ src/emochi.js     reads Emochi (character pages and the Lab)
   ├─ src/polybuzz.js   reads Polybuzz
   ├─ src/cai.js        reads Character.ai
   ├─ src/crushon.js    reads Crushon.ai
   │       ▲
   │       └─ src/intercept.js + src/harvest.js
   │          (sites that only hand the record to their own client)
           │
           ▼
     one card object
     { name, creator, avatarUrl, gender, tags,
       fields: { description, personality, scenario,
                 greeting, altGreetings, exampleDialogue },
       lorebooks[], scriptRefs[] }
           │
           ├─ src/exporters.js  ──▶ .card.json / .card.png / .lorebook.json / .jai.json / .txt
           └─ src/panel.js      ──▶ the on-page UI: block list, checkboxes, export row
```

1. **Read.** The reader for the site you are on gathers the character. Each one does it differently, because each site exposes a different surface: JanitorAI has an internal JSON API, Emochi has a Next.js backend with a compiled prompt string, Polybuzz has a server-rendered Nuxt payload plus a REST API, and Character.ai and Crushon.ai only hand the record to their own page — so for those two the extension sniffs what the page already fetched instead of asking for it.
2. **Normalise.** The raw record is flattened into the card object above. This is where field names from the other site get translated: Polybuzz's `sceneBrief` becomes `description`, `speechText` becomes `greeting`, `templateIntro` becomes `scenario`. Nothing is invented. If a field is not published, it stays empty.
3. **Present.** The panel lists every block it found with a checkbox and a preview, so you can drop a jailbreak line or a system prompt that got bundled in. The count at the top (`x/y kept`) tells you exactly what will be written.
4. **Export.** `toBlocks()` turns the ticked blocks into the target format. The exporter is site-agnostic: it has never heard of Emochi or Polybuzz, it only knows the card object. That is why every site gets all five formats for free.
5. **Save.** A Blob is created and clicked through an `<a download>`. Nothing crosses the network.

There is one deliberate guard in `toBlocks()`: if a Personality block ends up character-for-character identical to the Description block, it is dropped silently. That situation is almost always a server echoing one field into another, not a creator writing the same paragraph twice.

### Why a browser extension and not a website

Every site here gates at least part of its data behind a signed-in session. A web app would need your cookies; an extension can borrow the session the browser already has, without ever seeing your password. That is the entire reason the tool lives where it does.

---

## Installing it (about two minutes)

You do not need to know how to code. There is nothing to build or compile.

1. **Download this project.** Click the green **Code** button on the GitHub page, then **Download ZIP**. Unzip it somewhere permanent, like your Desktop.
2. **Open your browser's extensions page.** Chrome: type `chrome://extensions`. Edge: `edge://extensions`.
3. **Turn on Developer mode** (top-right switch).
4. Click **Load unpacked** and pick the folder that contains `manifest.json`.

> If you move or delete that folder, the extension stops working. Keep it somewhere permanent.

---

## Using it

### JanitorAI

1. Open a character on [janitorai.com](https://janitorai.com) while signed in.
2. Click **Extract card** in the bottom-right corner.
3. **Quick scan** reads the character. **Deep scan** also walks every lorebook attached to it — slower, more complete.
4. Untick anything you do not want. **Select all** / **Select none** are there for that.
5. Pick an export format.

If a character has more than one lorebook, a **Separate books** button appears after a deep scan, so a shared world book can be saved as its own reusable file.

### Emochi

1. Open a character on [emochi.com](https://emochi.com) (`emochi.com/character/...`).
2. **Quick scan** reads the public payload: name, tagline/description, welcome message, tags, avatar, creator.
3. **Deep scan** additionally asks for the creator definition — personality, scenario, example conversations. That route answers only for characters on **your own account**; sign in first.

Some Emochi characters genuinely have no personality or scenario text stored anywhere, because the site drives them from tags and generates the persona at chat time. That is a property of the character, not a failed read.

### Polybuzz

1. Open a character on [polybuzz.ai](https://polybuzz.ai) (`polybuzz.ai/es/character/chat/...`).
2. Click **Extract card** → **Quick scan**.
3. Export.

A Polybuzz card comes out with what the site publishes:

| Card field | Polybuzz source |
|---|---|
| Description | `sceneBrief` — the short introduction |
| Greeting | `speechText` — the opening message |
| Scenario | `templateIntro` when the bot is template-based, otherwise the stage direction the creator wrote at the top of the greeting |
| Personality | the creator's own **Personalidad** tags (`Frío`, `Celoso`, `Tsundere`…), plus the dialogue style when published |
| Gender | `sceneGender`, carried as a `Gender: Male/Female/Non-binary` line in the description |
| Tags, avatar, name, creator | the scene record |

### Character.ai

1. Open a character on [character.ai](https://character.ai) while signed in (`character.ai/character/...`).
2. Let the page finish loading, then click **Extract card** → **Quick scan**.
3. Export.

| Card field | Character.ai source |
|---|---|
| Name, creator, avatar | the character record |
| Description | `title` (the tagline) followed by `description` (the About text) |
| Greeting | `greeting` |
| Example dialogue | `definition` — the creator's free-text definition, when it is public |

**About the Definition.** Character.ai hides a character's Definition behind a second creator switch called **Definition Visibility**, separate from Character Visibility. When it is off, the site does not send the text to anyone, so the example dialogue block comes out empty and the panel says so in a footnote. Every other field is there regardless.

The reader works by watching the page's own requests: a small script in the page's own world (`src/intercept.js`) copies the `Authorization` header into a hidden tag and re-broadcasts every JSON response as a DOM event, which the reader picks up. It never changes a request and never sends one of its own with your token.

When the page has not made the call yet — a cold load of a profile URL is rendered server-side, so there is no response to watch — the reader asks, in this order: the page's own context with the captured header and cookies, the same call through the extension's service worker with cookies, the payloads and the page's server-rendered flight data, then the character page fetched as HTML with the record cut out of the stream. The failure message names every endpoint, transport and status that was tried, so a bug report says which stage refused.

**Fixed in 0.9.1.** Two faults made this fail on a real page (`character.ai/character/piNpVEtc`): the reader rebuilt the auth scheme as `Token` after stripping whatever the page used, so a `Bearer` session was rejected; and the worker transport sent no cookies, so Cloudflare answered 403. The header is now carried through untouched and every transport carries cookies. Detail in the [changelog](CHANGELOG.md).

### Crushon.ai

1. Open a character on [crushon.ai](https://crushon.ai) (`crushon.ai/character/...`).
2. Let the page finish loading, then click **Extract card** → **Quick scan**.
3. Export.

Crushon is fully client-rendered, so the reader reads the record the page itself rendered rather than calling an API. Field aliases cover every spelling the site has shipped across releases: `firstMessage` / `first_mes` / `greeting`, `description` / `introduction` / `intro`, `avatar` / `avatarUrl` / `image`, `mes_example` / `exampleDialogue` / `dialogue`. If the page has not fetched the character yet, reload it and scan again.

**Note on field names.** Crushon's own importer maps a Tavern card inverted: card `personality` becomes Crushon's *Introduction*, card `description` becomes Crushon's *Personality*. The reader reports what Crushon publishes, in the field it belongs to on the card, so round-tripping through both tools lands the text back where it started.

### Saucepan.ai

1. Open a companion on [saucepan.ai](https://saucepan.ai) (`saucepan.ai/companion/...`), signed in if you want the definition and the lorebooks.
2. Let the page finish loading, then click **Extract card** → **Quick scan**. **Deep scan** adds the lorebooks.
3. Export.

| Card field | Saucepan.ai source |
|---|---|
| Name, creator, avatar | the companion record; the portrait resolves to `https://saucepan.ai/cdn/{image id}/card` |
| Description | the tagline (`short_description`), then Profile → **Description** |
| Personality | Core → **Information**, plus Advanced → **Advanced Prompt** and **Formatting Instructions** when the creator filled them in |
| Greeting | the first public entry of Messages → **Starting Messages** |
| Alternate greetings | every other public starting message |
| Example dialogue | Messages → **Example Dialogue** |
| Tags | the companion's tags plus its fandoms |
| Lorebooks | each attached lorebook, one entry per chapter |

**Proxies are a field, not a gate.** Saucepan labels each companion with a provider policy — *custom and vetted*, *vetted only*, or *internal only*, the last meaning no external model at all. That policy is shown on the card's note line and nothing else depends on it; a companion exports the same whether its creator allows proxies or not.

**Why the description sometimes looks encrypted.** It is not encryption, it is a shard list. `GET /api/v2/companions/{id}` returns Description as `{mask, version, fragments: [{key, proof, text}]}`, where most shards are decoys carrying random text: `"signal glance window but"`, `"simple quiet maybe almost"`. A shard is real only if its `proof` matches a FNV-1a hash of its own text, seeded by the mask and by `key ^ mask`; the survivors are then sorted by `key ^ mask` and joined. `decodeFragments` in `src/saucepan.js` is that routine, and the tests run it against shards copied out of a live response. Without it you would export filler.

**Public companions, with or without an open definition.** The public record always carries the name, tagline, Description, tags, fandoms, portrait and the provider policy, so a public companion always exports as a character card. The definition — Core, example dialogue, advanced prompt, formatting — is a separate route and a separate creator switch called **Definition Visibility**. When the switch is off, Saucepan does not send the text to anyone, the card comes out with those blocks empty, and the panel says which blocks the creator closed. Starting messages are likewise only served when the scenario itself is public; when none is, the greeting block is empty and the panel says so.

**Companions you own** are read through `GET /api/v1/companion/editable`, which returns the raw editor record: Core text, example dialogue, advanced prompt, formatting instructions and every starting scenario regardless of its access level. Ownership is detected per scan, so your own bots come back complete even with Definition Visibility closed.

---

## Polybuzz: the background information cannot be retrieved. Here is why.

Polybuzz's creation guide lists seven things a character is made of: name, gender, short introduction, greeting, tags, **background** and **dialogue style** (plus the sample dialogue that teaches the style). A public page publishes five of them. The other two — `systemRole` (the background, labelled *Antecedentes*) and `conversationExample` (the example dialogues) — are **not sent to anyone except the creator of that character**. This is not a missing endpoint and not something this or any extension can work around, because **the data is assembled server-side and never serialised to a non-owner**.

The evidence, in short:

- The create form itself renders the field as `Antecedentes (Visto en privado)` — *Antecedentes, privately seen*. It is a creator-only note by design.
- Every read-only API route the web client knows was called against public bots with a fresh guest session. The only one that even contains the key is `scene/detailguest`, and it returns `""`.
- The owner route `scene/getscenedetail` answers `210002` for a bot your account does not own. That code is definitive: the server refuses the record.
- Across all 225 lazy-loaded JavaScript chunks of the site, `systemRole` and `conversationExample` appear in **one** file: the create page. No other page ever asks for them, so no other page can render them.
- A controlled test settles it: a bot created with the marker `ZZZ-123` in its Antecedentes, then scanned from a second account, never showed the marker. The value does not leave the creator's session.
- Asking the model to recite its own instructions does not work either. The chat pipeline builds the system prompt server-side and the stream carries only text chunks. The one time a bot was asked for its own life story it confidently invented a childhood it did not have — paraphrased output is not the stored text, and this extension will not pass generation off as retrieval.

**What the extension does instead:** it uses the fields Polybuzz does publish, and it says so in a footnote under the block list. Personality comes from the creator's own tag picks; Scenario comes from the greeting's own opening direction, verbatim; nothing is paraphrased and nothing is invented.

If you own the character, all three signed-in routes are still asked on every scan, and your own bots come back complete.

---

## How this fork was built, start to finish

A short record, because the shape of the process explains why the limits above are trustworthy.

1. **Start with the original tool.** The upstream extension already read JanitorAI. It became the base, and the rule for everything after was: never change the upstream behaviour, only add beside it.
2. **Add a reader, not a special case.** Emochi was added as `src/emochi.js` filling the same card object, so `exporters.js` and `panel.js` needed no changes at all.
3. **Find the real payload.** Emochi is a Next.js app on FlowGPT's backend; the useful data sits in a compiled `initPrompt` string on the public prompt object. That string is parsed back into personality, background, scenario and example dialogue.
4. **Measure, do not assume.** The claim that Emochi publishes a definition for about a third of characters came from sampling three independent live lists (30, 19 and 9 characters) and counting. It is a publish flag (`visibility: true`), not a login gate.
5. **Add Polybuzz the same way.** Nuxt server-renders the character into the page, so the payload is in the DOM as a devalue array. That array is expanded and searched. A content script cannot see `window.__NUXT__`, so the `<script id="__NUXT_DATA__">` tag is used instead.
6. **Enumerate the API, do not guess it.** The site's JavaScript bundle declares 214 request configs. Every read-only one was called against public bots. This is how the "background is unreachable" conclusion was reached — not by failing once, but by exhausting the surface.
7. **Prove the negative with a control.** The `ZZZ-123` experiment, run on two accounts, is what turned "we cannot find it" into "it is not there to be found".
8. **Keep the panel quiet.** A missing creator-private field is the normal case, not an error. The panel shows a footnote, not a banner. Only a genuine failure (signed out, no route answered) gets a message.
9. **Test everything that can be tested.** `node --test` covers the readers, the normaliser, the exporters and the block builder. 92 tests at the time of writing. Every API claim in this README was verified against the live site, and the ones that could not be verified are labelled as such.
10. **Write it down.** The developer section below exists so the next person does not have to re-derive it.
11. **Reuse before writing.** Character.ai and Crushon.ai both only give the record to their own JavaScript, so one mechanism covers both: a page-world sniffer plus a scoring walk over the payloads. One new file each, plus two shared ones, and the exporters were not touched.
12. **Credit the source of an approach.** The interception pattern comes from [taquanta's exporter](https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter), and the credit sits at the top of the file and in this README, not only in a commit message.
13. **Say what is not verified.** Both new sites answer Cloudflare `403` to a machine without a browser, so the contracts are documented and the live read is not. That is written down in three places rather than glossed over.

**This tool is under active development and will keep receiving updates.** New sites get added, broken readers get fixed, and the API notes get corrected when a site changes. If something breaks, it is usually because a site changed its payload shape, and that is fixable.

---

## Devlog

The record of how each release was actually reached: what was tried, what failed, and what the failure taught. Newest first. The short version is in the [changelog](CHANGELOG.md); this is the long one.

### 0.10.0 — Saucepan, and the description that arrives in pieces

**The site is not what it looks like from outside.** `api.saucepan.ai` resets the connection for anything without a browser, which usually means Cloudflare and a dead end. It was not a dead end: the app's own base URL is the empty string, so every call goes to `https://saucepan.ai/api/...` and is proxied at the edge. Same origin, no CORS, and a static header the client stamps on every request (`cf-edge-token-8af3`). That one discovery made the whole site readable without a browser.

**Then the field contract, from the bundle rather than from a guess.** The app ships one 9.8 MB bundle with the whole API in it. It declares 666 request paths. The companion editor's validation schema names every field the site stores — `card` (the Core text), `full_description`, `short_description`, `example_dialogue`, `starting_scenarios[]`, `advanced_prompt`, `formatting_instructions`, `hidden_fields`, `external_model_policy` — and the profile component names every field it renders. Two shapes, one product; the difference between them is the story of this release.

**The description is a shard list with decoys in it.** The first live public companion returned this for Description:

```
{"version":1,"mask":18225,"fragments":[
  {"text":"..well.","key":18209,"proof":2268427821},
  {"text":"signal glance window but","key":23164,"proof":1183433097},
  {"text":" of the ","key":18228,"proof":1032121143},
  {"text":"most powe","key":18231,"proof":1661349743}, …]}
```

Fifty-four shards, seven of them real. The decoys are grammatical noise generated from a small word bank — *signal*, *glance*, *window*, *pattern*, *gentle*, *quiet* — so they read like prose at a glance and survive a naive "take the longest strings" heuristic. The disambiguation is in the client: each shard carries a `proof`, and a shard is real only when that proof equals a FNV-1a hash of the shard's own text with a seed derived from the mask and from `key ^ mask`. Real shards are then sorted by `key ^ mask` and joined. Seven shards reassembled to 137 characters of clean copy. The routine is now `decodeFragments`, verified against shards copied out of the live response, and the working output is quoted in the commit that added it.

**Starting messages are described the same way.** `starting_scenarios_fragments[].message` is another shard set. The same decoder runs on it. A scenario the creator kept private is simply absent from the response, and a blank scenario slot is stored as the sentinel `≠≠≠BLANK_SCENARIO≠≠≠`, which the reader drops.

**Proxies were the question, and the answer is `providers_profile`.** The ticket asked whether the reader works when a bot allows proxies and when it does not. The field is `external_model_policy` in the editor and `providers_profile` on the public record: `custom_and_vetted`, `vetted_only`, `internal_only`. It gates which model the chat can call, not what the profile serves, so it is reported on the note line and used for nothing else. Both cases export identically — checked against one companion of each policy.

**Two read paths, because a public companion has two visibility switches.** The public record is anonymous and always carries the Description. The definition is a second call, needs the bearer token the page keeps in `localStorage["hallucination/auth_token"]`, and is refused when the creator set Definition Visibility to closed — the same shape of gate as Character.ai's, and reported the same way: a footnote naming the closed blocks, not an error. A companion you own has a third route, `/api/v1/companion/editable`, which returns the raw editor record and does not care about visibility at all.

**What was not verified.** The definition and editable routes need a session, so their response shapes come from the client code that consumes them (`{sections:[{title, content}]}`, and the editor record) rather than from a signed-in call. The public route, the shard decoder, the provider policy and the scenario fragments were all exercised against live companions. 103 tests, 11 of them new.

### 0.9.0 — two gated sites, one mechanism, and an Emochi parser that had three bugs

**Emochi first, because it was the priority.** Two reports were open: personality and scenario missing on some bots, and `characterExampleConversation` never reaching the card.

The example-conversation bug took ten minutes. The definition route returns `characterExampleConversation` as an **array of turns**, and the reader ran `String(value)` over it. An array coerces to `"[object Object],[object Object]"` in some runtimes and to `""` in the normaliser's own `s()` helper — either way, not dialogue. It is now parsed as turns, and the parser accepts `{role, content}`, `{user, ai}`, `{isUser, text}` and a `{dialogue: [...]}` wrapper, because Emochi's own recorder uses the first shape, the card importers use the second, and the rest appear in records from before a schema change.

The missing-personality bug took longer and turned out to be three separate faults stacked on each other:

1. **The closing instruction was treated as a boundary.** Every compiled prompt ends with `Do not write as {{user}} or assume {{user}}'s reaction or response.` The reader cut the text there — the entire tail was discarded. That is correct for a prompt that ends with the rule, which is what the compiler produces. It is wrong the moment a creator quotes the rule inside their own background or example dialogue, which happens more often than you would think: people paste the rule into their example on purpose, to teach the model. Every section after the quote disappeared. The fix is to remove that sentence where it appears and keep the text around it.
2. **The section grammar accepted one exact wording.** The markers were `'s personality:`, `'s background:`, `scenario of role-play:`. A creator who typed `Personality:` — capital P, no possessive, because they wrote their own prompt instead of using the builder — parsed to nothing, and the whole prompt fell through to the "no markers, treat it as personality" branch. There is now a second marker set that is line-anchored and tolerates the drift, and the pass that recognises more sections wins. A tie keeps the strict grammar, so prompts the compiler produced parse exactly as they did before.
3. **The blank-section note was a guess.** The reader told the user "the creator left personality and example dialogue empty" whenever those fields came out blank — including when the parser had not recognised the layout at all, in which case the fields were blank because of the parser. The note now only fires when the name line was recognised too, which means the layout was actually understood.

All three are covered by tests written from the failing shapes, not from the passing ones.

**Then Polybuzz's sample dialogues.** The ticket had a screenshot of the *Estilo de diálogo* editor: rows with an avatar next to them are `{{user}}`, rows without are `{{char}}`. Reading the create page's bundle confirmed the shape — `dialogueStyleObj` is an array of `{user, ai}` pairs, one entry per exchange, and the detail record echoes it back under `dialogueStyle.dialogue`. Both are now parsed into card lines. The flat `conversationExample` string is the same data as `user;ai` per line, and that form is rewritten too.

One trap: a plain string under `dialogueStyle` is the **style label** (`Descriptivo, frases cortas`), not dialogue. The first version of the parser happily rewrote a style label into `{{char}}: Descriptivo, frases cortas` and dropped it into the example block. The tests caught it. Strings never become dialogue now; only arrays and `user;ai` text do.

**Then Character.ai.** The approach is taken from [taquanta's exporter](https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter), which solved the same problem: the record is only ever fetched by the page's own JavaScript, with an `Authorization: Token <hex>` header the extension cannot mint. The reference implementation runs a script in the page's world (`MAIN`), shadows `fetch` and `XMLHttpRequest`, and stores the header in the DOM. That is the only way to see a header the browser adds outside your context.

Two changes to it. The token goes into a namespaced meta tag rather than an easily-collided one. And every JSON response the page receives is re-broadcast as a DOM event carrying a **string** — objects do not survive the world boundary between a `MAIN` script and an isolated content script, but strings do. That single change turned the sniffer from "capture the token and replay the call" into "capture the token *and* the answer", so the reader still works when the replay is refused.

The Definition is the interesting field. Character.ai gates it behind **Definition Visibility**, a second switch separate from Character Visibility, and when it is off the text is not sent to anyone. So a card with an empty example-dialogue block is a creator setting, not a failed read, and the panel says exactly that instead of showing an error.

**Then Crushon.ai.** Fully client-rendered behind a bot wall. There is no public API to replay and the page's own calls carry session state, so the reader does not call anything: it walks the payloads the page already received and scores every object by how many known field names it carries. The richest match wins. Field aliases cover the spellings the site has shipped across releases, because a miss on one spelling costs the whole field.

The shared part of both readers is `src/harvest.js`: payload collection, token readback, and the scoring walk. Two new readers, two shared files, zero changes to `exporters.js` or `panel.js` — the rule that every site reader fills the same card object is what made that possible, and it is why the next site costs one file.

**What could not be verified.** Both new hosts answer Cloudflare `403` to the machine this was built on, so neither reader has been exercised against a signed-in browser. What *was* verified: the neo endpoint is live and answers `{"status":"NOT_OK","error":"bad request"}` to a synthetic id, which is the route complaining about the body rather than about the caller. The field contracts come from taquanta's working implementation. It is written down as unverified in the changelog, in the to-do list, and here, because a reader that was not exercised is a different claim from one that was.

### 0.8.0 — the fork gets a name and six languages

The repository was still called by its original name while supporting four sites. Renamed to **Universal Character Card Exporter**, which is what it does. Issues were enabled at the same time, because the bug-report section was telling people to use a tab that did not exist.

Documentation went to six languages in one pass. The site-by-site API reference stays in English and says so at the top of the section: it is reference material that goes stale fastest, and six copies of a stale document is six times the maintenance for no gain. The translations link to it.

The Polybuzz section got a rewrite. It had been saying the background "cannot be retrieved" as a conclusion. The evidence now sits underneath it — the private-by-design label in the create form, the exhaustive route sweep, the `210002` on someone else's bot, the `ZZZ-123` control test run on two accounts. A negative result that is asserted is worth nothing; a negative result with its method attached is worth something.

### 0.7.13 — personality from the creator's own tags

Polybuzz publishes no background and no personality field, which left cards with an empty Personality block. The tag tree was already being fetched for the card's tag list, so it was read more carefully: every tag files under one of four parents, and `Personalidad` holds 41 temperament words the creator picks by hand. That is the creator's own characterisation, written by them, published by the site.

The join is honest in a specific way: genre, origin and identity tags stay out of Personality and remain in the tag list, and a real `systemRole` still outranks the tags when one exists. Measured across 10 live bots: 10/10 produced a real Personality block. A tag list is thinner than a written background, but it is the creator's words rather than a guess.

### 0.7.10 – 0.7.12 — an echo is not a field

Three releases, one idea. `getsceneconfig` handed a scene id answers with the intro text compiled as a fallback. Five signed-in scans of bots the account does not own returned a `systemRole` character-for-character identical to `sceneBrief`. That is how the server renders an empty background, not a second field that happens to match. An exact echo is now treated as absence, every route keeps its own answer instead of the first non-empty one, and the panel shows a footnote instead of a banner, because a creator-private field is the normal case.

Scenario came out of the same work: Polybuzz greetings usually open with a stage direction (`*Bangchan es tu esposo*`), which is the creator's own premise. It is promoted verbatim when the record carries no `templateIntro`. Nothing is paraphrased, ever.

---

## Changelog

Full release history with every fix and its reason: **[CHANGELOG.md](CHANGELOG.md)**.

Short version:

| Version | What landed |
|---|---|
| 0.10.0 | Saucepan.ai reader: shard decoding, two read paths, lorebooks, provider policy on the note line; 103 tests |
| 0.9.1 | Character.ai: auth scheme preserved, cold-load reading ladder, flight-data fallback; 92 tests |
| 0.9.0 | Character.ai and Crushon.ai readers, Polybuzz sample dialogues, Emochi parser fixes, Emochi Lab, 92 tests |
| 0.8.0 | Renamed, six-language docs, credit section, Polybuzz evidence rewrite, Issues enabled |
| 0.7.13 | Polybuzz Personality from the creator's `Personalidad` tags |
| 0.7.12 | Polybuzz Scenario from the greeting's stage direction |
| 0.7.11 | Per-route prompt candidates, so an echo cannot shadow a real background |
| 0.7.10 | Conversation-aware config chain, quiet panel |
| 0.7.0 – 0.7.9 | Polybuzz support, end to end |
| 0.6.0 – 0.6.1 | Emochi reader and prompt-history deep scan |
| 0.5.0 and before | JanitorAI, inherited from erpocalypse's original extension |

---

## To-do

- [x] **Add Character.ai support.** Done in 0.9.0. Definition still depends on the creator's Definition Visibility switch.
- [x] **Add Crushon.ai support.** Done in 0.9.0, reading what the page renders.
- [x] **Priority — Emochi: some bots do not show personality or scenario.** Fixed in 0.9.0. Three causes, all in the parser: the closing instruction was treated as a cut boundary, the section grammar only accepted one exact wording, and the "creator left it blank" note fired on a layout that had not been recognised. Detail in the [changelog](CHANGELOG.md).
- [x] **Priority — Emochi: example conversations are not being retrieved.** Fixed in 0.9.0. `characterExampleConversation` arrives as an array of turns, and string coercion turned it into `""`. It is now parsed as turns.
- [x] **Emochi Lab support.** Story, Soundstage and LiveRoom URLs are read against the same prompt record, with the trailing path segment taken as the id. The signed-out session never exposed the Lab's own URL shape, so a surface using a different record type reports the failed route instead of returning half a card.
- [x] **Saucepan AI support.** Done in 0.10.0. Public companions export with the Description and any public starting message; the definition and the lorebooks need a signed-in session, and the definition also needs the creator's Definition Visibility switch. The definition and editable routes are documented from the client code that consumes them, not from a signed-in call — if either comes back empty for you, an issue with the panel message is exactly what is needed.
- [ ] **WyvernChat.com support.**
- [ ] **Verify the Character.ai and Crushon.ai readers against a signed-in session.** Both hosts answer Cloudflare `403` to the machine this release was built on, so the contracts are verified but the live read is not. If either reader fails for you, an issue with the panel message is exactly what is needed.
- [ ] **Chub.ai and Venus.chub.ai support.**

A reader that half-works on a supported site is worse than one more site that works fully, which is why the two Emochi items sat above new site support until they were closed.

---

## Reporting bugs

Use the **[Issues tab](https://github.com/mxchu666/Universal-Character-Card-Exporter/issues)**. It is enabled. Please include:

- The site and the character URL.
- Which version you are on — **hover the footer of the export panel and the version appears in the tooltip**.
- What you expected and what you got. A screenshot of the panel is the most useful single thing you can attach.
- Any message the panel showed. The panel names the route and the response code when a lookup fails, and that text is exactly what a fix needs.

Feature requests are welcome in the same place.

---

## Is this allowed?

This is a personal backup tool. It reads what you can already see while signed in and saves it in an open format. It does not get around a paywall and does not unlock anything you could not otherwise view.

Site terms may still restrict automated access. Use it for your own characters and personal backups, credit creators when you re-share their work, and do not hammer the sites.

## Privacy

- Scanned character data never leaves your browser. No analytics, no outside code.
- No special permissions. The extension runs only on the site pages you open.
- The only network calls it makes are to the site you are already on.

---

## Developer reference (English only)

The extension is plain JavaScript with no dependencies and no build step. Edit `src/`, reload from the extensions page.

```sh
node --test
```

`src/scraper.js` reads JanitorAI, `src/emochi.js` Emochi, `src/polybuzz.js` Polybuzz, `src/cai.js` Character.ai and `src/crushon.js` Crushon.ai. All five fill the same card shape, so exporters and the panel never care which site you are on. `src/exporters.js` converts, `src/panel.js` and `src/panel.css` are the on-page panel, `background.js` is the service worker used for requests a content script cannot make (CORS, forbidden headers).

Two files exist only for the sites that never publish their record to an API: `src/intercept.js` runs in the page's own world (`world: "MAIN"`, `document_start`) and copies what the page already knows into the DOM; `src/harvest.js` collects those payloads and scores every object in them against a list of known field names. Adding a third gated site means one file that names its field keys.

The rest of this section is the site-by-site API record. It is kept in English because it is reference material, and it is the part most likely to go stale when a site ships a change.

### Emochi API notes

Emochi is a Next.js app on FlowGPT's backend. The useful bits:

- `GET https://emochi-backend-k8s.flowgpt.com/prompt/<uri-or-id>` — public character. The `uri` is the whole URL slug, e.g. `mrs-morgan-8793148e`, so no lookup step is needed. Answers with `Access-Control-Allow-Origin: *` and needs no cookies, which is why an anonymous read can go straight from the page.
- `GET .../prompt/<id>` returns the character's **compiled system prompt** in `initPrompt` for characters whose `visibility` is `true`. That string is the real definition, and the extension parses it back into personality, background, scenario and example dialogue. Measured on three independent live samples (30, 19 and 9 listed characters): 33%, 32% and 33% carried it, and `initPrompt` was present on exactly the characters with `visibility: true` and absent on every `visibility: false` one. It is a publish flag, not a login gate — a signed-in non-owner gets the same 55-key payload.
- `GET .../prompt/<id>/creator` — the creator view, which is the only place `personality`, `scenario`, `characterExampleConversation` and `characterBackground` live as separate fields. Needs `Authorization: Bearer <token>` **and** answers `401` for characters that are not on the signed-in account.
- `GET .../conversation/prompt-history-v2?promptId=<id>` — asks the server what it would send to the model for this character. The answer is a text payload, not the prompt object, so the extension scans every string in it for the `initPrompt` section grammar and parses the longest match. This is the one route that can still return a definition for a character whose own payload has none, and it needs a conversation to exist first.
- `GET .../user/<uri>/prompts` — public profile listing; answers `{total,prompts}`, no definitions.
- The bearer comes from `GET /api/auth/refresh` on emochi.com (same origin, uses the httpOnly cookie the site sets): `{ authenticated: true, encodedToken: "..." }`. Signed out it answers `{ authenticated: false }`.

Gotcha 1: never send `credentials: "include"` to the API host. The wildcard `Access-Control-Allow-Origin` is rejected on credentialed requests and the fetch fails even though the server answered 200.

Gotcha 2, the important one: the API sends **no `Access-Control-Allow-Headers`**, so any page-context request that carries `Authorization` dies at the CORS preflight before it leaves the browser. Authenticated reads therefore go through `background.js`, which is not subject to CORS and can use `host_permissions` to reach the API directly. That is why the manifest asks for `https://emochi-backend-k8s.flowgpt.com/*`.

### Polybuzz API notes

Polybuzz is a Nuxt 3 app. The character is server-rendered into the chat page, so no request is needed on a cold load:

- The chat page is **server-rendered**, and the character rides in the Nuxt payload as one object carrying `secretSceneId`, `sceneName`, `sceneAvatarUrl`, `sceneBrief`, `speechText`, `sceneGender`, `sceneTags`, `createUserName`, `systemRole` and `templateIntro` (31 keys). It is the richest public view — it has the greeting, gender and tags, which the JSON API does not return.
- **The URL slug is not the scene id.** A page loads as `/es/character/chat/bangchan-bLgrZ` while `secretSceneId` is `bLgrZ`, and `/api/scene/profile?secretSceneID=` takes only the bare id (`bangchan-bLgrZ` answers `"scene not exist"`). Both sides are matched by suffix, and the API call uses the id the payload reports, falling back to the slug's last hyphen segment.
- Nuxt ships the payload twice. Live it is `window.__NUXT__`, statically it is the `<script id="__NUXT_DATA__">` tag. **A content script gets its own JS context, so `window.__NUXT__` is invisible to it**; the script tag is DOM, so it is readable. That tag holds the payload as a devalue flat array (containers store indexes into one value list, reactive refs are tagged `["ShallowReactive", 12]`), which the reader expands before searching it.
- Because the app is client-routed, the DOM tag can still hold the previous page's payload, or a stripped listing card, after a soft navigation. Every scene match is verified against the `secretSceneId` in the URL, and the richest match wins. When the tag has no greeting, the reader fetches the character's own page HTML through the service worker and parses the payload out of that instead.
- `GET https://c6-api.polybuzz.ai/api/scene/profile?secretSceneID=<id>` — the JSON fallback for name, avatar, cover, brief, tags, gender and creator. It **requires a `cuid` request header** and answers `{"errNo":310000}` without one, `300000` for a stale value. The live value is the `poly_cuid` cookie, e.g. `tourist_<uuid>_<ms>`. It carries no greeting, so a card built from it alone is flagged as a failed read.
- **Every c6-api call needs a `Referer` on the polybuzz host.** Without one the API answers `{"errNo":5002,"errMsg":"system busy now"}` to every endpoint, `/api/scene/profile` included — it is a bot guard, not a real error. A service worker cannot set `Referer` (forbidden header), which is why the API calls go from the page context, where the browser fills `Origin` and `Referer` in automatically. The worker stays as the fallback and as the transport for the page HTML.
- The API surface is not small: the bundle declares 214 routes. The ones that matter for a card: `scene/profile` (guest, no greeting), `scene/profileguest`, `scene/detailguest`, `scene/search`, `scene/getscenedetail` (account only), `conversation/getsceneconfig`, `conversation/init`.
- There is **no export endpoint**. Polybuzz only imports character cards (`polybuzz.gitbook.io/upload-character`), and the fields it asks for on import are the same seven its creation guide lists.
- `scene/detailguest` (POST JSON `{secretSceneId}`) returns the same 31-key scene as the server render, greeting included, and needs nothing but a fresh `cuid`. It is the cleanest non-DOM read of a public bot.
- **Background and dialogue examples are never published.** The three field names only exist in the create/edit bundle: `systemRole` (background), `conversationExample` (the dialogue examples) and `dialogueStyle` (the style label). 60 public bots sampled from the landing feed (fresh cuid every 12 calls, zero errors): `systemRole` non-empty **0/60**, `conversationExample` **absent from the response entirely**, `chatSceneInformation` `null` on all 60. `templateIntro` is the exception — template-based bots publish it, and the reader maps it to `scenario`.
- **The editor says it out loud.** In the create form the label is `character_background` and it renders with `character_background_privately_seen` in brackets — "Visto en privado", "Privately seen". The field is a creator-only note by design, not a field the serialiser forgot.
- **Every route the web client knows was enumerated.** `Bus_Kiy7.js` declares 214 `smApi*RequestConfig` objects (217 path strings). All 70 read-only ones were called against a public bot with a fresh `cuid` and a polybuzz `Referer`. Not one returned `systemRole` or `conversationExample`, non-empty or empty. `sovpreview` answers `120001 param error` for every body shape and is not referenced by any UI chunk, so it is a dead app route, not a hidden prompt preview.
- The account route is `POST /api/scene/getscenedetail` with JSON `{secretSceneId}`, which is what the edit page calls to fill its form. It answers `120018` without a session, and the site authenticates with cookies, not an `Authorization` header, so the reader sends it from the page context with `credentials: "include"`. **It is owner-only:** for anyone else's bot it answers `210002`, and the site's own edit page responds by printing the server string and returning to the character list. Reaching `210002` is definitive proof that Polybuzz does not serve the background or the dialogue examples to a non-owner.
- Two conversation routes are asked after it, because neither is owner-scoped: `POST /api/conversation/getsceneconfig` and `POST /api/conversation/init`, both form-encoded. **Live result: the background slot comes back filled with the intro text.** Five signed-in scans of bots the account does not own all produced a `systemRole` character-for-character equal to `sceneBrief` — that is how an empty background is rendered by the server, not a second field that happens to match.
- `getsceneconfig` is named for a conversation, not a scene, so handing it a scene id can return defaults compiled from the short intro. The reader therefore chains: `init` first, dig any `conversationId` / `chatId` / `sessionId` out of its answer, then call `getsceneconfig` again with that id. Four calls at worst, and the trace names each one.
- Every route keeps its own answer instead of the first non-empty one. A compiled fallback that repeats the intro would otherwise shadow the creator's real text from a later route; the first candidate that differs from the description wins.
- **The web client never reads the background.** Across all 225 lazy chunks, `systemRole` appears in exactly one file — `_W0Z7Q0K.js`, the create page — and `conversationExample` in the same one. `chatSceneInformation` appears in none.
- **Surfaces probed for a way around it, all negative:** all 18 read-only `/api/scene/*` routes, the second API shard named in the site config (`api.polybuzz.ai`), Android/iOS `User-Agent` plus `app-version` / `platform` / `device-id` headers, `/profile/<suid>` (82 KB, 265 key names), `scene/getListBySuid` with the real creator suid, `user/detailBySuid`, `comic/*`, and `audit/textcheck` (a write-only moderation call). None carried the fields.
- **Personality comes from the creator's own tag choices.** Polybuzz files every tag under one of four parents — `Historia`, `Origen del personaje`, `Identidad`, `Personalidad` — and the last one is 41 temperament words the creator picked. `POST /api/scene/getTagByParam` publishes that tree to a guest, so the reader fetches it once per page (cached), joins the scene's tags against the `Personalidad` branch, and writes the matches into Personality. Genre, origin and identity tags stay in the card's tag list. 10/10 live bots produced a real Personality block.
- **Scenario from the greeting.** The greeting usually opens with a stage direction (`*Bangchan es tu esposo*`). That block is the creator's premise and is promoted to Scenario verbatim when the record carries no `templateIntro`. Nothing is paraphrased.
- **The model cannot be used as a source either.** Asked to repeat its own opening message word for word — a 1515-character greeting it certainly has in context — the bot produced a new, invented scene instead. Asked for its life story, a Korean idol bot answered as "Dafne, born in a small town in interior Mexico, daughter of farmers". The prompt fields are not reachable by asking.
- The chat pipeline builds the system prompt **server-side**. A full guest stream (`msgbystreamasguestdelivery`, NDJSON) carries exactly two line shapes — `{i,c}` text chunks and one metadata tail with no prompt, no scene fields and no echo.

### Character.ai API notes

Character.ai publishes nothing without a session, and the record is only ever fetched by the page's own JavaScript. The extension therefore does not ask for it first — it listens.

- `POST https://neo.character.ai/character/v1/get_character_info` with `{"external_id": "<id>", "lang": "en"}` answers `{"character": {...}, "status": "OK"}`. Anonymous, it answers `{"character": [], "status": "NOT_OK", "error": "bad request"}` — the route is alive and refuses the body, not the caller. The header is `Authorization: Token <hex>`, **not** `Bearer`; the extension sends whatever scheme the page itself used, because the site has shipped both and a rebuilt scheme is a 401.
- **A cold profile load is server-rendered.** Next's App Router streams the record as `self.__next_f.push([1,"…"])` chunks, so `intercept.js` has no JSON response to re-broadcast and the API is the only live source. `harvest.flightText()` joins the flight chunks and `embeddedObjects()` cuts records out of them, which also gives Crushon a read path that needs no capture at all.
- `POST https://plus.character.ai/chat/character/info/` and `https://plus.character.ai/chat/character/` are the older endpoints and take the same body. Both answer `403` to an unauthenticated caller. The reader tries all three and takes the first that answers.
- The record carries `name`, `title`, `description`, `greeting`, `definition`, `avatar_file_name`, `external_id`, `user__username` and `has_definition`. `title` is the tagline and `description` is the About text; the card joins them, tagline first.
- Avatar: `https://characterai.io/i/400/static/avatars/<avatar_file_name>`. The `character.ai` host also serves it, but `characterai.io` is what the app itself uses.
- **`has_definition` is the flag to trust.** Definition Visibility is a second creator switch, separate from Character Visibility. When it is off the text is not serialised to anyone, and an empty example-dialogue block is the correct output.
- The `definition` field is free text written for the model, not structured dialogue. It goes into the example-dialogue block because that is the only block it can honestly occupy; nothing is invented to fill personality or scenario.
- A `MAIN`-world script is required: an isolated content script sees a different `window`, so shadowing `fetch` there observes nothing. The captured header goes into `<meta jaix_token>` and each JSON response is re-dispatched as a `CustomEvent("jaix:payload")` with the body as a **string**, because only primitives cross the world boundary.
- Replays run through `background.js`, which is not subject to CORS, so the request does not need the site's own origin.

### Crushon.ai API notes

Crushon is client-rendered and sits behind Cloudflare, so there is nothing worth replaying and no public read endpoint to replay it against.

- The character arrives as part of the page's own data: either a Next.js `__NEXT_DATA__` blob or one of the JSON responses the app fetches after hydration. Both are captured.
- There is no stable field contract across releases, so the reader accepts aliases rather than one shape: `firstMessage` / `first_mes` / `greeting` / `firstMessageText` / `openingMessage`, `description` / `introduction` / `intro` / `profile` / `tagline`, `exampleDialogue` / `exampleDialogs` / `exampleConversation` / `mes_example` / `dialogues`, `avatar` / `avatarUrl` / `avatarURL` / `avatar_url` / `image` / `imageUrl` / `coverUrl`.
- Relative avatar paths are resolved against `https://crushon.ai`.
- **The field names are inverted relative to a Tavern card.** Crushon's importer maps card `personality` → Crushon *Introduction* and card `description` → Crushon *Personality*. The reader writes what the site publishes into the card field that means the same thing, so a round trip is stable.
- Same capture mechanism as Character.ai: `src/intercept.js` in the page world, `src/harvest.js` scoring the collected payloads by how many known keys an object carries. No token is needed because nothing is replayed.

### Saucepan.ai API notes

Saucepan is a single-page app whose API is same-origin and proxied at the edge, so everything is readable from the page's own session without CORS and without a `MAIN`-world script.

- The client's base URL is `""`, so requests go to `https://saucepan.ai/api/...`, not to `api.saucepan.ai` — that host resets the connection for anything that is not the edge. Every request carries the static header `cf-edge-token-8af3: e3b0c44298fc1c14`. Without it the edge closes the socket.
- Auth is `Authorization: Bearer <jwt>`, read from `localStorage["hallucination/auth_token"]` (refresh token in `hallucination/refresh_token`). A content script shares `localStorage` with the page, so no interception is needed.
- `GET /api/v2/companions/{id}` is anonymous and answers `{companion: {...}, is_favorited, has_shares, playbook, companion_banner, author_suggested_companions_position}`. A missing id answers `{"error":{"code":"request.not_found","message":"Companion not found."}}`.
- The companion object: `id`, `author_id`, `author_handle`, `name`, `display_name`, `short_description`, `tags[]`, `fandom_tags[{id, display_name}]`, `image{id}`, `sus`, `very_sus`, `access_level` (`public` | `unlisted` | `private` | `development`), `providers_profile`, `hidden_fields`, `open_definition`, `locked_starting_message`, `has_playbook`, `unlocked_portraits`, the `*_token_count` stats and `full_description_fragments`.
- **Portraits live on the CDN, not the API.** `image` carries only an id, and `GET /api/v1/image` needs a bearer. The public URL is `https://saucepan.ai/cdn/{image id}/card` — webp, no token, no cookies — which is what the page's own `og:image` points at. `/thumbnail` exists too; `/portrait` is 404.
- **Description is a shard set.** `{version, mask, fragments: [{key, proof, text}]}`. Keep a fragment when `fnv1a(seed = 0x811c9dc5 ^ rotl(mask,7) ^ rotl(key ^ mask,13), text)` equals `proof`, then sort the survivors by `key ^ mask` and concatenate. Decoys outnumber real shards roughly seven to one and are generated from a fixed word bank. `starting_scenarios_fragments[].message` uses the same structure, one set per scenario, alongside `access_level`, `is_locked`, `id` and `title`.
- `≠≠≠BLANK_SCENARIO≠≠≠` is the sentinel for an empty scenario slot in the editor record.
- `GET /api/v1/companion/definition?companion_id=<id>` (bearer) answers `{sections: [{title, content}]}`. The four titles are `Companion Core`, `Example Dialogue`, `Advanced Prompt`, `Response Formatting Instructions`. `hidden_fields` is a bitfield over exactly those four — `16` core, `8` example, `4` advanced, `2` formatting, all four set means fully closed.
- `GET /api/v1/companion/editable?id=<id>` (bearer) returns the raw editor record for a companion you own or co-own: `card`, `full_description`, `short_description`, `example_dialogue`, `advanced_prompt`, `formatting_instructions`, `starting_scenarios[]`, `portraits[]`, `multiple_scenarios`, `external_model_policy`. Someone else's companion answers `403`.
- `providers_profile` / `external_model_policy` is `custom_and_vetted` | `vetted_only` | `internal_only`. It gates the chat's model choice, not profile reads.
- `GET /api/v2/companions/{id}/lorebooks` (bearer) answers `{lorebooks: [...]}`. `GET /api/v2/lorebooks/{id}/chapters` answers `{chapters: [{id, title, text, ...}]}` — the body field is `text`, not `content`. A chapter carries no trigger list, so the reader uses its title as the key and leaves untitled chapters constant.
- Companion search (`POST /api/v1/search`) refuses an anonymous caller with `403 auth.permission_denied`; post and collection search do not, which is how a companion id can still be found without a session.

---

## License

[MIT](LICENSE).
