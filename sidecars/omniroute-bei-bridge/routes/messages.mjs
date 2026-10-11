import crypto from "node:crypto";

export async function handleAnthropicMessages(req, res, body, bridgeState) {
  const model = body.model || "bei/gemini-web";
  const isStream = Boolean(body.stream);
  const taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  // Extract prompt text from messages array
  let promptText = "";
  if (Array.isArray(body.messages)) {
    promptText = body.messages
      .map((m) => {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        return `${m.role.toUpperCase()}: ${content}`;
      })
      .join("\n\n");
  } else {
    promptText = String(body.prompt || "");
  }

  const provider = model.includes("chatgpt") ? "chatgpt" : "gemini";

  // Check if extension is connected
  if (!bridgeState.isExtensionConnected()) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          type: "service_unavailable",
          message:
            "OmniRoute BEI Chrome Extension is not connected on port 58930. Please ensure Chrome is open with the extension active.",
        },
      })
    );
    return;
  }

  if (isStream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const msgId = `msg_${taskId}`;
    res.write(
      `event: message_start\ndata: ${JSON.stringify({
        type: "message_start",
        message: {
          id: msgId,
          type: "message",
          role: "assistant",
          content: [],
          model,
          usage: { input_tokens: 10, output_tokens: 1 },
        },
      })}\n\n`
    );

    res.write(
      `event: content_block_start\ndata: ${JSON.stringify({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      })}\n\n`
    );

    // Register stream listener in bridge state
    bridgeState.registerStreamTask(taskId, {
      onChunk: (chunk) => {
        res.write(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: chunk },
          })}\n\n`
        );
      },
      onComplete: (fullText) => {
        res.write(
          `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`
        );
        res.write(
          `event: message_delta\ndata: ${JSON.stringify({
            type: "message_delta",
            delta: { stop_reason: "end_turn" },
            usage: { output_tokens: 50 },
          })}\n\n`
        );
        res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
        res.end();
      },
      onError: (err) => {
        res.write(
          `event: error\ndata: ${JSON.stringify({ type: "error", error: { message: err } })}\n\n`
        );
        res.end();
      },
    });

    // Send task to Chrome extension
    bridgeState.sendToExtension({
      command: "EXECUTE_CHAT",
      taskId,
      payload: { prompt: promptText, provider, taskId },
    });
  } else {
    // Non-streaming
    bridgeState
      .registerPromiseTask(taskId, (resolve, reject) => {
        bridgeState.sendToExtension({
          command: "EXECUTE_CHAT",
          taskId,
          payload: { prompt: promptText, provider, taskId },
        });
      })
      .then((fullText) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(
          JSON.stringify({
            id: `msg_${taskId}`,
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: fullText }],
            model,
            stop_reason: "end_turn",
            usage: { input_tokens: 15, output_tokens: 40 },
          })
        );
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: err.message || String(err) } }));
      });
  }
}
