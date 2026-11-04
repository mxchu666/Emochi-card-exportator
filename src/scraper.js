(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});

  const LABELS = {
    description: [
      "description",
      "descripción",
      "descripcion",
      "character description",
      "descripción del personaje"
    ],
    definition: [
      "definition",
      "definición",
      "definicion",
      "character definition"
    ],
    personality: ["personality", "personalidad"],
    scenario: ["scenario", "escenario", "setting", "context"],
    greeting: [
      "greeting",
      "welcome message",
      "first message",
      "initial message",
      "mensaje de bienvenida",
      "saludo",
      "primer mensaje"
    ],
    exampleDialogue: [
      "example dialogue",
      "example dialogues",
      "example conversation",
      "sample conversation",
      "examples",
      "diálogo de ejemplo",
      "diálogos de ejemplo",
      "conversación de ejemplo"
    ],
    creator: ["creator", "author", "created by", "creador", "creado por", "autor"],
    tags: ["tags", "etiquetas"]
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
      'label,dt,h1,h2,h3,h4,h5,legend,p,span,strong,b,div,button,[aria-label],[data-label]';

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

      if (
        attributeLabels.some((label) => aliases.has(normLabel(label)))
      ) {
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
    const parts = location.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }

  function readName() {
    const h1 = [...document.querySelectorAll("h1")]
      .find((el) => isVisible(el) && visibleText(el));

    const metaTitle =
      document.querySelector('meta[property="og:title"]')?.content || "";

    const raw = visibleText(h1) || metaTitle || document.title || "";

    return raw
      .replace(/\s*[|·—–-]\s*Emochi.*$/i, "")
      .trim();
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
        .split(/[,;\n•|]+/)
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)
    )];
  }

  async function scanCharacter(opts = {}) {
    if (typeof opts.onProgress === "function") {
      opts.onProgress("Leyendo los datos visibles de la ficha...");
    }

    const name = readName();
    const fields = {
      description: readField("description"),
      definition: readField("definition"),
      personality: readField("personality"),
      scenario: readField("scenario"),
      greeting: readField("greeting"),
      altGreetings: [],
      exampleDialogue: readField("exampleDialogue")
    };

    const hasContent = Object.values(fields).some((value) =>
      typeof value === "string" ? value.trim() : false
    );

    if (!name && !hasContent) {
      const error = new Error("no-visible-card");
      error.friendly =
        "No encontré datos visibles de la ficha. Abre la página del personaje y comprueba que sus campos estén desplegados.";
      throw error;
    }

    return {
      id: currentCharacterId(),
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
    currentCharacterId,
    scanCharacter
  };
})();
