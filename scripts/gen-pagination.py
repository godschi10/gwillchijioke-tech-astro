#!/usr/bin/env python3
"""Capture every paginated archive page the live theme links to.

Sitemaps do not list pagination, but the visible pager links do. Each captured page
keeps the served markup and is routed under its real URL.
"""
import json
import os
import re
import ssl
import urllib.parse
import urllib.request

HOST = "https://gwillchijioke.qzz.io"
OUT = "/home/opc/work/tech-astro/src/data/pagination"
os.makedirs(OUT, exist_ok=True)
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

BASES = [
    ("all-posts", "/all-posts/"),
    ("author", "/author/gwill/"),
    ("category", "/category/android/"),
    ("category", "/category/software/"),
    ("category", "/category/web-dev/"),
    ("tag", "/tag/android/"),
    ("tag", "/tag/devops/"),
    ("tag", "/tag/linux/"),
    ("tag", "/tag/performance/"),
    ("tag", "/tag/tutorial/"),
    ("tag", "/tag/web-dev/"),
]

def get(path):
    req = urllib.request.Request(HOST + path, headers={"User-Agent": "Mozilla/5.0 (static-port capture)"})
    with urllib.request.urlopen(req, timeout=45, context=CTX) as r:
        return r.read().decode("utf-8", "replace")

def bal(s, start, tag="div"):
    o = re.compile(rf"<{tag}\b", re.I); c = re.compile(rf"</{tag}\s*>", re.I); d = 0; i = start
    while i < len(s):
        a = o.search(s, i); b = c.search(s, i)
        if b and (not a or b.start() < a.start()):
            d -= 1; i = b.end()
            if d == 0: return s[start:i]
        elif a:
            d += 1; i = a.end()
        else: break
    return s[start:i]

def rewrite(s):
    s = s.replace(f'href="{HOST}/', 'href="%BASE%/')
    s = s.replace(f'src="{HOST}/', 'src="%BASE%/')
    s = s.replace(f'action="{HOST}/', 'action="%BASE%/')
    s = s.replace(f"{HOST}/wp-content/", "%BASE%/wp-content/")
    return s

def capture(path, route, group):
    html = get(path)
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', html)
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    bodycls = re.search(r'<body class="([^"]*)"', html)
    mm = re.search(r"<main[^>]*>", html)
    me = html.find("</main>", mm.end()) if mm else -1
    region = html[mm.end():me] if mm else ""
    region = re.sub(r'<div class="ad-slot ad-slot--before-footer">.*?</div>\s*</div>\s*</div>', "", region, flags=re.S)
    data = {
        "name": group + "-" + re.sub(r"[^a-z0-9-]+", "-", route.lower()).strip("-"),
        "title": re.sub(r"<[^>]+>", "", title.group(1)).strip() if title else route,
        "description": desc.group(1) if desc else "",
        "canonical": canon.group(1) if canon else HOST + path,
        "bodyClass": bodycls.group(1) if bodycls else "",
        "breadcrumb": "",
        "body": rewrite(region),
        "route": route,
        "group": group,
    }
    safe = group + "-" + re.sub(r"[^a-z0-9-]+", "-", route.lower()).strip("-")
    json.dump(data, open(f"{OUT}/{safe}.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"{group:8} {route:38} body={len(region):>6}")

for group, base in BASES:
    html = get(base)
    # pagination markup can expose page/N links; derive the maximum for this archive.
    nums = [int(n) for n in re.findall(re.escape(base) + r"page/(\d+)/", html)]
    # recursive only if the first page exposes only prev/next; one extra fetch is cheap.
    if nums:
        for n in range(2, max(nums) + 1):
            path = f"{base}page/{n}/"
            capture(path, path.strip("/"), group)
    else:
        print(f"{group:8} {base:38} no pagination")
