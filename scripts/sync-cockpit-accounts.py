"""
Sync Cockpit Tools accounts to OmniRoute storage.sqlite
Extracts AES-256-GCM encrypted Google Antigravity accounts from Cockpit Tools
and inserts/updates them into OmniRoute's SQLite database with OmniRoute field encryption.
"""

import os
import sys
import json
import uuid
import sqlite3
import base64
import hashlib
from datetime import datetime, timezone
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

COCKPIT_DIR = os.path.expanduser(r"~\.antigravity_cockpit")
COCKPIT_KEY_FILE = os.path.join(COCKPIT_DIR, "secure-account-storage.key")
COCKPIT_ACCOUNTS_FILE = os.path.join(COCKPIT_DIR, "accounts.json")
COCKPIT_ACCOUNTS_DIR = os.path.join(COCKPIT_DIR, "accounts")

OMNIROUTE_DIR = os.path.join(os.environ.get("APPDATA", ""), "omniroute")
OMNIROUTE_ENV_FILE = os.path.join(OMNIROUTE_DIR, "server.env")
OMNIROUTE_DB_FILE = os.path.join(OMNIROUTE_DIR, "storage.sqlite")

def get_cockpit_key():
    with open(COCKPIT_KEY_FILE, "rb") as f:
        return base64.b64decode(f.read().strip())

def decrypt_cockpit_account(cockpit_key, filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    nonce = base64.b64decode(data["nonce"])
    ct = base64.b64decode(data["ciphertext"])
    aesgcm = AESGCM(cockpit_key)
    plaintext = aesgcm.decrypt(nonce, ct, None)
    return json.loads(plaintext.decode("utf-8"))

def get_omniroute_key():
    secret = None
    with open(OMNIROUTE_ENV_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("STORAGE_ENCRYPTION_KEY="):
                secret = line.split("=", 1)[1].strip()
                break
    if not secret:
        raise ValueError("STORAGE_ENCRYPTION_KEY not found in server.env")
    salt = b"omniroute-field-encryption-v1"
    return hashlib.scrypt(secret.encode("utf-8"), salt=salt, n=16384, r=8, p=1, maxmem=0, dklen=32)

def encrypt_omniroute(key, plaintext):
    if not plaintext:
        return None
    iv = os.urandom(16)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    tag = ct[-16:]
    ciphertext = ct[:-16]
    return f"enc:v1:{iv.hex()}:{ciphertext.hex()}:{tag.hex()}"

def sync(dry_run=False):
    print(f"=== Syncing Cockpit Tools accounts to OmniRoute (dry_run={dry_run}) ===")
    cockpit_key = get_cockpit_key()
    omniroute_key = get_omniroute_key()

    with open(COCKPIT_ACCOUNTS_FILE, "r", encoding="utf-8") as f:
        accounts_meta = json.load(f)

    conn = sqlite3.connect(OMNIROUTE_DB_FILE)
    cursor = conn.cursor()

    existing_rows = {
        row[1]: row[0]
        for row in cursor.execute("SELECT id, email FROM provider_connections WHERE provider='antigravity'").fetchall()
    }

    now_iso = datetime.now(timezone.utc).isoformat()
    scope = (
        "https://www.googleapis.com/auth/userinfo.email "
        "https://www.googleapis.com/auth/userinfo.profile openid "
        "https://www.googleapis.com/auth/cclog "
        "https://www.googleapis.com/auth/cloud-platform "
        "https://www.googleapis.com/auth/experimentsandconfigs"
    )

    accounts_synced = 0
    for idx, acc_entry in enumerate(accounts_meta.get("accounts", [])):
        acc_id = acc_entry["id"]
        acc_file = os.path.join(COCKPIT_ACCOUNTS_DIR, f"{acc_id}.json")
        if not os.path.exists(acc_file):
            continue

        acc_data = decrypt_cockpit_account(cockpit_key, acc_file)
        email = acc_data.get("email")
        name = acc_data.get("name", email)
        token_info = acc_data.get("token", {})
        quota_info = acc_data.get("quota", {})

        access_token = token_info.get("access_token")
        refresh_token = token_info.get("refresh_token")
        id_token = token_info.get("id_token")
        expiry_ts = token_info.get("expiry_timestamp")
        expires_in = token_info.get("expires_in", 3599)

        if expiry_ts:
            expires_at = datetime.fromtimestamp(expiry_ts, tz=timezone.utc).isoformat()
        else:
            expires_at = now_iso

        enc_access_token = encrypt_omniroute(omniroute_key, access_token)
        enc_refresh_token = encrypt_omniroute(omniroute_key, refresh_token)
        enc_id_token = encrypt_omniroute(omniroute_key, id_token) if id_token else None

        tier = quota_info.get("tier_id", "standard-tier")
        sub_tier = quota_info.get("subscription_tier", "Antigravity (Restricted)")
        proj_id = quota_info.get("project_id") or ""

        specific_data = json.dumps({
            "clientProfile": "ide",
            "projectId": proj_id,
            "tier": tier,
            "subscriptionTier": sub_tier,
            "plan": "Business"
        })

        if email in existing_rows:
            conn_id = existing_rows[email]
            print(f"[{idx+1}] Updating account: {email}")
            if not dry_run:
                cursor.execute("""
                    UPDATE provider_connections
                    SET name = ?,
                        is_active = 1,
                        access_token = ?,
                        refresh_token = ?,
                        id_token = ?,
                        expires_at = ?,
                        token_expires_at = ?,
                        expires_in = ?,
                        scope = ?,
                        project_id = ?,
                        test_status = 'active',
                        provider_specific_data = ?,
                        updated_at = ?
                    WHERE id = ?
                """, (
                    email, enc_access_token, enc_refresh_token, enc_id_token,
                    expires_at, expires_at, expires_in, scope, proj_id or None,
                    specific_data, now_iso, conn_id
                ))
        else:
            conn_id = str(uuid.uuid4())
            print(f"[{idx+1}] Adding new account: {email}")
            if not dry_run:
                cursor.execute("""
                    INSERT INTO provider_connections (
                        id, provider, auth_type, name, email, priority, is_active,
                        access_token, refresh_token, id_token, expires_at, token_expires_at,
                        expires_in, scope, project_id, test_status, provider_specific_data,
                        proxy_enabled, per_key_proxy_enabled, quota_visible,
                        consecutive_use_count, rate_limit_protection, created_at, updated_at
                    ) VALUES (
                        ?, 'antigravity', 'oauth', ?, ?, ?, 1,
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, 'active', ?,
                        1, 0, 1,
                        0, 0, ?, ?
                    )
                """, (
                    conn_id, email, email, idx + 1,
                    enc_access_token, enc_refresh_token, enc_id_token, expires_at, expires_at,
                    expires_in, scope, proj_id or None, specific_data,
                    now_iso, now_iso
                ))

        accounts_synced += 1

    if not dry_run:
        conn.commit()
        print(f"Successfully synced {accounts_synced} accounts to OmniRoute!")
    conn.close()

if __name__ == "__main__":
    dry_run = "--apply" not in sys.argv
    sync(dry_run=dry_run)
