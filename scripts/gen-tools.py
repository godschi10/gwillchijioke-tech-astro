#!/usr/bin/env python3
"""Capture all 18 tool pages plus their own stylesheet and script.

Each tool is a self-contained surface: a `.gt-tool` panel driven entirely by client-side JS
plus a per-tool CSS file. The theme enqueues `assets/css/tools-<slug>.css` and
`assets/js/tools-<slug>.js`, so the port copies those files verbatim and renders the captured
markup — no re-implementation of any tool's logic.

Outputs:
  src/data/tools/<slug>.json      captured main region (+title/desc)
  public/css/tools/<slug>.css     verbatim theme stylesheet
  public/js/tools/<slug>.js       verbatim theme script
"""
import json
import os
import re
import ssl
import urllib.request

HOST = "https://gwillchijioke.qzz.io"
THEME = f"{HOST}/wp-content/themes/gwill-tech-theme/assets"
ORIGIN = HOST

SLUGS = [
    "apk-size-analyzer", "bulk-htaccess-redirect", "config-explainer", "conventional-commits",
    "cron-expression-generator", "debug-log-analyzer", "docker-compose-validator",
    "htaccess-generator", "htaccess-nginx-converter", "image-compressor", "json-formatter",
    "nginx-config-generator", "password-generator", "qr-generator", "schema-generator",
    "serialize-unserialize", "sqlite-mysql-converter", "wp-config-generator",
]

# WP template filenames differ from public slugs for a few tools.
JS_NAME = {
    "qr-generator": "tools-qrcode-generator.js",
    "wp-config-generator": "tools-wpconfig-generator.js",
    "debug-log-analyzer": "tools-debug-log.js",
    "docker-compose-validator": "tools-docker-compose-validator-v1196.js",
}
CSS_NAME = {
    "qr-generator": "tools-qrcode-generator.css",
    "wp-config-generator": "tools-wpconfig-generator.css",
    "debug-log-analyzer": "tools-debug-log.css",
    "docker-compose-validator": "tools-docker-compose-validator-v1196.css",
}

OUTD = "/home/opc/work/tech-astro/src/data/tools"
os.makedirs(OUTD, exist_ok=True)
os.makedirs("/home/opc/work/tech-astro/public/css/tools", exist_ok=True)
os.makedirs("/home/opc/work/tech-astro/public/js/tools", exist_ok=True)

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def get(url, timeout=45):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (port-capture)"})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read()


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


ok, fail = 0, []
for slug in SLUGS:
    try:
        html = get(f"{HOST}/tools/{slug}/").decode("utf-8", "replace")
    except Exception as e:
        fail.append((slug, f"page {e}"))
        continue

    mm = re.search(r"<main[^>]*>", html)
    me = html.find("</main>", mm.end()) if mm else -1
    region = html[mm.end():me] if mm else ""
    # the before-footer ad is rendered by the template, not the capture
    region = re.sub(r'<div class="ad-slot ad-slot--before-footer">.*?</div>\s*</div>\s*</div>', "", region, flags=re.S)
    region = rewrite(region)

    title = re.search(r"<title>(.*?)</title>", html, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', html)
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', html)

    json.dump({
        "slug": slug,
        "title": re.sub(r"<[^>]+>", "", title.group(1)).strip() if title else slug,
        "description": desc.group(1) if desc else "",
        "canonical": canon.group(1) if canon else f"{HOST}/tools/{slug}/",
        "body": region,
    }, open(f"{OUTD}/{slug}.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    # stylesheet + script, verbatim
    css_file = CSS_NAME.get(slug, f"tools-{slug}.css")
    js_file = JS_NAME.get(slug, f"tools-{slug}.js")
    for kind, name, dest in (("css", css_file, f"/home/opc/work/tech-astro/public/css/tools/{slug}.css"),
                             ("js", js_file, f"/home/opc/work/tech-astro/public/js/tools/{slug}.js")):
        try:
            data = get(f"{THEME}/{kind}/{name}")
            open(dest, "wb").write(data)
        except Exception as e:
            fail.append((slug, f"{kind} {name}: {e}"))

    ok += 1
    print(f"  {slug:30} body={len(region):>6}  {css_file[:34]:34} {js_file[:34]}")

print(f"\n{ok}/{len(SLUGS)} tools captured")
if fail:
    print("FAILURES:")
    for s, r in fail:
        print(" ", s, r)
