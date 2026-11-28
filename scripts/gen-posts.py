#!/usr/bin/env python3
"""Generate fragment JSON for EVERY published post, from the LIVE site.

Same discipline as the single-post specimen: capture the served bytes, substitute %BASE%,
never retype. One JSON per slug in src/data/posts/<slug>.json plus the body HTML.

Concurrency is modest (4) so a 1-vCPU box isn't thrashed.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HOST = "https://gwillchijioke.qzz.io"
ORIGIN = HOST
SITEMAP = f"{HOST}/wp-sitemap-posts-post-1.xml"
SLUGS_FILE = "/home/opc/work/tech-truth/slugs.txt"
OUTDIR = "/home/opc/work/tech-astro/src/data/posts"
os.makedirs(OUTDIR, exist_ok=True)


def sitemap_slugs():
    """All published post slugs from the live WordPress sitemap.

    The original hand-written slugs.txt went stale and silently omitted 8 posts.
    The sitemap is the source of truth; keep the file as a fallback for offline runs.
    """
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(SITEMAP, headers={"User-Agent": "Mozilla/5.0 (port-capture)"})
        with urllib.request.urlopen(req, timeout=45, context=ctx) as r:
            xml = r.read().decode("utf-8", "replace")
        locs = re.findall(r"<loc>([^<]+)</loc>", xml)
        out = []
        for loc in locs:
            path = urllib.parse.urlparse(loc).path.strip("/")
            if path:
                out.append(path)
        if out:
            return out
    except Exception as e:
        print(f"  sitemap unavailable ({e}); falling back to slugs.txt")
    return [line.strip() for line in open(SLUGS_FILE) if line.strip()]


SLUGS = sitemap_slugs()
print(f"post slugs: {len(SLUGS)} from {'sitemap' if len(SLUGS) != 0 else 'file'}")


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
    s = s.replace(f'href="{ORIGIN}/', 'href="%BASE%/')
    s = s.replace(f'src="{ORIGIN}/', 'src="%BASE%/')
    s = s.replace(f'href="{ORIGIN}"', 'href="%BASE%/"')
    s = s.replace(f'action="{ORIGIN}/', 'action="%BASE%/')
    return s


def fetch(slug):
    url = f"{HOST}/{slug}/"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (port-capture)"})
    ctx = __import__("ssl").create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = __import__("ssl").CERT_NONE
    with urllib.request.urlopen(req, timeout=45, context=ctx) as r:
        return url, r.read().decode("utf-8", "replace")


def one(slug):
    try:
        url, html = fetch(slug)
    except Exception as e:
        return slug, f"FETCH FAIL {e}"

    def grab(pat, tag="div"):
        m = re.search(pat, html, re.S)
        return bal(html, m.start(), tag) if m else ""

    frag = {}
    frag["breadcrumb"] = rewrite(grab(r'<nav class="breadcrumb"', "nav"))
    frag["header"] = rewrite(grab(r'<div class="article-header"'))
    frag["cover"] = rewrite(grab(r'<div class="article-cover'))
    cm = re.search(r"<(div|p|figcaption) class=\"article-cover-caption\"", html)
    frag["caption"] = rewrite(bal(html, cm.start(), cm.group(1))) if cm else ""

    m = re.search(r'<div class="prose"[^>]*id="article-body"', html)
    body = rewrite(bal(html, m.start())) if m else ""
    frag["body"] = body
    frag["tags"] = rewrite(grab(r'<div class="post-tags"'))
    frag["share"] = rewrite(grab(r'<div class="share-row"'))
    frag["authorBox"] = rewrite(grab(r'<section class="author-box"', "section"))
    frag["postNav"] = rewrite(grab(r'<div class="post-nav"'))
    frag["sidebar"] = rewrite(grab(r'<div class="sidebar-sticky"'))
    frag["nlBand"] = rewrite(grab(r'<section class="nl-band nl-band--article"', "section"))

    art = re.search(r"<article\b[^>]*class=\"([^\"]*)\"", html)
    title_m = re.search(r'<h1 itemprop="headline">(.*?)</h1>', html, re.S)
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    desc = re.search(r'<meta name="description" content="([^"]*)"', html)
    ogimg = re.search(r'<meta property="og:image" content="([^"]*)"', html)

    data = {
        "slug": slug,
        "url": url,
        "title": re.sub(r"<[^>]+>", "", title_m.group(1)).strip() if title_m else slug,
        "canonical": canon.group(1) if canon else url,
        "description": desc.group(1) if desc else "",
        "ogImage": ogimg.group(1) if ogimg else "",
        "articleClass": art.group(1) if art else "",
        "fragments": frag,
    }
    safe = urllib.parse.quote(slug, safe="")
    json.dump(data, open(f"{OUTDIR}/{safe}.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    return slug, f"ok body={len(body)}"


results = []
with ThreadPoolExecutor(max_workers=4) as ex:
    for slug, status in ex.map(one, SLUGS):
        results.append((slug, status))
        print(f"  {status:22} {slug[:58]}")

ok = sum(1 for _, s in results if s.startswith("ok"))
print(f"\n{ok}/{len(SLUGS)} posts generated into {OUTDIR}")
fails = [r for r in results if not r[1].startswith("ok")]
if fails:
    print("FAILURES:", fails)
    sys.exit(1)
