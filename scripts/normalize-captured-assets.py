#!/usr/bin/env python3
"""Point every captured image candidate at the static host.

The original capture kept WordPress-origin `srcset` entries. Browsers therefore
requested the live WordPress site for responsive images even though the files are
present in `public/`. This rewrites only captured HTML string values; canonical and
metadata fields keep their original absolute URLs.
"""
import glob
import json
import re

ORIGIN = "https://gwillchijioke.qzz.io"
SKIP = {"canonical", "url", "ogImage", "title", "description", "name", "bodyClass"}

def clean_value(value: str) -> str:
    value = value.replace(f"{ORIGIN}/wp-content/", "%BASE%/wp-content/")
    value = value.replace(f"{ORIGIN}/assets/", "%BASE%/assets/")
    return value

def walk(obj, key=""):
    if isinstance(obj, dict):
        return {k: walk(v, k) for k, v in obj.items()}
    if isinstance(obj, list):
        return [walk(v, key) for v in obj]
    if isinstance(obj, str) and key not in SKIP:
        return clean_value(obj)
    return obj

changed = 0
for pattern in (
    "src/data/posts/*.json",
    "src/data/pages/*.json",
    "src/data/tools/*.json",
    "src/data/taxonomies/*.json",
    "src/data/pagination/*.json",
):
    for filename in sorted(glob.glob(pattern)):
        data = json.load(open(filename, encoding="utf-8"))
        before = json.dumps(data, ensure_ascii=False)
        data = walk(data)
        after = json.dumps(data, ensure_ascii=False)
        if before != after:
            json.dump(data, open(filename, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
            changed += 1
print(f"normalized responsive assets in {changed} captured file(s)")
