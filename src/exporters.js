(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});

  const FIELD_LABELS = {
    description: "Description",
    personality: "Personality",
    scenario: "Scenario",
    greeting: "Greeting",
    altGreetings: "Alternate greeting",
    exampleDialogue: "Example dialogue",
  };

  function toBlocks(card) {
    const blocks = [];
    const f = card.fields || {};

    const pushField = (key, text) => {
      const parts = String(text || "")
        .split(/\r?\n(?:[ \t]*\r?\n)+/)
        .map((p) => p.trim())
        .filter(Boolean);
      parts.forEach((text, i) => {
        blocks.push({
          id: "field:" + key + ":" + i,
          kind: "field",
          field: key,
          label: FIELD_LABELS[key] || key,
          text,
        });
      });
    };

    pushField("greeting", f.greeting);
    (f.altGreetings || []).forEach((g, i) =>
      blocks.push({
        id: "alt:" + i,
        kind: "field",
        field: "altGreetings",
        label: FIELD_LABELS.altGreetings,
        text: g,
      }),
    );
    pushField("description", f.description);
    pushField("personality", f.personality);
    pushField("scenario", f.scenario);
    pushField("exampleDialogue", f.exampleDialogue);

    (card.lorebooks || []).forEach((book, bi) => {
      (Array.isArray(book.entries) ? book.entries : []).forEach((entry, ei) => {
        blocks.push({
          id: "lore:" + bi + ":" + ei,
          kind: "lorebook",
          bookIndex: bi,
          entryIndex: ei,
          label: entry.comment || (entry.keys || []).join(", ") || "Entry",
          keys: entry.keys || [],
          text: entry.content,
          entry,
        });
      });
    });

    return blocks;
  }

  const on = (block, included) => !included || included.has(block.id);

  function rebuild(card, blocks, included) {
    const fields = {
      description: [],
      personality: [],
      scenario: [],
      greeting: [],
      altGreetings: [],
      exampleDialogue: [],
    };
    const entries = [];
    for (const b of blocks) {
      if (!on(b, included)) continue;
      if (b.kind === "field") fields[b.field].push(b.text);
      else entries.push(b.entry);
    }
    return {
      name: card.name,
      creator: card.creator,
      avatarUrl: card.avatarUrl,
      nsfw: card.nsfw,
      tags: card.tags || [],
      description: fields.description.join("\n\n"),
      personality: fields.personality.join("\n\n"),
      scenario: fields.scenario.join("\n\n"),
      greeting: fields.greeting.join("\n\n"),
      altGreetings: fields.altGreetings,
      exampleDialogue: fields.exampleDialogue.join("\n\n"),
      entries,
    };
  }

  function tavernCardV2(card, blocks, included) {
    const c = rebuild(card, blocks, included);
    const book =
      c.entries.length > 0
        ? {
            name: c.name + " lorebook",
            entries: c.entries.map((e, i) => ({
              keys: e.keys || [],
              content: e.content || "",
              comment: e.comment || "",
              enabled: true,
              insertion_order: i,
              constant: !!e.constant,
              selective: e.selective !== false,
              extensions: {},
            })),
          }
        : undefined;
    return {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: c.name,
        description: c.description,
        personality: c.personality,
        scenario: c.scenario,
        first_mes: c.greeting,
        mes_example: c.exampleDialogue,
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        alternate_greetings: c.altGreetings || [],
        tags: c.tags || [],
        creator: c.creator || "",
        character_version: "",
        extensions: c.avatarUrl ? { avatar: c.avatarUrl } : {},
        ...(book ? { character_book: book } : {}),
      },
    };
  }

  function worldInfoEntries(sourceEntries) {
    const entries = {};
    sourceEntries.forEach((entry, index) => {
      entries[index] = {
        uid: index,
        key: entry.keys || [],
        keysecondary: [],
        comment: entry.comment || "",
        content: entry.content || "",
        constant: !!entry.constant,
        selective: entry.selective !== false,
        order: index,
        disable: false,
      };
    });
    return entries;
  }

  function lorebookJson(card, blocks, included) {
    const c = rebuild(card, blocks, included);
    return {
      name: c.name + " lorebook",
      entries: worldInfoEntries(c.entries),
    };
  }

  function lorebooksSeparate(card, blocks, included) {
    const books = card.lorebooks || [];
    const byBook = new Map();
    for (const b of blocks) {
      if (b.kind !== "lorebook" || !on(b, included)) continue;
      if (!byBook.has(b.bookIndex)) byBook.set(b.bookIndex, []);
      byBook.get(b.bookIndex).push(b.entry);
    }
    const out = [];
    for (const [bi, chosen] of byBook) {
      if (!chosen.length) continue;
      const src = books[bi] || {};
      const name = src.name || card.name + " lorebook";
      out.push({
        name,
        json: {
          name,
          description: src.description || "",
          entries: worldInfoEntries(chosen),
        },
      });
    }
    return out;
  }

  function janitorJson(card, blocks, included) {
    const c = rebuild(card, blocks, included);
    return {
      name: c.name,
      description: c.description,
      personality: c.personality,
      scenario: c.scenario,
      first_message: c.greeting,
      first_messages: [c.greeting, ...(c.altGreetings || [])].filter(Boolean),
      example_dialogs: c.exampleDialogue,
      is_nsfw: c.nsfw,
      creator_name: c.creator,
      tags: c.tags || [],
      scripts: c.entries.length
        ? [
            {
              type: "lorebook",
              title: c.name + " lorebook",
              entries: c.entries.map((e) => ({
                keys: e.keys || [],
                name: e.comment || "",
                content: e.content || "",
              })),
            },
          ]
        : [],
    };
  }

  function plainText(card, blocks, included) {
    const c = rebuild(card, blocks, included);
    const out = [];
    out.push("# " + c.name);
    if (c.tags && c.tags.length) out.push("Tags: " + c.tags.join(", "));
    out.push("");
    const section = (label, text) => {
      if (!text) return;
      out.push("## " + label);
      out.push(text.trim());
      out.push("");
    };
    section("Greeting", c.greeting);
    (c.altGreetings || []).forEach((g, i) => section("Alternate greeting " + (i + 1), g));
    section("Description", c.description);
    section("Personality", c.personality);
    section("Scenario", c.scenario);
    section("Example dialogue", c.exampleDialogue);
    if (c.entries.length) {
      out.push("## Lorebook (" + c.entries.length + " entries)");
      out.push("");
      c.entries.forEach((e, i) => {
        const title = e.comment || (e.keys || []).join(", ") || "Entry " + (i + 1);
        out.push("### " + title);
        if (e.keys && e.keys.length) out.push("Keys: " + e.keys.join(", "));
        out.push((e.content || "").trim());
        out.push("");
      });
    }
    return out.join("\n");
  }

  function slug(name) {
    const normalized = String(name || "character")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "");
    return [...normalized].slice(0, 60).join("") || "character";
  }

  NS.exporters = {
    toBlocks,
    rebuild,
    tavernCardV2,
    lorebookJson,
    lorebooksSeparate,
    janitorJson,
    plainText,
    slug,
    FIELD_LABELS,
  };
})();
