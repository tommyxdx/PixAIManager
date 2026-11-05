// DOM helpers for the overlay: h(), icons, small controls and browser utilities.
// Remote strings always go through text nodes (h children) or textContent, never HTML.
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});
  const ui = (PGM.ui = PGM.ui || {});

  function t(key, vars) {
    return typeof PGM.t === "function" ? PGM.t(key, vars) : key;
  }

  function errText(err) {
    if (typeof PGM.t === "function" && typeof PGM.t.error === "function") return PGM.t.error(err);
    return (err && (err.message || err.code)) || String(err);
  }

  // h("div", {class, text, style:{}, dataset:{}, onclick, ...attrs}, ...children)
  // Children may be nodes, strings, numbers or nested arrays; null/false/undefined are skipped.
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "value") el.value = v;
        else if (k === "style") Object.assign(el.style, v);
        else if (k === "dataset") Object.assign(el.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (typeof v !== "string" && k in el) el[k] = v;
        else el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    return add(el, kids);
  }

  function add(el, kids) {
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }

  // 24x24 stroke icons.
  const ICONS = {
    close: "M6 6l12 12M18 6L6 18",
    sliders: "M4 6h16M4 12h16M4 18h16M15 4v4M9 10v4M17 16v4",
    download: "M12 4v11M7 10l5 5 5-5M5 20h14",
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
    star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    plus: "M12 5v14M5 12h14",
    check: "M5 12.5l4.5 4.5L19 7.5",
    chevron: "M6 9l6 6 6-6",
    search: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M20 20l-4-4",
    edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
    images: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    left: "M15 6l-6 6 6 6",
    right: "M9 6l6 6-6 6",
    copy: "M9 9h10v10H9zM5 15V5h10",
    external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
    refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
    bookmark: "M6 4h12v16l-6-4-6 4z",
    minus: "M5 12h14",
    list: "M4 7h16M4 12h16M4 17h10"
  };
  const FILLED = { play: "M8 5v14l11-7z" };
  const SVG = "http://www.w3.org/2000/svg";

  function icon(name) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", FILLED[name] ? "i fill" : "i");
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", FILLED[name] || ICONS[name] || ICONS.images);
    svg.append(path);
    return svg;
  }

  function button(label, opts) {
    const o = opts || {};
    return h("button", { type: "button", class: "btn" + (o.kind ? " " + o.kind : ""), title: o.title, disabled: !!o.disabled, onclick: o.onClick },
      o.icon && icon(o.icon), h("span", null, label));
  }

  function iconButton(name, title, onClick, cls) {
    return h("button", { type: "button", class: "icon-btn" + (cls ? " " + cls : ""), title, "aria-label": title, onclick: onClick }, icon(name));
  }

  // Image URL guard (EXT_SPEC rule 0.5). ns.js owns the allow-list; the fallback mirrors it.
  const HOSTS = ["images-ng.pixai.art", "cdn.pixai.art", "api.pixai.art"];
  function allowed(url) {
    const util = PGM.util;
    if (util && typeof util.isAllowedUrl === "function") return util.isAllowedUrl(url);
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && HOSTS.includes(u.hostname)) return true;
      const base = globalThis.PGM_TEST_API_BASE;
      return !!base && u.host === new URL(base).host;
    } catch (e) {
      return false;
    }
  }
  function safeUrl(url) {
    return typeof url === "string" && url && allowed(url) ? url : "";
  }

  const pad = (n) => String(n).padStart(2, "0");
  function fmtDate(v, withSeconds) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return withSeconds ? s + ":" + pad(d.getSeconds()) : s;
  }

  function debounce(fn, ms) {
    let timer = 0;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  // Copies text; the textarea fallback is placed in `parent` so focus stays inside the overlay.
  async function copyText(text, parent) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = h("textarea", { value: text, style: { position: "fixed", top: "0", left: "0", opacity: "0" } });
      (parent || document.body).append(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e2) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  // Saves a text file through a blob link (used for the folder export).
  function saveFile(name, text, type, parent) {
    const url = URL.createObjectURL(new Blob([text], { type: type || "application/octet-stream" }));
    const a = h("a", { href: url, download: name, hidden: true });
    (parent || document.body).append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // Opens a file picker. Must be called synchronously from a user gesture. Resolves null on cancel.
  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = h("input", { type: "file", accept });
      input.addEventListener("change", () => resolve((input.files && input.files[0]) || null), { once: true });
      input.addEventListener("cancel", () => resolve(null), { once: true });
      input.click();
    });
  }

  ui.dom = { t, errText, h, add, icon, button, iconButton, safeUrl, fmtDate, debounce, sleep, chunk, copyText, saveFile, pickFile };
})();
