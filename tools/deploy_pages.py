#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把整个仓库目录发布到 GitHub Pages —— 不需要 git，直接走 REST API。

凭据按顺序取用：
  1. 环境变量 GITHUB_TOKEN（或 GH_TOKEN）
  2. Windows 凭据管理器里 github.com 的 git 凭据（git credential fill）
凭据只用于发请求，脚本不会打印、也不会写进任何文件。

用法：
    python tools/deploy_pages.py                        # 推到 token 所属账号下的 tingxieben 仓库
    python tools/deploy_pages.py --repo mysite          # 换个仓库名
    python tools/deploy_pages.py --dir . --exclude docs # 换目录 / 少推一个目录

推完会自动开启（或更新）GitHub Pages，并轮询站点是否上线。
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.github.com"
DEFAULT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", "__pycache__", ".idea", ".vscode"}
SKIP_FILES = {".DS_Store", "Thumbs.db"}


def get_token():
    for env in ("GITHUB_TOKEN", "GH_TOKEN"):
        v = os.environ.get(env)
        if v:
            return v.strip()
    # 回退：Windows 凭据管理器里的 git 凭据
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GCM_INTERACTIVE="never")
    try:
        p = subprocess.run(["git", "credential", "fill"],
                           input="protocol=https\nhost=github.com\n\n",
                           capture_output=True, text=True, timeout=30, env=env)
    except Exception:
        sys.exit("找不到凭据：请设置环境变量 GITHUB_TOKEN")
    for line in p.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    sys.exit("找不到凭据：请设置环境变量 GITHUB_TOKEN，或在 git 里登录过 github.com")


TOKEN = get_token()


def call(method, path=None, body=None, raw_url=None):
    url = raw_url or (API + path)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "tingxieben-deploy")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(txt) if txt.strip() else {}), dict(r.headers)
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", "replace")
        try:
            j = json.loads(txt)
        except Exception:
            j = {"message": txt[:200]}
        return e.code, j, dict(e.headers)
    except Exception as e:
        return None, {"message": "%s: %s" % (type(e).__name__, e)}, {}


def collect(root, exclude):
    """收集要上传的文件（相对路径 -> 绝对路径）。"""
    out = []
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in SKIP_DIRS and d not in exclude]
        for f in fn:
            if f in SKIP_FILES or f.startswith(".") and f != ".nojekyll":
                continue
            full = os.path.join(dp, f)
            out.append((os.path.relpath(full, root).replace("\\", "/"), full))
    return sorted(out)


def main():
    ap = argparse.ArgumentParser(description="发布静态站点到 GitHub Pages")
    ap.add_argument("--repo", default="tingxieben", help="仓库名（默认 tingxieben）")
    ap.add_argument("--owner", default=None, help="账号名（默认取 token 所属账号）")
    ap.add_argument("--dir", default=DEFAULT_ROOT, help="要发布的本地目录")
    ap.add_argument("--exclude", default="", help="额外跳过的目录名，逗号分隔")
    args = ap.parse_args()

    exclude = {x for x in args.exclude.split(",") if x}

    st, me, hdr = call("GET", "/user")
    if st != 200:
        sys.exit("凭据无效: HTTP %s %s" % (st, me.get("message")))
    owner = args.owner or me["login"]
    repo = args.repo
    print("[0] 身份: %s   token 范围: %s" % (owner, hdr.get("x-oauth-scopes") or "(未返回)"))

    st, _, _ = call("GET", "/repos/%s/%s" % (owner, repo))
    if st == 404:
        st, res, _ = call("POST", "/user/repos", {
            "name": repo, "private": False, "auto_init": True,
            "description": "英语单词听写本 · 可安装到 iPad 的网页版（PWA）",
            "has_wiki": False,
        })
        if st != 201:
            sys.exit("[1] 建仓库失败: HTTP %s %s" % (st, res.get("message")))
        print("[1] 已创建仓库: %s" % res["full_name"])
    else:
        print("[1] 仓库已存在: %s/%s" % (owner, repo))

    st, repo_info, _ = call("GET", "/repos/%s/%s" % (owner, repo))
    branch = repo_info.get("default_branch", "main")

    files = collect(args.dir, exclude)
    print("[2] 待上传 %d 个文件 -> %s 分支" % (len(files), branch))
    ok = fail = 0
    for i, (rel, full) in enumerate(files, 1):
        with open(full, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        st_g, cur, _ = call("GET", "/repos/%s/%s/contents/%s" % (owner, repo, rel))
        body = {"message": "更新 %s" % rel, "content": b64, "branch": branch}
        if st_g == 200 and isinstance(cur, dict) and cur.get("sha"):
            body["sha"] = cur["sha"]
        st_p, res_p, _ = call("PUT", "/repos/%s/%s/contents/%s" % (owner, repo, rel), body)
        if st_p in (200, 201):
            ok += 1
            print("  [2.%d] OK  %-38s %5d KB" % (i, rel, len(b64) // 1024))
        else:
            fail += 1
            print("  [2.%d] 失败 %-36s HTTP %s %s" % (i, rel, st_p, res_p.get("message")))
    print("      成功 %d / 失败 %d" % (ok, fail))

    st, res, _ = call("POST", "/repos/%s/%s/pages" % (owner, repo),
                      {"source": {"branch": branch, "path": "/"}})
    if st in (200, 201):
        print("[3] Pages 已开启: %s" % (res.get("html_url") or res.get("url")))
    elif st in (409, 422):
        st2, res2, _ = call("PUT", "/repos/%s/%s/pages" % (owner, repo),
                            {"source": {"branch": branch, "path": "/"}})
        print("[3] Pages 已存在，更新 -> HTTP %s %s" % (st2, res2.get("html_url", res2.get("message"))))
    else:
        print("[3] 开启 Pages 失败: HTTP %s %s" % (st, res.get("message")))

    url = "https://%s.github.io/%s/" % (owner, repo)
    print("[4] 等待上线: %s" % url)
    live = False
    for attempt in range(1, 31):          # 最多 30 次 × 8s ≈ 4 分钟
        time.sleep(8)
        code, _, _ = call("GET", raw_url=url)
        if attempt % 3 == 0 or code == 200:
            print("      第 %d 次探测: HTTP %s" % (attempt, code))
        if code == 200:
            live = True
            break
    print("[4] %s  %s" % ("✅ 已上线" if live else "⏳ 还在构建，稍后再探", url))


if __name__ == "__main__":
    main()
