/**
 * OmniRoute BEI - Suno Web Content Script
 * Supports: Music Generation via suno.com
 */

(() => {
  const PROTOCOL = window.__OMNIROUTE_BEI__;
  let activeTaskId = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type || !message.type.startsWith("orb_")) return;

    const command = message.type.replace("orb_", "");

    switch (command) {
      case "VERIFY_SESSION":
        handleVerifySession(sendResponse);
        return true;

      case "EXECUTE_MUSIC":
        handleExecuteMusic(message.payload, sendResponse);
        return true;

      case "CANCEL_TASK":
        if (activeTaskId === message.payload.taskId) {
          activeTaskId = null;
          sendResponse({ status: "cancelled" });
        }
        return false;
    }
  });

  function handleVerifySession(sendResponse) {
    const isCreatePage = window.location.pathname.includes("/create");
    const isLoggedIn = !document.querySelector('button:has-text("Sign in"), a[href*="login"]');
    sendResponse({
      provider: "suno",
      isReady:
        isCreatePage || Boolean(document.querySelector('textarea, input[placeholder*="style"]')),
      isLoggedIn,
      url: window.location.href,
    });
  }

  async function handleExecuteMusic(payload, sendResponse) {
    const { prompt, style, title, instrumental, taskId } = payload;
    activeTaskId = taskId;

    // Navigate to create if not there
    if (!window.location.pathname.includes("/create")) {
      const createNav = document.querySelector('a[href*="/create"]');
      if (createNav) createNav.click();
      await sleep(1500);
    }

    sendResponse({ status: "started", taskId });

    // Look for prompt inputs
    const promptInput = document.querySelector(
      'textarea[placeholder*="song"], textarea[placeholder*="lyrics"], textarea'
    );
    if (promptInput) {
      promptInput.focus();
      promptInput.value = prompt || style || "An uplifting upbeat instrumental track";
      promptInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await sleep(400);

    // Click Create button
    const createBtn = document.querySelector(
      'button[type="submit"], button:has-text("Create"), button[aria-label="Create"]'
    );
    if (createBtn) {
      createBtn.click();
    }

    // Monitor for newly generated song
    monitorMusicOutput(taskId);
  }

  function monitorMusicOutput(taskId) {
    const startTime = Date.now();
    const pollInterval = setInterval(() => {
      if (activeTaskId !== taskId) {
        clearInterval(pollInterval);
        return;
      }

      // Check for audio element or downloadable track
      const audioElements = Array.from(
        document.querySelectorAll('audio, [data-audio-url], a[href*=".mp3"]')
      );
      const recentAudio = audioElements.find((el) => {
        const src = el.src || el.getAttribute("data-audio-url") || el.href;
        return src && (src.includes("cdn") || src.includes(".mp3"));
      });

      if (recentAudio) {
        const audioUrl =
          recentAudio.src || recentAudio.getAttribute("data-audio-url") || recentAudio.href;
        clearInterval(pollInterval);
        chrome.runtime.sendMessage(
          PROTOCOL.createMessage("MUSIC_COMPLETE", {
            taskId,
            audioUrl,
            title: document.title || "Generated Music Track",
          })
        );
        activeTaskId = null;
      } else if (Date.now() - startTime > 120000) {
        clearInterval(pollInterval);
        chrome.runtime.sendMessage(
          PROTOCOL.createMessage("MUSIC_COMPLETE", { taskId, error: "Music generation timed out" })
        );
        activeTaskId = null;
      }
    }, 2000);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
