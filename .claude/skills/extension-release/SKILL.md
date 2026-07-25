---
name: extension-release
description: Use when preparing a new Chrome Web Store release for the NeutralEye extension — bumping the manifest.json version, updating CHANGELOG.md, checking the store listing description length/copy, packaging the upload zip, or before publishing an update in the Chrome Web Store developer console.
---

# Extension Release (NeutralEye Chrome Extension)

## Overview

Checklist + commands for cutting a Chrome Web Store release of this extension.
No build step, no `package.json` version field — `manifest.json` is the single
source of truth for version, and the upload artifact is a plain zip of the
runtime files only.

## When to Use

- User asks to "release", "ship", "publish", or "bump the version" for the extension
- Before zipping anything for Chrome Web Store upload
- Any time `manifest.json`'s `version` field is about to change

## Steps

### 1. Pre-flight

Run the repo's verify loop first — don't start a release on red:

```bash
npm run verify   # lint && test && manifest sanity check
```

### 2. Bump the manifest version

`manifest.json` `version` is `major.minor.patch` (no `package.json` in this repo — manifest is authoritative).

- **Default: bump patch** (`1.1.0` → `1.1.1`) for any release unless the user
  explicitly says this is a minor (new feature) or major (breaking) change.
- Only bump minor/major when told so directly — don't infer it from the diff.

Bump with `sed`, not a JSON parse/dump round-trip — `json.dump` reflows the
*entire* file (escapes em dashes to `—`, expands arrays onto multiple
lines), turning a one-line version bump into a noisy diff across the whole
file. `sed` touches only the version string:

```bash
CURRENT=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
NEW=$(python3 -c "
major, minor, patch = (int(x) for x in '$CURRENT'.split('.'))
print(f'{major}.{minor}.{patch + 1}')
")
sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" manifest.json
git diff manifest.json   # confirm this is the ONLY line that changed
```

### 3. Update CHANGELOG.md

Add a new entry **above** the most recent one (newest-first), in this exact format:

```
## X.Y.Z — YYYY-MM-DD

- Bullet per user-visible change
```

Match the em dash and date format already used by the most recent dated
entries — don't introduce a new style. If asked what changed, derive bullets
from `git log` since the last version bump / tag, not from guessing.

### 4. Verify the store listing description

Chrome Web Store rejects the upload if `manifest.json`'s `description` exceeds
**132 characters**. Check the exact character count (not byte count — em
dashes and other multi-byte characters must be counted as 1 char each):

```bash
python3 -c "import json; d=json.load(open('manifest.json'))['description']; print(len(d), repr(d))"
```

Then check the copy itself:

- If the `neutraleye-copy-style` skill is available (check the skills list),
  invoke it and run the description against its full rule set.
- If that skill is **not** available, at minimum check these two rules manually:
  - **No em dashes (`—`)** in the description.
  - Use **"framing analysis"** language, not **"bias detection"** / "bias
    checker" framing — the product copy avoids clinical "bias" terminology in
    marketing copy in favor of neutral "framing" language.

Flag any violation to the user before packaging — don't silently rewrite the
description yourself.

### 5. Package the upload zip

This repo has no bundler and no build output — the zip is an explicit allowlist
of the runtime files (matches the "File Structure" list in `CLAUDE.md`), staged
in a clean temp directory so junk in the working tree (`.git`, `node_modules`,
`.DS_Store`, old zips, screenshots, dev tooling) can't leak in:

```bash
VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
STAGE=$(mktemp -d)/neutraleye-extension
mkdir -p "$STAGE"

cp manifest.json popup.html popup.js popup.css content.js background.js \
   marked.min.js purify.min.js icon16.png icon48.png icon128.png "$STAGE"/

(cd "$(dirname "$STAGE")" && zip -r "neutraleye-extension-v${VERSION}.zip" "$(basename "$STAGE")")
mv "$(dirname "$STAGE")/neutraleye-extension-v${VERSION}.zip" .

unzip -l "neutraleye-extension-v${VERSION}.zip"   # sanity-check contents before upload
```

If a new source file is added to the extension (new icon size, new vendored
lib, etc.), add it to the `cp` allowlist above **and** to the File Structure
list in `CLAUDE.md` — the two must stay in sync.

**Never include:** `.git`, `node_modules`, `.DS_Store`, `.claude`,
`.playwright-mcp`, `tests/`, `scripts/`, `package.json`/`package-lock.json`,
`eslint.config.js`, `README.md`, `CHANGELOG.md`, old `*.zip` files, `*.map`
source maps (none are shipped today — don't add any without a reason), or
stray screenshots/PNGs that aren't the three declared icons.

### 6. Trader declaration reminder

Before hitting publish in the Chrome Web Store developer console: **check
whether the trader declaration status needs review or re-confirmation** for
this listing. This is a manual console step outside this repo — just remind
the user, don't attempt it yourself.

## Quick Reference

| Step | Command / check |
|------|------------------|
| Verify loop | `npm run verify` |
| Bump version | edit `manifest.json` `version` (patch by default) |
| Changelog | new `## X.Y.Z — YYYY-MM-DD` entry, newest on top |
| Description length | `python3 -c "import json; print(len(json.load(open('manifest.json'))['description']))"` — must be ≤ 132 |
| Description copy | no em dashes; "framing analysis" not "bias detection"; prefer `neutraleye-copy-style` skill if present |
| Package | stage allowlisted files → `zip` → `unzip -l` to confirm contents |
| Before publish | remind user to check trader declaration status in CWS console |

## Common Mistakes

- Bumping the version via a JSON parse/dump round-trip instead of `sed` — it
  reflows the whole file (unicode escaping, array formatting) and buries the
  real change in noise. Use the `sed` one-liner above and confirm with
  `git diff` that only the version line changed.
- Bumping minor/major without being told — default is always patch.
- Zipping the working directory directly (`zip -r out.zip .`) — pulls in
  `.git`, `node_modules`, and other junk. Always stage an explicit allowlist.
- Forgetting the description character count includes multi-byte characters
  as 1 char each — don't use `wc -c` (byte count), use the Python `len()` check.
- Adding a CHANGELOG entry without a date, or in a different format than the
  existing entries.
- Rewriting the listing description yourself when a copy-style violation is
  found — flag it to the user instead.
