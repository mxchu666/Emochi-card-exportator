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

const sampleCard = () => ({
  name: "Tanjiro",
  creator: "someone",
  avatarUrl: "https://ella.janitorai.com/bot-avatars/x.png",
  nsfw: false,
  tags: ["anime", "adventure"],
  fields: {
    description: "A kind demon slayer.\n\nWears checkered haori.",
    personality: "Determined; gentle.",
    scenario: "The forest at dusk.",
    greeting: "Hello there.",
    altGreetings: ["Oh, hi."],
    exampleDialogue: "{{user}}: Hi\nTanjiro: Hello!",
  },
  lorebooks: [
    {
      name: "Demon Slayer lore",
      description: "",
      entries: [
        { keys: ["nichirin"], content: "A nichirin blade changes color.", comment: "Blades" },
        { keys: ["breathing"], content: "Water breathing has ten forms.", comment: "Breathing" },
      ],
    },
  ],
});

test("toBlocks splits fields on blank lines and lists each lore entry", () => {
  const blocks = X.toBlocks(sampleCard());
  const desc = blocks.filter((b) => b.field === "description");
  assert.equal(desc.length, 2);
  const lore = blocks.filter((b) => b.kind === "lorebook");
  assert.equal(lore.length, 2);
  assert.ok(blocks.some((b) => b.field === "greeting"));
  assert.ok(blocks.some((b) => b.field === "altGreetings"));
});

test("toBlocks splits Windows line endings and tolerates missing fields", () => {
  const card = sampleCard();
  card.fields.description = "First paragraph.\r\n\r\nSecond paragraph.";
  assert.equal(
    X.toBlocks(card).filter((block) => block.field === "description").length,
    2,
  );
  assert.deepEqual(X.toBlocks({ name: "Empty" }), []);
});

test("tavernCardV2 has the spec envelope and merged fields", () => {
  const card = sampleCard();
  const blocks = X.toBlocks(card);
  const out = X.tavernCardV2(card, blocks, null);
  assert.equal(out.spec, "chara_card_v2");
  assert.equal(out.spec_version, "2.0");
  assert.equal(out.data.name, "Tanjiro");
  assert.equal(out.data.first_mes, "Hello there.");
  assert.equal(out.data.description, "A kind demon slayer.\n\nWears checkered haori.");
  assert.deepEqual(out.data.alternate_greetings, ["Oh, hi."]);
  assert.deepEqual(out.data.tags, ["anime", "adventure"]);
  assert.equal(out.data.character_book.entries.length, 2);
  assert.deepEqual(out.data.character_book.entries[0].keys, ["nichirin"]);
  // V1 mirror: the flat fields a pre-V2 importer reads
  assert.equal(out.name, "Tanjiro");
  assert.equal(out.first_mes, "Hello there.");
  assert.equal(out.description, "A kind demon slayer.\n\nWears checkered haori.");
  assert.equal(out.avatar, "https://ella.janitorai.com/bot-avatars/x.png");
  assert.equal(out.data.avatar, out.avatar);
});

test("unchecked blocks are excluded from the export", () => {
  const card = sampleCard();
  const blocks = X.toBlocks(card);
  const drop = new Set(
    blocks.filter((b) => b.kind === "lorebook" || b.id === "field:description:1").map((b) => b.id),
  );
  const included = new Set(blocks.map((b) => b.id).filter((id) => !drop.has(id)));
  const out = X.tavernCardV2(card, blocks, included);
  assert.equal(out.data.description, "A kind demon slayer.");
  assert.equal(out.data.character_book, undefined);
});

test("lorebookJson emits an indexed World Info map", () => {
  const card = sampleCard();
  const blocks = X.toBlocks(card);
  const out = X.lorebookJson(card, blocks, null);
  assert.equal(Object.keys(out.entries).length, 2);
  assert.deepEqual(out.entries[0].key, ["nichirin"]);
  assert.equal(out.entries[1].content, "Water breathing has ten forms.");
});

test("janitorJson round-trips greeting + alts into first_messages", () => {
  const card = sampleCard();
  const blocks = X.toBlocks(card);
  const out = X.janitorJson(card, blocks, null);
  assert.deepEqual(out.first_messages, ["Hello there.", "Oh, hi."]);
  assert.equal(out.scripts[0].entries.length, 2);
});

