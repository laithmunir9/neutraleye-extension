// ── Pure helpers (top-level so tests can reach them directly) ────────────────

function isTokenNearExpiry(expiresAt) {
  const expiresAtMs = expiresAt ? Number(expiresAt) * 1000 : 0;
  return Boolean(expiresAtMs) && Date.now() > expiresAtMs - 5 * 60 * 1000;
}

function isRestrictedUrl(url) {
  const restrictedPatterns = [
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    /^edge:\/\//i,
    /^about:/i,
    /^file:\/\//i,
    /^https:\/\/chrome.google.com\/webstore/i,
  ];
  return restrictedPatterns.some((p) => p.test(url));
}

function isValidAnalysisResponse(res, data) {
  return Boolean(res.ok && data.result);
}

// ── Token refresh outcomes ───────────────────────────────────────────────────
// A failed refresh is not one thing. Collapsing every failure into "signed out"
// wipes a perfectly good session whenever the auth backend hiccups, so the three
// cases are kept distinct and only REFRESH_DEAD is allowed to clear storage.
const REFRESH_OK = "ok";       // new tokens in hand
const REFRESH_RETRY = "retry"; // backend problem — keep the session, try again next open
const REFRESH_DEAD = "dead";   // the refresh token itself is finished — sign out

// /api/extension-refresh signals a genuinely dead session with a bare 401 and
// nothing else — notably NOT its 503 AUTH_UNAVAILABLE, which is retry-later. If
// the API ever names the dead case with a code, match it here too.
function classifyRefreshResponse(res, data) {
  if (res.ok && data?.accessToken) return REFRESH_OK;
  if (res.status === 401) return REFRESH_DEAD;
  // 5xx, AUTH_UNAVAILABLE, and even a malformed 200 fall through to retry: none of
  // them are evidence that the stored refresh token is bad.
  return REFRESH_RETRY;
}

