# CLAUDE.md — NeutralEye Extension

This file is the source of truth for Claude Code when working on the NeutralEye Chrome extension.
Read this before touching any code.

---

## What This Repo Does

The Chrome extension frontend for NeutralEye. Users click the extension on any news article to get a bias analysis. The extension extracts the article text and sends it to the NeutralEye web API, which runs the OpenAI analysis and returns the result for display.

**Companion repo:** `neutraleye-web` — hosts all API routes the extension calls (deployed on Vercel).

---

## File Structure

```
manifest.json      # Extension config, permissions declared here
popup.html         # Popup markup
popup.js           # UI logic, auth, API calls, result rendering
popup.css          # Popup styles
content.js         # Content script — extracts article text from page DOM
background.js      # Service worker stub (minimal)
marked.min.js      # Markdown parser (renders API response)
purify.min.js      # DOMPurify — sanitizes rendered HTML before injection
icon16/48/128.png  # Extension icons
fonts/SourceSerif4-latin.woff2  # Source Serif 4 (OFL), latin subset, variable weight 400-700; bundled so the popup matches the site
```

---

## How It Works

```
User clicks extension
  → popup.js opens
  → if token near expiry: silently refresh via /api/extension-refresh
  → popup.js sends message to content.js
  → content.js extracts article text from the active tab's DOM
  → content.js returns text to popup.js
  → popup.js POSTs to /api/extension (with Bearer token if signed in)
  → API runs OpenAI analysis, returns { result, saved, tokenExpired }
  → popup.js renders markdown via marked.parse()
  → if tokenExpired: clear storage, show logged-out state
```

---

## Backend Communication

All API calls go to the `neutraleye-web` Vercel deployment — there is no separate extension backend.

**API base URL:** `https://tryneutraleye.com` (constant at top of `popup.js`)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/extension` | Bias analysis — sends `{ text, headline, url }`, receives `{ result, saved, tokenExpired }` |
| `POST /api/extension-auth` | Login — sends `{ email, password }`, receives `{ accessToken, refreshToken, email, expiresAt }` |
| `POST /api/extension-refresh` | Token refresh — sends `{ refreshToken }`, receives `{ accessToken, refreshToken, email, expiresAt }` or 401 |

- Authenticated requests send `Authorization: Bearer <accessToken>` header
- The API returns markdown in `result` — rendered via `marked.parse()`
- `saved: true` means the analysis was stored to the user's account. Since 1.1.4 the popup does not mention it: the website no longer has a history page, so promising history would be promising something nobody can see. Saving continues server-side so a history page can come back without losing data.
- `tokenExpired: true` means the Bearer token was rejected server-side — clear `chrome.storage.local` and call `showLoggedOut()`
- **Sign in** is supported in the extension popup; **sign up** is website-only
- The `url` field is always sent so the API can exclude the source outlet from suggested sources

---

## API Response Handling — Critical

Always check `res.ok` before reading `data.result`. A non-2xx response returns `{ error, code }` not `{ result }` — reading `data.result` on an error response gives `undefined`, which `marked.parse()` silently renders as blank. Pattern:

```js
const data = await res.json();
if (!res.ok || !data.result) {
  // show error message
  return;
}
const html = marked.parse(data.result);
```

---

## Auth Flow

- Tokens stored in `chrome.storage.local`: `{ accessToken, refreshToken, userEmail, expiresAt }` where `expiresAt` is a Unix timestamp in seconds (from Supabase session)
- **On popup open:** check `expiresAt` — if within 5 minutes of expiry, silently call `/api/extension-refresh` to get new tokens and update storage before any analysis
- **On sign in:** email + password → `/api/extension-auth` → store tokens → show logged-in state
- **On sign out:** remove all four keys from `chrome.storage.local` → show logged-out state
- **On `tokenExpired: true` response:** clear storage, call `showLoggedOut()` — the server rejected the token
- **Sign in link:** `showLoggedOut()` shows a plain "Sign in" link (`#sign-in-link`) beside Analyze. Clicking it shows the login form; cancelling brings the link back. (Before 1.1.4 this read "Sign in to save history →".)
- Authenticated users get a shared 10/day usage limit, and their reads are saved to their account
- Anonymous users get an IP-based rate limit (5 req/min)

---

## Permission Model — Do Not Change

