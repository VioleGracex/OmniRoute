export class BridgeState {
  constructor() {
    this.ws = null;
    this.streamTasks = new Map();
    this.promiseTasks = new Map();
    this.tabs = [];
  }

  setExtensionSocket(ws) {
    this.ws = ws;
    console.log("[BridgeState] Chrome Extension WebSocket connected.");
  }

  clearExtensionSocket() {
    this.ws = null;
    console.log("[BridgeState] Chrome Extension WebSocket disconnected.");
  }

  isExtensionConnected() {
    return Boolean(this.ws && this.ws.readyState === 1); // 1 = OPEN
  }

  sendToExtension(data) {
    if (!this.isExtensionConnected()) {
      throw new Error("Extension is not connected.");
    }
    this.ws.send(JSON.stringify(data));
  }

  registerStreamTask(taskId, handlers) {
    this.streamTasks.set(taskId, handlers);
  }

  registerPromiseTask(taskId, executor) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.promiseTasks.delete(taskId);
        reject(new Error(`Task ${taskId} timed out after 120s.`));
      }, 120000);

      this.promiseTasks.set(taskId, { resolve, reject, timer });
      try {
        executor();
      } catch (err) {
        clearTimeout(timer);
        this.promiseTasks.delete(taskId);
        reject(err);
      }
    });
  }

  handleExtensionMessage(msg) {
    const { command, payload } = msg;

    if (command === "TABS_INVENTORY") {
      this.tabs = payload.tabs || [];
      return;
    }

    const taskId = payload?.taskId;
    if (!taskId) return;

    if (command === "CHAT_STREAM_CHUNK") {
      const stream = this.streamTasks.get(taskId);
      if (stream && stream.onChunk) {
        stream.onChunk(payload.chunk);
      }
    } else if (command === "CHAT_COMPLETE") {
      const stream = this.streamTasks.get(taskId);
      if (stream && stream.onComplete) {
        stream.onComplete(payload.text);
        this.streamTasks.delete(taskId);
      }

      const prom = this.promiseTasks.get(taskId);
      if (prom) {
        clearTimeout(prom.timer);
        prom.resolve(payload.text);
        this.promiseTasks.delete(taskId);
      }
    } else if (command === "IMAGE_COMPLETE") {
      const prom = this.promiseTasks.get(taskId);
      if (prom) {
        clearTimeout(prom.timer);
        if (payload.error) {
          prom.reject(new Error(payload.error));
        } else {
          prom.resolve(payload);
        }
        this.promiseTasks.delete(taskId);
      }
    } else if (command === "MUSIC_COMPLETE") {
      const prom = this.promiseTasks.get(taskId);
      if (prom) {
        clearTimeout(prom.timer);
        if (payload.error) {
          prom.reject(new Error(payload.error));
        } else {
          prom.resolve(payload);
        }
        this.promiseTasks.delete(taskId);
      }
    } else if (command === "TASK_ERROR") {
      const stream = this.streamTasks.get(taskId);
      if (stream && stream.onError) {
        stream.onError(payload.error || "Unknown task error");
        this.streamTasks.delete(taskId);
      }

      const prom = this.promiseTasks.get(taskId);
      if (prom) {
        clearTimeout(prom.timer);
        prom.reject(new Error(payload.error || "Task error"));
        this.promiseTasks.delete(taskId);
      }
    }
  }
}
