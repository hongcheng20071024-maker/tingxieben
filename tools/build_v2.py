# -*- coding: utf-8 -*-
"""在 v2/ 构建草稿纸版本，原版文件保持不变。只使用 Python 标准库。"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parent.parent
ICONS = ("icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png")
ASSETS = ("./", "./index.html", "./manifest.webmanifest") + tuple("./" + p for p in ICONS)

WORKER = """/* 听写本 v2：缓存只属于本版本、本目录，不自动刷新当前听写。 */
const PREFIX = 'tingxieben-v2:' + encodeURIComponent(self.registration.scope) + ':';
const CACHE = PREFIX + __CONTENT_HASH__;
const ASSETS = __ASSETS__;
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL('./index.html', SCOPE).href;
const ASSET_URLS = new Set(ASSETS.map(path => new URL(path, SCOPE).href));

function ownResponse(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const url = new URL(response.url);
  return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
}

async function repairMissingAssets(cache) {
  const missing = [];
  for (const url of ASSET_URLS) {
    // 最新导航页面已经保存，不让其他预缓存请求覆盖它。
    if (url !== INDEX && !(await cache.match(url))) missing.push(url);
  }
  if (missing.length) await cache.addAll(missing);
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(async error => {
    await caches.delete(CACHE);
    throw error;
  }));
  // 不调用 skipWaiting。新版等待旧页面关闭后生效，避免听写中途切换。
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (ownResponse(response)) {
          event.waitUntil((async () => {
            await cache.put(INDEX, response.clone());
            await repairMissingAssets(cache);
          })().catch(() => {}));
        }
        return response;
      } catch (error) {
        const saved = await cache.match(INDEX);
        if (saved) return saved;
        throw error;
      }
    })());
    return;
  }

  // 只缓存站点静态资源；词典、其他目录、未知接口请求直接交给网络。
  url.search = '';
  if (!ASSET_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(url.href);
    if (saved) return saved;
    const response = await fetch(request);
    if (ownResponse(response)) event.waitUntil(cache.put(url.href, response.clone()));
    return response;
  })());
});
"""


def write_text(path, text):
    path.write_text(text, encoding="utf-8", newline="")


def build(root, out):
    root = root.resolve()
    out = out.resolve()
    # 输出只允许使用原版目录下的独立子目录，避免覆盖原版或在原版资源目录写入。
    if out.parent != root or out.name in ("source", "tools", "docs"):
        raise SystemExit("输出目录必须是仓库根目录下的独立目录，例如 v2。")
    css_file, js_file = root / "source/scratchpad.css", root / "source/scratchpad.js"
    missing = [str(path) for path in (css_file, js_file, *(root / p for p in ICONS)) if not path.is_file()]
    if missing:
        raise SystemExit("缺少构建文件: " + ", ".join(missing))
    css, script = css_file.read_text(encoding="utf-8"), js_file.read_text(encoding="utf-8")
    if "</style" in css.lower() or "</script" in script.lower():
        raise SystemExit("草稿纸源码含有会提前闭合内联标签的文字，请转义后再构建。")
    out.mkdir(exist_ok=True)
    subprocess.run([sys.executable, str(root / "tools/build_site.py"), "--root", str(root),
                    "--out", str(out)], check=True)
    index = out / "index.html"
    html = index.read_text(encoding="utf-8")
    if "</head>" not in html or "</body>" not in html:
        raise SystemExit("原版 HTML 缺少 head 或 body 的闭合标签。")
    html = html.replace("</head>", '<style data-scratchpad-style>\n' + css + "\n</style>\n</head>", 1)
    html = html.replace("</body>", '<script data-scratchpad-script>\n' + script + "\n</script>\n</body>", 1)
    write_text(index, html)
    manifest = json.loads((root / "manifest.webmanifest").read_text(encoding="utf-8"))
    manifest.update({"name": "听写本 v2 · 草稿纸", "short_name": "听写本 v2", "start_url": "./", "scope": "./"})
    write_text(out / "manifest.webmanifest", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    for icon in ICONS:
        shutil.copyfile(root / icon, out / icon)
    digest = hashlib.sha256()
    digest.update(WORKER.encode("utf-8") + b"\0")
    for name in ("index.html", "manifest.webmanifest", *ICONS):
        digest.update(name.encode("utf-8") + b"\0" + (out / name).read_bytes() + b"\0")
    version = digest.hexdigest()[:20]
    worker = WORKER.replace("__CONTENT_HASH__", json.dumps(version)).replace("__ASSETS__", json.dumps(ASSETS))
    write_text(out / "sw.js", worker)
    print("v2 输出目录:", out)
    print("离线版本:", version)


def main():
    parser = argparse.ArgumentParser(description="构建独立的听写本 v2 草稿纸版本")
    parser.add_argument("--root", type=Path, default=ROOT, help="仓库根目录")
    parser.add_argument("--out", type=Path, default=Path("v2"), help="根目录下的独立输出目录（默认 v2）")
    args = parser.parse_args()
    out = args.out if args.out.is_absolute() else args.root / args.out
    build(args.root, out)


if __name__ == "__main__":
    main()
