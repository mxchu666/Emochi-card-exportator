(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});

  // Taken from emochi.com's own client bundle: every prompt/character call goes to this host.
  const API_BASE = "https://emochi-backend-k8s.flowgpt.com";
  const TIMEOUT_MS = 20000;

  // Emochi URLs look like /character/<slug>-<8 hex>/chat; the API accepts that
  // whole slug as the id. The Lab (Story, Soundstage, LiveRoom) addresses its
  // content under /lab/..., so the trailing path segment is taken as the id and
  // the surface word is skipped. The Lab's shape could not be observed from a
  // signed-out session; if a surface uses a different record type, the scan says
  // which route failed rather than returning a half card.
  const LAB_SURFACES = new Set(["story", "soundstage", "liveroom", "live-room", "experience", "lab"]);

  function currentCharacterId() {
    if (typeof location === "undefined") return null;
    const m = location.pathname.match(/\/character\/([^/?#]+)/i);
    if (m) return decodeURIComponent(m[1]);
    const lab = location.pathname.match(/\/lab\/(.*)$/i);
    if (!lab) return null;
    const parts = lab[1]
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
    const id = [...parts].reverse().find((part) => !LAB_SURFACES.has(part.toLowerCase()));
    return id || null;
  }

  function isLabPage() {
    return typeof location !== "undefined" && /\/lab(\/|$)/i.test(location.pathname);
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

  const ROLE_PREFIX = {
    assistant: "{{char}}",
    bot: "{{char}}",
    char: "{{char}}",
    character: "{{char}}",
    model: "{{char}}",
    ai: "{{char}}",
    user: "{{user}}",
    human: "{{user}}",
    person: "{{user}}",
  };

  // Sample dialogue is stored as turns, but never in one shape. Emochi's own
  // recorder uses `{role, content}`; the export tooling and Polybuzz use
  // `{user, ai}` pairs, one entry per exchange; some records carry
  // `{isUser, text}`. All of them become {{user}}/{{char}} lines, because the
  // card format only understands those two speakers.
  function turnLines(turn) {
    if (typeof turn === "string") return s(turn) ? ["{{char}}: " + s(turn)] : [];
    if (!turn || typeof turn !== "object") return [];
    const mine = s(turn.user);
    const theirs = s(turn.ai);
    if (mine || theirs) {
      return [mine ? "{{user}}: " + mine : "", theirs ? "{{char}}: " + theirs : ""].filter(Boolean);
    }
    const content = s(turn.content) || s(turn.text) || s(turn.message) || s(turn.value);
    if (!content) return [];
    const raw = (s(turn.role) || s(turn.speaker) || s(turn.author) || (turn.isUser ? "user" : "")).toLowerCase();
    return [(ROLE_PREFIX[raw] || "{{char}}") + ": " + content];
  }

  function dialogueArray(v) {
    if (Array.isArray(v)) return v;
    if (!v || typeof v !== "object") return null;
    for (const key of ["dialogue", "messages", "conversations", "exampleConversation"]) {
      if (Array.isArray(v[key])) return v[key];
    }
    return null;
  }

  function exampleDialogue(v) {
    if (typeof v === "string") return v.trim();
    const list = dialogueArray(v);
    if (!list) return "";
    return list
      .map(turnLines)
      .reduce((acc, lines) => acc.concat(lines), [])
      .join("\n\n")
      .trim();
  }

  // Sections are optional and may sit on one line, so markers are located by
  // index rather than by splitting lines. The grammar Emochi compiles is the
  // first set; creators edit the text, so a second, line-anchored set covers the
  // drift ("Personality:", "{{char}}'s personality traits:", "Example dialogue").
  // The strict set runs first so a recognised prompt parses exactly as before.
  const SECTION_MARKERS = [
    ["personality", /'s personality:/i],
    ["characterBackground", /'s background:/i],
    ["scenario", /scenario of role-play:/i],
    ["characterExampleConversation", /example conversations? between/i],
  ];

  const TOLERANT_MARKERS = [
    ["personality", /(?:^|\n)[^\n:]{0,40}personality(?:\s+traits)?\s*:/i],
    ["characterBackground", /(?:^|\n)[^\n:]{0,40}(?:background|backstory)\s*:/i],
    ["scenario", /(?:^|\n)[^\n:]{0,40}scenario[^\n:]{0,40}:/i],
    ["characterExampleConversation", /(?:^|\n)[^\n:]{0,40}example\s+(?:conversations?|dialogues?)/i],
  ];

  // The closing instruction is a sentence, not a boundary: it is removed where it
  // appears and the text around it survives. Cutting everything after it used to
  // drop every section that followed a creator who quoted the rule inside their
  // own example dialogue.
  const DO_NOT_WRITE = /do not write as \{\{user\}\}[^.\n]*\.?/gi;

  function parseSections(body, markers) {
    const marks = markers
      .map(([key, re]) => {
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

    for (let i = 0; i < marks.length; i += 1) {
      const stop = i + 1 < marks.length ? marks[i + 1].start : body.length;
      let part = body.slice(marks[i].end, stop).trim();
      if (nameTail) part = part.replace(nameTail, "").trim();
      part = part.replace(/^\.\s*/, "").replace(/\s+\.$/, "");
      if (part.length > 1) out[marks[i].key] = part;
    }
    return { out, count: marks.length };
  }

  function parseSystemPrompt(raw) {
    const text = s(raw);
    if (!text) return null;
    const body = text
      .replace(/^\s*["']?\[\]\s*["']?/, "")
      .replace(DO_NOT_WRITE, "")
      .trim();
    if (!body) return null;

    const strict = parseSections(body, SECTION_MARKERS);
    const tolerant = parseSections(body, TOLERANT_MARKERS);
    // Whichever pass recognises more sections wins; a tie keeps the strict
    // grammar, so a prompt Emochi compiled parses exactly as before.
    const chosen = tolerant.count > strict.count ? tolerant : strict;

    // A prompt with no section markers at all is a plain system prompt, not a
    // card, so the whole body is the best available personality text.
    if (!chosen.count) return { personality: body };
    return chosen.out;
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
        exampleDialogue: exampleDialogue(p.exampleConversation) || exampleDialogue(p.characterExampleConversation) || s(p.characterExampleConversation),
      },
      scriptRefs: [],
      lorebooks: [],
      failedLorebooks: 0,
      sourceLabel: "Emochi card",
    };
    const compiled = parseSystemPrompt(p.initPrompt);
    if (compiled) {
      mergeCreator(card, compiled);
      // The compiled prompt only carries the sections the creator filled in, so a
      // thin card is the creator's blank field, not a failed read. That claim is
      // only made when the layout was actually recognised: with one section or
      // none, a missing field is a parse outcome, and saying "the creator left it
      // empty" would be a guess.
      const sections = Object.keys(compiled).filter((key) => key !== "name").length;
      const blank = [
        ["personality", "personality"],
        ["scenario", "scenario"],
        ["exampleDialogue", "example dialogue"],
      ]
        .filter(([key]) => !card.fields[key])
        .map(([, label]) => label);
      if (blank.length && sections >= 1 && compiled.name) {
        card.note =
          "Emochi publishes this character's definition, but the creator left " +
          (blank.length === 1 ? blank[0] : blank.slice(0, -1).join(", ") + " and " + blank[blank.length - 1]) +
          " empty.";
      }
    }
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
      exampleDialogue(owner.exampleConversation) ||
      exampleDialogue(owner.characterExampleConversation) ||
      s(owner.characterExampleConversation);
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

  // Conversation routes answer with prompt strings rather than a prompt object:
  // the text the server would hand the model for this character. It uses the same
  // section grammar as `initPrompt`, so the longest match is parsed the same way.
  const COMPILED_HINT = /'s personality:|scenario of role-play:/i;

  function findCompiled(node, best, depth) {
    if (typeof node === "string") return COMPILED_HINT.test(node) && node.length > best.length ? node : best;
    if (!node || typeof node !== "object" || (depth || 0) > 6) return best;
    if (Array.isArray(node)) {
      for (const item of node) best = findCompiled(item, best, (depth || 0) + 1);
      return best;
    }
    for (const key of Object.keys(node)) best = findCompiled(node[key], best, (depth || 0) + 1);
    return best;
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
        "character's creator. Send this bot one message, then deep scan again — " +
        "Emochi keeps the compiled prompt with the conversation."
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
      if (onProgress) onProgress("Fetching creator definition...");      const bearer = await readBearer();
      if (bearer) {
        const session = { bearer, userId: readUserId() };
        // Read-only routes that can carry the definition. The first one that yields
        // usable fields wins, so a refusal costs one request.
        const promptId = encodeURIComponent(card.id);
        const routes = [
          { label: "detail", path: "/prompt/" + promptId },
          { label: "creator", path: "/prompt/" + promptId + "/creator" },
          { label: "latest", path: "/conversation/latest?promptId=" + promptId, marker: card.id },
          { label: "history", path: "/conversation/prompt-history-v2?promptId=" + promptId, marker: card.id },
          { label: "history", path: "/conversation/prompt-history?promptId=" + promptId, marker: card.id },
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
            // Conversation routes carry the compiled prompt as text instead.
            const compiled = parseSystemPrompt(found.initPrompt) || parseSystemPrompt(findCompiled(body, "", 0));
            if (!DEFINITION_ONLY.some((key) => found[key]) && !(compiled && compiled.personality)) {
              failures.push({ label: route.label, answered: true, reason: "no definition" });
              continue;
            }
            mergeCreator(card, found);
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
    // The Lab (Story, Soundstage, LiveRoom) serves the same prompt record, so the
    // card reads normally there. What a card cannot carry is the Lab's stage: the
    // ambient track, the voice casting, and the rest of a LiveRoom cast.
    if (isLabPage()) {
      card.hint = [
        card.hint,
        "Read from the Emochi Lab. The card carries this character's text fields; the ambient audio, the voice casting and any other members of a LiveRoom are not part of a character card.",
      ]
        .filter(Boolean)
        .join(" ");
    }
    return card;
  }

  NS.scraper = {
    currentCharacterId,
    isLabPage,
    readBearer,
    readUserId,
    scanCharacter,
    normalizePrompt,
    mergeCreator,
    harvestDefinition,
    parseSystemPrompt,
    findCompiled,
    describeFailures,
    promptTagNames,
    exampleDialogue,
    turnLines,
    dialogueArray,
    parseSections,
    hint: "Quick exports every field Emochi publishes, including the compiled personality and scenario when the character has them. Deep adds the creator's own definition when you're signed in.",
  };
})();
