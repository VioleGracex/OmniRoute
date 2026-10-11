# 🚀 OmniRoute BEI - Complete Setup Guide

Welcome to **OmniRoute BEI**! This setup allows you to route **AI Chat/Code Reasoning, Image Generation, and Music Generation** directly through your active web browser sessions (Gemini, ChatGPT, and Suno) with **zero API keys, zero credit card billing, and zero API quota consumption**.

---

## ⚡ 3-Step Setup

### Step 1: Install the Chrome Extension

1. Open Google Chrome and go to:
   ```text
   chrome://extensions/
   ```
2. Enable the **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked** (top-left).
4. Select the folder:
   ```text
   extensions\omniroute-bei-extension
   ```
5. You will see the **OmniRoute BEI Router** extension icon appear. Its badge will turn cyan with **`ROUTER`** when connected!

---

### Step 2: Open Your Preferred Web Services

Open normal tabs in Chrome for the models you want to use:

- **Chat & Coding & Imagen 3**: [https://gemini.google.com](https://gemini.google.com) (or [https://chatgpt.com](https://chatgpt.com))
- **Music & Audio**: [https://suno.com/create](https://suno.com/create)

Make sure you are logged into your regular accounts in those tabs. The extension will automatically organize them into a clean cyan **`OmniRoute BEI`** tab group.

---

### Step 3: Start OmniRoute & The BEI Bridge

Just double-click:

```text
run.cmd
```

That's it! Both the BEI Bridge (`127.0.0.1:58930`) and OmniRoute Gateway (`localhost:20128`) will start up automatically.

---

## 🎯 How to Use

### 1. In Any Browser (Web Dashboard)

Open [http://localhost:20128/dashboard](http://localhost:20128/dashboard) to see all active providers, models, and live usage stats.

### 2. In Coding Agents (Claude Code, Cursor, Cline, etc.)

Point your agent to:

- **Base URL**: `http://localhost:20128`
- **Supported Models**:
  - `bei/gemini-web` (Web Gemini Pro/Advanced reasoning)
  - `bei/chatgpt-web` (Web ChatGPT 4o/o1 reasoning)
  - `bei/imagen-3` (Google Imagen 3 image generation)
  - `bei/dall-e-3` (OpenAI DALL-E 3 image generation)
  - `bei/suno-music` (Suno music generation)

---

## 🔒 Isolation & Safety Note

This extension runs on dedicated port **58930** and uses isolated tab messaging. If you also use MythicFrame BEI (port 58925), both can run concurrently on your computer with **zero conflicts or port collisions**.
