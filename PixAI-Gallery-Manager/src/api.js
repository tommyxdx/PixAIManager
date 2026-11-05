// PixAI client for the content script (runs on https://pixai.art, so fetches carry the page origin).
//
// Every method returns the normalized Image shape of EXT_SPEC section 2. Optional last argument
// `opts` = { signal, onProgress({done, total}) }; a signal stops loops between requests and aborts GETs.
//
//   me()                                   -> {id, name}
//   searchTasks({after, keyword, createdAfter, createdBefore, favorited, tab}, opts)
//                                          -> {images, endCursor, hasNextPage}
//       createdAfter / createdBefore accept "YYYY-MM-DD" (local day, the "to" day is inclusive),
//       a Date, or an ISO string (sent unchanged).
//   setFavorite(images, favorited, opts)   -> {ok: keys[], failed: keys[]}
//   deleteImages(images, opts)             -> {deleted, skippedPublished, failed: [{key, reason}], deletedTaskIds}
//   listArtworkCollections(ownerId, opts)  -> [{id, title, itemCount, reserved}]
//   listCollectionItems(id, cursor, opts)  -> {images, nextCursor, skipped}
//   generationInfo(artworkId, opts)        -> {createdAt, prompt, taskId} | null (404)
//   thumbnails(mediaIds, opts)             -> Map(mediaId -> thumbnail url)
//   hasToken()                             -> bool (cheap "probably logged in" check)
// Errors are PGM.PGMError {status, code, message}; 401 has code "LOGIN_REQUIRED".
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});
  const { PGMError } = PGM;
  const { chunk, sleep, isAllowedUrl } = PGM.util;

  const TOKEN_KEYS = ["https://api.pixai.art:token", "https://api.pixai.art/:token"];
  const TABS = ["image", "edit", "video"];
  const MAX_RETRIES = 4;
  const PAGE_GAP_MS = 250;
  const CHUNK = 50;

  // EXT_SPEC rule 0.1: the only routes this extension may call.
  const ROUTES = [
    ["GET", /^\/user\/me$/],
    ["GET", /^\/task\/search$/],
    ["GET", /^\/task\/[\w-]+$/],
    ["GET", /^\/media\/batch$/],
    ["PUT", /^\/task\/bookmarks\/batch$/],
    ["POST", /^\/task\/media\/batch-delete$/],
    ["POST", /^\/task\/[\w-]+\/delete$/],
    ["GET", /^\/collection\/list\/[\w-]+$/],
    ["GET", /^\/collection\/[\w-]+\/items$/],
    ["GET", /^\/artwork\/[\w-]+\/task-parameters$/]
  ];

  function base() {
    return String(PGM.util.testApiBase() || "https://api.pixai.art").replace(/\/+$/, "");
  }

  // The token is read on every request and never cached, logged or sent anywhere but the API.
  function tokenKey() {
    try {
      for (const k of TOKEN_KEYS) if (localStorage.getItem(k)) return k;
    } catch (e) {
      /* storage blocked */
    }
    return null;
  }

  function readToken() {
    const k = tokenKey();
    try {
      return k ? localStorage.getItem(k) || "" : "";
    } catch (e) {
      return "";
    }
  }

  function hasToken() {
    return !!readToken();
  }

  // The web app stores a rotated token from the "token" response header; do the same.
  function rememberToken(res, sent) {
    let t = null;
    try {
      t = res.headers.get("token");
    } catch (e) {
      return;
    }
    const k = tokenKey();
    if (!t || !k || !sent || t.length > 8192 || !/^[\w.~+/=-]+$/.test(t)) return;
    try {
      // Another tab, or the page itself, may have stored a newer token meanwhile.
      if (localStorage.getItem(k) === sent && sent !== t) localStorage.setItem(k, t);
    } catch (e) {
      /* ignore */
    }
  }

  function queryString(query) {
    const parts = [];
    for (const [k, v] of Object.entries(query || {})) {
      if (v === undefined || v === null || v === "") continue;
      const key = encodeURIComponent(k);
      if (Array.isArray(v)) v.forEach((x, i) => parts.push(`${key}[${i}]=${encodeURIComponent(String(x))}`));
      else parts.push(`${key}=${encodeURIComponent(String(v))}`);
    }
    return parts.length ? "?" + parts.join("&") : "";
  }

  async function request(method, path, opts) {
    const o = opts || {};
    if (!ROUTES.some(([m, re]) => m === method && re.test(path))) {
      throw new PGMError(0, "ROUTE_NOT_ALLOWED", `${method} ${path}`);
    }
    const url = base() + "/v2" + path + queryString(o.query);
    // The token only ever goes to the real API, or to the harness's mock off pixai.art.
    const trusted = new URL(url).origin === "https://api.pixai.art" || !!PGM.util.testApiBase();
    const auth = o.auth !== false && trusted;
    const headers = {};
    const init = { method, headers, credentials: auth ? "include" : "omit" };
    let token = "";
    if (auth) {
      token = readToken();
      if (token) headers.Authorization = "Bearer " + token;
    }
    if (o.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(o.body);
    }
    if (o.signal) init.signal = o.signal;

    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      if (e && e.name === "AbortError") throw new PGMError(0, "ABORTED", "aborted");
      throw new PGMError(0, "NETWORK", (e && e.message) || "network error");
    }
    if (auth) rememberToken(res, token);

    const text = await res.text().catch(() => "");
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = null;
      }
    }
    if (!res.ok) {
      const code =
        res.status === 401
          ? "LOGIN_REQUIRED"
          : (data && typeof data.code === "string" && data.code) || "HTTP_" + res.status;
      const message = (data && typeof data.message === "string" && data.message) || res.statusText || code;
      throw new PGMError(res.status, code, message);
    }
    return data;
  }

  // GET with backoff on 429 / 5xx: 1 s, 2 s, 4 s, 8 s (capped at 30 s), at most 4 retries.
  async function get(path, query, opts) {
    const o = Object.assign({}, opts, { query });
    for (let attempt = 0; ; attempt++) {
      try {
        return await request("GET", path, o);
      } catch (e) {
        const retry = e.status === 429 || e.status >= 500;
        if (!retry || attempt >= MAX_RETRIES || (o.signal && o.signal.aborted)) throw e;
        await sleep(Math.min(1000 * 2 ** attempt, 30000));
      }
    }
  }

  function aborted(opts) {
    return !!(opts && opts.signal && opts.signal.aborted);
  }

  function progress(opts, done, total) {
    if (opts && typeof opts.onProgress === "function") {
      try {
        opts.onProgress({ done, total });
      } catch (e) {
        console.error("[PGM] progress callback failed", e);
      }
    }
  }

  // ---- normalization -------------------------------------------------------

  function imageExt(type, taskKind) {
    const t = String(type || "").toLowerCase().replace(/^image\//, "");
    if (t === "webp" || taskKind === "animate") return "webp";
    if (t === "jpeg" || t === "jpg") return "jpg";
    return "png";
  }

  function variant(media, name) {
    if (!media || !Array.isArray(media.urls)) return "";
    const hit = media.urls.find((u) => u && u.variant === name);
    return (hit && hit.url) || "";
  }

  function safeUrl(url) {
    return isAllowedUrl(url) ? url : "";
  }

  function promptOf(params, fallback) {
    const p = params || {};
    const v = p.prompts ?? (p.chat && p.chat.prompts) ?? fallback ?? "";
    return typeof v === "string" ? v : String(v);
  }

  // Favorite state: the media's own entry wins, otherwise the task-level favoritedAt.
  function favoriteLookup(row) {
    const state = row.bookmarkState || {};
    const media = new Map();
    for (const m of state.mediaItems || []) {
      if (m && m.mediaId != null) media.set(String(m.mediaId), !!m.favoritedAt);
    }
    return (mediaId) => (mediaId != null && media.has(mediaId) ? media.get(mediaId) : !!state.favoritedAt);
  }

  function normalizeTask(row) {
    if (!row || row.status !== "completed" || row.id == null) return [];
    const out = row.outputs || {};
    const taskId = String(row.id);
    const isFavorite = favoriteLookup(row);
    const common = {
      source: "task",
      taskId,
      artworkId: null,
      createdAt: row.createdAt || "",
      prompt: promptOf(row.parameters, row.prompts),
      published: (Number(row.artworkCount) || 0) > 0 || !!row.isPublished
    };
    if (out.videoMediaId != null) {
      const mediaId = String(out.videoMediaId);
      return [{ key: `task:${taskId}:${mediaId}`, ...common, mediaId, index: 1, count: 1,
        url: "", thumb: "", ext: "mp4", favorited: isFavorite(null), isVideo: true }];
    }
    const ids = Array.isArray(out.mediaIds) ? out.mediaIds.map(String) : [];
    const urls = Array.isArray(out.mediaUrls) ? out.mediaUrls : [];
    const ext = imageExt(row.imageType, row.taskKind);
    return ids.map((mediaId, i) => ({
      key: `task:${taskId}:${mediaId}`, ...common, mediaId, index: i + 1, count: ids.length,
      url: safeUrl(urls[i] || ""), thumb: "", ext, favorited: isFavorite(mediaId), isVideo: false
    }));
  }

  // Collection item row -> Image, or null when it is not an available artwork.
  // The key always uses the artwork's image mediaId, so it stays stable for video artworks.
  function normalizeArtworkItem(row) {
    const a = row && row.refType === "artwork" && row.effectiveStatus === "available" ? row.artwork : null;
    if (!a || a.id == null) return null;
    const media = a.media || {};
    const url = safeUrl(media.publicUrl || "");
    if (!url) return null;
    const artworkId = String(a.id);
    const mediaId = a.mediaId != null ? String(a.mediaId) : "";
    return {
      key: `artwork:${artworkId}:${mediaId}`, source: "artwork", taskId: null, artworkId, mediaId,
      index: 1, count: 1, url, thumb: safeUrl(media.thumbnailUrl || "") || url,
      ext: /\/gi\//.test(url) ? "webp" : "png", // refined from /media/batch imageType below
      createdAt: a.createdAt || "", prompt: String(a.prompts || ""), published: true, favorited: false,
      isVideo: false, _videoMediaId: a.videoMediaId != null ? String(a.videoMediaId) : null
    };
  }

  // ---- media ---------------------------------------------------------------

  // /media/batch is called without credentials, like the web app does (its public client).
  async function mediaBatch(ids, opts) {
    const map = new Map();
    const list = [...new Set((ids || []).map(String).filter((id) => /^\d+$/.test(id)))];
    for (const part of chunk(list, 100)) {
      if (aborted(opts)) throw new PGMError(0, "ABORTED", "aborted");
      const data = await get("/media/batch", { ids: part }, Object.assign({}, opts, { auth: false }));
      const rows = Array.isArray(data) ? data : (data && data.data) || [];
      for (const m of rows) if (m && m.id != null) map.set(String(m.id), m);
    }
    return map;
  }

  async function mediaBatchSoft(ids, opts) {
    try {
      return await mediaBatch(ids, opts);
    } catch (e) {
      if (e.code === "ABORTED") throw e;
      return new Map(); // thumbnails and types are optional; fall back to the original URLs
    }
  }

  async function thumbnails(mediaIds, opts) {
    const media = await mediaBatch(mediaIds || [], opts);
    const out = new Map();
    for (const [id, m] of media) {
      const u = safeUrl(variant(m, "THUMBNAIL") || variant(m, "PUBLIC"));
      if (u) out.set(id, u);
    }
    return out;
  }

  // ---- tasks ---------------------------------------------------------------

  async function me(opts) {
    const u = await get("/user/me", undefined, opts);
    if (!u || u.id == null) throw new PGMError(0, "UNKNOWN_RESULT", "no user id");
    const id = String(u.id);
    return { id, name: u.displayName || u.username || id };
  }

  function dayBoundary(v, addDays) {
    if (!v) return undefined;
    if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v.toISOString();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    if (!m) return String(v);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + addDays).toISOString();
  }

  async function searchTasks(params, opts) {
    const p = params || {};
    const settings = await PGM.settings.get();
    const data = await get(
      "/task/search",
      {
        first: Math.min(50, Math.max(1, settings.pageSize || 50)),
        after: p.after || undefined,
        keyword: p.keyword ? String(p.keyword).trim() : undefined,
        status: "completed",
        withParameters: "true",
        tab: TABS.includes(p.tab) ? p.tab : undefined,
        createdAfter: dayBoundary(p.createdAfter, 0),
        createdBefore: dayBoundary(p.createdBefore, 1),
        favorited: p.favorited ? "true" : undefined
      },
      opts
    );

    const rows = data && Array.isArray(data.data) ? data.data : [];
    const images = [];
    const posters = new Map(); // video mediaId -> {id, url} of the poster frame (outputs.mediaIds[0])
    for (const row of rows) {
      for (const img of normalizeTask(row)) {
        // Like the web: in the starred view, drop unstarred images of partly starred tasks.
        if (!p.favorited || img.favorited) images.push(img);
      }
      const out = row && row.outputs;
      if (out && out.videoMediaId != null) {
        const ids = Array.isArray(out.mediaIds) ? out.mediaIds : [];
        const urls = Array.isArray(out.mediaUrls) ? out.mediaUrls : [];
        posters.set(String(out.videoMediaId), { id: ids[0] != null ? String(ids[0]) : null, url: urls[0] || "" });
      }
    }

    const wanted = [];
    for (const img of images) {
      wanted.push(img.mediaId);
      const poster = img.isVideo ? posters.get(img.mediaId) : null;
      if (poster && poster.id) wanted.push(poster.id);
    }
    const media = await mediaBatchSoft(wanted, opts);
    for (const img of images) {
      const m = media.get(img.mediaId);
      if (img.isVideo) {
        const poster = posters.get(img.mediaId) || {};
        const pm = poster.id ? media.get(poster.id) : null;
        img.url = safeUrl(variant(m, "PUBLIC") || (m && m.fileUrl) || "");
        img.thumb = safeUrl(variant(pm, "THUMBNAIL") || variant(m, "STILL_THUMBNAIL") || poster.url || "");
      } else {
        if (!img.url) {
          img.url = safeUrl(variant(m, "PUBLIC")) ||
            (/^\d+$/.test(img.mediaId) ? `https://api.pixai.art/v1/media/${img.mediaId}/image` : "");
        }
        img.thumb = safeUrl(variant(m, "THUMBNAIL")) || img.url;
      }
    }

    const info = (data && data.pageInfo) || {};
    return { images, endCursor: info.endCursor || null, hasNextPage: !!info.hasNextPage && !!info.endCursor };
  }

  function sameItem(result, img) {
    if (!result || String(result.taskId) !== img.taskId) return false;
    return img.isVideo ? result.mediaId == null : String(result.mediaId) === img.mediaId;
  }

  async function setFavorite(images, favorited, opts) {
    const list = (images || []).filter((i) => i && i.source === "task");
    const ok = [];
    const failed = (images || []).filter((i) => i && i.source !== "task").map((i) => i.key);
    const parts = chunk(list, CHUNK);
    let done = 0;
    for (let n = 0; n < parts.length; n++) {
      const part = parts[n];
      if (aborted(opts)) {
        parts.slice(n).forEach((p) => p.forEach((img) => failed.push(img.key)));
        break;
      }
      const items = part.map((img) => (img.isVideo ? { taskId: img.taskId } : { taskId: img.taskId, mediaId: img.mediaId }));
      try {
        const res = await request("PUT", "/task/bookmarks/batch", { body: { items, favorited: !!favorited } });
        const results = res && Array.isArray(res.results) ? res.results : null;
        for (const img of part) {
          const r = results ? results.find((x) => sameItem(x, img)) : null;
          // A 2xx without a per-item result counts as success.
          if (!r || r.success !== false) ok.push(img.key);
          else failed.push(img.key);
        }
      } catch (e) {
        part.forEach((img) => failed.push(img.key));
        if (e.code === "LOGIN_REQUIRED") {
          parts.slice(n + 1).forEach((p) => p.forEach((img) => failed.push(img.key)));
          break;
        }
      }
      done += part.length;
      progress(opts, done, list.length);
    }
    return { ok, failed };
  }

  async function deleteImages(images, opts) {
    const result = { deleted: [], skippedPublished: [], failed: [], deletedTaskIds: [] };
    const all = (images || []).filter(Boolean);
    const media = all.filter((i) => i.source === "task" && !i.isVideo);
    const videos = all.filter((i) => i.source === "task" && i.isVideo);
    all.filter((i) => i.source !== "task").forEach((i) => result.failed.push({ key: i.key, reason: "NOT_TASK_IMAGE" }));

    const total = media.length + videos.length;
    let done = 0;
    let stop = null; // reason that ends the job early
    const addTaskId = (id) => {
      const s = String(id);
      if (!result.deletedTaskIds.includes(s)) result.deletedTaskIds.push(s);
    };

    for (const part of chunk(media, CHUNK)) {
      if (!stop && aborted(opts)) stop = "CANCELLED";
      if (stop) {
        part.forEach((img) => result.failed.push({ key: img.key, reason: stop }));
        continue;
      }
      try {
        const res = await request("POST", "/task/media/batch-delete", {
          body: { items: part.map((img) => ({ taskId: img.taskId, mediaId: img.mediaId })) }
        });
        const results = res && Array.isArray(res.results) ? res.results : null;
        for (const img of part) {
          const r = results ? results.find((x) => sameItem(x, img)) : null;
          if (!results) result.failed.push({ key: img.key, reason: "UNKNOWN_RESULT" });
          else if (r && r.success) result.deleted.push(img.key);
          else if (r && r.reason === "MEDIA_PUBLISHED") result.skippedPublished.push(img.key);
          else result.failed.push({ key: img.key, reason: (r && r.reason) || "NO_RESULT" });
        }
        for (const id of (res && res.deletedTaskIds) || []) addTaskId(id);
      } catch (e) {
        part.forEach((img) => result.failed.push({ key: img.key, reason: e.code || "ERROR" }));
        if (e.code === "LOGIN_REQUIRED") stop = e.code;
      }
      done += part.length;
      progress(opts, done, total);
    }

    for (const video of videos) {
      if (!stop && aborted(opts)) stop = "CANCELLED";
      if (stop) {
        result.failed.push({ key: video.key, reason: stop });
        continue;
      }
      // Deleting a video deletes its whole task, which PixAI does not guard, so the stored flags are
      // not trusted: the task must still be this video, finished and unpublished right now.
      try {
        const task = await get(`/task/${encodeURIComponent(video.taskId)}`);
        const outputs = (task && task.outputs) || {};
        const isThisVideo = String(outputs.videoMediaId || "") === String(video.mediaId);
        if (!task || task.status !== "completed" || !isThisVideo) {
          result.failed.push({ key: video.key, reason: "NOT_A_VIDEO_TASK" });
        } else if (task.isPublished || Number(task.artworkCount) > 0) {
          result.skippedPublished.push(video.key);
        } else {
          await request("POST", `/task/${encodeURIComponent(video.taskId)}/delete`);
          result.deleted.push(video.key);
          addTaskId(video.taskId);
        }
      } catch (e) {
        result.failed.push({ key: video.key, reason: e.code || "ERROR" });
        if (e.code === "LOGIN_REQUIRED") stop = e.code;
      }
      done += 1;
      progress(opts, done, total);
    }
    return result;
  }

  // ---- collections (read-only) ---------------------------------------------

  async function listArtworkCollections(ownerId, opts) {
    const out = [];
    const seen = new Set();
    let cursor;
    for (let page = 0; page < 40; page++) {
      if (page) await sleep(PAGE_GAP_MS);
      if (aborted(opts)) throw new PGMError(0, "ABORTED", "aborted");
      const data = await get(
        `/collection/list/${encodeURIComponent(ownerId)}`,
        { contentType: "artwork", sort: "recent", limit: 50, cursor },
        opts
      );
      for (const c of (data && data.data) || []) {
        if (!c || c.id == null || seen.has(String(c.id))) continue;
        seen.add(String(c.id));
        out.push({
          id: String(c.id),
          title: c.title || PGM.t("collection.defaultTitle"),
          itemCount: Number(c.itemCount) || 0,
          reserved: c.reservedType === "default"
        });
      }
      cursor = data && data.nextCursor;
      if (!cursor) break;
    }
    return out;
  }

  async function listCollectionItems(id, cursor, opts) {
    const data = await get(
      `/collection/${encodeURIComponent(id)}/items`,
      { limit: 24, sort: "newest", cursor: cursor || undefined },
      opts
    );
    const rows = data && Array.isArray(data.data) ? data.data : [];
    const images = [];
    let skipped = 0;
    for (const row of rows) {
      const img = normalizeArtworkItem(row);
      if (img) images.push(img);
      else skipped++;
    }

    // Real file type, and the video file for video artworks.
    const media = await mediaBatchSoft(images.map((i) => i._videoMediaId || i.mediaId), opts);
    for (const img of images) {
      const videoId = img._videoMediaId;
      delete img._videoMediaId;
      const m = media.get(videoId || img.mediaId);
      if (videoId) {
        const videoUrl = safeUrl(variant(m, "PUBLIC") || (m && m.fileUrl) || "");
        if (videoUrl) Object.assign(img, { url: videoUrl, ext: "mp4", isVideo: true });
      } else if (m && m.imageType) {
        img.ext = imageExt(m.imageType);
      }
    }
    return { images, nextCursor: (data && data.nextCursor) || null, skipped };
  }

  const generationCache = new Map();
  let lastGenerationCall = 0;

  // Cached per artwork; uncached lookups are spaced PAGE_GAP_MS apart (one per item during a download).
  async function generationInfo(artworkId, opts) {
    const id = String(artworkId);
    if (generationCache.has(id)) return generationCache.get(id);
    const wait = lastGenerationCall + PAGE_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastGenerationCall = Date.now();
    let info = null;
    try {
      const data = await get(`/artwork/${encodeURIComponent(id)}/task-parameters`, undefined, opts);
      const task = data && (data.task || data);
      if (task && task.createdAt) {
        info = {
          createdAt: task.createdAt,
          prompt: promptOf(task.parameters, task.prompts),
          taskId: task.id != null ? String(task.id) : null
        };
      }
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    generationCache.set(id, info);
    return info;
  }

  PGM.api = {
    get BASE() {
      return base();
    },
    PGMError,
    request,
    get,
    hasToken,
    me,
    searchTasks,
    setFavorite,
    deleteImages,
    listArtworkCollections,
    listCollectionItems,
    generationInfo,
    thumbnails,
    mediaBatch,
    // exposed for tests
    normalizeTask,
    normalizeArtworkItem,
    queryString,
    imageExt
  };
})();