// apiBase is passed in rather than read from the closure so this stays a top-level
// function the tests can call directly (same reason as the pure helpers above).
async function tryRefreshToken(refreshToken, apiBase) {
  let res;
  let data;
  try {
    res = await fetch(`${apiBase}/api/extension-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    data = await res.json().catch(() => ({}));
  } catch {
    // The request never reached the server, so it said nothing about our token.
    return { outcome: REFRESH_RETRY };
  }

  const outcome = classifyRefreshResponse(res, data);
  return outcome === REFRESH_OK ? { outcome, tokens: data } : { outcome };
}

document.addEventListener("DOMContentLoaded", async () => {
  const marked = window.marked || { parse: (text) => text };
  const DOMPurify = window.DOMPurify || { sanitize: () => "" };
  const API_BASE = "https://tryneutraleye.com";

  // ── Elements ──────────────────────────────────────────────────────────────
  const analyzeBtn      = document.getElementById("analyze");
  const resultText      = document.getElementById("result-text");
  const resultBox       = document.getElementById("result-box");
  const loading         = document.getElementById("loading");
  const historyNudge    = document.getElementById("history-nudge");
  const savedIndicator  = document.getElementById("saved-indicator");

  const userRow         = document.getElementById("user-row");
  const userEmailEl     = document.getElementById("user-email-display");
  const logoutBtn       = document.getElementById("logout-btn");

  const loginForm       = document.getElementById("login-form");
  const loginEmail      = document.getElementById("login-email");
  const loginPassword   = document.getElementById("login-password");
  const loginError      = document.getElementById("login-error");
  const loginSubmit     = document.getElementById("login-submit");
  const loginCancel     = document.getElementById("login-cancel");

  // ── Auth state ────────────────────────────────────────────────────────────
  let currentToken = null;

  function showLoggedIn(email) {
    userEmailEl.textContent = email;
    userRow.style.display = "flex";
    loginForm.style.display = "none";
    historyNudge.style.display = "none";
  }

  function showLoggedOut() {
    userRow.style.display = "none";
    loginForm.style.display = "none";
    historyNudge.style.display = "block";
  }

  // Load auth state from storage, refreshing the token if it's expired or nearly so
  try {
    await new Promise((resolve) => {
      chrome.storage.local.get(["accessToken", "refreshToken", "userEmail", "expiresAt"], async (result) => {
        if (result.accessToken) {
          const nearExpiry = isTokenNearExpiry(result.expiresAt);

          if (nearExpiry && result.refreshToken) {
            const { outcome, tokens } = await tryRefreshToken(result.refreshToken, API_BASE);
            if (outcome === REFRESH_OK) {
              chrome.storage?.local?.set({
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                userEmail: tokens.email,
                expiresAt: tokens.expiresAt,
              });
              currentToken = tokens.accessToken;
              showLoggedIn(tokens.email || result.userEmail || "");
            } else if (outcome === REFRESH_DEAD) {
              chrome.storage?.local?.remove(["accessToken", "refreshToken", "userEmail", "expiresAt"]);
              showLoggedOut();
            } else {
              // Retry-later: the auth backend was unreachable or unhealthy. Keep the
              // stored session and stay signed in — the token gets another chance on
              // the next popup open, and /api/extension reports tokenExpired if it
              // really has gone bad.
              currentToken = result.accessToken;
              showLoggedIn(result.userEmail || "");
            }
          } else {
            currentToken = result.accessToken;
            showLoggedIn(result.userEmail || "");
          }
        } else {
          showLoggedOut();
        }
        resolve();
      });
    });
  } catch {
    showLoggedOut();
  }

  // ── Login / logout ────────────────────────────────────────────────────────
  loginCancel.addEventListener("click", () => {
    loginForm.style.display = "none";
    loginEmail.value = "";
    loginPassword.value = "";
    loginError.style.display = "none";
    historyNudge.style.display = "block";
  });

  loginSubmit.addEventListener("click", handleLogin);
  loginPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  async function handleLogin() {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    if (!email || !password) {
      showLoginError("Enter your email and password.");
      return;
    }

    loginSubmit.disabled = true;
    loginSubmit.textContent = "Signing in…";
    loginError.style.display = "none";

    try {
      const res = await fetch(`${API_BASE}/api/extension-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        showLoginError(data.error || "Sign in failed. Check your email and password.");
        return;
      }

      chrome.storage?.local?.set({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        userEmail: data.email,
        expiresAt: data.expiresAt,
      });

      currentToken = data.accessToken;
      loginEmail.value = "";
      loginPassword.value = "";
      showLoggedIn(data.email);
    } catch {
      showLoginError("Connection error. Please try again.");
    } finally {
      loginSubmit.disabled = false;
      loginSubmit.textContent = "Sign in";
    }
  }

  function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.style.display = "block";
  }

  logoutBtn.addEventListener("click", () => {
    chrome.storage?.local?.remove(["accessToken", "refreshToken", "userEmail", "expiresAt"]);
    currentToken = null;
    showLoggedOut();
    resultBox.style.display = "none";
  });

  // ── Nudge click → show login form (nudge stays visible until login succeeds)
  historyNudge.addEventListener("click", () => {
    historyNudge.style.display = "none";
    loginForm.style.display = "block";
    loginEmail.focus();
  });

  // ── Analyze ───────────────────────────────────────────────────────────────
  analyzeBtn.addEventListener("click", () => {
    resultText.innerHTML = "";
    resultBox.style.display = "none";
    historyNudge.style.display = "none";
    savedIndicator.style.display = "none";
    loading.style.display = "block";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const tabId = tab.id;
      const url = tab.url || "";

      if (isRestrictedUrl(url)) {
        loading.style.display = "none";
        resultText.innerHTML = "⚠️ Could not analyze this page. Please open a real article or website and try again.";
        resultBox.style.display = "block";
        return;
      }

      chrome.scripting.executeScript(
        { target: { tabId }, files: ["content.js"] },
        () => {
          if (chrome.runtime.lastError) {
            loading.style.display = "none";
            resultText.innerHTML = "⚠️ Could not analyze this page. Please open a real article or website and try again.";
            resultBox.style.display = "block";
            return;
          }

          chrome.tabs.sendMessage(tabId, { action: "getText" }, async (response) => {
            if (chrome.runtime.lastError || !response?.content?.trim()) {
              loading.style.display = "none";
              resultText.innerHTML = "⚠️ No readable text found on this page. Please open an article or blog post and try again.";
              resultBox.style.display = "block";
              return;
            }

            try {
              const fetchHeaders = { "Content-Type": "application/json" };
              if (currentToken) fetchHeaders["Authorization"] = `Bearer ${currentToken}`;

              const res = await fetch(`${API_BASE}/api/extension`, {
                method: "POST",
                headers: fetchHeaders,
                body: JSON.stringify({
                  text: response.content,
                  headline: response.headline,
                  author: response.author,
                  date: response.date,
                  url,
                }),
              });

              // Expired token — clear and retry anonymously
              if (res.status === 401) {
                chrome.storage?.local?.remove(["accessToken", "refreshToken", "userEmail", "expiresAt"]);
                currentToken = null;
                showLoggedOut();
              }

              if (res.status === 429) {
                loading.style.display = "none";
                resultText.innerHTML = "⚠️ Too many requests. Please wait a moment and try again.";
                resultBox.style.display = "block";
                return;
              }

              const data = await res.json();

              loading.style.display = "none";

              if (!isValidAnalysisResponse(res, data)) {
                resultText.innerHTML = "⚠️ Couldn't run the analysis. Try again in a moment.";
                resultBox.style.display = "block";
                return;
              }

              const html = DOMPurify.sanitize(marked.parse(data.result));

              resultText.innerHTML = html;

              resultBox.style.display = "block";

              resultBox.querySelectorAll("a").forEach((link) => link.setAttribute("target", "_blank"));

              // If the server rejected our token, clear it and show the nudge
              if (data.tokenExpired) {
                chrome.storage?.local?.remove(["accessToken", "refreshToken", "userEmail", "expiresAt"]);
                currentToken = null;
                showLoggedOut();
              }

              // Show nudge if not logged in, or saved indicator if logged in
              if (!currentToken) {
                historyNudge.style.display = "block";
              } else if (data.saved) {
                savedIndicator.style.display = "block";
              }
            } catch {
              loading.style.display = "none";
              resultText.innerHTML = "⚠️ Couldn't run the analysis. Try again in a moment.";
              resultBox.style.display = "block";
            }
          });
        }
      );
    });
  });
});
