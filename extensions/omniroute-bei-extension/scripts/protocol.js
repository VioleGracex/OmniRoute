/**
 * OmniRoute BEI Router - Protocol Definitions & Helpers
 * Scoped under __OMNIROUTE_BEI__ to ensure zero namespace collision with MythicFrame or other extensions.
 */

(() => {
  const OmniRouteBEIProtocol = {
    BRIDGE_PORT: 58930,
    ROUTER_PORT: 20128,

    COMMANDS: {
      EXECUTE_CHAT: "EXECUTE_CHAT",
      CHAT_STREAM_CHUNK: "CHAT_STREAM_CHUNK",
      CHAT_COMPLETE: "CHAT_COMPLETE",

      EXECUTE_IMAGE: "EXECUTE_IMAGE",
      IMAGE_COMPLETE: "IMAGE_COMPLETE",

      EXECUTE_MUSIC: "EXECUTE_MUSIC",
      MUSIC_COMPLETE: "MUSIC_COMPLETE",

      CANCEL_TASK: "CANCEL_TASK",
      VERIFY_SESSION: "VERIFY_SESSION",
      LIST_TABS: "LIST_TABS",
    },

    EXT_MSG_PREFIX: "orb_",

    extractGeminiSlot(url) {
      if (!url) return 0;
      try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/u\/(\d+)/);
        if (match) return parseInt(match[1], 10);
      } catch (e) {
        const match = String(url).match(/\/u\/(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
      return 0;
    },

    createMessage(command, payload = {}) {
      return {
        type: `orb_${command}`,
        payload,
        timestamp: Date.now(),
      };
    },
  };

  if (typeof window !== "undefined") {
    window.__OMNIROUTE_BEI__ = OmniRouteBEIProtocol;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.__OMNIROUTE_BEI__ = OmniRouteBEIProtocol;
  }
})();
