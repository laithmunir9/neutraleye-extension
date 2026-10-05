# NeutralEye Chrome extension

NeutralEye helps readers examine how an article frames a story through its tone, sourcing, emphasis, and omissions. This repository contains the Chrome extension. The companion [web application and analysis API](https://github.com/laithmunir9/neutraleye-web) power its results.

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/neutraleye-bias-checker/fdkachmcdaebefhpkpjapoglbiakoffe) · [Use the web app](https://tryneutraleye.com)

## How it works

1. Open an article and choose **Analyze** in the extension popup.
2. The extension extracts readable text and basic article metadata from the active tab.
3. It sends that content to the NeutralEye web API and displays a framing analysis with quoted evidence and suggested sources for cross-reading.

Analysis works without an account. You can sign in with a NeutralEye account; signed-in analyses may be saved to that account by the web service. The extension does not analyze pages in the background. Its `activeTab` and `scripting` permissions let it read the current page when you start an analysis, and `storage` keeps your sign-in session on your device.

## Run locally

1. In Chrome, open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository's directory.
3. Open an article, select the NeutralEye icon, and choose **Analyze**.

The unpacked extension uses `https://tryneutraleye.com` for its API. It does not include an API key or a local backend. After changing extension files, reload it on `chrome://extensions`.

## Development

This is a Manifest V3 extension written in plain JavaScript. `content.js` extracts article text; `popup.js` handles sign-in, requests, and rendering. The popup sanitizes the returned Markdown before displaying it.

```bash
npm ci
npm run verify
```

`verify` runs lint, tests, and manifest validation. See [CHANGELOG.md](CHANGELOG.md) for release notes and the [extension privacy policy](https://tryneutraleye.com/extension-privacy) for data handling.
