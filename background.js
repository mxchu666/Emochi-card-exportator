// Fetches on behalf of the content script.
//
// The Emochi API answers with `Access-Control-Allow-Origin: *` and no
// `Access-Control-Allow-Headers`, so a page-context request carrying an
// Authorization header dies at the CORS preflight before it is ever sent.
// Extension-service-worker requests are not subject to CORS, so authorized
// reads have to originate here.

const TIMEOUT_MS = 20000;
const MAX_BODY = 2 * 1024 * 1024;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "jaix:fetch" || typeof message.url !== "string") {
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  fetch(message.url, {
    method: "GET",
    headers: message.headers || {},
    signal: controller.signal,
    credentials: "omit",
  })
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
        text: body ? "" : clipped.slice(0, 400),
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
