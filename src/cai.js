// Character.ai reader.
//
// Character.ai gives a signed-in browser a character record only through its own
// API, which needs the page's auth header. The page makes that request itself, so
// `intercept.js` captures the header and the response; this module replays the
// call with the captured token and falls back to whatever the page already
// received. Field mapping follows the verified table in
// https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter (MIT) by
// taquanta, credited in the README.
(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});
  const H = NS.harvest;
  const TIMEOUT_MS = 15000;

  const NEO = "https://neo.character.ai/character/v1/get_character_info";
  const PLUS = [
    "https://plus.character.ai/chat/character/info/",
    "https://plus.character.ai/chat/character/",
  ];
  const AVATAR_BASE = "https://characterai.io/i/400/static/avatars/";

  const s = (v) => (typeof v === "string" ? v.trim() : "");

  // /character/<external_id> and the older /chat?char=<external_id> both address
  // the same record.
  function currentCharacterId() {
    if (typeof location === "undefined") return null;
    const path = location.pathname.match(/\/character\/([A-Za-z0-9_-]{6,})/);
    if (path) return path[1];
    const query = new URLSearchParams(location.search);
    return query.get("char") || query.get("characterId") || null;
  }

  function readToken() {
    return H ? H.token() : "";
  }

  function backgroundFetch(url, token, body) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
          return finish(null);
        }
        // A malformed header (empty token) makes fetch throw before it leaves, so
        // the header is only attached when there is a token to attach.
        const headers = { "Content-Type": "application/json", Accept: "application/json" };
        if (token) headers.Authorization = "Token " + token;
        chrome.runtime.sendMessage(
          {
            type: "jaix:fetch",
            url,
            method: "POST",
            body: JSON.stringify(body),
            headers,
          },
          (reply) => {
            void chrome.runtime.lastError;
            finish(reply || null);
          },
        );
      } catch {
        return finish(null);
      }
      setTimeout(() => finish(null), TIMEOUT_MS);
    });
  }

  // The neo endpoint answers `{character: {...}}`; the plus endpoints answer the
  // record at the top level. Both are normalised to one object.
  function unwrap(body) {
    if (!body || typeof body !== "object") return null;
    const inner = body.character;
    if (inner && typeof inner === "object" && !Array.isArray(inner) && Object.keys(inner).length) return inner;
    if (body.external_id || body.participant__name) return body;
    if (body.name && (body.description || body.greeting || body.title)) return body;
    return null;
  }

  async function fetchCharacter(id) {
    const token = readToken();
    const attempts = [];
    for (const url of [NEO, ...PLUS]) {
      const reply = await backgroundFetch(url, token, { external_id: id, lang: "en" });
      attempts.push({ url, status: reply ? reply.status : 0, ok: Boolean(reply && reply.ok) });
      if (!reply || !reply.ok) continue;
      const parsed = unwrap(reply.body);
      if (parsed) return { character: parsed, attempts };
    }
    return { character: null, attempts };
  }

  // What the page itself already loaded. Same scoring as the other readers: the
  // object carrying the most known field names wins.
  const KEYS = [
    "name",
    "title",
    "description",
    "greeting",
    "definition",
    "external_id",
    "avatar_file_name",
    "participant__name",
  ];

  function harvested(id) {
    if (!H) return null;
    const found = H.bestCharacter(H.roots(), KEYS);
    if (!found) return null;
    if (id && found.external_id && found.external_id !== id) return null;
    return found;
  }

  function avatarUrl(c) {
    const file = s(c.avatar_file_name);
    if (file) return AVATAR_BASE + encodeURIComponent(file);
    return s(c.avatar_url) || s(c.avatar);
  }

  function normalizeCharacter(c) {
    const record = c && typeof c === "object" ? c : {};
    const name = s(record.name) || s(record.participant__name) || "Imported character";
    const title = s(record.title);
    const about = s(record.description);
    const definition = s(record.definition);
    // The title is the creator's one-line tagline; it has no field of its own, so
    // it rides on top of the About text the way the site displays it.
    const description = [title, about].filter(Boolean).join("\n\n");

    const card = {
      id: s(record.external_id) || s(record.id) || currentCharacterId() || "",
      name,
      creator: s(record.user__username) || s(record.creator) || "",
      avatarUrl: avatarUrl(record),
      nsfw: false,
      tags: [],
      fields: {
        description,
        personality: "",
        scenario: "",
        greeting: s(record.greeting) || s(record.first_message) || s(record.first_mes),
        altGreetings: [],
        // Character.ai's `definition` is free text the creator writes for the
        // model. It is the only place example dialogue appears, so it lands in
        // the example block rather than being thrown away.
        exampleDialogue: definition,
      },
      scriptRefs: [],
      lorebooks: [],
      failedLorebooks: 0,
      sourceLabel: "Character.AI card",
    };

    if (!definition) {
      card.hint =
        "Character.ai withholds this character's Definition unless its creator set Definition Visibility to public, so the example dialogue block is empty. Everything else is the record the site publishes.";
    }
    return card;
  }

  async function scanCharacter(opts = {}) {
    const id = s(opts.id) || currentCharacterId();
    if (!id) {
      const err = new Error("no-character");
      err.friendly =
        "Open a Character.ai character page first (its URL should look like character.ai/character/...).";
      throw err;
    }
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    if (onProgress) onProgress("Reading Character.ai...");

    let record = null;
    let attempts = [];
    if (readToken()) {
      const reply = await fetchCharacter(id);
      record = reply.character;
      attempts = reply.attempts;
    }
    if (!record) record = harvested(id);
    if (!record) {
      const err = new Error("no-character");
      err.friendly = readToken()
        ? "Character.ai didn't return this character. Reload its page, wait for it to finish loading, then scan again."
        : "Character.ai didn't hand over its sign-in token. Reload the character page (the extension reads the token from the page's own request) and scan again.";
      err.attempts = attempts;
      throw err;
    }
    return normalizeCharacter(record);
  }

  NS.scraper = {
    currentCharacterId,
    readToken,
    fetchCharacter,
    harvested,
    normalizeCharacter,
    scanCharacter,
    hint: "Reads the Character.ai record the page itself loads: name, tagline, About text, greeting, and the Definition when the creator made it public.",
  };
})();
