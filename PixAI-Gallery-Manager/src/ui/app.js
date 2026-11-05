// The overlay: shadow-root shell, sidebar, toolbar, grid with selection, action bar and job drawer.
//
//   PGM.ui.mount()   creates the host element and the launcher (idempotent)
//   PGM.ui.open() / close() / toggle() / isOpen()
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});
  const ui = (PGM.ui = PGM.ui || {});
  const D = ui.dom;
  const { t, errText, h, add, icon, button, iconButton } = D;

  const LOGIN_URL = "https://pixai.art/login";
  const PAGE_GAP_MS = 250; // between list pages during "load all" (rule 0.3)
  const ACTION_CHUNK = 50; // items per delete / bookmark call (rule 0.3)
  const FOLDER_PAGE = 120; // tiles rendered per page of a local folder
  const MAX_JOBS = 12;

  const S = {
    open: false,
    authState: "checking", // checking | ok | out | error
    me: null,
    authGen: 0,
    folders: [],
    collections: [],
    colState: "idle", // idle | loading | ok | out | error
    colGen: 0,
    view: { kind: "all" }, // all | fav | folder {id, name} | collection {id, name}
    filters: { keyword: "", from: "", to: "", tab: "" },
    gen: 0, // request token: bumped on every view change, stale responses are dropped
    abort: null,
    images: [],
    byKey: new Map(),
    gone: new Set(), // keys removed from the current view (deleted or taken out of the folder)
    localList: null, // snapshot list of the current folder view
    cursor: null,
    hasMore: false,
    loading: false,
    error: null,
    skipped: 0,
    selected: new Map(), // key -> Image, kept across pages of one view
    anchor: null,
    loadAll: null,
    jobs: []
  };
  const E = {};
  const tiles = new Map(); // key -> tile element
  let built = false;
  let jobSeq = 0;
  let drawerQueued = false;
  let savedOverflow = null;

  const isGenView = (v) => v.kind === "all" || v.kind === "fav";
  const needsLogin = (v) => v.kind !== "folder";
  const isTaskImage = (img) => img.source === "task" && !!img.taskId;
  const isLoginError = (err) => !!err && (err.code === "LOGIN_REQUIRED" || err.status === 401);

  // ---- Shell ---------------------------------------------------------------

  function mount() {
    if (E.host) return;
    const host = document.createElement("pgm-gallery-manager");
    for (const [k, v] of [["display", "block"], ["position", "fixed"], ["top", "0"], ["left", "0"], ["width", "0"], ["height", "0"], ["z-index", "2147483647"]]) {
      host.style.setProperty(k, v, "important");
    }
    const shadow = host.attachShadow({ mode: "open" });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(PGM.styles || "");
      shadow.adoptedStyleSheets = [sheet];
    } catch (e) {
      shadow.append(h("style", null, PGM.styles || ""));
    }
    E.host = host;
    E.shadow = shadow;
    E.launcher = h("button", { type: "button", class: "launcher", title: t("app.launcherTitle"), onclick: () => open() }, icon("images"), t("app.launcher"));
    E.overlay = h("div", { class: "overlay", tabIndex: -1, role: "dialog", "aria-modal": "true", "aria-label": t("app.title") });
    shadow.append(E.launcher, E.overlay);
    document.documentElement.append(host);
    guardEvents();
    // Keep the host attached if the page rewrites the children of <html>.
    new MutationObserver(() => {
      if (!host.isConnected) document.documentElement.append(host);
    }).observe(document.documentElement, { childList: true });
  }

  // Events from inside the shadow root stop at its boundary, so page listeners never see them.
  // While the overlay is open, key events aimed at the page are swallowed and handled here.
  function guardEvents() {
    const stop = (e) => e.stopPropagation();
    for (const type of ["keydown", "keyup", "keypress", "wheel", "mousedown", "mouseup", "click", "dblclick", "contextmenu",
      "pointerdown", "pointerup", "touchstart", "touchmove", "touchend", "input", "change", "focusin", "focusout", "copy", "cut", "paste"]) {
      E.shadow.addEventListener(type, stop, { passive: true });
    }
    const guard = (e) => {
      if (!S.open || e.composedPath().includes(E.host)) return;
      e.stopImmediatePropagation();
      if (e.type === "keydown") {
        E.overlay.focus();
        onKey(e);
      }
    };
    for (const type of ["keydown", "keyup", "keypress"]) window.addEventListener(type, guard, true);
  }

  function lockScroll(on) {
    const els = [document.documentElement, document.body].filter(Boolean);
    if (on && !savedOverflow) {
      savedOverflow = els.map((el) => [el, el.style.getPropertyValue("overflow"), el.style.getPropertyPriority("overflow")]);
      for (const el of els) el.style.setProperty("overflow", "hidden", "important");
    } else if (!on && savedOverflow) {
      for (const [el, value, priority] of savedOverflow) {
        if (value) el.style.setProperty("overflow", value, priority);
        else el.style.removeProperty("overflow");
      }
      savedOverflow = null;
    }
  }

  function open() {
    mount();
    if (S.open) return;
    // After the extension is updated or reloaded, scripts left in an open page lose their APIs.
    if (!(globalThis.chrome && chrome.runtime && chrome.runtime.id)) {
      window.alert(t("ui.reloadPage"));
      return;
    }
    S.open = true;
    lockScroll(true);
    E.overlay.classList.add("open");
    E.launcher.hidden = true;
    if (!built) build();
    else reopen();
    E.overlay.focus();
  }

  function close() {
    if (!S.open) return;
    ui.dialogs.closeAll();
    closeMenu();
    S.open = false;
    E.overlay.classList.remove("open");
    E.launcher.hidden = false;
    const active = E.shadow.activeElement;
    if (active) active.blur(); // give the keyboard back to the page
    lockScroll(false);
  }

  function toggle() {
    if (S.open) close();
    else open();
  }

  async function reopen() {
    refreshFolders();
    if (S.authState === "ok" || S.authState === "checking") return;
    await checkLogin();
    if (S.authState === "ok" && needsLogin(S.view)) setView(S.view);
  }

  function build() {
    built = true;
    E.overlay.addEventListener("keydown", onKey);
    E.overlay.addEventListener("mousedown", onOverlayMouseDown);
    ui.dialogs.mount(E.overlay);
    buildShell();
    init();
  }

  // Everything inside the overlay that shows text. Rebuilt by relocalize(); open dialogs stay.
  function buildShell() {
    E.account = h("div", { class: "account" });
    const header = h("header", { class: "hdr" },
      h("div", { class: "brand" }, h("span", { class: "logo" }, icon("images")), t("app.title")),
      h("div", { class: "grow" }),
      E.account,
      h("button", { type: "button", class: "btn ghost lang", title: t("header.switchLangTitle"), onclick: switchLanguage }, t("header.switchLang")),
      button(t("header.settings"), { icon: "sliders", kind: "ghost", onClick: openSettings }),
      iconButton("close", t("header.close"), () => close()));
    E.side = h("aside", { class: "side" });
    E.toolbar = h("div", { class: "toolbar" });
    E.bar = h("div", { class: "bar" });
    E.grid = h("div", { class: "grid" });
    E.state = h("div");
    E.sentinel = h("div", { class: "sentinel" });
    E.scroller = h("div", { class: "scroller" }, E.grid, E.state, E.sentinel);
    E.drawer = h("div", { class: "drawer", hidden: true });
    E.toasts = h("div", { class: "toasts", "aria-live": "polite" });
    E.shell = [header, h("div", { class: "body" }, E.side, h("main", { class: "main" }, E.toolbar, E.bar, E.scroller)), E.drawer, E.toasts];
    E.overlay.prepend(...E.shell);

    buildToolbar();
    E.grid.addEventListener("click", onGridClick);
    E.grid.addEventListener("dblclick", onGridDblClick);
    if (E.observer) E.observer.disconnect();
    E.observer = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) loadMore();
    }, { root: E.scroller, rootMargin: "0px 0px 600px 0px" });
    E.observer.observe(E.sentinel);

    renderHeader();
    renderSidebar();
    renderToolbar();
    renderBar();
    renderState();
    renderDrawer();
  }

  // Redraws every text in the current language, keeping the view, loaded images, selection and jobs.
  function relocalize() {
    if (!E.host) return;
    E.launcher.title = t("app.launcherTitle");
    E.launcher.replaceChildren(icon("images"), t("app.launcher"));
    E.overlay.setAttribute("aria-label", t("app.title"));
    if (!built) return;
    closeMenu();
    const scroll = E.scroller.scrollTop;
    for (const el of E.shell) el.remove();
    buildShell();
    E.search.value = S.filters.keyword;
    E.from.value = S.filters.from;
    E.to.value = S.filters.to;
    E.tab.value = S.filters.tab;
    tiles.clear();
    const frag = document.createDocumentFragment();
    for (const img of S.images) {
      if (S.gone.has(img.key)) continue;
      const el = tile(img);
      tiles.set(img.key, el);
      frag.append(el);
    }
    E.grid.append(frag);
    E.scroller.scrollTop = scroll;
  }

  // Applies a "language" setting ("auto" | "zh" | "en"); redraws only when the language changes.
  function applyLanguage(pref) {
    if (PGM.i18n.use(pref)) relocalize();
  }

  async function switchLanguage() {
    const next = PGM.i18n.lang === "zh" ? "en" : "zh";
    applyLanguage(next);
    try {
      await PGM.settings.set({ language: next });
    } catch (err) {
      toast(errText(err), "error");
    }
  }

  async function init() {
    if (PGM.folders && typeof PGM.folders.onChange === "function") PGM.folders.onChange(D.debounce(refreshFolders, 150));
    refreshFolders();
    await checkLogin();
    if (!S.gen) setView(S.view); // the user has not picked a view meanwhile
  }

  // ---- Account and sidebar data -----------------------------------------------

  async function checkLogin() {
    const gen = ++S.authGen;
    S.authState = "checking";
    renderHeader();
    let me = null;
    let state = "ok";
    try {
      me = await PGM.api.me();
    } catch (err) {
      state = isLoginError(err) ? "out" : "error";
    }
    if (gen !== S.authGen) return;
    S.me = me;
    S.authState = me ? "ok" : state === "ok" ? "out" : state;
    renderHeader();
    loadCollections();
  }

  function setLoggedOut() {
    S.authGen++;
    S.authState = "out";
    S.me = null;
    S.colGen++;
    S.colState = "out";
    S.collections = [];
    renderHeader();
    renderSidebar();
  }

  function retryLogin() {
    checkLogin().then(() => {
      if (S.authState === "ok" && (S.error || !S.images.length)) setView(S.view);
    });
  }

  async function loadCollections() {
    const gen = ++S.colGen;
    if (S.authState !== "ok") {
      S.colState = S.authState === "out" ? "out" : "error";
      S.collections = [];
      renderSidebar();
      return;
    }
    S.colState = "loading";
    renderSidebar();
    try {
      const list = await PGM.api.listArtworkCollections(S.me.id);
      if (gen !== S.colGen) return;
      S.collections = Array.isArray(list) ? list : [];
      S.colState = "ok";
    } catch (err) {
      if (gen !== S.colGen) return;
      S.colState = isLoginError(err) ? "out" : "error";
    }
    renderSidebar();
  }

  async function refreshFolders() {
    try {
      const list = await PGM.folders.list();
      S.folders = Array.isArray(list) ? list : [];
    } catch (err) {
      toast(errText(err), "error");
    }
    const v = S.view;
    if (v.kind === "folder") {
      const f = S.folders.find((x) => x.id === v.id);
      if (!f) {
        setView({ kind: "all" });
        return;
      }
      v.name = f.name;
    }
    renderSidebar();
    if (!S.selected.size) renderBar();
  }

  const folderCount = (f) => (Array.isArray(f.items) ? f.items.length : 0);

  // ---- Header and sidebar ------------------------------------------------------

  function renderHeader() {
    const a = E.account;
    if (!a) return;
    a.textContent = "";
    a.removeAttribute("title");
    if (S.authState === "ok") {
      const name = String(S.me.name || S.me.id || "");
      a.title = t("header.accountTitle", { name });
      a.append(h("span", { class: "dot" }), h("span", { class: "name" }, name));
    } else if (S.authState === "out") {
      a.append(h("span", null, t("header.notLoggedIn")), h("a", { class: "link", href: LOGIN_URL }, t("header.login")));
    } else if (S.authState === "error") {
      a.append(h("span", null, t("empty.network")), h("button", { type: "button", class: "link", onclick: retryLogin }, t("common.retry")));
    } else {
      a.append(h("span", { class: "spinner" }));
    }
  }

  function navItem(iconName, label, active, onClick, ...extra) {
    return h("div", {
      class: "nav-item" + (active ? " active" : ""),
      role: "button",
      tabIndex: 0,
      title: label,
      onclick: onClick,
      onkeydown: (e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onClick();
      }
    }, icon(iconName), h("span", { class: "nav-name" }, label), ...extra);
  }

  // Row action buttons must not also activate the row.
  function rowAction(name, title, fn) {
    return iconButton(name, title, (e) => {
      e.stopPropagation();
      fn();
    }, "sm");
  }

  function renderSidebar() {
    if (!E.side) return;
    const v = S.view;
    const scroll = E.side.scrollTop;
    E.side.textContent = "";
    add(E.side, [
      h("div", { class: "side-title" }, t("sidebar.views")),
      navItem("images", t("view.all"), v.kind === "all", () => setView({ kind: "all" })),
      navItem("star", t("view.starred"), v.kind === "fav", () => setView({ kind: "fav" })),
      h("div", { class: "side-title" }, t("sidebar.folders")),
      S.folders.length ? S.folders.map(folderRow) : h("div", { class: "side-msg" }, t("folder.empty")),
      h("button", { type: "button", class: "nav-add", onclick: () => newFolder() }, t("folder.new")),
      h("div", { class: "side-note" }, t("folder.localNote"),
        h("div", { class: "actions" },
          h("button", { type: "button", class: "link", onclick: doExport }, t("folder.export")),
          h("button", { type: "button", class: "link", onclick: doImport }, t("folder.import")))),
      h("div", { class: "side-title", title: t("collection.readOnly") }, t("sidebar.collections")),
      collectionRows()]);
    E.side.scrollTop = scroll;
  }

  function folderRow(f) {
    const active = S.view.kind === "folder" && S.view.id === f.id;
    return navItem("folder", f.name, active, () => setView({ kind: "folder", id: f.id, name: f.name }),
      h("span", { class: "row-actions" },
        rowAction("download", t("folder.downloadAll"), () => downloadFolder(f)),
        rowAction("edit", t("folder.rename"), () => renameFolder(f)),
        rowAction("trash", t("folder.delete"), () => deleteFolder(f))),
      h("span", { class: "count" }, String(folderCount(f))));
  }

  function collectionRows() {
    if (S.colState === "loading") return h("div", { class: "side-msg" }, t("collection.loading"));
    if (S.colState === "out") return h("div", { class: "side-msg" }, t("error.LOGIN_REQUIRED"));
    if (S.colState === "error") {
      return h("div", { class: "side-msg" }, t("collection.loadFailed"), " ",
        h("button", { type: "button", class: "link", onclick: () => (S.authState === "ok" ? loadCollections() : retryLogin()) }, t("common.retry")));
    }
    if (S.colState !== "ok") return null;
    if (!S.collections.length) return h("div", { class: "side-msg" }, t("collection.none"));
    return S.collections.map((c) => {
      const title = c.title || t("collection.defaultTitle");
      const active = S.view.kind === "collection" && S.view.id === c.id;
      return navItem("bookmark", title, active, () => setView({ kind: "collection", id: c.id, name: title }),
        h("span", { class: "row-actions" }, rowAction("download", t("collection.downloadAll"), () => downloadCollection(c.id, title))),
        h("span", { class: "count" }, String(c.itemCount ?? "")));
    });
  }

  // ---- Toolbar -------------------------------------------------------------------

  function buildToolbar() {
    E.search = h("input", { type: "search", class: "input", placeholder: t("toolbar.search"), title: t("toolbar.searchTitle"), maxLength: 200, oninput: D.debounce(applyFilters, 500) });
    E.from = h("input", { type: "date", class: "input date", title: t("toolbar.dateFrom"), "aria-label": t("toolbar.dateFrom"), onchange: applyFilters });
    E.to = h("input", { type: "date", class: "input date", title: t("toolbar.dateTo"), "aria-label": t("toolbar.dateTo"), onchange: applyFilters });
    E.tab = h("select", { class: "input", title: t("toolbar.type"), "aria-label": t("toolbar.type"), onchange: applyFilters },
      [["", "type.all"], ["image", "type.image"], ["edit", "type.edit"], ["video", "type.video"]].map(([value, key]) => h("option", { value }, t(key))));
    E.loadAllBtn = button(t("toolbar.loadAll"), { icon: "list", onClick: toggleLoadAll });
    E.selAllBtn = button(t("toolbar.selectAll"), { icon: "check", kind: "ghost", onClick: () => selectAll() });
    E.clearBtn = button(t("toolbar.clearSelection"), { icon: "close", kind: "ghost", onClick: () => clearSelection() });
    E.selCount = h("span", { class: "sel-count" });
    E.toolbar.append(
      h("div", { class: "search-wrap" }, icon("search"), E.search),
      E.from, h("span", { class: "dash" }, "–"), E.to, E.tab,
      h("div", { class: "grow" }),
      E.loadAllBtn, E.selAllBtn, E.clearBtn, E.selCount);
  }

  // Keyword and date filter local folders too; the type filter only exists on the server.
  function renderToolbar() {
    if (!E.search) return;
    const kind = S.view.kind;
    E.search.disabled = E.from.disabled = E.to.disabled = kind === "collection";
    E.tab.disabled = !isGenView(S.view);
    const running = !!S.loadAll;
    E.loadAllBtn.classList.toggle("active", running);
    E.loadAllBtn.lastChild.textContent = running
      ? `${t("toolbar.stopLoading")} · ${t("toolbar.loaded", { n: S.images.length })}`
      : t("toolbar.loadAll");
    E.loadAllBtn.disabled = !running && (!S.gen || !S.hasMore || !!S.error);
    renderCounts();
  }

  function renderCounts() {
    if (!E.selCount) return;
    const n = S.selected.size;
    E.selCount.textContent = n ? t("toolbar.selected", { n }) : "";
    E.clearBtn.disabled = !n;
    E.selAllBtn.disabled = !S.images.length;
    E.grid.classList.toggle("selecting", n > 0);
  }

  function applyFilters() {
    const next = { keyword: E.search.value.trim(), from: E.from.value, to: E.to.value, tab: E.tab.value };
    const cur = S.filters;
    if (next.keyword === cur.keyword && next.from === cur.from && next.to === cur.to && next.tab === cur.tab) return;
    S.filters = next;
    if (S.view.kind !== "collection") setView(S.view);
  }

  // "YYYY-MM-DD" (local) plus addDays -> ISO instant. The "to" day is inclusive, so it gets +1.
  function dayIso(value, addDays) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + addDays).toISOString() : undefined;
  }

  // ---- Status / action bar -----------------------------------------------------------

  function viewTitle() {
    const v = S.view;
    if (v.kind === "fav") return t("view.starred");
    if (v.kind === "folder") return t("view.folder", { name: v.name || "" });
    if (v.kind === "collection") return t("view.collection", { name: v.name || "" });
    return t("view.all");
  }

  // {folder} for downloads: the folder or collection name; empty on the generation views.
  function viewFolderName() {
    const v = S.view;
    return v.kind === "folder" || v.kind === "collection" ? v.name || "" : "";
  }

  function selectedImages() {
    return S.images.filter((img) => S.selected.has(img.key));
  }

  // A cancelled delete still has a request in flight until runDelete returns.
  const isDeleting = () => S.jobs.some((j) => j.kind === "delete" && !j.finished);

  function renderBar() {
    if (!E.bar) return;
    closeMenu();
    const n = S.selected.size;
    E.bar.textContent = "";
    E.bar.classList.toggle("active", n > 0);
    if (!n) {
      const count = S.gen ? (S.hasMore ? t("toolbar.loaded", { n: S.images.length }) : t("toolbar.allLoaded", { n: S.images.length })) : "";
      add(E.bar, [h("span", null, viewTitle()), count && h("span", { class: "hint" }, "· " + count), h("span", { class: "hint" }, "· " + t("ui.hint"))]);
      return;
    }
    const sel = selectedImages();
    const tasks = sel.filter(isTaskImage);
    const menuBtn = button(t("action.addToFolder"), { icon: "folder", onClick: () => (E.menu ? closeMenu() : openMenu(menuBtn)) });
    menuBtn.append(icon("chevron"));
    add(E.bar, [
      h("span", { class: "bar-count" }, t("toolbar.selected", { n })),
      button(t("action.download", { n }), { icon: "download", kind: "primary", onClick: downloadSelection }),
      menuBtn,
      S.view.kind === "folder" && button(t("action.removeFromFolder"), { icon: "minus", onClick: removeFromFolder }),
      tasks.length > 0 && button(t("action.star"), { icon: "star", onClick: () => favorite(true) }),
      tasks.length > 0 && button(t("action.unstar"), { icon: "star", onClick: () => favorite(false) }),
      tasks.length > 0 && button(t("action.delete", { n: tasks.length }), { icon: "trash", kind: "danger", disabled: isDeleting(), onClick: deleteSelection }),
      tasks.length < sel.length && h("span", { class: "hint", title: t("delete.artworkNotAllowed") }, t("action.taskOnly"))]);
  }

  function openMenu(anchor) {
    closeMenu();
    const items = S.folders.map((f) => h("button", {
      type: "button",
      class: "menu-item",
      onclick: () => {
        closeMenu();
        addToFolder(f.id, selectedImages());
      }
    }, icon("folder"), h("span", { class: "nav-name" }, f.name), h("span", { class: "count" }, String(folderCount(f)))));
    const menu = h("div", { class: "menu", role: "menu" },
      items.length ? items : h("div", { class: "menu-empty" }, t("action.noFolders")),
      h("div", { class: "menu-sep" }),
      h("button", {
        type: "button",
        class: "menu-item accent",
        onclick: () => {
          closeMenu();
          addToNewFolder();
        }
      }, icon("plus"), t("folder.newEllipsis")));
    E.overlay.append(menu);
    const r = anchor.getBoundingClientRect();
    const o = E.overlay.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left - o.left, o.width - menu.offsetWidth - 8));
    let top = r.bottom - o.top + 4;
    if (top + menu.offsetHeight > o.height - 8) top = Math.max(8, r.top - o.top - menu.offsetHeight - 4);
    Object.assign(menu.style, { left: left + "px", top: top + "px" });
    E.menu = menu;
    E.menuAnchor = anchor;
  }

  function closeMenu() {
    if (!E.menu) return;
    E.menu.remove();
    E.menu = null;
    E.menuAnchor = null;
  }

  function onOverlayMouseDown(e) {
    if (!E.menu) return;
    const path = e.composedPath();
    if (!path.includes(E.menu) && !path.includes(E.menuAnchor)) closeMenu();
  }

  // ---- Views and loading ---------------------------------------------------------------

  function setView(view) {
    stopLoadAll();
    closeMenu();
    if (S.abort) S.abort.abort();
    S.abort = typeof AbortController === "function" ? new AbortController() : null;
    S.view = view;
    S.gen++;
    S.images = [];
    S.byKey.clear();
    S.gone.clear();
    S.localList = null;
    S.cursor = null;
    S.hasMore = true;
    S.loading = false;
    S.error = null;
    S.skipped = 0;
    S.selected.clear();
    S.anchor = null;
    tiles.clear();
    E.grid.textContent = "";
    E.scroller.scrollTop = 0;
    renderSidebar();
    renderToolbar();
    renderBar();
    renderState();
    loadMore();
  }

  // Loads the next page of the current view. One load at a time; results of an older view are dropped.
  async function loadMore() {
    if (!S.gen || S.loading || !S.hasMore || S.error) return;
    const gen = S.gen;
    const view = S.view;
    if (needsLogin(view) && S.authState === "out") {
      S.hasMore = false;
      renderState();
      renderToolbar();
      return;
    }
    S.loading = true;
    renderState();
    try {
      const page = await fetchPage(view, S.cursor);
      if (gen !== S.gen) return;
      S.cursor = page.cursor;
      S.hasMore = page.hasMore;
      S.skipped += page.skipped || 0;
      appendImages(page.images);
    } catch (err) {
      if (gen !== S.gen) return;
      if (isLoginError(err)) setLoggedOut();
      S.error = err;
    } finally {
      if (gen === S.gen) {
        S.loading = false;
        renderState();
        renderToolbar();
        if (!S.selected.size) renderBar();
      }
    }
    if (gen === S.gen && S.hasMore && !S.error && !S.loadAll) setTimeout(() => gen === S.gen && fillViewport(), 50);
  }

  // The observer only fires on changes, so keep loading while the sentinel is still near the viewport.
  function fillViewport() {
    if (!S.open || S.loading || !S.hasMore || S.error) return;
    const box = E.scroller.getBoundingClientRect();
    if (E.sentinel.getBoundingClientRect().top < box.bottom + 600) loadMore();
  }

  async function fetchPage(view, cursor) {
    const opts = S.abort ? { signal: S.abort.signal } : undefined;
    if (isGenView(view)) {
      const f = S.filters;
      const q = {};
      if (cursor) q.after = cursor;
      if (f.keyword) q.keyword = f.keyword;
      if (f.from) q.createdAfter = dayIso(f.from, 0);
      if (f.to) q.createdBefore = dayIso(f.to, 1);
      if (f.tab) q.tab = f.tab;
      if (view.kind === "fav") q.favorited = true;
      const res = (await PGM.api.searchTasks(q, opts)) || {};
      let images = res.images || [];
      if (view.kind === "fav") images = images.filter((img) => img.favorited);
      const next = res.endCursor || null;
      return { images, cursor: next, hasMore: !!res.hasNextPage && !!next && next !== cursor };
    }
    if (view.kind === "folder") {
      if (!S.localList) {
        const folder = S.folders.find((x) => x.id === view.id);
        if (!folder) throw Object.assign(new Error(t("error.FOLDER_NOT_FOUND")), { code: "FOLDER_NOT_FOUND" });
        S.localList = filterLocal((folder.items || []).slice().reverse()); // newest added first
      }
      const start = cursor || 0;
      const end = start + FOLDER_PAGE;
      const images = S.localList.slice(start, end).filter((s) => !S.gone.has(s.key)).map((s) => Object.assign({}, s, { favorited: false }));
      return { images, cursor: end, hasMore: end < S.localList.length };
    }
    const res = (await PGM.api.listCollectionItems(view.id, cursor || undefined, opts)) || {};
    const next = res.nextCursor || null;
    return { images: res.images || [], cursor: next, hasMore: !!next && next !== cursor, skipped: Number(res.skipped) || 0 };
  }

  function filterLocal(items) {
    const { keyword, from, to } = S.filters;
    const kw = keyword.toLowerCase();
    const min = from ? Date.parse(dayIso(from, 0)) : null;
    const max = to ? Date.parse(dayIso(to, 1)) : null;
    return items.filter((it) => {
      if (kw && !String(it.prompt || "").toLowerCase().includes(kw)) return false;
      if (min == null && max == null) return true;
      const time = Date.parse(it.createdAt);
      return !isNaN(time) && (min == null || time >= min) && (max == null || time < max);
    });
  }

  function appendImages(list) {
    const frag = document.createDocumentFragment();
    for (const img of list || []) {
      if (!img || !img.key || S.byKey.has(img.key) || S.gone.has(img.key)) continue;
      S.byKey.set(img.key, img);
      S.images.push(img);
      const el = tile(img);
      tiles.set(img.key, el);
      frag.append(el);
    }
    E.grid.append(frag);
  }

  function badges(img) {
    return h("div", { class: "badges" },
      img.favorited && h("span", { class: "badge star", title: t("tile.favorited") }, "★"),
      img.published && h("span", { class: "badge pub" }, t("tile.published")),
      img.count > 1 && h("span", { class: "badge" }, t("tile.multi", { index: img.index, count: img.count })));
  }

  function placeholder() {
    return h("div", { class: "tile-ph", title: t("tile.unavailable") }, icon("images"));
  }

  function tile(img) {
    const el = h("div", { class: "tile" + (S.selected.has(img.key) ? " sel" : ""), title: img.prompt || t("tile.noPrompt"), dataset: { key: img.key } });
    const thumb = D.safeUrl(img.thumb) || (img.isVideo ? "" : D.safeUrl(img.url));
    if (thumb) {
      const im = h("img", { alt: "", loading: "lazy", decoding: "async", draggable: "false", src: thumb });
      im.addEventListener("error", () => {
        // An expired or missing thumbnail: try the original once, then give up.
        const full = img.isVideo ? "" : D.safeUrl(img.url);
        if (full && im.getAttribute("src") !== full) im.src = full;
        else im.replaceWith(placeholder());
      });
      el.append(im);
    } else {
      el.append(placeholder());
    }
    el.append(
      h("span", { class: "check", title: t("tile.select") }, icon("check")),
      badges(img),
      h("div", { class: "tile-meta" }, D.fmtDate(img.createdAt)));
    if (img.isVideo) el.append(h("span", { class: "play", title: t("tile.video") }, icon("play")));
    return el;
  }

  function removeTiles(keys) {
    let changed = false;
    for (const key of keys) {
      S.gone.add(key);
      const el = tiles.get(key);
      if (el) el.remove();
      tiles.delete(key);
      S.selected.delete(key);
      if (S.anchor === key) S.anchor = null;
      if (S.byKey.delete(key)) changed = true;
    }
    if (!changed) return;
    S.images = S.images.filter((img) => S.byKey.has(img.key));
    renderCounts();
    renderBar();
    renderState();
  }

  function renderState() {
    if (!E.state) return;
    const st = E.state;
    st.textContent = "";
    if (isLoginError(S.error) || (needsLogin(S.view) && S.authState === "out" && !S.images.length && S.gen)) {
      st.append(h("div", { class: "state big" }, h("div", null, t("empty.notLoggedIn")), h("a", { class: "btn primary", href: LOGIN_URL }, t("header.login"))));
      return;
    }
    if (S.error) {
      st.append(h("div", { class: "state big" }, h("div", null, errText(S.error)), button(t("common.retry"), { icon: "refresh", onClick: retry })));
      return;
    }
    if (S.loading || !S.gen) {
      const more = S.images.length > 0;
      st.append(h("div", { class: "state" + (more ? "" : " big") }, h("span", { class: "spinner" }), t(more ? "grid.loadingMore" : "grid.loading")));
    } else if (!S.hasMore && !S.images.length) {
      st.append(h("div", { class: "state big" }, emptyText()));
    } else if (!S.hasMore) {
      st.append(h("div", { class: "state" }, t("grid.end")));
    }
    if (S.skipped) st.append(h("div", { class: "state note" }, t("collection.unavailableSkipped", { n: S.skipped })));
  }

  function emptyText() {
    const kind = S.view.kind;
    const filtered = !!(S.filters.keyword || S.filters.from || S.filters.to);
    if (kind === "fav") return filtered ? t("empty.results") : t("empty.starred");
    if (kind === "folder") return filtered ? t("empty.results") : t("empty.folder");
    if (kind === "collection") return t("empty.collection");
    return t("empty.results");
  }

  function retry() {
    if (needsLogin(S.view) && S.authState !== "ok") {
      retryLogin();
      return;
    }
    S.error = null;
    renderState();
    loadMore();
  }

  // ---- Load all ------------------------------------------------------------------------

  function toggleLoadAll() {
    if (S.loadAll) cancelJob(S.loadAll);
    else runLoadAll();
  }

  function stopLoadAll() {
    if (S.loadAll) cancelJob(S.loadAll);
    S.loadAll = null;
  }

  async function runLoadAll() {
    const gen = S.gen;
    const job = addJob({ kind: "load", label: `${t("job.loadAll")} · ${viewTitle()}` });
    S.loadAll = job;
    renderToolbar();
    while (!job.cancelled && gen === S.gen && S.hasMore && !S.error) {
      if (S.loading) {
        await D.sleep(100);
        continue;
      }
      await loadMore();
      if (gen !== S.gen) break;
      job.done = S.images.length;
      updateJob(job);
      renderToolbar();
      if (S.hasMore && S.view.kind !== "folder") await D.sleep(PAGE_GAP_MS);
    }
    if (S.loadAll === job) S.loadAll = null;
    if (gen === S.gen) renderToolbar();
    if (gen === S.gen && S.error) endJob(job, "failed", errText(S.error));
    else endJob(job, "done", t("job.loadAllSummary", { n: job.done }));
  }

  // ---- Selection -------------------------------------------------------------------------

  function setSelected(key, on) {
    const img = S.byKey.get(key);
    if (!img) return;
    if (on) S.selected.set(key, img);
    else S.selected.delete(key);
    const el = tiles.get(key);
    if (el) el.classList.toggle("sel", on);
  }

  function selectionChanged() {
    renderCounts();
    renderBar();
  }

  function selectAll() {
    for (const img of S.images) setSelected(img.key, true);
    selectionChanged();
  }

  function clearSelection() {
    for (const key of [...S.selected.keys()]) setSelected(key, false);
    S.anchor = null;
    selectionChanged();
  }

  function onGridClick(e) {
    const el = e.target.closest(".tile");
    if (!el) return;
    const key = el.dataset.key;
    const from = S.anchor ? S.images.findIndex((img) => img.key === S.anchor) : -1;
    const to = S.images.findIndex((img) => img.key === key);
    if (to < 0) return;
    if (e.shiftKey && from >= 0) {
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) setSelected(S.images[i].key, true);
    } else {
      setSelected(key, !S.selected.has(key));
      S.anchor = key;
    }
    selectionChanged();
  }

  function onGridDblClick(e) {
    const el = e.target.closest(".tile");
    if (el) openPreview(el.dataset.key);
  }

  function openPreview(key) {
    const index = S.images.findIndex((img) => img.key === key);
    if (index < 0) return;
    const folderName = viewFolderName();
    const scope = folderName || viewTitle();
    ui.dialogs.preview({
      list: () => S.images,
      index,
      onDownload: (img) => startDownload([img], folderName, downloadLabel(scope, 1))
    });
  }

  function isTyping(e) {
    const el = e.composedPath()[0];
    if (!el || !el.tagName) return false;
    if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
    return el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|reset|file|range|color)$/i.test(el.type);
  }

  // Esc closes the menu, then the top dialog, then the overlay.
  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (E.menu) closeMenu();
      else if (!ui.dialogs.closeTop()) close();
      return;
    }
    if (ui.dialogs.isOpen()) {
      if (!isTyping(e) && ui.dialogs.handleKey(e)) e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "a" || e.key === "A") && !isTyping(e)) {
      e.preventDefault();
      selectAll();
    }
  }

  // ---- Jobs drawer ---------------------------------------------------------------------------

  function addJob(props) {
    const job = Object.assign({
      id: ++jobSeq, kind: "", label: "", status: "running", phase: "", note: "",
      done: 0, total: 0, failedCount: 0, failures: [], summary: "", cancelled: false, cancel: null
    }, props);
    S.jobs.unshift(job);
    for (let i = S.jobs.length - 1; i >= 0 && S.jobs.length > MAX_JOBS; i--) {
      if (S.jobs[i].status !== "running") S.jobs.splice(i, 1);
    }
    renderDrawer();
    return job;
  }

  function updateJob() {
    if (drawerQueued) return;
    drawerQueued = true;
    requestAnimationFrame(renderDrawer);
  }

  // A cancelled job keeps its status; the summary still tells what was done.
  function endJob(job, status, summary) {
    if (job.status === "running") job.status = status;
    job.summary = summary;
    renderDrawer();
  }

  function cancelJob(job) {
    if (job.status !== "running") return;
    job.cancelled = true;
    job.status = "cancelled";
    job.summary = "";
    try {
      if (job.cancel) job.cancel();
    } catch (e) {
      /* the job reports its own end */
    }
    if (S.loadAll === job) {
      S.loadAll = null;
      renderToolbar();
    }
    renderDrawer();
  }

  function dismissJob(job) {
    S.jobs = S.jobs.filter((j) => j !== job);
    renderDrawer();
  }

  function renderDrawer() {
    drawerQueued = false;
    if (!E.drawer) return;
    E.drawer.textContent = "";
    E.drawer.hidden = !S.jobs.length;
    for (const job of S.jobs) E.drawer.append(jobCard(job));
  }

  function jobCard(job) {
    const running = job.status === "running";
    const failed = Math.max(job.failures.length, job.failedCount || 0);
    let line;
    if (running) {
      const parts = [];
      if (job.phase) parts.push(job.phase);
      if (job.total) parts.push(t("job.progress", { done: job.done, total: job.total }));
      else if (job.kind !== "download") parts.push(t("toolbar.loaded", { n: job.done }));
      else if (!job.phase) parts.push(t("job.prepare"));
      if (failed) parts.push(t("job.failures", { n: failed }));
      line = parts.join(" · ");
    } else {
      const status = job.status === "cancelled" ? t("job.cancelled") : job.status === "failed" ? t("job.failed") : "";
      line = [status, job.summary].filter(Boolean).join(" · ");
    }
    const processed = job.processed == null ? job.done : job.processed;
    const pct = job.total ? Math.min(100, Math.round((processed / job.total) * 100)) : 0;
    return h("div", { class: "job " + job.status },
      h("div", { class: "job-head" },
        h("span", { class: "job-label", title: job.label }, job.label),
        running
          ? h("button", { type: "button", class: "link", onclick: () => cancelJob(job) }, t("job.cancel"))
          : iconButton("close", t("job.dismiss"), () => dismissJob(job), "sm")),
      running && h("div", { class: "progress" + (job.total ? "" : " indet") }, h("i", { style: job.total ? { width: pct + "%" } : null })),
      h("div", { class: "job-line" }, line),
      job.note && h("div", { class: "job-line" }, job.note),
      !running && h("div", { class: "job-actions" },
        job.retry && job.retry.images.length > 0 &&
          h("button", { type: "button", class: "link", onclick: () => retryFailed(job) }, t("job.retryFailed", { n: job.retry.images.length })),
        job.failures.length > 0 && h("button", { type: "button", class: "link", onclick: () => copyFailures(job) }, t("job.copyFailures")),
        job.archiveId != null && h("button", { type: "button", class: "link", onclick: () => showArchive(job) }, t("job.showFile"))));
  }

  async function copyFailures(job) {
    const ok = await D.copyText(job.failures.join("\n"), E.overlay);
    toast(ok ? t("job.failuresCopied") : t("preview.copyFailed"), ok ? "ok" : "error");
  }

  function toast(message, kind) {
    if (!E.toasts) return;
    const el = h("div", { class: "toast " + (kind || "info"), role: "status" }, message);
    E.toasts.append(el);
    setTimeout(() => el.remove(), kind === "error" || kind === "warn" ? 6000 : 3500);
  }

  // Readable text for a failure reason code such as "MEDIA_PUBLISHED" or "DISCONNECTED".
  function reasonText(reason) {
    return PGM.t.reason(reason);
  }

  // ---- Downloads -------------------------------------------------------------------------------

  function downloadLabel(scope, n) {
    return t("job.download", { label: `${scope} · ${t("ui.images", { n })}` });
  }

  function downloadSelection() {
    const images = selectedImages();
    const folderName = viewFolderName();
    startDownload(images, folderName, downloadLabel(folderName || viewTitle(), images.length));
  }

  function downloadFolder(f) {
    const images = (f.items || []).slice().reverse().map((s) => Object.assign({}, s, { favorited: false }));
    startDownload(images, f.name, downloadLabel(f.name, images.length));
  }

  // Collection artworks are named after their generation time, looked up one at a time (api caches it).
  async function withGenerationTimes(images, job) {
    const ids = [...new Set(images.filter((i) => i.source === "artwork" && i.artworkId).map((i) => String(i.artworkId)))];
    const times = new Map();
    if (!ids.length) return images;
    job.phase = t("job.prepare");
    job.done = 0;
    job.total = ids.length;
    updateJob(job);
    for (const id of ids) {
      if (job.cancelled) break;
      try {
        const info = await PGM.api.generationInfo(id);
        if (info && info.createdAt) times.set(id, info.createdAt);
      } catch (err) {
        if (isLoginError(err)) throw err;
        // Otherwise keep the artwork's publish time.
      }
      job.done++;
      updateJob(job);
    }
    return images.map((img) => {
      const time = img.source === "artwork" ? times.get(String(img.artworkId)) : null;
      return time ? Object.assign({}, img, { createdAt: time }) : img;
    });
  }

  // Archive name: PixAI_<folder>_<time>; the archive goes into the same sub-folder loose files would.
  function zipOptions(settings, folderName) {
    const folder = PGM.naming.sanitize(folderName) || PGM.naming.noFolderName(settings);
    return {
      baseName: PGM.naming.sanitize(`PixAI_${folder}_${PGM.naming.formatTime(new Date())}`),
      dir: PGM.naming.buildDirectory(settings, folderName),
      lang: PGM.i18n.lang,
      partMB: settings.zipPartMB
    };
  }

  // Failures worth another try; a bad link or path fails the same way again.
  const retryableReason = (error) => error !== "BAD_URL" && error !== "BAD_PATH";

  async function startDownload(images, folderName, label, existing) {
    const job = existing || addJob({ kind: "download", label });
    if (!images.length) {
      endJob(job, "done", t("toast.nothingToDownload"));
      return;
    }
    try {
      const settings = await PGM.settings.get();
      const ready = await withGenerationTimes(images, job);
      if (job.cancelled) {
        endJob(job, "cancelled", "");
        return;
      }
      const zip = settings.downloadMode === "zip" && ready.length > 1 ? zipOptions(settings, folderName) : null;
      const entries = [];
      const sources = []; // image of every entry, by index, for "retry failed"
      for (const img of ready) {
        // In a ZIP job a bad link goes along too: the background rejects it and the report lists it.
        const url = D.safeUrl(img.url);
        if (!url && !zip) {
          job.failures.push(`${img.key}: ${t("error.BAD_URL")}`);
          continue;
        }
        const path = PGM.naming.buildPath(img, { folderName, settings });
        const time = Date.parse(img.createdAt);
        const toPng = !!settings.webpToPng && !img.isVideo && /\.webp$/i.test(path);
        entries.push(zip
          ? { url: url || "", name: path.slice(path.lastIndexOf("/") + 1), time: isNaN(time) ? 0 : time, toPng }
          : { url, path, toPng });
        sources.push(img);
      }
      if (!entries.length) {
        endJob(job, "failed", t("job.downloadSummary", { done: 0, failed: job.failures.length }));
        return;
      }
      const before = job.failures.length;
      Object.assign(job, { phase: zip ? t("job.fetching") : "", done: 0, total: entries.length, failedCount: before, zip: !!zip });
      job.retry = { folderName, label, images: [] };
      updateJob(job);
      const handle = PGM.downloads.start({ label, entries, zip }, (msg) => onDownloadMessage(job, msg, before, sources));
      job.cancel = () => handle && typeof handle.cancel === "function" && handle.cancel();
      toast(t(zip ? "toast.zipStarted" : "toast.downloadStarted", { n: entries.length }));
    } catch (err) {
      job.failures.push(errText(err));
      endJob(job, "failed", errText(err));
    }
  }

  function onDownloadMessage(job, msg, before, sources) {
    if (!msg) return;
    if (msg.type === "progress") {
      if (job.status !== "running") return;
      job.done = Number(msg.done) || 0;
      job.total = Number(msg.total) || job.total;
      job.failedCount = before + (Number(msg.failed) || 0);
      job.processed = job.done + (Number(msg.failed) || 0);
      updateJob(job);
    } else if (msg.type === "saving") {
      job.phase = t("job.savingZip", { name: String(msg.name || "") });
      updateJob(job);
    } else if (msg.type === "part") {
      job.phase = t("job.fetching");
      if (msg.ok && msg.id != null) job.archiveId = msg.id;
      updateJob(job);
    } else if (msg.type === "finished") {
      for (const f of Array.isArray(msg.failed) ? msg.failed : []) {
        job.failures.push(`${(f && f.path) || ""}: ${reasonText(f && f.error)}`);
        const img = f && Number.isInteger(f.index) ? sources[f.index] : null;
        if (img && retryableReason(f.error) && job.retry) job.retry.images.push(img);
      }
      const done = Number(msg.done);
      if (Number.isFinite(done)) job.done = done;
      job.failedCount = job.failures.length;
      job.phase = "";
      const zips = Array.isArray(msg.zips) ? msg.zips : [];
      const summary = job.zip
        ? t("job.zipSummary", { done: job.done, zips: zips.length, failed: job.failures.length })
        : t("job.downloadSummary", { done: job.done, failed: job.failures.length });
      endJob(job, msg.cancelled ? "cancelled" : "done", summary);
    }
  }

  function retryFailed(job) {
    const r = job.retry;
    if (!r || !r.images.length) return;
    job.retry = null;
    renderDrawer();
    startDownload(r.images, r.folderName, t("job.retryLabel", { label: r.label }));
  }

  function showArchive(job) {
    try {
      chrome.runtime.sendMessage({ type: "pgm-show", id: job.archiveId }).catch(() => {});
    } catch (e) {
      toast(t("ui.reloadPage"), "warn");
    }
  }

  async function downloadCollection(id, title) {
    const job = addJob({ kind: "download", label: t("job.download", { label: title }) });
    const images = [];
    const seen = new Set();
    const cursors = new Set();
    let cursor;
    let skipped = 0;
    job.phase = t("grid.loading");
    updateJob(job);
    try {
      do {
        if (job.cancelled) break;
        const res = (await PGM.api.listCollectionItems(id, cursor)) || {};
        for (const img of res.images || []) {
          if (img && img.key && !seen.has(img.key)) {
            seen.add(img.key);
            images.push(img);
          }
        }
        skipped += Number(res.skipped) || 0;
        const next = res.nextCursor || null;
        cursor = next && !cursors.has(next) ? next : null;
        if (cursor) cursors.add(cursor);
        job.done = images.length;
        updateJob(job);
        if (cursor) await D.sleep(PAGE_GAP_MS);
      } while (cursor);
    } catch (err) {
      if (isLoginError(err)) setLoggedOut();
      endJob(job, "failed", errText(err));
      return;
    }
    if (job.cancelled) {
      endJob(job, "cancelled", "");
      return;
    }
    if (skipped) job.note = t("collection.unavailableSkipped", { n: skipped });
    job.label = downloadLabel(title, images.length);
    await startDownload(images, title, job.label, job);
  }

  // ---- Star and delete (task images only) ---------------------------------------------------------

  function applyFavorite(key, on) {
    const img = S.byKey.get(key);
    if (!img) return;
    img.favorited = on;
    const el = tiles.get(key);
    const old = el && el.querySelector(".badges");
    if (old) old.replaceWith(badges(img));
  }

  async function favorite(on) {
    const images = selectedImages().filter(isTaskImage);
    if (!images.length) return;
    const gen = S.gen;
    const job = addJob({ kind: "favorite", label: t(on ? "job.favorite" : "job.unfavorite", { n: images.length }), total: images.length });
    const okKeys = [];
    for (const part of D.chunk(images, ACTION_CHUNK)) {
      if (job.cancelled) break;
      try {
        const res = (await PGM.api.setFavorite(part, on)) || {};
        const ok = new Set(res.ok || []);
        for (const img of part) {
          if (ok.has(img.key)) {
            okKeys.push(img.key);
            applyFavorite(img.key, on);
          } else {
            job.failures.push(img.key);
          }
        }
      } catch (err) {
        for (const img of part) job.failures.push(`${img.key}: ${errText(err)}`);
        if (isLoginError(err)) {
          setLoggedOut();
          break;
        }
      }
      job.done += part.length;
      updateJob(job);
    }
    if (!on && S.view.kind === "fav" && gen === S.gen) removeTiles(okKeys);
    endJob(job, "done", t("job.favoriteSummary", { ok: okKeys.length, failed: job.failures.length }));
    toast(t(on ? "toast.favorited" : "toast.unfavorited", { n: okKeys.length }) +
      (job.failures.length ? " · " + t("toast.partialFailed", { n: job.failures.length }) : ""), job.failures.length ? "warn" : "ok");
  }

  // Only ever deletes what the confirmation dialog counted (rule 0.2).
  async function deleteSelection() {
    if (isDeleting()) return;
    const images = selectedImages().filter(isTaskImage);
    if (!images.length) return;
    const m = new Set(images.map((img) => String(img.taskId))).size;
    const p = images.filter((img) => img.published).length;
    const ok = await ui.dialogs.confirmDelete({ n: images.length, m, p });
    if (ok && !isDeleting()) runDelete(images);
  }

  async function runDelete(images) {
    const job = addJob({ kind: "delete", label: t("job.delete", { n: images.length }), total: images.length });
    renderBar();
    const deleted = [];
    const skipped = [];
    let attempted = 0;
    for (const part of D.chunk(images, ACTION_CHUNK)) {
      if (job.cancelled) break;
      attempted += part.length;
      try {
        const res = (await PGM.api.deleteImages(part)) || {};
        deleted.push(...(res.deleted || []));
        skipped.push(...(res.skippedPublished || []));
        for (const f of res.failed || []) job.failures.push(`${f.key}: ${reasonText(f.reason)}`);
      } catch (err) {
        for (const img of part) job.failures.push(`${img.key}: ${errText(err)}`);
        if (isLoginError(err)) {
          setLoggedOut();
          break;
        }
      }
      job.done += part.length;
      updateJob(job);
    }
    for (const img of images.slice(attempted)) job.failures.push(`${img.key}: ${t("delete.notAttempted")}`);
    job.finished = true;
    const failed = job.failures.length;
    if (deleted.length) {
      removeTiles(deleted);
      try {
        await PGM.folders.removeKeys(deleted);
      } catch (err) {
        job.note = errText(err);
      }
      await refreshFolders();
    }
    const summary = t("delete.summary", { a: deleted.length, p: skipped.length, f: failed });
    endJob(job, "done", summary);
    renderBar();
    toast(summary, failed ? "warn" : "ok");
  }

  // ---- Local folders -----------------------------------------------------------------------------

  // Validation (1..60 chars, unique ignoring case) happens in PGM.folders; its errors show in the dialog.
  async function newFolder() {
    const res = await ui.dialogs.promptText({
      title: t("folderDialog.newTitle"),
      label: t("folderDialog.name"),
      placeholder: t("folderDialog.placeholder"),
      okText: t("common.create"),
      submit: (name) => PGM.folders.create(name)
    });
    if (!res) return null;
    await refreshFolders();
    const folder = res.result || {};
    toast(t("folder.created", { name: folder.name || res.name }), "ok");
    return folder.id || null;
  }

  async function addToNewFolder() {
    const images = selectedImages();
    const id = await newFolder();
    if (id) addToFolder(id, images);
  }

  async function addToFolder(id, images) {
    if (!images.length) return;
    try {
      const res = (await PGM.folders.addItems(id, images)) || {};
      await refreshFolders();
      const f = S.folders.find((x) => x.id === id);
      const added = Number(res.added) || 0;
      toast(t("folder.added", { name: f ? f.name : "", added, skipped: Number(res.skipped) || images.length - added }), "ok");
    } catch (err) {
      toast(errText(err), "error");
    }
  }

  async function removeFromFolder() {
    const v = S.view;
    if (v.kind !== "folder") return;
    const keys = selectedImages().map((img) => img.key);
    if (!keys.length) return;
    try {
      await PGM.folders.removeItems(v.id, keys);
    } catch (err) {
      toast(errText(err), "error");
      return;
    }
    removeTiles(keys);
    await refreshFolders();
    toast(t("folder.removed", { name: v.name, n: keys.length }), "ok");
  }

  async function renameFolder(f) {
    const res = await ui.dialogs.promptText({
      title: t("folderDialog.renameTitle"),
      label: t("folderDialog.name"),
      value: f.name,
      placeholder: t("folderDialog.placeholder"),
      okText: t("common.save"),
      submit: (name) => (name === f.name ? null : PGM.folders.rename(f.id, name))
    });
    if (!res || !res.result) return;
    await refreshFolders();
    toast(t("folder.renamed", { name: res.result.name || res.name }), "ok");
  }

  async function deleteFolder(f) {
    const ok = await ui.dialogs.confirm({
      title: t("folderDialog.deleteTitle", { name: f.name }),
      body: t("folderDialog.deleteBody", { n: folderCount(f) }),
      okText: t("folderDialog.deleteConfirm"),
      danger: true
    });
    if (!ok) return;
    try {
      await PGM.folders.remove(f.id);
    } catch (err) {
      toast(errText(err), "error");
      return;
    }
    await refreshFolders();
    toast(t("folder.deleted", { name: f.name }), "ok");
  }

  async function doExport() {
    try {
      const data = await PGM.folders.exportData();
      const name = `pixai-gallery-folders_${PGM.naming.formatTime(new Date())}.json`;
      D.saveFile(name, JSON.stringify(data, null, 2), "application/json", E.overlay);
      toast(t("io.exportDone", { n: (data.folders || []).length }), "ok");
    } catch (err) {
      toast(errText(err), "error");
    }
  }

  async function doImport() {
    const file = await D.pickFile("application/json,.json"); // first, while the click still counts as a gesture
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (e) {
      toast(t("io.importFailed", { message: t("error.IMPORT_PARSE") }), "error");
      return;
    }
    const folders = data && Array.isArray(data.folders) ? data.folders : null;
    if (!folders) {
      toast(t("io.importFailed", { message: t("error.IMPORT_INVALID") }), "error");
      return;
    }
    const n = folders.reduce((sum, f) => sum + (f && Array.isArray(f.items) ? f.items.length : 0), 0);
    const ok = await ui.dialogs.confirm({
      title: t("io.title"),
      body: `${t("ui.importCounts", { f: folders.length, n })} ${t("io.importHelp")}`,
      okText: t("folder.import")
    });
    if (!ok) return;
    try {
      const r = (await PGM.folders.importData(data)) || {};
      await refreshFolders();
      const text = t("io.importDone", { created: r.created || 0, merged: r.merged || 0, items: r.items || 0 });
      toast(r.skipped ? `${text} · ${t("io.importSkipped", { n: r.skipped })}` : text, r.skipped ? "warn" : "ok");
    } catch (err) {
      toast(t("io.importFailed", { message: errText(err) }), "error");
    }
  }

  async function openSettings() {
    try {
      const saved = await ui.dialogs.settings();
      if (!saved) return;
      applyLanguage(saved.language);
      toast(t("settings.saved"), "ok");
    } catch (err) {
      toast(errText(err), "error");
    }
  }

  Object.assign(ui, { mount, open, close, toggle, applyLanguage, isOpen: () => S.open });
})();
