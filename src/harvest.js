// Shared plumbing for the sites that only expose a character to their own
// client: Character.ai and Crushon.ai both render from a payload their own
// JavaScript fetched, and both keep it behind a session the extension cannot
// mint. So the reader listens instead of asking.
//
// `src/intercept.js` runs in the page's world, watches every JSON response the
// site itself receives, and re-broadcasts it as a DOM event carrying a string.
// A string crosses the world boundary; objects do not. This module collects
// those strings, plus whatever the page server-rendered, and hands the reader
// the object that looks most like a character record.
//
// The interception component is adapted from
// https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter
// (MIT), by taquanta. Credit is required if this fork is reused.
(function () {
  "use strict";

  const NS = (window.JAIX = window.JAIX || {});
  if (NS.harvest) return;

  const s = (v) => (typeof v === "string" ? v.trim() : "");
  const MAX_PAYLOADS = 40;
  const MAX_BYTES = 500000;

  const seen = [];

  function remember(text) {
    const raw = s(text);
    if (!raw || raw.length > MAX_BYTES || seen.length >= MAX_PAYLOADS) return;
    try {
      seen.push(JSON.parse(raw));
      seen.push(raw);
    } catch {
      /* not JSON: the readers only want JSON */
    }
  }

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("jaix:payload", (event) => remember(event && event.detail));
    // `intercept.js` keeps a backlog because it starts at document_start and this
    // file starts at document_idle; drain it, then the event channel takes over.
    const backlog = window.__jaixPayloads;
    if (Array.isArray(backlog)) backlog.forEach((entry) => remember(entry));
  }

  function payloads() {
    return seen.slice();
  }

  // `intercept.js` stores the page's own auth header here. The value is the whole
  // header ("Token <hex>"), because that is what the API expects back.
  function token() {
    const tag = document.querySelector("meta[jaix_token]");
    const value = tag ? s(tag.getAttribute("jaix_token")) : "";
    return value.replace(/^token\s+/i, "").replace(/^bearer\s+/i, "");
  }

  function nextData() {
    if (typeof document === "undefined" || !document) return null;
    const tag = document.getElementById("__NEXT_DATA__");
    if (!tag) return null;
    try {
      return JSON.parse(tag.textContent);
    } catch {
      return null;
    }
  }

  // Every server-rendered payload in the page: Nuxt, Next, and plain inline
  // JSON blobs a framework left in a script tag.
  function documentPayloads() {
    const out = [];
    if (typeof document === "undefined" || !document) return out;
    const next = nextData();
    if (next) out.push(next);
    const nuxt = document.getElementById("__NUXT_DATA__");
    if (nuxt) out.push(nuxt.textContent);
    document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]').forEach((node) => {
      const text = s(node.textContent);
      if (text) out.push(text);
    });
    return out;
  }

  // Depth-first walk over a parsed payload. JSON strings inside payloads are
  // parsed too, because both sites embed their record as an escaped string in at
  // least one place.
  function walk(node, visit, depth) {
    if (!node || depth > 8) return;
    if (typeof node === "string") {
      const text = s(node);
      if (text.length > 2 && (text[0] === "{" || text[0] === "[")) {
        try {
          walk(JSON.parse(text), visit, depth + 1);
        } catch {
          /* not JSON */
        }
      }
      return;
    }
    if (typeof node !== "object") return;
    if (!Array.isArray(node)) visit(node);
    for (const key of Object.keys(node)) walk(node[key], visit, depth + 1);
  }

  // The character record is whichever object carries the most of the keys the
  // caller names, with the deepest, richest match winning. Both sites put the
  // card inside a wrapper, and the wrapper also carries `name`, so scoring by
  // how many known fields are present is the reliable way to pick the inner one.
  function bestCharacter(roots, keys) {
    const scored = [];
    for (const root of roots) {
      if (typeof root === "string") {
        try {
          walk(JSON.parse(root), score, 0);
        } catch {
          /* not JSON */
        }
      } else {
        walk(root, score, 0);
      }
    }

    function score(node) {
      let hits = 0;
      let filled = 0;
      for (const key of keys) {
        if (!(key in node)) continue;
        hits += 1;
        const value = node[key];
        if (typeof value === "string" ? value.trim() : value) filled += 1;
      }
      if (hits < 3 || !filled) return;
      scored.push({ node, weight: hits * 10 + filled });
    }

    scored.sort((a, b) => b.weight - a.weight);
    return scored.length ? scored[0].node : null;
  }

  function firstString(node, keys) {
    const target = node && typeof node === "object" ? node : {};
    for (const key of keys) {
      const value = target[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function firstValue(node, keys) {
    const target = node && typeof node === "object" ? node : {};
    for (const key of keys) {
      const value = target[key];
      if (value === undefined || value === null || value === "") continue;
      return value;
    }
    return "";
  }

  NS.harvest = {
    payloads,
    token,
    nextData,
    documentPayloads,
    bestCharacter,
    firstString,
    firstValue,
    roots: () => payloads().concat(documentPayloads()),
  };
})();
