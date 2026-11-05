# Chrome 应用商店上架步骤（PixAI 图库管理 1.1.0）

## 先说明：为什么上传包里没有这些资料

`PixAI-Gallery-Manager-1.1.0.zip` 是**交给商店的扩展本体**，里面只有扩展运行需要的文件（manifest、脚本、图标、语言包）。商店不需要、也不应该在扩展里放说明文档。

这些上架资料（本文件、商店文案、隐私政策、图标、宣传图）是给你在网页后台**填表和上传**用的，所以单独放在“上架资料”文件夹里。

| 文件 | 用在哪里 |
|---|---|
| `PixAI-Gallery-Manager-1.1.0.zip`（上一层文件夹） | 第 1 步：上传到商店，**不要解压** |
| `01-上架步骤（先看这里）.md` | 就是本文件 |
| `02-商店介绍文案.md` | 第 2 步：复制“详细说明”粘贴到商店 |
| `03-隐私政策.md` | 第 0 步：填好联系方式后发布成公开网页，把网址填到第 3 步 |
| `商店图标-128x128.png` | 第 2 步：商店图标 |
| `小宣传图-440x280.png` | 第 2 步：小宣传图（商店要求必须有） |
| `截图\` | 第 0 步：把你截的图放这里，第 2 步上传 |

---

## 第 0 步：上传前先准备好 4 样东西

### ① 开发者账号

1. 打开 https://chrome.google.com/webstore/devconsole ，用 Google 账号登录。
   - 官方建议用一个专门的邮箱，审核结果、警告等重要邮件都会发到这里。
2. 同意开发者协议，支付**一次性注册费 5 美元**（只付一次，以后上架多少个扩展都不用再付）。
3. 进入后台后，在 **Account（账号）** 页面填写联系邮箱并完成验证。没验证的话不能发布。
4. 同一页面会要求声明你是不是“交易者（trader）”。个人免费发布、不以此营利，一般选 **non-trader（非交易者）**。以页面上的说明为准，这是你自己负责声明的。

### ② 隐私政策网址（必须是公开网页）

1. 打开 `03-隐私政策.md`，把两处方括号 `[在这里填写你的联系邮箱或 GitHub Issues 链接]` 和 `[put your contact e-mail or GitHub Issues link here]` 换成你的联系方式（可以和开发者账号的邮箱相同）。
2. 发布成公开网页，任选一种：
   - **Google 文档（最简单）**：新建一个 Google 文档 → 把 `03-隐私政策.md` 的全部内容粘贴进去 → 菜单 **文件 → 共享 → 发布到网络** → 点“发布” → 复制出现的链接。
   - **GitHub Gist**：登录 GitHub → 打开 https://gist.github.com → 文件名填 `privacy.md`，粘贴内容 → 选 **Create public gist** → 复制浏览器地址栏的网址。
3. 用无痕窗口打开这个网址试一下，确认不登录也能看到。

### ③ 截图（至少 1 张，最多 5 张，尺寸 1280×800）

截图要用你自己的账号截，注意不要露出不想公开的图片和账号名。截出正好 1280×800 的方法：

1. 在 Chrome 打开 pixai.art，打开图库管理界面。
2. 按 **F12** 打开开发者工具，再按 **Ctrl+Shift+M** 打开“设备工具栏”。
3. 页面上方的尺寸改成 **1280 × 800**，旁边的缩放选 100%（如果有 DPR 选项就选 1）。
4. 在开发者工具里按 **Ctrl+Shift+P**，输入 `screenshot`，选 **Capture screenshot（截取屏幕截图）**，图片会下载到下载文件夹，大小正好是 1280×800。
5. 把截图放进 `截图` 文件夹。

建议截这几张：全部生成视图（中文界面一张、英文界面一张）、选中多张图后的操作栏、下载完成后的任务卡片、设置对话框。

### ④ 小宣传图（440×280，商店要求必须有）

已经做好：`小宣传图-440x280.png`。想换成自己设计的也可以，尺寸必须是 440×280。这张图不能按语言分别上传，所以做成了中英文都有。

---

## 第 1 步：上传压缩包

1. 后台左侧点 **Items（商品）**，再点右上角 **+ New item（新建商品）**。
2. 选择 `PixAI-Gallery-Manager-1.1.0.zip` 上传（**直接上传 zip，不要解压**）。
3. 上传成功后会进入这个扩展的编辑页面。扩展名称、简短介绍、版本号会自动从压缩包里读出来，不用另填。

---

## 第 2 步：Store listing（商店详情）

1. **Description（详细说明）**：打开 `02-商店介绍文案.md`，复制 “English (default)” 下面代码框里的英文说明，粘贴进去。
2. **添加中文**：页面上方的语言选择里添加 **Chinese (Simplified) / 中文（简体）**，切换到中文后，粘贴“中文（简体）”下面代码框里的中文说明。中文的扩展名称和简介会自动用压缩包里的中文版本。
3. **Category（类别）**：选 **Productivity → Tools**（备选 Lifestyle → Art & Design）。
4. **Language（语言）**：English。
5. **Store icon（商店图标）**：上传 `商店图标-128x128.png`。
6. **Screenshots（截图）**：上传 `截图` 文件夹里的图。
7. **Small promo tile（小宣传图）**：上传 `小宣传图-440x280.png`。
8. **Marquee promo tile（大宣传图）**、官方网址、支持网址、YouTube 视频：都可以不填。
9. 点右上角 **Save draft（保存草稿）**。

---

## 第 3 步：Privacy（隐私权）

这一页的内容审核员会仔细看。下面代码框里的英文**原样复制粘贴**即可。

### Single purpose description（单一用途说明）

```
Manage the images a user generated on pixai.art: browse them, organize them into local folders, download them (with readable file names, optionally packed as ZIP archives and with WebP saved as PNG), star or unstar them, and delete them.
```

### Permission justification（每个权限的理由）

页面会列出扩展用到的每个权限，各粘贴对应的一段：

**downloads**

```
Saves the user's selected images (or a ZIP archive of them) to the download folder with readable file names in a sub-folder, and lets the user open the folder of a finished archive.
```

**storage**

```
Keeps the user's settings (file naming template, download mode, language) and the user's local folders (image links, prompts, timestamps) in chrome.storage.local.
```

**unlimitedStorage**

```
A user's local folders can hold tens of thousands of image entries with prompts, which can exceed the default 10 MB storage quota.
```

**offscreen**

```
Used only with the BLOBS reason: an offscreen document downloads the user's selected images and either packs them into a ZIP archive or converts still WebP images to PNG (the same conversion pixai.art's own download button does), then turns the result into a blob URL so chrome.downloads can save it. The service worker cannot decode images or create blob URLs.
```

**Host permission（主机权限，对应扩展只在 https://pixai.art/* 上运行）**

```
The extension's interface runs only on pixai.art, where the user is logged in. It uses the page's login token to call PixAI's own web API (api.pixai.art) for the user's generations, collections, stars and deletions. No other site is accessed.
```

### Remote code（远程代码）

选 **No, I am not using remote code（否，未使用远程代码）**。如果要求填理由，粘贴：

```
All JavaScript is included in the package. The extension only fetches JSON from api.pixai.art and image files from PixAI's image servers; it never loads or evaluates remote code.
```

### Data usage（数据使用，勾选题）

只勾这两项（扩展处理这些数据，但只用于自身功能，不发给开发者）：

- **Authentication information（身份验证信息）**：扩展读取 pixai.art 页面里的登录令牌，只用来请求 api.pixai.art。
- **Website content（网站内容）**：显示和下载你自己的图片、提示词、生成时间。

其他类别（个人身份信息、健康、财务、通信、位置、网络记录、用户活动）都**不勾**。

下面三项声明**全部勾选**：

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL（隐私政策网址）

填第 0 步 ② 得到的公开网址。

点 **Save draft（保存草稿）**。

---

## 第 4 步：Distribution（分发）

1. **Payments**：Free（免费）。
2. **Visibility（公开范围）**：
   - **Public（公开）**：所有人都能在商店搜到。
   - **Unlisted（不公开列出）**：搜不到，只有拿到链接的人能安装。想先小范围用，选这个，之后随时可以改成公开。
3. **Regions（地区）**：选择所有地区。
4. 点 **Save draft（保存草稿）**。

---

## 第 5 步：给审核员的测试说明（可选，建议填）

在 **Test instructions（测试说明）** 里粘贴：

```
The extension needs a pixai.art account (free sign-up). Log in at https://pixai.art, generate one or two images or use existing ones, then click the "Gallery" button at the bottom left of the page (or the toolbar icon).
- "All generations" lists the account's own generations. Select images by clicking them.
- "Download" saves the selection as a ZIP archive (with _download-report.txt inside) into Downloads/PixAI/<folder>/. WebP originals are saved as PNG by default (Settings).
- "Add to folder" creates local folders stored in chrome.storage.local.
- The 中文/EN button in the header switches the interface language.
Deleting is permanent on PixAI and asks for confirmation; it is not needed for the review.
The extension never generates images and does not call any generation endpoint.
```

---

## 第 6 步：提交审核

1. 确认每一页都已保存，页面上没有红色的必填提示（常见的是缺截图、缺小宣传图、隐私页没填完）。
2. 点右上角 **Submit for review（提交审核）**。
3. 提交时可以选择审核通过后**自动发布**，或通过后由你手动点发布。
4. 审核一般需要几天，结果会发邮件。通过后，在扩展页面能看到商店链接。

---

## 如果被拒

邮件里会写原因，改好后重新提交即可。常见情况：

- **名称涉及商标或被认为冒充**：名称已经写成 “Gallery Manager for PixAI (Unofficial)” / “PixAI 图库管理（非官方）”，说明是第三方工具，图标也不是 PixAI 的标志。如果仍被拒，可以去掉名称里的 “PixAI”（例如 “AI Gallery Manager (Unofficial)”）：修改源代码文件夹里 `_locales/en/messages.json` 和 `_locales/zh_CN/messages.json` 的 `appName`，再重新打包上传。
- **权限理由不够清楚**：把被点名的权限说明写得更具体，重新保存后提交。
- **隐私政策打不开**：确认网址不登录也能访问。

另外：扩展使用的是 PixAI 网页版自己的接口。上架后 PixAI 也能看到它；是否符合 PixAI 的服务条款请你自己判断（README 里“关于服务条款”一节）。

---

## 以后发布新版本

1. 在源代码文件夹 `PixAI-Gallery-Manager` 里，把 `manifest.json` 的 `"version"` 改大，例如 `1.1.0` → `1.1.1`。
2. 在源代码文件夹里运行 `python tools/package.py`，新包在 `dist` 文件夹里。
3. 后台打开这个扩展 → **Package（软件包）** → **Upload new package（上传新软件包）** → 提交审核。商店详情和隐私页不用重填，除非功能或权限有变化。
