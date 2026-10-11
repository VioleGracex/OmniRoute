/**
 * OmniRoute BEI - ChatGPT Web Content Script
 * Supports: Text Chat Streaming & DALL-E 3 Image Generation via chatgpt.com
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

      case "EXECUTE_CHAT":
        handleExecuteChat(message.payload, sendResponse);
        return true;

      case "EXECUTE_IMAGE":
        handleExecuteImage(message.payload, sendResponse);
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
    const editor = document.querySelector(
      '#prompt-textarea, textarea, div[contenteditable="true"]'
    );
    const isLoggedIn = !document.querySelector('button[data-testid="login-button"]');
    sendResponse({
      provider: "chatgpt",
      isReady: Boolean(editor),
      isLoggedIn,
      url: window.location.href,
    });
  }

  function getEditor() {
    return (
      document.querySelector("#prompt-textarea") ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea")
    );
  }

  function getSendButton() {
    return (
      document.querySelector('button[data-testid="send-button"]') ||
      document.querySelector('button[aria-label="Send prompt"]') ||
      document.querySelector('button[aria-label="Send"]')
    );
  }

  async function handleExecuteChat(payload, sendResponse) {
    const { prompt, taskId } = payload;
    activeTaskId = taskId;

    const editor = getEditor();
    if (!editor) {
      sendResponse({ error: "ChatGPT textarea not found" });
      return;
    }

    sendResponse({ status: "started", taskId });

    editor.focus();
    if (editor.tagName === "TEXTAREA") {
      editor.value = prompt;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, prompt);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await sleep(350);
    const sendBtn = getSendButton();
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
    } else {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })
      );
    }

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

      if (Date.now() - startTime > maxTimeoutMs) {
        clearInterval(checkInterval);
        chrome.runtime.sendMessage(
          PROTOCOL.createMessage("CHAT_COMPLETE", { taskId, text: fullText, timedOut: true })
        );
        activeTaskId = null;
        return;
      }

      // Latest assistant turn
      const turns = document.querySelectorAll(
        'div[data-message-author-role="assistant"], .markdown'
      );
      const latestTurn = turns[turns.length - 1];

      if (latestTurn) {
        const currentText = latestTurn.innerText || latestTurn.textContent || "";

        if (currentText.length > lastLength) {
          const newChunk = currentText.slice(lastLength);
          lastLength = currentText.length;
          fullText = currentText;
          settledTicks = 0;

          chrome.runtime.sendMessage(
            PROTOCOL.createMessage("CHAT_STREAM_CHUNK", { taskId, chunk: newChunk })
          );
        } else if (currentText.length > 0) {
          settledTicks++;

          // Stop button disappears when done
          const stopBtn = document.querySelector(
            'button[aria-label="Stop streaming"], button[data-testid="stop-button"]'
          );
          if (!stopBtn && settledTicks >= 4) {
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

    const editor = getEditor();
    if (!editor) {
      sendResponse({ error: "ChatGPT editor not found" });
      return;
    }

    sendResponse({ status: "started", taskId });

    const imgPrompt =
      prompt.toLowerCase().includes("image") || prompt.toLowerCase().includes("dall-e")
        ? prompt
        : `Create an image of: ${prompt}`;

    editor.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, imgPrompt);
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    await sleep(400);
    const sendBtn = getSendButton();
    if (sendBtn) sendBtn.click();

    const startTime = Date.now();
    const pollImg = setInterval(() => {
      if (activeTaskId !== taskId) {
        clearInterval(pollImg);
        return;
      }

      const imgs = Array.from(
        document.querySelectorAll('img[src*="oaiusercontent"], img[alt*="Generated by DALL·E"]')
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
          PROTOCOL.createMessage("IMAGE_COMPLETE", {
            taskId,
            error: "DALL-E image generation timed out",
          })
        );
        activeTaskId = null;
      }
    }, 1000);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
