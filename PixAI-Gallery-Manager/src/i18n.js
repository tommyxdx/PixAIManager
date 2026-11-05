// UI strings for both halves of the extension.
//
//   PGM.t(key, vars)        -> string. "{name}" is replaced only when vars has "name",
//                              so help texts may show literal "{folder}" etc.
//   PGM.t.error(err)        -> localized text for a PGMError / Error.
//   PGM.i18n.lang           -> "zh" | "en" (from navigator.language, settable).
//   PGM.i18n.auto           -> "zh" | "en" picked from navigator.language.
//   PGM.i18n.use(pref)      -> applies the "language" setting ("auto" | "zh" | "en"); true if lang changed.
//   PGM.i18n.add(lang, obj) -> merge more keys, e.g. from src/ui/strings.js:
//                              PGM.i18n.add("zh", {...}); PGM.i18n.add("en", {...});
//                              or PGM.i18n.add({ zh: {...}, en: {...} }).
//   PGM.strings             -> the live table { zh: {...}, en: {...} }; t() reads it on every call.
// Missing en keys fall back to zh, missing zh keys fall back to the key itself.
(function () {
  "use strict";
  const PGM = (globalThis.PGM = globalThis.PGM || {});

  const ZH = {
    // App shell and header
    "app.title": "PixAI 图库管理",
    "app.subtitle": "批量管理你的 PixAI 生成图片",
    "app.launcher": "图库管理",
    "app.launcherTitle": "打开 PixAI 图库管理",
    "header.account": "{name}",
    "header.accountTitle": "已登录：{name}",
    "header.notLoggedIn": "未登录 pixai.art",
    "header.login": "去登录",
    "header.settings": "设置",
    "header.close": "关闭",
    "header.refresh": "刷新",

    // Sidebar
    "sidebar.views": "视图",
    "view.all": "全部生成",
    "view.starred": "PixAI 星标",
    "view.folder": "收藏夹：{name}",
    "view.collection": "PixAI 收藏夹：{name}",
    "sidebar.folders": "我的收藏夹（仅本机）",
    "sidebar.collections": "PixAI 作品收藏夹",
    "folder.new": "+ 新建收藏夹",
    "folder.newEllipsis": "新建收藏夹…",
    "folder.downloadAll": "下载全部",
    "folder.rename": "重命名",
    "folder.delete": "删除收藏夹",
    "folder.count": "{n} 张",
    "folder.empty": "还没有收藏夹",
    "folder.localNote": "这些收藏夹只保存在当前浏览器里，不会同步到 PixAI，也不会同步到其他电脑。清除扩展数据或换电脑前请先导出。",
    "folder.export": "导出",
    "folder.import": "导入",
    "folder.added": "已加入“{name}”：新增 {added} 张，{skipped} 张已在其中",
    "folder.removed": "已从“{name}”移除 {n} 张",
    "folder.created": "已创建收藏夹“{name}”",
    "folder.renamed": "已重命名为“{name}”",
    "folder.deleted": "已删除收藏夹“{name}”",
    "collection.defaultTitle": "我的收藏",
    "collection.readOnly": "只读。PixAI 的收藏夹只能收录已发布的作品，未发布的生成图片无法加入，所以这里只提供浏览和下载。",
    "collection.none": "没有作品收藏夹",
    "collection.count": "{n} 件",
    "collection.loading": "正在读取收藏夹…",
    "collection.loadFailed": "收藏夹读取失败",
    "collection.unavailableSkipped": "{n} 个不可用的作品已跳过",
    "collection.downloadAll": "下载全部",

    // Toolbar
    "toolbar.search": "搜索提示词…",
    "toolbar.searchTitle": "按关键词搜索（在 PixAI 服务器上搜索）",
    "toolbar.dateFrom": "开始日期",
    "toolbar.dateTo": "结束日期",
    "toolbar.type": "类型",
    "type.all": "全部类型",
    "type.image": "图片",
    "type.edit": "编辑",
    "type.video": "视频",
    "toolbar.loadAll": "加载全部",
    "toolbar.loadingAll": "正在加载… 已 {n} 张",
    "toolbar.stopLoading": "停止加载",
    "toolbar.selectAll": "全选已加载",
    "toolbar.clearSelection": "清除选择",
    "toolbar.selected": "已选 {n} 张",
    "toolbar.loaded": "已加载 {n} 张",
    "toolbar.allLoaded": "已全部加载（{n} 张）",
    "toolbar.clearFilters": "清除筛选",

    // Grid and tiles
    "grid.loading": "加载中…",
    "grid.loadingMore": "正在加载更多…",
    "grid.end": "已经到底了",
    "tile.published": "已发布",
    "tile.favorited": "已加星",
    "tile.video": "视频",
    "tile.multi": "{index}/{count}",
    "tile.select": "选择",
    "tile.noPrompt": "（无提示词）",
    "tile.unavailable": "图片不可用",

    // Action bar
    "action.download": "下载 ({n})",
    "action.addToFolder": "加入收藏夹",
    "action.removeFromFolder": "从收藏夹移除",
    "action.star": "加星",
    "action.unstar": "取消星标",
    "action.delete": "删除 ({n})",
    "action.taskOnly": "只对“全部生成”里的图片可用",
    "action.noFolders": "还没有收藏夹",

    // Preview
    "preview.title": "预览",
    "preview.prompt": "提示词",
    "preview.noPrompt": "（无提示词）",
    "preview.time": "生成时间",
    "preview.task": "任务 ID",
    "preview.media": "图片 ID",
    "preview.artwork": "作品 ID",
    "preview.copyPrompt": "复制提示词",
    "preview.copied": "已复制",
    "preview.copyFailed": "复制失败",
    "preview.openOnPixai": "在 PixAI 打开",
    "preview.download": "下载这张",
    "preview.prev": "上一张",
    "preview.next": "下一张",
    "preview.position": "{i} / {n}",
    "preview.published": "已发布为作品",
    "preview.favorited": "已在 PixAI 加星",

    // Jobs drawer
    "job.title": "任务",
    "job.download": "下载：{label}",
    "job.loadAll": "加载全部",
    "job.delete": "删除 {n} 张",
    "job.favorite": "加星 {n} 张",
    "job.unfavorite": "取消星标 {n} 张",
    "job.prepare": "准备文件名…",
    "job.progress": "{done}/{total}",
    "job.failures": "失败 {n}",
    "job.cancel": "取消",
    "job.cancelling": "正在取消…",
    "job.cancelled": "已取消",
    "job.running": "进行中",
    "job.done": "完成",
    "job.failed": "失败",
    "job.copyFailures": "复制失败列表",
    "job.failuresCopied": "失败列表已复制",
    "job.dismiss": "关闭",
    "job.downloadSummary": "已下载 {done} 个文件，失败 {failed} 个",
    "job.favoriteSummary": "已更新 {ok} 张，失败 {failed} 张",
    "job.loadAllSummary": "已加载 {n} 张",
    "job.none": "没有进行中的任务",

    // Delete dialog (EXT_SPEC section 6)
    "delete.title": "永久删除 {n} 张图片？",
    "delete.body": "来自 {m} 个生成任务。删除后无法恢复，已用积分不会退还。已发布为作品的 {p} 张会被 PixAI 跳过。被删除的图片也会从本机收藏夹中移除。",
    "delete.ack": "我明白删除后无法恢复",
    "delete.confirm": "删除",
    "delete.running": "正在删除…",
    "delete.summary": "已删除 {a} 张，跳过 {p} 张已发布，失败 {f} 张",
    "delete.artworkNotAllowed": "PixAI 收藏夹里的作品不能在这里删除",

    // Folder dialogs
    "folderDialog.newTitle": "新建收藏夹",
    "folderDialog.renameTitle": "重命名收藏夹",
    "folderDialog.name": "名称",
    "folderDialog.placeholder": "1 到 60 个字符",
    "folderDialog.deleteTitle": "删除收藏夹“{name}”？",
    "folderDialog.deleteBody": "只删除本机记录的这个收藏夹（{n} 张），PixAI 上的图片不受影响。",
    "folderDialog.deleteConfirm": "删除收藏夹",

    // Export / import
    "io.title": "导出 / 导入收藏夹",
    "io.exportHelp": "导出为 JSON 文件，可在其他电脑或浏览器中导入。文件里只有图片链接和提示词，不含登录信息。",
    "io.importHelp": "导入会按收藏夹名称合并，相同的图片不会重复添加。",
    "io.export": "导出 JSON",
    "io.import": "选择 JSON 文件导入",
    "io.exportDone": "已导出 {n} 个收藏夹",
    "io.importDone": "导入完成：新建 {created} 个收藏夹，合并 {merged} 个，新增 {items} 张",
    "io.importSkipped": "{n} 项因格式或链接不合法被跳过",
    "io.importFailed": "导入失败：{message}",

    // Settings dialog
    "settings.title": "设置",
    "settings.naming": "文件命名",
    "settings.template": "文件名模板",
    "settings.templateHelp": "可用变量：{folder} 收藏夹名，{time} 生成时间，{prompt} 提示词标签，{index} 序号，{task} 任务 ID，{media} 图片 ID。空变量连同相邻的下划线会被省略。",
    "settings.promptCount": "提示词标签数量",
    "settings.skipQuality": "跳过质量词（masterpiece、best quality 等）",
    "settings.directory": "下载子目录",
    "settings.directoryHelp": "相对于浏览器的下载文件夹。{folder} 会替换为收藏夹名。",
    "settings.noFolderName": "不在收藏夹时的目录名",
    "settings.downloads": "下载",
    "settings.concurrency": "同时下载数（1 到 3）",
    "settings.loading": "加载",
    "settings.pageSize": "每页数量（10 到 50）",
    "settings.example": "示例：",
    "settings.save": "保存",
    "settings.saved": "设置已保存",
    "settings.reset": "恢复默认",
    "settings.about": "非官方扩展。只使用你已登录的 pixai.art 网页接口做管理，不会生成图片。",

    // Common
    "common.ok": "确定",
    "common.cancel": "取消",
    "common.save": "保存",
    "common.create": "创建",
    "common.close": "关闭",
    "common.retry": "重试",
    "common.loading": "加载中…",
    "common.confirm": "确认",
    "common.yes": "是",
    "common.no": "否",

    // Empty and error states
    "empty.notLoggedIn": "未登录 pixai.art。请先登录，然后重新打开图库管理。",
    "empty.network": "网络错误，无法加载。",
    "empty.results": "没有找到图片",
    "empty.starred": "还没有加星的图片",
    "empty.folder": "这个收藏夹还是空的。在“全部生成”里选择图片，再点“加入收藏夹”。",
    "empty.collection": "这个收藏夹里没有可用的作品",
    "empty.selectView": "从左侧选择一个视图",

    // Toasts
    "toast.downloadStarted": "已开始下载 {n} 个文件",
    "toast.nothingToDownload": "没有可下载的图片",
    "toast.favorited": "已加星 {n} 张",
    "toast.unfavorited": "已取消星标 {n} 张",
    "toast.partialFailed": "{n} 张未能更新，请重试",
    "toast.selectedAll": "已选择 {n} 张",
    "toast.loadAllStopped": "已停止加载",
    "toast.copied": "已复制",
    "toast.error": "出错了：{message}",

    // Errors (keys are "error." + PGMError.code)
    "error.unknown": "未知错误",
    "error.generic": "出错了：{message}",
    "error.http": "请求失败（HTTP {status}）",
    "error.NETWORK": "网络错误，请检查连接后重试",
    "error.LOGIN_REQUIRED": "请先登录 pixai.art",
    "error.UNAUTHORIZED": "请先登录 pixai.art",
    "error.FORBIDDEN": "没有权限执行这个操作",
    "error.NOT_FOUND": "内容不存在或已被删除",
    "error.BAD_REQUEST": "请求参数不正确：{message}",
    "error.TOO_MANY_REQUESTS": "请求太频繁，请稍后再试",
    "error.ABORTED": "已取消",
    "error.CANCELLED": "已取消",
    "error.FOLDER_NAME_EMPTY": "名称不能为空",
    "error.FOLDER_NAME_TOO_LONG": "名称最多 60 个字符",
    "error.FOLDER_NAME_TAKEN": "已有同名收藏夹",
    "error.FOLDER_NOT_FOUND": "收藏夹不存在",
    "error.IMPORT_INVALID": "文件格式不正确，不是本扩展导出的收藏夹文件",
    "error.IMPORT_PARSE": "文件不是有效的 JSON",
    "error.BAD_URL": "图片链接不在允许的域名内",
    "error.BAD_PATH": "文件路径不合法",
    "error.DISCONNECTED": "与扩展后台的连接已断开",
    "error.DOWNLOAD_INTERRUPTED": "下载中断",
    "error.NO_RESULT": "PixAI 没有返回这张图片的结果",
    "error.UNKNOWN_RESULT": "PixAI 返回的结果无法识别",
    "error.NOT_TASK_IMAGE": "只能处理生成记录里的图片",
    "error.MEDIA_PUBLISHED": "已发布为作品，被 PixAI 跳过",
    "error.EXTENSION_RELOADED": "扩展已更新或重新加载，请刷新页面",

    // Language and download mode
    "naming.noFolder": "生成记录",
    "header.switchLang": "EN",
    "header.switchLangTitle": "Switch to English",
    "settings.language": "界面语言 / Language",
    "settings.langAuto": "自动（跟随浏览器）",
    "settings.langZh": "中文",
    "settings.langEn": "English",
    "settings.noFolderHelp": "留空时按界面语言使用“生成记录”或“Generations”。",
    "settings.downloadMode": "下载方式",
    "settings.modeZip": "打包成 ZIP（推荐）",
    "settings.modeFiles": "单独的文件",
    "settings.modeHelp": "ZIP 里附带一份下载报告，列出每个文件是否成功、失败原因和原图链接。只下载一张图时总是直接保存。",
    "settings.zipPart": "单个 ZIP 最大",
    "settings.zipPartHelp": "超过时自动分成多个 ZIP（_part1、_part2…），每个 ZIP 有自己的报告。",
    "settings.size": "{n} MB",
    "settings.webpToPng": "把 WebP 图片转成 PNG 保存（和 PixAI 生成页的下载按钮一样）",
    "settings.webpToPngHelp": "PixAI 的生成图大多以无损 WebP 存储，生成页的下载按钮会把它转成 PNG。这里的转换方法和网页版相同，得到的 PNG 与网页版下载的一致，画面完全不变，但文件大约是 WebP 的 2 倍。关闭则保存 PixAI 上的原始 WebP 文件。动图不转换。",
    "report.converted": "其中 {n} 个 WebP 已转成 PNG（画面不变）",
    "job.fetching": "下载图片",
    "job.savingZip": "保存压缩包 {name}",
    "job.zipSummary": "已打包 {done} 个文件（{zips} 个压缩包），失败 {failed} 个",
    "job.retryFailed": "重试失败项（{n}）",
    "job.retryLabel": "{label} · 重试",
    "job.showFile": "打开所在文件夹",
    "toast.zipStarted": "开始打包 {n} 个文件",

    // Packed download report (inside the ZIP)
    "report.file": "_下载报告.txt",
    "report.title": "PixAI 图库管理 · 下载报告",
    "report.job": "任务：{label}",
    "report.time": "打包时间：{time}",
    "report.archive": "压缩包：{name}",
    "report.counts": "本压缩包：成功 {ok} 个，失败 {failed} 个",
    "report.total": "整个任务：共 {total} 个，成功 {ok} 个，失败 {failed} 个，共 {parts} 个压缩包",
    "report.cancelled": "任务已取消，剩下的文件没有下载。",
    "report.failedHead": "失败（{n}）：",
    "report.okHead": "成功（{n}）：",
    "report.none": "（无）",
    "report.reason": "原因：{reason}",
    "report.url": "链接：{url}",
    "report.retryHint": "在图库管理右下角的任务列表里点“重试失败项”，可以只重新下载失败的文件。如果某些文件一直失败，可以在设置里把下载方式改成“单独的文件”再试。",

    // More failure reasons (packing and Chrome download errors)
    "error.TOO_MANY_FILES": "一次最多下载 20000 个文件",
    "error.PAUSED_BY_USER": "下载被暂停",
    "error.FETCH_FAILED": "图片下载失败",
    "error.TIMEOUT": "下载超时",
    "error.EMPTY_FILE": "下载到的文件是空的",
    "error.FILE_TOO_LARGE": "文件太大，放不进压缩包",
    "error.ZIP_SAVE_FAILED": "压缩包保存失败",
    "error.OFFSCREEN_FAILED": "无法启动打包，请在设置里改用“单独的文件”",
    "error.USER_CANCELED": "下载被取消",
    "error.USER_SHUTDOWN": "浏览器关闭，下载中断",
    "error.FILE_FAILED": "写入文件失败",
    "error.FILE_ACCESS_DENIED": "没有写入下载文件夹的权限",
    "error.FILE_NO_SPACE": "磁盘空间不足",
    "error.FILE_NAME_TOO_LONG": "文件路径太长",
    "error.FILE_BLOCKED": "文件被系统或安全软件拦截",
    "error.FILE_TRANSIENT_ERROR": "写入文件时出现临时错误",
    "error.NETWORK_FAILED": "网络错误",
    "error.NETWORK_TIMEOUT": "网络超时",
    "error.NETWORK_DISCONNECTED": "网络已断开",
    "error.SERVER_FAILED": "服务器错误",
    "error.SERVER_FORBIDDEN": "服务器拒绝访问（403）",
    "error.SERVER_BAD_CONTENT": "服务器上没有这个文件",
    "error.SERVER_UNREACHABLE": "无法连接服务器",
    "error.CRASH": "浏览器崩溃，下载中断"
  };

  const EN = {
    "app.title": "PixAI Gallery Manager",
    "app.subtitle": "Batch-manage your PixAI generations",
    "app.launcher": "Gallery",
    "app.launcherTitle": "Open PixAI Gallery Manager",
    "header.account": "{name}",
    "header.accountTitle": "Signed in as {name}",
    "header.notLoggedIn": "Not logged in to pixai.art",
    "header.login": "Log in",
    "header.settings": "Settings",
    "header.close": "Close",
    "header.refresh": "Refresh",

    "sidebar.views": "Views",
    "view.all": "All generations",
    "view.starred": "PixAI starred",
    "view.folder": "Folder: {name}",
    "view.collection": "PixAI collection: {name}",
    "sidebar.folders": "My folders (this browser only)",
    "sidebar.collections": "PixAI artwork collections",
    "folder.new": "+ New folder",
    "folder.newEllipsis": "New folder…",
    "folder.downloadAll": "Download all",
    "folder.rename": "Rename",
    "folder.delete": "Delete folder",
    "folder.count": "{n}",
    "folder.empty": "No folders yet",
    "folder.localNote": "These folders are stored in this browser only. They are not synced to PixAI or to other computers. Export them before clearing extension data or switching computers.",
    "folder.export": "Export",
    "folder.import": "Import",
    "folder.added": "Added to \"{name}\": {added} new, {skipped} already there",
    "folder.removed": "Removed {n} from \"{name}\"",
    "folder.created": "Created folder \"{name}\"",
    "folder.renamed": "Renamed to \"{name}\"",
    "folder.deleted": "Deleted folder \"{name}\"",
    "collection.defaultTitle": "My Saves",
    "collection.readOnly": "Read-only. PixAI collections only hold published artworks; unpublished generations cannot be added, so this view is for browsing and downloading.",
    "collection.none": "No artwork collections",
    "collection.count": "{n}",
    "collection.loading": "Loading collections…",
    "collection.loadFailed": "Could not load collections",
    "collection.unavailableSkipped": "{n} unavailable item(s) skipped",
    "collection.downloadAll": "Download all",

    "toolbar.search": "Search prompts…",
    "toolbar.searchTitle": "Keyword search (runs on the PixAI server)",
    "toolbar.dateFrom": "From",
    "toolbar.dateTo": "To",
    "toolbar.type": "Type",
    "type.all": "All types",
    "type.image": "Images",
    "type.edit": "Edits",
    "type.video": "Videos",
    "toolbar.loadAll": "Load all",
    "toolbar.loadingAll": "Loading… {n} so far",
    "toolbar.stopLoading": "Stop",
    "toolbar.selectAll": "Select all loaded",
    "toolbar.clearSelection": "Clear selection",
    "toolbar.selected": "{n} selected",
    "toolbar.loaded": "{n} loaded",
    "toolbar.allLoaded": "All loaded ({n})",
    "toolbar.clearFilters": "Clear filters",

    "grid.loading": "Loading…",
    "grid.loadingMore": "Loading more…",
    "grid.end": "End of list",
    "tile.published": "Published",
    "tile.favorited": "Starred",
    "tile.video": "Video",
    "tile.multi": "{index}/{count}",
    "tile.select": "Select",
    "tile.noPrompt": "(no prompt)",
    "tile.unavailable": "Image unavailable",

    "action.download": "Download ({n})",
    "action.addToFolder": "Add to folder",
    "action.removeFromFolder": "Remove from folder",
    "action.star": "Star",
    "action.unstar": "Unstar",
    "action.delete": "Delete ({n})",
    "action.taskOnly": "Only for images from All generations",
    "action.noFolders": "No folders yet",

    "preview.title": "Preview",
    "preview.prompt": "Prompt",
    "preview.noPrompt": "(no prompt)",
    "preview.time": "Generated",
    "preview.task": "Task ID",
    "preview.media": "Media ID",
    "preview.artwork": "Artwork ID",
    "preview.copyPrompt": "Copy prompt",
    "preview.copied": "Copied",
    "preview.copyFailed": "Copy failed",
    "preview.openOnPixai": "Open on PixAI",
    "preview.download": "Download this",
    "preview.prev": "Previous",
    "preview.next": "Next",
    "preview.position": "{i} / {n}",
    "preview.published": "Published as an artwork",
    "preview.favorited": "Starred on PixAI",

    "job.title": "Jobs",
    "job.download": "Download: {label}",
    "job.loadAll": "Load all",
    "job.delete": "Delete {n}",
    "job.favorite": "Star {n}",
    "job.unfavorite": "Unstar {n}",
    "job.prepare": "Preparing file names…",
    "job.progress": "{done}/{total}",
    "job.failures": "{n} failed",
    "job.cancel": "Cancel",
    "job.cancelling": "Cancelling…",
    "job.cancelled": "Cancelled",
    "job.running": "Running",
    "job.done": "Done",
    "job.failed": "Failed",
    "job.copyFailures": "Copy failure list",
    "job.failuresCopied": "Failure list copied",
    "job.dismiss": "Dismiss",
    "job.downloadSummary": "Downloaded {done} file(s), {failed} failed",
    "job.favoriteSummary": "Updated {ok}, {failed} failed",
    "job.loadAllSummary": "Loaded {n}",
    "job.none": "No running jobs",

    "delete.title": "Permanently delete {n} image(s)?",
    "delete.body": "From {m} generation task(s). Deleted images cannot be recovered and used credits are not refunded. {p} image(s) published as artworks will be skipped by PixAI. Deleted images are also removed from your local folders.",
    "delete.ack": "I understand deleted images cannot be recovered",
    "delete.confirm": "Delete",
    "delete.running": "Deleting…",
    "delete.summary": "Deleted {a}, skipped {p} published, {f} failed",
    "delete.artworkNotAllowed": "Artworks from PixAI collections cannot be deleted here",

    "folderDialog.newTitle": "New folder",
    "folderDialog.renameTitle": "Rename folder",
    "folderDialog.name": "Name",
    "folderDialog.placeholder": "1 to 60 characters",
    "folderDialog.deleteTitle": "Delete folder \"{name}\"?",
    "folderDialog.deleteBody": "Only this local folder record ({n} images) is removed. Images on PixAI are not affected.",
    "folderDialog.deleteConfirm": "Delete folder",

    "io.title": "Export / import folders",
    "io.exportHelp": "Export to a JSON file that can be imported in another browser or computer. It holds image links and prompts only, no login data.",
    "io.importHelp": "Import merges folders by name; images already present are not added twice.",
    "io.export": "Export JSON",
    "io.import": "Choose a JSON file to import",
    "io.exportDone": "Exported {n} folder(s)",
    "io.importDone": "Import done: {created} folder(s) created, {merged} merged, {items} image(s) added",
    "io.importSkipped": "{n} item(s) skipped because of an invalid shape or link",
    "io.importFailed": "Import failed: {message}",

    "settings.title": "Settings",
    "settings.naming": "File names",
    "settings.template": "File name template",
    "settings.templateHelp": "Variables: {folder} folder name, {time} generation time, {prompt} prompt tags, {index} position, {task} task id, {media} media id. Empty variables and the underscore next to them are dropped.",
    "settings.promptCount": "Number of prompt tags",
    "settings.skipQuality": "Skip quality tags (masterpiece, best quality, …)",
    "settings.directory": "Download sub-folder",
    "settings.directoryHelp": "Relative to the browser's download folder. {folder} becomes the folder name.",
    "settings.noFolderName": "Sub-folder name when not in a folder",
    "settings.downloads": "Downloads",
    "settings.concurrency": "Parallel downloads (1 to 3)",
    "settings.loading": "Loading",
    "settings.pageSize": "Page size (10 to 50)",
    "settings.example": "Example: ",
    "settings.save": "Save",
    "settings.saved": "Settings saved",
    "settings.reset": "Restore defaults",
    "settings.about": "Unofficial extension. It uses the pixai.art web endpoints of your logged-in browser for management only and never generates images.",

    "common.ok": "OK",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.create": "Create",
    "common.close": "Close",
    "common.retry": "Retry",
    "common.loading": "Loading…",
    "common.confirm": "Confirm",
    "common.yes": "Yes",
    "common.no": "No",

    "empty.notLoggedIn": "Not logged in to pixai.art. Log in, then open the gallery again.",
    "empty.network": "Network error, could not load.",
    "empty.results": "No images found",
    "empty.starred": "No starred images yet",
    "empty.folder": "This folder is empty. Select images in All generations, then use Add to folder.",
    "empty.collection": "No available artworks in this collection",
    "empty.selectView": "Pick a view on the left",

    "toast.downloadStarted": "Started downloading {n} file(s)",
    "toast.nothingToDownload": "Nothing to download",
    "toast.favorited": "Starred {n}",
    "toast.unfavorited": "Unstarred {n}",
    "toast.partialFailed": "{n} item(s) could not be updated. Please try again.",
    "toast.selectedAll": "Selected {n}",
    "toast.loadAllStopped": "Loading stopped",
    "toast.copied": "Copied",
    "toast.error": "Error: {message}",

    "error.unknown": "Unknown error",
    "error.generic": "Error: {message}",
    "error.http": "Request failed (HTTP {status})",
    "error.NETWORK": "Network error. Check your connection and retry.",
    "error.LOGIN_REQUIRED": "Please log in to pixai.art first",
    "error.UNAUTHORIZED": "Please log in to pixai.art first",
    "error.FORBIDDEN": "Not allowed",
    "error.NOT_FOUND": "Not found or already deleted",
    "error.BAD_REQUEST": "Invalid request: {message}",
    "error.TOO_MANY_REQUESTS": "Too many requests, try again later",
    "error.ABORTED": "Cancelled",
    "error.CANCELLED": "Cancelled",
    "error.FOLDER_NAME_EMPTY": "Name cannot be empty",
    "error.FOLDER_NAME_TOO_LONG": "Name can be at most 60 characters",
    "error.FOLDER_NAME_TAKEN": "A folder with this name already exists",
    "error.FOLDER_NOT_FOUND": "Folder not found",
    "error.IMPORT_INVALID": "Wrong file format: not a folder export from this extension",
    "error.IMPORT_PARSE": "The file is not valid JSON",
    "error.BAD_URL": "Image link is not on an allowed host",
    "error.BAD_PATH": "Invalid file path",
    "error.DISCONNECTED": "Lost the connection to the extension background",
    "error.DOWNLOAD_INTERRUPTED": "Download interrupted",
    "error.NO_RESULT": "PixAI returned no result for this image",
    "error.UNKNOWN_RESULT": "PixAI returned an unrecognized result",
    "error.NOT_TASK_IMAGE": "Only images from your generations can be changed",
    "error.MEDIA_PUBLISHED": "Published as an artwork, skipped by PixAI",
    "error.EXTENSION_RELOADED": "The extension was updated or reloaded. Please refresh the page.",

    // Language and download mode
    "naming.noFolder": "Generations",
    "header.switchLang": "中文",
    "header.switchLangTitle": "切换到中文",
    "settings.language": "Language / 界面语言",
    "settings.langAuto": "Auto (browser language)",
    "settings.langZh": "中文",
    "settings.langEn": "English",
    "settings.noFolderHelp": "Leave empty to use “Generations” (“生成记录” in Chinese).",
    "settings.downloadMode": "Download as",
    "settings.modeZip": "One ZIP archive (recommended)",
    "settings.modeFiles": "Separate files",
    "settings.modeHelp": "The ZIP includes a report listing every file, whether it was saved, why it failed and its original link. A single image is always saved directly.",
    "settings.zipPart": "Max ZIP size",
    "settings.zipPartHelp": "Larger jobs are split into several archives (_part1, _part2, …), each with its own report.",
    "settings.size": "{n} MB",
    "settings.webpToPng": "Save WebP images as PNG (like the download button on PixAI's generator)",
    "settings.webpToPngHelp": "PixAI stores most generations as lossless WebP; its generator's download button converts them to PNG. This uses the same method, so you get the same PNG as the website: an identical picture in a file about twice the size of the WebP. Turn this off to keep PixAI's original WebP files. Animated images are not converted.",
    "report.converted": "{n} WebP file(s) were saved as PNG (identical picture)",
    "job.fetching": "Downloading images",
    "job.savingZip": "Saving archive {name}",
    "job.zipSummary": "Packed {done} file(s) into {zips} archive(s), {failed} failed",
    "job.retryFailed": "Retry failed ({n})",
    "job.retryLabel": "{label} · retry",
    "job.showFile": "Show in folder",
    "toast.zipStarted": "Packing {n} file(s)",

    // Packed download report (inside the ZIP)
    "report.file": "_download-report.txt",
    "report.title": "PixAI Gallery Manager · Download report",
    "report.job": "Job: {label}",
    "report.time": "Packed at: {time}",
    "report.archive": "Archive: {name}",
    "report.counts": "This archive: {ok} saved, {failed} failed",
    "report.total": "Whole job: {total} file(s), {ok} saved, {failed} failed, {parts} archive(s)",
    "report.cancelled": "The job was cancelled; the remaining files were not downloaded.",
    "report.failedHead": "Failed ({n}):",
    "report.okHead": "Saved ({n}):",
    "report.none": "(none)",
    "report.reason": "Reason: {reason}",
    "report.url": "Link: {url}",
    "report.retryHint": "Click “Retry failed” in the gallery's job list (bottom right) to download only the failed files again. If some files keep failing, set Download as to “Separate files” in Settings and try again.",

    // More failure reasons (packing and Chrome download errors)
    "error.TOO_MANY_FILES": "At most 20,000 files per job",
    "error.PAUSED_BY_USER": "Download paused",
    "error.FETCH_FAILED": "Image download failed",
    "error.TIMEOUT": "Timed out",
    "error.EMPTY_FILE": "The downloaded file is empty",
    "error.FILE_TOO_LARGE": "File too large for the archive",
    "error.ZIP_SAVE_FAILED": "Saving the archive failed",
    "error.OFFSCREEN_FAILED": "Packing could not start. Switch to “Separate files” in Settings.",
    "error.USER_CANCELED": "Download cancelled",
    "error.USER_SHUTDOWN": "The browser closed during the download",
    "error.FILE_FAILED": "Writing the file failed",
    "error.FILE_ACCESS_DENIED": "No permission to write to the download folder",
    "error.FILE_NO_SPACE": "Disk full",
    "error.FILE_NAME_TOO_LONG": "File path too long",
    "error.FILE_BLOCKED": "Blocked by the system or security software",
    "error.FILE_TRANSIENT_ERROR": "Temporary error while writing the file",
    "error.NETWORK_FAILED": "Network error",
    "error.NETWORK_TIMEOUT": "Network timeout",
    "error.NETWORK_DISCONNECTED": "Network disconnected",
    "error.SERVER_FAILED": "Server error",
    "error.SERVER_FORBIDDEN": "The server refused access (403)",
    "error.SERVER_BAD_CONTENT": "The file is not on the server",
    "error.SERVER_UNREACHABLE": "Cannot reach the server",
    "error.CRASH": "The browser crashed during the download"
  };

  const strings = (PGM.strings = PGM.strings || {});
  strings.zh = Object.assign({}, ZH, strings.zh);
  strings.en = Object.assign({}, EN, strings.en);

  const nav = globalThis.navigator;
  const auto = nav && /^zh/i.test(nav.language || "") ? "zh" : "en";
  let lang = auto;

  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  function lookup(key) {
    const own = strings[lang];
    if (own && has(own, key)) return own[key];
    if (has(strings.zh, key)) return strings.zh[key];
    return null;
  }

  function t(key, vars) {
    const s = lookup(key);
    if (s == null) return String(key);
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (m, name) => (has(vars, name) && vars[name] != null ? String(vars[name]) : m));
  }

  t.has = (key) => lookup(key) != null;

  t.error = function (err) {
    if (!err) return t("error.unknown");
    const code = typeof err.code === "string" ? err.code : "";
    const vars = { status: err.status, message: err.message || code };
    if (code && lookup("error." + code) != null) return t("error." + code, vars);
    if (/^HTTP_\d+$/.test(code)) return t("error.http", { status: code.slice(5) });
    return t("error.generic", { message: err.message || String(err) });
  };

  // Readable text for a failure code such as "MEDIA_PUBLISHED", "HTTP_404" or a Chrome download error.
  t.reason = function (code) {
    const c = String(code || "");
    if (!c) return t("error.unknown");
    if (lookup("error." + c) != null) return t("error." + c);
    if (/^HTTP_\d+$/.test(c)) return t("error.http", { status: c.slice(5) });
    return c;
  };

  function add(a, b) {
    if (typeof a === "string") {
      strings[a] = Object.assign(strings[a] || {}, b);
      return;
    }
    for (const k of Object.keys(a || {})) add(k, a[k]);
  }

  PGM.t = t;
  PGM.i18n = {
    get lang() {
      return lang;
    },
    set lang(v) {
      lang = v === "en" ? "en" : "zh";
    },
    auto,
    use(pref) {
      const before = lang;
      lang = pref === "zh" || pref === "en" ? pref : auto;
      return lang !== before;
    },
    add,
    strings
  };
})();
