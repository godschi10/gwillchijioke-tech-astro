#!/usr/bin/env python3
"""Extract the theme's ad-slot creatives from the LIVE capture into truth JSON.

The theme fills each slot with `<template class="ad-variant" data-device="...">` banner
markup (inc/ad-slots.php). Copying the creatives keeps the slots pixel-faithful instead of
collapsing them, and the same shell accepts real ad code at deploy.

Emits src/data/ad-slots.json keyed by variant: {templates:[{device, html}]}
"""
import json
import re

SOURCES = ["/home/opc/work/tech-truth/home.html", "/home/opc/work/tech-truth/post.html"]
OUT = "/home/opc/work/tech-astro/src/data/ad-slots.json"

html = "\n".join(open(f, encoding="utf-8", errors="replace").read() for f in SOURCES)

slots = {}
# Walk every ad-slot and grab its <template> children.
for m in re.finditer(r'<div class="ad-slot ad-slot--([a-z-]+)"', html):
    variant = m.group(1)
    # find the slot's own closing div by depth
    start = m.start()
    depth, i = 0, start
    o = re.compile(r"<div\b", re.I)
    c = re.compile(r"</div\s*>", re.I)
    end = len(html)
    while i < len(html):
        a = o.search(html, i)
        b = c.search(html, i)
        if b and (not a or b.start() < a.start()):
            depth -= 1
            i = b.end()
            if depth == 0:
                end = i
                break
        elif a:
            depth += 1
            i = a.end()
        else:
            break
    block = html[start:end]
    variants = []
    for t in re.finditer(r'<template class="ad-variant" data-device="([a-z]+)">(.*?)</template>', block, re.S):
        inner = t.group(2).strip()
        inner = inner.replace('src="https://gwillchijioke.qzz.io/', 'src="%BASE%/')
        variants.append({"device": t.group(1), "html": inner})
    if variants:
        slots.setdefault(variant, variants)

json.dump(slots, open(OUT, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print(f"variants captured: {list(slots)}")
for k, v in slots.items():
    print(f"  {k}: {[t['device'] for t in v]}")
