// Page-world sniffer for sites that only hand a character to their own client.
//
// Adapted from `intercept.js` in
// https://github.com/taquanta/character-ai-to-crushon-ai-card-exporter (MIT),
// by taquanta. Two changes: the token goes into a namespaced meta tag, and every
// JSON response the page receives is re-broadcast as a DOM event so the isolated
// world can read it.
//
// Why MAIN world: in the isolated world `window.fetch` cannot be shadowed in a
// way that observes the page's own requests. Why it is safe: requests are only
// read, never modified, and the original call is re-dispatched untouched.
(function () {
  "use strict";

  if (window.__jaixInterceptInstalled) return;
  window.__jaixInterceptInstalled = true;

  const TOKEN_META = "jaix_token";
  const EVENT = "jaix:payload";
  const MAX_BYTES = 500000;
  const INTERESTING = /character|prompt|chat\/char|bot|persona|scene/i;

  let lastToken = "";

  function persistToken(value) {
    if (typeof value !== "string") return;
    const raw = value.trim();
    if (!raw || raw === lastToken) return;
    if (!/(token|bearer)\s+[A-Za-z0-9._\-]+/i.test(raw)) return;
    lastToken = raw;
    const write = () => {
      let meta = document.querySelector("meta[" + TOKEN_META + "]");
      if (!meta) {
        meta = document.createElement("meta");
        document.head.appendChild(meta);
      }
      meta.setAttribute(TOKEN_META, raw);
    };
    if (document.head) write();
    else document.addEventListener("DOMContentLoaded", write, { once: true });
  }

  function authFrom(headers) {
    if (!headers) return "";
    try {
      if (typeof Headers !== "undefined" && headers instanceof Headers) {
        return headers.get("authorization") || headers.get("Authorization") || "";
      }
      if (Array.isArray(headers)) {
        for (const pair of headers) {
          if (Array.isArray(pair) && String(pair[0]).toLowerCase() === "authorization") return pair[1] || "";
        }
        return "";
      }
      if (typeof headers === "object") {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === "authorization") return headers[key] || "";
        }
      }
    } catch {
      /* opaque headers */
    }
    return "";
  }

  function broadcast(url, text) {
    if (!text || text.length > MAX_BYTES) return;
    if (text[0] !== "{" && text[0] !== "[") return;
    if (!INTERESTING.test(url || "")) return;
    // The isolated-world collector attaches at document_idle, long after the
    // first requests go out, so the page keeps a short backlog the collector
    // drains on load. Without it, an early response is only recoverable by
    // replaying the call, and the replay needs a token that may not exist yet.
    try {
      const buffer = (window.__jaixPayloads = window.__jaixPayloads || []);
      buffer.push(text);
      if (buffer.length > 20) buffer.shift();
    } catch {
      /* the page froze its own globals */
    }
    try {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: text }));
    } catch {
      /* the isolated world is not listening */
    }
  }

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      try {
        if (init && init.headers) persistToken(authFrom(init.headers));
        if (input && typeof input === "object" && input.headers) persistToken(authFrom(input.headers));
      } catch {
        /* ignore */
      }
      const result = origFetch.apply(this, arguments);
      try {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        result.then(
          (response) => {
            if (!response || !response.ok) return undefined;
            const type = response.headers ? response.headers.get("content-type") || "" : "";
            if (!/json/i.test(type)) return undefined;
            // `clone()` so the page's own consumer is unaffected.
            return response
              .clone()
              .text()
              .then((text) => broadcast(url, text))
              .catch(() => undefined);
          },
          () => undefined,
        );
      } catch {
        /* ignore */
      }
      return result;
    };
  }

  const origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try {
      if (name && String(name).toLowerCase() === "authorization") persistToken(value);
    } catch {
      /* ignore */
    }
    return origSetRequestHeader.apply(this, arguments);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      this.addEventListener("load", () => {
        try {
          if (this.status < 200 || this.status >= 300) return;
          const type = this.getResponseHeader("content-type") || "";
          if (!/json/i.test(type)) return;
          if (this.responseType === "" || this.responseType === "text") {
            broadcast(String(url || ""), this.responseText);
          } else if (this.responseType === "json" && this.response) {
            broadcast(String(url || ""), JSON.stringify(this.response));
          }
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
    return origOpen.apply(this, arguments);
  };
})();
