import crypto from "node:crypto";

export async function handleImageGenerations(req, res, body, bridgeState) {
  const model = body.model || "bei/imagen-3";
  const prompt = body.prompt || "";
  const taskId = `img_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const provider = model.includes("dall-e") ? "chatgpt" : "gemini";

  if (!bridgeState.isExtensionConnected()) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "BEI Extension not connected." } }));
    return;
  }

  bridgeState
    .registerPromiseTask(taskId, () => {
      bridgeState.sendToExtension({
        command: "EXECUTE_IMAGE",
        taskId,
        payload: { prompt, provider, taskId },
      });
    })
    .then((result) => {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        JSON.stringify({
          created: Math.floor(Date.now() / 1000),
          data: [{ url: result.url || result }],
        })
      );
    })
    .catch((err) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: err.message || String(err) } }));
    });
}
