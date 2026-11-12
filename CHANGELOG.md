# Changelog

Every release, newest first. The numbers are real: each entry names what changed, why, and what was verified on the live site. Where something could not be verified, it says so.

The narrative version — how a decision was reached, what was tried and failed — is in the **Devlog** section of each README.

---

## 0.9.0

**Character.ai and Crushon.ai readers, Polybuzz example dialogues, an Emochi parser that stops losing fields, and the Emochi Lab.**

### Added — Character.ai

- New reader `src/cai.js`. Reads name, tagline, About text, greeting, avatar, creator and — when the creator made it public — the Definition, which lands in the example-dialogue block.
- New page-world sniffer `src/intercept.js`, adapted from [character-ai-to-crushon-ai-card-exporter](https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter) by **taquanta** (MIT). It watches the page's own `Authorization` header and stores it in a `jaix_token` meta tag; every JSON response the page receives is re-broadcast as a `jaix:payload` DOM event, because strings cross the content-script world boundary and objects do not.
- The reader replays `neo.character.ai/character/v1/get_character_info`, then the two `plus.character.ai` endpoints, through the extension service worker so CORS never applies. If all three refuse, it falls back to whatever the page already loaded.
- A private Definition is reported as a footnote, not as an error: it is a creator setting, not a failed read.

### Added — Crushon.ai

- New reader `src/crushon.js`. Crushon is client-rendered behind a bot wall, so it reads what the page fetched rather than calling an API. `harvest.js` scores every object in the collected payloads plus the Next.js `__NEXT_DATA__` by how many known field names it carries, and maps the winner.
- Field aliases cover the spellings the site has shipped: `firstMessage` / `first_mes` / `greeting`, `description` / `introduction` / `intro`, `avatarUrl` / `avatar` / `image`, `mes_example` / `exampleDialogue` / `dialogue`.

### Added — shared plumbing

- `src/harvest.js`: payload collection, token readback, and the scoring walk used by both new readers. It parses JSON embedded as escaped strings, which both sites do.

### Added — Polybuzz sample dialogue

- The create form stores sample dialogue as `dialogueStyleObj: [{ user, ai }]`, one entry per exchange, and the detail record echoes it back as `dialogueStyle.dialogue`. Both are now parsed into `{{user}}` / `{{char}}` lines. Verified against Polybuzz's own bundle, which reads the same structure when it builds the style preview.
- The flattened `conversationExample` string uses `user;ai` per line; that form is rewritten too. Text that already names its speakers is left exactly as written.
- A plain string under `dialogueStyle` is a style label and no longer risks being read as dialogue.

### Fixed — Emochi example conversations

- `characterExampleConversation` arriving as an **array of turns** was silently dropped: the reader ran `String(...)` coercion on it, which yields `""`. It is now parsed as turns.
- `exampleDialogue()` understands `{role, content}`, `{user, ai}`, `{isUser, text}` and a `{dialogue: [...]}` wrapper.

### Fixed — Emochi personalities and scenarios going missing

Three separate causes, all fixed:

1. **The closing instruction was treated as a boundary.** The compiled prompt ends with `Do not write as {{user}}…`, and the reader cut the text there. A creator who quoted that rule inside their own background or example dialogue lost every section that followed. It is now removed as a sentence, and the surrounding text survives.
2. **The section grammar was too strict.** A prompt that used `Personality:` instead of `<Name>'s personality:` parsed to nothing. A second, line-anchored marker set now runs when the first recognises fewer sections, and the pass that finds more wins.
3. **The "creator left it empty" note was a guess.** It now only fires when the name line was recognised too, i.e. when the layout was actually understood.

### Added — Emochi Lab

- Lab URLs (`/lab/...`, Story, Soundstage, LiveRoom) are read against the same prompt record: the trailing path segment is taken as the id and the surface word is skipped. The Lab's URL shape could not be observed from a signed-out session, so if a surface uses a different record type, the panel reports the failed route instead of returning a half card.
- The card says what it cannot carry: the ambient track, the voice casting, and the rest of a LiveRoom cast.

### Changed

