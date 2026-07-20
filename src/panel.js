(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});
  const { scraper, exporters } = NS;

  let root = null;
  let launcher = null;
  let ui = null;
  const state = { card: null, blocks: [], included: new Set(), busy: false, note: "" };

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === "class") e.className = attrs[k];
        else if (k === "text") e.textContent = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function") {
          e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else e.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach((c) => e.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return e;
  }

  const ICONS = {
    close: ["M6 6l12 12", "M18 6 6 18"],
    scan: [
      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8",
      "M14 2v6h6",
      "M14.5 15.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7",
      "m17 21 3 3",
    ],
    deep: [
      "m12 3 1.1 3.1L16 7.2l-2.9 1.1L12 11.5l-1.1-3.2L8 7.2l2.9-1.1L12 3Z",
      "m18 13 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13Z",
      "m6 13 1 2.7 2.5 1-2.5 1L6 20.5l-1-2.8-2.5-1 2.5-1L6 13Z",
    ],
    download: ["M12 3v12", "m8 11 4 4 4-4", "M5 21h14"],
    book: [
      "M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z",
      "M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z",
    ],
    file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6"],
    text: ["M5 6h14", "M5 10h14", "M5 14h9", "M5 18h7"],
    copy: [
      "M9 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z",
      "M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2",
    ],
    layers: ["m12 2 9 5-9 5-9-5 9-5Z", "m3 12 9 5 9-5", "m3 17 9 5 9-5"],
  };

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "jaix-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const d of ICONS[name] || []) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  }

  function assetUrl(path) {
    return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL(path)
      : path;
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    root.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function json(obj) {
    return JSON.stringify(obj, null, 2);
  }

  function setStatus(msg, kind) {
    if (!ui) return;
    ui.status.textContent = msg || "";
    ui.status.className = "jaix-status" + (kind ? " jaix-status--" + kind : "");
  }

  function syncBusy() {
    if (!ui) return;
    ui.panel.setAttribute("aria-busy", state.busy ? "true" : "false");
    ui.scanButtons.forEach((button) => {
      button.disabled = state.busy;
    });
  }

  function renderResult() {
    ui.result.textContent = "";
    const card = state.card;
    ui.panel.classList.toggle("jaix-panel--has-result", !!card);
    if (!card) {
      ui.exportRow.style.display = "none";
      return;
    }

    const loreCount = state.blocks.filter((b) => b.kind === "lorebook").length;
    const avatar = el("div", {
      class: "jaix-avatar",
      text: String(card.name || "?").slice(0, 1),
    });
    if (card.avatarUrl) {
      const avatarImage = el("img", {
        src: card.avatarUrl,
        alt: "",
        referrerpolicy: "no-referrer",
        onError: () => avatarImage.remove(),
      });
      avatar.appendChild(avatarImage);
    }
    ui.result.appendChild(
      el("div", { class: "jaix-cardhead" }, [
        avatar,
        el("div", { class: "jaix-cardcopy" }, [
          el("div", { class: "jaix-cardname", text: card.name }),
          el("div", {
            class: "jaix-cardmeta",
            text: "JanitorAI card",
          }),
        ]),
        el("div", { class: "jaix-counts" }, [
          el("span", {
            class: "jaix-count",
            text: state.blocks.length + (state.blocks.length === 1 ? " block" : " blocks"),
          }),
          el("span", {
            class: "jaix-count",
            text: loreCount + (loreCount === 1 ? " lore entry" : " lore entries"),
          }),
        ]),
      ]),
    );

    if (state.note) {
      ui.result.appendChild(el("div", { class: "jaix-note", text: state.note }));
    }

    ui.result.appendChild(
      el("div", { class: "jaix-selrow" }, [
        el(
          "button",
          { class: "jaix-link", type: "button", onClick: () => toggleAll(true) },
          ["Select all"],
        ),
        el(
          "button",
          { class: "jaix-link", type: "button", onClick: () => toggleAll(false) },
          ["Select none"],
        ),
        el("span", {
          class: "jaix-selcount",
          text: state.included.size + "/" + state.blocks.length + " kept",
        }),
      ]),
    );

    const list = el("div", { class: "jaix-blocks" });
    state.blocks.forEach((b) => {
      const checked = state.included.has(b.id);
      const row = el("label", { class: "jaix-block" + (checked ? "" : " jaix-block--off") });
      const cb = el("input", {
        type: "checkbox",
        "aria-label": "Include " + (b.label || b.kind),
      });
      cb.checked = checked;
      cb.addEventListener("change", () => {
        if (cb.checked) state.included.add(b.id);
        else state.included.delete(b.id);
        row.classList.toggle("jaix-block--off", !cb.checked);
        updateSelCount();
      });
      const body = el("div", { class: "jaix-block-body" }, [
        el("div", { class: "jaix-block-tag", text: b.kind === "lorebook" ? "Lorebook" : b.label }),
        el("div", { class: "jaix-block-text", text: preview(b.text) }),
      ]);
      row.appendChild(cb);
      row.appendChild(el("span", { class: "jaix-check", "aria-hidden": "true" }));
      row.appendChild(body);
      list.appendChild(row);
    });
    ui.result.appendChild(list);
    ui.exportRow.style.display = "";
    ui.exportCount.textContent = state.included.size + " selected";
    ui.sepBtn.style.display = (card.lorebooks || []).length > 1 ? "" : "none";
  }

  function updateSelCount() {
    const c = root.querySelector(".jaix-selcount");
    if (c) c.textContent = state.included.size + "/" + state.blocks.length + " kept";
    if (ui && ui.exportCount) ui.exportCount.textContent = state.included.size + " selected";
  }

  function preview(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    return t.length > 220 ? t.slice(0, 220) + "..." : t;
  }

  function toggleAll(on) {
    state.included = on ? new Set(state.blocks.map((b) => b.id)) : new Set();
    renderResult();
  }

  async function scan(deep) {
    if (state.busy) return;
    state.busy = true;
    syncBusy();
    setStatus(deep ? "Deep scanning..." : "Scanning...", "busy");
    try {
      const card = await scraper.scanCharacter({
        deep,
        onProgress: (m) => setStatus(m, "busy"),
      });
      state.card = card;
      state.blocks = exporters.toBlocks(card);
      state.included = new Set(state.blocks.map((b) => b.id));
      if (!deep && card.scriptRefs.length) {
        const label = card.scriptRefs.length === 1 ? "lorebook" : "lorebooks";
        state.note =
          card.scriptRefs.length + " " + label + " found. Run Deep scan to include the entries.";
      } else if (deep && card.failedLorebooks) {
        const label = card.failedLorebooks === 1 ? "lorebook" : "lorebooks";
        state.note =
          card.failedLorebooks + " " + label + " could not be read. Try the Deep scan again.";
      } else {
        state.note = "";
      }
      setStatus("", null);
      if (ui) renderResult();
    } catch (e) {
      state.card = null;
      state.blocks = [];
      state.included = new Set();
      state.note = "";
      if (ui) renderResult();
      const message = e && (e.friendly || e.message);
      setStatus(message || "Scan failed.", "err");
    } finally {
      state.busy = false;
      syncBusy();
    }
  }

  function exportAs(kind) {
    const card = state.card;
    if (!card) return;
    const inc = state.included;
    const base = exporters.slug(card.name);
    if (kind === "tavern") {
      download(base + ".card.json", json(exporters.tavernCardV2(card, state.blocks, inc)));
    } else if (kind === "lorebook") {
      download(base + ".lorebook.json", json(exporters.lorebookJson(card, state.blocks, inc)));
    } else if (kind === "lorebooks-separate") {
      const books = exporters.lorebooksSeparate(card, state.blocks, inc);
      if (!books.length) {
        setStatus("No lorebook entries selected to export.", "err");
        return;
      }
      books.forEach((b, i) => {
        const fname = base + "." + exporters.slug(b.name) + ".lorebook.json";
        setTimeout(() => download(fname, json(b.json)), i * 400);
      });
      setStatus("Exporting " + books.length + " separate lorebook file(s).", "ok");
    } else if (kind === "janitor") {
      download(base + ".jai.json", json(exporters.janitorJson(card, state.blocks, inc)));
    } else if (kind === "text") {
      download(base + ".txt", exporters.plainText(card, state.blocks, inc), "text/plain");
    } else if (kind === "copy") {
      const text = json(exporters.tavernCardV2(card, state.blocks, inc));
      const clipboard = navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== "function") {
        setStatus("Clipboard access is unavailable. Export the card instead.", "err");
        return;
      }
      clipboard
        .writeText(text)
        .then(() => setStatus("SillyTavern JSON copied to clipboard.", "ok"))
        .catch(() => setStatus("Couldn't copy - your browser blocked clipboard access.", "err"));
    }
  }

  function buildPanel() {
    const panel = el("section", {
      id: "jaix-panel",
      class: "jaix-panel",
      role: "dialog",
      "aria-label": "Inkwell Card Extractor",
      "aria-busy": "false",
      tabindex: "-1",
    });

    const closeButton = el(
      "button",
      {
        class: "jaix-x",
        type: "button",
        title: "Close",
        "aria-label": "Close card extractor",
        onClick: togglePanel,
      },
      [icon("close")],
    );

    const header = el("div", { class: "jaix-header" }, [
      el("div", { class: "jaix-brand" }, [
        el("img", {
          class: "jaix-wordmark",
          src: assetUrl("assets/inkwell-wordmark.webp"),
          alt: "Inkwell",
        }),
        el("span", { class: "jaix-tool-label", text: "Card extractor" }),
      ]),
      closeButton,
    ]);

    const quickButton = el(
      "button",
      {
        class: "jaix-btn jaix-btn--primary jaix-btn--scan",
        type: "button",
        onClick: () => scan(false),
      },
      [
        el("span", { class: "jaix-btn-icon" }, [icon("scan")]),
        el("span", { class: "jaix-btn-copy" }, [
          el("span", { class: "jaix-btn-title", text: "Quick scan" }),
          el("span", { class: "jaix-btn-sub", text: "Character card" }),
        ]),
      ],
    );

    const deepButton = el(
      "button",
      {
        class: "jaix-btn jaix-btn--secondary jaix-btn--scan",
        type: "button",
        onClick: () => scan(true),
      },
      [
        el("span", { class: "jaix-btn-icon" }, [icon("deep")]),
        el("span", { class: "jaix-btn-copy" }, [
          el("span", { class: "jaix-btn-title", text: "Deep scan" }),
          el("span", { class: "jaix-btn-sub", text: "Card + lorebooks" }),
        ]),
      ],
    );

    const status = el("div", {
      class: "jaix-status",
      role: "status",
      "aria-live": "polite",
    });
    const scanSection = el("div", { class: "jaix-scan" }, [
      el("h2", {
        id: "jaix-panel-title",
        class: "jaix-scan-title",
        text: "Character card",
      }),
      el("p", {
        class: "jaix-hint",
        text: "Quick gets the card. Deep also gets every linked lorebook.",
      }),
      el("div", { class: "jaix-scanrow" }, [quickButton, deepButton]),
      status,
    ]);

    const result = el("div", { class: "jaix-result" });

    const sepBtn = el(
      "button",
      {
        class: "jaix-btn jaix-btn--export",
        type: "button",
        onClick: () => exportAs("lorebooks-separate"),
      },
      [icon("layers"), el("span", { text: "Separate books" })],
    );
    sepBtn.style.display = "none";

    const exportCount = el("span", { class: "jaix-export-count", text: "0 selected" });
    const exportRow = el("div", { class: "jaix-exportrow" }, [
      el("div", { class: "jaix-export-head" }, [
        el("div", { class: "jaix-export-title", text: "Export selected" }),
        exportCount,
      ]),
      el(
        "button",
        {
          class: "jaix-btn jaix-btn--export jaix-btn--export-primary",
          type: "button",
          onClick: () => exportAs("tavern"),
        },
        [
          icon("download"),
          el("span", { text: "SillyTavern card" }),
          el("span", { class: "jaix-export-format", text: ".card.json" }),
        ],
      ),
      el(
        "button",
        {
          class: "jaix-btn jaix-btn--export",
          type: "button",
          onClick: () => exportAs("lorebook"),
        },
        [
          icon("book"),
          el("span", { text: "Lorebook" }),
          el("span", { class: "jaix-export-format", text: ".json" }),
        ],
      ),
      sepBtn,
      el(
        "button",
        {
          class: "jaix-btn jaix-btn--export",
          type: "button",
          onClick: () => exportAs("text"),
        },
        [
          icon("text"),
          el("span", { text: "Plain text" }),
          el("span", { class: "jaix-export-format", text: ".txt" }),
        ],
      ),
      el(
        "button",
        {
          class: "jaix-btn jaix-btn--export",
          type: "button",
          onClick: () => exportAs("janitor"),
        },
        [
          icon("file"),
          el("span", { text: "JanitorAI" }),
          el("span", { class: "jaix-export-format", text: ".json" }),
        ],
      ),
      el(
        "button",
        {
          class: "jaix-btn jaix-btn--export",
          type: "button",
          onClick: () => exportAs("copy"),
        },
        [icon("copy"), el("span", { text: "Copy card JSON" })],
      ),
    ]);
    exportRow.style.display = "none";

    const footer = el("div", { class: "jaix-footer" }, [
      el("span", { text: "Files stay on this device" }),
      el(
        "a",
        {
          href: "https://inkwell.rip",
          target: "_blank",
          rel: "noopener noreferrer",
          class: "jaix-link",
        },
        ["inkwell.rip"],
      ),
    ]);

    panel.appendChild(header);
    panel.appendChild(scanSection);
    panel.appendChild(result);
    panel.appendChild(exportRow);
    panel.appendChild(footer);

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") togglePanel();
    });

    ui = {
      panel,
      closeButton,
      status,
      result,
      exportRow,
      exportCount,
      sepBtn,
      scanButtons: [quickButton, deepButton],
    };
    return panel;
  }

  function togglePanel() {
    const open = root.querySelector(".jaix-panel");
    if (open) {
      open.remove();
      ui = null;
      launcher.setAttribute("aria-expanded", "false");
      launcher.focus();
      return;
    }
    root.querySelector(".jaix-wrap").appendChild(buildPanel());
    launcher.setAttribute("aria-expanded", "true");
    syncBusy();
    renderResult();
    requestAnimationFrame(() => {
      if (ui) ui.panel.focus({ preventScroll: true });
    });
  }

  function mount() {
    if (document.getElementById("jaix-host")) return;
    const host = el("div", { id: "jaix-host" });
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = assetUrl("src/panel.css");
    shadow.appendChild(link);

    root = shadow;
    const wrap = el("div", { class: "jaix-wrap" });
    launcher = el(
      "button",
      {
        class: "jaix-fab",
        type: "button",
        title: "Open Inkwell Card Extractor",
        "aria-label": "Open Inkwell Card Extractor",
        "aria-controls": "jaix-panel",
        "aria-expanded": "false",
        onClick: togglePanel,
      },
      [
        el("img", {
          class: "jaix-fab-mark",
          src: assetUrl("assets/inkwell-mark.png"),
          alt: "",
        }),
        el("span", { text: "Extract card" }),
      ],
    );
    wrap.appendChild(launcher);
    shadow.appendChild(wrap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
