document.addEventListener("DOMContentLoaded", () => {
  
  const marked = window.marked || { parse: (text) => text };

  const analyzeBtn = document.getElementById("analyze");
  const resultText = document.getElementById("result-text");
  const resultBox = document.getElementById("result-box");
  const loading = document.getElementById("loading");

  analyzeBtn.addEventListener("click", () => {
    resultText.innerHTML = "";
    resultBox.style.display = "none";
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
        /^https:\/\/chrome.google.com\/webstore/i
      ];

      if (restrictedPatterns.some((pattern) => pattern.test(url))) {
        loading.style.display = "none";
        resultText.innerHTML = "⚠️ Could not analyze this page. Please open a real article or website and try again.";
        resultBox.style.display = "block";
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("⚠️ Script injection failed:", chrome.runtime.lastError.message);
          loading.style.display = "none";
          resultText.innerHTML = "⚠️ Could not analyze this page. Please open a real article or website and try again.";
          resultBox.style.display = "block";
          return;
        }

        chrome.tabs.sendMessage(tabId, { action: "getText" }, async (response) => {
          if (chrome.runtime.lastError) {
            console.error("⚠️ Runtime error:", chrome.runtime.lastError?.message || chrome.runtime.lastError);
            loading.style.display = "none";
            resultText.innerHTML = "⚠️ Could not analyze this page. Please open a real article or website and try again.";
            resultBox.style.display = "block";
            return;
          }

          if (!response || !response.content || response.content.trim() === "") {
            console.warn("⚠️ No readable text found in response");
            loading.style.display = "none";
            resultText.innerHTML = "⚠️ No readable text found on this page. Please open an article or blog post and try again.";
            resultBox.style.display = "block";
            return;
          }

          try {
            const res = await fetch("https://bias-checker-2u4d.onrender.com/check-bias", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: response.content })
            });

            const data = await res.json();
            const html = marked.parse(data.result);

            loading.style.display = "none";
            resultText.innerHTML = html;
            resultBox.style.display = "block";

            const links = resultBox.querySelectorAll('a');
            links.forEach(link => link.setAttribute('target', '_blank'));

          } catch (error) {
            console.error("❌ Error fetching from backend:", error);
            loading.style.display = "none";
            resultText.innerHTML = "⚠️ Failed to check bias. Please try again later.";
            resultBox.style.display = "block";
          }
        });
      });
    });
  });
});
