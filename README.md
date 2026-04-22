# NeutralEye — Chrome Extension

## Overview
The NeutralEye Extension allows users to analyze bias directly while browsing articles in Chrome.

## Role in the System
This repository handles the browser-side experience, including content extraction and result display.  
It communicates with the Extension Backend for analysis.

## How It Works
- User clicks “Analyze” in the extension popup
- The extension extracts visible page content
- Content is sent to the backend API
- Results are returned and displayed in the popup

## Tech Stack
- JavaScript
- Chrome Extension (Manifest V3)
- Marked.js

## Setup
1. Open Chrome and go to `chrome://extensions/`
2. Enable Developer Mode
3. Click “Load unpacked”
4. Select this folder

## Development Workflow
- Edit files
- Reload extension in Chrome
- Test on live pages

## Notes
- Runs only when user activates it
- Does not track browsing activity
- Only processes visible content