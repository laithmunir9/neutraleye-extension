import { describe, it, expect } from "vitest";
import { loadScript } from "./helpers/loadScript.js";

function load(html) {
  return loadScript("content.js", { html }).window;
}

describe("cleanText", () => {
  it("normalizes non-breaking spaces, trailing whitespace, and excess blank lines", () => {
    const { cleanText } = load();
    const input = "Hello world  \n\n\n\nMore text  \n";
    expect(cleanText(input)).toBe("Hello world\n\nMore text");
  });

  it("returns empty string for falsy input", () => {
    const { cleanText } = load();
    expect(cleanText("")).toBe("");
    expect(cleanText(null)).toBe("");
  });
});

describe("clampText", () => {
  it("leaves short text untouched", () => {
    const { clampText } = load();
    expect(clampText("short text", 100000)).toBe("short text");
  });

  it("truncates and appends ellipsis when over the cap", () => {
    const { clampText } = load();
    const long = "a".repeat(100010);
    const result = clampText(long, 100000);
    expect(result.length).toBe(100003); // 100000 chars + "..."
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("scoreContainer", () => {
  it("scores an article-like container higher than a nav-heavy one", () => {
    const paragraph = `<p>${"Lorem ipsum dolor sit amet. ".repeat(20)}</p>`;
    const html = `
      <!doctype html><html><body>
        <article id="good">${paragraph.repeat(3)}</article>
        <div id="bad">
          <nav>${"link ".repeat(50)}</nav>
          <aside>${"sidebar ".repeat(50)}</aside>
          ${paragraph}
        </div>
      </body></html>
    `;
    const { document, scoreContainer } = load(html);
    const good = scoreContainer(document.getElementById("good"));
    const bad = scoreContainer(document.getElementById("bad"));
    expect(good).toBeGreaterThan(bad);
  });

  it("rejects containers with too little text", () => {
    const { document, scoreContainer } = load(`<!doctype html><html><body><div id="short"><p>Too short.</p></div></body></html>`);
    expect(scoreContainer(document.getElementById("short"))).toBe(-Infinity);
  });
});

describe("extractMetadata", () => {
  it("prefers h1 over og:title, meta title, and document.title", () => {
    const html = `
      <!doctype html><html><head>
        <title>Doc Title</title>
        <meta name="title" content="Meta Title" />
        <meta property="og:title" content="OG Title" />
      </head><body><h1>H1 Headline</h1></body></html>
    `;
    const { extractMetadata } = load(html);
    expect(extractMetadata().headline).toBe("H1 Headline");
  });

  it("falls back through og:title, meta title, then document.title when h1 is missing", () => {
    const withOgTitle = load(`
      <!doctype html><html><head>
        <title>Doc Title</title>
        <meta name="title" content="Meta Title" />
        <meta property="og:title" content="OG Title" />
      </head><body></body></html>
    `).extractMetadata();
    expect(withOgTitle.headline).toBe("OG Title");

    const withMetaTitleOnly = load(`
      <!doctype html><html><head>
        <title>Doc Title</title>
        <meta name="title" content="Meta Title" />
      </head><body></body></html>
    `).extractMetadata();
    expect(withMetaTitleOnly.headline).toBe("Meta Title");

    const docTitleOnly = load(`<!doctype html><html><head><title>Doc Title</title></head><body></body></html>`).extractMetadata();
    expect(docTitleOnly.headline).toBe("Doc Title");
  });
});
