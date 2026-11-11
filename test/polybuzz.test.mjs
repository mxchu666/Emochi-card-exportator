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

test("normalizeScene says what Polybuzz keeps private instead of leaving a thin card bare", () => {
  const card = P.normalizeScene(SCENE, null);
  assert.match(card.note, /background text and dialogue-style examples/);
});

test("decodeGender maps Polybuzz's gender ids", () => {
  assert.equal(P.decodeGender(1), "Male");
  assert.equal(P.decodeGender(2), "Female");
  assert.equal(P.decodeGender(3), "Non-binary");
  assert.equal(P.decodeGender(0), "");
  assert.equal(P.decodeGender("1"), "Male");
});

test("normalizeScene reads the scene out of a Nuxt payload for the current page only", () => {
  win.__NUXT__ = {
    data: {
      $a: { data: { settings: { chat: {} } } },
      $b: { data: { secretSceneId: "bLgrZ", sceneName: "Bangchan" } },
      $c: { data: { secretSceneId: "bsBT5", sceneName: "Dante Alfa" } },
    },
  };
  try {
    assert.equal(P.readSsrScene("blgrz").sceneName, "Bangchan");
    assert.equal(P.readSsrScene("bsBT5").sceneName, "Dante Alfa");
    assert.equal(P.readSsrScene("nope"), null);
  } finally {
    delete win.__NUXT__;
  }
});
