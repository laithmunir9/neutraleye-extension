document.addEventListener("DOMContentLoaded", async () => {
  const marked = window.marked || { parse: (text) => text };
  const DOMPurify = window.DOMPurify || { sanitize: () => "" };
  const API_BASE = "https://tryneutraleye.com";

  // ── Elements ──────────────────────────────────────────────────────────────
  const analyzeBtn      = document.getElementById("analyze");
  const resultText      = document.getElementById("result-text");
  const resultBox       = document.getElementById("result-box");
  const contentTypeBadge = document.getElementById("content-type-badge");
  const loading         = document.getElementById("loading");
  const historyNudge    = document.getElementById("history-nudge");

  const CONTENT_TYPE_LABELS = { news: "News", opinion: "Opinion", analysis: "Analysis/Commentary" };

  const userRow         = document.getElementById("user-row");
  const userEmailEl     = document.getElementById("user-email-display");
  const logoutBtn       = document.getElementById("logout-btn");
  const userAvatar      = document.getElementById("user-avatar");

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
    userAvatar.textContent = email.charAt(0).toUpperCase();
    userAvatar.style.display = "flex";
  }

  function showLoggedOut() {
    userRow.style.display = "none";
    loginForm.style.display = "none";
    userAvatar.style.display = "none";
  }

  // Load auth state from storage
  try {
    await new Promise((resolve) => {
      chrome.storage.local.get(["accessToken", "userEmail"], (result) => {
        if (result.accessToken) {
          currentToken = result.accessToken;
          showLoggedIn(result.userEmail || "");
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
    chrome.storage?.local?.remove(["accessToken", "refreshToken", "userEmail"]);
    currentToken = null;
    showLoggedOut();
    resultBox.style.display = "none";
  });

  // ── Nudge click → show login form (nudge stays visible until login succeeds)
  historyNudge.addEventListener("click", () => {
    loginForm.style.display = "block";
    loginEmail.focus();
  });

  // ── Analyze ───────────────────────────────────────────────────────────────
  analyzeBtn.addEventListener("click", () => {
    resultText.innerHTML = "";
    resultBox.style.display = "none";
    contentTypeBadge.style.display = "none";
    contentTypeBadge.textContent = "";
    historyNudge.style.display = "none";
    loading.style.display = "block";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const tabId = tab.id;
      const url = tab.url || "";

      const restrictedPatterns = [
        /^chrome:\/\//i,
        /^chrome-extension:\/\//i,
        /^edge:\/\//i,
        /^about:/i,
        /^file:\/\//i,
        /^https:\/\/chrome.google.com\/webstore/i,
      ];

      if (restrictedPatterns.some((p) => p.test(url))) {
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
                chrome.storage?.local?.remove(["accessToken", "refreshToken", "userEmail"]);
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

              if (!res.ok || !data.result) {
                resultText.innerHTML = "⚠️ Failed to check bias. Please try again later.";
                resultBox.style.display = "block";
                return;
              }

              const html = DOMPurify.sanitize(marked.parse(data.result));

              resultText.innerHTML = html;

              const contentTypeLabel = CONTENT_TYPE_LABELS[data.contentType];
              if (contentTypeLabel) {
                contentTypeBadge.textContent = contentTypeLabel;
                contentTypeBadge.style.display = "inline-block";
              }

              resultBox.style.display = "block";

              resultBox.querySelectorAll("a").forEach((link) => link.setAttribute("target", "_blank"));

              // Show nudge if not logged in
              if (!currentToken) {
                historyNudge.style.display = "block";
              }
            } catch {
              loading.style.display = "none";
              resultText.innerHTML = "⚠️ Failed to check bias. Please try again later.";
              resultBox.style.display = "block";
            }
          });
        }
      );
    });
  });
});
