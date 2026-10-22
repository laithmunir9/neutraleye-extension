import { describe, it, expect } from "vitest";
import { loadScript, makeChromeStub } from "./helpers/loadScript.js";

const { window } = loadScript("popup.js");
const { isTokenNearExpiry, isRestrictedUrl, isValidAnalysisResponse, classifyRefreshResponse, markEvidence } = window;

describe("isTokenNearExpiry", () => {
  it("is false when expiry is far in the future", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60; // +1 hour
    expect(isTokenNearExpiry(expiresAt)).toBe(false);
  });

  it("is true when within the 5-minute refresh window", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60; // +1 minute
    expect(isTokenNearExpiry(expiresAt)).toBe(true);
  });

  it("is true when already expired", () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 60; // -1 minute
    expect(isTokenNearExpiry(expiresAt)).toBe(true);
  });

  it("is false when expiresAt is missing", () => {
    expect(isTokenNearExpiry(undefined)).toBe(false);
    expect(isTokenNearExpiry(0)).toBe(false);
  });
});

describe("isRestrictedUrl", () => {
  it("blocks internal/restricted browser pages", () => {
    expect(isRestrictedUrl("chrome://extensions")).toBe(true);
    expect(isRestrictedUrl("chrome-extension://abc123/popup.html")).toBe(true);
    expect(isRestrictedUrl("edge://settings")).toBe(true);
    expect(isRestrictedUrl("about:blank")).toBe(true);
    expect(isRestrictedUrl("file:///Users/me/notes.txt")).toBe(true);
    expect(isRestrictedUrl("https://chrome.google.com/webstore/detail/x")).toBe(true);
  });

  it("allows real article URLs", () => {
    expect(isRestrictedUrl("https://example.com/news/some-article")).toBe(false);
    expect(isRestrictedUrl("http://example.com/blog/post")).toBe(false);
  });
});

describe("isValidAnalysisResponse", () => {
  it("is true when ok and result is present", () => {
    expect(isValidAnalysisResponse({ ok: true }, { result: "## Framing analysis" })).toBe(true);
  });

  it("is false when the response is not ok", () => {
    expect(isValidAnalysisResponse({ ok: false }, { result: "shouldn't matter" })).toBe(false);
  });

  it("is false when ok but result is missing (the silent-blank-render bug)", () => {
    expect(isValidAnalysisResponse({ ok: true }, {})).toBe(false);
    expect(isValidAnalysisResponse({ ok: true }, { error: "oops" })).toBe(false);
  });
});

// ── Token refresh ───────────────────────────────────────────────────────────
// The bug these cover: every refresh failure used to collapse into one null
// signal that wiped the stored session, so a 500 or a dropped connection signed
// the user out exactly like a revoked token did.

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function withFetch(impl) {
  const { window } = loadScript("popup.js");
  window.fetch = impl;
  return window;
}

describe("classifyRefreshResponse", () => {
  it("is ok only when the server returns a usable access token", () => {
    expect(classifyRefreshResponse(makeResponse(200, {}), { accessToken: "new-token" })).toBe("ok");
  });

  it("is dead on 401 — the refresh token itself is finished", () => {
    expect(classifyRefreshResponse(makeResponse(401, {}), { error: "Session expired." })).toBe("dead");
  });

  it("is retry on AUTH_UNAVAILABLE (503) — the backend is down, not the token", () => {
    expect(classifyRefreshResponse(makeResponse(503, {}), { code: "AUTH_UNAVAILABLE" })).toBe("retry");
  });

  it("is retry on any other 5xx", () => {
    expect(classifyRefreshResponse(makeResponse(500, {}), {})).toBe("retry");
    expect(classifyRefreshResponse(makeResponse(502, {}), {})).toBe("retry");
  });

  it("is retry on a malformed 200 that carries no token", () => {
    expect(classifyRefreshResponse(makeResponse(200, {}), {})).toBe("retry");
  });
});

