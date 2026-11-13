import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, "..", "src", name), "utf8");

const win = {};
new Function("window", read("saucepan.js"))(win);
const SP = win.JAIX.scraper;

// Shards taken verbatim from a live `GET /api/v2/companions/...` response: seven
// real ones and one decoy that carries a random proof. The decoder has to keep
// the seven, drop the decoy, and put them back in the order the site renders.
const SET = {
  version: 1,
  mask: 18225,
  fragments: [
    { text: "macy, Jad", key: 18237, proof: 621789842 },
    { text: "signal glance window but", key: 23164, proof: 1183433097 },
    { text: " most of ", key: 18231, proof: 0 },
    { text: " Mileena,", key: 18224, proof: 1780168468 },
    { text: " of the ", key: 18228, proof: 1032121143 },
    { text: "most powe", key: 18231, proof: 1661349743 },
    { text: "Kitana,", key: 18225, proof: 1780880681 },
    { text: " Mileena.", key: 18238, proof: 1004436026 },
    { text: "e has exp", key: 18236, proof: 3695106103 },
    { text: "erience,", key: 18239, proof: 3948545098 },
  ],
};

test("decodeFragments keeps only shards whose proof verifies", () => {
  const text = SP.decodeFragments(SET);
  assert.ok(!text.includes("signal"), "decoy shard survived");
  assert.ok(!text.includes(" most of "), "a shard with a forged proof survived");
  assert.ok(text.includes("Kitana,"));
  assert.ok(text.includes("most powe"));
  assert.ok(text.includes("erience,"));
});

test("decodeFragments orders by key ^ mask, not by array order", () => {
  const text = SP.decodeFragments(SET);
  assert.equal(text.indexOf("Kitana,"), 0);
  assert.ok(text.indexOf("most powe") < text.indexOf("e has exp"));
  assert.ok(text.indexOf("e has exp") < text.indexOf("erience,"));
});

test("decodeFragments is empty rather than wrong on a missing payload", () => {
  assert.equal(SP.decodeFragments(null), "");
  assert.equal(SP.decodeFragments({}), "");
  assert.equal(SP.decodeFragments({ fragments: [] }), "");
});

test("definitionSections maps the four editor blocks by title", () => {
  const out = SP.definitionSections({
    sections: [
      { title: "Companion Core", content: "They keep the light." },
      { title: "Example Dialogue", content: "{{char}}: You're late." },
      { title: "Response Formatting Instructions", content: "No asterisks." },
      { title: "Advanced Prompt", content: "Stay in scene." },
      { title: "Something Else", content: "Kept." },
    ],
  });
  assert.equal(out.core, "They keep the light.");
  assert.equal(out.example, "{{char}}: You're late.");
  assert.equal(out.formatting, "No asterisks.");
  assert.equal(out.advanced, "Stay in scene.");
  assert.deepEqual(out.other, ["Something Else\nKept."]);
});

test("scenarioList skips the blank sentinel and keeps public order", () => {
  const list = SP.scenarioList({
    starting_scenarios: [
      { title: "Night", message: "The light is out." },
      { title: "Empty", message: "≠≠≠BLANK_SCENARIO≠≠≠" },
      { title: "Dawn", message: "You climb the stairs." },
    ],
  });
  assert.deepEqual(
    list.map((entry) => entry.message),
    ["The light is out.", "You climb the stairs."],
  );
});

test("normalizeCompanion maps a public record onto the card shape", () => {
  const card = SP.normalizeCompanion(
    {
      id: "28d1c1af-d39f-4ee7-8821-1b80d56c9eff",
      author_handle: "Varakisan",
      name: "Kitana, Mileena, and Jade",
      display_name: "Kitana, Mileena, and Jade",
      short_description: "The Outworld Elites",
      tags: ["female", "any_pov"],
      fandom_tags: [{ id: "mortal-kombat", display_name: "Mortal Kombat" }],
      image: { id: "9074e117-69ee-46c2-a8d9-ca8cd2ac89c2" },
      sus: true,
      very_sus: false,
      access_level: "public",
      providers_profile: "internal_only",
      hidden_fields: 28,
      open_definition: false,
      full_description_fragments: SET,
    },
    null,
    null,
  );

  assert.equal(card.name, "Kitana, Mileena, and Jade");
  assert.equal(card.creator, "Varakisan");
  assert.deepEqual(card.tags, ["female", "any_pov", "Mortal Kombat"]);
  assert.equal(card.nsfw, true);
  assert.equal(card.sourceLabel, "Saucepan.ai card");
  assert.ok(card.fields.description.startsWith("The Outworld Elites"));
  assert.ok(card.fields.description.includes("Kitana,"));
  assert.equal(card.fields.personality, "");
  assert.ok(card.note.includes("Providers: internal models only"));
  assert.ok(card.hint.includes("Companion Core"));
  assert.ok(card.hint.includes("starting message"));
});

