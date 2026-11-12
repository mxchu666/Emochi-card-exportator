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
    gender: "Gender",
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
    // No Tavern field holds a gender, so it rides at the top of the description
    // with its own label - it can be toggled off like any other block.
    if (card.gender) {
      blocks.push({
        id: "field:gender:0",
        kind: "field",
        field: "description",
        label: FIELD_LABELS.gender,
        text: "Gender: " + card.gender,
      });
    }
    pushField("description", f.description);
    pushField("personality", f.personality);
    pushField("scenario", f.scenario);
    pushField("exampleDialogue", f.exampleDialogue);

    // Some sources echo the description into the personality slot - either the
    // creator typed the same text in both fields or the site derives one from the
    // other. Exported as-is, the same paragraph lands in both Tavern fields and
    // every prompt carries it twice. A personality paragraph the description
    // already holds is the duplicate, so it goes, silently: nothing was lost.
    // shortcut: exact paragraph matches only; a partial echo is left alone until a
    // source is seen doing it.
    const norm = (v) => String(v).toLowerCase().replace(/\s+/g, " ").trim();
    const described = new Set(
      blocks.filter((b) => b.kind === "field" && b.field === "description").map((b) => norm(b.text)),
    );
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const b = blocks[i];
      if (b.kind === "field" && b.field === "personality" && described.has(norm(b.text))) {
        blocks.splice(i, 1);
      }
    }

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

  // SillyTavern, Tavo and friends read a PNG card out of a "chara" tEXt chunk.
  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function pngChunk(type, payload) {
    const chunk = new Uint8Array(payload.length + 12);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, payload.length);
    chunk.set(new TextEncoder().encode(type), 4);
    chunk.set(payload, 8);
    view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)));
    return chunk;
  }

  async function avatarPngBytes(name, avatarUrl) {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't create the PNG canvas.");

    function placeholder() {
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, "#303a54");
      gradient.addColorStop(1, "#8a6a91");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      const initials = String(name || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => [...part][0] || "")
        .join("")
        .toUpperCase();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 140px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials || "?", size / 2, size / 2);
    }

    const encode = () =>
      new Promise((resolve, reject) => {
        try {
          canvas.toBlob(resolve, "image/png");
        } catch (e) {
          reject(e);
        }
      });

    placeholder();
    if (avatarUrl) {
      try {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.referrerPolicy = "no-referrer";
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("avatar timeout")), 5000);
          image.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          image.onerror = () => {
            clearTimeout(timer);
            reject(new Error("avatar failed"));
          };
          image.src = avatarUrl;
        });
        ctx.clearRect(0, 0, size, size);
        const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
        ctx.drawImage(
          image,
          (size - image.naturalWidth * scale) / 2,
          (size - image.naturalHeight * scale) / 2,
          image.naturalWidth * scale,
          image.naturalHeight * scale,
        );
      } catch {
        // A CDN that refuses the cross-origin read leaves the initials tile in place.
        ctx.clearRect(0, 0, size, size);
        placeholder();
      }
    }

    let blob;
    try {
      blob = await encode();
    } catch {
      // Tainted canvas: drop the avatar and encode the flat tile instead.
      ctx.clearRect(0, 0, size, size);
      placeholder();
      blob = await encode();
    }
    if (!blob) throw new Error("Couldn't build the PNG.");
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function tavernPngV2(card, blocks, included) {
    const cardData = tavernCardV2(card, blocks, included);
    const png = await avatarPngBytes(card.name, card.avatarUrl);
    if (String.fromCharCode(...png.subarray(12, 16)) !== "IHDR") {
      throw new Error("The generated image is not a PNG.");
    }
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const insertAt = 8 + 12 + view.getUint32(8);
    const encoded = bytesToBase64(new TextEncoder().encode(JSON.stringify(cardData)));
    const metadata = pngChunk("tEXt", new TextEncoder().encode("chara\0" + encoded));
    const out = new Uint8Array(png.length + metadata.length);
    out.set(png.subarray(0, insertAt), 0);
    out.set(metadata, insertAt);
    out.set(png.subarray(insertAt), insertAt + metadata.length);
    return new Blob([out], { type: "image/png" });
  }

  NS.exporters = {
    toBlocks,
    rebuild,
    tavernCardV2,
    tavernPngV2,
    lorebookJson,
    lorebooksSeparate,
    janitorJson,
    plainText,
    slug,
    FIELD_LABELS,
  };
})();
