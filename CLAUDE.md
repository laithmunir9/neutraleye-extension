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
icon16/48/128.png  # Extension icons
```

---

## How It Works

```
User clicks extension
  → popup.js opens
  → popup.js sends message to content.js
  → content.js extracts article text from the active tab's DOM
  → content.js returns text to popup.js
  → popup.js POSTs to /api/extension on neutraleye-web (Vercel)
  → API runs OpenAI analysis, returns { result: "<markdown>" }
  → popup.js renders markdown via marked.parse()
```

---

## Backend Communication

All API calls go to the `neutraleye-web` Vercel deployment — there is no separate extension backend.

**API base URL:** `https://tryneutraleye.com` (constant at top of `popup.js`)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/extension` | Bias analysis — sends `{ text, headline, url }`, receives `{ result, saved }` |
| `POST /api/extension-auth` | Login — sends `{ email, password }`, receives `{ accessToken, refreshToken, email, expiresAt }` |

- Authenticated requests send `Authorization: Bearer <accessToken>` header
- The API returns markdown in `result` — rendered via `marked.parse()`
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

- Tokens are stored in `chrome.storage.local`
- On popup open, `popup.js` checks for a stored token and resolves the user
- On sign in: email + password → `/api/extension-auth` → store tokens → show logged-in state
- On sign out: clear tokens from storage → show logged-out state
- Authenticated users get cloud history saving and a shared 10/day usage limit
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
- Does not store or log article text beyond passing it to popup.js
- **Text cap: 100,000 characters** (`clampText` in `content.js`) — raised from 15K to match `MAX_ANALYSIS_TEXT_LENGTH` in the API so both paths analyse the same amount of text

---

## Design

- Warm brown primary: `#8b6741` (hover: `#6e4f2f`) — Analyze button colour
- Off-white text/background: `#f8f4ee`
- Sign in button: dark (`#222`, hover `#444`) — uses `.btn-primary` class
- Cancel button: plain underlined text in black — uses `.link-btn.link-btn--dark` classes
- Font: system UI stack (`Segoe UI`, Tahoma, etc.)
- Must stay visually consistent with the neutraleye-web design system

---

## Ask Before Doing

- Adding or changing any `manifest.json` permissions
- Changing how popup.js and content.js communicate
- Changing the request payload shape sent to the API
- Adding new JS files or introducing a build step
- Changing the API base URL constant
