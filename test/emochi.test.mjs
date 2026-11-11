import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "emochi.js"), "utf8");
const win = {};
new Function("window", src)(win);
const E = win.JAIX.scraper;

test("normalizePrompt maps a published Emochi prompt onto the card shape", () => {
  const card = E.normalizePrompt({
    id: "PjKwbWSpRKQk5ON0f_XzA",
    uri: "mrs-morgan-8793148e",
    title: "Mrs. Morgan",
    description: "your teacher.",
    welcomeMessage: "*She bends down.* \"Sorry about that.\"",
    nsfw: true,
    coverURL: "https://image-cdn.flowgpt.com/a.png",
    Tag: [],
    tags: [],
    promptTags: [["V4", "Character", "Gender", "Female"], ["V5", "persona", "V5 teacher"]],
    User: { name: "Bella", uri: "cr1jdafs4ptm1dprlps0" },
    exampleConversation: null,
  });

  assert.equal(card.name, "Mrs. Morgan");
  assert.equal(card.creator, "Bella");
  assert.equal(card.avatarUrl, "https://image-cdn.flowgpt.com/a.png");
  assert.equal(card.nsfw, true);
  assert.equal(card.fields.description, "your teacher.");
  assert.equal(card.fields.greeting, '*She bends down.* "Sorry about that."');
  assert.equal(card.fields.personality, "");
  assert.equal(card.fields.scenario, "");
  assert.equal(card.fields.exampleDialogue, "");
  assert.deepEqual(card.fields.altGreetings, []);
  assert.deepEqual(card.tags, ["Female", "teacher"]);
  assert.deepEqual(card.lorebooks, []);
  assert.equal(card.sourceLabel, "Emochi card");
});

test("promptTagNames keeps the label cell and drops the V4/V5 prefix", () => {
  assert.deepEqual(
    E.promptTagNames([["V4", "Character", "Race", "Human"], ["V5", "state", "V5 flirty"], []]),
    ["Human", "flirty"],
  );
  assert.deepEqual(E.promptTagNames(null), []);
});

test("exampleDialogue turns role/content turns into {{char}}/{{user}} lines", () => {
  assert.equal(
    E.exampleDialogue([
      { role: "assistant", content: "Come in." },
      { role: "user", content: "It's late." },
      { role: "assistant", content: "  " },
    ]),
    "{{char}}: Come in.\n\n{{user}}: It's late.",
  );
  assert.equal(E.exampleDialogue("{{char}}: hi"), "{{char}}: hi");
  assert.equal(E.exampleDialogue(null), "");
});

test("mergeCreator fills the fields the published prompt hides", () => {
  const card = E.normalizePrompt({ title: "Aveline", description: "Court historian." });
  const filled = E.mergeCreator(card, {
    personality: "Quiet and precise.",
    scenario: "The archive after midnight.",
    characterExampleConversation: "{{char}}: Sit down.",
    characterBackground: "She has served three queens.",
    introduction: "",
  });
  assert.equal(filled, true);
  assert.equal(card.fields.personality, "Quiet and precise.");
  assert.equal(card.fields.scenario, "The archive after midnight.");
  assert.equal(card.fields.exampleDialogue, "{{char}}: Sit down.");
  assert.equal(
    card.fields.description,
    "Court historian.\n\nShe has served three queens.",
  );
  assert.equal(E.mergeCreator(card, {}), false);
});

test("harvestDefinition digs the definition out of any response shape", () => {
  const found = E.harvestDefinition(
    {
      prompt: {
        id: "x",
        prompt: {
          personality: "Sharp tongue.",
          scenario: "A rainy porch.",
          exampleConversation: [{ role: "assistant", content: "You're late." }],
          nested: { characterBackground: "Ran away at sixteen." },
        },
      },
    },
    {},
  );
  assert.equal(found.personality, "Sharp tongue.");
  assert.equal(found.scenario, "A rainy porch.");
  assert.equal(found.characterBackground, "Ran away at sixteen.");
  assert.deepEqual(found.exampleConversation, [{ role: "assistant", content: "You're late." }]);
  assert.deepEqual(E.harvestDefinition(null, {}), {});
});

test("normalizePrompt tolerates empty input", () => {
  const card = E.normalizePrompt(null);
  assert.equal(card.name, "Imported character");
  assert.equal(card.creator, "");
  assert.deepEqual(card.tags, []);
  assert.equal(card.fields.greeting, "");
});

test("readUserId pulls the id out of the site's local user store", () => {
  const store = { "user-store": JSON.stringify({ state: { userId: "u_123" }, version: 0 }) };
  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null) };
  try {
    assert.equal(E.readUserId(), "u_123");
    globalThis.localStorage = { getItem: () => "not json" };
    assert.equal(E.readUserId(), "");
    globalThis.localStorage = { getItem: () => null };
    assert.equal(E.readUserId(), "");
  } finally {
    if (oldStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = oldStorage;
  }
});

test("describeFailures separates a refused session from a creator-only definition", () => {
  const refused = E.describeFailures([
    { label: "detail", status: 200, answered: true },
    { label: "creator", status: 401, reason: '{"data":"Invalid Authorization: invalid token"}' },
    { label: "latest", answered: true, reason: "no definition" },
  ]);
  assert.match(refused, /private to the character's creator/);

  const dead = E.describeFailures([
    { label: "detail", status: 401, reason: '{"data":"authorization header is required"}' },
    { label: "creator", status: 401, reason: '{"data":"authorization header is required"}' },
  ]);
  assert.match(dead, /refused the request \(authorization header is required\)/);

  const sparse = E.describeFailures([
    { label: "detail", answered: true, reason: "no definition" },
    { label: "creator", answered: true, reason: "no definition" },
  ]);
  assert.match(sparse, /public fields/);
});

test("currentCharacterId reads the slug out of an Emochi character URL", () => {
  const oldLocation = globalThis.location;
  globalThis.location = { pathname: "/es-ES/character/mrs-morgan-8793148e/chat" };
  try {
    assert.equal(E.currentCharacterId(), "mrs-morgan-8793148e");
    globalThis.location = { pathname: "/trending" };
    assert.equal(E.currentCharacterId(), null);
  } finally {
    if (oldLocation === undefined) delete globalThis.location;
    else globalThis.location = oldLocation;
  }
});
