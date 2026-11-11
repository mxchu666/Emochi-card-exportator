(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});

  // Taken from emochi.com's own client bundle: every prompt/character call goes to this host.
  const API_BASE = "https://emochi-backend-k8s.flowgpt.com";
  const TIMEOUT_MS = 20000;

  // Emochi URLs look like /character/<slug>-<8 hex>/chat; the API accepts that whole slug as the id.
  function currentCharacterId() {
    const m = location.pathname.match(/\/character\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Same-origin route Emochi's own app uses to mint its bearer. Null means signed out.
  async function readBearer() {
    try {
      const res = await fetch("/api/auth/refresh", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const body = await res.json();
      return body && body.authenticated === true && typeof body.encodedToken === "string"
        ? body.encodedToken
        : null;
    } catch {
      return null;
    }
  }

  // Service-worker round trip. Null means the worker is unavailable (extension
  // reloaded, or running outside an extension), so the caller falls back.
  function fetchViaBackground(url, headers) {
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
        chrome.runtime.sendMessage({ type: "jaix:fetch", url, headers }, (reply) => {
          void chrome.runtime.lastError;
          finish(reply || null);
        });
      } catch {
        return finish(null);
      }
      setTimeout(() => finish(null), TIMEOUT_MS);
    });
  }

  function httpError(status, detail) {
    const err = new Error("HTTP " + (status || "network"));
    err.status = status;
    err.detail = detail || "";
    return err;
  }

  async function fetchJson(path, bearer) {
    const url = API_BASE + path;
    const headers = { Accept: "application/json" };
    // An Authorization header makes the request preflighted, and the API sends no
    // Access-Control-Allow-Headers - the browser drops it before it is ever sent.
    // Authorized reads therefore originate in the service worker, where CORS does not apply.
    if (bearer) headers.Authorization = "Bearer " + bearer;

    const reply = await fetchViaBackground(url, headers);
    if (reply) {
      if (!reply.ok) throw httpError(reply.status, reply.text || reply.error);
      return reply.body;
    }
    if (bearer) throw httpError(0, "no background worker");

    // Anonymous reads are simple requests: no preflight, so they work inline.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      if (!res.ok) throw httpError(res.status, "");
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const s = (v) => (typeof v === "string" ? v.trim() : "");

  function tagNames(v) {
    if (!Array.isArray(v)) return [];
    return v.map((t) => s(typeof t === "string" ? t : t && t.name)).filter(Boolean);
  }

  // promptTags groups read like ["V4","Character","Gender","Female"] - the last cell is the label.
  function promptTagNames(v) {
    if (!Array.isArray(v)) return [];
    return v
      .map((group) => {
        const last = Array.isArray(group) ? group[group.length - 1] : group;
        return s(typeof last === "string" ? last : last && last.name).replace(/^V\d+\s+/i, "");
      })
      .filter(Boolean);
  }

  const ROLE_PREFIX = { assistant: "{{char}}", bot: "{{char}}", user: "{{user}}", human: "{{user}}" };

  function exampleDialogue(v) {
    if (typeof v === "string") return v.trim();
    if (!Array.isArray(v)) return "";
    return v
      .map((turn) => {
        const content = s(turn && turn.content);
        if (!content) return "";
        const role = s(turn && turn.role).toLowerCase();
        return (ROLE_PREFIX[role] || s(turn && turn.role) || "{{char}}") + ": " + content;
      })
      .filter(Boolean)
      .join("\n\n");
  }

  function normalizePrompt(prompt) {
    const p = prompt && typeof prompt === "object" ? prompt : {};
    const user = p.User && typeof p.User === "object" ? p.User : {};
    return {
      id: s(p.id) || s(p.uri),
      name: s(p.title) || "Imported character",
      creator: s(user.name) || s(user.uri),
      avatarUrl: s(p.coverURL) || s(p.thumbnailURL) || s(p.image),
      nsfw: !!p.nsfw,
      tags: [
        ...new Set([...tagNames(p.Tag), ...tagNames(p.tags), ...promptTagNames(p.promptTags)]),
      ],
      fields: {
        description: s(p.description),
        personality: s(p.personality),
        scenario: s(p.scenario),
        greeting: s(p.welcomeMessage) || s(p.displayWelcomeMessage) || s(p.rawWelcomeMessage),
        altGreetings: [],
        exampleDialogue: exampleDialogue(p.exampleConversation) || s(p.characterExampleConversation),
      },
      scriptRefs: [],
      lorebooks: [],
      failedLorebooks: 0,
      sourceLabel: "Emochi card",
    };
  }

  // The published prompt hides personality/scenario; the definition routes return
  // them but need a login. Returns true when anything was actually filled in.
  function mergeCreator(card, owner) {
    if (!owner || typeof owner !== "object") return false;
    let filled = false;

    const introduction = s(owner.introduction);
    const background = s(owner.characterBackground);
    if (introduction || background) {
      const base = introduction || s(card.fields.description);
      const merged = [base, background].filter(Boolean).join("\n\n");
      if (merged && merged !== card.fields.description) {
        card.fields.description = merged;
        filled = true;
      }
    }

    const personality = s(owner.personality);
    if (personality && personality !== card.fields.personality) {
      card.fields.personality = personality;
      filled = true;
    }

    const scenario = s(owner.scenario);
    if (scenario && scenario !== card.fields.scenario) {
      card.fields.scenario = scenario;
      filled = true;
    }

    const examples =
      exampleDialogue(owner.exampleConversation) || s(owner.characterExampleConversation);
    if (examples && examples !== card.fields.exampleDialogue) {
      card.fields.exampleDialogue = examples;
      filled = true;
    }

    return filled;
  }

  // Each definition route nests the same fields differently, so any object that
  // carries a definition key is harvested rather than hard-coding one schema.
  const DEFINITION_KEYS = {
    personality: 1,
    scenario: 1,
    characterBackground: 1,
    characterExampleConversation: 1,
    introduction: 1,
    exampleConversation: 1,
  };

  function harvestDefinition(node, out, depth) {
    if (!node || typeof node !== "object" || (depth || 0) > 6) return out;
    if (Array.isArray(node)) {
      for (const item of node) harvestDefinition(item, out, (depth || 0) + 1);
      return out;
    }
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (!DEFINITION_KEYS[key]) {
        harvestDefinition(value, out, (depth || 0) + 1);
        continue;
      }
      if (out[key]) continue;
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
      else if (Array.isArray(value) && value.length) out[key] = value;
    }
    return out;
  }

  function friendlyFor(e) {
    if (e.status === 404) return "That character couldn't be found (it may be private or deleted).";
    if (e.status === 401 || e.status === 403) {
      return "Emochi rejected the request. Make sure you're signed in and can view this character, then reload the page.";
    }
    return "Couldn't reach Emochi just now. Reload the page and try again.";
  }

  async function scanCharacter(opts = {}) {
    const id = opts.id || currentCharacterId();
    if (!id) {
      const err = new Error("no-character");
      err.friendly =
        "Open an Emochi character page first (its URL should look like emochi.com/character/...).";
      throw err;
    }
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    if (onProgress) onProgress("Fetching character...");
    let data;
    try {
      data = await fetchJson("/prompt/" + encodeURIComponent(id));
    } catch (e) {
      e.friendly = friendlyFor(e);
      throw e;
    }
    const card = normalizePrompt(data && data.prompt);

    if (opts.deep) {
      if (onProgress) onProgress("Fetching creator definition...");
      const bearer = await readBearer();
      if (bearer) {
        // Read-only routes known to carry (or snapshot) the definition. The first
        // one that yields usable fields wins, so a refused route costs one request.
        const id = encodeURIComponent(card.id);
        const routes = [
          { path: "/prompt/" + id + "/creator" },
          { path: "/conversation/latest?promptId=" + id, marker: card.id },
          { path: "/conversation/prompt-history-v2?promptId=" + id },
        ];
        const failures = [];
        let filled = false;
        for (const route of routes) {
          try {
            const body = await fetchJson(route.path, bearer);
            // A conversation is only about this character when it names it.
            if (route.marker && !JSON.stringify(body).includes(route.marker)) {
              failures.push(route.path.split("?")[0] + " has no snapshot");
              continue;
            }
            if (mergeCreator(card, harvestDefinition(body, {}))) {
              filled = true;
              break;
            }
            failures.push(route.path.split("?")[0] + " returned no definition");
          } catch (error) {
            const status = error.status ? "HTTP " + error.status : error.message;
            failures.push(route.path.split("?")[0] + " " + status);
          }
        }
        if (!filled) card.note = "Public card only - " + failures.join("; ") + ".";
      } else {
        card.note = "Sign in to Emochi to pull the creator definition (personality, scenario, examples).";
      }
    }
    return card;
  }

  NS.scraper = {
    currentCharacterId,
    readBearer,
    scanCharacter,
    normalizePrompt,
    mergeCreator,
    harvestDefinition,
    promptTagNames,
    exampleDialogue,
    hint: "Quick gets the public card. Deep adds the creator's full definition when you're signed in.",
  };
})();
