// content.js
// Extracts the most likely "article text" from the current page + lightweight metadata.

function getMetaContent(selector) {
  const el = document.querySelector(selector);
  const val = el?.getAttribute("content") || "";
  return (val || "").trim();
}

function cleanText(str) {
  if (!str) return "";
  return String(str)
    .replace(/\u00A0/g, " ")       // non-breaking spaces
    .replace(/[ \t]+\n/g, "\n")    // trailing spaces before newline
    .replace(/\n{3,}/g, "\n\n")    // collapse excessive newlines
    .trim();
}

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  // If element has no size and no text, likely not useful
  if (el.offsetWidth === 0 && el.offsetHeight === 0 && !el.innerText?.trim()) return false;
  return true;
}

function scoreContainer(el) {
  // Higher score = more likely to be the main article container
  if (!el || !isVisible(el)) return -Infinity;

  const text = (el.innerText || "").trim();
  if (text.length < 400) return -Infinity;

  // Count “article-like” signals
  const pCount = el.querySelectorAll("p").length;
  const liCount = el.querySelectorAll("li").length;

  // Penalize nav/aside/footer-like areas
  const badSelectors = ["nav", "aside", "footer", "header", "[role='navigation']"];
  let badDescendants = 0;
  badSelectors.forEach((sel) => (badDescendants += el.querySelectorAll(sel).length));

  // Simple heuristic score
  return text.length + pCount * 250 + liCount * 50 - badDescendants * 800;
}

function pickBestContainer() {
  // Prefer semantic containers first
  const candidates = [];

  const primarySelectors = [
    "article",
    "main",
    "[role='main']",
    ".article",
    ".post",
    ".entry-content",
    ".content",
    "#content",
    "#main"
  ];

  primarySelectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => candidates.push(el));
  });

  // Fallback to common readable blocks
  if (candidates.length === 0) {
    document.querySelectorAll("div, section").forEach((el) => candidates.push(el));
  }

  let best = null;
  let bestScore = -Infinity;

  for (const el of candidates) {
    const s = scoreContainer(el);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  }

  return best;
}

function extractFromContainer(container) {
  if (!container) return "";

  // Work on a clone so we never mutate the live page DOM
  container = container.cloneNode(true);

  // Remove obviously irrelevant blocks inside the container
  const removeSelectors = [
    "nav",
    "aside",
    "footer",
    "header",
    "form",
    "button",
    "noscript",
    "script",
    "style",
    "[role='navigation']",
    ".subscribe",
    ".newsletter",
    ".advert",
    ".ad",
    ".ads",
    ".promo",
    ".related",
    ".comments",
    "#comments",
    '[class*="comment"]',
    '[id*="comment"]',
    '[class*="viafoura"]',
    '[id*="viafoura"]',
    '[class*="vf-"]',
    '[id*="vf-"]',
    "figcaption",
    "figure",
    "picture",
    '[class*="byline"]',
    '[class*="author"]',
    "[rel='author']",
    '[class*="credit"]',
    '[class*="caption"]',
    '[class*="dateline"]'
  ];

  removeSelectors.forEach((sel) => {
    container.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // Prefer paragraphs; if none, fallback to container text
  const paragraphs = Array.from(container.querySelectorAll("p"))
    .map((p) => cleanText(p.innerText))
    .filter((t) => t.length >= 40); // drop short junk lines

  let text = "";
  if (paragraphs.length >= 3) {
    text = paragraphs.join("\n\n");
  } else {
    text = cleanText(container.innerText || "");
  }

  return text;
}

function extractMetadata() {
  // Headline: prefer <h1>, otherwise og:title, otherwise document.title
  const h1 = cleanText(document.querySelector("h1")?.innerText || "");
  const ogTitle = getMetaContent("meta[property='og:title']");
  const metaTitle = getMetaContent("meta[name='title']");
  const title = h1 || ogTitle || metaTitle || cleanText(document.title || "");

  // Author: common meta tags
  const author =
    getMetaContent("meta[name='author']") ||
    getMetaContent("meta[property='article:author']") ||
    getMetaContent("meta[name='byl']");

  // Date: common meta tags
  const date =
    getMetaContent("meta[property='article:published_time']") ||
    getMetaContent("meta[name='pubdate']") ||
    getMetaContent("meta[name='publish-date']") ||
    getMetaContent("meta[name='date']") ||
    "";

  return { headline: title, author: author || "", date: date || "" };
}

function clampText(text, maxChars = 100000) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}

function extractArticleText() {
  const best = pickBestContainer();
  const text = extractFromContainer(best);

  // If still weak, fallback to body text but try to keep it sane
  if (!text || text.length < 400) {
    const fallback = cleanText(document.body?.innerText || "");
    return clampText(fallback, 100000);
  }

  return clampText(text, 100000);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getText") {
    const content = extractArticleText();
    const meta = extractMetadata();

    sendResponse({
      content,
      headline: meta.headline,
      author: meta.author,
      date: meta.date
    });
  }
});