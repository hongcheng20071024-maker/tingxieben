# -*- coding: utf-8 -*-
"""构建独立 v3：键盘听写错词重写，并保留 v2 草稿纸功能。"""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parent.parent
BASELINE_BLOB_SHA1 = "c9b1a7378050614ef2331b07dc513d3cacd55f1a"
HELPER_ANCHOR = "function Ag({localOnly:e=!1}={})"
ICONS = ("icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png")
ASSETS = ("./", "./index.html", "./manifest.webmanifest") + tuple("./" + p for p in ICONS)


def write_text(path, text):
    path.write_text(text, encoding="utf-8", newline="")


def git_blob_sha1(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def exact_replace(text, old, new, name):
    if not isinstance(old, str) or not old:
        raise SystemExit("补丁缺少非空匹配文字: " + name)
    if not isinstance(new, str):
        raise SystemExit("补丁替换文字必须是字符串: " + name)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"补丁 {name!r} 必须恰好匹配一次，实际 {count} 次；停止构建。")
    return text.replace(old, new, 1)


def worker_template(path):
    """读取已验证的 v2 worker 模板，不执行旧构建或修改其文件。"""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    values = [node.value for node in tree.body if isinstance(node, ast.Assign)
              and any(isinstance(target, ast.Name) and target.id == "WORKER" for target in node.targets)]
    if len(values) != 1:
        raise SystemExit("v2 构建器必须含有唯一的 WORKER 模板。")
    template = ast.literal_eval(values[0])
    template = exact_replace(template, "听写本 v2", "听写本 v3", "worker label")
    return exact_replace(template, "'tingxieben-v2:'", "'tingxieben-v3:'", "worker cache prefix")


def build(root, out):
    root, out = root.resolve(), out.resolve()
    if out != root / "v3":
        raise SystemExit("v3 输出目录必须恰好为仓库根目录下的 v3；不允许覆盖原版或 v2。")
    paths = {name: root / "source" / name for name in
             ("听写本.html", "rewrite-spelling.js", "rewrite-spelling.css", "v3-patches.json",
              "scratchpad.js", "scratchpad.css")}
    needed = (*paths.values(), *(root / icon for icon in ICONS), root / "manifest.webmanifest",
              root / "library-backup-unit1.json", root / "tools/build_site.py", root / "tools/build_v2.py")
    missing = [str(path) for path in needed if not path.is_file()]
    if missing:
        raise SystemExit("缺少构建文件: " + ", ".join(missing))

    baseline = paths["听写本.html"].read_bytes()
    if git_blob_sha1(baseline) != BASELINE_BLOB_SHA1:
        raise SystemExit("原版源码与已备份版本不一致；停止构建以避免错误应用补丁。")
    html = baseline.decode("utf-8")
    patches = json.loads(paths["v3-patches.json"].read_text(encoding="utf-8"))
    if not isinstance(patches, list) or not patches:
        raise SystemExit("v3-patches.json 必须是非空补丁数组。")
    names = set()
    for patch in patches:
        if not isinstance(patch, dict) or not isinstance(patch.get("name"), str) or not patch["name"]:
            raise SystemExit("每个补丁必须包含非空名称。")
        name = patch["name"]
        if name in names:
            raise SystemExit("补丁名称重复: " + name)
        names.add(name)
        html = exact_replace(html, patch.get("old"), patch.get("new"), name)

    rewrite_script = paths["rewrite-spelling.js"].read_text(encoding="utf-8")
    scratchpad_script = paths["scratchpad.js"].read_text(encoding="utf-8")
    rewrite_css = paths["rewrite-spelling.css"].read_text(encoding="utf-8")
    scratchpad_css = paths["scratchpad.css"].read_text(encoding="utf-8")
    for name, text in (("rewrite-spelling.js", rewrite_script), ("scratchpad.js", scratchpad_script)):
        if "</script" in text.lower():
            raise SystemExit(name + " 含有提前闭合内联脚本的文字，请先转义。")
    for name, text in (("rewrite-spelling.css", rewrite_css), ("scratchpad.css", scratchpad_css)):
        if "</style" in text.lower():
            raise SystemExit(name + " 含有提前闭合内联样式的文字，请先转义。")
    html = exact_replace(html, HELPER_ANCHOR, rewrite_script + "\n" + HELPER_ANCHOR,
                         "native rewrite helpers injection")
    html, titles = re.subn(r"(<title(?:\s[^>]*)?>).*?(</title>)",
                          r"\g<1>听写本 v3 · 错词重写\g<2>", html, flags=re.DOTALL)
    if titles != 1:
        raise SystemExit("原版 HTML 必须含有唯一 title。")
    html = exact_replace(html, "</head>",
                         '<style data-rewrite-spelling-style>\n' + rewrite_css + "\n</style>\n"
                         '<style data-scratchpad-style>\n' + scratchpad_css + "\n</style>\n</head>",
                         "v3 styles injection")
    html = exact_replace(html, "</body>",
                         '<script data-scratchpad-script>\n' + scratchpad_script + "\n</script>\n</body>",
                         "scratchpad injection")
    template = worker_template(root / "tools/build_v2.py")
    manifest = json.loads((root / "manifest.webmanifest").read_text(encoding="utf-8"))
    manifest.update({"name": "听写本 v3 · 错词重写", "short_name": "听写本 v3", "start_url": "./", "scope": "./"})

    # 所有源码、补丁及注入点验证后才开始写输出；临时源码不会覆盖原版。
    out.mkdir(exist_ok=True)
    # 在仓库内使用单个临时文件，兼容限制系统临时目录访问的环境。
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", prefix=".prepared-v3-",
                                     suffix=".html", dir=root, delete=False) as temp:
        prepared = Path(temp.name)
        temp.write(html)
    try:
        subprocess.run([sys.executable, str(root / "tools/build_site.py"), "--root", str(root),
                        "--src", str(prepared), "--out", str(out)], check=True)
    finally:
        prepared.unlink()
    write_text(out / "manifest.webmanifest", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    for icon in ICONS:
        shutil.copyfile(root / icon, out / icon)
    digest = hashlib.sha256()
    digest.update(template.encode("utf-8") + b"\0")
    for name in ("index.html", "manifest.webmanifest", *ICONS):
        digest.update(name.encode("utf-8") + b"\0" + (out / name).read_bytes() + b"\0")
    version = digest.hexdigest()[:20]
    worker = template.replace("__CONTENT_HASH__", json.dumps(version)).replace("__ASSETS__", json.dumps(ASSETS))
    write_text(out / "sw.js", worker)
    print("v3 输出目录:", out)
    print("补丁数量:", len(patches))
    print("离线版本:", version)


def main():
    parser = argparse.ArgumentParser(description="构建独立的听写本 v3 错词重写版本")
    parser.add_argument("--root", type=Path, default=ROOT, help="仓库根目录")
    parser.add_argument("--out", type=Path, default=Path("v3"), help="固定为仓库根目录下的 v3")
    args = parser.parse_args()
    out = args.out if args.out.is_absolute() else args.root / args.out
    build(args.root, out)


if __name__ == "__main__":
    main()
