#!/usr/bin/env python3
"""Capture the public surfaces the original hand-written page list missed.

Sources of truth are the live WordPress sitemaps:
  - wp-sitemap-taxonomies-category-1.xml
  - wp-sitemap-taxonomies-post_tag-1.xml
plus two static pages (case-studies, services) and the speed-test tool.

Each output is the served main region with internal URLs rewritten to %BASE%.
Taxonomy JSON additionally carries `route` so Astro can generate clean paths.
"""
import json
import os
import re
import ssl
import urllib.parse
import urllib.request

HOST = "https://gwillchijioke.qzz.io"
BASE = "https://127.0.0.1"
ORIGIN = HOST
PAGE_OUT = "/home/opc/work/tech-astro/src/data/pages"
TAX_OUT = "/home/opc/work/tech-astro/src/data/taxonomies"
os.makedirs(PAGE_OUT, exist_ok=True)
os.makedirs(TAX_OUT, exist_ok=True)

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def get(path):
    req = urllib.request.Request(
        f"{HOST}{path}",
        headers={"User-Agent": "Mozilla/5.0 (static-port capture)", "Host": "gwillchijioke.qzz.io"},
    )
    with urllib.request.urlopen(req, timeout=45, context=CTX) as r:
        return r.read().decode("utf-8", "replace")


def bal(s, start, tag="div"):
    o = re.compile(rf"<{tag}\b", re.I)
    c = re.compile(rf"</{tag}\s*>", re.I)
    d, i = 0, start
    while i < len(s):
        a = o.search(s, i)
        b = c.search(s, i)
        if b and (not a or b.start() < a.start()):
            d -= 1
            i = b.end()
            if d == 0:
                return s[start:i]
        elif a:
            d += 1
            i = a.end()
        else:
            break
    return s[start:i]


def rewrite(s):
    # Internal page links and assets, including every candidate inside srcset.
    s = s.replace(f'href="{ORIGIN}/', 'href="%BASE%/')
    s = s.replace(f'src="{ORIGIN}/', 'src="%BASE%/')
    s = s.replace(f'href="{ORIGIN}"', 'href="%BASE%/"')
    s = s.replace(f'action="{ORIGIN}/', 'action="%BASE%/')
    s = s.replace(f"{ORIGIN}/wp-content/", "%BASE%/wp-content/")
    return s


def capture(path, public_path):
    html = get(path)
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', html)
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    bodycls = re.search(r'<body class="([^"]*)"', html)
    mm = re.search(r"<main[^>]*>", html)
    me = html.find("</main>", mm.end()) if mm else -1
    region = html[mm.end():me] if mm else ""
    region = re.sub(r'<div class="ad-slot ad-slot--before-footer">.*?</div>\s*</div>\s*</div>', "", region, flags=re.S)
    return {
        "name": public_path.strip("/").replace("/", "-"),
        "title": re.sub(r"<[^>]+>", "", title.group(1)).strip() if title else public_path,
        "description": desc.group(1) if desc else "",
        "canonical": canon.group(1) if canon else f"{HOST}{public_path}",
        "bodyClass": bodycls.group(1) if bodycls else "",
        "breadcrumb": "",
        "body": rewrite(region),
    }


# ── static pages omitted by the old generator ───────────────────────────────
for out_name, path in (
    ("case-studies", "/case-studies/"),
    ("services", "/services/"),
    ("tools-speed-test", "/tools/speed-test/"),
):
    data = capture(path, path)
    json.dump(data, open(f"{PAGE_OUT}/{out_name}.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"page  {out_name:18} body={len(data['body']):>6}")

# ── taxonomies from the live sitemaps ───────────────────────────────────────
for kind, sitemap in (
    ("category", "/wp-sitemap-taxonomies-category-1.xml"),
    ("tag", "/wp-sitemap-taxonomies-post_tag-1.xml"),
):
    xml = get(sitemap)
    locs = re.findall(r"<loc>([^<]+)</loc>", xml)
    for loc in locs:
        path = urllib.parse.urlparse(loc).path  # keep percent encoding for fetch
        route = urllib.parse.unquote(path).strip("/")
        route = route.split(f"{kind}/", 1)[-1].strip("/") if f"{kind}/" in route else route
        data = capture(path, urllib.parse.unquote(path))
        data["route"] = route
        data["kind"] = kind
        safe = re.sub(r"[^a-z0-9-]+", "-", route.lower()).strip("-")
        out = f"{TAX_OUT}/{kind}-{safe}.json"
        json.dump(data, open(out, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        print(f"{kind:8} {route:28} body={len(data['body']):>6} -> {os.path.basename(out)}")
