# Universal Character Card Exporter

**English** · [Español](README.es.md) · [日本語](README.ja.md) · [Italiano](README.it.md) · [Deutsch](README.de.md) · [Русский](README.ru.md)

A browser extension that reads a character from **JanitorAI**, **Emochi** or **Polybuzz** and saves it as a portable character card, so you can back it up or move it to another frontend. No account, no build step, no server. It runs in your own browser, on your own session.

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
   ├─ src/emochi.js     reads Emochi
   └─ src/polybuzz.js   reads Polybuzz
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

1. **Read.** The reader for the site you are on gathers the character. Each one does it differently, because each site exposes a different surface: JanitorAI has an internal JSON API, Emochi has a Next.js backend with a compiled prompt string, Polybuzz has a server-rendered Nuxt payload plus a REST API.
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
9. **Test everything that can be tested.** `node --test` covers the readers, the normaliser, the exporters and the block builder. 71 tests at the time of writing. Every API claim in this README was verified against the live site, and the ones that could not be verified are labelled as such.
10. **Write it down.** The developer section below exists so the next person does not have to re-derive it.

**This tool is under active development and will keep receiving updates.** New sites get added, broken readers get fixed, and the API notes get corrected when a site changes. If something breaks, it is usually because a site changed its payload shape, and that is fixable.

---

## To-do

- [ ] **Add Character.ai support.**
- [ ] **Add Saucepan AI support.**
- [ ] **Add WyvernChat.com support.**
- [ ] **Priority — Emochi: some bots do not show personality or scenario.** A portion of Emochi characters genuinely store no definition, but the failure rate is higher than the publish-flag measurement predicts. This needs isolating: is it the payload, the parser, or the character?
- [ ] **Priority — Emochi: example conversations are not being retrieved.** The definition route carries `characterExampleConversation`; it is not reaching the card. This breaks example-dialogue fidelity and has to work before Emochi support can be called finished.

The two Emochi items are prioritised over new site support. A reader that half-works on a supported site is worse than one more site that works fully.

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

`src/scraper.js` reads JanitorAI, `src/emochi.js` Emochi, `src/polybuzz.js` Polybuzz. All three fill the same card shape, so exporters and the panel never care which site you are on. `src/exporters.js` converts, `src/panel.js` and `src/panel.css` are the on-page panel, `background.js` is the service worker used for requests a content script cannot make (CORS, forbidden headers).

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

---

## License

[MIT](LICENSE).