The extension uses **`activeTab` only** — not `<all_urls>` or broad host permissions.
This is a deliberate privacy decision and a key trust signal to users. Do not suggest
switching to broader permissions. All DOM access happens through the activeTab grant
at click time.

---

## Loading the Extension Locally

No build step. Load unpacked directly:

```
chrome://extensions → Enable Developer mode → Load unpacked → select this folder
```

To test: navigate to any news article, click the NeutralEye icon.

After editing any file, reload the extension at `chrome://extensions` for changes to take effect.

---

## Verify Loop

`npm run verify` runs lint, tests, and a manifest sanity check — modeled on the
same verify loop used in `neutraleye-web`. Run it before considering any change done:

```
npm run verify   # = npm run lint && npm run test && npm run build
```

- **`npm run lint`** — ESLint over `popup.js`, `content.js`, `background.js`,
  `scripts/**/*.mjs`, and `tests/**/*.js` (config in `eslint.config.js`).
  `marked.min.js` and `purify.min.js` are excluded (vendored, unminified rules don't apply).
- **`npm run test`** — Vitest. Tests load `popup.js`/`content.js` as classic
  (non-module) scripts into a jsdom `vm` context via `tests/helpers/loadScript.js`,
  so top-level `function` declarations become reachable as `window.<name>` —
  exactly how Chrome exposes them in a real popup — without adding `export`
  statements or changing how the files are loaded.
- **`npm run build`** — this repo has no bundler, so `scripts/validate-manifest.mjs`
  stands in for the build leg: confirms `manifest.json` is valid MV3 and every
  file it references (service worker, popup, icons, content scripts) actually exists.

**popup.js hoist:** `isTokenNearExpiry`, `isRestrictedUrl`, `isValidAnalysisResponse` and `markEvidence`
are pulled out of the `DOMContentLoaded` closure to top-level functions so tests can
reach them directly through the `vm` context, per above. Behavior at the original three call
sites (silent token refresh, restricted-page guard, API response validation) is
unchanged — verified manually in the loaded extension, not just by the new unit tests.

---

## Code Conventions

- Plain JavaScript — no TypeScript, no bundler, no build step
- **popup.js** — UI, auth, and API orchestration only; no direct OpenAI calls ever
- **content.js** — DOM extraction only; no UI logic
- CSS classes: kebab-case (`bias-level`, `source-card`)
- JS variables/functions: camelCase
- Errors must be caught and shown in the popup UI — never silently fail
- Keep the popup lightweight — this is not a SPA

---

## Content Script Notes

- Runs in the page context of the active tab
- Communicates with popup.js via `chrome.runtime.sendMessage` / `onMessage`
- Extracts article body text as cleanly as possible (strips nav, ads, footers)
- Works on a cloned container — never mutates the live page DOM
- Does not store or log article text beyond passing it to popup.js
- **Text cap: 100,000 characters** (`clampText` in `content.js`) — raised from 15K to match `MAX_ANALYSIS_TEXT_LENGTH` in the API so both paths analyse the same amount of text

---

## Design

Matches the neutraleye-web homepage (October 2026). Tokens at the top of `popup.css` mirror `--fc-*` in the web repo's `globals.css`.

- Font: Source Serif 4, bundled in `fonts/` (no network fetch from the popup)
- Paper background `#f4f5f5`; the login form and the result sit on white sheets with a soft shadow
- Ink for every control: Analyze and Sign in are `#0d0f10` (hover `#2c3235`); text links are underlined ink
- The teal accent `#0e5a5e` (tint `#e5f0f0`) is reserved for the evidence mark. `markEvidence()` in `popup.js` turns each `"quote": reason` item under the **Examples** heading into a `<mark class="annotation">` plus a note, built with DOM nodes and `textContent` only. The mark must stay inline (the list item is `display: block`, not grid) or a wrapped quote becomes one tinted rectangle
- Section labels (FRAMING, SUMMARY...) are small tracked caps in muted ink, the one place the site allows them
- Must stay visually consistent with the neutraleye-web design system

---

## Chrome Web Store Constraints

- `manifest.json` description has a **132-character limit** — Chrome Web Store rejects the upload if exceeded
- Version must be bumped in `manifest.json` for each new upload (no `package.json` in this repo)

---

## Ask Before Doing

- Adding or changing any `manifest.json` permissions
- Changing how popup.js and content.js communicate
- Changing the request payload shape sent to the API
- Adding new JS files or introducing a build step
- Changing the API base URL constant
