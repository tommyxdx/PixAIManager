// Boot: mounts the launcher, answers the toolbar button, and opens on "#pgm" links.
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});
  if (PGM.booted || !PGM.ui || typeof PGM.ui.mount !== "function") return;
  PGM.booted = true;
  const ui = PGM.ui;

  // background.js opens https://pixai.art/library#pgm when the toolbar button is used elsewhere.
  function openFromHash() {
    if (location.hash !== "#pgm") return;
    history.replaceState(history.state, "", location.pathname + location.search);
    ui.open();
  }

  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== "pgm-toggle") return;
      ui.toggle();
      sendResponse({ ok: true });
    });
  } catch (e) {
    // No extension messaging (e.g. a test page without the stub); the launcher still works.
  }

  // The saved language applies before the launcher is drawn; later changes (also from other tabs) redraw.
  async function boot() {
    try {
      PGM.i18n.use((await PGM.settings.get()).language);
      PGM.settings.onChange((s) => ui.applyLanguage(s.language));
    } catch (e) {
      // Settings unavailable: keep the browser language.
    }
    ui.mount();
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
