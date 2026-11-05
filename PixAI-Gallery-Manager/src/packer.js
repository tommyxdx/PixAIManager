// Packs one download job into ZIP archives, each with a report of what it holds and what failed.
// Runs in the offscreen document; tests drive it with fake fetch and save functions.
//
//   PGM.packer.run(job, deps) -> Promise<{done, failed: [{index, name, url, error}], zips: [{name, id, count}], total, cancelled}>
//
//   job:  {label, baseName, partBytes, concurrency,
//          entries:   [{index, url, name, time}]          name: file name inside the archive, time: ms (mtime)
//          preFailed: [{index, name, url, error}]}         rejected before packing; listed in the first report
//   deps: {fetchFile(url, signal) -> Promise<Uint8Array>  throws an Error whose .code says why
//          save(blob, zipName) -> Promise<downloadId>     resolves once the archive is written to disk
//          acquire(signal) -> Promise, release()          optional global download slots
//          onEvent(msg), signal, sleep(ms, signal), now() optional}
//
//   Events: {type: "progress", done, failed, total, current, index, error?}  once per file
//           {type: "saving", name}                                         an archive is being written
//           {type: "part", name, ok, id?, error?, indices}                 an archive was written (or not)
//
// Archives are named baseName.zip, or baseName_part1.zip, _part2, ... when the job needs more than one.
// A cancelled job still saves what it has packed, with the report saying it was cancelled.
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});

  const MAX_FILES_PER_PART = 10000;
  const MIN_PART = 16 * 1024; // tests use tiny parts; the background clamps real jobs to >= 100 MB
  const MAX_PART = 2000 * 1024 * 1024;
  const ATTEMPTS = 3; // per file: the first try plus two retries
  const RETRY_DELAYS = [1000, 3000];

  function codeOf(err) {
    if (err && typeof err.code === "string" && err.code) return err.code;
    if (err && err.message) return err.message;
    return "FETCH_FAILED";
  }

  // Worth another try: network trouble, timeouts, rate limits and server errors. Not 403 / 404.
  function retryable(code) {
    return code === "FETCH_FAILED" || code === "TIMEOUT" || code === "HTTP_429" || /^HTTP_5\d\d$/.test(code);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function stamp(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function abortableSleep(ms, signal) {
    return new Promise((resolve) => {
      if (signal && signal.aborted) return resolve();
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", done);
        resolve();
      }
      if (signal) signal.addEventListener("abort", done);
    });
  }

  // The report as text. t() is the caller's PGM.t, already set to the job's language.
  function buildReport(t, r) {
    const lines = [t("report.title"), ""];
    lines.push(t("report.job", { label: r.label }));
    lines.push(t("report.time", { time: stamp(r.time) }));
    lines.push(t("report.archive", { name: r.zipName }));
    lines.push(t("report.counts", { ok: r.items.length, failed: r.failures.length }));
    const converted = r.items.filter((it) => it.converted).length;
    if (converted) lines.push(t("report.converted", { n: converted }));
    if (r.final) {
      lines.push(t("report.total", { total: r.total, ok: r.okTotal, failed: r.failedTotal, parts: r.parts }));
      if (r.cancelled) lines.push(t("report.cancelled"));
    }
    lines.push("", t("report.failedHead", { n: r.failures.length }));
    if (!r.failures.length) lines.push("  " + t("report.none"));
    for (const f of r.failures) {
      lines.push("  " + (f.name || "?"));
      lines.push("    " + t("report.reason", { reason: t.reason(f.error) }));
      if (f.url) lines.push("    " + t("report.url", { url: f.url }));
    }
    lines.push("", t("report.okHead", { n: r.items.length }));
    if (!r.items.length) lines.push("  " + t("report.none"));
    for (const it of r.items) lines.push("  " + it.name);
    if (r.failures.length) lines.push("", t("report.retryHint"));
    return lines.join("\r\n") + "\r\n";
  }

  async function run(job, deps) {
    const zip = PGM.zip;
    const d = deps || {};
    const signal = d.signal || null;
    const sleep = d.sleep || abortableSleep;
    const now = d.now || (() => new Date());
    const emit = (msg) => {
      try {
        if (d.onEvent) d.onEvent(msg);
      } catch (e) {
        /* a broken listener must not stop the job */
      }
    };
    const aborted = () => !!(signal && signal.aborted);

    const label = String(job.label || "");
    const baseName = zip.safeName(job.baseName || "PixAI").replace(/\.zip$/i, "");
    const partBytes = Math.min(MAX_PART, Math.max(MIN_PART, Math.floor(Number(job.partBytes)) || MAX_PART));
    const entries = (job.entries || []).slice();
    const preFailed = (job.preFailed || []).map((f) => ({ index: f.index, name: f.name || "", url: f.url || "", error: f.error || "FETCH_FAILED" }));
    const total = entries.length + preFailed.length;
    const concurrency = Math.max(1, Math.min(3, Math.floor(job.concurrency) || 1));

    const failed = preFailed.slice(); // every failure of the job
    let unreported = preFailed.slice(); // failures not written into a report yet
    const zips = [];
    let packed = 0; // files added to an archive
    let lost = 0; // packed files whose archive could not be saved
    let saved = 0; // files in archives on disk
    let partNo = 0;
    let part = newPart();
    let next = 0;
    let lock = Promise.resolve();

    function newPart() {
      return { writer: zip.createWriter(), items: [], taken: new Set() };
    }

    // Room kept free in every part for its report.
    function reportReserve() {
      return 4096 + part.items.length * 420 + unreported.length * 1200;
    }

    function progress(entry, name, error) {
      emit({ type: "progress", done: packed - lost, failed: failed.length, total, current: name, index: entry.index, error: error || undefined });
    }

    function withLock(fn) {
      const p = lock.then(fn);
      lock = p.catch(() => {});
      return p;
    }

    async function closePart(final) {
      partNo++;
      const zipName = `${baseName}${final && partNo === 1 ? "" : "_part" + partNo}.zip`;
      const items = part.items;
      const failures = unreported;
      unreported = [];
      const lang = PGM.i18n.lang;
      if (job.lang) PGM.i18n.lang = job.lang;
      let text, reportName;
      try {
        text = buildReport(PGM.t, {
          label, time: now(), zipName, items, failures, final,
          total, okTotal: saved + items.length, failedTotal: failed.length, parts: partNo, cancelled: aborted()
        });
        reportName = zip.uniqueName(PGM.t("report.file"), part.taken);
      } finally {
        PGM.i18n.lang = lang;
      }
      // UTF-8 with a BOM so that Notepad on older Windows shows Chinese correctly.
      part.writer.add(reportName, new TextEncoder().encode("﻿" + text), now());
      const blob = part.writer.finish();
      part = newPart();

      emit({ type: "saving", name: zipName });
      const indices = items.map((it) => it.index);
      try {
        const id = await d.save(blob, zipName);
        saved += items.length;
        zips.push({ name: zipName, id: id == null ? null : id, count: items.length });
        emit({ type: "part", name: zipName, ok: true, id, indices });
      } catch (err) {
        const code = codeOf(err) || "ZIP_SAVE_FAILED";
        lost += items.length;
        for (const it of items) failed.push({ index: it.index, name: it.name, url: it.url, error: code });
        emit({ type: "part", name: zipName, ok: false, error: code, indices });
      }
    }

    async function addFile(entry, bytes) {
      const want = zip.safeName(entry.name);
      const nameLen = zip.utf8Length(want) + 8; // + room for " (n)"
      const full = part.items.length >= MAX_FILES_PER_PART ||
        part.writer.projected(nameLen, bytes.length) + reportReserve() > partBytes;
      if (part.items.length && full) await closePart(false);
      const name = zip.uniqueName(want, part.taken);
      try {
        part.writer.add(name, bytes, entry.time ? new Date(entry.time) : now());
      } catch (err) {
        const code = codeOf(err) === "ZIP_TOO_LARGE" ? "FILE_TOO_LARGE" : codeOf(err);
        failed.push({ index: entry.index, name, url: entry.url, error: code });
        unreported.push({ index: entry.index, name, url: entry.url, error: code });
        return { name, error: code };
      }
      part.items.push({ index: entry.index, name, url: entry.url, converted: !!entry.converted });
      packed++;
      return { name, error: null };
    }

    async function fetchWithRetry(entry) {
      let code = "FETCH_FAILED";
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        if (attempt) await sleep(RETRY_DELAYS[attempt - 1] || 3000, signal);
        if (aborted()) throw Object.assign(new Error("CANCELLED"), { code: "CANCELLED" });
        if (d.acquire) await d.acquire(signal);
        try {
          if (aborted()) throw Object.assign(new Error("CANCELLED"), { code: "CANCELLED" });
          const bytes = await d.fetchFile(entry.url, signal);
          if (!bytes || !bytes.length) throw Object.assign(new Error("EMPTY_FILE"), { code: "EMPTY_FILE" });
          return bytes;
        } catch (err) {
          code = aborted() ? "CANCELLED" : codeOf(err);
          if (code === "CANCELLED" || !retryable(code)) throw Object.assign(new Error(code), { code });
        } finally {
          if (d.acquire && d.release) d.release();
        }
      }
      throw Object.assign(new Error(code), { code });
    }

    async function worker() {
      while (!aborted() && next < entries.length) {
        const entry = entries[next++];
        let bytes;
        try {
          bytes = await fetchWithRetry(entry);
        } catch (err) {
          const code = codeOf(err);
          if (code === "CANCELLED") break; // not attempted, not a failure
          const f = { index: entry.index, name: zip.safeName(entry.name), url: entry.url, error: code };
          failed.push(f);
          unreported.push(f);
          progress(entry, f.name, code);
          continue;
        }
        let file = entry;
        if (entry.toPng && d.transform) {
          try {
            const t = await d.transform(bytes, entry);
            if (t && t.converted && t.bytes) {
              bytes = t.bytes;
              file = Object.assign({}, entry, { name: t.name || entry.name, converted: true });
            }
          } catch (err) {
            // keep the original file
          }
        }
        const r = await withLock(() => addFile(file, bytes));
        bytes = null;
        progress(entry, r.name, r.error);
      }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, entries.length); i++) workers.push(worker());
    await Promise.all(workers);
    await lock;
    if (part.items.length || unreported.length) await closePart(true);

    return { done: saved, failed, zips, total, cancelled: aborted() };
  }

  PGM.packer = { run, buildReport, retryable, MAX_FILES_PER_PART };
})();
