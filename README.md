# 听写本 · 英语单词听默写

把课本单元的单词录进来，用键盘听写或纸笔听写。**单文件网页应用，可安装到 iPad / iPhone 主屏幕，装好后离线也能用。**

An offline-capable, single-file English vocabulary dictation web app (PWA) for iPad / iPhone / desktop. UI is in Chinese.

## 👉 在线使用

**https://hongcheng20071024-maker.github.io/tingxieben/**

免安装，浏览器打开即用。装到主屏幕后就是一个独立图标 —— 点开全屏、没有地址栏、不联网也能用。

---

## 装到 iPad / iPhone

1. 用 **Safari** 打开上面的网址（必须是 Safari，微信内置浏览器不行）。
2. 点 **分享**（方框 + 向上箭头）→ **添加到主屏幕** → **添加**。
3. 主屏幕出现「听写本」图标，点开即全屏使用。

首次打开需要联网，之后离线可用（Service Worker 已缓存整站）。
如果 iPad 上找不到「分享」按钮，把 Safari 地址栏往下拉一下就会出现。

**安卓 / 电脑**：Chrome / Edge 打开同一个网址，菜单里选「安装应用」或「添加到主屏幕」。

## 词库

- 应用内可以自己增删单词，按单元（分组）管理。
- **导出 / 导入**：把词库导出成 JSON 存到「文件」App 或网盘，换设备时在新设备导入即可。
- 数据存在**你自己设备**的浏览器里（localStorage，key 为 `listen-write-library-v1`），不会上传到任何服务器。
- 页面首次打开时会预置一个单元「大学英语Unit1」（27 词），仅当浏览器里还没有任何词库时写入。
- 用 AI 批量生成词库、或自己手写词库文件：格式见 **[docs/词库格式.md](docs/词库格式.md)**（内含可直接复制给 ChatGPT 的提示词模板）。

⚠️ 换设备**不会**自动同步；清理浏览器数据前请先导出备份；不要长期用无痕模式。

## 发音没声音？

朗读用的是系统语音包（Web Speech API）。没有声音时：

- **iPad**：设置 → 辅助功能 → 朗读内容 → 声音 → 英语，下载一个英语语音包。
- 应用里「更多声音与语音包」有官方指引入口。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | **部署用的成品**（由原始源码注入 PWA 配置生成） |
| `source/听写本.html` | **原始单文件源码**（初版，未注入 PWA） |
| `manifest.webmanifest` | PWA 清单：名称、图标、全屏模式 |
| `sw.js` | Service Worker：离线缓存（cache-first） |
| `icon-*.png` | 主屏幕图标（180 / 192 / 512 / maskable） |
| `library-backup-unit1.json` | 预置词库（大学英语 Unit1，27 词），可在应用内「导入词库」 |
| `tools/make_icons.py` | 生成图标（纯 Python，零依赖，不需要 Pillow） |
| `tools/build_site.py` | 构建：`source/听写本.html` → `index.html` |
| `tools/deploy_pages.py` | 一键发布到 GitHub Pages（走 REST API，不需要 git） |
| `docs/词库格式.md` | 词库 JSON 格式 + 用 AI 生成词库的提示词 |

## 自己部署一份

**路线 A：Fork（最省事）**

1. 点本仓库右上角 **Fork**。
2. 你 Fork 出来的仓库 → **Settings → Pages** → Source 选 **Deploy from a branch**，分支选 `main`、目录选 `/ (root)` → Save。
3. 等 1~2 分钟，访问 `https://<你的用户名>.github.io/tingxieben/`。

**路线 B：命令行（本机有 Python 就行）**

```bash
python tools/deploy_pages.py            # 需要有 GitHub 凭据（GITHUB_TOKEN 环境变量，或 git 已登录）
python tools/deploy_pages.py --repo mysite    # 换个仓库名
```

## 从源码构建

改动只发生在 `<head>`：注入 PWA meta 与启动脚本（预置词库 + 注册 Service Worker），**不动原应用任何逻辑**。构建可复现 —— 同一份源码与词库，每次输出完全一致。

```bash
python tools/make_icons.py     # 生成 4 个图标到仓库根目录
python tools/build_site.py     # source/听写本.html + library-backup-unit1.json → index.html
```

## 已知限制

- **更新后要刷新两次**：`sw.js` 是 cache-first（为了离线可用），改了站点内容后，老用户需要重新打开一次才会拿到新版本。
- iOS 只能通过 **Safari** 添加到主屏幕；微信 / QQ 内置浏览器不支持安装。
- 词库不做云同步，靠导出 / 导入 JSON 手动搬。
- 应用本体内联了 Tailwind CSS、React 与图标库，所以 `index.html` 接近 600 KB —— 换来的是**单文件、离线可用、零依赖**。

## 许可

[MIT](LICENSE) —— 随意使用、修改、再发布，保留版权声明即可。
