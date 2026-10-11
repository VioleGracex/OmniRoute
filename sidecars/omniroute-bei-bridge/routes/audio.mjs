import crypto from "node:crypto";

export async function handleAudioMusicGenerations(req, res, body, bridgeState) {
  const prompt = body.prompt || body.style || "";
  const taskId = `music_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  if (!bridgeState.isExtensionConnected()) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "BEI Extension not connected." } }));
    return;
  }

  bridgeState
    .registerPromiseTask(taskId, () => {
      bridgeState.sendToExtension({
        command: "EXECUTE_MUSIC",
        taskId,
        payload: { prompt, style: body.style, title: body.title, taskId, provider: "suno" },
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
          data: [
            {
              url: result.audioUrl || result.url || result,
              title: result.title || "Generated Track",
            },
          ],
        })
      );
    })
    .catch((err) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: err.message || String(err) } }));
    });
}
