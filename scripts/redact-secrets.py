#!/usr/bin/env python3
"""Redact credential-shaped Discord bot tokens from captured content.

The live WordPress post itself embeds a token in a comment block. Every fresh
capture therefore reintroduces it. This must run after any capture and before
build/commit. Replace with a stable marker; never print the secret.
"""
import glob
import json
import re

TOKEN = re.compile(r"[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,40}")
PLACEHOLDER = "REDACTED-DISCORD-TOKEN"
COUNT = 0

def walk(obj):
    global COUNT
    if isinstance(obj, dict):
        return {k: walk(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [walk(v) for v in obj]
    if isinstance(obj, str):
        new, n = TOKEN.subn(PLACEHOLDER, obj)
        COUNT += n
        return new
    return obj

for pattern in ("src/data/**/*.json", "src/data/*.json"):
    for filename in sorted(glob.glob(pattern, recursive=True)):
        data = json.load(open(filename, encoding="utf-8"))
        cleaned = walk(data)
        if cleaned != data:
            json.dump(cleaned, open(filename, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
            print(f"redacted {filename}")

print(f"redacted {COUNT} token occurrence(s)")
raise SystemExit(0 if COUNT >= 0 else 1)
