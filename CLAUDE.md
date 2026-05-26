# NeutralEye – Chrome Extension (neutraleye-extension)

## What This Repo Does

The Chrome extension frontend for NeutralEye. Users click the extension on any
news article to get a political bias analysis. The extension extracts the article
text and sends it to the NeutralEye backend, which calls OpenAI and returns the
analysis for display.

**Published on:** Chrome Web Store
**Companion repo:** `neutraleye-extension-backend` (Node.js server on Render)

---

## File Structure

```
manifest.json    ← extension config, permissions declared here
popup.js         ← UI logic, calls backend via fetch, renders results
popup.css        ← popup styles
popup.html       ← popup markup
content.js       ← content script, runs in page context, extracts article text
```

---

## How the Three Files Work Together

```
User clicks extension
  → popup.js opens
  → popup.js sends message to content.js
  → content.js extracts article text from the active tab's DOM
  → content.js returns text to popup.js
  → popup.js POSTs text to backend
  → backend returns bias analysis JSON
  → popup.js renders results in popup UI
```

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

---

## Code Conventions

- Plain JavaScript (no TypeScript, no bundler)
- **popup.js** — UI and orchestration only; no direct OpenAI calls ever
- **content.js** — DOM extraction only; keep it focused, no UI logic
- CSS classes: kebab-case (`bias-level`, `source-card`)
- JS variables/functions: camelCase
- Errors must be caught and shown in the popup UI — never silently fail
- Keep the popup lightweight — this is not a SPA

---

## Content Script Notes (content.js)

- Runs in the page context of the active tab
- Communicates with popup.js via `chrome.runtime.sendMessage` / `onMessage`
- Should extract article body text as cleanly as possible (strip nav, ads, footers)
- Do not store or log article text beyond passing it to popup.js

---

## Backend Communication

- popup.js calls the NeutralEye backend via `fetch` (URL stored as a constant)
- The backend is on Render free tier — expect ~30s cold start after idle periods
- Account for this in loading states and timeout handling
- Never call OpenAI directly from the extension

---

## Ask Before Doing

- Adding or changing any `manifest.json` permissions
- Changing how popup.js and content.js communicate
- Changing the payload shape sent to the backend
- Adding new JS files or a build step
