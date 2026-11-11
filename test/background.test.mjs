import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "background.js"), "utf8");

let fetchImpl = () => Promise.reject(new Error("unset"));
globalThis.fetch = (...args) => fetchImpl(...args);

let handler = null;
const chrome = {
  runtime: { onMessage: { addListener: (fn) => { handler = fn; } } },
};
new Function("chrome", src)(chrome);

function call(message) {
  return new Promise((resolve) => {
    const kept = handler(message, {}, resolve);
    if (kept !== true) resolve({ frustrated: true });
  });
}

test("replies with the parsed body of a successful fetch", async () => {
  let seen = null;
  fetchImpl = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, text: async () => '{"prompt":{"title":"Sadie"}}' };
  };
  const reply = await call({
    type: "jaix:fetch",
    url: "https://emochi-backend-k8s.flowgpt.com/prompt/x/creator",
    headers: { Authorization: "Bearer t" },
  });
  assert.equal(reply.ok, true);
  assert.equal(reply.status, 200);
  assert.equal(reply.body.prompt.title, "Sadie");
  assert.equal(seen.init.headers.Authorization, "Bearer t");
});

test("keeps the message channel open for the async reply", () => {
  fetchImpl = async () => ({ ok: true, status: 200, text: async () => "{}" });
  assert.equal(handler({ type: "jaix:fetch", url: "https://x" }, {}, () => {}), true);
});

test("ignores unrelated messages", () => {
  assert.equal(handler({ type: "something-else" }, {}, () => {}), false);
  assert.equal(handler(null, {}, () => {}), false);
});

test("reports the status and body of a rejected request", async () => {
  fetchImpl = async () => ({ ok: false, status: 403, text: async () => "nope" });
  const reply = await call({ type: "jaix:fetch", url: "https://x" });
  assert.equal(reply.ok, false);
  assert.equal(reply.status, 403);
  assert.equal(reply.text, "nope");
});

test("reports a transport failure as status 0", async () => {
  fetchImpl = async () => {
    throw new Error("boom");
  };
  const reply = await call({ type: "jaix:fetch", url: "https://x" });
  assert.equal(reply.ok, false);
  assert.equal(reply.status, 0);
  assert.equal(reply.error, "boom");
});
