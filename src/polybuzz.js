(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});

  // Taken from polybuzz.ai's own Nuxt config (`polyConfig.baseUrl`).
  const API_BASE = "https://c6-api.polybuzz.ai";
  const PAGE_ORIGIN = "https://www.polybuzz.ai";
  const TIMEOUT_MS = 15000;

  const s = (v) => (typeof v === "string" ? v.trim() : "");

  // Polybuzz URLs look like /<locale>/character/chat/<name>-<sceneId>, e.g.
  // "bangchan-bLgrZ". The payload and the API only ever use the trailing id, and
  // a few bots are addressed by the id alone ("brMv6"), so both forms are real.
  function currentCharacterId() {
    if (typeof location === "undefined") return null;
    const m = location.pathname.match(/\/character\/chat\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function sceneIdFromSlug(slug) {
    const m = s(slug).match(/-([A-Za-z0-9]{3,10})$/);
    return m ? m[1] : s(slug);
  }

  // Every c6-api call must carry the visitor id the site keeps in a cookie. The
  // server answers "User cuid not param" without it and "User Needs to get cuid
  // again" for anything that is not the current cookie value.
  function readCuid() {
    if (typeof document === "undefined") return "";
    const m = document.cookie.match(/(?:^|;\s*)poly_cuid=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  // The chat page is server-rendered, so the character arrives in the Nuxt
  // payload before any request is made. That payload is the only public source
  // of the greeting: /api/scene/profile drops `speechText` and never carries
  // `systemRole`/`templateIntro`.
  //
  // Nuxt ships the same tree twice. Live, it is window.__NUXT__ - a page global
  // a content script cannot see, because content scripts get their own JS
  // context. Statically, it is the #__NUXT_DATA__ script tag, which is DOM and
  // therefore readable from here. That copy is a devalue flat array: one list
  // holding every value, with containers storing indexes into it, plus tagged
  // entries like ["ShallowReactive", 12] for reactive refs.
  function unflatten(parsed) {
    const seen = new Map();
    const hydrate = (i) => {
      if (i === -1) return undefined;
      if (seen.has(i)) return seen.get(i);
      const value = parsed[i];
      if (value === null || typeof value !== "object") return value;
      if (Array.isArray(value)) {
        if (typeof value[0] === "string") {
          switch (value[0]) {
            case "Reactive":
            case "ShallowReactive":
            case "Ref":
            case "ShallowRef":
              return hydrate(value[1]);
            case "EmptyRef":
            case "null":
              return null;
            case "undefined":
              return undefined;
            case "Date":
              return new Date(value[1]);
            case "BigInt":
              return BigInt(value[1]);
          }
        }
        const out = [];
        seen.set(i, out);
        for (const item of value) out.push(hydrate(item));
        return out;
      }
      const out = {};
      seen.set(i, out);
      for (const key of Object.keys(value)) out[key] = hydrate(value[key]);
      return out;
    };
    return hydrate(0);
  }

  // Listing cards carry the same secretSceneId as the full scene, and after a
  // client-side route change both live in the payload. Only the full scene has
  // the greeting, so the richest match wins. The caller normally holds the URL
  // slug ("bangchan-bLgrZ") while the payload holds the bare scene id ("bLgrZ"),
  // so a suffix match is the correct test.
  function findScene(root, slug) {
    const wanted = s(slug).toLowerCase();
    const matches = (id) => {
      const value = s(id).toLowerCase();
      return !!value && (value === wanted || wanted.endsWith("-" + value));
    };
    let best = null;
    const walk = (node, depth) => {
      if (!node || typeof node !== "object" || depth > 6) return;
      if (typeof node.secretSceneId === "string" && typeof node.sceneName === "string") {
        if (matches(node.secretSceneId) && (!best || Object.keys(node).length > Object.keys(best).length)) {
          best = node;
        }
        return;
      }
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      for (const key of Object.keys(node)) walk(node[key], depth + 1);
    };
    walk(root, 0);
    return best;
  }

  function parsePayload(text, id) {
    if (!text) return null;
    try {
      return findScene(unflatten(JSON.parse(text)), id);
    } catch {
      return null;
    }
  }

  // The payload tag as the current document has it. On a cold load of a chat
  // page this is the full scene; after a client-side route change it can be the
  // stripped listing card instead, which is why the caller checks the greeting.
  function readDomScene(id) {
    if (typeof document === "undefined") return null;
    const node = document.getElementById("__NUXT_DATA__");
    if (!node) return null;
    return parsePayload(node.textContent || "", id);
  }

  // window.__NUXT__ is not reachable from a content script, but the same walk
  // is kept for the page-console path and for tests.
  function readSsrScene(id) {
    const nuxt = typeof window !== "undefined" && window.__NUXT__;
    const data = nuxt && nuxt.data;
    if (!data || typeof data !== "object") return null;
    return findScene(data, id);
  }

  // --- transport ----------------------------------------------------------
  // c6-api drops any request that does not carry a Referer on the polybuzz host:
  // with that header it answers the real status (120018 when signed out), without
  // it every call returns 5002 "system busy now" - including /api/scene/profile,
  // which is why the background lookup failed while the page payload still read
  // fine. A service worker cannot set Referer (it is a forbidden header), so the
  // page context goes first and the worker is only the fallback.
  function fromBackground(message) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
        return resolve(null);
      }
      try {
        chrome.runtime.sendMessage(message, (reply) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(reply || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function inlineFetch(url, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(url, headers) {
    try {
      const res = await inlineFetch(url, { credentials: "include", headers: headers || {} });
      if (res.ok) return await res.json();
    } catch {
      // No Referer, no answer - fall through to the worker, which at least
      // reaches the host if the page context is blocked.
    }
    const reply = await fromBackground({ type: "jaix:fetch", url, headers });
    if (reply && reply.ok && reply.body) return reply.body;
    throw new Error("Polybuzz API request failed");
  }

  // POST with the signed-in cookies. Polybuzz authenticates with `withCredentials`
  // on the site side and has no Authorization header, so the only credential the
  // account endpoint needs is the cookie jar.
  async function postJson(url, payload, headers) {
    const body = JSON.stringify(payload);
    const allHeaders = { "content-type": "application/json", ...(headers || {}) };
    try {
      const res = await inlineFetch(url, {
        method: "POST",
        body,
        headers: allHeaders,
        credentials: "include",
      });
      if (res.ok) return await res.json();
    } catch {
      // Same fallback as fetchJson.
    }
    const reply = await fromBackground({
      type: "jaix:fetch",
      url,
      method: "POST",
      body,
      credentials: "include",
      headers: allHeaders,
    });
    if (reply && reply.ok && reply.body) return reply.body;
    throw new Error("Polybuzz API request failed");
  }

  // The conversation config endpoints are form-encoded, not JSON. Polybuzz's own
  // chat page posts `application/x-www-form-urlencoded`, and the server validates
  // the form struct before it validates the body.
  async function postForm(url, fields, headers) {
    const body = new URLSearchParams(fields).toString();
    const allHeaders = { "content-type": "application/x-www-form-urlencoded", ...(headers || {}) };
    try {
      const res = await inlineFetch(url, {
        method: "POST",
        body,
        headers: allHeaders,
        credentials: "include",
      });
      if (res.ok) return await res.json();
    } catch {
      // Same fallback as postJson.
    }
    const reply = await fromBackground({
      type: "jaix:fetch",
      url,
      method: "POST",
      body,
      credentials: "include",
      headers: allHeaders,
    });
    if (reply && reply.ok && reply.body) return reply.body;
    throw new Error("Polybuzz API request failed");
  }

  async function backgroundHtml(url) {
    const reply = await fromBackground({
      type: "jaix:fetch",
      url,
      headers: { accept: "text/html" },
    });
    return reply && reply.ok && typeof reply.text === "string" ? reply.text : null;
  }

  async function inlineHtml(url) {
    const res = await inlineFetch(url, { credentials: "omit" });
    return res.ok ? res.text() : null;
  }

  function chatUrl(id) {
    let prefix = "/es";
    if (typeof location !== "undefined") {
      const m = location.pathname.match(/^\/([^/]+)\/character\/chat\//i);
      if (m) prefix = "/" + m[1];
    }
    return PAGE_ORIGIN + prefix + "/character/chat/" + encodeURIComponent(id);
  }

  function sceneFromHtml(html, id) {
    if (!html) return null;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const node = doc.getElementById("__NUXT_DATA__");
    if (!node) return null;
    return parsePayload(node.textContent || "", id);
  }

  // Reads the server-rendered copy of the character's own page. This is the only
  // way to get the greeting after a client-side route change, when the in-memory
  // payload is current but the DOM payload tag is not. The worker can be blocked
  // by the site's edge, so a same-origin page fetch backs it up.
  async function fetchPageScene(id) {
    const url = chatUrl(id);
    for (const getHtml of [backgroundHtml, inlineHtml]) {
      try {
        const scene = sceneFromHtml(await getHtml(url), id);
        if (scene) return scene;
      } catch {
        // try the next transport
      }
    }
    return null;
  }

  async function fetchProfile(id) {
    const cuid = readCuid();
    const body = await fetchJson(
      API_BASE + "/api/scene/profile?secretSceneID=" + encodeURIComponent(id),
      cuid ? { cuid } : {},
    );
    if (body && body.errNo) throw new Error(s(body.errMsg) || "HTTP " + body.errNo);
    return body && body.data && typeof body.data === "object" ? body.data : null;
  }

  // Polybuzz's own creation guide names the fields a character has: name, gender,
  // short introduction, greeting, tags, background introduction and dialogue
  // style. The create/edit page is the only bundle that mentions the last two, and
  // it sends them as `systemRole`, `conversationExample` and `dialogueStyle`.
  // Every guest surface ships `systemRole` and `templateIntro` present but empty,
  // so the account endpoint the edit page loads is the one place left to ask.
  const LOGIN_REQUIRED = 120018;
  // The edit page catches this exact code, prints the server string and returns to
  // the character list: the scene does not belong to the signed-in account, so the
  // editor never opens. Nothing about a reload changes it.
  const NOT_EDITABLE = 210002;

  // `dialogueStyle` arrives as a string on the create form and as `{dialogue:[...]}`
  // on the detail record, so every shape is flattened to one label.
  function labelText(v) {
    const one = (x) =>
      typeof x === "string" ? s(x) : x && typeof x === "object" ? s(x.name) || s(x.title) || s(x.dialogue) : "";
    if (Array.isArray(v)) return v.map(one).filter(Boolean).join(", ");
    if (v && typeof v === "object") return s(v.name) || s(v.title) || s(v.dialogue) || labelText(v.dialogue);
    return s(v);
  }

  // `prologue` is the detail record's name for the greeting; the loader accepts a
  // string or `{speechText}` and normalises both.
  function prologueText(v) {
    if (typeof v === "string") return s(v);
    if (v && typeof v === "object") return s(v.speechText);
    return "";
  }

  // Read-only: `getscenedetail` is what the edit page calls to populate its form.
  // Never creates a conversation, unlike `conversation/init`.
  async function fetchOwnerScene(id) {
    const result = await callPromptRoute(PROMPT_ROUTES[0], scenePayload(id));
    return { status: result.status, data: result.data, errNo: result.errNo, message: result.message };
  }

  // The create form's field names, plus the detail record's aliases. A config
  // answer can nest the scene under any key, so the collector walks the whole
  // tree and takes the first non-empty string per field.
  const PROMPT_KEYS = [
    "systemRole",
    "characterBackground",
    "conversationExample",
    "characterExampleConversation",
    "exampleDialogue",
    "exampleConversation",
    "dialogueStyle",
    "dialogueStyleObj",
    "templateIntro",
    "personalityLabel",
    "prologue",
    "speechText",
    "brief",
  ];

  function collectPromptFields(root) {
    const found = {};
    const seen = new Set();
    const walk = (node, depth) => {
      if (!node || typeof node !== "object" || depth > 8 || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      for (const key of PROMPT_KEYS) {
        if (found[key] !== undefined) continue;
        const value = node[key];
        if (typeof value === "string" && value.trim()) found[key] = value.trim();
        else if (Array.isArray(value) && value.length) found[key] = value;
        else if (value && typeof value === "object" && Object.keys(value).length) found[key] = value;
      }
      for (const key of Object.keys(node)) walk(node[key], depth + 1);
    };
    walk(root, 0);
    return found;
  }

  // `/api/conversation/getsceneconfig` is the chat config the app reads for a
  // conversation, and `/api/conversation/init` is the bootstrap it runs when a
  // chat is opened. Neither is owner-scoped: any signed-in chatter gets them for
  // anyone's bot. That is the one signed-in surface left that can carry the prompt
  // fields, so both are tried after the edit loader. The body is form-encoded -
  // the bundle declares `requestBodyType: form` for both - and unverified, hence
  // the deep collect and the merge by field name rather than by position.
  const PROMPT_ROUTES = [
    { key: "detail", label: "getscenedetail", path: "/api/scene/getscenedetail", form: false },
    { key: "config", label: "getsceneconfig", path: "/api/conversation/getsceneconfig", form: true },
    { key: "init", label: "init", path: "/api/conversation/init", form: true },
  ];

  async function callPromptRoute(route, payload) {
    const cuid = readCuid();
    const headers = cuid ? { cuid } : {};
    const out = { route: route.label, status: "error", data: null, fields: {} };
    try {
      const body = route.form
        ? await postForm(API_BASE + route.path, payload, headers)
        : await postJson(API_BASE + route.path, payload, headers);
      if (!body) return out;
      const code = Number(body.errNo);
      const message = s(body.errstr) || s(body.errMsg);
      const data = body.data && typeof body.data === "object" ? body.data : null;
      if (code === LOGIN_REQUIRED) return { ...out, status: "login", errNo: code, message };
      if (code === NOT_EDITABLE) return { ...out, status: "not-owner", errNo: code, message };
      if (code) return { ...out, errNo: code, message };
      return { ...out, status: data ? "ok" : "error", data, fields: collectPromptFields(data) };
    } catch {
      return out;
    }
  }

  function scenePayload(id) {
    return { secretSceneId: id, secretSceneID: id };
  }

  // `getsceneconfig` is named for a *conversation*, not a scene. Handed a scene id
  // it can answer with the defaults the server compiles from the short intro,
  // which is how a background comes back looking exactly like the description.
  // `init` creates the conversation and returns its id; the config pass is then
  // repeated with that id, which is the argument the route is for.
  const CONVERSATION_ID_KEYS = ["conversationId", "conversationID", "conversation_id", "chatId", "sessionId"];

  function pickConversationId(root) {
    const seen = new Set();
    const walk = (node, depth) => {
      if (!node || typeof node !== "object" || depth > 7 || seen.has(node)) return "";
      seen.add(node);
      const entries = Array.isArray(node) ? node.map((v, i) => [i, v]) : Object.entries(node);
      for (const [key, value] of entries) {
        if (!CONVERSATION_ID_KEYS.includes(String(key))) continue;
        if (typeof value !== "string" && typeof value !== "number") continue;
        const id = String(value).trim();
        if (id && id !== "0") return id;
      }
      for (const [, value] of entries) {
        const id = walk(value, depth + 1);
        if (id) return id;
      }
      return "";
    };
    return walk(root, 0);
  }

  async function fetchSceneConfig(id) {
    return callPromptRoute(PROMPT_ROUTES[1], scenePayload(id));
  }

  // Polybuzz's sample dialogue is an array of exchanges, not a list of turns:
  // the create form keeps `dialogueStyleObj` as `[{ user, ai }]` and the detail
  // record echoes it back as `dialogueStyle.dialogue`. The editor shows one row
  // per field, the avatar row is `user` and the bare row is `ai`. The string
  // fallback is the same data flattened as `user;ai` per line. Everything ends up
  // as {{user}}/{{char}} lines, which is the only grammar a card understands.
  function pairTurns(text) {
    return s(text)
      .split(/\n+/)
      .map((line) => {
        const raw = line.trim();
        if (!raw) return "";
        const cut = raw.indexOf(";");
        if (cut < 0) return "";
        const mine = raw.slice(0, cut).trim();
        const theirs = raw.slice(cut + 1).trim();
        return [
          mine ? "{{user}}: " + mine : "",
          theirs ? "{{char}}: " + theirs : "",
        ]
          .filter(Boolean)
          .join("\n\n");
      })
      .filter(Boolean)
      .join("\n\n");
  }

  function parseDialogueStyle(value) {
    if (typeof value === "string") return "";
    const list = Array.isArray(value)
      ? value
      : value && typeof value === "object" && Array.isArray(value.dialogue)
        ? value.dialogue
        : null;
    if (!list) return "";
    return list
      .map((turn) => {
        if (!turn || typeof turn !== "object") return "";
        const mine = s(turn.user) || s(turn.human) || s(turn.question);
        const theirs = s(turn.ai) || s(turn.char) || s(turn.assistant) || s(turn.answer);
        if (!mine && !theirs) {
          const content = s(turn.content) || s(turn.text);
          return content ? "{{char}}: " + content : "";
        }
        return [
          mine ? "{{user}}: " + mine : "",
          theirs ? "{{char}}: " + theirs : "",
        ]
          .filter(Boolean)
          .join("\n\n");
      })
      .filter(Boolean)
      .join("\n\n");
  }

  // `conversationExample` is the same dialogue flattened to text: one exchange per
  // line, `user;ai`. Text that already names its speakers is left alone.
  function exampleString(value) {
    const text = s(value);
    if (!text) return "";
    if (/\{\{\s*(user|char)\s*\}\}/i.test(text)) return text;
    return pairTurns(text) || text;
  }

  // A plain string under `dialogueStyle` is the style label; an object holding
  // turn-shaped entries is the sample dialogue. Anything else in that slot is
  // read as a label, which is what the detail record used to return.
  function styleOf(value) {
    if (typeof value === "string") return s(value);
    return parseDialogueStyle(value) ? "" : labelText(value);
  }

  // Every route is asked until one returns both prompt fields, so a card that
  // Polybuzz does publish comes back in one try and a card it withholds costs
  // four. The trace names the endpoint and the code on every answer.
  async function fetchPromptFields(id) {
    const trace = [];
    const fields = {};
    let detail = null;
    let conversationId = "";
    // Every route keeps its own answer. "First non-empty wins" is exactly the bug
    // that hides a real background behind a compiled fallback: `getsceneconfig`
    // handed a scene id answers with the intro text, and `init` may answer with
    // the creator's own text. Keeping the candidates lets the caller prefer the
    // one that is not just the description echoed back.
    const candidates = { systemRole: [], conversationExample: [] };
    const take = (result) => {
      trace.push({
        route: result.route,
        status: result.status,
        errNo: result.errNo,
        message: result.message,
        fields: Object.keys(result.fields),
      });
      for (const [key, value] of Object.entries(result.fields)) {
        if (candidates[key] && typeof value === "string") candidates[key].push({ route: result.route, value });
        if (fields[key] === undefined) fields[key] = value;
      }
      return Boolean(fields.systemRole && fields.conversationExample);
    };

    for (const route of PROMPT_ROUTES) {
      const result = await callPromptRoute(route, scenePayload(id));
      if (route.key === "detail") detail = result;
      if (route.key === "init") conversationId = pickConversationId(result.data);
      if (take(result)) return { detail, fields, candidates, trace };
    }

    if (conversationId) {
      const result = await callPromptRoute(
        { ...PROMPT_ROUTES[1], label: "getsceneconfig chat" },
        { conversationId, ...scenePayload(id) },
      );
      take(result);
    }
    return { detail, fields, candidates, trace };
  }

  // Polybuzz never publishes the background, and the intro is often one line
  // ("Tú y Hermione son amigos"). The greeting, though, usually opens with the
  // premise in stage direction. Lifting that block verbatim gives the card a
  // scenario and a usable description without inventing a word.
  function premiseBlock(text) {
    const t = s(text);
    if (!t) return "";
    const m = t.match(/^\s*(\*\*[\s\S]*?\*\*|\*[^*\n][\s\S]*?\*)/);
    const block = m ? m[1].replace(/^\*+|\*+$/g, "").replace(/\s+/g, " ").trim() : "";
    return block.length >= 12 && block.length <= 600 ? block : "";
  }

  // 1 = male is confirmed on every male bot sampled; 2/3 follow the site's
  // "Masculino / Femenino / No binario" tab order.
  const GENDERS = { 1: "Male", 2: "Female", 3: "Non-binary" };

  function decodeGender(value) {
    return GENDERS[Number(value)] || "";
  }

  function tagNames(v) {
    if (!Array.isArray(v)) return [];
    return v.map((t) => s(typeof t === "string" ? t : t && (t.tagName || t.name))).filter(Boolean);
  }

  // Polybuzz sorts its tags into four parents: Historia, Origen del personaje,
  // Identidad, Personalidad. The last one is the creator picking words for the
  // character's temperament - "Frío", "Dominante", "Posesivo" - which is the only
  // creator-written personality signal the site publishes for a non-owner. The
  // taxonomy is fetched so the join works in whatever language the browser is in,
  // and cached for the page's lifetime: one extra call, not one per scan.
  const TAG_TREE_PATH = "/api/scene/getTagByParam";
  let traitTagsCache = null;

  function personalityTagNames(tree) {
    const parents = tree && Array.isArray(tree.sceneTags) ? tree.sceneTags : [];
    const parent = parents.find(
      (p) => /personality/i.test(s(p && p.parentEnglishName)) || /personalidad/i.test(s(p && p.parentTagName)),
    );
    if (!parent || !Array.isArray(parent.subTagList)) return [];
    return parent.subTagList.map((t) => s(t && t.tagName)).filter(Boolean);
  }

  async function fetchTraitTags() {
    if (traitTagsCache) return traitTagsCache;
    const cuid = readCuid();
    try {
      const body = await postJson(API_BASE + TAG_TREE_PATH, {}, cuid ? { cuid } : {});
      const names = personalityTagNames(body && body.data);
      if (names.length) traitTagsCache = names;
      return names;
    } catch {
      return [];
    }
  }

  function normalizeScene(scene, profile, owner, config, traitTags) {
    const a = scene && typeof scene === "object" ? scene : {};
    const p = profile && typeof profile === "object" ? profile : {};
    const o = owner && owner.data && typeof owner.data === "object" ? owner.data : {};
    const c = config && config.fields && typeof config.fields === "object" ? config.fields : {};
    const id = s(a.secretSceneId) || s(p.secretSceneId) || currentCharacterId() || "";
    const name = s(a.sceneName) || s(p.sceneName) || s(a.oriSceneName) || s(p.oriSceneName);

    // `systemRole` is the background introduction, `conversationExample` the
    // dialogue examples and `dialogueStyle` the style label. Guest payloads blank
    // the first two, so whatever the account endpoints returned fills the gap.
    // Their records use `prologue` and `brief` for the fields the chat page calls
    // `speechText` and `sceneBrief`.
    const description = s(a.sceneBrief) || s(p.sceneBrief) || s(o.sceneBrief) || s(o.brief);
    // Every route that answered keeps its own value. A fallback that repeats the
    // intro must not outrank a real background from a later route, so the first
    // candidate that differs from the description wins; if every candidate is the
    // intro, the field is absent and no personality block is built from it.
    const candidateValues = (key) =>
      config && config.candidates && Array.isArray(config.candidates[key])
        ? config.candidates[key].map((entry) => s(entry.value)).filter(Boolean)
        : [];
    const pick = (values) => {
      const list = values.filter(Boolean);
      return list.find((value) => value !== description) || "";
    };

    const background = pick([
      s(c.systemRole),
      s(c.characterBackground),
      ...candidateValues("systemRole"),
      s(o.systemRole),
      s(a.systemRole),
      s(p.systemRole),
    ]);
    const setting = s(a.templateIntro) || s(o.templateIntro) || s(c.templateIntro);
    // The chat config names its own fields, so the example text can arrive under
    // any of the names the create form or the compiled prompt uses. The dialogue
    // array carries the creator's own exchanges, so it outranks the flat string.
    const examples =
      parseDialogueStyle(c.dialogueStyle) ||
      parseDialogueStyle(o.dialogueStyle) ||
      parseDialogueStyle(a.dialogueStyle) ||
      parseDialogueStyle(c.dialogueStyleObj) ||
      exampleString(c.conversationExample) ||
      exampleString(candidateValues("conversationExample")[0]) ||
      exampleString(o.conversationExample) ||
      exampleString(a.conversationExample);
    const style =
      styleOf(c.dialogueStyle) ||
      styleOf(o.dialogueStyle) ||
      styleOf(a.dialogueStyle) ||
      styleOf(c.dialogueStyleObj);
    const traits = labelText(c.personalityLabel) || labelText(o.personalityLabel);
    const greeting = s(a.speechText) || prologueText(o.prologue) || prologueText(c.prologue);
    // The scenario is empty for every non-template bot. The premise the creator
    // wrote into the greeting fills it verbatim, which is the one field the card
    // can still gain without inventing a word.
    const premise = setting ? "" : premiseBlock(greeting);

    // The creator's own Personalidad tags, matched against the site taxonomy.
    // They are the closest published stand-in for the private background: the
    // creator picked the words, so nothing here is inferred.
    const allTags = [...new Set([...tagNames(a.sceneTags), ...tagNames(p.sceneTags)])];
    const traitSet = new Set((Array.isArray(traitTags) ? traitTags : []).map((t) => s(t).toLowerCase()));
    const chosenTraits = background ? [] : allTags.filter((t) => traitSet.has(t.toLowerCase()));

    const card = {
      id,
      name: name || "Imported character",
      creator: s(a.createUserName) || s(p.createUserName) || s(o.createUserName),
      avatarUrl: s(a.sceneAvatarUrl) || s(p.sceneAvatarUrl) || s(a.homeCoverUrl) || s(p.homeCoverUrl),
      gender: decodeGender(a.sceneGender !== undefined ? a.sceneGender : p.sceneGender),
      nsfw: false,
      tags: allTags,
      fields: {
        description,
        personality: [
          background,
          chosenTraits.join(", "),
          traits ? "Personality: " + traits : "",
          style ? "Dialogue style: " + style : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        scenario: setting || premise,
        greeting,
        altGreetings: [],
        exampleDialogue: examples,
      },
      scriptRefs: [],
      lorebooks: [],
      failedLorebooks: 0,
      sourceLabel: "Polybuzz card",
    };

    const notes = [];
    // A card read from the profile API alone has no greeting at all. That is a
    // failed read, not a creator choice, so the note says how to retry.
    if (!card.fields.greeting) {
      notes.push("Polybuzz didn't hand over this character's greeting. Reload its chat page and scan again.");
    }
    if (!background && !examples) {
      // The background is a creator-private field: the editor itself labels it
      // "Antecedentes (Visto en privado)". A card missing it is the normal case,
      // not a failed read, so nothing is said. Only a real block - signed out, or
      // no route answered at all - earns a line, because both are fixable.
      const trace = (config && Array.isArray(config.trace) ? config.trace : []).filter(Boolean);
      const status = s(owner && owner.status);
      const answered = trace.find((t) => t.status === "ok");
      if (status === "login") {
        notes.push("Sign in to Polybuzz, reload the chat page and scan again to read this character's background.");
      } else if (!answered && status !== "not-owner") {
        const code = String((owner && owner.errNo) || "");
        notes.push(
          "Polybuzz didn't answer the background lookup for this character" +
            (code ? " (code " + code + ")" : "") +
            ". Reload its chat page and scan again.",
        );
      }
    }
    if (notes.length) card.note = notes.join(" ");

    // A quiet footnote under the block list, not a banner: three blocks where the
    // user expects five needs a reason, and the reason is the site's, not a bug.
    if (!background && s(owner && owner.status) !== "login") {
      card.hint =
        "Polybuzz keeps the background (Antecedentes) private to its creator." +
        [
          premise ? " Scenario is the opening direction from the creator's own greeting, verbatim." : "",
          chosenTraits.length
            ? " Personality is the tags the creator filed under Personalidad."
            : "",
        ].join("") +
        (premise || chosenTraits.length
          ? ""
          : " This card carries the intro, greeting, gender and tags the site publishes.");
    }
    return card;
  }

  async function scanCharacter(opts = {}) {
    const id = s(opts.id) || currentCharacterId();
    if (!id) {
      const err = new Error("no-character");
      err.friendly =
        "Open a Polybuzz character page first (its URL should look like polybuzz.ai/es/character/chat/...).";
      throw err;
    }
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    if (onProgress) onProgress("Reading character...");

    let scene = readSsrScene(id) || readDomScene(id);

    // The DOM payload tag is the initial server render, so it only matches the
    // current character when the page was opened directly. Otherwise fetch the
    // character's own page and parse its payload.
    if (!scene || !s(scene.speechText)) {
      const fetched = await fetchPageScene(id).catch(() => null);
      if (fetched && (!scene || Object.keys(fetched).length > Object.keys(scene).length)) {
        scene = fetched;
      }
    }

    let profile = null;
    try {
      // The API indexes characters by the bare scene id, not by the URL slug.
      profile = await fetchProfile(s(scene && scene.secretSceneId) || sceneIdFromSlug(id));
    } catch {
      // The rendered payload alone carries every public field, so a failed
      // profile call only costs a cross-check.
      profile = null;
    }

    if (!scene && !profile) {
      const err = new Error("no-character");
      err.friendly =
        "Polybuzz didn't return this character. Reload its chat page, wait for it to load, then scan again.";
      throw err;
    }

    // Background and dialogue examples are blank on every guest payload. The
    // signed-in routes are asked in order - edit loader, chat config, chat
    // bootstrap - because the first is owner-only and the other two are not.
    if (onProgress) onProgress("Checking the background and dialogue fields...");
    const sceneId = s(scene && scene.secretSceneId) || sceneIdFromSlug(id);
    const [prompt, traitTags] = await Promise.all([fetchPromptFields(sceneId), fetchTraitTags()]);

    return normalizeScene(
      scene,
      profile,
      prompt.detail,
      { fields: prompt.fields, trace: prompt.trace },
      traitTags,
    );
  }

  NS.scraper = {
    currentCharacterId,
    sceneIdFromSlug,
    readCuid,
    readSsrScene,
    readDomScene,
    parsePayload,
    unflatten,
    findScene,
    fetchPageScene,
    fetchProfile,
    fetchOwnerScene,
    fetchSceneConfig,
    fetchPromptFields,
    callPromptRoute,
    collectPromptFields,
    pickConversationId,
    postJson,
    postForm,
    labelText,
    premiseBlock,
    personalityTagNames,
    fetchTraitTags,
    parseDialogueStyle,
    exampleString,
    styleOf,
    pairTurns,
    prologueText,
    normalizeScene,
    decodeGender,
    scanCharacter,
    hint: "Reads the character Polybuzz renders on its chat page: avatar, name, gender, intro, greeting, tags and the creator.",
  };
})();
