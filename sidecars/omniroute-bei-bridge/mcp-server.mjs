#!/usr/bin/env node

/**
 * OmniRoute BEI - Model Context Protocol (MCP) Server
 * Zero-dependency stdio JSON-RPC 2.0 server.
 * Enables Antigravity and Claude Desktop to use BEI mode as native agent tools.
 */

import http from "node:http";
import readline from "node:readline";

const BRIDGE_PORT = 58930;
const BRIDGE_HOST = "127.0.0.1";

function sendJsonRpc(response) {
  process.stdout.write(JSON.stringify(response) + "\n");
}

async function requestBridge(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: BRIDGE_HOST,
        port: BRIDGE_PORT,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve({ raw });
          }
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error("Bridge request timed out (120s)"));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

const TOOLS = [
  {
    name: "omniroute_bei_status",
    description:
      "Check the health and connection status of OmniRoute BEI Bridge (:58930), the Chrome extension, and active AI tabs (Gemini, ChatGPT, Suno).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "omniroute_bei_chat",
    description:
      "Query Gemini Web or ChatGPT Web through your active browser session with ZERO API quota consumption.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The prompt or question to send to the browser AI.",
        },
        provider: {
          type: "string",
          enum: ["gemini", "chatgpt"],
          default: "gemini",
          description: "Which web AI session to use (gemini or chatgpt).",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "omniroute_bei_image",
    description:
      "Generate an image via Gemini Web (Imagen 3) or ChatGPT Web (DALL-E 3) with ZERO API quota consumption.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Visual image generation prompt.",
        },
        provider: {
          type: "string",
          enum: ["gemini", "chatgpt"],
          default: "gemini",
          description: "Which service to generate with.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "omniroute_bei_music",
    description: "Generate songs or background music via Suno Web with ZERO API quota consumption.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Music style description or lyrical prompt.",
        },
      },
      required: ["prompt"],
    },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case "omniroute_bei_status": {
      try {
        const health = await requestBridge("/health", "GET");
        return {
          content: [
            {
              type: "text",
              text: `⚡ OMNIROUTE BEI STATUS\n\nBridge Server: ${health.status === "ok" ? "ONLINE (Port 58930)" : "OFFLINE"}\nExtension: ${health.extensionConnected ? "🟢 CONNECTED" : "🔴 DISCONNECTED (Open Chrome and click extension icon)"}\nActive Provider Tabs: ${health.activeTabsCount || 0}\nTabs: ${JSON.stringify(health.tabs || [], null, 2)}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `❌ BEI Bridge daemon is not running on port 58930 (${err.message}). Launch it via run.cmd.`,
            },
          ],
        };
      }
    }

    case "omniroute_bei_chat": {
      try {
        const provider = args.provider || "gemini";
        const res = await requestBridge("/v1/chat/completions", "POST", {
          model: `bei/${provider}-web`,
          messages: [{ role: "user", content: args.prompt }],
          stream: false,
        });

        if (res.error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ BEI Error: ${res.error.message || JSON.stringify(res.error)}`,
              },
            ],
          };
        }

        const reply = res.choices?.[0]?.message?.content || JSON.stringify(res);
        return {
          content: [{ type: "text", text: reply }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ BEI Chat failed: ${err.message}` }],
        };
      }
    }

    case "omniroute_bei_image": {
      try {
        const res = await requestBridge("/v1/images/generations", "POST", {
          prompt: args.prompt,
          model: `bei/${args.provider || "gemini"}-web`,
        });

        if (res.error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Image Error: ${res.error.message || JSON.stringify(res.error)}`,
              },
            ],
          };
        }

        const url = res.data?.[0]?.url || "No image URL returned";
        return {
          content: [{ type: "text", text: `🎨 Generated Image: ${url}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ BEI Image Generation failed: ${err.message}` }],
        };
      }
    }

    case "omniroute_bei_music": {
      try {
        const res = await requestBridge("/api/music/generate", "POST", {
          prompt: args.prompt,
        });

        if (res.error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Music Error: ${res.error.message || JSON.stringify(res.error)}`,
              },
            ],
          };
        }

        return {
          content: [{ type: "text", text: `🎵 Music Generated:\n${JSON.stringify(res, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ BEI Music Generation failed: ${err.message}` }],
        };
      }
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      };
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", async (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch (err) {
    return;
  }

  const { id, method, params } = request;

  switch (method) {
    case "initialize":
      sendJsonRpc({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "omniroute-bei",
            version: "1.0.0",
          },
          capabilities: {
            tools: {},
          },
        },
      });
      break;

    case "notifications/initialized":
      // No response needed
      break;

    case "ping":
      sendJsonRpc({ jsonrpc: "2.0", id, result: {} });
      break;

    case "tools/list":
      sendJsonRpc({
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS,
        },
      });
      break;

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      try {
        const toolResult = await handleToolCall(toolName, toolArgs);
        sendJsonRpc({
          jsonrpc: "2.0",
          id,
          result: toolResult,
        });
      } catch (err) {
        sendJsonRpc({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32603,
            message: err.message,
          },
        });
      }
      break;
    }

    default:
      if (id !== undefined) {
        sendJsonRpc({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        });
      }
  }
});
