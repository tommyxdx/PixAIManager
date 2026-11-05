// WebP -> PNG, like the download button under a generated image on pixai.art.
// PixAI stores most generations as lossless WebP (VP8L). Its generator page draws such a file on an
// OffscreenCanvas and saves convertToBlob()'s PNG; this does the same and gives byte-identical PNGs
// (checked on real originals): same pixels, about twice the file size. Animated WebP stays WebP.
// Runs where createImageBitmap and OffscreenCanvas exist (the offscreen document, test pages).
//
//   PGM.convert.webpInfo(bytes)        -> {webp, animated, lossless} from the RIFF chunk list
//   PGM.convert.toPng(bytes)           -> Promise<Uint8Array> PNG of the decoded image
//   PGM.convert.pngName(name)          -> "a.webp" -> "a.png"
//   PGM.convert.maybePng(bytes, name)  -> Promise<{bytes, name, converted}>; anything that is not a
//                                         still WebP, or fails to decode, comes back unchanged
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});

  function ascii(b, from, to) {
    let s = "";
    for (let i = from; i < to && i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  function webpInfo(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    const info = { webp: false, animated: false, lossless: false };
    if (b.length < 16 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 12) !== "WEBP") return info;
    info.webp = true;
    for (let pos = 12; pos + 8 <= b.length;) {
      const tag = ascii(b, pos, pos + 4);
      const size = (b[pos + 4] | (b[pos + 5] << 8) | (b[pos + 6] << 16)) + b[pos + 7] * 0x1000000;
      if (tag === "VP8X" && size >= 1 && pos + 8 < b.length && b[pos + 8] & 0x02) info.animated = true;
      if (tag === "ANIM" || tag === "ANMF") info.animated = true;
      if (tag === "VP8L") info.lossless = true;
      pos += 8 + size + (size & 1);
    }
    return info;
  }

  async function toPng(bytes) {
    // No colour conversion and no premultiplication, so the PNG holds exactly the decoded pixels.
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/webp" }), {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none"
    });
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("NO_CANVAS");
      ctx.drawImage(bitmap, 0, 0);
      const png = await canvas.convertToBlob({ type: "image/png" });
      return new Uint8Array(await png.arrayBuffer());
    } finally {
      bitmap.close();
    }
  }

  function pngName(name) {
    const s = String(name || "");
    return /\.[^./]*$/.test(s) ? s.replace(/\.[^./]*$/, ".png") : s + ".png";
  }

  async function maybePng(bytes, name) {
    const info = webpInfo(bytes);
    if (!info.webp || info.animated) return { bytes, name, converted: false };
    try {
      return { bytes: await toPng(bytes), name: pngName(name), converted: true };
    } catch (e) {
      return { bytes, name, converted: false };
    }
  }

  PGM.convert = { webpInfo, toPng, pngName, maybePng };
})();
