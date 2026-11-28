#!/usr/bin/env python3
"""Generate the mobile table of contents for every post from its captured prose.

The live theme renders a `<details class="toc-dropdown toc-mobile">` between the
cover and the prose. The original fragment capture only kept cover/prose, so the
mobile TOC was missing. Build the same structure from the h2/h3 headings already
present in the captured body; IDs are preserved, so links work without JS.
"""
import glob
import html
import json
import re

HEADING = re.compile(r'<h([23])\b[^>]*\bid="([^"]+)"[^>]*>(.*?)</h\1>', re.S | re.I)
TAG = re.compile(r'<[^>]+>')

updated = 0
for filename in sorted(glob.glob('src/data/posts/*.json')):
    data = json.load(open(filename, encoding='utf-8'))
    frags = data.get('fragments') or {}
    body = frags.get('body') or ''
    items = []
    for level, ident, inner in HEADING.findall(body):
        text = html.unescape(TAG.sub(' ', inner))
        text = re.sub(r'\s+', ' ', text).strip()
        if not text:
            continue
        cls = ' class="toc-h3"' if level == '3' else ''
        items.append(f'<li{cls}><a href="#{html.escape(ident, quote=True)}">{html.escape(text)}</a></li>')

    if len(items) < 2:
        frags.pop('tocMobile', None)
        continue

    frags['tocMobile'] = (
        '<details class="toc-dropdown toc-mobile" id="gwill-toc-mobile">\n'
        '<summary class="toc-summary">&gt;_ On this page</summary>\n'
        '<ul class="toc-list">\n' + '\n'.join(items) + '\n</ul>\n'
        '</details>'
    )
    data['fragments'] = frags
    json.dump(data, open(filename, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    updated += 1

print(f'added mobile TOC to {updated} post(s)')
