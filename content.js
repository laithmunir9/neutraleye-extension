chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getText") {
    const bodyText = document.body.innerText || "";
    sendResponse({ content: bodyText });
  }
});