test("normalizeCompanion puts the tagline over the description, never inside personality", () => {
  const card = SP.normalizeCompanion(
    {
      id: "x",
      display_name: "Mira",
      short_description: "Lighthouse keeper",
      full_description_fragments: {
        mask: 0,
        fragments: [{ text: "Keeps the light.", key: 0, proof: 1652524056 }],
      },
      hidden_fields: 0,
    },
    { sections: [{ title: "Companion Core", content: "Quiet. Patient." }] },
    null,
  );
  assert.equal(card.fields.description, "Lighthouse keeper\n\nKeeps the light.");
  assert.equal(card.fields.personality, "Quiet. Patient.");
  assert.ok(!card.fields.personality.includes("Lighthouse keeper"));
});

test("an owned companion reads from the editor record and wins over the public copy", () => {
  const card = SP.normalizeCompanion(
    {
      id: "x",
      display_name: "Mira",
      short_description: "Lighthouse keeper",
      full_description_fragments: { mask: 0, fragments: [] },
      hidden_fields: 30,
      access_level: "private",
      providers_profile: "vetted_only",
    },
    { sections: [{ title: "Companion Core", content: "from the definition route" }] },
    {
      display_name: "Mira",
      full_description: "Full text from the editor.",
      card: "Core from the editor.",
      example_dialogue: "{{char}}: You're late.",
      advanced_prompt: "Never break character.",
      formatting_instructions: "No asterisks.",
      starting_scenarios: [
        { title: "Night", message: "The light is out." },
        { title: "Dawn", message: "You climb the stairs." },
      ],
    },
  );

  assert.equal(card.fields.personality.includes("Core from the editor."), true);
  assert.equal(card.fields.personality.includes("from the definition route"), false);
  assert.equal(card.fields.description, "Lighthouse keeper\n\nFull text from the editor.");
  assert.equal(card.fields.exampleDialogue, "{{char}}: You're late.");
  assert.equal(card.fields.greeting, "The light is out.");
  assert.deepEqual(card.fields.altGreetings, ["You climb the stairs."]);
  assert.ok(card.fields.personality.includes("## Advanced Prompt"));
  assert.ok(card.fields.personality.includes("## Formatting Instructions"));
  assert.equal(card.hint, undefined, "an owned companion is not missing its definition");
});

test("normalizeLorebookEntry uses the chapter title as the trigger", () => {
  const entry = SP.normalizeLorebookEntry({ title: "The Lighthouse", text: "It is tall." });
  assert.deepEqual(entry.keys, ["The Lighthouse"]);
  assert.equal(entry.content, "It is tall.");
  assert.equal(entry.constant, false);
});

test("normalizeLorebookEntry leaves an untitled chapter always-on", () => {
  const entry = SP.normalizeLorebookEntry({ text: "No title." });
  assert.deepEqual(entry.keys, []);
  assert.equal(entry.constant, true);
});

test("currentCharacterId reads the companion and editor routes", () => {
  const id = "28d1c1af-d39f-4ee7-8821-1b80d56c9eff";
  const withPath = (pathname) => {
    const scope = { location: { pathname, search: "" } };
    const localWin = {};
    new Function("window", "location", read("saucepan.js"))(localWin, scope.location);
    return localWin.JAIX.scraper.currentCharacterId();
  };
  assert.equal(withPath("/companion/" + id), id);
  assert.equal(withPath("/editor/" + id + "/messages"), id);
  assert.equal(withPath("/home"), null);
});
