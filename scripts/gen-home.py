#!/usr/bin/env python3
"""Extract homepage content from the LIVE capture into truth JSON.

The served bytes are the oracle. Real markup facts this encodes:
  - the section title is a <p class="label"> (e.g. ">_ /web-dev"), NOT an <h2>
  - the "view all" control is <a class="sec-head-link"> with a &rarr; arrow
  - .sec-head and .card carry INLINE category colour vars (--c, --c-dim, --c-border, --c-grad);
    they must be carried through or every section loses its category tint
  - filter pills are <button class="pill"> with `on` marking the active one

Emits src/data/home.json.
"""
import json
import re

SRC = "/home/opc/work/tech-truth/home.html"
OUT = "/home/opc/work/tech-astro/src/data/home.json"

html = open(SRC, encoding="utf-8", errors="replace").read()


def balanced_block(s, start, tag="div"):
    open_re = re.compile(rf"<{tag}\b", re.I)
    close_re = re.compile(rf"</{tag}\s*>", re.I)
    depth, i = 0, start
    while i < len(s):
        o = open_re.search(s, i)
        c = close_re.search(s, i)
        if c and (not o or c.start() < o.start()):
            depth -= 1
            i = c.end()
            if depth == 0:
                return s[start:i]
        elif o:
            depth += 1
            i = o.end()
        else:
            break
    return s[start:i]


ENT = {
    "&amp;": "&", "&#8217;": "\u2019", "&#8216;": "\u2018", "&#8211;": "\u2013",
    "&#8212;": "\u2014", "&quot;": '"', "&#039;": "'", "&#39;": "'", "&rarr;": "\u2192",
    "&larr;": "\u2190", "&hellip;": "\u2026", "&nbsp;": " ", "&lt;": "<", "&gt;": ">",
    "&raquo;": "\u00bb", "&laquo;": "\u00ab", "&middot;": "\u00b7", "&times;": "\u00d7",
}


def txt(fragment):
    t = re.sub(r"<[^>]+>", " ", fragment)
    for k, v in ENT.items():
        t = t.replace(k, v)
    t = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), t)
    return re.sub(r"\s+", " ", t).strip()


def attr(fragment, name):
    m = re.search(rf'{name}="([^"]*)"', fragment)
    return m.group(1) if m else ""


def parse_meta(block):
    meta = {"author": "", "read": "", "dateISO": "", "dateText": ""}
    m = re.search(r'<div class="(?:card|hc)-meta"[^>]*>(.*?)</div>', block, re.S)
    if not m:
        return meta
    seg = m.group(1)
    spans = [txt(s) for s in re.findall(r"<span[^>]*>(.*?)</span>", seg, re.S)]
    # separators are &middot; spans; drop them so the order is author, read, date
    spans = [s for s in spans if s and s not in {"\u00b7", "|", "-"}]
    if len(spans) >= 1:
        meta["author"] = spans[0]
    if len(spans) >= 2:
        meta["read"] = spans[1]
    if len(spans) >= 3:
        meta["dateText"] = spans[2]
    tm = re.search(r'<time[^>]*datetime="([^"]*)"[^>]*>(.*?)</time>', seg, re.S)
    if tm:
        meta["dateISO"] = tm.group(1)
        meta["dateText"] = txt(tm.group(2))
    return meta


def parse_card(block, lead=False):
    href_m = re.search(r'<a[^>]*href="([^"]+)"[^>]*class="[^"]*card-link', block)
    if not href_m:
        href_m = re.search(r'<h[23][^>]*>\s*<a[^>]*href="([^"]+)"', block)
    if not href_m:
        href_m = re.search(r'href="([^"]+)"', block)
    title_m = re.search(r"<h[23][^>]*>(.*?)</h[23]>", block, re.S)
    ex_m = re.search(r'<p class="(?:card-ex|ex)[^"]*"[^>]*>(.*?)</p>', block, re.S)
    if not ex_m:
        ex_m = re.search(r"<p[^>]*>(.*?)</p>", block, re.S)
    badge_m = re.search(r'<(?:a|span)[^>]*class="badge[^"]*"[^>]*>(.*?)</(?:a|span)>', block, re.S)
    img_m = re.search(r'<img[^>]*src="([^"]+)"', block)
    srcset_m = re.search(r'<img[^>]*srcset="([^"]*)"', block)
    media_m = re.search(r'<div class="card-media([^"]*)"', block)
    cat_href_m = re.search(r'<a[^>]*href="([^"]+)"[^>]*class="badge', block)
    return {
        "href": href_m.group(1) if href_m else "",
        "catHref": cat_href_m.group(1) if cat_href_m else "",
        "title": txt(title_m.group(1)) if title_m else "",
        "excerpt": txt(ex_m.group(1)) if ex_m else "",
        "badge": txt(badge_m.group(1)) if badge_m else "",
        "img": img_m.group(1) if img_m else "",
        "srcset": srcset_m.group(1) if srcset_m else "",
        "mediaClass": media_m.group(1).strip() if media_m else "",
        "lead": lead,
        "style": attr(block[:200], "style"),
        **parse_meta(block),
    }


