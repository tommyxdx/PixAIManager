// Settings in chrome.storage.local["pgm.settings"].
//
//   await PGM.settings.get()        -> normalized settings (cached after the first read)
//   PGM.settings.current()          -> last known settings, synchronously (defaults before the first get)
//   await PGM.settings.set(patch)   -> merges, normalizes, saves, returns the new settings
//   await PGM.settings.reset()      -> defaults
//   PGM.settings.normalize(obj)     -> clamps every field to its allowed range
//   PGM.settings.onChange(cb)       -> cb(settings) on any change (also from other tabs); returns unsubscribe
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});
  const KEY = "pgm.settings";

  const DEFAULTS = Object.freeze(
    Object.assign({}, PGM.naming.DEFAULTS, {
      concurrency: 3,
      pageSize: 50,
      language: "auto", // auto | zh | en
      downloadMode: "zip", // zip: one archive per job | files: every image as its own download
      zipPartMB: 1000, // an archive is split into parts of at most this size
      webpToPng: true // save still WebP originals as PNG, like the download button on pixai.art
    })
  );
  const PROMPT_COUNTS = [2, 3, 4, 5];
  const LANGUAGES = ["auto", "zh", "en"];
  const DOWNLOAD_MODES = ["zip", "files"];
  const ZIP_PART_MB = [500, 1000, 2000];
  const LEGACY_NO_FOLDER = ["生成记录"]; // the old fixed default; now it follows the UI language

  let cache = null;
  const listeners = new Set();

  function str(v, max, fallback) {
    if (typeof v !== "string") return fallback;
    const s = v.trim();
    return s && s.length <= max ? s : fallback;
  }

  function intIn(v, min, max, fallback) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function normalize(obj) {
    const o = obj && typeof obj === "object" ? obj : {};
    const count = Math.floor(Number(o.promptCount));
    const partMB = Math.floor(Number(o.zipPartMB));
    const noFolder = PGM.naming.sanitize(str(o.noFolderName, 60, ""));
    return {
      template: str(o.template, 200, DEFAULTS.template),
      promptCount: PROMPT_COUNTS.includes(count) ? count : DEFAULTS.promptCount,
      skipQuality: typeof o.skipQuality === "boolean" ? o.skipQuality : DEFAULTS.skipQuality,
      // An empty directory is allowed: files then go straight into the download folder.
      directory: typeof o.directory === "string" && o.directory.length <= 200 ? o.directory.trim() : DEFAULTS.directory,
      noFolderName: LEGACY_NO_FOLDER.includes(noFolder) ? "" : noFolder,
      concurrency: intIn(o.concurrency, 1, 3, DEFAULTS.concurrency),
      pageSize: intIn(o.pageSize, 10, 50, DEFAULTS.pageSize),
      language: LANGUAGES.includes(o.language) ? o.language : DEFAULTS.language,
      downloadMode: DOWNLOAD_MODES.includes(o.downloadMode) ? o.downloadMode : DEFAULTS.downloadMode,
      zipPartMB: ZIP_PART_MB.includes(partMB) ? partMB : DEFAULTS.zipPartMB,
      webpToPng: typeof o.webpToPng === "boolean" ? o.webpToPng : DEFAULTS.webpToPng
    };
  }

  async function get() {
    if (cache) return Object.assign({}, cache);
    let stored = {};
    try {
      const r = await chrome.storage.local.get(KEY);
      stored = r[KEY] || {};
    } catch (e) {
      stored = {};
    }
    cache = normalize(Object.assign({}, DEFAULTS, stored));
    return Object.assign({}, cache);
  }

  function current() {
    return Object.assign({}, cache || DEFAULTS);
  }

  async function set(patch) {
    const next = normalize(Object.assign({}, await get(), patch));
    await chrome.storage.local.set({ [KEY]: next });
    cache = next;
    return Object.assign({}, next);
  }

  async function reset() {
    await chrome.storage.local.set({ [KEY]: Object.assign({}, DEFAULTS) });
    cache = normalize(DEFAULTS);
    return Object.assign({}, cache);
  }

  function onChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[KEY]) return;
      cache = normalize(Object.assign({}, DEFAULTS, changes[KEY].newValue));
      for (const cb of listeners) {
        try {
          cb(Object.assign({}, cache));
        } catch (e) {
          console.error("[PGM] settings listener failed", e);
        }
      }
    });
  } catch (e) {
    // chrome.storage is unavailable (e.g. extension context invalidated); get() falls back to defaults.
  }

  PGM.settings = { KEY, DEFAULTS, ZIP_PART_MB, get, current, set, reset, normalize, onChange };
})();
