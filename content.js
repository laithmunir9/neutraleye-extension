chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getText") {
    let bodyText = document.body.innerText || "";

    // Try to grab headline
    let headline = "";
    const h1 = document.querySelector("h1");
    if (h1) headline = h1.innerText.trim();
    else if (document.title) headline = document.title.trim();

    // Try to grab author
    let author = "";
    const authorSelectors = [
      "[rel=author]",
      ".author",
      ".byline",
      ".by",
      ".writer",
      ".contributor"
    ];
    for (let sel of authorSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        author = el.innerText.trim();
        break;
      }
    }
    // Fallback: detect "By John Doe"
    const bylineMatch = bodyText.match(/^\s*By\s+([A-Z][a-z]+\s+[A-Z][a-z]+.*)$/m);
    if (!author && bylineMatch) author = bylineMatch[1].trim();

    // Try to grab date
    let dateText = "";
    const dateSelectors = [
      "time",
      ".date",
      ".published",
      ".publish-date",
      "[itemprop=datePublished]"
    ];
    for (let sel of dateSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        dateText = el.innerText.trim();
        break;
      }
    }

    sendResponse({
      content: bodyText,
      headline,
      author,
      date: dateText
    });
  }
});
