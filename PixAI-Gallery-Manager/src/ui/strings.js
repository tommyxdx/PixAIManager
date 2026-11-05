// Extra UI strings used by src/ui/*. Merged into the PGM.i18n table without overwriting
// keys that src/i18n.js already defines. Load after src/i18n.js and before src/ui/dom.js.
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});

  const EXTRA = {
    zh: {
      "ui.hint": "单击选择 · Shift 连选 · Ctrl+A 全选已加载 · 双击预览",
      "delete.notAttempted": "未删除（已取消或已退出登录）",
      "ui.reloadPage": "扩展已更新，请刷新这个页面后再打开图库管理",
      "ui.images": "{n} 张",
      "ui.importCounts": "文件中有 {f} 个收藏夹、{n} 张图片。",
      "ui.sampleFolder": "风景"
    },
    en: {
      "ui.hint": "Click to select · Shift-click for a range · Ctrl+A selects all loaded · Double-click to preview",
      "delete.notAttempted": "Not deleted (cancelled or logged out)",
      "ui.reloadPage": "The extension was updated. Reload this page, then open the gallery again",
      "ui.images": "{n} image(s)",
      "ui.importCounts": "The file holds {f} folder(s) with {n} image(s).",
      "ui.sampleFolder": "Landscape"
    }
  };

  const i18n = PGM.i18n;
  if (!i18n || typeof i18n.add !== "function") return;
  const table = i18n.strings || PGM.strings || {};
  for (const lang of Object.keys(EXTRA)) {
    const have = table[lang] || {};
    const fresh = {};
    for (const [key, value] of Object.entries(EXTRA[lang])) {
      if (!Object.prototype.hasOwnProperty.call(have, key)) fresh[key] = value;
    }
    i18n.add(lang, fresh);
  }
})();
