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
  // Both the page HTML and the JSON API go through the extension service
  // worker. A content-script request inherits the page's origin, so the API's
  // `cuid` header turns it into a preflighted cross-origin request that can die
  // before it is sent; the worker is not subject to CORS and already holds the
  // host permissions. Inline fetches stay as a fallback for older copies.
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
    const reply = await fromBackground({ type: "jaix:fetch", url, headers });
    if (reply && reply.ok && reply.body) return reply.body;
    const res = await inlineFetch(url, { credentials: "omit", headers: headers || {} });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
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
  // style. The public payload only carries the first five plus the profile row.
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

  function normalizeScene(scene, profile) {
    const a = scene && typeof scene === "object" ? scene : {};
    const p = profile && typeof profile === "object" ? profile : {};
    const id = s(a.secretSceneId) || s(p.secretSceneId) || currentCharacterId() || "";
    const name = s(a.sceneName) || s(p.sceneName) || s(a.oriSceneName) || s(p.oriSceneName);

    const background = s(a.systemRole);
    const setting = s(a.templateIntro);

    const card = {
      id,
      name: name || "Imported character",
      creator: s(a.createUserName) || s(p.createUserName),
      avatarUrl: s(a.sceneAvatarUrl) || s(p.sceneAvatarUrl) || s(a.homeCoverUrl) || s(p.homeCoverUrl),
      gender: decodeGender(a.sceneGender !== undefined ? a.sceneGender : p.sceneGender),
      nsfw: false,
      tags: [...new Set([...tagNames(a.sceneTags), ...tagNames(p.sceneTags)])],
      fields: {
        description: s(a.sceneBrief) || s(p.sceneBrief),
        personality: background,
        scenario: setting,
        greeting: s(a.speechText),
        altGreetings: [],
        exampleDialogue: "",
      },
      scriptRefs: [],
      lorebooks: [],
      failedLorebooks: 0,
      sourceLabel: "Polybuzz card",
    };

    // Polybuzz keeps the background text and the dialogue-style examples inside
    // the creator's editor. When the payload carries neither, say so rather than
    // letting a thin card look like a failed read.
    if (!background && !setting) {
      card.note =
        "Polybuzz publishes this bot's name, avatar, gender, intro, greeting and tags. " +
        "Its background text and dialogue-style examples stay in the creator's editor.";
    }
    // A card read from the profile API alone has no greeting at all. That is a
    // failed read, not a creator choice, so the note says how to retry.
    if (!card.fields.greeting) {
      card.note =
        "Polybuzz didn't hand over this character's greeting. Reload its chat page and scan again.";
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
    return normalizeScene(scene, profile);
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
    normalizeScene,
    decodeGender,
    scanCharacter,
    hint: "Reads the character Polybuzz renders on its chat page: avatar, name, gender, intro, greeting, tags and the creator.",
  };
})();
