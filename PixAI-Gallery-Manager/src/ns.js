// Shared namespace and tiny helpers. Loaded first in the content script and
// by background.js (importScripts), so it must not touch window, document or chrome.
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});

  // Hosts allowed for image URLs and downloads (EXT_SPEC rule 0.5).
  const ALLOWED_HOSTS = ["images-ng.pixai.art", "cdn.pixai.art", "api.pixai.art"];

  class PGMError extends Error {
    constructor(status, code, message) {
      super(message || code);
      this.name = "PGMError";
      this.status = status || 0;
      this.code = code || "ERROR";
    }
  }

  // The harness sets PGM_TEST_API_BASE. On pixai.art it is ignored: an element with that id would
  // become a window property there and could send API requests, token included, elsewhere.
  function testApiBase() {
    const host = (globalThis.location && location.hostname) || "";
    if (host === "pixai.art" || host.endsWith(".pixai.art")) return "";
    const base = globalThis.PGM_TEST_API_BASE;
    return typeof base === "string" ? base : "";
  }

  // In test mode (harness) the mock server host is allowed as well.
  function testHost() {
    const base = testApiBase();
    if (!base) return "";
    try {
      return new URL(base).host;
    } catch (e) {
      return "";
    }
  }

  function isAllowedUrl(url) {
    if (typeof url !== "string" || url.length > 2048) return false;
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return false;
    }
    if (u.username || u.password) return false;
    if (u.protocol === "https:" && !u.port && ALLOWED_HOSTS.includes(u.hostname)) return true;
    const t = testHost();
    return !!t && (u.protocol === "http:" || u.protocol === "https:") && u.host === t;
  }

  function chunk(list, size) {
    const n = Math.max(1, Math.floor(size) || 1);
    const out = [];
    for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  PGM.PGMError = PGMError;
  PGM.util = Object.assign(PGM.util || {}, { ALLOWED_HOSTS, isAllowedUrl, testApiBase, chunk, sleep });
})();
