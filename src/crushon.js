// Crushon.ai reader.
//
// Crushon is a client-rendered app behind a bot wall, so the only reliable source
// is what the page itself already fetched: `intercept.js` collects those JSON
// responses, plus whatever Next.js server-rendered. The reader scores every
// object in that pile by how many known field names it carries and maps the
// winner, which survives the field renames the site does between releases.
(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});
  const H = NS.harvest;

  const s = (v) => (typeof v === "string" ? v.trim() : "");

  function currentCharacterId() {
    if (typeof location === "undefined") return null;
    const path = location.pathname.match(/\/character\/([A-Za-z0-9_-]{4,})/);
    if (path) return path[1];
    const query = new URLSearchParams(location.search);
    return query.get("characterId") || query.get("id") || null;
  }

  // Names differ per release, so each card field accepts the spellings seen in
  // the wild. The list is deliberately wide: a miss here costs the whole field.
  const KEYS = [
    "name",
    "title",
    "description",
    "personality",
    "scenario",
    "firstMessage",
    "first_mes",
    "greeting",
    "exampleDialogue",
    "exampleConversation",
    "avatar",
    "avatarUrl",
    "tags",
  ];

  const AVATAR_KEYS = ["avatar", "avatarUrl", "avatarURL", "avatar_url", "image", "imageUrl", "coverUrl"];
  const GREETING_KEYS = ["firstMessage", "first_mes", "greeting", "firstMessageText", "openingMessage"];
  const EXAMPLE_KEYS = ["exampleDialogue", "exampleDialogs", "exampleConversation", "mes_example", "dialogues"];
  const DESCRIPTION_KEYS = ["description", "introduction", "intro", "profile", "tagline"];

  function resolveUrl(value) {
    const raw = s(value);
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw[0] === "/") return "https://crushon.ai" + raw;
    return "";
  }

  function avatarUrl(record) {
    const value = H ? H.firstValue(record, AVATAR_KEYS) : "";
    if (typeof value === "string") return resolveUrl(value);
    if (value && typeof value === "object") {
      return resolveUrl(H.firstString(value, ["url", "src", "path", "fileName", "filename"]));
    }
    return "";
  }

  // Talk turns, in the same two shapes the other readers handle.
  function turnLines(turn) {
    if (typeof turn === "string") return turn.trim() ? ["{{char}}: " + turn.trim()] : [];
    if (!turn || typeof turn !== "object") return [];
    const mine = s(turn.user) || s(turn.human) || s(turn.question);
    const theirs = s(turn.ai) || s(turn.char) || s(turn.assistant) || s(turn.answer);
    if (mine || theirs) {
      return [mine ? "{{user}}: " + mine : "", theirs ? "{{char}}: " + theirs : ""].filter(Boolean);
    }
    const content = s(turn.content) || s(turn.text) || s(turn.message);
    if (!content) return [];
    const role = (s(turn.role) || s(turn.speaker) || (turn.isUser ? "user" : "")).toLowerCase();
    const prefix = role === "user" || role === "human" ? "{{user}}" : "{{char}}";
    return [prefix + ": " + content];
  }

  function dialogueText(value) {
    if (typeof value === "string") return value.trim();
    const list = Array.isArray(value)
      ? value
      : value && typeof value === "object" && Array.isArray(value.dialogue)
        ? value.dialogue
        : null;
    if (!list) return "";
    return list
      .map(turnLines)
      .reduce((acc, lines) => acc.concat(lines), [])
      .join("\n\n")
      .trim();
  }

  function tagList(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((tag) => (typeof tag === "string" ? tag : s(tag && (tag.name || tag.tagName || tag.label))))
      .filter(Boolean);
  }

  function normalizeCharacter(record) {
    const r = record && typeof record === "object" ? record : {};
    const examples = dialogueText(H ? H.firstValue(r, EXAMPLE_KEYS) : s(r.exampleDialogue));

    const card = {
      id: s(r.id) || s(r.characterId) || s(r.uuid) || currentCharacterId() || "",
      name: s(r.name) || s(r.characterName) || s(r.title) || "Imported character",
      creator:
        s(r.creatorName) ||
        s(r.creator) ||
        s(r.username) ||
        s(r.user && (r.user.name || r.user.username)) ||
        "",
      avatarUrl: avatarUrl(r),
      nsfw: !!r.nsfw,
      tags: tagList(r.tags),
      fields: {
        description: H ? H.firstString(r, DESCRIPTION_KEYS) : s(r.description),
        personality: s(r.personality),
        scenario: s(r.scenario),
        greeting: H ? H.firstString(r, GREETING_KEYS) : s(r.greeting),
        altGreetings: [],
        exampleDialogue: examples,
      },
      scriptRefs: [],
      lorebooks: [],
      failedLorebooks: 0,
      sourceLabel: "Crushon.ai card",
    };

    if (!card.fields.personality && !card.fields.greeting) {
      card.hint =
        "Crushon didn't expose this character's definition to the page, so the card carries what its public payload shows. Reopen the character page, let it finish loading, then scan again.";
    }
    return card;
  }

  async function scanCharacter(opts = {}) {
    const id = s(opts.id) || currentCharacterId();
    if (!id) {
      const err = new Error("no-character");
      err.friendly =
        "Open a Crushon character page first (its URL should look like crushon.ai/character/...).";
      throw err;
    }
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    if (onProgress) onProgress("Reading Crushon.ai...");

    const found = H ? H.bestCharacter(H.roots(), KEYS) : null;
    if (!found) {
      const err = new Error("no-character");
      err.friendly =
        "Crushon didn't hand this character to the page. Reload the character page, wait for it to finish loading, then scan again.";
      throw err;
    }
    return normalizeCharacter(found);
  }

  NS.scraper = {
    currentCharacterId,
    normalizeCharacter,
    dialogueText,
    tagList,
    scanCharacter,
    hint: "Reads the character Crushon renders on its page: name, description, personality, greeting, tags and example dialogue.",
  };
})();