# ── hero ────────────────────────────────────────────────────────────────────
hero = []
for m in re.finditer(r'<div class="hc-slide', html):
    block = balanced_block(html, m.start())
    hero.append({
        # the FIRST anchor in a slide is the category badge; the post link is inside the heading
        "href": (re.search(r"<h[23][^>]*>\s*<a[^>]*href=\"([^\"]+)\"", block)
                 or re.search(r'href="([^"]+)"', block) or [None, ""])[1],
        "title": txt((re.search(r"<h[23][^>]*>(.*?)</h[23]>", block, re.S) or [None, ""])[1]),
        "deck": txt((re.search(r'<p[^>]*>(.*?)</p>', block, re.S) or [None, ""])[1]),
        "cat": txt((re.search(r'<(?:a|span)[^>]*class="badge[^"]*"[^>]*>(.*?)</(?:a|span)>', block, re.S) or [None, ""])[1]),
        "catHref": (re.search(r'<(?:a)[^>]*href="([^"]+)"[^>]*class="badge', block) or [None, ""])[1],
        "img": attr(block[block.find("<img"):block.find("<img") + 400], "src") if "<img" in block else "",
        "style": attr(block, "style"),
        **parse_meta(block),
    })

# ── sections ────────────────────────────────────────────────────────────────
sections = []
for m in re.finditer(r'<section class="section-sm"', html):
    block = balanced_block(html, m.start(), "section")

    head_m = re.search(r'<div class="[^"]*sec-head[^"]*"[^>]*>', block)
    head_html, head_style, label, view_all = "", "", "", None
    if head_m:
        head_html = balanced_block(block, head_m.start())
        head_style = attr(head_m.group(0), "style")
        lm = re.search(r'<p class="label"[^>]*>(.*?)</p>', head_html, re.S)
        label = txt(lm.group(1)) if lm else ""
        vm = re.search(r'<a[^>]*class="[^"]*sec-head-link[^"]*"[^>]*>(.*?)</a>', head_html, re.S)
        vh = re.search(r'<a[^>]*class="[^"]*sec-head-link[^"]*"[^>]*>', head_html)
        if vm and vh:
            view_all = {"href": attr(vh.group(0), "href"), "label": txt(vm.group(1))}

    cards = []
    for cm in re.finditer(r'<div class="card(?:\s[^"]*)?reveal', block):
        cb = balanced_block(block, cm.start())
        cards.append(parse_card(cb, lead="card-lead" in cm.group(0)))

    filters = []
    pills_m = re.search(r'<div class="flex filter-pills"', block)
    if pills_m:
        pills = balanced_block(block, pills_m.start())
        for pm in re.finditer(r"<button([^>]*)>(.*?)</button>", pills, re.S):
            a = pm.group(1)
            filters.append({
                "label": txt(pm.group(2)),
                "value": attr(a, "data-filter"),
                "active": re.search(r'class="[^"]*\bon\b', a) is not None,
                "style": attr(a, "style"),
                "cat": "pill-cat" in a,
            })

    if label or cards or filters:
        sections.append({
            "label": label,
            "style": head_style,
            "viewAll": view_all,
            "cards": cards,
            "filters": filters,
        })

# ── newsletter band ─────────────────────────────────────────────────────────
nl = None
nl_m = re.search(r'<section class="nl-band', html)
if nl_m:
    nb = balanced_block(html, nl_m.start(), "section")
    t_m = re.search(r'<div class="nl-band-text".*?</div>', nb, re.S)
    nl = {
        "heading": txt((re.search(r"<h2[^>]*>(.*?)</h2>", nb, re.S) or [None, ""])[1]),
        "copy": txt((re.search(r'<p[^>]*>(.*?)</p>', nb, re.S) or [None, ""])[1]),
        "button": txt((re.search(r'<button[^>]*>(.*?)</button>', nb, re.S) or [None, ""])[1]),
        "placeholder": attr((re.search(r'<input[^>]*type="email"[^>]*>', nb) or [""])[0], "placeholder"),
        "emailId": attr((re.search(r'<input[^>]*type="email"[^>]*>', nb) or [""])[0], "id"),
    }

json.dump(
    {"hero": hero, "sections": sections, "newsletter": nl},
    open(OUT, "w", encoding="utf-8"), indent=2, ensure_ascii=False,
)

print(f"hero slides : {len(hero)}")
for h in hero:
    print(f"   {h['cat']:12} {h['title'][:52]!r}")
print(f"sections    : {len(sections)}")
for i, s in enumerate(sections):
    print(f"   [{i}] label={s['label']!r:24} cards={len(s['cards']):2} filters={len(s['filters'])} viewAll={(s['viewAll'] or {}).get('label')!r}")
print(f"newsletter  : {nl}")
