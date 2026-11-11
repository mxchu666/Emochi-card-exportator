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

  // The app scopes user-scoped routes by this header; it lives in localStorage
  // under the store the site itself writes.
  function readUserId() {
    try {
      const raw = localStorage.getItem("user-store");
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      return s(parsed && parsed.state && parsed.state.userId);
    } catch {
      return "";
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

  async function fetchJson(path, session) {
    const url = API_BASE + path;
    const bearer = session && session.bearer;
    const headers = { Accept: "application/json" };
    // An Authorization header makes the request preflighted, and the API sends no
    // Access-Control-Allow-Headers - the browser drops it before it is ever sent.
    // Authorized reads therefore originate in the service worker, where CORS does not apply.
    if (bearer) {
      headers.Authorization = "Bearer " + bearer;
      if (session.userId) headers["x-flow-userid"] = session.userId;
    }

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

  // Emochi compiles each character's definition into one system prompt and
  // publishes it on listed characters (`initPrompt`). The shape is stable:
  //   <Name>'s name: <Name>.
  //   <Name> calls {{user}} by {{user}} or any name introduced by {{user}}.
  //   <Name>'s personality: ...
  //   <Name>'s background: ...
  //   scenario of role-play: ...
  //   Example conversations between <Name> and {{user}}: ...
  //   Do not write as {{user}} or assume {{user}}'s reaction or response.
  // Sections are optional and may sit on one line, so markers are located by
  // index rather than by splitting lines.
  const SECTION_MARKERS = [
    ["personality", /'s personality:/i],
    ["characterBackground", /'s background:/i],
    ["scenario", /scenario of role-play:/i],
    ["characterExampleConversation", /example conversations? between/i],
  ];

  function parseSystemPrompt(raw) {
    const text = s(raw);
    if (!text) return null;
    const body = text
      .replace(/^\s*["']?\[\]\s*["']?/, "")
      .split(/do not write as \{\{user\}\}/i)[0]
      .trim();
    if (!body) return null;

    const marks = SECTION_MARKERS.map(([key, re]) => {
      const hit = re.exec(body);
      return hit ? { key, start: hit.index, end: hit.index + hit[0].length } : null;
    })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);

    const out = {};
    const nameHit = /([^:\n]{1,60}?)'s name:/i.exec(body);
    if (nameHit) out.name = nameHit[1].trim();
    // A section runs up to the next marker, which leaves the next section's
    // "<Name>'s" prefix glued to the end of this one.
    const nameTail = out.name
      ? new RegExp("\\s*" + out.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "i")
      : null;

    // A prompt with no section markers is a plain system prompt, not a card.
    if (!marks.length) {
      out.personality = body;
      return out;
    }
    for (let i = 0; i < marks.length; i += 1) {
      const stop = i + 1 < marks.length ? marks[i + 1].start : body.length;
      let part = body.slice(marks[i].end, stop).trim();
      if (nameTail) part = part.replace(nameTail, "").trim();
      part = part.replace(/^\.\s*/, "").replace(/\s+\.$/, "");
      if (part.length > 1) out[marks[i].key] = part;
    }
    return out;
  }

  function normalizePrompt(prompt) {
    const p = prompt && typeof prompt === "object" ? prompt : {};
    const user = p.User && typeof p.User === "object" ? p.User : {};
    const card = {
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
    const compiled = parseSystemPrompt(p.initPrompt);
    if (compiled) mergeCreator(card, compiled);
    return card;
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
    initPrompt: 1,
  };

  // `exampleConversation` also rides on the public payload, so it cannot prove a
  // route reached the definition; these can.
  const DEFINITION_ONLY = [
    "personality",
    "scenario",
    "characterBackground",
    "characterExampleConversation",
    "introduction",
    "initPrompt",
  ];

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

  function serverMessage(detail) {
    const text = s(detail);
    if (!text) return "";
    try {
      const parsed = JSON.parse(text);
      const inner = (parsed && (parsed.data || parsed.message)) || "";
      if (typeof inner === "string") return inner.slice(0, 80);
    } catch {
      /* plain text body */
    }
    return text.slice(0, 80);
  }

  function friendlyFor(e) {
    if (e.status === 404) return "That character couldn't be found (it may be private or deleted).";
    if (e.status === 401 || e.status === 403) {
      return "Emochi rejected the request. Make sure you're signed in and can view this character, then reload the page.";
    }
    return "Couldn't reach Emochi just now. Reload the page and try again.";
  }

  // Turns the per-route trail into one line a person can act on. Three outcomes
  // are worth telling apart: the session is refused, the definition is the
  // creator's own, or the character simply publishes little.
  function describeFailures(failures) {
    const refused = failures.filter((f) => f.status === 401 || f.status === 403);
    const answered = failures.filter((f) => f.answered);
    const creatorRefused = refused.some((f) => f.label === "creator");

    if (creatorRefused && answered.length) {
      return (
        "Emochi keeps personality, scenario and example dialogue private to the " +
        "character's creator. Everything it publishes is in this card."
      );
    }
    if (refused.length === failures.length && refused.length) {
      const reason = serverMessage(refused[0].reason);
      return (
        "Emochi refused the request" + (reason ? " (" + reason + ")" : "") +
        ". Reload the page while signed in, then deep scan again."
      );
    }
    return "Emochi publishes no definition for this character, so the card carries its public fields.";
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
        const session = { bearer, userId: readUserId() };
        // Read-only routes that can carry the definition. The first one that yields
        // usable fields wins, so a refusal costs one request.
        const promptId = encodeURIComponent(card.id);
        const routes = [
          { label: "detail", path: "/prompt/" + promptId },
          { label: "creator", path: "/prompt/" + promptId + "/creator" },
          { label: "latest", path: "/conversation/latest?promptId=" + promptId, marker: card.id },
        ];
        const failures = [];
        let filled = false;
        for (const route of routes) {
          try {
            const body = await fetchJson(route.path, session);
            // A conversation is only about this character when it names it.
            if (route.marker && !JSON.stringify(body).includes(route.marker)) {
              failures.push({ label: route.label, answered: true, reason: "no snapshot" });
              continue;
            }
            // The public payload echoes `exampleConversation`, so only the
            // definition-only keys prove a route actually carried the definition.
            const found = harvestDefinition(body, {});
            if (!DEFINITION_ONLY.some((key) => found[key])) {
              failures.push({ label: route.label, answered: true, reason: "no definition" });
              continue;
            }
            mergeCreator(card, found);
            const compiled = parseSystemPrompt(found.initPrompt);
            if (compiled) mergeCreator(card, compiled);
            filled = true;
            break;
          } catch (error) {
            failures.push({
              label: route.label,
              status: error.status || 0,
              reason: serverMessage(error.detail) || error.message,
            });
          }
        }
        if (!filled) card.note = describeFailures(failures);
      } else {
        card.note = "Sign in to Emochi to pull the creator definition (personality, scenario, examples).";
      }
    }
    return card;
  }

  NS.scraper = {
    currentCharacterId,
    readBearer,
    readUserId,
    scanCharacter,
    normalizePrompt,
    mergeCreator,
    harvestDefinition,
    parseSystemPrompt,
    describeFailures,
    promptTagNames,
    exampleDialogue,
    hint: "Quick exports every field Emochi publishes, including the compiled personality and scenario when the character has them. Deep adds the creator's own definition when you're signed in.",
  };
})();
