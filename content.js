chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getText") {

    let bodyText = document.body.innerText || "";

    sendResponse({
      content: bodyText
    });
  }
});
