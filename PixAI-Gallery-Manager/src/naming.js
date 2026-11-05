// File naming. Pure functions, no DOM or chrome APIs (tested in tests/unit.html).
//
//   PGM.naming.promptTags(prompt, {count, skipQuality}) -> string[]
//   PGM.naming.formatTime(isoOrDate)                     -> "YYYYMMDD-HHmmss" (local) | "unknown-time"
//   PGM.naming.sanitize(part)                            -> safe single path segment
//   PGM.naming.buildPath(image, {folderName, settings})  -> "dir/sub/base.ext" (relative)
//   PGM.naming.example(settings, folderName)             -> buildPath() of a fixed sample image
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});

  const DEFAULTS = {
    template: "{folder}_{time}_{prompt}",
    promptCount: 3,
    skipQuality: true,
    directory: "PixAI/{folder}",
    noFolderName: "" // empty: "生成记录" / "Generations" by UI language
  };

  const QUALITY_TAGS = new Set([
    "masterpiece", "best quality", "high quality", "highest quality", "amazing quality",
    "great quality", "good quality", "normal quality", "very aesthetic", "aesthetic",
    "absurdres", "highres", "hires", "ultra detailed", "ultra-detailed", "extremely detailed",
    "detailed", "8k", "4k", "hd", "uhd", "newest", "recent", "official art", "illustration",
    "masterpiece quality"
  ]);
  const YEAR_TAG = /^year[ _]\d{4}$/;
  // Control chars, bidi/zero-width format chars, and characters Windows forbids in names.
  // Chrome's downloads API also refuses "~", format characters and noncharacters.
  const BAD_CHARS = /[\p{Cc}\p{Cf}~<>:"\/\\|?*\uFDD0-\uFDEF\uFFFE\uFFFF]/gu;
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  const EDGES = /^[\s._-]+|[\s._-]+$/g;
  const EMPTY = "\u0000";
  const MAX_BASE = 120;
  const MAX_TAG = 24;

  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const length = (s) => Array.from(s).length;
  const cut = (s, n) => Array.from(s).slice(0, Math.max(0, n)).join("");

  function intIn(v, min, max, fallback) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  }

  function isQuality(tag) {
    const norm = tag.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
    return QUALITY_TAGS.has(norm) || YEAR_TAG.test(norm);
  }

  function cleanTag(tag) {
    const s = tag
      .replace(BAD_CHARS, "-")
      .replace(/[\s_]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "");
    return cut(s, MAX_TAG).replace(/[-.]+$/, "");
  }

  function promptTags(prompt, opts) {
    const o = opts || {};
    const count = intIn(o.count, 1, 10, DEFAULTS.promptCount);
    let s = String(prompt == null ? "" : prompt)
      .replace(/<[^>]*>/g, ",") // <lora:...>, <embedding> and other <...> blocks
      .replace(/@image\d+/gi, " ")
      .replace(/\bBREAK\b/g, ",")
      .replace(/\bscore_\d(?:_up)?\b/gi, " ")
      .replace(/\\([()[\]{}])/g, "$1") // escaped brackets
      .replace(/:\s*-?\d*\.?\d+\s*(?=[)\]}])/g, "") // (tag:1.2) -> (tag)
      .replace(/[()[\]{}]/g, "");

    let tags = s.split(/[,，、;；\r\n]+/).map((x) => x.trim()).filter(Boolean);
    if (o.skipQuality !== false) tags = tags.filter((x) => !isQuality(x));

    // A natural-language prompt: use its first words instead of segments.
    if (tags.length === 1) {
      const words = tags[0].split(/\s+/).filter(Boolean);
      if (words.length > 4) tags = words.slice(0, count);
    }

    const out = [];
    const seen = new Set();
    for (const tag of tags) {
      const c = cleanTag(tag);
      if (!c || seen.has(c.toLowerCase())) continue;
      seen.add(c.toLowerCase());
      out.push(c);
      if (out.length >= count) break;
    }
    return out;
  }

  function formatTime(iso) {
    if (iso == null || iso === "") return "unknown-time";
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d.getTime())) return "unknown-time";
    const p = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
    );
  }

  function sanitize(part) {
    let s = String(part == null ? "" : part)
      .replace(BAD_CHARS, "-")
      .replace(/-{2,}/g, "-")
      .replace(EDGES, "");
    if (RESERVED.test(s)) s = "_" + s;
    return s;
  }

  // Replace {tokens}; an empty token disappears together with the "_" next to it.
  function fill(template, values) {
    const raw = template.replace(/\{(\w+)\}|[^{]+|\{/g, (m, name) => {
      if (name !== undefined && has(values, name)) return values[name] || EMPTY;
      return m.replace(BAD_CHARS, "-");
    });
    return raw
      .replace(/_*(?:\u0000_*)+/g, (m) => (m.includes("_") ? "_" : ""))
      .replace(/-{2,}/g, "-")
      .replace(EDGES, "");
  }

  function noFolderName(settings) {
    const own = settings && settings.noFolderName ? sanitize(settings.noFolderName) : "";
    return own || (PGM.t ? PGM.t("naming.noFolder") : "生成记录");
  }

  function buildDirectory(settings, folderName) {
    const s = settings || {};
    const name = folderName || noFolderName(s);
    const dir = s.directory == null ? DEFAULTS.directory : String(s.directory);
    return dir
      .split(/[\/\\]+/)
      .map((seg) => sanitize(seg.replace(/\{folder\}/g, name)))
      .filter(Boolean)
      .join("/");
  }

  function buildPath(image, opts) {
    const o = opts || {};
    const s = Object.assign({}, DEFAULTS, o.settings);
    const img = image || {};
    const folder = o.folderName ? String(o.folderName) : "";
    const template = String(s.template || DEFAULTS.template);

    const tags = promptTags(img.prompt, { count: s.promptCount, skipQuality: s.skipQuality });
    const values = {
      folder: sanitize(folder),
      time: formatTime(img.createdAt),
      prompt: "",
      index: String(intIn(img.index, 1, 1e6, 1)),
      task: sanitize(img.taskId || img.artworkId || ""),
      media: sanitize(img.mediaId || "")
    };
    const suffix = Number(img.count) > 1 && !template.includes("{index}") ? "_" + values.index : "";

    // Drop prompt tags from the end until the name fits, then cut hard if needed.
    let stem = "";
    for (let n = tags.length; n >= 0; n--) {
      values.prompt = sanitize(tags.slice(0, n).join("_"));
      stem = fill(template, values);
      if (length(stem + suffix) <= MAX_BASE) break;
    }
    if (length(stem + suffix) > MAX_BASE) stem = cut(stem, MAX_BASE - length(suffix)).replace(EDGES, "");

    let base = stem ? sanitize(stem + suffix) : "";
    if (!base) base = sanitize([values.task, values.media].filter(Boolean).join("_")) || "image";

    const rawExt = String(img.ext || "").toLowerCase();
    const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : img.isVideo ? "mp4" : "png";
    const dir = buildDirectory(s, folder);
    return (dir ? dir + "/" : "") + base + "." + ext;
  }

  const SAMPLE = {
    source: "task",
    taskId: "1890000000000000001",
    mediaId: "1890000000000000002",
    index: 2,
    count: 4,
    ext: "png",
    createdAt: "2026-11-03T06:05:09.000Z",
    prompt: "masterpiece, best quality, 1girl, silver hair, (smile:1.2), <lora:abc:0.7>"
  };

  function example(settings, folderName) {
    return buildPath(SAMPLE, { folderName: folderName || "", settings });
  }

  PGM.naming = { DEFAULTS, QUALITY_TAGS, promptTags, formatTime, sanitize, buildPath, buildDirectory, noFolderName, example };
})();
