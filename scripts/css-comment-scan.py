#!/usr/bin/env python3
"""Scan a stylesheet for unbalanced comment delimiters.

A stripped `/*` opener leaves prose sitting in declaration context. Browsers recover
silently (which is why the live site looks fine), but strict parsers — postcss, which
Astro/Vite runs — refuse the file. This finds every occurrence with line numbers.
"""
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "src/styles/theme.css"
src = open(path, encoding="utf-8", errors="replace").read()
lines = src.splitlines()

depth = 0
report = []
for i, line in enumerate(lines, 1):
    j = 0
    while j < len(line):
        if depth == 0 and line.startswith("/*", j):
            depth = 1
            j += 2
            continue
        if depth == 1 and line.startswith("*/", j):
            depth = 0
            j += 2
            continue
        j += 1
    if depth != 0:
        report.append(("OPEN-UNCLOSED" if depth else "", i, line.strip()[:100]))

# Find orphan closers: a '*/' while depth==0
depth = 0
for i, line in enumerate(lines, 1):
    j = 0
    while j < len(line):
        if depth == 0 and line.startswith("/*", j):
            depth = 1
            j += 2
            continue
        if depth == 0 and line.startswith("*/", j):
            report.append(("ORPHAN-CLOSER", i, line.strip()[:100]))
            j += 2
            continue
        if depth == 1 and line.startswith("*/", j):
            depth = 0
            j += 2
            continue
        j += 1

print(f"{path}: {len(report)} suspicious comment line(s)")
for kind, ln, text in report:
    print(f"  {kind:14} line {ln}: {text}")
