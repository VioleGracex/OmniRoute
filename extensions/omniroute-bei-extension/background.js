/**
 * OmniRoute BEI Router - Background Service Worker
 * Manages WebSocket bridge to port 58930, Tab grouping, and Task routing.
 */

const BRIDGE_WS_URL = "ws://127.0.0.1:58930";
const TAB_GROUP_TITLE = "OmniRoute BEI";
const TAB_GROUP_COLOR = "cyan";

let socket = null;
let isConnected = false;
let reconnectTimer = null;
const pendingResponses = new Map();

// Initialize extension lifecycle
chrome.runtime.onInstalled.addListener(() => {
  updateBadge(false);
  connectWebSocket();
});

chrome.runtime.onStartup.addListener(() => {
  connectWebSocket();
});

function connectWebSocket() {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  try {
    socket = new WebSocket(BRIDGE_WS_URL);

    socket.onopen = () => {
      isConnected = true;
      updateBadge(true);
      console.log("[OmniRoute BEI] Connected to bridge daemon on port 58930");

      // Send active tabs handshake
      sendTabsInventory();
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        handleBridgeMessage(message);
      } catch (err) {
        console.error("[OmniRoute BEI] Failed to parse bridge message:", err);
      }
    };

    socket.onclose = () => {
      isConnected = false;
      updateBadge(false);
      scheduleReconnect();
    };

    socket.onerror = () => {
      isConnected = false;
      updateBadge(false);
    };
  } catch (err) {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectWebSocket, 3000);
}

function updateBadge(connected) {
  if (connected) {
    chrome.action.setBadgeText({ text: "ROUTER" });
    chrome.action.setBadgeBackgroundColor({ color: "#0ea5e9" }); // Cyan/Sky
  } else {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#64748b" }); // Slate
  }
}

async function handleBridgeMessage(msg) {
  const { command, payload, taskId } = msg;

  switch (command) {
    case "PING":
      sendBridge({ command: "PONG" });
      break;

    case "LIST_TABS":
      await sendTabsInventory();
      break;

    case "EXECUTE_CHAT":
    case "EXECUTE_IMAGE":
    case "EXECUTE_MUSIC":
      await dispatchTaskToTab(command, payload, taskId);
      break;

    case "OPEN_TAB":
      await openProviderTab(payload.provider, payload.slot);
      break;
  }
}

function sendBridge(msg) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

async function sendTabsInventory() {
  const tabs = await chrome.tabs.query({});
  const relevantTabs = [];

  for (const tab of tabs) {
    if (!tab.url) continue;
    let provider = null;
    if (tab.url.includes("gemini.google.com")) provider = "gemini";
    else if (tab.url.includes("chatgpt.com")) provider = "chatgpt";
    else if (tab.url.includes("suno.com")) provider = "suno";

    if (provider) {
      relevantTabs.push({
        id: tab.id,
        provider,
        title: tab.title,
        url: tab.url,
      });
    }
  }

  sendBridge({ command: "TABS_INVENTORY", payload: { tabs: relevantTabs } });
}

async function dispatchTaskToTab(command, payload, taskId) {
  const provider = payload.provider || "gemini";
  const urlFilter =
    provider === "chatgpt"
      ? "*://chatgpt.com/*"
      : provider === "suno"
        ? "*://suno.com/*"
        : "*://gemini.google.com/*";

  let [targetTab] = await chrome.tabs.query({ url: urlFilter });

  if (!targetTab) {
    // Open tab if not found
    targetTab = await openProviderTab(provider, payload.slot || 0);
    await new Promise((r) => setTimeout(r, 4000));
  }

  // Ensure tab is in group
  ensureTabGroup(targetTab.id);

  // Send message to content script
  try {
    const res = await chrome.tabs.sendMessage(targetTab.id, {
      type: `orb_${command}`,
      payload: { ...payload, taskId },
    });

    if (res && res.error) {
      sendBridge({ command: "TASK_ERROR", taskId, error: res.error });
    }
  } catch (err) {
    sendBridge({
      command: "TASK_ERROR",
      taskId,
      error: `Content script unavailable on tab: ${err.message}`,
    });
  }
}

async function openProviderTab(provider, slot = 0) {
  let targetUrl = "https://gemini.google.com/app";
  if (provider === "gemini") {
    targetUrl =
      slot > 0 ? `https://gemini.google.com/u/${slot}/app` : "https://gemini.google.com/app";
  } else if (provider === "chatgpt") {
    targetUrl = "https://chatgpt.com";
  } else if (provider === "suno") {
    targetUrl = "https://suno.com/create";
  }

  const newTab = await chrome.tabs.create({ url: targetUrl, active: false });
  await ensureTabGroup(newTab.id);
  return newTab;
}

async function ensureTabGroup(tabId) {
  try {
    const groups = await chrome.tabGroups.query({ title: TAB_GROUP_TITLE });
    let groupId;

    if (groups.length > 0) {
      groupId = groups[0].id;
      await chrome.tabs.group({ tabIds: [tabId], groupId });
    } else {
      groupId = await chrome.tabs.group({ tabIds: [tabId] });
      await chrome.tabGroups.update(groupId, {
        title: TAB_GROUP_TITLE,
        color: TAB_GROUP_COLOR,
      });
    }
  } catch (err) {
    // Tab grouping optional
  }
}

// Forward messages from content scripts to bridge WebSocket
chrome.runtime.onMessage.addListener((message) => {
  if (!message || !message.type || !message.type.startsWith("orb_")) return;

  const eventName = message.type.replace("orb_", "");
  sendBridge({
    command: eventName,
    payload: message.payload,
  });
});
