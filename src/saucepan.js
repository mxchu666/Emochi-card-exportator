// Saucepan.ai reader.
//
// Saucepan is a single-page app. Its API is same-origin under /api and behind an
// edge proxy, so the content script can call it directly with the page's own
// bearer token (kept in localStorage as `hallucination/auth_token`).
//
// Two read paths, and the difference matters:
//
//   * Public read, `GET /api/v2/companions/{id}` - no token needed. Carries the
//     name, tagline, tags, fandom, portrait id, counts, the provider policy and
//     the Description. The Description is not plain text: the server ships it as
//     a set of shuffled text shards, most of them decoys, and the client keeps
//     only the shards whose FNV-1a proof matches before sorting them by
//     `key ^ mask`. `decodeFragments` below is that exact routine, reverse
//     engineered from the bundle.
//   * Definition read, `GET /api/v1/companion/definition?companion_id=...` - needs
//     the token. Returns the creator's actual definition as titled sections, and
//     only when the creator left Definition Visibility open.
//
// A companion the signed-in user owns has a third path, `GET
// /api/v1/companion/editable`, which returns the raw editor record: the Core
// text, example dialogue, advanced prompt, formatting instructions and every
// starting scenario regardless of its access level.
//
// Proxy policy is `providers_profile` on the public record: `custom_and_vetted`
// (bring your own model), `vetted_only`, `internal_only`. It is reported, never
// used as a gate - a companion exports the same either way.
(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});

  const ORIGIN = "https://saucepan.ai";
  const TOKEN_KEY = "hallucination/auth_token";
  // The site stamps every request with this; without it the edge answers reset.
  const EDGE_HEADER = "cf-edge-token-8af3";
  const EDGE_VALUE = "e3b0c44298fc1c14";
  const TIMEOUT_MS = 20000;

  // Blank scenarios are stored as a sentinel so the editor can keep the slot.
  const BLANK_SCENARIO = "≠≠≠BLANK_SCENARIO≠≠≠";

  // Definition visibility is a bitfield. These are the four flags the profile
  // page reads when it decides which sections to show.
  const HIDDEN_CORE = 16;
  const HIDDEN_EXAMPLE = 8;
  const HIDDEN_ADVANCED = 4;
  const HIDDEN_FORMATTING = 2;

  const PROVIDERS = {
    custom_and_vetted: "custom and vetted models",
    vetted_only: "vetted models only",
    internal_only: "internal models only (no external providers)",
  };

  const s = (v) => (typeof v === "string" ? v.trim() : "");

  function currentCharacterId() {
    if (typeof location === "undefined") return null;
    const path = location.pathname.match(
      /\/(?:companion|editor)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    if (path) return path[1];
    const query = new URLSearchParams(location.search);
    return query.get("companion_id") || query.get("id") || null;
  }

  function readToken() {
    try {
      return s(localStorage.getItem(TOKEN_KEY));
    } catch {
      return "";
    }
  }

  // --- fragment decoding -----------------------------------------------------

  const rotl = (value, bits) => ((value << bits) | (value >>> (32 - bits))) >>> 0;

  // FNV-1a over the shard text, seeded by the mask and the shard slot rotated
  // into the base. A decoy shard carries a random proof and fails here.
  function fragmentProof(mask, key, text) {
    let hash = (2166136261 ^ rotl(mask, 7) ^ rotl(key, 13)) >>> 0;
    const bytes = new TextEncoder().encode(String(text || ""));
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash;
  }

  function decodeFragments(set) {
    if (!set || !Array.isArray(set.fragments)) return "";
    const mask = Number(set.mask) >>> 0;
    return set.fragments
      .filter((f) => {
        if (!f || typeof f.text !== "string") return false;
        const slot = (Number(f.key) ^ mask) >>> 0;
        return fragmentProof(mask, slot, f.text) === (Number(f.proof) >>> 0);
      })
      .sort((a, b) => (Number(a.key) ^ mask) - (Number(b.key) ^ mask))
      .map((f) => f.text)
      .join("");
  }

  // --- transport -------------------------------------------------------------

  function apiFetch(path, token) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      let ctrl = null;
      try {
        ctrl = new AbortController();
      } catch {
        ctrl = null;
      }
      const timer = setTimeout(() => {
        if (ctrl) ctrl.abort();
        finish({ ok: false, status: 0, error: "timeout" });
      }, TIMEOUT_MS);

      const headers = { Accept: "application/json", [EDGE_HEADER]: EDGE_VALUE };
      if (token) headers.Authorization = "Bearer " + token;

      fetch(ORIGIN + path, {
        headers,
        credentials: "include",
        signal: ctrl ? ctrl.signal : undefined,
      })
        .then(async (res) => {
          const text = await res.text();
          let body = null;
          try {
            body = JSON.parse(text);
          } catch {
            body = null;
          }
          clearTimeout(timer);
          finish({ ok: res.ok, status: res.status, body });
        })
        .catch((error) => {
          clearTimeout(timer);
          finish({ ok: false, status: 0, error: String(error).slice(0, 80) });
        });
    });
  }

  // --- mapping ---------------------------------------------------------------

  function publicRecord(body) {
    if (!body || typeof body !== "object") return null;
    const inner = body.companion;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner;
    if (body.id && (body.name || body.display_name || body.full_description_fragments)) return body;
    return null;
  }

  // The definition route answers `{sections: [{title, content}]}`. The titles are
  // the four editor blocks; anything unrecognised is kept rather than dropped.
  function definitionSections(body) {
    const out = { core: "", example: "", advanced: "", formatting: "", other: [] };
    const list = body && Array.isArray(body.sections) ? body.sections : [];
    for (const section of list) {
      const title = s(section && section.title).toLowerCase();
      const content = s(section && section.content);
      if (!content) continue;
      if (title === "companion core") out.core = content;
      else if (title === "example dialogue") out.example = content;
      else if (title === "advanced prompt") out.advanced = content;
      else if (title === "response formatting instructions") out.formatting = content;
      else out.other.push(section.title ? section.title + "\n" + content : content);
    }
    return out;
  }

  function scenarioList(record) {
    const list = [];
    const raw = Array.isArray(record.starting_scenarios) ? record.starting_scenarios : null;
    if (raw) {
      for (const scenario of raw) {
        if (!scenario || typeof scenario !== "object") continue;
        const message = s(scenario.message);
        if (!message || message === BLANK_SCENARIO) continue;
        list.push({ title: s(scenario.title), message });
      }
      return list;
    }
    const fragments = Array.isArray(record.starting_scenarios_fragments)
      ? record.starting_scenarios_fragments
      : [];
    for (const scenario of fragments) {
      if (!scenario || typeof scenario !== "object") continue;
      const message = s(decodeFragments(scenario.message));
      if (!message || message === BLANK_SCENARIO) continue;
      list.push({ title: s(scenario.title), message });
    }
    return list;
  }

  function portraitUrl(record, imageId) {
    if (!imageId) return "";
    // The page renders the portrait itself; its <img> src is the resolved URL and
    // is more reliable than any guess at the image route.
    try {
      if (typeof document !== "undefined") {
        const match = document.querySelector('img[src*="' + imageId + '"]');
        if (match && match.src) return match.src;
      }
    } catch {}
    // The public CDN path the page's own og:image points at. No token, no cookies.
    return ORIGIN + "/cdn/" + encodeURIComponent(imageId) + "/card";
  }

  function normalizeCompanion(record, definition, editable) {
    const pub = record && typeof record === "object" ? record : {};
    const own = editable && typeof editable === "object" ? editable : null;
    const def = definitionSections(definition);
    const pick = (ownKey, publicKey) => {
      if (own && s(own[ownKey])) return s(own[ownKey]);
      return s(pub[publicKey]);
    };

    const imageId =
      s(pub.image && (pub.image.id || pub.image.image_id)) ||
      s(own && own.image && own.image.id);

    const name = pick("display_name", "display_name") || pick("name", "name") || "Imported character";
    const tagline = s(pub.short_description) || s(own && own.short_description);
    const description =
      (own && s(own.full_description)) || s(decodeFragments(pub.full_description_fragments));
    const core = (own && s(own.card)) || def.core;
    const example = (own && s(own.example_dialogue)) || def.example;
    const advanced = (own && s(own.advanced_prompt)) || def.advanced;
    const formatting = (own && s(own.formatting_instructions)) || def.formatting;

    const scenarios = scenarioList(own || pub);
    const greeting = scenarios.length ? scenarios[0].message : "";
    const altGreetings = scenarios.slice(1).map((scenario) => scenario.message);

    // Tavern has one description slot and one personality slot. The tagline is
    // what the site shows under the name, so it leads the description instead of
    // being dropped; the two prompt blocks ride at the end of personality where
    // the panel can toggle them off paragraph by paragraph.
    const descriptionParts = [tagline, description].filter(Boolean);
    const personalityParts = [
      core,
      advanced ? "## Advanced Prompt\n" + advanced : "",
      formatting ? "## Formatting Instructions\n" + formatting : "",
      ...def.other,
    ].filter(Boolean);

    const tags = [];
    for (const tag of Array.isArray(pub.tags) ? pub.tags : []) {
      const value = typeof tag === "string" ? tag : s(tag && tag.name);
      if (value) tags.push(value);
    }
    for (const fandom of Array.isArray(pub.fandom_tags) ? pub.fandom_tags : []) {
      const value = typeof fandom === "string" ? fandom : s(fandom && fandom.display_name);
      if (value) tags.push(value);
    }

    const providers = s(pub.providers_profile) || s(own && own.external_model_policy);

    const card = {
      id: s(pub.id) || currentCharacterId() || "",
      name,
      creator: s(pub.author_handle) || "",
      avatarUrl: portraitUrl(pub, imageId),
      nsfw: !!(pub.sus || pub.very_sus),
      tags: [...new Set(tags)],
      fields: {
        description: descriptionParts.join("\n\n"),
        personality: personalityParts.join("\n\n"),
        scenario: "",
        greeting,
        altGreetings,
        exampleDialogue: example,
      },
      scriptRefs: [],
      lorebooks: [],
      failedLorebooks: 0,
      sourceLabel: "Saucepan.ai card",
    };

    const visibility = [`Visibility: ${s(pub.access_level) || "unknown"}`];
    if (providers) visibility.push(`Providers: ${PROVIDERS[providers] || providers}`);
    card.note = visibility.join(" · ");

    const hidden = Number(pub.hidden_fields) >>> 0;
    const closed = [];
    if (!core && (hidden & HIDDEN_CORE)) closed.push("Companion Core");
    if (!example && (hidden & HIDDEN_EXAMPLE)) closed.push("example dialogue");
    if (!advanced && (hidden & HIDDEN_ADVANCED)) closed.push("advanced prompt");
    if (!formatting && (hidden & HIDDEN_FORMATTING)) closed.push("formatting instructions");

    if (closed.length) {
      card.hint =
        "The creator keeps " +
        (closed.length === 1 ? closed[0] : closed.slice(0, -1).join(", ") + " and " + closed[closed.length - 1]) +
        " behind Definition Visibility, so Saucepan doesn't serve them to the page. Everything the site publishes is on the card.";
    }
    if (!greeting) {
      const said = "No starting message came through: this companion's openings aren't public.";
      card.hint = card.hint ? card.hint + " " + said : said;
    }
    return card;
  }

  // --- lorebooks -------------------------------------------------------------

  function normalizeLorebookEntry(chapter) {
    const record = chapter && typeof chapter === "object" ? chapter : {};
    const title = s(record.title) || s(record.name);
    // Chapters store their body in `text`; `content` is the guess that keeps this
    // working if the field is renamed on a later release.
    const content = s(record.text) || s(record.content);
    return {
      // A chapter has no trigger list, so its own title is the trigger. A chapter
      // with no title is left constant so it still reaches the prompt.
      keys: title ? [title] : [],
      content,
      comment: title,
      constant: !title,
      selective: true,
    };
  }

  async function fetchLorebooks(id, token, onProgress) {
    const books = [];
    const listed = await apiFetch("/api/v2/companions/" + encodeURIComponent(id) + "/lorebooks", token);
    if (!listed.ok || !listed.body) return books;
    const list = Array.isArray(listed.body.lorebooks)
      ? listed.body.lorebooks
      : Array.isArray(listed.body)
        ? listed.body
        : [];
    let done = 0;
    for (const book of list) {
      const bookId = s(book && book.id);
      if (!bookId) continue;
      if (onProgress) {
        onProgress("Reading lorebook " + ++done + "/" + list.length + "...");
      }
      const reply = await apiFetch(
        "/api/v2/lorebooks/" + encodeURIComponent(bookId) + "/chapters",
        token,
      );
      if (!reply.ok || !reply.body) continue;
      const chapters = Array.isArray(reply.body.chapters)
        ? reply.body.chapters
        : Array.isArray(reply.body)
          ? reply.body
          : [];
      const entries = chapters.map(normalizeLorebookEntry).filter((entry) => entry.content);
      if (entries.length) {
        books.push({
          name: s(book.name) || s(book.title) || "Lorebook",
          description: s(book.description) || s(book.short_description),
          entries,
        });
      }
    }
    return books;
  }

  // --- scan ------------------------------------------------------------------

  async function scanCharacter(opts = {}) {
    const id = s(opts.id) || currentCharacterId();
    if (!id) {
      const err = new Error("no-character");
      err.friendly =
        "Open a Saucepan companion page first (its URL should look like saucepan.ai/companion/...).";
      throw err;
    }
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    if (onProgress) onProgress("Reading Saucepan.ai...");

    const token = readToken();
    const detail = await apiFetch("/api/v2/companions/" + encodeURIComponent(id), token);
    const record = publicRecord(detail.body);
    if (!record) {
      const err = new Error("no-character");
      err.friendly =
        detail.status === 404
          ? "Saucepan couldn't find that companion (it may have been deleted or made private)."
          : "Saucepan didn't return this companion. Reload the page, wait for it to finish loading, then scan again. (HTTP " +
            (detail.status || detail.error || "no answer") +
            ")";
      throw err;
    }

    const hidden = Number(record.hidden_fields) >>> 0;
    let definition = null;
    let editable = null;
    if (token) {
      if (!(hidden & (HIDDEN_CORE | HIDDEN_EXAMPLE | HIDDEN_ADVANCED | HIDDEN_FORMATTING)) || record.open_definition) {
        if (onProgress) onProgress("Reading the creator's definition...");
        const reply = await apiFetch(
          "/api/v1/companion/definition?companion_id=" + encodeURIComponent(id),
          token,
        );
        if (reply.ok && reply.body) definition = reply.body;
      }
      // Owned or co-owned companions answer here with the raw editor record. A
      // 403 is the normal answer for someone else's companion, not a failure.
      const own = await apiFetch(
        "/api/v1/companion/editable?id=" + encodeURIComponent(id),
        token,
      );
      if (own.ok && own.body) {
        editable = own.body.companion && typeof own.body.companion === "object" ? own.body.companion : own.body;
      }
    }

    const card = normalizeCompanion(record, definition, editable);
    if (opts.deep) {
      const books = await fetchLorebooks(id, token, onProgress);
      card.lorebooks = books;
      card.failedLorebooks = Math.max(0, (Number(record.lorebook_count) || 0) - books.length);
      if (!token && Number(record.lorebook_count)) {
        const said = "Saucepan needs you signed in to read this companion's lorebooks.";
        card.hint = card.hint ? card.hint + " " + said : said;
      }
    }
    return card;
  }

  NS.scraper = {
    currentCharacterId,
    readToken,
    decodeFragments,
    fragmentProof,
    definitionSections,
    scenarioList,
    normalizeCompanion,
    normalizeLorebookEntry,
    scanCharacter,
    hint: "Reads the Saucepan companion the page is showing: name, tagline, description, tags, starting message and, when the creator left it open, the full definition. Deep adds its lorebooks.",
  };
})();
