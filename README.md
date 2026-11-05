# PixAIManager
PixAI's web library has no way to handle many generations at once. This extension adds a manager on top of pixai.art for the images you generated yourself.
WHAT IT DOES
• Browse all your generations or only the starred ones, with keyword, date and type filters, and "load all".
• Organize images into as many local folders as you like (stored only in this browser; export and import as JSON).
• Download full-size originals, packed into one ZIP per job, or as separate files. WebP images are saved as PNG like the download button on PixAI's generator (identical picture), or kept as the original WebP if you prefer.
• Every ZIP contains a report listing each file, whether it was saved, why it failed and its original link. "Retry failed" downloads only the failed files again. Large jobs are split into several archives automatically.
• Files get readable names: folder name, generation time and the first prompt tags, e.g. Landscape_20261103-140509_1girl_silver-hair_smile.png (template configurable).
• Download whole PixAI artwork collections (read-only view).
• Star / unstar, synced with PixAI's own star.
• Bulk delete with a clear confirmation (permanent on PixAI).
• Chinese and English interface, switchable at any time.

HOW TO USE
Install, open pixai.art and log in, then click the "Gallery" button at the bottom left of the page or the toolbar icon.

PRIVACY
The extension only runs on pixai.art. Your PixAI login token is read from the page and sent only to api.pixai.art; it is never stored or sent anywhere else. Folders and settings stay in this browser. No analytics, no ads, no remote code.

NOTES
• It never generates images and never calls generation endpoints.
• Unofficial: not affiliated with or endorsed by PixAI. PixAI may change its website at any time, which can break features.

PixAI 网页版的图库没法一次处理很多张图片。这个扩展在 pixai.art 页面上加了一个管理界面，专门管理你自己生成的图片。

功能
• 浏览全部生成记录或只看星标，支持关键词、日期、类型筛选和“加载全部”。
• 建任意多个本机收藏夹分类整理（只保存在当前浏览器，可导出 / 导入 JSON）。
• 下载原图，每次下载打包成一个 ZIP，也可以选择单独的文件；WebP 图片和 PixAI 生成页的下载按钮一样转成 PNG（画面不变），也可以选择保留原始 WebP。
• 每个 ZIP 里都有一份下载报告，列出每个文件是否成功、失败原因和原图链接；“重试失败项”只重新下载失败的文件；文件很多时自动分成多个 ZIP。
• 文件名清楚易读：收藏夹名 + 生成时间 + 前几个提示词，例如 风景_20261103-140509_1girl_silver-hair_smile.png（模板可改）。
• 整夹下载 PixAI 上的作品收藏夹（只读）。
• 加星 / 取消星标，和 PixAI 网页版的星标同步。
• 批量删除，删除前有明确的确认（在 PixAI 上永久删除）。
• 中英文界面，随时切换。

使用方法
安装后打开 pixai.art 并登录，点页面左下角的“图库管理”按钮或浏览器工具栏上的扩展图标。

隐私
扩展只在 pixai.art 上运行。PixAI 登录令牌只从页面读取并只发送给 api.pixai.art，不保存、不发往其他任何地方。收藏夹和设置只保存在当前浏览器。没有统计分析、没有广告、不加载远程代码。

说明
• 不会生成图片，也不调用任何生成接口。
• 非官方扩展，与 PixAI 没有关联，也未获得 PixAI 认可。PixAI 修改网站后部分功能可能失效。
