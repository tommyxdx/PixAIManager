#!/usr/bin/env python3
"""Builds the Chrome Web Store upload: dist/PixAI-Gallery-Manager-<version>.zip

Usage:  python tools/package.py

Only the files the extension runs are packed (manifest, background, offscreen page, src/, icons/,
_locales/); tests/, tools/, store/ and the README stay out. Before writing the archive it checks
that every file the manifest and offscreen.html name exists and that every __MSG_x__ has a message
in each locale. Standard library only.
"""
import json
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INCLUDE_FILES = ["manifest.json", "background.js", "offscreen.html"]
INCLUDE_DIRS = ["src", "icons", "_locales"]
SKIP = re.compile(r"(^|/)(\.|__pycache__/|Thumbs\.db$|desktop\.ini$)")


def fail(msg):
    print("ERROR:", msg)
    sys.exit(1)


def collect():
    files = []
    for f in INCLUDE_FILES:
        files.append(f)
    for d in INCLUDE_DIRS:
        for base, dirs, names in os.walk(os.path.join(ROOT, d)):
            dirs.sort()
            for n in sorted(names):
                rel = os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, "/")
                if not SKIP.search(rel):
                    files.append(rel)
    return files


def check(files):
    present = set(files)
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    needed = [manifest["background"]["service_worker"]]
    for cs in manifest.get("content_scripts", []):
        needed += cs.get("js", []) + cs.get("css", [])
    needed += list(manifest.get("icons", {}).values())
    needed += list(manifest.get("action", {}).get("default_icon", {}).values())
    with open(os.path.join(ROOT, "offscreen.html"), encoding="utf-8") as fh:
        needed += re.findall(r'<script src="([^"]+)"', fh.read())
    with open(os.path.join(ROOT, "background.js"), encoding="utf-8") as fh:
        for group in re.findall(r"importScripts\(([^)]*)\)", fh.read()):
            needed += re.findall(r'"([^"]+)"', group)
    missing = [f for f in needed if f not in present]
    if missing:
        fail("missing files: " + ", ".join(missing))

    keys = set(re.findall(r"__MSG_(\w+)__", json.dumps(manifest)))
    default = manifest.get("default_locale")
    locales = sorted(f.split("/")[1] for f in files if f.startswith("_locales/") and f.endswith("/messages.json"))
    if keys and default not in locales:
        fail("default_locale %r has no messages.json" % default)
    for loc in locales:
        with open(os.path.join(ROOT, "_locales", loc, "messages.json"), encoding="utf-8") as fh:
            messages = json.load(fh)
        lacking = sorted(k for k in keys if k not in messages)
        if lacking:
            fail("_locales/%s lacks %s" % (loc, ", ".join(lacking)))
        if len(messages.get("appName", {}).get("message", "")) > 75:
            fail("_locales/%s appName is longer than 75 characters" % loc)
        if len(messages.get("appDesc", {}).get("message", "")) > 132:
            fail("_locales/%s appDesc is longer than 132 characters" % loc)
    if any(f.startswith(("tests/", "tools/", "store/")) for f in files):
        fail("test or tool files would be packed")
    return manifest, locales


def main():
    files = collect()
    manifest, locales = check(files)
    version = manifest["version"]
    out_dir = os.path.join(ROOT, "dist")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "PixAI-Gallery-Manager-%s.zip" % version)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files:
            z.write(os.path.join(ROOT, f), f)
    print("version   %s" % version)
    print("locales   %s (default %s)" % (", ".join(locales), manifest.get("default_locale")))
    print("files     %d" % len(files))
    print("archive   %s (%d bytes)" % (out, os.path.getsize(out)))


if __name__ == "__main__":
    main()
