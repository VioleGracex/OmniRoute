import crypto from "node:crypto";

export async function handleOpenAIChatCompletions(req, res, body, bridgeState) {
  const model = body.model || "bei/gemini-web";
  const isStream = Boolean(body.stream);
  const taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  let promptText = "";
  if (Array.isArray(body.messages)) {
    promptText = body.messages
      .map(
        (m) =>
          `${m.role.toUpperCase()}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`
      )
      .join("\n\n");
  } else {
    promptText = String(body.prompt || "");
  }

  const provider = model.includes("chatgpt") ? "chatgpt" : "gemini";

  if (!bridgeState.isExtensionConnected()) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: { message: "OmniRoute BEI Chrome Extension not connected on port 58930." },
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

    bridgeState.registerStreamTask(taskId, {
      onChunk: (chunk) => {
        res.write(
          `data: ${JSON.stringify({
            id: `chatcmpl-${taskId}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
          })}\n\n`
        );
      },
      onComplete: () => {
        res.write(
          `data: ${JSON.stringify({
            id: `chatcmpl-${taskId}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          })}\n\n`
        );
        res.write("data: [DONE]\n\n");
        res.end();
      },
      onError: (err) => {
        res.write(`data: ${JSON.stringify({ error: { message: err } })}\n\n`);
        res.end();
      },
    });

    bridgeState.sendToExtension({
      command: "EXECUTE_CHAT",
      taskId,
      payload: { prompt: promptText, provider, taskId },
    });
  } else {
    bridgeState
      .registerPromiseTask(taskId, () => {
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
            id: `chatcmpl-${taskId}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: fullText },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 15, completion_tokens: 35, total_tokens: 50 },
          })
        );
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: err.message || String(err) } }));
      });
  }
}
