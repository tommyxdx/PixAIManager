// Content side of the download job protocol (background.js does the actual chrome.downloads work).
//
//   PGM.downloads.start({label, entries: [{url, path}], zip?}, onProgress) -> {cancel(), done: Promise<finished>}
//     onProgress gets {type:"progress", done, failed, total, current, index, error?}
//     and finally {type:"finished", done, failed: [{path, index, error}], total, cancelled?, zips?}.
//     entry.toPng: a still WebP is saved as PNG (converted in offscreen.html), like pixai.art's download button.
//     With zip = {baseName, dir, lang, partMB} the entries are {url, name, time} and the files are packed
//     into archives (offscreen.html); onProgress then also gets {type:"saving", name} and
//     {type:"part", name, ok, id?, error?, indices} as each archive is written.
//
//   PGM.downloads.prepare(images, {folderName}, {signal, onProgress}) -> Promise<[{url, path}]>
//     Builds file paths with PGM.naming; for collection artworks it first looks up the real
//     generation time (GET /artwork/{id}/task-parameters), one request at a time.
//
//   PGM.downloads.downloadImages(images, {folderName, label}, onProgress) -> {cancel(), done}
//     prepare + start in one job. Before the files start, onProgress also gets {type:"prepare", done, total}.
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});
  const PORT_NAME = "pgm-download";
  const KEEPALIVE_MS = 20000; // port traffic keeps the service worker alive during long jobs

  function safeCall(fn, msg) {
    if (typeof fn !== "function") return;
    try {
      fn(msg);
    } catch (e) {
      console.error("[PGM] download progress callback failed", e);
    }
  }

  function start(job, onProgress) {
    const label = String((job && job.label) || "");
    const zip = job && job.zip ? job.zip : null;
    const entries = ((job && job.entries) || [])
      .filter((e) => e && typeof (zip ? e.name : e.path) === "string")
      .map((e) => (zip
        ? { url: typeof e.url === "string" ? e.url : "", name: e.name, path: e.name, time: Number(e.time) || 0, toPng: !!e.toPng }
        : { url: typeof e.url === "string" ? e.url : "", path: e.path, toPng: !!e.toPng }));
    const total = entries.length;
    const pending = new Set(entries.map((e, i) => i));
    const failedSoFar = [];
    let doneSoFar = 0;
    let finished = false;
    let port = null;
    let timer = null;
    let resolveDone;
    const done = new Promise((resolve) => (resolveDone = resolve));

    function finish(msg) {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      safeCall(onProgress, msg);
      resolveDone(msg);
      try {
        if (port) port.disconnect();
      } catch (e) {
        /* already gone */
      }
    }

    function finishLater(msg) {
      setTimeout(() => finish(msg), 0);
      return { cancel() {}, done };
    }

    if (!total) return finishLater({ type: "finished", done: 0, failed: [], total: 0 });

    try {
      port = chrome.runtime.connect({ name: PORT_NAME });
    } catch (e) {
      // "Extension context invalidated": the extension was reloaded under this page.
      const failed = entries.map((x, index) => ({ path: x.path, index, error: "EXTENSION_RELOADED" }));
      return finishLater({ type: "finished", done: 0, failed, total });
    }

    port.onMessage.addListener((msg) => {
      if (!msg || finished) return;
      if (msg.type === "progress") {
        // A packed file is safe only once its archive is saved ("part").
        if (typeof msg.index === "number" && (!zip || msg.error)) pending.delete(msg.index);
        if (msg.error) failedSoFar.push({ path: msg.current, index: msg.index, error: msg.error });
        if (!zip) doneSoFar = msg.done;
        safeCall(onProgress, msg);
      } else if (msg.type === "part" || msg.type === "saving") {
        for (const i of (msg.type === "part" && Array.isArray(msg.indices) ? msg.indices : [])) {
          if (!pending.delete(i)) continue;
          if (msg.ok) doneSoFar++;
          else failedSoFar.push({ path: entries[i] ? entries[i].path : "", index: i, error: msg.error || "ZIP_SAVE_FAILED" });
        }
        safeCall(onProgress, msg);
      } else if (msg.type === "finished") {
        finish(msg);
      }
    });

    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      if (finished) return;
      const lost = [...pending].map((i) => ({ path: entries[i].path, index: i, error: "DISCONNECTED" }));
      finish({ type: "finished", done: doneSoFar, failed: failedSoFar.concat(lost), total, cancelled: false });
    });

    const concurrency = PGM.settings ? PGM.settings.current().concurrency : 3;
    port.postMessage({
      type: "start",
      label,
      concurrency,
      zip: zip || undefined,
      entries: entries.map((e, index) => (zip
        ? { url: e.url, name: e.name, time: e.time, toPng: e.toPng, index }
        : { url: e.url, path: e.path, toPng: e.toPng, index }))
    });
    timer = setInterval(() => {
      try {
        port.postMessage({ type: "ping" });
      } catch (e) {
        clearInterval(timer);
      }
    }, KEEPALIVE_MS);

    return {
      cancel() {
        if (finished) return;
        try {
          port.postMessage({ type: "cancel" });
        } catch (e) {
          /* the disconnect handler reports the rest */
        }
      },
      done
    };
  }

  async function prepare(images, options, opts) {
    const o = opts || {};
    const settings = await PGM.settings.get();
    const folderName = (options && options.folderName) || "";
    const list = (images || []).filter(Boolean);
    const entries = [];
    for (let i = 0; i < list.length; i++) {
      if (o.signal && o.signal.aborted) throw new PGM.PGMError(0, "ABORTED", "aborted");
      let image = list[i];
      if (image.source === "artwork" && image.artworkId) {
        try {
          const info = await PGM.api.generationInfo(image.artworkId, { signal: o.signal });
          if (info) {
            image = Object.assign({}, image, {
              createdAt: info.createdAt || image.createdAt,
              prompt: image.prompt || info.prompt,
              taskId: image.taskId || info.taskId
            });
          }
        } catch (e) {
          if (e.code === "ABORTED") throw e;
          // Otherwise keep the artwork's own createdAt (publish time).
        }
      }
      // Entries with a bad URL still go through: the background rejects them and lists them as failed.
      entries.push({ url: image.url || "", path: PGM.naming.buildPath(image, { folderName, settings }) });
      safeCall(o.onProgress, { done: i + 1, total: list.length });
    }
    return entries;
  }

  function downloadImages(images, options, onProgress) {
    const opt = options || {};
    const ctrl = new AbortController();
    let job = null;
    const done = (async () => {
      let entries;
      try {
        entries = await prepare(images, opt, {
          signal: ctrl.signal,
          onProgress: (p) => safeCall(onProgress, { type: "prepare", done: p.done, total: p.total })
        });
      } catch (e) {
        const cancelled = ctrl.signal.aborted;
        const failed = cancelled ? [] : [{ path: "", error: e.code || e.message || String(e) }];
        const msg = { type: "finished", done: 0, failed, total: (images || []).length, cancelled };
        safeCall(onProgress, msg);
        return msg;
      }
      job = start({ label: opt.label, entries }, onProgress);
      return job.done;
    })();
    return {
      cancel() {
        ctrl.abort();
        if (job) job.cancel();
      },
      done
    };
  }

  PGM.downloads = { start, prepare, downloadImages };
})();
