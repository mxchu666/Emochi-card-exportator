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

test("parseSystemPrompt splits the compiled Emochi definition into card fields", () => {
  const parsed = E.parseSystemPrompt(
    '"[]\nHunter Triton\'s name: Hunter Triton.\n' +
      "Hunter Triton calls {{user}} by {{user}} or any name introduced by {{user}}.\n" +
      "Hunter Triton's personality: Cold, ruthless, short temper.\n" +
      "Hunter Triton's background: Olympic gold, seven brothers.\n" +
      "scenario of role-play: The university gym after hours.\n" +
      "Example conversations between Hunter Triton and {{user}}: <START>\n" +
      "{{char}}: Move.\n" +
      "Do not write as {{user}} or assume {{user}}'s reaction or response.",
  );
  assert.equal(parsed.name, "Hunter Triton");
  assert.equal(parsed.personality, "Cold, ruthless, short temper.");
  assert.equal(parsed.characterBackground, "Olympic gold, seven brothers.");
  assert.equal(parsed.scenario, "The university gym after hours.");
  assert.match(parsed.characterExampleConversation, /\{\{char\}\}: Move\./);
  assert.doesNotMatch(parsed.characterExampleConversation, /Do not write as/);
  assert.doesNotMatch(parsed.personality, /calls \{\{user\}\}/);
});

test("exampleDialogue reads Emochi turns, Polybuzz pairs and nested dialogue objects", () => {
  assert.equal(
    E.exampleDialogue([
      { role: "user", content: "Hola." },
      { role: "assistant", content: "No me mires así." },
    ]),
    "{{user}}: Hola.\n\n{{char}}: No me mires así.",
  );
  assert.equal(
    E.exampleDialogue([{ user: "Hola.", ai: "No me mires así." }]),
    "{{user}}: Hola.\n\n{{char}}: No me mires así.",
  );
  assert.equal(
    E.exampleDialogue({ dialogue: [{ user: "Hola.", ai: "No." }] }),
    "{{user}}: Hola.\n\n{{char}}: No.",
  );
  assert.equal(E.exampleDialogue([{ isUser: true, text: "Hola." }]), "{{user}}: Hola.");
  assert.equal(E.exampleDialogue([{ content: "Solo yo." }]), "{{char}}: Solo yo.");
  assert.equal(E.exampleDialogue("Text as written."), "Text as written.");
  assert.equal(E.exampleDialogue(null), "");
});

test("mergeCreator reads characterExampleConversation as turns, not only as a string", () => {
  const card = E.normalizePrompt({ title: "Hermione", description: "Lover." });
  const filled = E.mergeCreator(card, {
    characterExampleConversation: [{ user: "Hola.", ai: "Hola a ti." }],
  });
  assert.equal(filled, true);
  assert.equal(card.fields.exampleDialogue, "{{user}}: Hola.\n\n{{char}}: Hola a ti.");
});

test("parseSystemPrompt recognises drifted section headings", () => {
  const parsed = E.parseSystemPrompt(
    "Mira's name: Mira.\nPersonality: Dry, watchful.\nBackground: Raised by the sea.\n" +
      "Scenario: A lighthouse at dawn.\nExample dialogue:\n{{user}}: Hi.\n{{char}}: Mm.",
  );
  assert.equal(parsed.personality, "Dry, watchful.");
  assert.equal(parsed.characterBackground, "Raised by the sea.");
  assert.equal(parsed.scenario, "A lighthouse at dawn.");
  assert.match(parsed.characterExampleConversation, /\{\{char\}\}: Mm\./);
});

test("parseSystemPrompt keeps sections that sit above a quoted do-not-write line", () => {
  const parsed = E.parseSystemPrompt(
    "Ada's name: Ada.\nAda's personality: Precise.\n" +
      "Ada's background: She quotes the rule in her examples: Do not write as {{user}}.\n" +
      "scenario of role-play: A workshop.",
  );
  assert.equal(parsed.personality, "Precise.");
  assert.match(parsed.characterBackground, /quotes the rule/);
  assert.equal(parsed.scenario, "A workshop.");
});

