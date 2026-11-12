import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, "..", "src", name), "utf8");

// The two new readers share `harvest.js`, so the window stub has to exist before
// either module is evaluated.
const listener = { handler: null };
const win = {
  addEventListener: (name, handler) => {
    if (name === "jaix:payload") listener.handler = handler;
  },
};
new Function("window", read("harvest.js"))(win);
new Function("window", read("cai.js"))(win);
new Function("window", read("crushon.js"))(win);

const H = win.JAIX.harvest;
const C = win.JAIX.scraper;

// The same window object is shared by both modules, so the second evaluation
// overwrote `NS.scraper`. Re-run the Character.ai file last to read its exports.
new Function("window", read("cai.js"))(win);
const CAI = win.JAIX.scraper;

test("harvest scores the inner record over the wrapper it sits in", () => {
  const payload = {
    status: "OK",
    character: {
      external_id: "abc123",
      name: "Mira",
      title: "Lighthouse keeper",
      description: "Keeps the light.",
      greeting: "You're late.",
      definition: "{{char}}: You're late.",
      avatar_file_name: "abc.png",
    },
  };
  const found = H.bestCharacter([payload], ["name", "title", "description", "greeting", "definition", "external_id"]);
  assert.equal(found.name, "Mira");
  assert.equal(found.definition, "{{char}}: You're late.");
});

test("harvest ignores wrappers that only carry a name", () => {
  const found = H.bestCharacter([{ name: "Index" }], ["name", "description", "greeting"]);
  assert.equal(found, null);
});

test("harvest parses JSON embedded as an escaped string", () => {
  const inner = JSON.stringify({ name: "Nia", description: "Diver.", greeting: "Hi.", personality: "Calm." });
  const found = H.bestCharacter([{ data: inner }], ["name", "description", "greeting", "personality"]);
  assert.equal(found.name, "Nia");
});

test("normalizeCharacter maps a Character.ai record onto the card shape", () => {
  const card = CAI.normalizeCharacter({
    external_id: "wVIz9V",
    name: "Mira",
    title: "Lighthouse keeper",
    description: "Keeps the light.",
    greeting: "You're late.",
    definition: "{{char}}: You're late.",
    avatar_file_name: "abc.png",
    user__username: "taquanta",
  });

  assert.equal(card.name, "Mira");
  assert.equal(card.creator, "taquanta");
  assert.equal(card.avatarUrl, "https://characterai.io/i/400/static/avatars/abc.png");
  assert.equal(card.fields.description, "Lighthouse keeper\n\nKeeps the light.");
  assert.equal(card.fields.greeting, "You're late.");
  assert.equal(card.fields.exampleDialogue, "{{char}}: You're late.");
  assert.equal(card.hint, undefined);
  assert.equal(card.sourceLabel, "Character.AI card");
});

test("normalizeCharacter explains a withheld Definition instead of leaving it bare", () => {
  const card = CAI.normalizeCharacter({ name: "Mira", description: "Keeps the light.", greeting: "Hi." });
  assert.equal(card.fields.exampleDialogue, "");
  assert.match(card.hint, /Definition Visibility/);
});

test("Character.ai URL forms both resolve the external id", () => {
  const original = globalThis.location;
  globalThis.location = { pathname: "/character/wVIz9VnSUleUy0Uk", search: "" };
  try {
    assert.equal(CAI.currentCharacterId(), "wVIz9VnSUleUy0Uk");
  } finally {
    globalThis.location = original;
  }
});

