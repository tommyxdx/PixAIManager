// Pure download queue plus entry validation. Used by background.js (with chrome.downloads)
// and by tests (with a fake run). Needs PGM.util from src/ns.js for URL checks.
//
//   const q = PGM.queue.createQueue({concurrency, run(entry) -> Promise, onProgress(p)});
//   q.start(entries) -> Promise<{done, failed: [{entry, error}], total, cancelled}>
//   q.cancel()        stops starting new entries; entries already running finish.
//   p = {done, failed (count), total, current: entry, error: string|null}, once per finished entry.
//
//   PGM.queue.checkEntry({url, path}) -> null | "BAD_URL" | "BAD_PATH"
//   PGM.queue.isSafePath(path)        -> relative, "/"-separated, no "..", no forbidden characters
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});

  const BAD_SEGMENT = /[\p{Cc}\p{Cf}~<>:"\\|?*\uFDD0-\uFDEF\uFFFE\uFFFF]/u;
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

  function errorText(e) {
    if (e && typeof e.code === "string" && e.code) return e.code;
    if (e && e.message) return e.message;
    return String(e);
  }

  function createQueue(opts) {
    const o = opts || {};
    const limit = Math.max(1, Math.floor(o.concurrency) || 1);
    const run = o.run;
    const onProgress = typeof o.onProgress === "function" ? o.onProgress : () => {};
    let cancelled = false;
    let started = false;

    function start(entries) {
      if (started) return Promise.reject(new Error("queue already started"));
      started = true;
      const list = Array.from(entries || []);
      const total = list.length;
      const failed = [];
      let next = 0;
      let done = 0;

      async function worker() {
        while (!cancelled && next < list.length) {
          const entry = list[next++];
          let error = null;
          try {
            await run(entry);
          } catch (e) {
            error = errorText(e);
          }
          if (error === null) done++;
          else failed.push({ entry, error });
          try {
            onProgress({ done, failed: failed.length, total, current: entry, error });
          } catch (e) {
            /* a broken listener must not stop the queue */
          }
        }
      }

      const workers = [];
      for (let i = 0; i < Math.min(limit, total); i++) workers.push(worker());
      return Promise.all(workers).then(() => ({ done, failed, total, cancelled }));
    }

    return {
      start,
      cancel() {
        cancelled = true;
      },
      get cancelled() {
        return cancelled;
      }
    };
  }

  function isSafePath(path) {
    if (typeof path !== "string" || !path || path.length > 400) return false;
    return path.split("/").every(
      (s) =>
        s !== "" &&
        s !== "." &&
        s !== ".." &&
        s.trim() === s &&
        !s.startsWith(".") &&
        !s.endsWith(".") &&
        !/\.(lnk|local)$/i.test(s) &&
        !BAD_SEGMENT.test(s) &&
        !RESERVED.test(s)
    );
  }

  function checkEntry(entry) {
    const allowed = PGM.util && PGM.util.isAllowedUrl;
    if (!entry || !allowed || !allowed(entry.url)) return "BAD_URL";
    if (!isSafePath(entry.path)) return "BAD_PATH";
    return null;
  }

  PGM.queue = { createQueue, isSafePath, checkEntry };
})();
