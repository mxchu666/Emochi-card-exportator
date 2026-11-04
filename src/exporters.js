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
    definition: "Definition",
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
    pushField("definition", f.definition);

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
      definition: [],
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
      definition: fields.definition.join("\n\n"),
      sourceUrl: card.sourceUrl || "",
      entries,
    };
  }

 function tavernCardV2(card, blocks, included) {
  const c = rebuild(card, blocks, included);

  const combinedDescription = [
    c.description,
    c.definition ? "[Definition]\n" + c.definition : ""
  ]
    .filter(Boolean)
    .join("\n\n");

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
            extensions: {}
          }))
        }
      : undefined;

  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: c.name,
      description: combinedDescription,
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
      character_version: "1.0",
      extensions: {
        emochi_card_exporter: {
          definition: c.definition || "",
          source_url: c.sourceUrl || "",
          avatar_url: c.avatarUrl || ""
        }
      },
      ...(book ? { character_book: book } : {})
    }
  };
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
    section("Definition", c.definition);
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
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(payload.length + 12);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, payload.length);
  chunk.set(typeBytes, 4);
  chunk.set(payload, 8);
  view.setUint32(
    chunk.length - 4,
    crc32(chunk.subarray(4, chunk.length - 4))
  );

  return chunk;
}

async function makeAvatarPngBytes(name, avatarUrl) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el PNG.");

  function drawPlaceholder() {
    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, "#303a54");
    gradient.addColorStop(1, "#8a6a91");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);

    const initials = String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] || "")
      .join("")
      .toUpperCase();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 140px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials || "?", 256, 256);
  }

  drawPlaceholder();

  if (avatarUrl) {
    try {
      const image = new Image();

      // Solicita una imagen sin credenciales. Si el servidor no permite CORS,
      // se conserva la imagen genérica.
      if (/^https?:/i.test(avatarUrl)) {
        image.crossOrigin = "anonymous";
        image.referrerPolicy = "no-referrer";
      }

      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Timeout de imagen")),
          5000
        );

        image.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        image.onerror = () => {
          clearTimeout(timer);
          reject(new Error("No se pudo cargar el avatar"));
        };
        image.src = avatarUrl;
      });

      ctx.clearRect(0, 0, 512, 512);
      const scale = Math.max(
        512 / image.naturalWidth,
        512 / image.naturalHeight
      );
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;

      ctx.drawImage(
        image,
        (512 - width) / 2,
        (512 - height) / 2,
        width,
        height
      );
    } catch {
      drawPlaceholder();
    }
  }

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("No se pudo generar el PNG.");

  return new Uint8Array(await blob.arrayBuffer());
}

async function tavernPngV2(card, blocks, included) {
  const cardData = tavernCardV2(card, blocks, included);
  const png = await makeAvatarPngBytes(card.name, card.avatarUrl);

  if (String.fromCharCode(...png.subarray(12, 16)) !== "IHDR") {
    throw new Error("La imagen generada no es un PNG válido.");
  }

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const ihdrLength = view.getUint32(8);
  const insertAt = 8 + 12 + ihdrLength;

  const cardBase64 = bytesToBase64(
    new TextEncoder().encode(JSON.stringify(cardData))
  );
  const textPayload = new TextEncoder().encode("chara\0" + cardBase64);
  const metadataChunk = pngChunk("tEXt", textPayload);

  const result = new Uint8Array(png.length + metadataChunk.length);
  result.set(png.subarray(0, insertAt), 0);
  result.set(metadataChunk, insertAt);
  result.set(png.subarray(insertAt), insertAt + metadataChunk.length);

  return new Blob([result], { type: "image/png" });
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
    FIELD_LABELS
  };
})();
