// Modal dialogs inside the overlay: confirm, delete confirmation, name prompt, settings, preview.
// Every dialog returns a promise; Esc, the backdrop and closeAll() resolve it with null.
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});
  const ui = (PGM.ui = PGM.ui || {});
  const { t, errText, h, add, icon, button, iconButton, safeUrl, fmtDate, copyText } = ui.dom;

  let host = null; // the overlay element dialogs are appended to
  const stack = [];

  function mount(el) {
    host = el;
  }

  function activeElement() {
    const root = host && host.getRootNode();
    return root ? root.activeElement : null;
  }

  // build(close) returns the dialog element. opts: {cls, role, onKey(e) -> handled}
  function open(build, opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      const layer = h("div", { class: "layer" });
      const entry = { onKey: o.onKey || null, close: null };
      const restore = activeElement();
      entry.close = (value) => {
        const i = stack.indexOf(entry);
        if (i < 0) return;
        stack.splice(i, 1);
        layer.remove();
        if (restore && restore.isConnected) restore.focus();
        else if (host) host.focus();
        resolve(value === undefined ? null : value);
      };
      const box = build(entry.close);
      box.classList.add("dialog");
      for (const c of String(o.cls || "").split(" ")) if (c) box.classList.add(c);
      box.tabIndex = -1;
      box.setAttribute("role", o.role || "dialog");
      box.setAttribute("aria-modal", "true");
      layer.append(box);
      layer.addEventListener("mousedown", (e) => {
        if (e.target === layer) entry.close(null);
      });
      host.append(layer);
      stack.push(entry);
      (box.querySelector("[data-focus]") || box).focus();
    });
  }

  function isOpen() {
    return stack.length > 0;
  }

  function closeTop() {
    if (!stack.length) return false;
    stack[stack.length - 1].close(null);
    return true;
  }

  function closeAll() {
    while (stack.length) stack[stack.length - 1].close(null);
  }

  function handleKey(e) {
    const top = stack[stack.length - 1];
    return !!(top && top.onKey && top.onKey(e));
  }

  // ---- Generic confirm ----

  function confirm(o) {
    return open((close) =>
      h("div", null,
        h("h2", { class: "dlg-title" }, o.title),
        o.body && h("p", { class: "dlg-body" }, o.body),
        h("div", { class: "dlg-actions" },
          h("button", { type: "button", class: "btn", "data-focus": "", onclick: () => close(false) }, t("common.cancel")),
          h("button", { type: "button", class: "btn " + (o.danger ? "danger" : "primary"), onclick: () => close(true) }, o.okText || t("common.ok"))))
    ).then((v) => v === true);
  }

  // ---- Delete confirmation (EXT_SPEC rule 0.2 and section 6) ----
  // The delete button stays disabled until the acknowledgement box is ticked.

  function confirmDelete({ n, m, p }) {
    return open((close) => {
      const ok = h("button", { type: "button", class: "btn danger", disabled: true, onclick: () => close(true) }, t("delete.confirm"));
      const tick = h("input", { type: "checkbox", onchange: () => (ok.disabled = !tick.checked) });
      return h("div", null,
        h("h2", { class: "dlg-title" }, t("delete.title", { n })),
        h("p", { class: "dlg-body" }, t("delete.body", { m, p })),
        h("label", { class: "tick" }, tick, h("span", null, t("delete.ack"))),
        h("div", { class: "dlg-actions" },
          h("button", { type: "button", class: "btn", "data-focus": "", onclick: () => close(false) }, t("common.cancel")),
          ok));
    }, { role: "alertdialog" }).then((v) => v === true);
  }

  // ---- Single text field (new / rename folder) ----
  // submit(name) may throw; the message is shown in the dialog. Resolves {name, result} or null.

  function promptText(o) {
    return open((close) => {
      const input = h("input", { type: "text", class: "input", value: o.value || "", placeholder: o.placeholder || "", maxLength: 200, "data-focus": "", "aria-label": o.label || o.title });
      const err = h("div", { class: "dlg-error", role: "alert" });
      const ok = h("button", { type: "submit", class: "btn primary" }, o.okText || t("common.ok"));
      const form = h("form", {
        onsubmit: async (e) => {
          e.preventDefault();
          const name = input.value.trim();
          err.textContent = "";
          ok.disabled = true;
          try {
            const result = await o.submit(name);
            close({ name, result });
          } catch (ex) {
            err.textContent = errText(ex);
            ok.disabled = false;
            input.focus();
          }
        }
      },
        h("h2", { class: "dlg-title" }, o.title),
        o.label && h("div", { class: "pv-label" }, o.label),
        input,
        err,
        h("div", { class: "dlg-actions" },
          h("button", { type: "button", class: "btn", onclick: () => close(null) }, t("common.cancel")),
          ok));
      setTimeout(() => input.select(), 0);
      return form;
    });
  }

  // ---- Settings ----
  // Saves through PGM.settings.set and resolves with the saved settings, or null.

  async function settings() {
    const current = await PGM.settings.get();
    return open((close) => {
      // values: plain values, or [value, label] pairs
      const select = (values, value) => {
        const el = h("select", { class: "input" }, values.map((v) => {
          const [val, label] = Array.isArray(v) ? v : [v, v];
          return h("option", { value: String(val) }, String(label));
        }));
        el.value = String(value);
        return el;
      };
      const f = {
        template: h("input", { type: "text", class: "input", maxLength: 200 }),
        promptCount: select([2, 3, 4, 5], current.promptCount),
        skipQuality: h("input", { type: "checkbox" }),
        directory: h("input", { type: "text", class: "input", maxLength: 200 }),
        noFolderName: h("input", { type: "text", class: "input", maxLength: 60 }),
        concurrency: select([1, 2, 3], current.concurrency),
        pageSize: h("input", { type: "number", class: "input", min: 10, max: 50, step: 1 }),
        language: select([["auto", t("settings.langAuto")], ["zh", t("settings.langZh")], ["en", t("settings.langEn")]], current.language),
        downloadMode: select([["zip", t("settings.modeZip")], ["files", t("settings.modeFiles")]], current.downloadMode),
        zipPartMB: select(PGM.settings.ZIP_PART_MB.map((n) => [n, t("settings.size", { n })]), current.zipPartMB),
        webpToPng: h("input", { type: "checkbox" })
      };
      f.noFolderName.placeholder = t("naming.noFolder");
      const zipOnly = () => {
        f.zipPartMB.disabled = f.downloadMode.value !== "zip";
      };
      const fill = (s) => {
        f.template.value = s.template;
        f.promptCount.value = String(s.promptCount);
        f.skipQuality.checked = !!s.skipQuality;
        f.directory.value = s.directory;
        f.noFolderName.value = s.noFolderName;
        f.concurrency.value = String(s.concurrency);
        f.pageSize.value = String(s.pageSize);
        f.language.value = s.language;
        f.downloadMode.value = s.downloadMode;
        f.zipPartMB.value = String(s.zipPartMB);
        f.webpToPng.checked = !!s.webpToPng;
        zipOnly();
      };
      const read = () => ({
        template: f.template.value.trim(),
        promptCount: Number(f.promptCount.value),
        skipQuality: f.skipQuality.checked,
        directory: f.directory.value.trim(),
        noFolderName: f.noFolderName.value.trim(),
        concurrency: Number(f.concurrency.value),
        pageSize: Number(f.pageSize.value),
        language: f.language.value,
        downloadMode: f.downloadMode.value,
        zipPartMB: Number(f.zipPartMB.value),
        webpToPng: f.webpToPng.checked
      });

      const ex1 = h("code", { class: "example" });
      const ex2 = h("code", { class: "example" });
      const showExample = () => {
        const s = Object.assign({}, current, read());
        try {
          ex1.textContent = PGM.naming.example(s, t("ui.sampleFolder"));
          ex2.textContent = PGM.naming.example(s, "");
        } catch (e) {
          ex1.textContent = errText(e);
          ex2.textContent = "";
        }
      };

      const field = (label, control, help) =>
        h("div", { class: "field" }, h("label", null, label), control, help && h("div", { class: "help" }, help));
      const err = h("div", { class: "dlg-error", role: "alert" });
      const save = h("button", { type: "submit", class: "btn primary" }, t("settings.save"));
      const reset = button(t("settings.reset"), {
        kind: "ghost",
        onClick: () => {
          fill(Object.assign({}, current, PGM.settings.DEFAULTS));
          showExample();
        }
      });
      reset.classList.add("left");

      const form = h("form", {
        oninput: showExample,
        onchange: () => {
          zipOnly();
          showExample();
        },
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = "";
          save.disabled = true;
          try {
            close(await PGM.settings.set(read()));
          } catch (ex) {
            err.textContent = errText(ex);
            save.disabled = false;
          }
        }
      },
        h("h2", { class: "dlg-title" }, t("settings.title")),
        field(t("settings.language"), f.language),
        h("div", { class: "section" }, t("settings.naming")),
        field(t("settings.template"), f.template, t("settings.templateHelp")),
        field(t("settings.promptCount"), f.promptCount),
        field("", h("label", { class: "check-row" }, f.skipQuality, h("span", null, t("settings.skipQuality")))),
        field(t("settings.directory"), f.directory, t("settings.directoryHelp")),
        field(t("settings.noFolderName"), f.noFolderName, t("settings.noFolderHelp")),
        field(t("settings.example"), h("div", null, ex1, ex2)),
        h("div", { class: "section" }, t("settings.downloads")),
        field(t("settings.downloadMode"), f.downloadMode, t("settings.modeHelp")),
        field(t("settings.zipPart"), f.zipPartMB, t("settings.zipPartHelp")),
        field("", h("label", { class: "check-row" }, f.webpToPng, h("span", null, t("settings.webpToPng"))), t("settings.webpToPngHelp")),
        field(t("settings.concurrency"), f.concurrency),
        h("div", { class: "section" }, t("settings.loading")),
        field(t("settings.pageSize"), f.pageSize),
        err,
        h("div", { class: "dlg-actions" },
          reset,
          h("button", { type: "button", class: "btn", onclick: () => close(null) }, t("common.cancel")),
          save),
        h("div", { class: "about" }, t("settings.about")));
      fill(current);
      showExample();
      return form;
    }, { cls: "wide" });
  }

  // ---- Preview ----
  // o: {list() -> Image[], index, onDownload?(image)}. The list is read on every step,
  // so images loaded or removed while the preview is open are respected.

  function previewMedia(img) {
    const full = safeUrl(img.url);
    const thumb = safeUrl(img.thumb);
    if (img.isVideo) {
      return full
        ? h("video", { src: full, poster: thumb || null, controls: true, preload: "metadata", playsInline: true })
        : h("div", { class: "pv-empty" }, t("tile.unavailable"));
    }
    if (!full && !thumb) return h("div", { class: "pv-empty" }, t("tile.unavailable"));
    const el = h("img", { alt: "", draggable: "false", src: thumb || full });
    if (full && thumb && full !== thumb) {
      // Show the thumbnail at once, then swap in the original when it has loaded.
      const loader = document.createElement("img");
      loader.onload = () => {
        if (el.isConnected) el.src = full;
      };
      loader.src = full;
    }
    return el;
  }

  function preview(o) {
    let index = o.index;
    let go = () => {};
    return open((close) => {
      const stage = h("div", { class: "pv-stage" });
      const info = h("div", { class: "pv-info" });
      const prev = h("button", { type: "button", class: "pv-nav prev", title: t("preview.prev"), "aria-label": t("preview.prev"), onclick: () => go(-1) }, icon("left"));
      const next = h("button", { type: "button", class: "pv-nav next", title: t("preview.next"), "aria-label": t("preview.next"), onclick: () => go(1) }, icon("right"));

      const row = (label, value) => [h("dt", null, label), h("dd", null, String(value))];

      const show = () => {
        const list = o.list();
        if (!list.length) {
          close(null);
          return;
        }
        index = Math.max(0, Math.min(list.length - 1, index));
        const img = list[index];
        stage.textContent = "";
        stage.append(previewMedia(img), prev, next);
        prev.disabled = index <= 0;
        next.disabled = index >= list.length - 1;

        const prompt = String(img.prompt || "");
        const copyLabel = h("span", null, t("preview.copyPrompt"));
        const copyBtn = h("button", {
          type: "button",
          class: "btn",
          disabled: !prompt,
          onclick: async () => {
            const ok = await copyText(prompt, info);
            copyLabel.textContent = ok ? t("preview.copied") : t("preview.copyFailed");
            setTimeout(() => (copyLabel.textContent = t("preview.copyPrompt")), 1500);
          }
        }, icon("copy"), copyLabel);

        info.textContent = "";
        add(info, [
          h("div", { class: "pv-top" },
            h("span", { class: "pv-pos" }, t("preview.position", { i: index + 1, n: list.length })),
            iconButton("close", t("common.close"), () => close(null))),
          h("div", null,
            h("div", { class: "pv-label" }, t("preview.prompt")),
            h("pre", { class: "pv-prompt" }, prompt || t("preview.noPrompt"))),
          h("dl", { class: "pv-meta" },
            row(t("preview.time"), fmtDate(img.createdAt, true) || "-"),
            img.taskId ? row(t("preview.task"), img.taskId) : null,
            img.artworkId ? row(t("preview.artwork"), img.artworkId) : null,
            img.mediaId ? row(t("preview.media"), img.mediaId) : null),
          (img.published || img.favorited) &&
            h("div", { class: "pv-actions" },
              img.published && h("span", { class: "badge pub" }, t("preview.published")),
              img.favorited && h("span", { class: "badge star" }, "★ " + t("preview.favorited"))),
          h("div", { class: "pv-actions" },
            copyBtn,
            o.onDownload && button(t("preview.download"), { icon: "download", onClick: () => o.onDownload(img) }),
            h("a", { class: "btn", href: "https://pixai.art/library", target: "_blank", rel: "noopener noreferrer" }, icon("external"), t("preview.openOnPixai")))]);
      };

      go = (step) => {
        const before = index;
        index = Math.max(0, Math.min(o.list().length - 1, index + step));
        if (index !== before) show();
      };
      show();
      return h("div", null, stage, info);
    }, {
      cls: "preview",
      onKey: (e) => {
        if (e.key === "ArrowLeft") go(-1);
        else if (e.key === "ArrowRight") go(1);
        else return false;
        return true;
      }
    });
  }

  ui.dialogs = { mount, open, isOpen, closeTop, closeAll, handleKey, confirm, confirmDelete, promptText, settings, preview };
})();
