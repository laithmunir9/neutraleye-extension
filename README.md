# Bias Checker – Chrome Extension (Frontend)

Bias Checker is a Chrome extension that helps users critically evaluate online content.  
When browsing an article or webpage, the extension extracts text, sends it to the backend API, and displays an analysis highlighting potential political or emotional bias along with suggested alternative sources.

## Features

- Extracts article content, headline, author, and publication date from the current tab  
- Sends content securely to the backend API for analysis  
- Displays results directly in the extension popup (Markdown supported)  
- User friendly error messages for unsupported or restricted pages  
- Lightweight and only runs when the user clicks **Analyze**

## Tech Stack

- **JavaScript** (content and popup scripts)  
- **Manifest v3** (Chrome Extension)  
- **Marked.js** (Markdown rendering)

## Setup (Development)

1. Clone this repository and open the `frontend` folder  
2. Open Chrome and go to `chrome://extensions/`  
3. Enable **Developer Mode**  
4. Click **Load unpacked** and select the `frontend` folder  
5. The Bias Checker extension will appear in your toolbar  

## File Structure

frontend/
│── manifest.json
│── popup.html
│── popup.js
│── content.js
│── styles.css


## Development Workflow

### Making changes

1. Edit files in VS Code  
2. Go to `chrome://extensions/`  
3. Click **Reload** on the extension  
4. Test changes in Chrome  

### Optional GitHub backup

git add .
git commit -m "Describe the change"
git push


## Privacy & Security

- No browsing history or personal data is collected  
- Only processes visible text when activated  
- All analysis happens through a secure backend API  

## Deployment

1. Update version in `manifest.json`  
2. Upload to Chrome Web Store Developer Dashboard  

## License

MIT License – Free to use and modify  
