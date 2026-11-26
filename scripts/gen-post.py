#!/usr/bin/env python3
"""Extract a post page's sections from the LIVE capture into fragment JSON.

Why fragments: the single-post template is nine independent surfaces (breadcrumb, header,
cover, prose, share, author box, post nav, sidebar, comments). Hand-retyping them is how
fidelity dies; capturing the served bytes and substituting %BASE% keeps them exact.

Emits src/data/post.json  (one post — the parity specimen) and src/data/post-body.html.
Run scripts/gen-posts.py later to widen to all 39.
"""
import json
import re

SRC = "/home/opc/work/tech-truth/post.html"
OUT_JSON = "/home/opc/work/tech-astro/src/data/post.json"
OUT_BODY = "/home/opc/work/tech-astro/src/data/post-body.html"

html = open(SRC, encoding="utf-8", errors="replace").read()
ORIGIN = "https://gwillchijioke.qzz.io"


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


def grab(open_pattern, tag="div", from_pos=0):
    """Capture the element whose opening tag matches `open_pattern`."""
    m = re.search(open_pattern, html[from_pos:], re.S)
    if not m:
        return ""
    start = from_pos + m.start()
    return bal(html, start, tag)


def rewrite(s):
    """Internal origin -> %BASE%; keep external URLs absolute."""
    s = s.replace(f'href="{ORIGIN}/', 'href="%BASE%/')
    s = s.replace(f'src="{ORIGIN}/', 'src="%BASE%/')
    s = s.replace(f'href="{ORIGIN}"', 'href="%BASE%/"')
    s = s.replace(f'action="{ORIGIN}/', 'action="%BASE%/')
    return s


fragments = {}
fragments["breadcrumb"] = rewrite(grab(r'<nav class="breadcrumb"', "nav"))
fragments["header"] = rewrite(grab(r'<div class="article-header"'))
fragments["cover"] = rewrite(grab(r'<div class="article-cover"'))
cm = re.search(r'<(div|p|figcaption) class="article-cover-caption"', html)
fragments["caption"] = rewrite(bal(html, cm.start(), cm.group(1))) if cm else ""

# prose body is a div#article-body
m = re.search(r'<div class="prose"[^>]*id="article-body"', html)
body = ""
if m:
    body = bal(html, m.start())
    body = rewrite(body)
fragments["body"] = body

fragments["share"] = rewrite(grab(r'<div class="share-row"'))
fragments["authorBox"] = rewrite(grab(r'<section class="author-box"', "section"))
fragments["postNav"] = rewrite(grab(r'<div class="post-nav"'))
fragments["sidebar"] = rewrite(grab(r'<div class="sidebar-sticky"'))

# newsletter band inside the article
fragments["nlBand"] = rewrite(grab(r'<section class="nl-band nl-band--article"', "section"))

# article element classes (post-434 type-post ...) for exactness
art_m = re.search(r'<article\b[^>]*class="([^"]*)"', html)
fragments["articleClass"] = art_m.group(1) if art_m else ""

# frontmatter-ish scalars
title_m = re.search(r'<h1 itemprop="headline">(.*?)</h1>', html, re.S)
slug_m = re.search(r'<link rel="canonical" href="https://gwillchijioke\.qzz\.io/([^"/]+)/"', html)
meta = {
    "title": re.sub(r"<[^>]+>", "", title_m.group(1)).strip() if title_m else "",
    "slug": slug_m.group(1) if slug_m else "",
    "canonical": (re.search(r'<link rel="canonical" href="([^"]+)"', html) or [None, ""])[1],
}

open(OUT_BODY, "w", encoding="utf-8").write(body)
json.dump({**meta, "fragments": fragments}, open(OUT_JSON, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

print(f"post: {meta['title']!r}  slug={meta['slug']!r}")
for k, v in fragments.items():
    if k != "articleClass":
        print(f"  {k:12} {len(v):>6} bytes")
print(f"articleClass: {fragments['articleClass'][:60]}")
