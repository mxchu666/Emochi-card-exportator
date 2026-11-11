(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});

  // Taken from polybuzz.ai's own Nuxt config (`polyConfig.baseUrl`).
  const API_BASE = "https://c6-api.polybuzz.ai";
  const TIMEOUT_MS = 15000;

  const s = (v) => (typeof v === "string" ? v.trim() : "");

  // Polybuzz URLs look like /<locale>/character/chat/<slug>-<5 chars>; the API
  // takes only the trailing slug, e.g. "bangchan-bLgrZ".
  function currentCharacterId() {
    if (typeof location === "undefined") return null;
    const m = location.pathname.match(/\/character\/chat\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
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
  // payload before any request is made. That payload is the richest public view:
  // it carries the greeting, gender and tags, which /api/scene/profile omits.
  function readSsrScene(id) {
    const nuxt = window.__NUXT__;
    const data = nuxt && nuxt.data;
    if (!data || typeof data !== "object") return null;
    const wanted = s(id).toLowerCase();
    let found = null;
    const walk = (node, depth) => {
      if (found || !node || typeof node !== "object" || depth > 5) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      if (typeof node.secretSceneId === "string" && typeof node.sceneName === "string") {
        // A client-side route change leaves the previous character's payload in
        // place, so only an id match counts.
        if (node.secretSceneId.toLowerCase() === wanted) found = node;
        return;
      }
      for (const key of Object.keys(node)) walk(node[key], depth + 1);
    };
    walk(data, 0);
    return found;
  }

  async function fetchProfile(id) {
    const cuid = readCuid();
    const url = API_BASE + "/api/scene/profile?secretSceneID=" + encodeURIComponent(id);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        credentials: "omit",
        headers: cuid ? { cuid } : {},
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const body = await res.json();
      if (body && body.errNo) throw new Error(s(body.errMsg) || "HTTP " + body.errNo);
      return body && body.data && typeof body.data === "object" ? body.data : null;
    } finally {
      clearTimeout(timer);
    }
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

    const rendered = readSsrScene(id);
    let profile = null;
    try {
      profile = await fetchProfile(id);
    } catch (e) {
      // The rendered payload alone is enough for a complete public card; the
      // profile call only re-checks the name/avatar/creator.
      if (!rendered) {
        e.friendly =
          "Couldn't read this Polybuzz character. Reload the page and try again.";
        throw e;
      }
    }
    if (!rendered && !profile) {
      const err = new Error("no-character");
      err.friendly =
        "Polybuzz didn't return this character. Open its chat page, wait for it to load, then scan again.";
      throw err;
    }
    return normalizeScene(rendered, profile);
  }

  NS.scraper = {
    currentCharacterId,
    readCuid,
    readSsrScene,
    fetchProfile,
    normalizeScene,
    decodeGender,
    scanCharacter,
    hint: "Reads the character Polybuzz renders on its chat page: avatar, name, gender, intro, greeting, tags and the creator.",
  };
})();
