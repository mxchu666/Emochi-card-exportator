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
    const result = await callPromptRoute(PROMPT_ROUTES[0], id);
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

  async function callPromptRoute(route, id) {
    const cuid = readCuid();
    const headers = cuid ? { cuid } : {};
    const payload = { secretSceneId: id, secretSceneID: id };
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

  async function fetchSceneConfig(id) {
    return callPromptRoute(PROMPT_ROUTES[1], id);
  }

  // Every route is asked until one returns both prompt fields, so a card that
  // Polybuzz does publish comes back in one try and a card it withholds costs
  // three. The trace is what the note reports, so a screenshot of the panel names
  // the endpoint and the code instead of guessing.
  async function fetchPromptFields(id) {
    const trace = [];
    const fields = {};
    let detail = null;
    for (const route of PROMPT_ROUTES) {
      const result = await callPromptRoute(route, id);
      if (route.key === "detail") detail = result;
      trace.push({
        route: result.route,
        status: result.status,
        errNo: result.errNo,
        message: result.message,
        fields: Object.keys(result.fields),
      });
      for (const [key, value] of Object.entries(result.fields)) {
        if (fields[key] === undefined) fields[key] = value;
      }
      if (fields.systemRole && fields.conversationExample) break;
    }
    return { detail, fields, trace };
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

  function normalizeScene(scene, profile, owner, config) {
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
    const background =
      s(c.systemRole) ||
      s(c.characterBackground) ||
      s(o.systemRole) ||
      s(a.systemRole) ||
      s(p.systemRole);
    const setting = s(a.templateIntro) || s(o.templateIntro) || s(c.templateIntro);
    // The chat config names its own fields, so the example text can arrive under
    // any of the names the create form or the compiled prompt uses.
    const examples =
      s(c.conversationExample) ||
      s(c.characterExampleConversation) ||
      s(c.exampleDialogue) ||
      s(c.exampleConversation) ||
      s(o.conversationExample) ||
      s(a.conversationExample);
    const style =
      labelText(c.dialogueStyle) ||
      labelText(c.dialogueStyleObj) ||
      labelText(o.dialogueStyle) ||
      labelText(a.dialogueStyle);
    const traits = labelText(c.personalityLabel) || labelText(o.personalityLabel);

    const card = {
      id,
      name: name || "Imported character",
      creator: s(a.createUserName) || s(p.createUserName) || s(o.createUserName),
      avatarUrl: s(a.sceneAvatarUrl) || s(p.sceneAvatarUrl) || s(a.homeCoverUrl) || s(p.homeCoverUrl),
      gender: decodeGender(a.sceneGender !== undefined ? a.sceneGender : p.sceneGender),
      nsfw: false,
      tags: [...new Set([...tagNames(a.sceneTags), ...tagNames(p.sceneTags)])],
      fields: {
        description: s(a.sceneBrief) || s(p.sceneBrief) || s(o.sceneBrief) || s(o.brief),
        personality: [background, traits ? "Personality: " + traits : "", style ? "Dialogue style: " + style : ""]
          .filter(Boolean)
          .join("\n\n"),
        scenario: setting,
        greeting: s(a.speechText) || prologueText(o.prologue) || prologueText(c.prologue),
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
      // `getscenedetail` answers 210002 for a signed-in account that does not own
      // the bot and 120018 when nobody is signed in. Both are the server declining
      // to serialize the prompt fields, so the note names the code and every route
      // that was asked instead of pretending the fields were never written.
      const trace = (config && Array.isArray(config.trace) ? config.trace : []).filter(Boolean);
      const names = trace.map((t) => t.route + (t.errNo ? " " + t.errNo : " " + t.status));
      const detail = names.length ? " [" + names.join(", ") + "]" : "";
      const status = s(owner && owner.status);
      // A route that answered 200 outranks the edit loader's refusal: it proves
      // the server walked the record and found nothing to serialize, which is a
      // different fact from "you are not the owner".
      const answered = trace.find((t) => t.status === "ok");
      if (answered) {
        notes.push(
          "Polybuzz returned an empty background and empty dialogue examples for this character" +
            detail +
            ". Its editor labels the field Antecedentes (Visto en privado) and the server never serialises it to anyone but the creator; the card carries name, avatar, gender, intro, greeting and tags.",
        );
      } else if (status === "login") {
        notes.push(
          "Polybuzz answered the background lookup with code " +
            LOGIN_REQUIRED +
            " (not signed in)" +
            detail +
            ", so its background text and dialogue examples are missing from this card. " +
            "Sign in to Polybuzz in this browser, reload the chat page and scan again.",
        );
      } else if (status === "not-owner") {
        const who = card.creator ? " (" + card.creator + ")" : "";
        notes.push(
          "Polybuzz answered the background lookup with code " +
            NOT_EDITABLE +
            ": this account does not own the character" +
            who +
            detail +
            ". The card carries every field Polybuzz publishes: name, avatar, gender, intro, greeting and tags.",
        );
      } else if (status === "ok") {
        notes.push(
          "Polybuzz returned an empty background and empty dialogue examples for this character" +
            detail +
            ", so the card carries its name, avatar, gender, intro, greeting and tags only.",
        );
      } else if (owner && owner.errNo) {
        const errorDetail = owner.message ? " - " + owner.message : "";
        notes.push(
          "Polybuzz refused the background and dialogue lookups for this character (code " +
            owner.errNo +
            errorDetail +
            ")" +
            detail +
            ". Reload its chat page and scan again.",
        );
      } else {
        notes.push(
          "Polybuzz didn't answer the background and dialogue lookups for this character" +
            detail +
            ". Scan again from its chat page.",
        );
      }
    }
    if (notes.length) card.note = notes.join(" ");
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
    const prompt = await fetchPromptFields(sceneId);

    return normalizeScene(scene, profile, prompt.detail, { fields: prompt.fields, trace: prompt.trace });
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
    postJson,
    postForm,
    labelText,
    prologueText,
    normalizeScene,
    decodeGender,
    scanCharacter,
    hint: "Reads the character Polybuzz renders on its chat page: avatar, name, gender, intro, greeting, tags and the creator.",
  };
})();
