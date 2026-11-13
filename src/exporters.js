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
    // A JSON card has no image slot in the spec, so the picture rides as a data
    // URI in the same field the frontends already read for a remote one. Tavo
    // only shows an avatar it can resolve; a data URI always resolves.
    const avatar = typeof card.avatarDataUri === "string" ? card.avatarDataUri : "";
    const picture = avatar || c.avatarUrl || "";
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
    const data = {
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
      ...(picture ? { avatar: picture } : {}),
      extensions: picture ? { avatar: picture } : {},
      ...(book ? { character_book: book } : {}),
    };
    // V1 mirror. A V2/V3 reader ignores these keys; a V1 reader - Agnai's older
    // importer, Pygmalion, the Gradio card loaders - ignores `data` and reads
    // only the flat fields. Both shapes in one file costs a few hundred bytes
    // and removes a whole class of "the text arrived, the character did not".
    return {
      spec: "chara_card_v2",
      spec_version: "2.0",
      name: data.name,
      description: data.description,
      personality: data.personality,
      scenario: data.scenario,
      first_mes: data.first_mes,
      mes_example: data.mes_example,
      ...(picture ? { avatar: picture } : {}),
      data,
    };
  }

  // V3 is V2 with a different envelope; every reader that understands V3 reads
  // V2 too, and a few only look at the `ccv3` PNG chunk, so both are written.
  function tavernCardV3(card, blocks, included) {
    const v2 = tavernCardV2(card, blocks, included);
    const now = Math.floor(Date.now() / 1000);
    return {
      spec: "chara_card_v3",
      spec_version: "3.0",
      name: v2.name,
      description: v2.description,
      personality: v2.personality,
      scenario: v2.scenario,
      first_mes: v2.first_mes,
      mes_example: v2.mes_example,
      ...(v2.avatar ? { avatar: v2.avatar } : {}),
      data: {
        ...v2.data,
        group_only_greetings: [],
        creation_date: now,
        modification_date: now,
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

  const AVATAR_SIZE = 512;

  function paintPlaceholder(ctx, size, name) {
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

  function bytesFromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // The worker fetch, not an `<img crossOrigin>`: the CDNs these readers take
  // portraits from omit `Access-Control-Allow-Origin` (image-cdn.flowgpt.com and
  // cdn.mokio.ai both do), so a CORS-mode image load fails before a pixel
  // arrives and the card exports with the initials tile instead of the portrait.
  function requestImage(url) {
    return new Promise((resolve) => {
      const runtime = typeof chrome !== "undefined" && chrome.runtime;
      if (!runtime || typeof runtime.sendMessage !== "function") return resolve(null);
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 15000);
      try {
        runtime.sendMessage({ type: "jaix:image", url }, (reply) => {
          clearTimeout(timer);
          if (runtime.lastError || !reply || !reply.ok || !reply.base64) return finish(null);
          finish({ base64: reply.base64, mime: reply.mime || "image/png" });
        });
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    });
  }

  async function drawTile(name, bitmap) {
    const size = AVATAR_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't create the PNG canvas.");

    paintPlaceholder(ctx, size, name);
    let drawn = false;
    if (bitmap && bitmap.width && bitmap.height) {
      ctx.clearRect(0, 0, size, size);
      const scale = Math.max(size / bitmap.width, size / bitmap.height);
      ctx.drawImage(
        bitmap,
        (size - bitmap.width * scale) / 2,
        (size - bitmap.height * scale) / 2,
        bitmap.width * scale,
        bitmap.height * scale,
      );
      drawn = true;
    }

    const blob = await new Promise((resolve) => {
      try {
        canvas.toBlob(resolve, "image/png");
      } catch {
        resolve(null);
      }
    });
    if (!blob) throw new Error("Couldn't build the PNG.");

    let dataUri = "";
    if (drawn) {
      try {
        // JPEG keeps the JSON near 40 KB where a PNG tile costs ~300 KB.
        dataUri = canvas.toDataURL("image/jpeg", 0.9);
      } catch {
        dataUri = "";
      }
    }
    return { png: new Uint8Array(await blob.arrayBuffer()), dataUri };
  }

  // Once per card: pull the portrait through the worker, decode it off the
  // document, and keep both the PNG tile and the JSON data URI on the card.
  async function prepareAvatar(card) {
    if (!card || typeof card !== "object" || card.avatarReady) return card;
    card.avatarReady = true;
    const url = typeof card.avatarUrl === "string" ? card.avatarUrl.trim() : "";
    if (!url) return card;
    const got = await requestImage(url);
    if (!got) return card;
    try {
      const bytes = bytesFromBase64(got.base64);
      const bitmap = await createImageBitmap(new Blob([bytes], { type: got.mime }));
      try {
        const tile = await drawTile(card.name, bitmap);
        card.avatarPng = tile.png;
        card.avatarDataUri = tile.dataUri;
      } finally {
        try {
          bitmap.close();
        } catch {}
      }
    } catch {
      // Undecodable bytes fall through to the initials tile at export time.
    }
    return card;
  }

  async function avatarPngBytes(name, card) {
    if (card && card.avatarPng) return card.avatarPng;
    return (await drawTile(name, null)).png;
  }

  async function tavernPngV2(card, blocks, included) {
    await prepareAvatar(card);
    const cardData = tavernCardV2(card, blocks, included);
    const png = await avatarPngBytes(card.name, card);
    if (String.fromCharCode(...png.subarray(12, 16)) !== "IHDR") {
      throw new Error("The generated image is not a PNG.");
    }
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    // Chub writes the card chunk between IHDR and IDAT, and its "download the
    // PNG" path is the one Tavo documents for importing. SillyTavern writes
    // between IDAT and IEND, and its reader - plus every fork of it - scans the
    // whole file, so either position works there. Between IHDR and IDAT is the
    // position a reader that stops at the first IDAT can still see, so that is
    // where both chunks go.
    const insertAt = 8 + 12 + view.getUint32(8);
    // `chara` (V2) then `ccv3` (V3), base64, in that order. A reader that knows
    // only V3 looks for `ccv3` and answers "no PNG metadata" when it is absent,
    // and a reader that knows only V2 looks for `chara`.
    const encoder = new TextEncoder();
    const chunks = [
      pngChunk(
        "tEXt",
        encoder.encode("chara\0" + bytesToBase64(encoder.encode(JSON.stringify(cardData)))),
      ),
      pngChunk(
        "tEXt",
        encoder.encode("ccv3\0" + bytesToBase64(encoder.encode(JSON.stringify(tavernCardV3(card, blocks, included))))),
      ),
    ];
    const extra = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const out = new Uint8Array(png.length + extra);
    out.set(png.subarray(0, insertAt), 0);
    let at = insertAt;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    out.set(png.subarray(insertAt), at);
    return new Blob([out], { type: "image/png" });
  }

  // Reads back the chunks of the file that was just built. The panel prints the
  // result, so a reader that still says "no PNG metadata" can be told apart from
  // a file that never carried the chunks in the first place.
  function describePng(bytes) {
    const chunks = [];
    const text = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 8;
    while (at + 8 <= bytes.length) {
      const length = view.getUint32(at);
      const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
      chunks.push(type);
      if (type === "tEXt" || type === "iTXt" || type === "zTXt") {
        const payload = bytes.subarray(at + 8, at + 8 + length);
        const nul = payload.indexOf(0);
        if (nul > 0) text.push(String.fromCharCode(...payload.subarray(0, nul)));
      }
      if (type === "IEND") break;
      at += 12 + length;
    }
    return { chunks, text };
  }

  NS.exporters = {
    toBlocks,
    rebuild,
    tavernCardV2,
    tavernCardV3,
    tavernPngV2,
    describePng,
    prepareAvatar,
    lorebookJson,
    lorebooksSeparate,
    janitorJson,
    plainText,
    slug,
    FIELD_LABELS,
  };
})();
