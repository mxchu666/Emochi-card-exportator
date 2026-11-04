(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});

 const LABELS = {
  description: [
    "description",
    "bio",
    "introduction",
    "intro",
    "descripción",
    "introducción"
  ],
  definition: [
    "definition",
    "character definition",
    "definición",
    "definición del personaje"
  ],
  personality: [
    "personality",
    "personality traits",
    "character traits",
    "traits",
    "personalidad",
    "rasgos de personalidad",
    "rasgos"
  ],
  scenario: [
    "scenario",
    "setting",
    "situation",
    "context",
    "escenario",
    "situación",
    "contexto"
  ],
  greeting: [
    "greeting",
    "welcome message",
    "first message",
    "opening message",
    "starter",
    "saludo",
    "mensaje de bienvenida",
    "mensaje inicial"
  ],
  exampleDialogue: [
    "example dialogue",
    "example dialogues",
    "example conversation",
    "sample conversation",
    "diálogo de ejemplo",
    "diálogos de ejemplo",
    "conversación de ejemplo"
  ],
  creator: [
    "creator",
    "author",
    "created by",
    "creador",
    "autor",
    "creado por"
  ],
  tags: [
    "tags",
    "tag",
    "etiquetas",
    "categorías",
    "categoría"
  ]
};

  function normLabel(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const ALL_LABELS = new Set(
    Object.values(LABELS).flat().map(normLabel)
  );

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      el.getClientRects().length > 0
    );
  }

  function visibleText(el) {
    if (!el) return "";
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement
    ) {
      return String(el.value || "").trim();
    }
    return String(el.innerText || el.textContent || "").trim();
  }

  function stripLabelPrefix(raw, aliases) {
    const lines = String(raw || "")
      .replace(/\r/g, "")
      .split("\n");

    while (lines.length && !lines[0].trim()) lines.shift();
    if (!lines.length) return null;

    const first = lines[0];
    const colon = first.search(/[:：]/);

    if (colon >= 0 && aliases.has(normLabel(first.slice(0, colon)))) {
      lines[0] = first.slice(colon + 1).trim();
      const result = lines.join("\n").trim();
      return result || null;
    }

    if (aliases.has(normLabel(first))) {
      const result = lines.slice(1).join("\n").trim();
      return result || null;
    }

    return null;
  }

  function candidateValue(el, aliases) {
    const raw = visibleText(el);
    if (!raw) return "";

    const stripped = stripLabelPrefix(raw, aliases);
    const value = (stripped === null ? raw : stripped).trim();

    if (!value || ALL_LABELS.has(normLabel(value))) return "";
    return value;
  }

  function valueAfterLabel(el, aliases) {
    if (el instanceof HTMLLabelElement && el.htmlFor) {
      const control = document.getElementById(el.htmlFor);
      const value = candidateValue(control, aliases);
      if (value) return value;
    }

    // Busca primero elementos que siguen a la etiqueta.
    let current = el;
    for (let depth = 0; depth < 4 && current; depth++) {
      const sibling = current.nextElementSibling;
      if (sibling && isVisible(sibling)) {
        const value = candidateValue(sibling, aliases);
        if (value) return value;
      }
      current = current.parentElement;
    }

    // Último recurso: contenedor pequeño que tenga etiqueta y contenido.
    current = el.parentElement;
    for (let depth = 0; depth < 3 && current; depth++) {
      if (isVisible(current)) {
        const value = stripLabelPrefix(visibleText(current), aliases);
        if (value) return value;
      }
      current = current.parentElement;
    }

    return "";
  }

  function readField(key) {
  const aliases = new Set((LABELS[key] || []).map(normLabel));
  const selector =
  'label,dt,h1,h2,h3,h4,h5,legend,p,span,strong,b,div,section,article,button,[aria-label],[data-label]';

  const nodes = [...document.querySelectorAll(selector)]
    .filter(isVisible)
    .map((el) => ({ el, raw: visibleText(el) }))
    .filter((item) => item.raw && item.raw.length < 150000)
    .sort((a, b) => a.raw.length - b.raw.length);

  for (const { el, raw } of nodes) {
    const attributeLabels = [
      el.getAttribute("aria-label"),
      el.getAttribute("data-label")
    ].filter(Boolean);

    if (attributeLabels.some((label) => aliases.has(normLabel(label)))) {
      const value = candidateValue(el, aliases);
      if (value) return value;
    }

    if (aliases.has(normLabel(raw))) {
      const value = valueAfterLabel(el, aliases);
      if (value) return value;
    }

    const inlineValue = stripLabelPrefix(raw, aliases);
    if (inlineValue) return inlineValue;
  }

  return "";
}

