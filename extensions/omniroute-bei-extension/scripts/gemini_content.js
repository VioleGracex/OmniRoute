/**
 * OmniRoute BEI - Gemini Web Content Script
 * Supports: Text Chat Streaming & Imagen 3 Image Generation via gemini.google.com
 */

(() => {
  const PROTOCOL = window.__OMNIROUTE_BEI__;
  let activeTaskId = null;
  let responseObserver = null;

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type || !message.type.startsWith("orb_")) return;

    const command = message.type.replace("orb_", "");

    switch (command) {
      case "VERIFY_SESSION":
        handleVerifySession(sendResponse);
        return true;

      case "EXECUTE_CHAT":
        handleExecuteChat(message.payload, sendResponse);
        return true;

      case "EXECUTE_IMAGE":
        handleExecuteImage(message.payload, sendResponse);
        return true;

      case "CANCEL_TASK":
        if (activeTaskId === message.payload.taskId) {
          stopActiveTask();
          sendResponse({ status: "cancelled" });
        }
        return false;
    }
  });

  function handleVerifySession(sendResponse) {
    const isLoggedIn = !document.querySelector('a[href*="accounts.google.com/ServiceLogin"]');
    const inputField = getEditorElement();
    sendResponse({
      provider: "gemini",
      isReady: Boolean(inputField),
      isLoggedIn,
      slot: PROTOCOL.extractGeminiSlot(window.location.href),
      url: window.location.href,
    });
  }

  function getEditorElement() {
    return (
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("rich-textarea p") ||
      document.querySelector("textarea") ||
      document.querySelector('rich-textarea div[contenteditable="true"]')
    );
  }

  function getSendButton() {
    return (
      document.querySelector('button[aria-label*="Send"]') ||
      document.querySelector('button[aria-label*="Submit"]') ||
      document.querySelector(".send-button") ||
      document.querySelector("button.send-button-container")
    );
  }

  async function handleExecuteChat(payload, sendResponse) {
    const { prompt, taskId } = payload;
    activeTaskId = taskId;

    const editor = getEditorElement();
    if (!editor) {
      sendResponse({ error: "Gemini editor not found on page" });
      return;
    }

    sendResponse({ status: "started", taskId });

    // Insert prompt text
    editor.focus();
    if (editor.tagName === "TEXTAREA") {
      editor.value = prompt;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      // Contenteditable
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, prompt);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await sleep(400);

    // Click send button or dispatch Enter
    const sendBtn = getSendButton();
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
    } else {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })
      );
    }

    // Monitor response stream
    monitorChatStream(taskId);
  }

  function monitorChatStream(taskId) {
    let lastLength = 0;
    let fullText = "";
    let settledTicks = 0;
    const startTime = Date.now();
    const maxTimeoutMs = 120000;

    const checkInterval = setInterval(() => {
      if (activeTaskId !== taskId) {
        clearInterval(checkInterval);
        return;
      }

      // Check timeout
      if (Date.now() - startTime > maxTimeoutMs) {
        clearInterval(checkInterval);
        chrome.runtime.sendMessage(
          PROTOCOL.createMessage("CHAT_COMPLETE", { taskId, text: fullText, timedOut: true })
        );
        activeTaskId = null;
        return;
      }

      // Find response container
      const responses = document.querySelectorAll(
        "message-content, .model-response-text, .response-content, model-response"
      );
      const latestResponse = responses[responses.length - 1];

      if (latestResponse) {
        const currentText = latestResponse.innerText || latestResponse.textContent || "";

        if (currentText.length > lastLength) {
          const newChunk = currentText.slice(lastLength);
          lastLength = currentText.length;
          fullText = currentText;
          settledTicks = 0;

          // Stream chunk to background script
          chrome.runtime.sendMessage(
            PROTOCOL.createMessage("CHAT_STREAM_CHUNK", { taskId, chunk: newChunk })
          );
        } else if (currentText.length > 0) {
          settledTicks++;

          // If no new text for 2.5s and send button is re-enabled, completion reached
          const sendBtn = getSendButton();
          const isDoneGenerating =
            (sendBtn && !sendBtn.disabled && settledTicks >= 5) || settledTicks >= 8;

          if (isDoneGenerating) {
            clearInterval(checkInterval);
            chrome.runtime.sendMessage(
              PROTOCOL.createMessage("CHAT_COMPLETE", { taskId, text: fullText })
            );
            activeTaskId = null;
          }
        }
      }
    }, 400);
  }

  async function handleExecuteImage(payload, sendResponse) {
    const { prompt, taskId } = payload;
    activeTaskId = taskId;

    const editor = getEditorElement();
    if (!editor) {
      sendResponse({ error: "Gemini editor not found" });
      return;
    }

    sendResponse({ status: "started", taskId });

    // Ensure prompt triggers image generation
    const imgPrompt =
      prompt.toLowerCase().includes("generate") || prompt.toLowerCase().includes("draw")
        ? prompt
        : `Generate an image: ${prompt}`;

    editor.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, imgPrompt);
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    await sleep(400);
    const sendBtn = getSendButton();
    if (sendBtn) sendBtn.click();

    // Poll for generated image tags
    const startTime = Date.now();
    const pollImg = setInterval(() => {
      if (activeTaskId !== taskId) {
        clearInterval(pollImg);
        return;
      }

      const imgs = Array.from(
        document.querySelectorAll(
          'img[src*="googleusercontent"], img[src*="blob:"], .generated-image img'
        )
      );
      const recentImg = imgs.find((img) => img.naturalWidth > 256 && img.naturalHeight > 256);

      if (recentImg) {
        clearInterval(pollImg);
        chrome.runtime.sendMessage(
          PROTOCOL.createMessage("IMAGE_COMPLETE", {
            taskId,
            url: recentImg.src,
            width: recentImg.naturalWidth,
            height: recentImg.naturalHeight,
          })
        );
        activeTaskId = null;
      } else if (Date.now() - startTime > 90000) {
        clearInterval(pollImg);
        chrome.runtime.sendMessage(
          PROTOCOL.createMessage("IMAGE_COMPLETE", { taskId, error: "Image generation timed out" })
        );
        activeTaskId = null;
      }
    }, 1000);
  }

  function stopActiveTask() {
    activeTaskId = null;
    if (responseObserver) {
      responseObserver.disconnect();
      responseObserver = null;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
