#!/usr/bin/env python3
"""
Patch android/app/src/main/AndroidManifest.xml after `npx cap add android`.
Adds:
  - INTERNET and READ_EXTERNAL_STORAGE permissions
  - android:exported="true" on the main activity
  - intent-filter for opening .pdf files ("Open with")
  - intent-filter for receiving shared PDF files
"""
import xml.etree.ElementTree as ET
import sys

MANIFEST_PATH = "android/app/src/main/AndroidManifest.xml"
NS = "http://schemas.android.com/apk/res/android"


def a(name: str) -> str:
    """Return a fully-qualified android: attribute name."""
    return f"{{{NS}}}{name}"


def sub(parent: ET.Element, tag: str, **attrs) -> ET.Element:
    el = ET.SubElement(parent, tag)
    for k, v in attrs.items():
        el.set(k, v)
    return el


ET.register_namespace("android", NS)

try:
    tree = ET.parse(MANIFEST_PATH)
except FileNotFoundError:
    print(f"ERROR: {MANIFEST_PATH} not found. Did `npx cap add android` run first?")
    sys.exit(1)

root = tree.getroot()

# ── Permissions ──────────────────────────────────────────────────────────────

existing_perms = {e.get(a("name")) for e in root.findall("uses-permission")}

for perm_name, extra in [
    ("android.permission.INTERNET", {}),
    ("android.permission.READ_EXTERNAL_STORAGE", {a("maxSdkVersion"): "32"}),
]:
    if perm_name not in existing_perms:
        el = ET.SubElement(root, "uses-permission")
        el.set(a("name"), perm_name)
        for k, v in extra.items():
            el.set(k, v)

# ── Activity intent filters ───────────────────────────────────────────────────

app = root.find("application")
if app is None:
    print("ERROR: <application> not found in manifest.")
    sys.exit(1)

for activity in app.findall("activity"):
    is_main = any(
        any(
            action_el.get(a("name")) == "android.intent.action.MAIN"
            for action_el in intent_filter.findall("action")
        )
        for intent_filter in activity.findall("intent-filter")
    )
    if not is_main:
        continue

    # Ensure android:exported="true" (required on Android 12+)
    activity.set(a("exported"), "true")

    # Skip if we already patched this manifest
    existing_actions = {
        action_el.get(a("name"))
        for f in activity.findall("intent-filter")
        for action_el in f.findall("action")
    }
    if "android.intent.action.VIEW" in existing_actions:
        print("Manifest already patched — skipping.")
        sys.exit(0)

    # "Open with" — opens PDFs from file manager, email, etc.
    view_filter = sub(activity, "intent-filter", **{a("label"): "PDF Reader Pro"})
    sub(view_filter, "action",   **{a("name"): "android.intent.action.VIEW"})
    sub(view_filter, "category", **{a("name"): "android.intent.category.DEFAULT"})
    sub(view_filter, "category", **{a("name"): "android.intent.category.BROWSABLE"})
    sub(view_filter, "data",     **{a("mimeType"): "application/pdf"})

    # Share sheet — receives PDFs shared from other apps
    send_filter = sub(activity, "intent-filter", **{a("label"): "PDF Reader Pro"})
    sub(send_filter, "action",   **{a("name"): "android.intent.action.SEND"})
    sub(send_filter, "category", **{a("name"): "android.intent.category.DEFAULT"})
    sub(send_filter, "data",     **{a("mimeType"): "application/pdf"})

    break

tree.write(MANIFEST_PATH, xml_declaration=True, encoding="unicode")
print("AndroidManifest.xml patched successfully.")