test("Crushon keeps every card field a page payload can carry", () => {
  new Function("window", read("crushon.js"))(win);
  const R = win.JAIX.scraper;
  const card = R.normalizeCharacter({
    id: "c1",
    name: "Vale",
    creatorName: "mxchu666",
    description: "Night shift.",
    personality: "Dry, watchful.",
    scenario: "A closed diner.",
    firstMessage: "Still open?",
    exampleDialogue: [{ user: "Hola.", ai: "Siéntate." }],
    avatar: "/img/vale.png",
    tags: [{ name: "Drama" }, "Slow burn"],
  });

  assert.equal(card.name, "Vale");
  assert.equal(card.creator, "mxchu666");
  assert.equal(card.avatarUrl, "https://crushon.ai/img/vale.png");
  assert.equal(card.fields.description, "Night shift.");
  assert.equal(card.fields.personality, "Dry, watchful.");
  assert.equal(card.fields.scenario, "A closed diner.");
  assert.equal(card.fields.greeting, "Still open?");
  assert.equal(card.fields.exampleDialogue, "{{user}}: Hola.\n\n{{char}}: Siéntate.");
  assert.deepEqual(card.tags, ["Drama", "Slow burn"]);
  assert.equal(card.hint, undefined);
});

test("Crushon reads the alternate spellings a release can ship", () => {
  new Function("window", read("crushon.js"))(win);
  const R = win.JAIX.scraper;
  const card = R.normalizeCharacter({
    name: "Vale",
    intro: "Night shift.",
    first_mes: "Still open?",
    mes_example: "Layla: Still open?",
    avatarUrl: { url: "/img/vale.webp" },
  });
  assert.equal(card.fields.description, "Night shift.");
  assert.equal(card.fields.greeting, "Still open?");
  assert.equal(card.fields.exampleDialogue, "Layla: Still open?");
  assert.equal(card.avatarUrl, "https://crushon.ai/img/vale.webp");
});

test("the page event channel hands a payload to the reader", () => {
  listener.handler({ detail: JSON.stringify({ name: "Zed", description: "Pilot.", greeting: "Boarding." }) });
  const found = H.bestCharacter(H.roots(), ["name", "description", "greeting", "personality"]);
  assert.equal(found.name, "Zed");
});

test("the backlog left by the page-world script is drained at load", () => {
  // A fresh window so the earlier payloads do not mask the backlog entry.
  const fresh = { addEventListener: () => {}, __jaixPayloads: [JSON.stringify({ name: "Bex", description: "Cook.", greeting: "Sit." })] };
  new Function("window", read("harvest.js"))(fresh);
  const found = fresh.JAIX.harvest.bestCharacter(fresh.JAIX.harvest.roots(), ["name", "description", "greeting"]);
  assert.equal(found.name, "Bex");
});

test("embeddedObjects cuts a record out of a stream and survives braces in prose", () => {
  const text =
    'noise {"marker":1} before {"name":"Mira","description":"Keeps the {light} on.","greeting":"Late again.","external_id":"piNpVEtc"} after';
  const found = H.embeddedObjects(text, ["greeting", "external_id"], 4);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, "Mira");
  assert.equal(found[0].description, "Keeps the {light} on.");
});

test("flightText joins the App Router stream and embeddedObjects recovers the record", () => {
  const record = { name: "Ito", title: "Night ferry", description: "Crosses at 3.", greeting: "Ticket?", external_id: "abc123" };
  const chunk = '3:["$","div",null,{"character":' + JSON.stringify(record) + "}]";
  const script = "self.__next_f.push([1," + JSON.stringify(chunk) + "])";
  const fake = {
    addEventListener: () => {},
    querySelectorAll: (selector) => (selector === "script" ? [{ textContent: script }] : []),
    getElementById: () => null,
  };
  new Function("window", "document", read("harvest.js"))(fake, fake);
  const joined = fake.JAIX.harvest.flightText();
  assert.match(joined, /Night ferry/);
  const found = fake.JAIX.harvest.embeddedObjects(joined, ["greeting", "external_id"], 4);
  assert.equal(found[0].name, "Ito");
});

test("tokenHeader keeps the scheme the page used", () => {
  const holder = { value: "Bearer abc.def.ghi" };
  const fake = {
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => ({ getAttribute: () => holder.value }),
    querySelectorAll: () => [],
  };
  new Function("window", "document", read("harvest.js"))(fake, fake);
  const h = fake.JAIX.harvest;
  assert.equal(h.tokenHeader(), "Bearer abc.def.ghi");
  assert.equal(h.token(), "abc.def.ghi");
});
