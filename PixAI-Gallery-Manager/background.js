// Service worker: toolbar button and the download job protocol (see src/downloads.js).
// It never sees the PixAI token; it only receives {url, path} pairs and validates each one.
importScripts("src/ns.js", "src/queue.js");

(function () {
  "use strict";
  const PGM = globalThis.PGM;
  const PORT_NAME = "pgm-download";
  const MAX_PARALLEL = 3; // across all jobs (EXT_SPEC rule 0.3)
  const MAX_ENTRIES = 20000;

  // ---- global download slots ------------------------------------------------

  let freeSlots = MAX_PARALLEL;
  const slotWaiters = [];

  function acquire() {
    if (freeSlots > 0) {
      freeSlots--;
      return Promise.resolve();
    }
    return new Promise((resolve) => slotWaiters.push(resolve));
  }

  function release() {
    const next = slotWaiters.shift();
    if (next) next();
    else freeSlots++;
  }

  // ---- completion tracking: one onChanged listener, keyed by download id ----

  const watchers = new Map();

  function settle(id, state, error, paused) {
    const w = watchers.get(id);
    if (!w) return;
    if (paused) {
      // A download the user paused would hold a shared slot forever; it stays in Chrome's list to resume.
      watchers.delete(id);
      w.reject(new Error("PAUSED_BY_USER"));
    } else if (state === "complete") {
      watchers.delete(id);
      w.resolve();
    } else if (state === "interrupted") {
      watchers.delete(id);
      w.reject(new Error(error || "DOWNLOAD_INTERRUPTED"));
    }
  }

  chrome.downloads.onChanged.addListener((delta) => {
    if (!delta) return;
    if (delta.paused && delta.paused.current) settle(delta.id, "in_progress", null, true);
    else if (delta.state) settle(delta.id, delta.state.current, delta.error && delta.error.current);
  });

  function waitForDownload(id) {
    return new Promise((resolve, reject) => {
      watchers.set(id, { resolve, reject });
      // The download may already have finished before the watcher existed.
      chrome.downloads
        .search({ id })
        .then((items) => {
          const item = items && items[0];
          if (item) settle(id, item.state, item.error, item.paused);
        })
        .catch(() => {});
    });
  }

  async function downloadOne(entry, job) {
    const problem = PGM.queue.checkEntry(entry);
    if (problem) throw new Error(problem);
    await acquire();
    let blobUrl = null;
    if (entry.toPng) offscreenUsers++;
    try {
      if (job.cancelled) throw new Error("CANCELLED");
      let url = entry.url;
      let path = entry.path;
      if (entry.toPng) {
        // A still WebP becomes PNG in the offscreen document (null: no document, save the original).
        const r = await convertWithRetry(entry, job);
        if (r) {
          blobUrl = url = r.url;
          if (r.ext === "png") path = path.replace(/\.webp$/i, ".png");
        }
      }
      const id = await chrome.downloads.download({ url, filename: path, conflictAction: "uniquify", saveAs: false });
      if (typeof id !== "number") throw new Error("DOWNLOAD_FAILED");
      await waitForDownload(id);
    } finally {
      if (blobUrl) revokeInOffscreen(blobUrl);
      if (entry.toPng && --offscreenUsers === 0 && !zipJobs.size) scheduleOffscreenClose();
      release();
    }
  }

  // ---- job protocol -----------------------------------------------------------

  function cleanEntries(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((e, i) => ({
      url: e && typeof e.url === "string" ? e.url : "",
      path: e && typeof e.path === "string" ? e.path : "",
      index: e && Number.isInteger(e.index) ? e.index : i,
      toPng: !!(e && e.toPng)
    }));
  }

  // Extension API calls keep a Manifest V3 worker alive; a long download alone does not.
  let activeJobs = 0;
  let keepAlive = 0;
  function jobStarted() {
    if (activeJobs++ === 0) keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20000);
  }
  function jobEnded() {
    if (--activeJobs === 0) clearInterval(keepAlive);
  }

  // ---- ZIP jobs: the offscreen document fetches and packs, this worker saves the archives -------

  const ZIP_PORT = "pgm-zip";
  const OFFSCREEN_URL = "offscreen.html";
  const OFFSCREEN_IDLE_MS = 60000;
  const MIB = 1024 * 1024;
  const zipJobs = new Map(); // jobId -> {post(msg), entries, saved: Set<index>, dir, finished}
  const ourArchives = new Set(); // download ids of saved archives ("show in folder")
  let zipSeq = 0;
  let offscreen = null; // {port, held}
  let offscreenWait = null; // resolves with the port once the document connects
  let offscreenStarting = null;
  let closing = Promise.resolve();
  let idleTimer = 0;
  let offscreenUsers = 0; // separate-file downloads converting or saving through the document
  const converts = new Map(); // reqId -> {resolve, reject}
  let convertSeq = 0;

  // Same policy as the ZIP packer: network trouble, timeouts, 429 and 5xx get two more tries.
  const CONVERT_RETRY_DELAYS = [1000, 3000];
  const retryableCode = (c) => c === "FETCH_FAILED" || c === "TIMEOUT" || c === "DISCONNECTED" || c === "HTTP_429" || /^HTTP_5\d\d$/.test(c);

  // A failed fetch fails the entry (so "retry failed" can pick it up) instead of quietly saving WebP;
  // only when the offscreen document cannot start at all is the original saved (returns null).
  async function convertWithRetry(entry, job) {
    for (let attempt = 0; ; attempt++) {
      if (job.cancelled) throw new Error("CANCELLED");
      try {
        return await convertInOffscreen(entry.url);
      } catch (e) {
        const code = (e && e.message) || "FETCH_FAILED";
        if (code === "OFFSCREEN_FAILED") return null;
        if (!retryableCode(code) || attempt >= CONVERT_RETRY_DELAYS.length) throw new Error(code);
        await PGM.util.sleep(CONVERT_RETRY_DELAYS[attempt]);
      }
    }
  }

  // One image through the offscreen document: {url: blob URL, ext: "png" | ""}.
  async function convertInOffscreen(url) {
    clearTimeout(idleTimer);
    let port;
    try {
      port = await ensureOffscreen();
    } catch (e) {
      throw new Error("OFFSCREEN_FAILED");
    }
    const reqId = ++convertSeq;
    const reply = await new Promise((resolve, reject) => {
      converts.set(reqId, { resolve, reject });
      try {
        port.postMessage({ type: "convert", reqId, url });
      } catch (e) {
        converts.delete(reqId);
        reject(new Error("DISCONNECTED"));
      }
    });
    if (!reply.ok || typeof reply.url !== "string") throw new Error(reply.error || "FETCH_FAILED");
    return reply;
  }

  function revokeInOffscreen(url) {
    try {
      if (offscreen) offscreen.port.postMessage({ type: "revoke", url });
    } catch (e) {
      /* the document is gone and its URLs with it */
    }
  }

  function ensureOffscreen() {
    if (offscreen) return Promise.resolve(offscreen.port);
    if (!offscreenStarting) {
      offscreenStarting = (async () => {
        let timer = 0;
        const connected = new Promise((resolve, reject) => {
          offscreenWait = resolve;
          timer = setTimeout(() => reject(new Error("OFFSCREEN_FAILED")), 15000);
        });
        connected.catch(() => {});
        try {
          await closing;
          // A document left by an earlier worker instance has no port to us any more.
          await chrome.offscreen.closeDocument().catch(() => {});
          await chrome.offscreen.createDocument({
            url: OFFSCREEN_URL,
            reasons: ["BLOBS"],
            justification: "Download the user's selected images, pack them into a ZIP file or save WebP images as PNG, and hand the result to chrome.downloads."
          });
          return await connected;
        } finally {
          clearTimeout(timer);
        }
      })().finally(() => {
        offscreenStarting = null;
        offscreenWait = null;
      });
    }
    return offscreenStarting;
  }

  function scheduleOffscreenClose() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (zipJobs.size || offscreenUsers || !offscreen || offscreenStarting) return;
      const me = offscreen;
      offscreen = null; // no new job may pick the closing document
      while (me.held > 0) {
        me.held--;
        release();
      }
      closing = chrome.offscreen.closeDocument().catch(() => {});
    }, OFFSCREEN_IDLE_MS);
  }

  function finishZipJob(jobId, result) {
    const job = zipJobs.get(jobId);
    if (!job || job.finished) return;
    job.finished = true;
    zipJobs.delete(jobId);
    jobEnded();
    const r = result || {};
    const known = new Set();
    const failed = [];
    for (const f of Array.isArray(r.failed) ? r.failed : []) {
      if (!f || known.has(f.index)) continue;
      known.add(f.index);
      failed.push({ path: String(f.name || ""), index: f.index, error: String(f.error || "FETCH_FAILED") });
    }
    // Whatever was neither saved nor reported failed (the packer died, or the document went away).
    if (r.error || !Array.isArray(r.failed)) {
      for (const e of job.entries) {
        if (!job.saved.has(e.index) && !known.has(e.index)) failed.push({ path: e.name, index: e.index, error: r.error || "DISCONNECTED" });
      }
    }
    const zips = (Array.isArray(r.zips) ? r.zips : []).map((z) => ({ name: String(z.name || ""), id: z.id, count: z.count }));
    job.post({ type: "finished", done: job.saved.size, failed, total: job.entries.length, cancelled: !!r.cancelled, zips });
    if (!zipJobs.size) scheduleOffscreenClose();
  }

  async function saveArchive(job, msg) {
    const origin = chrome.runtime.getURL("").replace(/\/$/, "");
    const name = typeof msg.name === "string" ? msg.name : "";
    const path = job.dir ? job.dir + "/" + name : name;
    if (typeof msg.url !== "string" || !msg.url.startsWith("blob:" + origin + "/")) throw new Error("BAD_URL");
    if (!/\.zip$/i.test(name) || name.includes("/") || !PGM.queue.isSafePath(path)) throw new Error("BAD_PATH");
    const id = await chrome.downloads.download({ url: msg.url, filename: path, conflictAction: "uniquify", saveAs: false });
    if (typeof id !== "number") throw new Error("ZIP_SAVE_FAILED");
    await waitForDownload(id);
    ourArchives.add(id);
    return id;
  }

  function onOffscreenConnect(port) {
    const sender = port.sender || {};
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL(OFFSCREEN_URL)) {
      port.disconnect();
      return;
    }
    const me = { port, held: 0 };
    offscreen = me;
    const post = (msg) => {
      try {
        port.postMessage(msg);
      } catch (e) {
        /* the disconnect handler cleans up */
      }
    };
    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== "object") return;
      const job = zipJobs.get(msg.jobId);
      if (msg.type === "acquire") {
        acquire().then(() => {
          if (offscreen !== me) return release();
          me.held++;
          post({ type: "granted", reqId: msg.reqId });
        });
      } else if (msg.type === "release") {
        if (me.held > 0) {
          me.held--;
          release();
        }
      } else if (msg.type === "save") {
        if (!job) return post({ type: "saved", reqId: msg.reqId, ok: false, error: "CANCELLED" });
        saveArchive(job, msg).then(
          (id) => post({ type: "saved", reqId: msg.reqId, ok: true, id }),
          (e) => post({ type: "saved", reqId: msg.reqId, ok: false, error: (e && e.message) || "ZIP_SAVE_FAILED" }));
      } else if (msg.type === "event" && job && msg.msg) {
        const ev = msg.msg;
        if (ev.type === "part" && ev.ok && Array.isArray(ev.indices)) for (const i of ev.indices) job.saved.add(i);
        job.post(ev);
      } else if (msg.type === "finished") {
        finishZipJob(msg.jobId, msg.result);
      } else if (msg.type === "converted") {
        const w = converts.get(msg.reqId);
        if (w) {
          converts.delete(msg.reqId);
          w.resolve(msg);
        }
      }
    });
    port.onDisconnect.addListener(() => {
      if (offscreen !== me) return;
      offscreen = null;
      for (const w of converts.values()) w.reject(new Error("DISCONNECTED"));
      converts.clear();
      while (me.held > 0) {
        me.held--;
        release();
      }
      for (const jobId of [...zipJobs.keys()]) finishZipJob(jobId, { error: "DISCONNECTED" });
    });
    if (offscreenWait) offscreenWait(port);
  }

  // msg.zip: {baseName, dir, lang, partMB}; entries: [{url, name, time, index}]
  async function startZipJob(msg, post, onCancel) {
    const z = msg.zip || {};
    const raw = Array.isArray(msg.entries) ? msg.entries : [];
    const all = raw.map((e, i) => ({
      url: e && typeof e.url === "string" ? e.url : "",
      name: e && typeof e.name === "string" ? e.name : "",
      time: e && Number.isFinite(e.time) ? e.time : 0,
      index: e && Number.isInteger(e.index) ? e.index : i,
      toPng: !!(e && e.toPng)
    }));
    const dir = typeof z.dir === "string" ? z.dir : "";
    const baseName = typeof z.baseName === "string" && PGM.queue.isSafePath(z.baseName) && !z.baseName.includes("/") ? z.baseName : "PixAI";
    const jobId = ++zipSeq;
    const job = { post, entries: all, saved: new Set(), dir, finished: false };
    zipJobs.set(jobId, job);
    clearTimeout(idleTimer);
    jobStarted();

    if (dir && !PGM.queue.isSafePath(dir)) return finishZipJob(jobId, { failed: all.map((e) => ({ index: e.index, name: e.name, error: "BAD_PATH" })) });
    const entries = [];
    const preFailed = [];
    all.forEach((e, n) => {
      if (n >= MAX_ENTRIES) preFailed.push({ index: e.index, name: e.name, url: e.url, error: "TOO_MANY_FILES" });
      else if (!PGM.util.isAllowedUrl(e.url)) preFailed.push({ index: e.index, name: e.name, url: e.url, error: "BAD_URL" });
      else entries.push(e);
    });

    let port;
    try {
      port = await ensureOffscreen();
    } catch (e) {
      return finishZipJob(jobId, { failed: all.map((x) => ({ index: x.index, name: x.name, error: "OFFSCREEN_FAILED" })) });
    }
    const partMB = Math.min(2000, Math.max(100, Math.floor(Number(z.partMB)) || 1000));
    try {
      port.postMessage({
        type: "zip-start",
        jobId,
        job: {
          label: String(msg.label || ""),
          lang: z.lang === "en" ? "en" : "zh",
          baseName,
          partBytes: partMB * MIB,
          concurrency: Math.min(MAX_PARALLEL, Math.max(1, Math.floor(msg.concurrency) || MAX_PARALLEL)),
          entries,
          preFailed
        }
      });
    } catch (e) {
      return finishZipJob(jobId, { error: "DISCONNECTED" });
    }
    // Registered after the start so that a cancel from a page closed meanwhile reaches a known job.
    onCancel(() => {
      try {
        port.postMessage({ type: "zip-cancel", jobId });
      } catch (e) {
        /* the document is gone; its disconnect finishes the job */
      }
    });
  }

  // "Show in folder" for a saved archive; other ids open the download folder.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "pgm-show" || sender.id !== chrome.runtime.id) return;
    const id = Number(msg.id);
    if (ourArchives.has(id)) chrome.downloads.show(id);
    else chrome.downloads.showDefaultFolder();
    sendResponse({ ok: true });
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === ZIP_PORT) return onOffscreenConnect(port);
    if (port.name !== PORT_NAME) return;
    const job = { cancelled: false };
    let queue = null;
    let open = true;
    let zipCancel = null;
    let zipStarted = false;

    const post = (msg) => {
      if (!open) return;
      try {
        port.postMessage(msg);
      } catch (e) {
        open = false;
      }
    };

    const cancel = () => {
      job.cancelled = true;
      if (queue) queue.cancel();
      if (zipCancel) zipCancel();
    };

    port.onDisconnect.addListener(() => {
      open = false;
      cancel();
    });

    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "cancel") cancel();
      if (msg.type !== "start" || queue || zipStarted) return; // "ping" only keeps the worker alive
      if (msg.zip) {
        zipStarted = true;
        startZipJob(msg, post, (fn) => {
          zipCancel = fn;
          if (job.cancelled) fn();
        });
        return;
      }

      const all = cleanEntries(msg.entries);
      const entries = all.slice(0, MAX_ENTRIES);
      const overflow = all.slice(MAX_ENTRIES).map((e) => ({ path: e.path, index: e.index, error: "TOO_MANY_FILES" }));
      jobStarted();
      const concurrency = Math.min(MAX_PARALLEL, Math.max(1, Math.floor(msg.concurrency) || MAX_PARALLEL));
      queue = PGM.queue.createQueue({
        concurrency,
        run: (entry) => downloadOne(entry, job),
        onProgress: (p) => {
          if (p.error === "CANCELLED") return;
          post({
            type: "progress",
            done: p.done,
            failed: p.failed,
            total: p.total,
            current: p.current.path,
            index: p.current.index,
            error: p.error || undefined
          });
        }
      });
      queue.start(entries).then((r) => {
        jobEnded();
        const failed = r.failed
          .filter((f) => f.error !== "CANCELLED")
          .map((f) => ({ path: f.entry.path, index: f.entry.index, error: f.error }))
          .concat(overflow);
        post({ type: "finished", done: r.done, failed, total: all.length, cancelled: r.cancelled });
      });
    });
  });

  // ---- toolbar button ---------------------------------------------------------
  // Without the "tabs" permission tab.url is usually unknown, so try the content script first
  // and open the library only when no content script answers in this tab.

  chrome.action.onClicked.addListener(async (tab) => {
    const maybePixai = !tab.url || tab.url.startsWith("https://pixai.art/");
    if (tab.id != null && maybePixai) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "pgm-toggle" });
        return;
      } catch (e) {
        const msg = String((e && e.message) || e);
        // Delivered but nobody replied: the toggle still happened.
        if (!/receiving end does not exist|could not establish connection/i.test(msg)) return;
      }
    }
    await chrome.tabs.create({ url: "https://pixai.art/library#pgm" });
  });
})();
