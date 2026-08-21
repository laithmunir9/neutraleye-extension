// Loads a plain (non-module) extension script into a vm context and hands back
// its top-level bindings — the same way top-level `function` declarations become
// `window` properties in a real browser. This lets tests reach popup.js/content.js's
// internal functions WITHOUT adding export statements or changing how Chrome loads
// these files (they must stay classic scripts, not ES modules).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export function loadScript(relPath, { html, htmlFile, chrome, fireDOMContentLoaded = false } = {}) {
  const markup = htmlFile
    ? readFileSync(join(rootDir, htmlFile), "utf8")
    : html ?? "<!doctype html><html><body></body></html>";
  const dom = new JSDOM(markup, { url: "https://example.com/article", runScripts: "dangerously" });
  const sandbox = dom.getInternalVMContext ? dom.getInternalVMContext() : dom.window;

  // jsdom has no layout engine: innerText is unimplemented (always undefined) and
  // offsetWidth/offsetHeight are always 0. Shim innerText to textContent so the
  // extraction heuristics (which read innerText, exactly like a real browser) see text.
  Object.defineProperty(sandbox.HTMLElement.prototype, "innerText", {
    configurable: true,
    get() { return this.textContent; },
    set(value) { this.textContent = value; },
  });

  // By default popup.js's real startup wiring (DOM lookups, auth bootstrap, listeners)
  // isn't what these tests exercise — only the pure top-level helpers are — so the
  // DOMContentLoaded handler is suppressed and never runs against a minimal fixture
  // that lacks the real popup.html elements.
  // Tests that DO want the startup path (fireDOMContentLoaded) must supply a real
  // fixture — pass htmlFile: "popup.html" — and dispatch the event themselves after
  // this returns, since jsdom already fired its own before the script was injected.
  if (!fireDOMContentLoaded) {
    const originalAddEventListener = sandbox.document.addEventListener.bind(sandbox.document);
    sandbox.document.addEventListener = (type, ...rest) => {
      if (type === "DOMContentLoaded") return;
      return originalAddEventListener(type, ...rest);
    };
  }

  sandbox.chrome = chrome ?? makeChromeStub();
  sandbox.console = console;

  const context = vm.createContext(sandbox);
  const source = readFileSync(join(rootDir, relPath), "utf8");
  vm.runInContext(source, context, { filename: relPath });

  return { window: sandbox, document: sandbox.document };
}

export function makeChromeStub() {
  return {
    runtime: {
      onMessage: { addListener() {} },
      lastError: undefined,
    },
    storage: {
      local: {
        get(_keys, cb) { cb({}); },
        set() {},
        remove() {},
      },
    },
    tabs: {
      query(_opts, cb) { cb([]); },
      sendMessage() {},
    },
    scripting: {
      executeScript() {},
    },
  };
}
