// Offscreen document: downloads the images of a ZIP job and builds the archives (src/packer.js).
// The service worker cannot turn a Blob into a URL for chrome.downloads, so this page does it and
// asks background.js to save each archive. It never sees the PixAI token: image links need none.
//
// Port "pgm-zip", to background.js:
//   {type: "event", jobId, msg}        packer events (progress, saving, part)
//   {type: "finished", jobId, result}
//   {type: "acquire", reqId}            wait for a shared download slot; {type: "release"} gives it back
//   {type: "save", reqId, jobId, url, name}
//   {type: "converted", reqId, ok, url?, ext?, error?}   answer to "convert"
// From background.js:
//   {type: "zip-start", jobId, job}  {type: "zip-cancel", jobId}
//   {type: "granted", reqId}  {type: "saved", reqId, ok, id?, error?}
//   {type: "convert", reqId, url}   one image for a separate-files download: fetched, a still WebP
//                                   turned into PNG (src/convert.js), handed back as a blob URL
//   {type: "revoke", url}           that download is finished
(function () {
  "use strict";
  const PGM = globalThis.PGM;
  const FETCH_TIMEOUT_MS = 5 * 60 * 1000;

  const port = chrome.runtime.connect({ name: "pgm-zip" });
  const jobs = new Map(); // jobId -> AbortController
  const waiting = new Map(); // reqId -> {resolve, reject, kind}
  let reqSeq = 0;
  let open = true;

  function post(msg) {
    if (!open) return;
    try {
      port.postMessage(msg);
    } catch (e) {
      open = false;
    }
  }

  function codeError(code) {
    return Object.assign(new Error(code), { code });
  }

  function request(msg, signal) {
    return new Promise((resolve, reject) => {
      const reqId = ++reqSeq;
      waiting.set(reqId, { resolve, reject, kind: msg.type });
      if (signal && msg.type === "acquire") {
        signal.addEventListener("abort", () => {
          if (!waiting.has(reqId)) return;
          waiting.delete(reqId); // a late "granted" for it is given straight back
          reject(codeError("CANCELLED"));
        }, { once: true });
      }
      post(Object.assign({}, msg, { reqId }));
    });
  }

  async function fetchFile(url, signal) {
    if (!PGM.util.isAllowedUrl(url)) throw codeError("BAD_URL");
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    if (signal) signal.addEventListener("abort", onAbort);
    try {
      const res = await fetch(url, { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
      if (!res.ok) throw codeError("HTTP_" + res.status);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      if (e && e.code) throw e;
      if (signal && signal.aborted) throw codeError("CANCELLED");
      if (ctrl.signal.aborted) throw codeError("TIMEOUT");
      throw codeError("FETCH_FAILED");
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }

  async function startJob(jobId, job) {
    const ctrl = new AbortController();
    jobs.set(jobId, ctrl);
    let result;
    try {
      result = await PGM.packer.run(job, {
        signal: ctrl.signal,
        fetchFile,
        acquire: (signal) => request({ type: "acquire" }, signal),
        release: () => post({ type: "release" }),
        onEvent: (msg) => post({ type: "event", jobId, msg }),
        transform: (bytes, entry) => PGM.convert.maybePng(bytes, entry.name),
        save: async (blob, name) => {
          const url = URL.createObjectURL(blob);
          try {
            const r = await request({ type: "save", jobId, url, name });
            if (!r.ok) throw codeError(r.error || "ZIP_SAVE_FAILED");
            return r.id;
          } finally {
            URL.revokeObjectURL(url);
          }
        }
      });
    } catch (e) {
      result = { done: 0, failed: [], zips: [], total: 0, cancelled: false, error: (e && e.code) || String(e) };
    }
    jobs.delete(jobId);
    post({ type: "finished", jobId, result });
  }

  const fileUrls = new Set(); // blob URLs handed out by "convert", until "revoke"

  async function convertOne(reqId, url) {
    try {
      const bytes = await fetchFile(url, null);
      const r = await PGM.convert.maybePng(bytes, "file.webp");
      const blobUrl = URL.createObjectURL(new Blob([r.bytes], { type: r.converted ? "image/png" : "application/octet-stream" }));
      fileUrls.add(blobUrl);
      post({ type: "converted", reqId, ok: true, url: blobUrl, ext: r.converted ? "png" : "" });
    } catch (e) {
      post({ type: "converted", reqId, ok: false, error: (e && e.code) || "FETCH_FAILED" });
    }
  }

  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "convert") {
      convertOne(msg.reqId, msg.url);
    } else if (msg.type === "revoke") {
      if (fileUrls.delete(msg.url)) URL.revokeObjectURL(msg.url);
    } else if (msg.type === "zip-start" && !jobs.has(msg.jobId)) {
      startJob(msg.jobId, msg.job || {});
    } else if (msg.type === "zip-cancel") {
      const ctrl = jobs.get(msg.jobId);
      if (ctrl) ctrl.abort();
    } else if (msg.type === "granted" || msg.type === "saved") {
      const w = waiting.get(msg.reqId);
      if (!w) {
        if (msg.type === "granted") post({ type: "release" });
        return;
      }
      waiting.delete(msg.reqId);
      w.resolve(msg);
    }
  });

  // The worker went away (restarted or the extension was reloaded): stop everything.
  port.onDisconnect.addListener(() => {
    open = false;
    for (const ctrl of jobs.values()) ctrl.abort();
    for (const w of waiting.values()) w.reject(codeError("DISCONNECTED"));
    waiting.clear();
  });
})();
