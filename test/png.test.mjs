import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "exporters.js"), "utf8");
const win = {};
new Function("window", src)(win);
const X = win.JAIX.exporters;

// Smallest valid PNG: signature, IHDR, IDAT, IEND.
const ONE_PIXEL_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function stubCanvas() {
  const ctx = {
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    fillText() {},
    clearRect() {},
    drawImage() {},
    set fillStyle(v) {},
    set font(v) {},
    set textAlign(v) {},
    set textBaseline(v) {},
  };
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob(callback) {
      callback(new Blob([ONE_PIXEL_PNG], { type: "image/png" }));
    },
  };
}

function readChunks(buffer) {
  const chunks = [];
  let at = 8;
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString("ascii", at + 4, at + 8);
    const payload = buffer.subarray(at + 8, at + 8 + length);
    const crc = buffer.readUInt32BE(at + 8 + length);
    chunks.push({ type, payload, crcOk: crc === zlib.crc32(buffer.subarray(at + 4, at + 8 + length)) });
    at += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}

test("tavernPngV2 writes chara and ccv3 tEXt chunks after IHDR", async () => {
  const hadDocument = Object.hasOwn(globalThis, "document");
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => stubCanvas() };

  try {
    const card = {
      name: "Aveline",
      creator: "storyweaver",
      avatarUrl: "",
      nsfw: false,
      tags: ["fantasy"],
      fields: { description: "A royal historian.", greeting: "You are late." },
      lorebooks: [],
    };
    const out = new Uint8Array(await (await X.tavernPngV2(card, X.toBlocks(card), null)).arrayBuffer());

    // signature + IHDR (8 + 25 bytes) must survive untouched
    assert.deepEqual(out.subarray(0, 33), ONE_PIXEL_PNG.subarray(0, 33));
    assert.equal(Buffer.from(out.subarray(12, 16)).toString("ascii"), "IHDR");

    const chunks = readChunks(Buffer.from(out));
    assert.deepEqual(
      chunks.map((chunk) => chunk.type),
      ["IHDR", "tEXt", "tEXt", "IDAT", "IEND"],
    );
    assert.ok(chunks.every((chunk) => chunk.crcOk), "every chunk CRC matches zlib.crc32");

    const [v2, v3] = chunks.filter((chunk) => chunk.type === "tEXt").map((chunk) => {
      const [keyword, ...rest] = chunk.payload.toString("latin1").split("\0");
      return { keyword, card: JSON.parse(Buffer.from(rest.join("\0"), "base64").toString("utf8")) };
    });

    assert.equal(v2.keyword, "chara");
    assert.equal(v2.card.spec, "chara_card_v2");
    assert.equal(v2.card.data.name, "Aveline");
    assert.equal(v2.card.data.first_mes, "You are late.");
    assert.equal(v2.card.data.description, "A royal historian.");

    assert.equal(v3.keyword, "ccv3");
    assert.equal(v3.card.spec, "chara_card_v3");
    assert.equal(v3.card.spec_version, "3.0");
    assert.equal(v3.card.data.name, "Aveline");
    assert.deepEqual(v3.card.data.group_only_greetings, []);

    // the rest of the source PNG (IDAT + IEND) still follows both chunks
    assert.deepEqual(
      Buffer.from(out.subarray(out.length - ONE_PIXEL_PNG.length + 33)),
      Buffer.from(ONE_PIXEL_PNG.subarray(33)),
    );
  } finally {
    if (hadDocument) globalThis.document = oldDocument;
    else delete globalThis.document;
  }
});

test("non-Latin text survives the tEXt round trip", async () => {
  const hadDocument = Object.hasOwn(globalThis, "document");
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => stubCanvas() };

  try {
    const card = {
      name: "由紀 | Yuki 🌸",
      creator: "ムース",
      avatarUrl: "",
      nsfw: true,
      tags: ["女性", "smut"],
      fields: {
        description: "3時のお茶。\n\n胸が高鳴る。",
        greeting: "「遅いよ」と彼女は笑った。🥺",
      },
      lorebooks: [],
    };
    const out = new Uint8Array(await (await X.tavernPngV2(card, X.toBlocks(card), null)).arrayBuffer());
    const chunks = readChunks(Buffer.from(out));
    const [chara] = chunks.filter((chunk) => chunk.type === "tEXt");
    const [keyword, ...rest] = chara.payload.toString("latin1").split("\0");
    assert.equal(keyword, "chara");
    const decoded = JSON.parse(Buffer.from(rest.join("\0"), "base64").toString("utf8"));
    assert.equal(decoded.data.name, "由紀 | Yuki 🌸");
    assert.equal(decoded.data.creator, "ムース");
    assert.equal(decoded.data.first_mes, "「遅いよ」と彼女は笑った。🥺");
  } finally {
    if (hadDocument) globalThis.document = oldDocument;
    else delete globalThis.document;
  }
});

test("tavernCardV2 carries the portrait as a data URI when one was resolved", () => {
  const card = {
    name: "Aveline",
    creator: "storyweaver",
    avatarUrl: "https://ella.janitorai.com/bot-avatars/x.png",
    avatarDataUri: "data:image/jpeg;base64,AAAA",
    nsfw: false,
    tags: [],
    fields: { description: "A royal historian.", greeting: "You are late." },
    lorebooks: [],
  };
  const card2 = X.tavernCardV2(card, X.toBlocks(card), null);
  assert.equal(card2.avatar, "data:image/jpeg;base64,AAAA");
  assert.equal(card2.data.avatar, "data:image/jpeg;base64,AAAA");
  assert.equal(card2.data.extensions.avatar, "data:image/jpeg;base64,AAAA");

  // With no resolved bytes the public URL is still better than nothing.
  const plain = X.tavernCardV2({ ...card, avatarDataUri: "" }, X.toBlocks(card), null);
  assert.equal(plain.avatar, card.avatarUrl);
  assert.equal(plain.data.extensions.avatar, card.avatarUrl);
});

test("tavernCardV3 keeps every V2 field and adds the V3 dates", () => {
  const card = {
    name: "Aveline",
    creator: "storyweaver",
    avatarUrl: "",
    nsfw: false,
    tags: ["fantasy"],
    fields: { description: "A royal historian.", greeting: "You are late." },
    lorebooks: [],
  };
  const v3 = X.tavernCardV3(card, X.toBlocks(card), null);
  assert.equal(v3.spec, "chara_card_v3");
  assert.equal(v3.data.first_mes, "You are late.");
  assert.equal(v3.data.tags[0], "fantasy");
  assert.equal(typeof v3.data.creation_date, "number");
  assert.deepEqual(v3.data.group_only_greetings, []);
});
