import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "polybuzz.js"), "utf8");
const win = {};
new Function("window", src)(win);
const P = win.JAIX.scraper;

// Shape taken from the server-rendered payload of a public Polybuzz chat page.
const SCENE = {
  secretSceneId: "bLgrZ",
  sceneName: "Bangchan",
  oriSceneName: "Bangchan",
  sceneAvatarUrl: "https://cdn-dual.polyspeak.ai/speakmaster/a.webp",
  homeCoverUrl: "https://cdn-dual.polyspeak.ai/speakmaster/b.webp",
  sceneBrief: "Ay, amor, no me veas así",
  speechText: "*Bangchan es tu esposo*\n\nBangchan: User necesitamos hablar",
  systemRole: "",
  templateIntro: "",
  sceneGender: 1,
  createUserName: "Erica ★",
  sceneTags: [
    { tagName: "Cariñoso", tagId: 108 },
    { tagName: "Celoso", tagId: 81 },
  ],
};

test("normalizeScene maps a Polybuzz character onto the card shape", () => {
  const card = P.normalizeScene(SCENE, null);

  assert.equal(card.id, "bLgrZ");
  assert.equal(card.name, "Bangchan");
  assert.equal(card.creator, "Erica ★");
  assert.equal(card.avatarUrl, "https://cdn-dual.polyspeak.ai/speakmaster/a.webp");
  assert.equal(card.gender, "Male");
  assert.deepEqual(card.tags, ["Cariñoso", "Celoso"]);
  assert.equal(card.fields.description, "Ay, amor, no me veas así");
  assert.equal(card.fields.greeting, SCENE.speechText);
  assert.equal(card.fields.personality, "");
  assert.equal(card.fields.scenario, "");
  assert.equal(card.fields.exampleDialogue, "");
  assert.deepEqual(card.fields.altGreetings, []);
  assert.equal(card.sourceLabel, "Polybuzz card");
});

test("normalizeScene falls back to the profile row for name, avatar and creator", () => {
  const card = P.normalizeScene(
    { secretSceneId: "bLgrZ" },
    {
      secretSceneId: "bLgrZ",
      sceneName: "Alpha Dante",
      sceneAvatarUrl: "https://cdn-dual.polyspeak.ai/speakmaster/c.webp",
      sceneBrief: "He is a powerful alpha.",
      sceneGender: 2,
      createUserName: "Rhyos",
      sceneTags: [{ tagName: "OC" }],
    },
  );

  assert.equal(card.name, "Alpha Dante");
  assert.equal(card.creator, "Rhyos");
  assert.equal(card.avatarUrl, "https://cdn-dual.polyspeak.ai/speakmaster/c.webp");
  assert.equal(card.gender, "Female");
  assert.equal(card.fields.description, "He is a powerful alpha.");
  assert.deepEqual(card.tags, ["OC"]);
});

test("normalizeScene carries the background and setting when the payload publishes them", () => {
  const card = P.normalizeScene(
    {
      ...SCENE,
      systemRole: "Creció en Busan y odia las despedidas.",
      templateIntro: "Un apartamento en Seúl, de madrugada.",
    },
    null,
  );

  assert.equal(card.fields.personality, "Creció en Busan y odia las despedidas.");
  assert.equal(card.fields.scenario, "Un apartamento en Seúl, de madrugada.");
  assert.equal(card.note, undefined);
});

test("normalizeScene uses the account payload for background, examples and style", () => {
  const card = P.normalizeScene(SCENE, null, {
    status: "ok",
    data: {
      systemRole: "Creció en Busan y odia las despedidas.",
      conversationExample: "{{char}}: No me mires así.\n{{user}}: ¿Por qué?",
      dialogueStyle: "Descriptivo, frases cortas",
    },
  });

  assert.equal(
    card.fields.personality,
    "Creció en Busan y odia las despedidas.\n\nDialogue style: Descriptivo, frases cortas",
  );
  assert.equal(card.fields.exampleDialogue, "{{char}}: No me mires así.\n{{user}}: ¿Por qué?");
  assert.equal(card.note, undefined);
});

