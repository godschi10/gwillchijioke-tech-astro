#!/usr/bin/env python3
"""Generate fragment JSON for the list/landing surfaces from LIVE captures.

Surfaces: all-posts (blog index), category index, author archive, tag archive.
Same discipline as posts: capture served bytes, substitute %BASE%, never retype.

Each page's content is everything inside <main> from after the breadcrumb to the trailing
before-footer ad — captured as ONE fragment so the section order is exactly the live one.
Filter bars / pagination are captured markup; their behaviour is a later phase (holds).
"""
import json
import os
import re

PAGES = [
    ("all-posts", "/home/opc/work/tech-truth/all-posts.html"),
    ("category-index", "/home/opc/work/tech-truth/category-index.html"),
    ("author-gwill", "/home/opc/work/tech-truth/author.html"),
    ("tag-android", "/home/opc/work/tech-truth/tag.html"),
    ("about", "/home/opc/work/tech-truth/about.html"),
    ("privacy", "/home/opc/work/tech-truth/privacy.html"),
    ("disclaimer", "/home/opc/work/tech-truth/disclaimer.html"),
    ("resources", "/home/opc/work/tech-truth/resources.html"),
    ("start-here", "/home/opc/work/tech-truth/start-here.html"),
    ("contact", "/home/opc/work/tech-truth/contact.html"),
    ("tools", "/home/opc/work/tech-truth/tools.html"),
    ("search", "/home/opc/work/tech-truth/search.html"),
    ("notfound", "/home/opc/work/tech-truth/notfound.html"),
]
OUTDIR = "/home/opc/work/tech-astro/src/data/pages"
os.makedirs(OUTDIR, exist_ok=True)
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


def rewrite(s):
    s = s.replace(f'href="{ORIGIN}/', 'href="%BASE%/')
    s = s.replace(f'src="{ORIGIN}/', 'src="%BASE%/')
    s = s.replace(f'href="{ORIGIN}"', 'href="%BASE%/"')
    s = s.replace(f'action="{ORIGIN}/', 'action="%BASE%/')
    return s


for name, path in PAGES:
    html = open(path, encoding="utf-8", errors="replace").read()

    title = re.search(r"<title>(.*?)</title>", html, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', html)
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    bodycls = re.search(r"<body class=\"([^\"]*)\"", html)

    # breadcrumb
    bc = re.search(r'<nav class="breadcrumb"', html)
    breadcrumb = rewrite(bal(html, bc.start(), "nav")) if bc else ""

    # the page body: from the .wrap that follows the breadcrumb, to just before the
    # before-footer ad (or </main>). Capturing the whole run preserves section order.
    main_m = re.search(r"<main[^>]*>", html)
    main_end = html.find("</main>", main_m.end()) if main_m else -1
    region = html[main_m.end():main_end] if main_m else ""

    # strip the trailing leaderboard/before-footer ad slots out of the captured region —
    # the template renders those itself so the slot shell stays reusable
    region = re.sub(r'<div class="ad-slot ad-slot--before-footer">.*?</div>\s*</div>\s*</div>', "", region, flags=re.S)
    region = rewrite(region)

    # drop the leading screen-reader h1 wrapper duplication is harmless; keep as-is
    data = {
        "name": name,
        "title": re.sub(r"<[^>]+>", "", title.group(1)).strip() if title else name,
        "description": desc.group(1) if desc else "",
        "canonical": canon.group(1) if canon else "",
        "bodyClass": bodycls.group(1) if bodycls else "",
        "breadcrumb": breadcrumb,
        "body": region,
    }
    json.dump(data, open(f"{OUTDIR}/{name}.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"  {name:16} body={len(region):>6}  bc={len(breadcrumb):>4}  title={data['title'][:52]!r}")