test("currentCharacterId reads character and Lab URLs", () => {
  const original = globalThis.location;
  const at = (pathname) => {
    globalThis.location = { pathname, search: "" };
    return E.currentCharacterId();
  };
  try {
    assert.equal(at("/character/mrs-morgan-8793148e"), "mrs-morgan-8793148e");
    assert.equal(at("/character/mrs-morgan-8793148e/chat"), "mrs-morgan-8793148e");
    assert.equal(at("/lab/story/the-lighthouse"), "the-lighthouse");
    assert.equal(at("/lab/liveroom/round-table"), "round-table");
    assert.equal(at("/lab/story"), null);
    assert.equal(at("/lab"), null);
    assert.equal(at("/explore"), null);
    globalThis.location = { pathname: "/lab/soundstage/waves", search: "" };
    assert.equal(E.isLabPage(), true);
    globalThis.location = { pathname: "/character/x", search: "" };
    assert.equal(E.isLabPage(), false);
  } finally {
    globalThis.location = original;
  }
});

test("parseSystemPrompt handles one-line prompts, empty sections and plain prompts", () => {
  const oneLine = E.parseSystemPrompt(
    "Sophia's name: Sophia.Sophia calls {{user}} by {{user}}.Sophia's personality: Sweet and possessive.",
  );
  assert.equal(oneLine.name, "Sophia");
  assert.equal(oneLine.personality, "Sweet and possessive.");
  assert.equal(oneLine.scenario, undefined);

  const lone = E.parseSystemPrompt("Killian's name: K.Killian's personality: Sharp.\nKillian's background: .");
  assert.equal(lone.personality, "Sharp.");
  assert.equal(lone.characterBackground, undefined);

  const plain = E.parseSystemPrompt("You will roleplay as BeastGPT, a coding model.");
  assert.equal(plain.personality, "You will roleplay as BeastGPT, a coding model.");
  assert.equal(plain.scenario, undefined);
  assert.equal(E.parseSystemPrompt(""), null);
  assert.equal(E.parseSystemPrompt(null), null);
});

test("normalizePrompt fills personality and scenario from the published initPrompt", () => {
  const card = E.normalizePrompt({
    title: "Killian Chester",
    description: "A rich heir.",
    welcomeMessage: "Hey.",
    initPrompt:
      "Killian's name: Killian.\nKillian's personality: Arrogant, protective.\n" +
      "Killian's background: Inherited the estate at nineteen.\n" +
      "scenario of role-play: The estate library.",
  });
  assert.equal(card.fields.personality, "Arrogant, protective.");
  assert.equal(card.fields.scenario, "The estate library.");
  assert.equal(card.fields.description, "A rich heir.\n\nInherited the estate at nineteen.");
  assert.equal(card.fields.greeting, "Hey.");
});

test("findCompiled pulls the compiled prompt out of a conversation payload", () => {
  const body = {
    conversationId: "abc",
    messages: [
      { role: "system", content: "Sadie's name: Sadie.\nSadie's personality: Dry, sharp." },
      { role: "user", content: "hi" },
      { role: "system", content: "too short" },
    ],
  };
  assert.equal(
    E.findCompiled(body, "", 0),
    "Sadie's name: Sadie.\nSadie's personality: Dry, sharp.",
  );
  assert.equal(E.findCompiled({ a: ["plain text"] }, "", 0), "");
  assert.equal(E.findCompiled("scenario of role-play: A gym.", "", 0), "scenario of role-play: A gym.");
});

test("normalizePrompt names the sections the published definition leaves empty", () => {
  const card = E.normalizePrompt({
    title: "Hermione",
    description: "Lover, husband, spouse.",
    welcomeMessage: "Hi.",
    initPrompt: "Hermione's name: Hermione.\nHermione's personality: Bright and curious.",
  });
  assert.equal(card.fields.personality, "Bright and curious.");
  assert.match(card.note, /left scenario and example dialogue empty/);

  const full = E.normalizePrompt({
    title: "Hunter",
    initPrompt:
      "Hunter's name: Hunter.\nHunter's personality: Cold.\n" +
      "scenario of role-play: The gym.\nExample conversations between Hunter and {{user}}: {{char}}: Move.",
  });
  assert.equal(full.note, undefined);
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