- `manifest.json`: seven content-script blocks, host permissions for `neo.character.ai`, `plus.character.ai` and `characterai.io`.
- 88 tests.

### Not verified

- Character.ai and Crushon.ai API behaviour against a signed-in browser session. Both hosts answer `403` (Cloudflare) to the machine that built this release, so the readers are written against the contracts in taquanta's repository and against the field names both sites use. The cr.ai endpoint answers `{"status":"NOT_OK","error":"bad request"}` to a synthetic id from here, which confirms the route is live.

---

## 0.8.0

**Renamed to Universal Character Card Exporter. Six-language documentation.**

- Repository renamed; the old URL redirects.
- README in English, Spanish, Japanese, Italian, German and Russian. The site-by-site API reference stays in English and says so — it is reference material that goes stale fastest.
- Credit to **erpocalypse**, the original author of [JAI Card Extractor](https://github.com/erpocalypse/jai-card-extractor), stated as a condition of this fork rather than a request.
- The Polybuzz section now says plainly that the background and example dialogues cannot be retrieved, because the data is assembled server-side and never serialised to a non-owner, and lists the evidence.
- Added: how the tool works, how the fork was built, the to-do list, and a bug-reporting section.
- Issues tab enabled.

---

## 0.7.13

**Personality for Polybuzz cards.**

- Polybuzz files every tag under one of four parents — `Historia`, `Origen del personaje`, `Identidad`, `Personalidad` — and `Personalidad` holds 41 temperament words the creator chooses. `POST /api/scene/getTagByParam` publishes that tree to a guest, so the reader fetches it once per page, caches it, joins the scene's tags against that branch, and writes the matches into Personality.
- Genre, origin and identity tags stay in the card's tag list.
- Measured across 10 live bots: 10/10 produced a real Personality block. A genuine `systemRole` still outranks the tags.

---

## 0.7.12

**Scenario from the greeting.**

- Polybuzz greetings usually open with a stage direction (`*Bangchan es tu esposo*`). That block is the creator's premise, so it is promoted to Scenario verbatim when the record carries no `templateIntro`. Nothing is paraphrased.

---

## 0.7.11

**An echo can no longer shadow a real background.**

- `fetchPromptFields` kept the first non-empty `systemRole` across routes. `getsceneconfig` handed a scene id answers with the intro compiled as a fallback, so a real background from a later route was thrown away. Every route now keeps its own answer and the first candidate that differs from the description wins.
- Full negative sweep recorded: all 18 read-only `/api/scene/*` routes, the second API shard, app User-Agent and app headers, `/profile/<suid>`, `getListBySuid` with the real creator suid, `detailBySuid`, `comic/*`, `audit/textcheck`.

---

## 0.7.10

**The config call gets the argument it is for.**

- `getsceneconfig` is named for a conversation, not a scene. The reader now chains `detail → config → init → config(conversationId)`, digging the id out of `init`.
- The panel stopped showing an error banner for a creator-private background and shows a muted footnote instead.

---

## 0.7.9

**The echo is absence.**

- Five signed-in scans of bots the account does not own returned a `systemRole` character-identical to `sceneBrief`. That is how the server renders an empty background. An exact echo is now treated as *no background*.
- Panel notes are silent unless the site is signed out or nothing answered.

---

## 0.7.0 – 0.7.8

**Polybuzz support.**

- Slug ↔ scene id matching, devalue payload expansion, page-HTML fetch through the service worker, same-origin inline fallback, host permissions.
- Live-verified on four bots against the real reader.
- Gender enum confirmed: `1` male, `2` female, `3` non-binary.

---

## 0.6.0 – 0.6.1

**Emochi reader.**

- `initPrompt` parser, prompt-history deep-scan route, per-card blank-section note.
- Measured the publish flag: 33% / 32% / 33% of characters carried a definition across three independent live samples.

---

## 0.5.0 and before

**JanitorAI, inherited from the original project.** The extension was [JAI Card Extractor](https://github.com/erpocalypse/jai-card-extractor): the JanitorAI reader, the panel, the exporter pipeline and the card format all come from there.
