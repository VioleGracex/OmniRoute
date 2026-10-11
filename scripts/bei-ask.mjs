#!/usr/bin/env node

/**
 * OmniRoute BEI CLI Client
 * Sends prompt to the local BEI bridge (:58930) or OmniRoute (:20128)
 * and streams/returns the response from the browser session.
 */

import http from 'node:http';

const BRIDGE_HOST = '127.0.0.1';
const BRIDGE_PORT = 58930;

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node scripts/bei-ask.mjs "<prompt>" [--provider gemini|chatgpt]');
  process.exit(0);
}

let provider = 'gemini';
let promptText = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--provider' && args[i + 1]) {
    provider = args[i + 1];
    i++;
  } else {
    promptText += (promptText ? ' ' : '') + args[i];
  }
}

async function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://${BRIDGE_HOST}:${BRIDGE_PORT}/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(2000, () => { req.destroy(); resolve(null); });
  });
}

async function askBEI(prompt, providerName) {
  const health = await checkHealth();
  if (!health) {
    console.error(`[BEI Error] Bridge daemon not responding on port ${BRIDGE_PORT}. Is it running?`);
    process.exit(1);
  }

  if (!health.extensionConnected) {
    console.error(`[BEI Error] Extension is not connected to the bridge.`);
    console.error(`Please make sure Chrome is open with the OmniRoute BEI extension loaded and active.`);
    process.exit(1);
  }

  if (!health.activeTabsCount) {
    console.error(`[BEI Error] No active provider tabs found in Chrome.`);
    console.error(`Please open https://gemini.google.com or https://chatgpt.com in Chrome.`);
    process.exit(1);
  }

  const payload = JSON.stringify({
    model: `bei/${providerName}-web`,
    messages: [{ role: 'user', content: prompt }],
    stream: false
  });

  const req = http.request({
    hostname: BRIDGE_HOST,
    port: BRIDGE_PORT,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(raw);
        if (json.choices && json.choices[0] && json.choices[0].message) {
          console.log(json.choices[0].message.content);
        } else if (json.error) {
          console.error('[BEI Error]', json.error);
        } else {
          console.log(raw);
        }
      } catch {
        console.log(raw);
      }
    });
  });

  req.on('error', (err) => {
    console.error('[BEI Request Error]', err.message);
  });

  req.write(payload);
  req.end();
}

askBEI(promptText, provider);
