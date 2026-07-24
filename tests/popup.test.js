import { describe, it, expect } from "vitest";
import { loadScript } from "./helpers/loadScript.js";

const { window } = loadScript("popup.js");
const { isTokenNearExpiry, isRestrictedUrl, isValidAnalysisResponse } = window;

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
