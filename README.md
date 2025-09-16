# Bias Checker – Chrome Extension (Frontend)

Bias Checker is a Chrome extension that helps users critically evaluate online content.  
When browsing an article or webpage, the extension extracts text, sends it to the backend API, and displays an analysis highlighting potential political or emotional bias, along with suggested alternative sources.

---

## Features
- Extracts article content, headline, author, and publication date from the current tab.
- Sends content securely to the backend API for analysis.
- Displays results directly in the extension popup (Markdown supported).
- User-friendly error messages for unsupported or restricted pages.
- Lightweight — only runs when the user clicks **Analyze**.

---

## Tech Stack
- **JavaScript** (content & popup scripts)
- **Manifest v3** (Chrome Extension)
- **Marked.js** (for Markdown rendering)

---

## Setup (Development)
1. Clone this repository and open the `frontend` folder.
2. In Chrome, go to `chrome://extensions/`.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the `frontend` folder.
5. The Bias Checker extension will appear in your toolbar.

---

## File Structure
frontend/
│── manifest.json # Chrome Extension config
│── popup.html # Popup UI
│── popup.js # Popup logic (API requests & UI)
│── content.js # Extracts text, author, date from active page
│── styles.css # Popup styling

yaml
Copy
Edit

---

## Permissions
- **activeTab** – Access page content only when the user clicks "Analyze".
- **scripting** – Injects `content.js` into the active tab to extract text.

---

## Privacy & Security
- No browsing history or personal data is collected.
- Only processes visible text from the current tab when explicitly activated.
- All analysis happens via a secure backend API (see backend README).

---

## Deployment
For publishing:
- Update version in `manifest.json`.
- Upload the extension to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## License
MIT License – Free to use and modify.