describe("tryRefreshToken", () => {
  it("returns the new tokens on success", async () => {
    const window = withFetch(async () =>
      makeResponse(200, { accessToken: "new-token", refreshToken: "new-refresh", email: "a@b.com", expiresAt: 123 })
    );
    const { outcome, tokens } = await window.tryRefreshToken("stored-refresh", "https://api.test");
    expect(outcome).toBe("ok");
    expect(tokens.accessToken).toBe("new-token");
  });

  it("reports retry when fetch throws (offline / dropped connection)", async () => {
    const window = withFetch(async () => { throw new TypeError("Failed to fetch"); });
    const { outcome } = await window.tryRefreshToken("stored-refresh", "https://api.test");
    expect(outcome).toBe("retry");
  });

  it("reports retry when the server returns 503 AUTH_UNAVAILABLE", async () => {
    const window = withFetch(async () => makeResponse(503, { code: "AUTH_UNAVAILABLE" }));
    const { outcome } = await window.tryRefreshToken("stored-refresh", "https://api.test");
    expect(outcome).toBe("retry");
  });

  it("reports dead on 401", async () => {
    const window = withFetch(async () => makeResponse(401, { error: "Session expired." }));
    const { outcome } = await window.tryRefreshToken("stored-refresh", "https://api.test");
    expect(outcome).toBe("dead");
  });

  it("reports retry when the error body is not JSON", async () => {
    const window = withFetch(async () => ({
      ok: false,
      status: 500,
      json: async () => { throw new SyntaxError("Unexpected token < in JSON"); },
    }));
    const { outcome } = await window.tryRefreshToken("stored-refresh", "https://api.test");
    expect(outcome).toBe("retry");
  });
});

// The wipe path itself: run popup.js's real startup against popup.html with a
// near-expiry session in storage, and check what actually happens to storage.
const AUTH_KEYS = ["accessToken", "refreshToken", "userEmail", "expiresAt"];

async function runStartup(fetchImpl) {
  const stored = {
    accessToken: "stored-access",
    refreshToken: "stored-refresh",
    userEmail: "user@example.com",
    expiresAt: Math.floor(Date.now() / 1000) + 60, // inside the 5-minute refresh window
  };
  const removed = [];
  const saved = [];
  const chrome = {
    ...makeChromeStub(),
    storage: {
      local: {
        get(_keys, cb) { cb({ ...stored }); },
        set(values) { saved.push(values); },
        remove(keys) { removed.push(keys); },
      },
    },
  };

  const { window, document } = loadScript("popup.js", {
    htmlFile: "popup.html",
    chrome,
    fireDOMContentLoaded: true,
  });
  window.fetch = fetchImpl;
  document.dispatchEvent(new window.Event("DOMContentLoaded"));

  // Let the async bootstrap (storage read → refresh fetch → UI update) settle.
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));

  const wiped = removed.some((keys) => AUTH_KEYS.every((k) => keys.includes(k)));
  return {
    wiped,
    saved,
    signedOut: document.getElementById("sign-in-link").style.display === "inline",
    signedInAs: document.getElementById("user-email-display").textContent,
  };
}

