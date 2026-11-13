import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "exporters.js"), "utf8");
const win = {};
new Function("window", src)(win);
const X = win.JAIX.exporters;

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
    toDataURL: () => "data:image/jpeg;base64,AAAA",
  };
}

// An <img> that behaves like a real one: succeeds or fails on the next tick.
function stubImage(ok) {
  return class FakeImage {
    constructor() {
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.width = 0;
      this.height = 0;
    }
    set src(value) {
      this._src = value;
      setTimeout(() => {
        if (ok) {
          this.naturalWidth = 400;
          this.naturalHeight = 400;
          this.width = 400;
          this.height = 400;
        }
        const handler = ok ? this.onload : this.onerror;
        if (typeof handler === "function") handler();
      }, 0);
    }
    get src() {
      return this._src;
    }
  };
}

async function withGlobals(fn) {
  const had = {
    document: Object.hasOwn(globalThis, "document"),
    Image: Object.hasOwn(globalThis, "Image"),
    chrome: Object.hasOwn(globalThis, "chrome"),
  };
  const old = {
    document: globalThis.document,
    Image: globalThis.Image,
    chrome: globalThis.chrome,
  };
  try {
    await fn();
  } finally {
    for (const key of ["document", "Image", "chrome"]) {
      if (had[key]) globalThis[key] = old[key];
      else delete globalThis[key];
    }
  }
}

const card = () => ({
  name: "Alana Flores",
  avatarUrl: "https://image-cdn.flowgpt.com/trans-images/x.webp",
  fields: { description: "d", greeting: "g" },
  tags: [],
  lorebooks: [],
});

test("a dead worker falls back to the CORS image load and still ships a portrait", async () => {
  await withGlobals(async () => {
    let messages = 0;
    globalThis.document = { createElement: () => stubCanvas() };
    globalThis.Image = stubImage(true);
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(_message, callback) {
          messages++;
          callback({ ok: false, status: 0, error: "worker unreachable: the extension was reloaded - reload this tab" });
        },
      },
    };

    const c = card();
    await X.prepareAvatar(c);
    assert.equal(messages, 1);
    assert.equal(c.avatarSource, "cors");
    assert.match(c.avatarDataUri, /^data:image\/jpeg/);
    assert.equal(c.avatarError, "");
    assert.ok(c.avatarPng && c.avatarPng.length > 0);
  });
});

test("both transports failing names the reason and retries on the next export", async () => {
  await withGlobals(async () => {
    let messages = 0;
    globalThis.document = { createElement: () => stubCanvas() };
    globalThis.Image = stubImage(false);
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(_message, callback) {
          messages++;
          callback({ ok: false, status: 403, error: "http 403" });
        },
      },
    };

    const c = card();
    await X.prepareAvatar(c);
    assert.equal(c.avatarDataUri, undefined);
    assert.equal(c.avatarError, "http 403");

    // No permanent latch: the same card asks again, because the usual cause of
    // a failed fetch is a worker that was not running yet.
    await X.prepareAvatar(c);
    assert.equal(messages, 2);
  });
});

test("a card with no portrait URL says so instead of failing silently", async () => {
  await withGlobals(async () => {
    globalThis.document = { createElement: () => stubCanvas() };
    globalThis.Image = stubImage(true);
    globalThis.chrome = { runtime: { lastError: null, sendMessage() {} } };
    const c = { name: "No Picture", avatarUrl: "", fields: {}, tags: [], lorebooks: [] };
    await X.prepareAvatar(c);
    assert.equal(c.avatarError, "the record has no portrait URL");
  });
});

test("requestImage turns a lost extension context into a readable reason", async () => {
  await withGlobals(async () => {
    globalThis.chrome = {
      runtime: {
        lastError: { message: "Extension context invalidated." },
        sendMessage(_message, callback) {
          callback(undefined);
        },
      },
    };
    const got = await X.requestImage("https://example.test/a.png");
    assert.equal(got.ok, false);
    assert.match(got.error, /extension was reloaded - reload this tab/);
  });
});
