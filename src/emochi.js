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

  async function fetchJson(path, bearer) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const headers = { Accept: "application/json" };
    // Never send cookies here: the API answers with Access-Control-Allow-Origin "*",
    // which the browser rejects on a credentialed request.
    if (bearer) headers.Authorization = "Bearer " + bearer;
    try {
      const res = await fetch(API_BASE + path, { headers, signal: ctrl.signal });
      if (!res.ok) {
        const err = new Error("HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
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

  // The published prompt hides personality/scenario; the creator route returns them but needs a login.
  function mergeCreator(card, owner) {
    if (!owner || typeof owner !== "object") return;
    const background = s(owner.characterBackground);
    const base = s(owner.introduction) || card.fields.description;
    card.fields.description = [base, background].filter(Boolean).join("\n\n");
    if (s(owner.personality)) card.fields.personality = s(owner.personality);
    if (s(owner.scenario)) card.fields.scenario = s(owner.scenario);
    if (s(owner.characterExampleConversation)) {
      card.fields.exampleDialogue = s(owner.characterExampleConversation);
    }
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
        try {
          const owned = await fetchJson(
            "/prompt/" + encodeURIComponent(card.id) + "/creator",
            bearer,
          );
          mergeCreator(card, owned && owned.prompt);
        } catch {
          card.note =
            "The creator definition is only readable for characters on your own account, so this is the public card.";
        }
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
    promptTagNames,
    exampleDialogue,
    hint: "Quick gets the public card. Deep adds the creator's full definition when you're signed in.",
  };
})();
