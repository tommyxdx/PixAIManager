// Local folders in chrome.storage.local["pgm.folders"] = { version: 1, folders: [{id, name, createdAt, items}] }.
// They live in this browser only. All mutations in a tab are serialized.
//
//   await PGM.folders.list()                    -> folders (each with items: ImageSnapshot[])
//   await PGM.folders.get(id)                   -> folder | null
//   await PGM.folders.getImages(id)             -> Image[] (snapshots + favorited:false), newest added first
//   await PGM.folders.create(name)              -> folder
//   await PGM.folders.rename(id, name)          -> folder
//   await PGM.folders.remove(id)                -> {name, count}
//   await PGM.folders.addItems(id, images)      -> {added, skipped}   (de-duplicated by key)
//   await PGM.folders.removeItems(id, keys)     -> {removed}
//   await PGM.folders.removeKeys(keys)          -> {removed}          (from every folder, after a delete)
//   await PGM.folders.validateName(name, excludeId) -> null | "FOLDER_NAME_EMPTY" | "FOLDER_NAME_TOO_LONG" | "FOLDER_NAME_TAKEN"
//   await PGM.folders.exportData()              -> {version: 1, folders}
//   await PGM.folders.exportFile()              -> saves a .json file; {folders: n}
//   await PGM.folders.importText(text)          -> {created, merged, items, skipped}
//   await PGM.folders.importData(obj)           -> same, from a parsed object
//   PGM.folders.snapshot(image) / toImage(snapshot)
//   PGM.folders.onChange(cb)                    -> cb(folders) on any change; returns unsubscribe
// Errors are PGM.PGMError with the codes above, or FOLDER_NOT_FOUND, IMPORT_INVALID, IMPORT_PARSE.
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});
  const { PGMError } = PGM;
  const KEY = "pgm.folders";
  const MAX_NAME = 60;
  const EXTS = ["png", "webp", "mp4", "jpg"];
  const ID_RE = /^[\w-]{1,64}$/;

  let chain = Promise.resolve();
  const listeners = new Set();

  function empty() {
    return { version: 1, folders: [] };
  }

  async function load() {
    try {
      const r = await chrome.storage.local.get(KEY);
      const d = r[KEY];
      if (d && d.version === 1 && Array.isArray(d.folders)) return d;
    } catch (e) {
      /* fall through */
    }
    return empty();
  }

  function save(data) {
    return chrome.storage.local.set({ [KEY]: data });
  }

  // Runs fn(data) on fresh data and saves afterwards; a throw skips the save.
  function mutate(fn) {
    const step = async () => {
      const data = await load();
      const result = await fn(data);
      await save(data);
      return result;
    };
    // Two pixai.art tabs share this storage; the lock keeps one tab's write from undoing another's.
    const locked = () => (navigator.locks ? navigator.locks.request("pgm.folders", step) : step());
    const run = chain.then(locked);
    chain = run.catch(() => {});
    return run;
  }

  function cleanName(name) {
    return String(name == null ? "" : name)
      .replace(/[\x00-\x1f\x7f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function nameError(name, folders, excludeId) {
    const n = cleanName(name);
    if (!n) return "FOLDER_NAME_EMPTY";
    if (Array.from(n).length > MAX_NAME) return "FOLDER_NAME_TOO_LONG";
    const lower = n.toLowerCase();
    if (folders.some((f) => f.id !== excludeId && String(f.name).toLowerCase() === lower)) return "FOLDER_NAME_TAKEN";
    return null;
  }

  function checkName(name, folders, excludeId) {
    const code = nameError(name, folders, excludeId);
    if (code) throw new PGMError(0, code, code);
    return cleanName(name);
  }

  function find(data, id) {
    const f = data.folders.find((x) => x.id === id);
    if (!f) throw new PGMError(0, "FOLDER_NOT_FOUND", "folder not found");
    return f;
  }

  function newId() {
    if (globalThis.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return "f-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function idOrNull(v) {
    if (v == null || v === "") return null;
    const s = String(v);
    return ID_RE.test(s) ? s : undefined; // undefined = invalid
  }

  function text(v, max) {
    return typeof v === "string" ? v.slice(0, max) : "";
  }

  function posInt(v) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 1 && n <= 1e6 ? n : 1;
  }

  // Validates and coerces anything (an Image, a stored or imported snapshot) into an ImageSnapshot.
  function cleanItem(raw, addedAt) {
    if (!raw || typeof raw !== "object") return null;
    const source = raw.source === "task" || raw.source === "artwork" ? raw.source : null;
    const key = typeof raw.key === "string" && raw.key.length <= 200 ? raw.key : "";
    if (!source || !key.startsWith(source + ":")) return null;
    const taskId = idOrNull(raw.taskId);
    const artworkId = idOrNull(raw.artworkId);
    const mediaId = idOrNull(raw.mediaId);
    if (taskId === undefined || artworkId === undefined || mediaId === undefined) return null;
    if (source === "task" ? !taskId : !artworkId) return null;
    const url = typeof raw.url === "string" ? raw.url : "";
    if (!PGM.util.isAllowedUrl(url)) return null;
    // The key is rebuilt from the ids rather than trusted, and a video is an mp4 with its own media id.
    const expectedKey = `${source}:${source === "task" ? taskId : artworkId}:${mediaId || ""}`;
    if (key !== expectedKey) return null;
    if (raw.isVideo && (raw.ext !== "mp4" || !mediaId)) return null;
    return {
      key,
      source,
      taskId,
      artworkId,
      mediaId: mediaId || "",
      index: posInt(raw.index),
      count: posInt(raw.count),
      url,
      thumb: PGM.util.isAllowedUrl(raw.thumb) ? raw.thumb : url,
      ext: EXTS.includes(raw.ext) ? raw.ext : raw.isVideo ? "mp4" : "png",
      createdAt: text(raw.createdAt, 64),
      prompt: text(raw.prompt, 20000),
      published: !!raw.published,
      isVideo: !!raw.isVideo,
      addedAt: addedAt || text(raw.addedAt, 64) || new Date().toISOString()
    };
  }

  function snapshot(image) {
    return cleanItem(image, new Date().toISOString());
  }

  function toImage(item) {
    return Object.assign({}, item, { favorited: false });
  }

  // ---- reads ---------------------------------------------------------------

  async function list() {
    return (await load()).folders;
  }

  async function get(id) {
    return (await load()).folders.find((f) => f.id === id) || null;
  }

  async function getImages(id) {
    const f = await get(id);
    if (!f) throw new PGMError(0, "FOLDER_NOT_FOUND", "folder not found");
    return f.items.slice().reverse().map(toImage);
  }

  async function validateName(name, excludeId) {
    return nameError(name, (await load()).folders, excludeId);
  }

  // ---- writes --------------------------------------------------------------

  function create(name) {
    return mutate((data) => {
      const folder = { id: newId(), name: checkName(name, data.folders), createdAt: new Date().toISOString(), items: [] };
      data.folders.push(folder);
      return folder;
    });
  }

  function rename(id, name) {
    return mutate((data) => {
      const f = find(data, id);
      f.name = checkName(name, data.folders, id);
      return f;
    });
  }

  function remove(id) {
    return mutate((data) => {
      const f = find(data, id);
      data.folders = data.folders.filter((x) => x !== f);
      return { name: f.name, count: f.items.length };
    });
  }

  function addItems(id, images) {
    return mutate((data) => {
      const f = find(data, id);
      const have = new Set(f.items.map((i) => i.key));
      const now = new Date().toISOString();
      let added = 0;
      let skipped = 0;
      for (const img of images || []) {
        const item = cleanItem(img, now);
        if (!item || have.has(item.key)) {
          skipped++;
          continue;
        }
        have.add(item.key);
        f.items.push(item);
        added++;
      }
      return { added, skipped };
    });
  }

  function removeItems(id, keys) {
    const drop = new Set(keys || []);
    return mutate((data) => {
      const f = find(data, id);
      const before = f.items.length;
      f.items = f.items.filter((i) => !drop.has(i.key));
      return { removed: before - f.items.length };
    });
  }

  function removeKeys(keys) {
    const drop = new Set(keys || []);
    return mutate((data) => {
      let removed = 0;
      for (const f of data.folders) {
        const before = f.items.length;
        f.items = f.items.filter((i) => !drop.has(i.key));
        removed += before - f.items.length;
      }
      return { removed };
    });
  }

  // ---- export / import -----------------------------------------------------

  async function exportData() {
    const d = await load();
    return { version: 1, folders: d.folders };
  }

  async function exportFile() {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    // A detached anchor: nothing is inserted into the page.
    const a = document.createElement("a");
    a.href = url;
    a.download = `pixai-gallery-folders_${PGM.naming.formatTime(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { folders: data.folders.length };
  }

  function importData(obj) {
    if (!obj || typeof obj !== "object" || obj.version !== 1 || !Array.isArray(obj.folders)) {
      return Promise.reject(new PGMError(0, "IMPORT_INVALID", "not a folder export"));
    }
    return mutate((data) => {
      const r = { created: 0, merged: 0, items: 0, skipped: 0 };
      const now = new Date().toISOString();
      for (const raw of obj.folders) {
        const name = raw && typeof raw === "object" ? cleanName(raw.name) : "";
        if (!name || Array.from(name).length > MAX_NAME || !Array.isArray(raw.items)) {
          r.skipped++;
          continue;
        }
        const lower = name.toLowerCase();
        let f = data.folders.find((x) => String(x.name).toLowerCase() === lower);
        if (f) {
          r.merged++;
        } else {
          const created = text(raw.createdAt, 64);
          f = { id: newId(), name, createdAt: isNaN(Date.parse(created)) ? now : created, items: [] };
          data.folders.push(f);
          r.created++;
        }
        const have = new Set(f.items.map((i) => i.key));
        for (const it of raw.items) {
          const item = cleanItem(it);
          if (!item) {
            r.skipped++;
          } else if (!have.has(item.key)) {
            have.add(item.key);
            f.items.push(item);
            r.items++;
          }
        }
      }
      return r;
    });
  }

  function importText(json) {
    let obj;
    try {
      obj = JSON.parse(String(json));
    } catch (e) {
      return Promise.reject(new PGMError(0, "IMPORT_PARSE", e.message));
    }
    return importData(obj);
  }

  function onChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[KEY]) return;
      const d = changes[KEY].newValue;
      const folders = d && Array.isArray(d.folders) ? d.folders : [];
      for (const cb of listeners) {
        try {
          cb(folders);
        } catch (e) {
          console.error("[PGM] folders listener failed", e);
        }
      }
    });
  } catch (e) {
    /* chrome.storage unavailable */
  }

  PGM.folders = {
    KEY,
    MAX_NAME,
    list,
    get,
    getImages,
    create,
    rename,
    remove,
    addItems,
    removeItems,
    removeKeys,
    validateName,
    exportData,
    exportFile,
    importData,
    importText,
    snapshot,
    toImage,
    cleanName
  };
})();
