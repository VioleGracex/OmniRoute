document.addEventListener("DOMContentLoaded", () => {
  const statusIndicator = document.getElementById("statusIndicator");
  const statusText = document.getElementById("statusText");

  // Probe bridge port 58930
  fetch("http://127.0.0.1:58930/health", { mode: "cors" })
    .then((r) => r.json())
    .then((data) => {
      if (data.status === "ok") {
        statusIndicator.className = "status-pill online";
        statusText.textContent = "Active :58930";
      }
    })
    .catch(() => {
      statusIndicator.className = "status-pill offline";
      statusText.textContent = "Offline";
    });

  // Tab openers
  document.getElementById("btnOpenGemini").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://gemini.google.com/app" });
  });

  document.getElementById("btnOpenChatGPT").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://chatgpt.com" });
  });

  document.getElementById("btnOpenSuno").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://suno.com/create" });
  });
});