test("normalizeScene tells the reader to sign in when the account endpoint asks for it", () => {
  const card = P.normalizeScene(SCENE, null, { status: "login", data: null });
  assert.match(card.note, /Sign in to Polybuzz/);
});

test("normalizeScene reports an empty answer as empty, not as a failed read", () => {
  const card = P.normalizeScene(SCENE, null, { status: "ok", data: { systemRole: "" } });
  assert.match(card.note, /returned no background text and no dialogue examples/);
});

test("normalizeScene says how to retry when the background lookup never answered", () => {
  const card = P.normalizeScene(SCENE, null, { status: "error", data: null });
  assert.match(card.note, /didn't answer the background and dialogue lookups/);
});

test("normalizeScene flags a card that arrived without its greeting", () => {
  const card = P.normalizeScene(null, {
    secretSceneId: "bLgrZ",
    sceneName: "Bangchan",
    sceneBrief: "Aw, babe.",
    sceneGender: 1,
  });
  assert.equal(card.fields.greeting, "");
  assert.match(card.note, /didn't hand over this character's greeting/);
});

// The #__NUXT_DATA__ script tag holds the payload as a devalue flat array. A
// summary card and the full scene share the id there, and only the full one has
// the greeting, so the richer match must win.
const FLAT_PAYLOAD = [
  ["ShallowReactive", 1],
  { data: 2 },
  { $summary: 3, $scene: 7 },
  { secretSceneId: 4, sceneName: 5, sceneBrief: 6 },
  "bLgrZ",
  "Bangchan",
  "Aw, babe",
  {
    secretSceneId: 8,
    sceneName: 9,
    sceneBrief: 10,
    speechText: 11,
    sceneGender: 12,
    createUserName: 13,
  },
  "bLgrZ",
  "Bangchan",
  "Aw, babe",
  "*Bangchan es tu esposo*",
  2,
  "Erica",
];

test("parsePayload expands the devalue payload and picks the full scene", () => {
  const scene = P.parsePayload(JSON.stringify(FLAT_PAYLOAD), "blgrz");
  assert.ok(scene, "scene not found");
  assert.equal(scene.sceneName, "Bangchan");
  assert.equal(scene.speechText, "*Bangchan es tu esposo*");
  assert.equal(scene.sceneGender, 2);
  assert.equal(scene.createUserName, "Erica");
});

test("parsePayload ignores junk instead of throwing", () => {
  assert.equal(P.parsePayload("", "bLgrZ"), null);
  assert.equal(P.parsePayload("{not json", "bLgrZ"), null);
  assert.equal(P.parsePayload(JSON.stringify(FLAT_PAYLOAD), "other"), null);
});

test("decodeGender maps Polybuzz's gender ids", () => {
  assert.equal(P.decodeGender(1), "Male");
  assert.equal(P.decodeGender(2), "Female");
  assert.equal(P.decodeGender(3), "Non-binary");
  assert.equal(P.decodeGender(0), "");
  assert.equal(P.decodeGender("1"), "Male");
});

test("readSsrScene matches the URL slug against the bare scene id", () => {
  win.__NUXT__ = {
    data: {
      $a: { data: { settings: { chat: {} } } },
      $b: { data: { secretSceneId: "bLgrZ", sceneName: "Bangchan" } },
      $c: { data: { secretSceneId: "bsBT5", sceneName: "Dante Alfa" } },
    },
  };
  try {
    assert.equal(P.readSsrScene("blgrz").sceneName, "Bangchan");
    assert.equal(P.readSsrScene("bangchan-bLgrZ").sceneName, "Bangchan");
    assert.equal(P.readSsrScene("bsBT5").sceneName, "Dante Alfa");
    assert.equal(P.readSsrScene("nope"), null);
  } finally {
    delete win.__NUXT__;
  }
});

test("sceneIdFromSlug keeps the trailing scene id the API expects", () => {
  assert.equal(P.sceneIdFromSlug("bangchan-bLgrZ"), "bLgrZ");
  assert.equal(P.sceneIdFromSlug("ghost-sulking-ex-bL2Zu"), "bL2Zu");
  assert.equal(P.sceneIdFromSlug("brMv6"), "brMv6");
});
