---
name: gen-test
description: Use when adding a Vitest test for a pure helper function in popup.js or content.js — scaffolds a test that follows this repo's vm-context loading convention (tests/helpers/loadScript.js) instead of adding export statements or a bundler.
---

# Generating a test for a popup.js / content.js helper

## Why this isn't a normal Vitest setup

`popup.js` and `content.js` are loaded by Chrome as classic (non-module)
scripts — no `export`, no bundler. `tests/helpers/loadScript.js` runs the
real file in a jsdom `vm` context, so top-level `function` declarations show
up as `window.<name>`, exactly like a real browser tab. Tests reach helpers
through that `window` object. Don't add `export` statements to make a helper
"testable" — it isn't needed and changes how Chrome would load the file.

## Steps

1. **Confirm the helper is a top-level, pure(ish) function** in `popup.js` or
   `content.js` — not a closure-captured function inside `DOMContentLoaded`
   or another handler. If it's still inside a closure, hoist it to top-level
   first (see the existing hoist of `isTokenNearExpiry`, `isRestrictedUrl`,
   `isValidAnalysisResponse` in `popup.js` for the pattern — pull the
   function out, leave a call to it at the original call site, verify
   behavior is unchanged both by test and manually in the loaded extension).

2. **Pick the test file** — `tests/popup.test.js` for popup.js helpers,
   `tests/content.test.js` for content.js helpers. Add a new `describe`
   block; don't create a new test file per helper.

3. **Follow this template:**

```js
import { describe, it, expect } from "vitest";
import { loadScript } from "./helpers/loadScript.js";

const { window } = loadScript("popup.js"); // or "content.js"
const { yourHelperName } = window;

describe("yourHelperName", () => {
  it("does the expected thing for the normal case", () => {
    expect(yourHelperName(/* ... */)).toBe(/* ... */);
  });

  it("handles the edge case that motivated writing this test", () => {
    expect(yourHelperName(/* ... */)).toBe(/* ... */);
  });
});
```

   If the test file already calls `loadScript` at the top (both existing
   files do), reuse that `window` — don't call `loadScript` again.

4. **Chrome API dependencies:** if the helper touches `chrome.*`,
   `loadScript` accepts a `chrome` stub as its second argument
   (`{ chrome: {...} }`); see `makeChromeStub()` in `loadScript.js` for the
   default shape, and override only the methods your test needs.

5. **Run `npm run verify`** before considering the test done — the repo's
   full lint+test+manifest check, per the "Verify Loop" section of
   `CLAUDE.md`.
