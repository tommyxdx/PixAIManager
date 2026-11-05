// Overlay CSS, adopted into the shadow root by src/ui/app.js.
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});

  PGM.styles = `
:host {
  all: initial;
  position: fixed; top: 0; left: 0; width: 0; height: 0;
  z-index: 2147483647;
  color-scheme: dark;
  --bg: #0d0d12; --panel: #14141b; --panel-2: #1b1b24; --panel-3: #252531;
  --line: #2a2a37; --line-2: #3a3a4a;
  --text: #ececf3; --muted: #9a9aad; --faint: #6c6c7f;
  --accent: #a855f7; --accent-hover: #b97bf9; --accent-soft: rgba(168, 85, 247, 0.16);
  --danger: #ef4444; --danger-hover: #f05a5a; --danger-soft: rgba(239, 68, 68, 0.14);
  --ok: #22c55e; --warn: #f59e0b; --star: #facc15;
  font: 13px/1.5 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  color: var(--text);
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: 0.45; }
a { color: var(--accent-hover); }
h2 { margin: 0; }
svg.i { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
svg.i.fill { fill: currentColor; stroke: none; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-track { background: transparent; }

/* Launcher */
.launcher {
  position: fixed; left: 16px; bottom: 16px;
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 999px;
  border: 1px solid rgba(168, 85, 247, 0.55); background: rgba(20, 20, 27, 0.92);
  color: var(--text); font-size: 13px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
.launcher:hover { background: var(--accent); border-color: var(--accent); }

/* Overlay shell */
.overlay {
  position: fixed; inset: 0; display: none; flex-direction: column;
  background: var(--bg); color: var(--text); outline: none; overflow: hidden;
  overscroll-behavior: contain;
}
.overlay.open { display: flex; }
.hdr {
  flex: none; height: 52px; display: flex; align-items: center; gap: 10px;
  padding: 0 12px 0 16px; border-bottom: 1px solid var(--line); background: var(--panel);
}
.brand { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; white-space: nowrap; }
.brand .logo { width: 24px; height: 24px; border-radius: 7px; display: grid; place-items: center; background: var(--accent); color: #fff; }
.grow { flex: 1; min-width: 0; }
.account { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--muted); white-space: nowrap; }
.account .name { color: var(--text); overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.account .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); flex: none; }
.body { flex: 1; min-height: 0; display: flex; }

/* Buttons and inputs */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 12px; border-radius: 8px; white-space: nowrap;
  border: 1px solid var(--line-2); background: var(--panel-2); color: var(--text);
}
.btn:hover:not(:disabled) { background: var(--panel-3); border-color: #4a4a5c; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn.danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.btn.danger:hover:not(:disabled) { background: var(--danger-hover); border-color: var(--danger-hover); }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.btn.ghost:hover:not(:disabled) { color: var(--text); background: var(--panel-2); }
.btn.active { border-color: var(--accent); color: var(--accent-hover); }
.icon-btn {
  display: inline-grid; place-items: center; width: 32px; height: 32px; flex: none;
  border: 0; border-radius: 8px; background: transparent; color: var(--muted);
}
.icon-btn:hover:not(:disabled) { background: var(--panel-3); color: var(--text); }
.icon-btn.sm { width: 24px; height: 24px; border-radius: 6px; }
.icon-btn.sm svg.i { width: 14px; height: 14px; }
.link { border: 0; background: none; padding: 0; color: var(--accent-hover); cursor: pointer; text-decoration: none; }
.link:hover { text-decoration: underline; }
.input {
  height: 32px; padding: 0 10px; border-radius: 8px; min-width: 0;
  border: 1px solid var(--line-2); background: var(--panel-2); color: var(--text); outline: none;
}
.input:focus { border-color: var(--accent); }
.input:disabled { opacity: 0.45; }
select.input { padding-right: 4px; }
.muted { color: var(--muted); }

/* Sidebar */
.side {
  flex: none; width: 240px; overflow-y: auto; overscroll-behavior: contain;
  border-right: 1px solid var(--line); background: var(--panel); padding: 10px 8px 24px;
}
.side-title { margin: 14px 8px 6px; font-size: 12px; color: var(--faint); font-weight: 600; letter-spacing: 0.02em; }
.side-title:first-child { margin-top: 4px; }
.nav-item {
  position: relative; display: flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 8px; border-radius: 8px; cursor: pointer; color: var(--muted);
}
.nav-item:hover { background: var(--panel-2); color: var(--text); }
.nav-item.active { background: var(--accent-soft); color: var(--text); }
.nav-item.active > svg.i { color: var(--accent-hover); }
.nav-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.count { flex: none; font-size: 12px; color: var(--faint); }
.row-actions { display: none; align-items: center; gap: 2px; flex: none; }
.nav-item:hover .row-actions, .nav-item:focus-within .row-actions { display: flex; }
.nav-item:hover .row-actions + .count, .nav-item:focus-within .row-actions + .count { display: none; }
.nav-add { display: flex; align-items: center; gap: 6px; width: 100%; height: 32px; padding: 0 8px; border: 0; border-radius: 8px; background: none; color: var(--accent-hover); text-align: left; }
.nav-add:hover { background: var(--panel-2); }
.side-note { margin: 8px 8px 0; font-size: 12px; color: var(--faint); line-height: 1.5; }
.side-note .actions { display: flex; gap: 14px; margin-top: 6px; }
.side-msg { padding: 6px 8px; font-size: 12px; color: var(--faint); }

/* Main column */
.main { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; }
.toolbar {
  flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 10px 16px; border-bottom: 1px solid var(--line);
}
.search-wrap { position: relative; display: flex; align-items: center; flex: 1 1 180px; min-width: 150px; max-width: 320px; }
.search-wrap svg.i { position: absolute; left: 9px; color: var(--faint); pointer-events: none; }
.search-wrap .input { width: 100%; padding-left: 30px; }
.input.date { width: 136px; }
.dash { color: var(--faint); }
.sel-count { color: var(--muted); white-space: nowrap; min-width: 64px; text-align: right; }
.bar {
  flex: none; min-height: 46px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 7px 16px; border-bottom: 1px solid var(--line); color: var(--muted);
}
.bar.active { background: var(--accent-soft); color: var(--text); }
.bar .bar-count { font-weight: 600; margin-right: 4px; }
.bar .hint { color: var(--faint); }
.scroller { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px; padding: 14px 16px 4px;
}
.grid:empty { display: none; }
.sentinel { height: 1px; }

/* Tiles */
.tile {
  position: relative; aspect-ratio: 1 / 1; border-radius: 10px; overflow: hidden;
  background: var(--panel-2); cursor: pointer; user-select: none;
  outline: 2px solid transparent; outline-offset: -2px; transition: outline-color 0.1s;
}
.tile:hover { outline-color: var(--line-2); }
.tile.sel { outline: 3px solid var(--accent); outline-offset: -3px; }
.tile img { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
.tile-ph { width: 100%; height: 100%; display: grid; place-items: center; color: var(--faint); }
.tile-ph svg.i { width: 28px; height: 28px; }
.check {
  position: absolute; top: 7px; left: 7px; width: 22px; height: 22px; border-radius: 50%;
  display: grid; place-items: center; color: transparent;
  border: 2px solid rgba(255, 255, 255, 0.85); background: rgba(0, 0, 0, 0.35);
  opacity: 0; transition: opacity 0.1s;
}
.check svg.i { width: 13px; height: 13px; stroke-width: 3; }
.tile:hover .check, .grid.selecting .check { opacity: 1; }
.tile.sel .check { opacity: 1; background: var(--accent); border-color: var(--accent); color: #fff; }
.badges { position: absolute; top: 7px; right: 7px; display: flex; gap: 4px; align-items: center; }
.badge {
  height: 20px; padding: 0 6px; border-radius: 6px; display: inline-flex; align-items: center;
  font-size: 11px; line-height: 1; background: rgba(0, 0, 0, 0.6); color: #fff;
}
.badge.star { color: var(--star); font-size: 13px; }
.badge.pub { background: rgba(34, 197, 94, 0.85); }
.play {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
  background: rgba(0, 0, 0, 0.55); color: #fff; pointer-events: none;
}
.tile-meta {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 8px 6px;
  font-size: 11px; color: rgba(255, 255, 255, 0.88);
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7)); pointer-events: none;
}

/* States */
.state { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 18px 16px 28px; color: var(--muted); text-align: center; }
.state.big { flex-direction: column; padding: 72px 24px; font-size: 14px; }
.state.note { padding-top: 0; color: var(--faint); font-size: 12px; }
.spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line-2); border-top-color: var(--accent); animation: pgm-spin 0.8s linear infinite; }
@keyframes pgm-spin { to { transform: rotate(360deg); } }

/* Dropdown menu */
.menu {
  position: absolute; z-index: 40; min-width: 220px; max-width: 320px; max-height: 50vh; overflow-y: auto;
  padding: 6px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--panel-2);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); overscroll-behavior: contain;
}
.menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 10px;
  border: 0; border-radius: 6px; background: none; color: var(--text); text-align: left;
}
.menu-item:hover { background: var(--panel-3); }
.menu-item.accent { color: var(--accent-hover); }
.menu-empty { padding: 6px 10px; color: var(--faint); }
.menu-sep { height: 1px; margin: 4px 2px; background: var(--line); }

/* Job drawer */
.drawer {
  position: absolute; right: 16px; bottom: 16px; z-index: 30; width: 340px; max-width: calc(100vw - 32px);
  max-height: 45vh; overflow-y: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: 8px;
}
.job {
  padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--panel-2);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.job.done { border-color: rgba(34, 197, 94, 0.4); }
.job.failed { border-color: rgba(239, 68, 68, 0.5); }
.job.cancelled { border-color: var(--line-2); }
.job-head { display: flex; align-items: center; gap: 8px; }
.job-label { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.job-line { margin-top: 4px; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.job .link { font-size: 12px; margin-top: 4px; }
.job-actions { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.job-actions:empty { display: none; }
.btn.lang { min-width: 44px; justify-content: center; font-weight: 600; }
.progress { height: 4px; margin-top: 8px; border-radius: 4px; background: var(--line); overflow: hidden; }
.progress > i { display: block; height: 100%; width: 0; background: var(--accent); transition: width 0.2s; }
.progress.indet > i { width: 30%; animation: pgm-indet 1.2s ease-in-out infinite; }
@keyframes pgm-indet { from { transform: translateX(-100%); } to { transform: translateX(340%); } }

/* Toasts */
.toasts { position: absolute; top: 62px; left: 50%; transform: translateX(-50%); z-index: 60; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
.toast {
  max-width: min(560px, 90vw); padding: 9px 14px; border-radius: 10px; pointer-events: auto;
  background: var(--panel-3); border: 1px solid var(--line-2); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.toast.ok { border-color: rgba(34, 197, 94, 0.6); }
.toast.warn { border-color: rgba(245, 158, 11, 0.7); }
.toast.error { border-color: rgba(239, 68, 68, 0.7); }

/* Dialogs */
.layer {
  position: absolute; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(0, 0, 0, 0.62);
}
.dialog {
  width: min(480px, 100%); max-height: 100%; overflow-y: auto; overscroll-behavior: contain;
  padding: 20px; border-radius: 14px; border: 1px solid var(--line-2); background: var(--panel);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6); outline: none;
}
.dialog.wide { width: min(620px, 100%); }
.dlg-title { font-size: 17px; font-weight: 600; margin-bottom: 10px; }
.dlg-body { margin: 0 0 14px; color: var(--muted); line-height: 1.65; }
.dlg-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.dlg-actions .left { margin-right: auto; }
.dlg-error { min-height: 18px; margin-top: 6px; font-size: 12px; color: var(--danger); }
.dialog .input { width: 100%; }
.tick { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); cursor: pointer; }
.tick input { width: 16px; height: 16px; accent-color: var(--danger); margin: 0; }
.field { display: grid; grid-template-columns: 170px 1fr; gap: 6px 12px; align-items: center; margin-bottom: 10px; }
.field > label { color: var(--muted); }
.field .help { grid-column: 2; font-size: 12px; color: var(--faint); line-height: 1.5; }
.check-row { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.check-row input { accent-color: var(--accent); margin: 0; }
.section { margin: 16px 0 8px; font-size: 12px; font-weight: 600; color: var(--faint); }
.example { display: block; margin-top: 4px; padding: 6px 8px; border-radius: 6px; background: var(--panel-2); font: 12px/1.5 ui-monospace, Consolas, monospace; color: var(--text); overflow-wrap: anywhere; }
.about { margin-top: 14px; font-size: 12px; color: var(--faint); }

/* Preview */
.dialog.preview {
  width: 100%; height: 100%; max-height: none; padding: 0; display: flex; overflow: hidden;
  background: var(--panel); border-radius: 14px;
}
.pv-stage { position: relative; flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; background: #08080b; }
.pv-stage img, .pv-stage video { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.pv-nav {
  position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 64px;
  display: grid; place-items: center; border: 0; border-radius: 10px;
  background: rgba(0, 0, 0, 0.45); color: #fff;
}
.pv-nav:hover:not(:disabled) { background: rgba(0, 0, 0, 0.7); }
.pv-nav.prev { left: 12px; }
.pv-nav.next { right: 12px; }
.pv-nav svg.i { width: 22px; height: 22px; }
.pv-info { flex: none; width: 340px; display: flex; flex-direction: column; gap: 12px; padding: 16px; overflow-y: auto; border-left: 1px solid var(--line); }
.pv-top { display: flex; align-items: center; gap: 8px; }
.pv-pos { flex: 1; color: var(--muted); }
.pv-label { font-size: 12px; color: var(--faint); margin-bottom: 4px; }
.pv-prompt {
  margin: 0; padding: 10px; border-radius: 8px; background: var(--panel-2); max-height: 40vh; overflow-y: auto;
  white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; cursor: text; font-size: 12.5px; line-height: 1.6;
}
.pv-meta { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 12.5px; }
.pv-meta dt { color: var(--faint); }
.pv-meta dd { margin: 0; overflow-wrap: anywhere; user-select: text; }
.pv-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.pv-empty { color: var(--faint); }

@media (max-width: 1180px) {
  .side { width: 210px; }
  .pv-info { width: 300px; }
}
@media (max-width: 1000px) {
  .side { width: 196px; }
  .grid { grid-template-columns: repeat(auto-fill, minmax(136px, 1fr)); gap: 8px; padding: 12px 12px 4px; }
  .toolbar, .bar { padding-left: 12px; padding-right: 12px; }
  .input.date { width: 128px; }
  .account .name { max-width: 140px; }
  .field { grid-template-columns: 1fr; }
  .field .help { grid-column: 1; }
  .pv-info { width: 260px; }
}
`;
})();