describe("startup refresh — storage wipe path", () => {
  it("wipes the session and signs out when the refresh token is dead (401)", async () => {
    const state = await runStartup(async () => makeResponse(401, { error: "Session expired." }));
    expect(state.wiped).toBe(true);
    expect(state.signedOut).toBe(true);
  });

  it("keeps the session signed in when the auth backend is unavailable (503)", async () => {
    const state = await runStartup(async () => makeResponse(503, { code: "AUTH_UNAVAILABLE" }));
    expect(state.wiped).toBe(false);
    expect(state.signedOut).toBe(false);
    expect(state.signedInAs).toBe("user@example.com");
  });

  it("keeps the session signed in when the refresh request throws", async () => {
    const state = await runStartup(async () => { throw new TypeError("Failed to fetch"); });
    expect(state.wiped).toBe(false);
    expect(state.signedInAs).toBe("user@example.com");
  });

  it("keeps the session signed in on a 500", async () => {
    const state = await runStartup(async () => makeResponse(500, {}));
    expect(state.wiped).toBe(false);
    expect(state.signedInAs).toBe("user@example.com");
  });

  it("stores the new tokens on a successful refresh", async () => {
    const state = await runStartup(async () =>
      makeResponse(200, {
        accessToken: "fresh-access",
        refreshToken: "fresh-refresh",
        email: "user@example.com",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    expect(state.wiped).toBe(false);
    expect(state.saved.at(-1).accessToken).toBe("fresh-access");
    expect(state.signedInAs).toBe("user@example.com");
  });
});

// The exact HTML marked.min.js produces for the API's markdown (checked by
// running the vendored parser on a real result).
const RENDERED = `<p><strong>Framing</strong>
Moderate framing.</p>
<p><strong>Examples</strong></p>
<ul>
<li>&quot;The council rammed through its bloated budget&quot;: language</li>
<li>&quot;Critics were brushed aside&quot;: framing</li>
<li>Something that is not a quote</li>
</ul>
<p><strong>Recommendations</strong></p>
<ul>
<li>&quot;Read the full statement&quot;: compare</li>
</ul>`;

describe("markEvidence", () => {
  function render(html) {
    const box = window.document.createElement("div");
    box.innerHTML = html;
    return box;
  }

  it("draws each quoted passage as a mark with its reason as a note", () => {
    const box = render(RENDERED);
    expect(markEvidence(box)).toBe(2);
    const marks = box.querySelectorAll("mark.annotation");
    expect([...marks].map((m) => m.textContent)).toEqual([
      "The council rammed through its bloated budget",
      "Critics were brushed aside",
    ]);
    const labels = [...box.querySelectorAll(".evidence-note .evidence-label")].map((n) => n.textContent);
    expect(labels).toEqual(["Loaded wording", "Framing"]);
  });

  it("explains each reason in the same words the website uses", () => {
    const box = render(RENDERED);
    markEvidence(box);
    const explanations = [...box.querySelectorAll(".evidence-note .evidence-explanation")].map((n) => n.textContent);
    expect(explanations).toEqual([
      "Loaded or emotive wording shifts how the claim is perceived.",
      "Selective emphasis or omission changes the reader's interpretation.",
    ]);
  });

  it("keeps an unrecognised reason as its label, with no invented explanation", () => {
    const box = render(`<p><strong>Examples</strong></p><ul><li>&quot;A passage&quot;: Loaded Phrasing</li></ul>`);
    markEvidence(box);
    expect(box.querySelector(".evidence-label").textContent).toBe("Loaded Phrasing");
    expect(box.querySelector(".evidence-explanation")).toBeNull();
  });

  it("leaves items that are not quotes, and lists under other headings, untouched", () => {
    const box = render(RENDERED);
    markEvidence(box);
    expect(box.textContent).toContain("Something that is not a quote");
    // The Recommendations list has the same shape but is not evidence.
    expect(box.querySelectorAll("ul")[1].querySelector("mark")).toBeNull();
  });

  it("treats model output as text, never markup", () => {
    const box = render(`<p><strong>Examples</strong></p><ul><li>&quot;&lt;img src=x onerror=alert(1)&gt;&quot;: framing</li></ul>`);
    markEvidence(box);
    expect(box.querySelector("img")).toBeNull();
    expect(box.querySelector("mark").textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("is a no-op on a result with no Examples block", () => {
    expect(markEvidence(render("<p>No significant framing detected.</p>"))).toBe(0);
  });
});

describe("popup copy", () => {
  it("no longer promises a history the site does not have", async () => {
    const { readFileSync } = await import("node:fs");
    const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
    const js = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
    expect(html).not.toMatch(/history/i);
    expect(js).not.toMatch(/["'`][^"'`]*save[sd]? (to )?history/i);
  });
});
