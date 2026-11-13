// Fetches on behalf of the content script.
//
// The Emochi API answers with `Access-Control-Allow-Origin: *` and no
// `Access-Control-Allow-Headers`, so a page-context request carrying an
// Authorization header dies at the CORS preflight before it is ever sent.
// Extension-service-worker requests are not subject to CORS, so authorized
// reads have to originate here.
//
// Polybuzz needs the same worker for the opposite reason: its account-only
// endpoint authenticates with cookies, and a credentialed cross-origin fetch
// from the page is refused. Here `credentials: "include"` plus the manifest's
// host permission sends the signed-in cookies.

const TIMEOUT_MS = 20000;
// A character page's server-rendered stream is large; the Character.ai fallback
// parses the record out of that HTML, so the cap has to clear a full document.
const MAX_BODY = 5 * 1024 * 1024;
// Portraits are re-encoded to 512x512 by the exporter; this only has to stop a
// hostile or broken URL from pulling an unbounded body into memory.
const MAX_IMAGE = 8 * 1024 * 1024;
const METHODS = new Set(["GET", "POST"]);

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Portraits are tried here first: the worker is not CORS-bound and it carries
// the session cookie that cdn.crushon.ai requires. The Emochi and Polybuzz CDNs
// also allow a direct cross-origin image load (they reflect `Origin` into
// `Access-Control-Allow-Origin`), which the exporter uses when this fails. The
// bytes are handed back as base64 for the exporter to decode into a bitmap.
function fetchImage(url, sendResponse) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  fetch(url, { signal: controller.signal, credentials: "include" })
    .then(async (response) => {
      const mime = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!response.ok) {
        sendResponse({ ok: false, status: response.status, error: "http " + response.status });
        return;
      }
      if (!mime.startsWith("image/")) {
        sendResponse({ ok: false, status: response.status, error: "not an image: " + (mime || "no type") });
        return;
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE) {
        sendResponse({ ok: false, status: response.status, error: "image larger than 8 MB" });
        return;
      }
      sendResponse({ ok: true, status: response.status, mime, base64: base64(buffer) });
    })
    .catch((error) => {
      sendResponse({ ok: false, status: 0, error: String((error && error.message) || error) });
    })
    .finally(() => clearTimeout(timer));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "jaix:image" && typeof message.url === "string") {
    fetchImage(message.url, sendResponse);
    return true;
  }
  if (!message || message.type !== "jaix:fetch" || typeof message.url !== "string") {
    return false;
  }

  const method = METHODS.has(String(message.method || "").toUpperCase())
    ? String(message.method).toUpperCase()
    : "GET";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const init = {
    method,
    headers: message.headers || {},
    signal: controller.signal,
    credentials: message.credentials === "include" ? "include" : "omit",
  };
  if (method === "POST" && typeof message.body === "string") init.body = message.body;

  fetch(message.url, init)
    .then(async (response) => {
      const text = await response.text();
      const clipped = text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text;
      let body = null;
      try {
        body = JSON.parse(clipped);
      } catch {
        body = null;
      }
      sendResponse({
        ok: response.ok,
        status: response.status,
        body,
        // Full text, not a preview: Polybuzz's reader parses the server-rendered
        // HTML that comes back here. MAX_BODY still caps it at 2 MB.
        text: body ? "" : clipped,
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        status: 0,
        error: String((error && error.message) || error),
      });
    })
    .finally(() => clearTimeout(timer));

  // Keeps the message channel open for the async reply above.
  return true;
});
