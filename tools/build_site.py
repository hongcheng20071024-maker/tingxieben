# -*- coding: utf-8 -*-
"""把原始单文件应用构建成可部署的 PWA 版本。

    source/听写本.html            原始单文件应用（初版，ChatGPT 生成）
        │  只往 <head> 注入 PWA 配置，不动原应用任何逻辑
        ▼
    index.html                    部署给 GitHub Pages 的成品

注入的两块内容：
  1. PWA meta —— manifest / apple-touch-icon / 全屏 / 主题色
  2. 启动脚本 —— 首次打开时预置词库 + 注册 Service Worker

用法（在仓库根目录执行）：
    python tools/build_site.py                                     # 全部用默认值
    python tools/build_site.py --src source/听写本.html \
                              --lib library-backup-unit1.json \
                              --out .

每次构建都从原始文件重新开始，重复运行结果完全一致（可复现）。
"""
import argparse
import json
import os

# 仓库根目录 = 本脚本所在目录的上一级
DEFAULT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 预置词库用的固定分组 ID（让所有设备首次打开得到同一个分组）
SEED_ID = "a1b2c3d4-0000-4000-8000-000000000001"

HEAD_META = """<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="听写本">
<meta name="application-name" content="听写本">
<meta name="theme-color" content="#263dd1">
<meta name="format-detection" content="telephone=no">
<link rel="apple-touch-icon" sizes="180x180" href="./icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="./icon-192.png">
<link rel="manifest" href="./manifest.webmanifest">
"""

# __SEED__ 会被替换成预置词库的 JSON
BOOT_TMPL = """<script data-pwa-boot>
/* 听写本 PWA 启动脚本：预置词库 + 离线缓存。仅当浏览器里还没有词库时写入。 */
(function () {
  try {
    var KEY = 'listen-write-library-v1';
    if (!localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, JSON.stringify(__SEED__));
    }
  } catch (e) {}
  try {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () {});
      });
    }
  } catch (e) {}
})();
</script>
"""


def resolve(root, p):
    """相对路径按仓库根目录解析，绝对路径原样返回。"""
    return p if os.path.isabs(p) else os.path.join(root, p)


def main():
    ap = argparse.ArgumentParser(description="构建听写本 PWA 站点")
    ap.add_argument("--src", default=os.path.join("source", "听写本.html"),
                    help="原始单文件应用（默认 source/听写本.html）")
    ap.add_argument("--lib", default="library-backup-unit1.json",
                    help="预置词库文件（默认 library-backup-unit1.json）")
    ap.add_argument("--out", default=".",
                    help="输出目录，index.html 会写到该目录（默认仓库根目录）")
    ap.add_argument("--root", default=DEFAULT_ROOT, help="仓库根目录")
    args = ap.parse_args()

    src = resolve(args.root, args.src)
    lib_path = resolve(args.root, args.lib)
    out_dir = resolve(args.root, args.out)
    out_html = os.path.join(out_dir, "index.html")

    for p in (src, lib_path):
        if not os.path.exists(p):
            raise SystemExit("找不到文件: %s" % p)

    html = open(src, encoding="utf-8").read()
    lib = json.load(open(lib_path, encoding="utf-8"))

    # 原始导出格式：{"format": "...", "groups": [{"name": ..., "words": [...]}]}
    groups = lib.get("groups") or []
    if not groups or not groups[0].get("words"):
        raise SystemExit("词库文件里没有可用的分组: %s" % lib_path)

    first = groups[0]
    seed = [{
        "id": SEED_ID,
        "name": first["name"],
        "words": [{"word": w["word"], "meaning": w.get("meaning", "")}
                  for w in first["words"]],
        "revision": 1,
    }]
    # 防止 </script> 提前闭合脚本标签
    seed_js = json.dumps(seed, ensure_ascii=False).replace("</", "<\\/")
    boot = BOOT_TMPL.replace("__SEED__", seed_js)

    # 注入点：</title> 之后（保证在任何应用脚本之前执行）
    anchor = "</title>"
    i = html.find(anchor)
    if i <= 0:
        raise SystemExit("原始文件里找不到 </title>，注入点失效")
    html = html[:i + len(anchor)] + HEAD_META + boot + html[i + len(anchor):]

    with open(out_html, "w", encoding="utf-8", newline="") as f:
        f.write(html)

    print("原始源码   :", src, "(%d 字符)" % len(open(src, encoding='utf-8').read()))
    print("预置词库   :", first["name"], "共", len(first["words"]), "词")
    print("输出成品   :", out_html, "(%d 字符)" % len(html))
    for k in ("manifest.webmanifest", "apple-touch-icon", "data-pwa-boot", "sw.js",
              "listen-write-library-v1"):
        print("  含 %-24s %s" % (k, "OK" if k in html else "缺失!"))


if __name__ == "__main__":
    main()