function currentCharacterId() {
  const match = location.pathname.match(/\/character\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : "";
}

function readName() {
  function cleanTitle(value) {
    return String(value || "")
      .replace(/^\s*chat\s+with\s+/i, "")
      .replace(
        /\s*[|·—–-]\s*AI Character\s+(?:Profile|Chat)\s+on\s+Emochi.*$/i,
        ""
      )
      .replace(/\s*[|·—–-]\s*Emochi.*$/i, "")
      .trim();
  }

  const headings = [...document.querySelectorAll("h1")]
    .filter(isVisible)
    .map((el) => cleanTitle(visibleText(el)))
    .filter(Boolean);

  if (headings.length) {
    return headings.sort((a, b) => a.length - b.length)[0];
  }

  const metaTitle =
    document.querySelector('meta[property="og:title"]')?.content || "";

  return cleanTitle(metaTitle || document.title);
}

function absoluteHttpUrl(value) {
  try {
    const url = new URL(value, location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function readAvatarUrl(name) {
  const metaImage =
    document.querySelector('meta[property="og:image"]')?.content ||
    document.querySelector('meta[name="twitter:image"]')?.content;

  if (metaImage) return absoluteHttpUrl(metaImage);

  const images = [...document.images].filter(isVisible);
  const namedImage = images.find((img) =>
    name &&
    String(img.alt || "").toLowerCase().includes(name.toLowerCase())
  );

  const image =
    namedImage ||
    images.find((img) => img.naturalWidth >= 64 || img.width >= 64);

  return absoluteHttpUrl(image?.currentSrc || image?.src || "");
}

function parseTags(raw) {
  return [...new Set(
    String(raw || "")
      .split(/[,;\n\u2022|]+/)
      .map((tag) => tag.trim().replace(/^#/, ""))
      .filter(Boolean)
  )];
} 

  function readEmochiDescription(name) {
  const root = document.querySelector("main") || document.body;
  const ignoredHeading =
    /^(personajes similares|similar characters|comentarios|comments?)$/i;

  const candidates = [...root.querySelectorAll("h2,h3,p,[role='heading']")];

  for (const el of candidates) {
    if (!isVisible(el)) continue;

    const value = visibleText(el).replace(/\s+/g, " ").trim();

    if (value.length < 40) continue;
    if (ignoredHeading.test(value)) continue;
    if (/AI Character (?:Profile|Chat) on Emochi/i.test(value)) continue;
    if (normLabel(value) === normLabel(name)) continue;

    return value;
  }

  return "";
}

 async function scanCharacter(opts = {}) {
  if (typeof opts.onProgress === "function") {
    opts.onProgress("Leyendo los datos visibles de la ficha...");
  }

  const name = readName();

  const fields = {
    description:
    readField("description") || readEmochiDescription(name),
    definition: readField("definition"),
    personality: readField("personality"),
    scenario: readField("scenario"),
    greeting: readField("greeting"),
    altGreetings: [],
    exampleDialogue: readField("exampleDialogue")
  };

  const hasCharacterData = [
    fields.description,
    fields.definition,
    fields.personality,
    fields.scenario,
    fields.greeting,
    fields.exampleDialogue
  ].some((value) => typeof value === "string" && value.trim());

  if (!hasCharacterData) {
    const error = new Error("no-visible-character-fields");
    error.friendly =
      "No encontré campos visibles de la ficha. Abre su información y vuelve a intentarlo.";
    throw error;
  }

  const pathParts = location.pathname.split("/").filter(Boolean);

  return {
    id: pathParts[pathParts.length - 1] || "",
    name: name || "Personaje de Emochi",
    creator: readField("creator"),
    avatarUrl: readAvatarUrl(name),
    nsfw: false,
    tags: parseTags(readField("tags")),
    sourceUrl: location.href,
    fields,
    scriptRefs: [],
    lorebooks: [],
    failedLorebooks: 0
  };
}

NS.scraper = {
  scanCharacter
};
})();
