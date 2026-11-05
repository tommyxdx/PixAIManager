// Minimal ZIP writer. Files are stored without compression: PNG, WebP and MP4 are compressed already.
// Needs only Blob, TextEncoder and DataView, so it runs in pages, workers and the offscreen document.
//
//   PGM.zip.crc32(bytes[, crc])            -> unsigned CRC-32 of a Uint8Array
//   const w = PGM.zip.createWriter();
//   w.add(name, bytes, date)                adds one file; name is UTF-8 (general purpose flag bit 11)
//   w.count / w.size                        entries so far / bytes so far (without the directory)
//   w.projected(nameBytes, dataBytes)       archive size if one more such entry were added
//   w.finish()                              -> Blob "application/zip"; the writer is spent afterwards
//   PGM.zip.safeName(name)                  -> one entry name without folders or control characters
//   PGM.zip.uniqueName(name, taken)         -> name, or "name (1).ext", ... unused in the Set (case-insensitive)
//   PGM.zip.utf8Length(text)                -> byte length of text in UTF-8
//
// No ZIP64: an archive must stay under 4 GiB and 65535 entries. add() throws ZIP_TOO_LARGE before that;
// callers split into parts well below it.
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});

  const MAX_BYTES = 0xffffffff - 1024 * 1024; // room for the central directory
  const MAX_ENTRIES = 0xffff;
  const LOCAL = 30; // local file header without the name
  const CENTRAL = 46; // central directory header without the name
  const END = 22; // end of central directory record

  const encoder = new TextEncoder();

  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes, crc) {
    let c = (crc == null ? 0 : crc) ^ 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // MS-DOS date and time (local time, 2-second steps), clamped to 1980..2107.
  function dosDateTime(value) {
    let d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) d = new Date();
    const year = d.getFullYear();
    if (year < 1980) return { time: 0, date: (1 << 5) | 1 };
    if (year > 2107) return { time: (23 << 11) | (59 << 5) | 29, date: (127 << 9) | (12 << 5) | 31 };
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  function zipError(code) {
    const e = new Error(code);
    e.code = code;
    return e;
  }

  function createWriter() {
    let parts = []; // local headers and file data, in archive order
    let central = []; // central directory records
    let offset = 0;
    let centralSize = 0;
    let count = 0;
    let done = false;

    function projected(nameBytes, dataBytes) {
      return offset + LOCAL + nameBytes + dataBytes + centralSize + CENTRAL + nameBytes + END;
    }

    function add(name, bytes, date) {
      if (done) throw zipError("ZIP_FINISHED");
      const nameBytes = encoder.encode(String(name));
      if (!nameBytes.length || nameBytes.length > 0xffff) throw zipError("BAD_NAME");
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const size = data.byteLength;
      if (count >= MAX_ENTRIES || projected(nameBytes.length, size) > MAX_BYTES) throw zipError("ZIP_TOO_LARGE");
      const crc = crc32(data);
      const dt = dosDateTime(date);

      const local = new Uint8Array(LOCAL + nameBytes.length);
      const l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(4, 20, true); // version needed: 2.0
      l.setUint16(6, 0x0800, true); // bit 11: the name is UTF-8
      l.setUint16(8, 0, true); // method: stored
      l.setUint16(10, dt.time, true);
      l.setUint16(12, dt.date, true);
      l.setUint32(14, crc, true);
      l.setUint32(18, size, true);
      l.setUint32(22, size, true);
      l.setUint16(26, nameBytes.length, true);
      l.setUint16(28, 0, true);
      local.set(nameBytes, LOCAL);

      const cen = new Uint8Array(CENTRAL + nameBytes.length);
      const c = new DataView(cen.buffer);
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true); // made by: MS-DOS, 2.0
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true);
      c.setUint16(12, dt.time, true);
      c.setUint16(14, dt.date, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, size, true);
      c.setUint32(24, size, true);
      c.setUint16(28, nameBytes.length, true);
      // extra, comment, disk number, internal and external attributes stay 0
      c.setUint32(42, offset, true);
      cen.set(nameBytes, CENTRAL);

      // A Blob moves the bytes out of the JS heap; large archives may then live on disk.
      parts.push(local, new Blob([data]));
      central.push(cen);
      offset += local.length + size;
      centralSize += cen.length;
      count++;
    }

    function finish() {
      if (done) throw zipError("ZIP_FINISHED");
      done = true;
      const end = new Uint8Array(END);
      const e = new DataView(end.buffer);
      e.setUint32(0, 0x06054b50, true);
      e.setUint16(8, count, true);
      e.setUint16(10, count, true);
      e.setUint32(12, centralSize, true);
      e.setUint32(16, offset, true);
      const blob = new Blob(parts.concat(central, [end]), { type: "application/zip" });
      parts = [];
      central = [];
      return blob;
    }

    return {
      add,
      finish,
      projected,
      get count() {
        return count;
      },
      get size() {
        return offset;
      }
    };
  }

  function safeName(name) {
    let s = String(name == null ? "" : name)
      .replace(/[\u0000-\u001f\u007f\\/:]+/g, "-")
      .replace(/^[\s.-]+/, "")
      .trim();
    if (s.length > 200) {
      const m = /(\.[A-Za-z0-9]{1,5})$/.exec(s);
      s = s.slice(0, 200 - (m ? m[1].length : 0)) + (m ? m[1] : "");
    }
    return s || "file";
  }

  function uniqueName(name, taken) {
    const m = /^(.*?)(\.[^.]*)?$/.exec(name);
    const stem = m[1];
    const ext = m[2] || "";
    let candidate = name;
    for (let n = 1; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  }

  function utf8Length(text) {
    return encoder.encode(String(text)).length;
  }

  PGM.zip = { crc32, dosDateTime, createWriter, safeName, uniqueName, utf8Length, MAX_ENTRIES };
})();
