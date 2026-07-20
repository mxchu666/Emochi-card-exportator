(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});

  const AVATAR_BASE = "https://ella.janitorai.com/bot-avatars";
  const TIMEOUT_MS = 20000;

  function currentCharacterId() {
    const m = location.pathname.match(/\/characters\/([0-9a-f-]{8,})/i);
    return m ? m[1] : null;
  }

  function readBearer() {
    for (const raw of sessionBlobs()) {
      const token = extractAccessToken(raw);
      if (token) return token;
    }
    return null;
  }

  function sessionBlobs() {
    const blobs = [];

    try {
      for (const parts of groupTokenKeys(Object.keys(localStorage))) {
        blobs.push(parts.map((k) => localStorage.getItem(k) || "").join(""));
      }
    } catch {}

    try {
      const jar = {};
      for (const c of (document.cookie || "").split(";")) {
        const i = c.indexOf("=");
        if (i < 0) continue;
        jar[c.slice(0, i).trim()] = c.slice(i + 1).trim();
      }
      for (const parts of groupTokenKeys(Object.keys(jar))) {
        let raw = parts.map((k) => jar[k] || "").join("");
        try {
          raw = decodeURIComponent(raw);
        } catch {}
        blobs.push(raw);
      }
    } catch {}

    return blobs;
  }

  function groupTokenKeys(keys) {
    const groups = {};
    for (const k of keys) {
      if (!/^sb-.*-auth-token(\.\d+)?$/.test(k)) continue;
      const base = k.replace(/\.\d+$/, "");
      (groups[base] = groups[base] || []).push(k);
    }
    const chunkIndex = (k) => {
      const m = k.match(/\.(\d+)$/);
      return m ? parseInt(m[1], 10) : -1;
    };
    return Object.keys(groups).map((base) =>
      groups[base].sort((a, b) => chunkIndex(a) - chunkIndex(b)),
    );
  }

  function extractAccessToken(raw) {
    if (!raw) return null;
    let text = raw;
    if (text.startsWith("base64-")) text = decodeBase64(text.slice(7));
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }
    if (Array.isArray(data) && typeof data[0] === "string") return data[0];
    if (data && typeof data.access_token === "string") return data.access_token;
    if (data && data.currentSession && typeof data.currentSession.access_token === "string") {
      return data.currentSession.access_token;
    }
    return null;
  }

  function decodeBase64(value) {
    try {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      const bin = atob(padded);
      return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } catch {
      return "";
    }
  }

  async function fetchJson(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const headers = { Accept: "application/json" };
    const bearer = readBearer();
    if (bearer) headers.Authorization = "Bearer " + bearer;
    try {
      const res = await fetch(url, {
        headers,
        credentials: "include",
        signal: ctrl.signal,
      });
      const body = await res.text();
      if (!res.ok) {
        const err = new Error("HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      try {
        return JSON.parse(body);
      } catch {
        const err = new Error("non-json");
        err.status = res.status;
        throw err;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const s = (v) => (typeof v === "string" ? v.trim() : "");
  const arrStr = (v) =>
    Array.isArray(v) ? v.map(s).filter(Boolean) : [];

  function stripAttributionBoilerplate(value, creator) {
    const text = s(value);
    if (!text) return "";
    return text
      .replace(/(<br\s*\/?>|<\/(?:p|div|li|h[1-6])\s*>)/gi, "$1\n")
      .split(/\r?\n/)
      .filter((line) => !isAttributionLine(line, creator))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isAttributionLine(line, creator) {
    const plain = String(line || "")
      .trim()
      .replace(/<[^>]*>/g, " ")
      .replace(/(?:&nbsp;|&#160;)/gi, " ")
      .replace(/(?:&commat;|&#64;)/gi, "@")
      .replace(/^(?:>\s*|[-*#]\s*)+/, "")
      .replace(/[*_~`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain || plain.length > 120) return false;

    const match =
      plain.match(
        /^(?:(?:this\s+)?(?:character|bot|card)\s+)?(?:created|made|written)\s+by\s*:?\s+(.+)$/i,
      ) ||
      plain.match(/^(?:creator|author)\s*:\s*(.+)$/i) ||
      plain.match(/^by\s+(@\S+|https?:\/\/\S+|\[[^\]]+\]\([^)]+\))$/i) ||
      plain.match(/^©\s*(.+)$/);
    if (!match) return false;

    const target = match[1].trim();
    if (/^@[\p{L}\p{N}_.-]+$/u.test(target)) return true;
    if (/^https?:\/\/\S+$/i.test(target)) return true;
    if (/^\[[^\]]+\]\([^)]+\)$/.test(target)) return true;

    const targetKey = identityKey(target);
    const creatorKey = identityKey(creator);
    return !!creatorKey && (
      targetKey === creatorKey ||
      targetKey === creatorKey + "onjanitorai"
    );
  }

  function identityKey(value) {
    return s(value)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function tagNames(v) {
    if (!Array.isArray(v)) return [];
    return v
      .map((t) => s(typeof t === "string" ? t : t && t.name))
      .filter(Boolean);
  }

  function absAvatar(v) {
    const a = s(v);
    if (!a) return "";
    if (/^https?:\/\//i.test(a)) return a;
    return AVATAR_BASE + "/" + a.replace(/^\/+/, "");
  }

  function normalizeCharacter(data) {
    data = data && typeof data === "object" ? data : {};
    const creator = s(data.creator_name);
    const clean = (value) => stripAttributionBoilerplate(value, creator);
    const firstMsgs = arrStr(data.first_messages).map(clean).filter(Boolean);
    const firstMessage = clean(data.first_message);
    const greeting = firstMessage || firstMsgs[0] || "";
    const altGreetings = [
      ...new Set(
        (firstMessage ? firstMsgs : firstMsgs.slice(1)).filter(
          (message) => message !== greeting,
        ),
      ),
    ];
    return {
      id: s(data.id),
      name: s(data.name) || "Imported character",
      creator,
      avatarUrl: absAvatar(data.avatar),
      nsfw: !!data.is_nsfw,
      tags: [...new Set([...tagNames(data.tags), ...tagNames(data.custom_tags)])],
      fields: {
        description: clean(data.description),
        personality: clean(data.personality),
        scenario: clean(data.scenario),
        greeting,
        altGreetings,
        exampleDialogue: clean(data.example_dialogs),
      },
      scriptRefs: (Array.isArray(data.scripts) ? data.scripts : [])
        .filter((x) => x && x.type === "lorebook" && typeof x.id === "string")
        .map((x) => ({ id: x.id, title: s(x.title), description: clean(x.description) })),
      lorebooks: [],
      failedLorebooks: 0,
    };
  }

  async function fetchScript(ref, creator) {
    const data = await fetchJson(
      "/hampter/script/" + encodeURIComponent(ref.id),
    );
    let entries = data && data.script;
    if (typeof entries === "string") {
      try {
        entries = JSON.parse(entries);
      } catch {
        throw new Error("invalid-script");
      }
    }
    if (!Array.isArray(entries)) entries = [];
    return {
      name: ref.title || "Lorebook",
      description: stripAttributionBoilerplate(ref.description, creator),
      entries: entries.map((entry) => normalizeEntry(entry, creator)).filter((e) => e.content),
    };
  }

  function normalizeEntry(e, creator) {
    if (!e || typeof e !== "object") return { keys: [], content: "", comment: "" };
    const keys = [
      ...new Set(arrStr(e.keys).concat(arrStr(e.key)).concat(arrStr(e.keywords))),
    ];
    return {
      keys: keys.length ? keys : arrStr(e.secondary_keys),
      content: stripAttributionBoilerplate(
        s(e.content) || s(e.entry) || s(e.text),
        creator,
      ),
      comment: s(e.name) || s(e.comment) || s(e.title),
      constant: !!e.constant,
      selective: e.selective !== false,
    };
  }

  async function scanCharacter(opts = {}) {
    const id = opts.id || currentCharacterId();
    if (!id) {
      const err = new Error("no-character");
      err.friendly =
        "Open a character page first (its URL should look like janitorai.com/characters/...).";
      throw err;
    }
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    if (onProgress) onProgress("Fetching character...");
    let data;
    try {
      data = await fetchJson("/hampter/characters/" + encodeURIComponent(id));
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        e.friendly =
          "JanitorAI rejected the request. Make sure you're signed in and can view this character, then reload the page and try again.";
      } else if (e.status === 404) {
        e.friendly = "That character couldn't be found (it may be private or deleted).";
      } else {
        e.friendly = "Couldn't reach JanitorAI just now. Reload the page and try again.";
      }
      throw e;
    }
    const card = normalizeCharacter(data);

    if (opts.deep && card.scriptRefs.length) {
      let done = 0;
      for (const ref of card.scriptRefs) {
        if (onProgress) {
          onProgress("Fetching lorebook " + ++done + "/" + card.scriptRefs.length + "...");
        }
        try {
          const book = await fetchScript(ref, card.creator);
          if (book.entries.length) card.lorebooks.push(book);
        } catch {
          card.failedLorebooks++;
        }
      }
    }
    return card;
  }

  NS.scraper = {
    currentCharacterId,
    readBearer,
    scanCharacter,
    normalizeCharacter,
    normalizeEntry,
    stripAttributionBoilerplate,
  };
})();
