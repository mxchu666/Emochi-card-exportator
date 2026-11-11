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
  assert.match(card.note, /returned an empty background/);
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

test("fetchOwnerScene calls the page-context endpoint with cookies and reports a sign-in gate", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({ errNo: 120018, errMsg: "User Needs to login again", data: {} }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const owner = await P.fetchOwnerScene("bHJrz");
    assert.equal(owner.status, "login");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/scene\/getscenedetail$/);
    assert.equal(calls[0].init.method, "POST");
    // Page context, not the worker: c6-api answers 5002 without a Referer, and a
    // service worker cannot send one.
    assert.equal(calls[0].init.credentials, "include");
    assert.equal(JSON.parse(calls[0].init.body).secretSceneId, "bHJrz");
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchOwnerScene returns the account payload when the server allows it", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ errNo: 0, data: { systemRole: "Fondo.", conversationExample: "{{char}}: hola" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const owner = await P.fetchOwnerScene("bHJrz");
    assert.equal(owner.status, "ok");
    assert.equal(owner.data.systemRole, "Fondo.");

    const card = P.normalizeScene(SCENE, null, owner);
    assert.equal(card.fields.personality, "Fondo.");
    assert.equal(card.fields.exampleDialogue, "{{char}}: hola");
    assert.equal(card.note, undefined);
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchOwnerScene marks a scene the account does not own as not-owner, not as a retry", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ errNo: 210002, errstr: "No permission to edit this character", data: {} }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const owner = await P.fetchOwnerScene("bHJrz");
    assert.equal(owner.status, "not-owner");
    assert.equal(owner.errNo, 210002);

    const card = P.normalizeScene(SCENE, null, owner);
    assert.match(card.note, /code 210002/);
    assert.match(card.note, /does not own the character \(Erica ★\)/);
    assert.doesNotMatch(card.note, /Reload/);
  } finally {
    globalThis.fetch = original;
  }
});

test("normalizeScene reads the detail record's own field names", () => {
  const card = P.normalizeScene(SCENE, null, {
    status: "ok",
    data: {
      sceneName: "Bangchan",
      brief: "Aw, babe.",
      prologue: { speechText: "*Bangchan es tu esposo*" },
      systemRole: "Creció en Busan.",
      conversationExample: "{{char}}: No.",
      dialogueStyle: { dialogue: [{ name: "Descriptivo" }, { title: "Frases cortas" }] },
    },
  });

  assert.equal(card.fields.greeting, SCENE.speechText);
  assert.equal(card.fields.personality, "Creció en Busan.\n\nDialogue style: Descriptivo, Frases cortas");
  assert.equal(card.fields.exampleDialogue, "{{char}}: No.");
  assert.equal(card.note, undefined);

  // The detail record's `prologue` only stands in when the page had no greeting.
  const bare = P.normalizeScene({ secretSceneId: "bHJrz", sceneName: "Bangchan" }, null, {
    status: "ok",
    data: { prologue: { speechText: "*Bangchan es tu esposo*" }, brief: "Aw, babe." },
  });
  assert.equal(bare.fields.greeting, "*Bangchan es tu esposo*");
  assert.equal(bare.fields.description, "Aw, babe.");
});

test("prologueText and labelText flatten every shape the site uses", () => {
  assert.equal(P.prologueText("hola"), "hola");
  assert.equal(P.prologueText({ speechText: "hola" }), "hola");
  assert.equal(P.prologueText(null), "");
  assert.equal(P.labelText("Descriptivo"), "Descriptivo");
  assert.equal(P.labelText({ dialogue: [{ name: "A" }, "B"] }), "A, B");
  assert.equal(P.labelText([{ title: "C" }]), "C");
  assert.equal(P.labelText(undefined), "");
});

test("fetchSceneConfig posts a form body and reads the config tree by field name", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        errNo: 0,
        data: { scene: { systemRole: "Fondo real.", conversationExample: "{{char}}: hola" } },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const config = await P.fetchSceneConfig("bHJrz");
    assert.equal(config.status, "ok");
    assert.equal(config.fields.systemRole, "Fondo real.");
    assert.equal(config.fields.conversationExample, "{{char}}: hola");
    assert.match(calls[0].url, /\/api\/conversation\/getsceneconfig$/);
    assert.match(calls[0].init.headers["content-type"], /x-www-form-urlencoded/);
    assert.equal(calls[0].init.body, "secretSceneId=bHJrz&secretSceneID=bHJrz");
  } finally {
    globalThis.fetch = original;
  }
});

test("collectPromptFields skips blank strings so a later record can fill the field", () => {
  const fields = P.collectPromptFields({
    systemRole: "",
    nested: [{ systemRole: "Fondo." }],
    conversationExample: "{{char}}: hola",
  });
  assert.equal(fields.systemRole, "Fondo.");
  assert.equal(fields.conversationExample, "{{char}}: hola");
  assert.equal(fields.dialogueStyle, undefined);
});

test("fetchPromptFields stops at the first route that returns both prompt fields", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({ errNo: 0, data: { systemRole: "Fondo.", conversationExample: "{{char}}: hola" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const prompt = await P.fetchPromptFields("bHJrz");
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/api\/scene\/getscenedetail$/);
    assert.equal(prompt.fields.systemRole, "Fondo.");
    assert.equal(prompt.trace.length, 1);
    assert.equal(prompt.trace[0].route, "getscenedetail");
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchPromptFields asks the two conversation routes when the owner route refuses", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith("/api/scene/getscenedetail")) {
      return new Response(JSON.stringify({ errNo: 210002, errstr: "No permission", data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ errNo: 0, data: { scene: {} } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const prompt = await P.fetchPromptFields("bHJrz");
    assert.deepEqual(
      prompt.trace.map((t) => t.route + ":" + t.status),
      ["getscenedetail:not-owner", "getsceneconfig:ok", "init:ok"],
    );
    assert.deepEqual(prompt.fields, {});
    assert.equal(prompt.detail.status, "not-owner");
    assert.equal(calls.length, 3);

    const card = P.normalizeScene(SCENE, null, prompt.detail, { fields: prompt.fields, trace: prompt.trace });
    assert.match(card.note, /210002/);
    assert.match(card.note, /\[getscenedetail 210002, getsceneconfig ok, init ok\]/);
    assert.match(card.note, /returned an empty background/);
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchOwnerScene treats the site guard answer as an error, not as an empty scene", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ errNo: 5002, errMsg: "system busy now", data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    const owner = await P.fetchOwnerScene("bHJrz");
    assert.equal(owner.status, "error");
    assert.equal(owner.errNo, 5002);
    const card = P.normalizeScene(SCENE, null, owner);
    assert.match(card.note, /code 5002/);
  } finally {
    globalThis.fetch = original;
  }
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
