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

  // The header exactly as the page sent it. The site has shipped `Token <hex>` and
  // `Bearer <jwt>` at different times; rebuilding the scheme from a bare token
  // breaks the moment it changes, and the failure looks like a missing character.
  function readAuthHeader() {
    return H && typeof H.tokenHeader === "function" ? H.tokenHeader() : "";
  }

  function attemptLabel(transport, url) {
    return transport + " " + url.replace(/^https:\/\//, "").replace(/\/$/, "");
  }

  function note(attempts, transport, url, reply, error) {
    attempts.push({
      label: attemptLabel(transport, url),
      status: reply ? reply.status || 0 : 0,
      ok: Boolean(reply && reply.ok),
      error: error ? String(error).slice(0, 80) : "",
    });
  }

  // A 200 with no character in it is the least useful line a report can carry,
  // so it says what the body actually was: an HTML challenge, an error envelope,
  // or a shape the unwrapper does not know.
  function whyEmpty(reply) {
    if (!reply) return "no reply";
    if (reply.error) return reply.error;
    if (!reply.ok) return "http " + (reply.status || 0);
    if (reply.body && typeof reply.body === "object") {
      const keys = Object.keys(reply.body).slice(0, 4).join(",");
      return "200, no character in body (" + (keys || "empty object") + ")";
    }
    const text = String(reply.text || "").trim();
    if (/^</.test(text)) return "200, html page instead of json";
    return "200, no character in body";
  }

  // First transport: the page's own context. It carries the site's cookies and
  // runs under the origin the API already allows, which is what the site itself
  // does. Cross-origin, so it only works if the API sends CORS headers — and when
  // it does, it is the request least likely to be refused.
  async function pageFetch(url, auth, body) {
    try {
      const headers = { "Content-Type": "application/json", Accept: "application/json" };
      if (auth) headers.Authorization = auth;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      return { ok: res.ok, status: res.status, body: parsed, text };
    } catch (error) {
      return { ok: false, status: 0, error: String(error), blocked: "cors-or-network" };
    }
  }

  // Second transport: the service worker. Not subject to CORS, and the site's
  // Cloudflare cookies ride along only because `credentials: "include"` is set —
  // without them a request from the worker looks like a bot and gets a 403.
  function backgroundFetch(url, auth, body) {
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
        if (auth) headers.Authorization = auth;
        chrome.runtime.sendMessage(
          {
            type: "jaix:fetch",
            url,
            method: "POST",
            body: JSON.stringify(body),
            headers,
            credentials: "include",
          },
          (reply) => {
            const failure = chrome.runtime.lastError;
            if (failure) {
              const raw = String(failure.message || "unknown");
              const plain = /context invalidated|Receiving end does not exist|message port closed/i.test(raw)
                ? "extension reloaded - reload this tab"
                : raw;
              return finish({ ok: false, status: 0, error: "runtime: " + plain });
            }
            finish(reply || { ok: false, status: 0, error: "worker sent no reply" });
          },
        );
      } catch {
        return finish(null);
      }
      setTimeout(() => finish({ ok: false, status: 0, error: "worker timeout" }), TIMEOUT_MS);
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
    const auth = readAuthHeader() || (readToken() ? "Token " + readToken() : "");
    const attempts = [];
    for (const url of [NEO, ...PLUS]) {
      for (const transport of ["page", "worker"]) {
        const reply =
          transport === "page"
            ? await pageFetch(url, auth, { external_id: id, lang: "en" })
            : await backgroundFetch(url, auth, { external_id: id, lang: "en" });
        note(attempts, transport, url, reply, whyEmpty(reply));
        const parsed = reply && reply.ok ? unwrap(reply.body) : null;
        if (parsed) return { character: parsed, attempts };
      }
    }
    // Cookie-only last try: if the site moved the session back onto cookies, the
    // header is not what it wants, and an empty Authorization is the right request.
    if (auth) {
      const reply = await pageFetch(NEO, "", { external_id: id, lang: "en" });
      note(attempts, "page(cookie)", NEO, reply, whyEmpty(reply));
      const parsed = reply && reply.ok ? unwrap(reply.body) : null;
      if (parsed) return { character: parsed, attempts };
    }
    return { character: null, attempts };
  }

  // Last resort: the character page itself, read through the worker with cookies.
  // A cold load is server-rendered, so the record exists in the page's own flight
  // data even when no API call was ever made from this tab.
  function backgroundGet(url) {
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
        chrome.runtime.sendMessage(
          { type: "jaix:fetch", url, method: "GET", credentials: "include" },
          (reply) => {
            const failure = chrome.runtime.lastError;
            if (failure) {
              const raw = String(failure.message || "unknown");
              const plain = /context invalidated|Receiving end does not exist|message port closed/i.test(raw)
                ? "extension reloaded - reload this tab"
                : raw;
              return finish({ ok: false, status: 0, error: "runtime: " + plain });
            }
            finish(reply || { ok: false, status: 0, error: "worker sent no reply" });
          },
        );
      } catch {
        return finish(null);
      }
      setTimeout(() => finish({ ok: false, status: 0, error: "worker timeout" }), TIMEOUT_MS);
    });
  }

  async function pageHtmlCharacter(id) {
    const url = "https://character.ai/character/" + encodeURIComponent(id);
    const reply = await backgroundGet(url);
    if (!reply || !reply.ok) return null;
    const text = s(reply.text) || (reply.body ? JSON.stringify(reply.body) : "");
    if (!text) return null;
    return H ? H.bestCharacter(H.embeddedObjects(text, KEYS, 8), KEYS) : null;
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
    const found = H.bestCharacter(H.roots(KEYS), KEYS);
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
    const auth = readAuthHeader();
    if (auth || readToken()) {
      const reply = await fetchCharacter(id);
      record = reply.character;
      attempts = reply.attempts;
    }
    if (!record) record = harvested(id);
    if (!record) {
      if (onProgress) onProgress("Reading the page record...");
      record = await pageHtmlCharacter(id);
    }
    if (!record) {
      const err = new Error("no-character");
      const trail = attempts.length
        ? " Tried: " + attempts.map((a) => a.label + " → " + (a.error || a.status || "no answer")).join("; ") + "."
        : "";
      err.friendly = auth || readToken()
        ? "Character.ai didn't return this character, and its page didn't carry the record either." + trail + " Reload the page, wait for it to finish loading, then scan again."
        : "Character.ai didn't hand over its sign-in token. Reload the character page (the extension reads the token from the page's own request) and scan again.";
      err.attempts = attempts;
      throw err;
    }
    return normalizeCharacter(record);
  }

  NS.scraper = {
    currentCharacterId,
    readToken,
    readAuthHeader,
    fetchCharacter,
    harvested,
    pageHtmlCharacter,
    normalizeCharacter,
    scanCharacter,
    hint: "Reads the Character.ai record the page itself loads: name, tagline, About text, greeting, and the Definition when the creator made it public.",
  };
})();
