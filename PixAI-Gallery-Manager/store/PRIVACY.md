# 隐私政策 / Privacy Policy

**PixAI 图库管理（非官方）/ Gallery Manager for PixAI (Unofficial)**

最后更新 / Last updated: 2026-11-03

---

## 中文

这个扩展帮助你在 pixai.art 上管理**你自己生成的图片**：浏览、分类、下载、加星和删除。它不是 PixAI 官方产品，与 PixAI 没有关联。

### 扩展会访问哪些数据

- **PixAI 登录令牌**：你在 pixai.art 登录后，网页会把登录令牌存在浏览器里。扩展只在 `https://pixai.art/` 页面上读取它，用来以你的身份请求 PixAI 的网页接口（`api.pixai.art`），例如列出你的生成记录和收藏夹、加星、删除。令牌**只发送给 `api.pixai.art`**，扩展不保存、不记录它，也不发往任何其他地方。
- **你的生成内容**：图片链接、缩略图、提示词、生成时间、任务和图片 ID。这些内容从 PixAI 读取后只在页面里显示，或用来给下载的文件命名。

### 保存在你电脑上的数据

- 设置（文件命名规则、下载方式、界面语言等）和“我的收藏夹”（图片链接、提示词、生成时间和 ID，不含图片文件本身）保存在 Chrome 扩展的本地存储（`chrome.storage.local`）里。
- 这些数据不会上传，也不会同步到其他设备。卸载扩展会删除它们。
- “导出”生成的 JSON 文件保存在你选择的位置，由你自己保管，文件里不含登录信息。

### 发送到哪里

- 对 `api.pixai.art` 的请求（带登录令牌），用于上面列出的管理操作。
- 从 PixAI 的图片服务器（`images-ng.pixai.art`、`cdn.pixai.art`）下载原图（不带登录令牌）。
- 下载的文件通过 Chrome 自带的下载功能保存到你的下载文件夹。打包下载时，ZIP 文件在扩展内部（本机）生成。
- **不会**把任何数据发送给开发者或第三方。没有统计分析、没有广告、不加载远程代码。

### 数据用途

数据只用于上面描述的图片管理功能。不出售、不转让，不用于广告、信用评估或任何与此功能无关的用途。

### 联系方式

有问题请联系：[在这里填写你的联系邮箱或 GitHub Issues 链接]

---

## English

This extension helps you manage **the images you generated yourself** on pixai.art: browse, organize, download, star and delete them. It is not an official PixAI product and is not affiliated with PixAI.

### Data the extension accesses

- **Your PixAI login token.** When you are logged in to pixai.art, the site keeps a login token in your browser. The extension reads it only on `https://pixai.art/` pages and uses it to call PixAI's web API (`api.pixai.art`) on your behalf, for example to list your generations and collections, star images or delete them. The token is **sent only to `api.pixai.art`**. The extension does not store or log it and sends it nowhere else.
- **Your generation content**: image links, thumbnails, prompts, generation times, task and media IDs. They are read from PixAI only to be shown on the page or to name downloaded files.

### Data stored on your computer

- Settings (file naming, download mode, language, …) and "My folders" (image links, prompts, generation times and IDs, not the image files themselves) are kept in the extension's local storage (`chrome.storage.local`).
- This data is not uploaded and not synced to other devices. Uninstalling the extension deletes it.
- A JSON file made with "Export" is saved where you choose and stays under your control. It contains no login information.

### Where data is sent

- Requests to `api.pixai.art` (with the login token) for the management actions above.
- Original images are downloaded from PixAI's image servers (`images-ng.pixai.art`, `cdn.pixai.art`) without the login token.
- Files are saved to your download folder through Chrome's own download manager. For ZIP downloads the archive is built locally inside the extension.
- **No** data is sent to the developer or any third party. No analytics, no ads, no remotely hosted code.

### Use of data

Data is used only for the image management features described above. It is never sold or transferred, and never used for advertising, creditworthiness or any purpose unrelated to these features.

### Contact

Questions: [put your contact e-mail or GitHub Issues link here]
