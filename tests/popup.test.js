import { describe, it, expect } from "vitest";
import { loadScript, makeChromeStub } from "./helpers/loadScript.js";

const { window } = loadScript("popup.js");
const { isTokenNearExpiry, isRestrictedUrl, isValidAnalysisResponse, classifyRefreshResponse } = window;

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
    expect(isValidAnalysisResponse({ ok: true }, { result: "## Bias analysis" })).toBe(true);
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
    signedOut: document.getElementById("history-nudge").style.display === "block",
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
