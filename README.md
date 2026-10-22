# NeutralEye Chrome extension

NeutralEye helps readers examine how an article frames a story through its tone, sourcing, emphasis, and omissions. This repository contains the Chrome extension. The companion [web application and analysis API](https://github.com/laithmunir9/neutraleye-web) power its results.

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/neutraleye/fdkachmcdaebefhpkpjapoglbiakoffe) · [Use the web app](https://tryneutraleye.com)

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

## Third-party assets

- [Marked 15.0.12](marked.min.js) is MIT licensed; its full license is in [licenses/marked-LICENSE.md](licenses/marked-LICENSE.md).
- [DOMPurify 3.4.10](purify.min.js) is dual licensed under [Apache 2.0](licenses/DOMPurify-LICENSE) and [MPL 2.0](licenses/DOMPurify-LICENSE-MPL).
- [Source Serif 4](fonts/SourceSerif4-latin.woff2) is licensed under the SIL Open Font License 1.1; its license is in [fonts/OFL.txt](fonts/OFL.txt).

Include these license files with packaged copies of the extension.
