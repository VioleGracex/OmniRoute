/**
 * Register OmniRoute BEI as an upstream provider in OmniRoute storage.sqlite.
 * Pointing to http://127.0.0.1:58930/v1
 */

import sqlite3 from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const DB_PATH = join(os.homedir(), "AppData", "Roaming", "omniroute", "storage.sqlite");

if (!existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`);
  process.exit(1);
}

const db = sqlite3(DB_PATH);

const connectionId = "bei-bridge-local";
const provider = "openai";
const name = "OmniRoute BEI (Browser Extension)";
const baseUrl = "http://127.0.0.1:58930/v1";
const providerSpecificData = JSON.stringify({
  baseUrl,
  isBeiBridge: true,
  supportedModalities: ["chat", "images", "music"],
});

try {
  const existing = db.prepare("SELECT id FROM provider_connections WHERE id = ?").get(connectionId);

  if (existing) {
    db.prepare(
      `
      UPDATE provider_connections 
      SET is_active = 1, priority = 10, provider_specific_data = ?, updated_at = datetime('now')
      WHERE id = ?
    `
    ).run(providerSpecificData, connectionId);
    console.log(`[OK] Updated existing BEI provider connection: ${connectionId}`);
  } else {
    db.prepare(
      `
      INSERT INTO provider_connections (
        id, provider, auth_type, name, priority, is_active, api_key, 
        provider_specific_data, default_model, created_at, updated_at
      ) VALUES (
        ?, ?, 'apikey', ?, 10, 1, 'omniroute-bei-local-token',
        ?, 'bei/gemini-web', datetime('now'), datetime('now')
      )
    `
    ).run(connectionId, provider, name, providerSpecificData);
    console.log(`[OK] Registered new BEI provider connection: ${connectionId}`);
  }

  console.log(`[OK] OmniRoute BEI bridge registered at ${baseUrl}`);
  console.log(
    `Models available: bei/gemini-web, bei/chatgpt-web, bei/imagen-3, bei/dall-e-3, bei/suno-music`
  );
} catch (err) {
  console.error("[Error] Failed to register BEI provider:", err.message);
} finally {
  db.close();
}
