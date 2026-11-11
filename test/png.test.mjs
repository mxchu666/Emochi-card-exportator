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

test("tavernPngV2 writes a chara tEXt chunk after IHDR", async () => {
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

    const body = Buffer.from(out.subarray(33));
    const length = body.readUInt32BE(0);
    assert.equal(body.subarray(4, 8).toString("ascii"), "tEXt");
    const payload = body.subarray(8, 8 + length).toString("latin1");
    const [keyword, ...rest] = payload.split("\0");
    assert.equal(keyword, "chara");

    // CRC from zlib, not from our own implementation
    assert.equal(body.readUInt32BE(8 + length), zlib.crc32(body.subarray(4, 8 + length)));

    const cardData = JSON.parse(Buffer.from(rest.join("\0"), "base64").toString("utf8"));
    assert.equal(cardData.spec, "chara_card_v2");
    assert.equal(cardData.data.name, "Aveline");
    assert.equal(cardData.data.first_mes, "You are late.");
    assert.equal(cardData.data.description, "A royal historian.");

    // the rest of the source PNG (IDAT + IEND) still follows the chunk and its CRC
    assert.deepEqual(
      Buffer.from(body.subarray(8 + length + 4)),
      Buffer.from(ONE_PIXEL_PNG.subarray(33)),
    );
  } finally {
    if (hadDocument) globalThis.document = oldDocument;
    else delete globalThis.document;
  }
});