test("plainText renders headings and every kept entry", () => {
  const card = sampleCard();
  const blocks = X.toBlocks(card);
  const txt = X.plainText(card, blocks, null);
  assert.ok(txt.includes("# Tanjiro"));
  assert.ok(txt.includes("## Personality"));
  assert.ok(txt.includes("Lorebook (2 entries)"));
  assert.ok(txt.includes("A nichirin blade changes color."));
  assert.ok(!txt.includes("Creator:"));
});

test("slug is filesystem-safe", () => {
  assert.equal(X.slug("Tanjiro Kamado!! (v2)"), "tanjiro-kamado-v2");
  assert.equal(X.slug("星野 アイ"), "星野-アイ");
  assert.equal(X.slug(""), "character");
});

test("a personality that repeats the description is dropped", () => {
  const card = sampleCard();
  card.fields.description = "🖤 ¿Dónde estás?";
  card.fields.personality = "🖤 ¿Dónde estás?";
  const blocks = X.toBlocks(card);
  assert.equal(blocks.filter((b) => b.field === "personality").length, 0);
  assert.equal(blocks.filter((b) => b.field === "description").length, 1);
  // The drop is silent; nothing was lost, so the panel has no error to show.
  assert.equal(card.note, undefined);
  const out = X.rebuild(card, blocks, null);
  assert.equal(out.personality, "");
  assert.equal(out.description, "🖤 ¿Dónde estás?");
});

test("only the duplicated paragraph is dropped from a mixed personality", () => {
  const card = sampleCard();
  card.fields.description = "A kind demon slayer.";
  card.fields.personality = "A kind demon slayer.\n\nDetermined; gentle.";
  const blocks = X.toBlocks(card);
  const personality = blocks.filter((b) => b.field === "personality").map((b) => b.text);
  assert.deepEqual(personality, ["Determined; gentle."]);
  assert.ok(blocks.some((b) => b.field === "description" && b.text === "A kind demon slayer."));
});

const twoBookCard = () => ({
  name: "Arthur",
  creator: "io",
  tags: [],
  fields: { description: "", personality: "", scenario: "", greeting: "Hi.", altGreetings: [], exampleDialogue: "" },
  lorebooks: [
    { name: "Arthur personal", description: "char book", entries: [
      { keys: ["nsfw"], content: "kink info", comment: "NSFW" },
      { keys: ["demi"], content: "demihuman rules", comment: "INSTRUCTIONS" },
    ]},
    { name: "The Sinners world", description: "shared", entries: [
      { keys: ["rory"], content: "dragon crime lord", comment: "Rory" },
      { keys: ["ambrosia"], content: "magic drug", comment: "Ambrosia" },
      { keys: ["sinners"], content: "rival syndicate", comment: "Sinners" },
    ]},
  ],
});

test("lorebooksSeparate keeps each source book as its own file", () => {
  const card = twoBookCard();
  const blocks = X.toBlocks(card);
  const files = X.lorebooksSeparate(card, blocks, null);
  assert.equal(files.length, 2);
  assert.equal(files[0].name, "Arthur personal");
  assert.equal(files[1].name, "The Sinners world");
  assert.equal(Object.keys(files[0].json.entries).length, 2);
  assert.equal(Object.keys(files[1].json.entries).length, 3);
  assert.equal(files[1].json.entries[0].content, "dragon crime lord");
  assert.equal(files[1].json.description, "shared");
});

test("lorebooksSeparate respects unchecked entries and drops empty books", () => {
  const card = twoBookCard();
  const blocks = X.toBlocks(card);
  const drop = new Set(
    blocks.filter((b) => b.kind === "lorebook" && (b.bookIndex === 0 || b.id === "lore:1:0")).map((b) => b.id),
  );
  const included = new Set(blocks.map((b) => b.id).filter((id) => !drop.has(id)));
  const files = X.lorebooksSeparate(card, blocks, included);
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "The Sinners world");
  assert.equal(Object.keys(files[0].json.entries).length, 2);
});
