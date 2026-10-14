# -*- coding: utf-8 -*-
"""Build an independent v6.1 site from the frozen original and version patches."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

from build_v5 import BASELINE_BLOB_SHA1, HELPER_ANCHOR, ICONS, ASSETS
from build_v5 import exact_replace, apply_patch_file, git_blob_sha1, write_text, worker_template

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ('rewrite-spelling.js', 'meaning-grader-v6.js', 'meaning-mode.js',
           'dual-mode.js', 'audio-v6.js', 'correction-v6-1.js', 'practice-v6.js',
           'home-v6-1.js', 'feedback-v6-1.js')
STYLES = ('rewrite-spelling.css', 'meaning-mode.css', 'dual-mode.css', 'audio-v5.css',
          'correction-v6.css', 'scratchpad.css', 'home-v6-1.css', 'feedback-v6-1.css')


def build(root, out):
    root, out = root.resolve(), out.resolve()
    if out != root / 'v6-1':
        raise SystemExit('v6.1 只允许输出到独立 v6-1 目录。')
    patches = [f'v{version}-patches.json' for version in (3, 4, 5, 6)]
    patches += ['v6-1-home-patches.json', 'v6-1-patches.json']
    needed = [root / 'source' / name for name in (*SCRIPTS, *STYLES, *patches, 'scratchpad.js', '听写本.html')]
    needed += [root / name for name in (*ICONS, 'manifest.webmanifest', 'library-backup-unit1.json', 'tools/build_site.py', 'tools/build_v2.py')]
    missing = [str(path) for path in needed if not path.is_file()]
    if missing:
        raise SystemExit('缺少构建文件: ' + ', '.join(missing))
    baseline = (root / 'source/听写本.html').read_bytes()
    if git_blob_sha1(baseline) != BASELINE_BLOB_SHA1:
        raise SystemExit('原版源码已改变；停止构建。')
    html = baseline.decode('utf-8')
    counts = {}
    for name in patches:
        html, counts[name] = apply_patch_file(html, root / 'source' / name)
    scripts = {name: (root / 'source' / name).read_text(encoding='utf-8') for name in (*SCRIPTS, 'scratchpad.js')}
    styles = {name: (root / 'source' / name).read_text(encoding='utf-8') for name in STYLES}
    for name, content in scripts.items():
        if '</script' in content.lower():
            raise SystemExit('脚本含提前闭合标签: ' + name)
    for name, content in styles.items():
        if '</style' in content.lower():
            raise SystemExit('样式含提前闭合标签: ' + name)
    html = exact_replace(html, HELPER_ANCHOR, '\n'.join(scripts[name] for name in SCRIPTS) + '\n' + HELPER_ANCHOR, 'v6.1 helpers')
    html, titles = re.subn(r'(<title(?:\s[^>]*)?>).*?(</title>)', r'\g<1>听写本 v6.1 · 体验优化\g<2>', html, flags=re.DOTALL)
    if titles != 1:
        raise SystemExit('HTML 必须含唯一 title。')
    css = ''.join('<style data-' + name.removesuffix('.css') + '-style>\n' + content + '\n</style>\n' for name, content in styles.items())
    html = exact_replace(html, '</head>', css + '</head>', 'v6.1 styles')
    html = exact_replace(html, '</body>', '<script data-scratchpad-script>\n' + scripts['scratchpad.js'] + '\n</script>\n</body>', 'scratchpad')
    template = worker_template(root / 'tools/build_v2.py')
    template = exact_replace(template, '听写本 v5', '听写本 v6.1', 'worker label')
    template = exact_replace(template, "'tingxieben-v5:'", "'tingxieben-v6-1:'", 'worker namespace')
    manifest = json.loads((root / 'manifest.webmanifest').read_text(encoding='utf-8'))
    manifest.update({'name': '听写本 v6.1 · 体验优化', 'short_name': '听写本 v6.1', 'start_url': './', 'scope': './'})
    out.mkdir(exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='', prefix='.prepared-v6-1-', suffix='.html', dir=root, delete=False) as temp:
        prepared = Path(temp.name)
        temp.write(html)
    try:
        subprocess.run([sys.executable, str(root / 'tools/build_site.py'), '--root', str(root), '--src', str(prepared), '--out', str(out)], check=True)
    finally:
        prepared.unlink()
    write_text(out / 'manifest.webmanifest', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    for icon in ICONS:
        shutil.copyfile(root / icon, out / icon)
    digest = hashlib.sha256(template.encode('utf-8') + b'\0')
    for name in ('index.html', 'manifest.webmanifest', *ICONS):
        digest.update(name.encode('utf-8') + b'\0' + (out / name).read_bytes() + b'\0')
    version = digest.hexdigest()[:20]
    write_text(out / 'sw.js', exact_replace(exact_replace(template, '__CONTENT_HASH__', json.dumps(version), 'worker content hash'), '__ASSETS__', json.dumps(ASSETS), 'worker assets'))
    print('v6.1 输出:', out)
    print('补丁数量:', json.dumps(counts))
    print('离线版本:', version)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='独立构建听写本 v6.1')
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--out', type=Path, default=Path('v6-1'))
    args = parser.parse_args()
    build(args.root, args.out if args.out.is_absolute() else args.root / args.out)
