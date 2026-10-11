/**
 * OmniRoute BEI Bridge Daemon
 * Standalone sidecar process listening on HTTP & WebSocket port 58930
 */

import http from "node:http";
import { WebSocketServer } from "ws";
import { BridgeState } from "./bridge-state.mjs";
import { handleAnthropicMessages } from "./routes/messages.mjs";
import { handleOpenAIChatCompletions } from "./routes/completions.mjs";
import { handleImageGenerations } from "./routes/images.mjs";
import { handleAudioMusicGenerations } from "./routes/audio.mjs";

const PORT = 58930;
const bridgeState = new BridgeState();

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = url.pathname;

  // Health check
  if (pathname === "/health" || pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "omniroute-bei-bridge",
        port: PORT,
        extensionConnected: bridgeState.isExtensionConnected(),
        activeTabsCount: bridgeState.tabs.length,
        tabs: bridgeState.tabs,
      })
    );
    return;
  }

  // Model catalog
  if (pathname === "/v1/models" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        object: "list",
        data: [
          { id: "bei/gemini-web", object: "model", owned_by: "omniroute-bei" },
          { id: "bei/chatgpt-web", object: "model", owned_by: "omniroute-bei" },
          { id: "bei/imagen-3", object: "model", owned_by: "omniroute-bei" },
          { id: "bei/dall-e-3", object: "model", owned_by: "omniroute-bei" },
          { id: "bei/suno-music", object: "model", owned_by: "omniroute-bei" },
        ],
      })
    );
    return;
  }

  // Body parser for POST requests
  let rawBody = "";
  req.on("data", (chunk) => {
    rawBody += chunk;
  });

  req.on("end", async () => {
    let body = {};
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Invalid JSON body" } }));
        return;
      }
    }

    try {
      if (pathname === "/v1/messages" && req.method === "POST") {
        await handleAnthropicMessages(req, res, body, bridgeState);
      } else if (pathname === "/v1/chat/completions" && req.method === "POST") {
        await handleOpenAIChatCompletions(req, res, body, bridgeState);
      } else if (pathname === "/v1/images/generations" && req.method === "POST") {
        await handleImageGenerations(req, res, body, bridgeState);
      } else if (
        (pathname === "/v1/audio/generations" || pathname === "/api/music/generate") &&
        req.method === "POST"
      ) {
        await handleAudioMusicGenerations(req, res, body, bridgeState);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: `Not Found: ${pathname}` } }));
      }
    } catch (err) {
      console.error("[Server Error]", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: err.message || "Internal error" } }));
      }
    }
  });
});

// WebSocket Server attached to same HTTP server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  bridgeState.setExtensionSocket(ws);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      bridgeState.handleExtensionMessage(msg);
    } catch (err) {
      console.error("[WS Error] Failed to parse extension message:", err);
    }
  });

  ws.on("close", () => {
    bridgeState.clearExtensionSocket();
  });

  ws.on("error", (err) => {
    console.error("[WS Error]", err);
    bridgeState.clearExtensionSocket();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`================================================================`);
  console.log(`  OmniRoute BEI Bridge daemon listening on http://127.0.0.1:${PORT}`);
  console.log(`  WebSocket ready for Chrome Extension on ws://127.0.0.1:${PORT}`);
  console.log(`================================================================`);
});
