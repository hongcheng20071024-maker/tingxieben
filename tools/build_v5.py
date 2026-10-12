# -*- coding: utf-8 -*-
"""构建独立 v5：听英文写英文和中文意思，保留旧听写模式、键盘重写及纸笔草稿纸。"""
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
    if not isinstance(template, str):
        raise SystemExit("v2 WORKER 模板必须是字符串。")
    for marker in ("__CONTENT_HASH__", "__ASSETS__"):
        if template.count(marker) != 1:
            raise SystemExit("worker 占位符必须恰好出现一次: " + marker)
    template = exact_replace(template, "听写本 v2", "听写本 v5", "worker label")
    return exact_replace(template, "'tingxieben-v2:'", "'tingxieben-v5:'", "worker cache prefix")


def apply_patch_file(html, path):
    patches = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(patches, list) or not patches:
        raise SystemExit(path.name + " 必须是非空补丁数组。")
    names = set()
    for patch in patches:
        if not isinstance(patch, dict) or not isinstance(patch.get("name"), str) or not patch["name"]:
            raise SystemExit(path.name + " 每个补丁必须包含非空名称。")
        name = patch["name"]
        if name in names:
            raise SystemExit(path.name + " 补丁名称重复: " + name)
        names.add(name)
        html = exact_replace(html, patch.get("old"), patch.get("new"), path.name + ": " + name)
    return html, len(patches)


def build(root, out):
    root, out = root.resolve(), out.resolve()
    if out != root / "v5":
        raise SystemExit("v5 输出目录必须恰好为仓库根目录下的 v5；不允许覆盖原版、v2、v3 或 v4。")
    paths = {name: root / "source" / name for name in
             ("听写本.html", "rewrite-spelling.js", "rewrite-spelling.css", "v3-patches.json",
              "meaning-grader.js", "meaning-mode.js", "meaning-mode.css", "v4-patches.json", "v5-patches.json",
              "dual-mode.js", "dual-mode.css", "audio-v5.js", "audio-v5.css",
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
    html, v3_count = apply_patch_file(html, paths["v3-patches.json"])
    html, v4_count = apply_patch_file(html, paths["v4-patches.json"])
    html, v5_count = apply_patch_file(html, paths["v5-patches.json"])

    scripts = {name: paths[name].read_text(encoding="utf-8") for name in
               ("rewrite-spelling.js", "meaning-grader.js", "meaning-mode.js", "dual-mode.js", "audio-v5.js", "scratchpad.js")}
    styles = {name: paths[name].read_text(encoding="utf-8") for name in
              ("rewrite-spelling.css", "meaning-mode.css", "dual-mode.css", "audio-v5.css", "scratchpad.css")}
    for name, text in scripts.items():
        if "</script" in text.lower():
            raise SystemExit(name + " 含有提前闭合内联脚本的文字，请先转义。")
    for name, text in styles.items():
        if "</style" in text.lower():
            raise SystemExit(name + " 含有提前闭合内联样式的文字，请先转义。")
    helper_script = "\n".join(scripts[name] for name in
                              ("rewrite-spelling.js", "meaning-grader.js", "meaning-mode.js", "dual-mode.js", "audio-v5.js"))
    html = exact_replace(html, HELPER_ANCHOR, helper_script + "\n" + HELPER_ANCHOR,
                         "native v5 helpers injection")
    html, titles = re.subn(r"(<title(?:\s[^>]*)?>).*?(</title>)",
                          r"\g<1>听写本 v5 · 中英文双听写\g<2>", html, flags=re.DOTALL)
    if titles != 1:
        raise SystemExit("原版 HTML 必须含有唯一 title。")
    injected_styles = "".join('<style data-' + name.removesuffix(".css") + '-style>\n' + css + "\n</style>\n"
                              for name, css in styles.items())
    html = exact_replace(html, "</head>", injected_styles + "</head>", "v5 styles injection")
    html = exact_replace(html, "</body>",
                         '<script data-scratchpad-script>\n' + scripts["scratchpad.js"] + "\n</script>\n</body>",
                         "scratchpad injection")
    template = worker_template(root / "tools/build_v2.py")
    manifest = json.loads((root / "manifest.webmanifest").read_text(encoding="utf-8"))
    manifest.update({"name": "听写本 v5 · 中英文双听写", "short_name": "听写本 v5", "start_url": "./", "scope": "./"})

    # 所有源码、补丁及注入点验证后才开始写输出；临时源码不会覆盖原版。
    out.mkdir(exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", prefix=".prepared-v5-",
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
    worker = exact_replace(template, "__CONTENT_HASH__", json.dumps(version), "worker content hash")
    worker = exact_replace(worker, "__ASSETS__", json.dumps(ASSETS), "worker core assets")
    write_text(out / "sw.js", worker)
    print("v5 输出目录:", out)
    print("补丁数量:", f"v3 {v3_count} + v4 {v4_count} + v5 {v5_count}")
    print("离线版本:", version)


def main():
    parser = argparse.ArgumentParser(description="构建独立的听写本 v5 中英文双听写版本")
    parser.add_argument("--root", type=Path, default=ROOT, help="仓库根目录")
    parser.add_argument("--out", type=Path, default=Path("v5"), help="固定为仓库根目录下的 v5")
    args = parser.parse_args()
    out = args.out if args.out.is_absolute() else args.root / args.out
    build(args.root, out)


if __name__ == "__main__":
    main()
