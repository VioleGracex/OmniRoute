"""
Check quota and accounts status across Cockpit and OmniRoute.
"""

import os
import sys
import json
import base64
import sqlite3
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

COCKPIT_DIR = os.path.expanduser(r"~\.antigravity_cockpit")
COCKPIT_KEY_FILE = os.path.join(COCKPIT_DIR, "secure-account-storage.key")
COCKPIT_ACCOUNTS_FILE = os.path.join(COCKPIT_DIR, "accounts.json")
COCKPIT_ACCOUNTS_DIR = os.path.join(COCKPIT_DIR, "accounts")
OMNIROUTE_DB_FILE = os.path.join(os.environ.get("APPDATA", ""), "omniroute", "storage.sqlite")

def get_cockpit_key():
    with open(COCKPIT_KEY_FILE, "rb") as f:
        return base64.b64decode(f.read().strip())

def decrypt_account(key, filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    nonce = base64.b64decode(data["nonce"])
    ct = base64.b64decode(data["ciphertext"])
    aesgcm = AESGCM(key)
    return json.loads(aesgcm.decrypt(nonce, ct, None).decode("utf-8"))

def main():
    if not os.path.exists(COCKPIT_KEY_FILE):
        print("Cockpit key file not found.")
        sys.exit(1)

    key = get_cockpit_key()

    with open(COCKPIT_ACCOUNTS_FILE, "r", encoding="utf-8") as f:
        meta = json.load(f)

    current_id = meta.get("current_account_id")

    # Get priorities from OmniRoute DB
    omni_priorities = {}
    if os.path.exists(OMNIROUTE_DB_FILE):
        try:
            conn = sqlite3.connect(OMNIROUTE_DB_FILE)
            for row in conn.cursor().execute("SELECT email, priority, is_active FROM provider_connections WHERE provider='antigravity'").fetchall():
                omni_priorities[row[0]] = {"priority": row[1], "active": row[2]}
            conn.close()
        except Exception:
            pass

    print("\n" + "=" * 80)
    print("                    ANTIGRAVITY ACCOUNTS & QUOTA STATUS")
    print("=" * 80)

    header = f"{'#':<3} {'Email':<32} {'Tier':<12} {'Gemini 5h':<10} {'Claude 5h':<10} {'Priority':<8} {'Status'}"
    print(header)
    print("-" * 80)

    idx = 1
    for acc_info in meta.get("accounts", []):
        acc_id = acc_info["id"]
        filepath = os.path.join(COCKPIT_ACCOUNTS_DIR, f"{acc_id}.json")
        if not os.path.exists(filepath):
            continue

        try:
            acc = decrypt_account(key, filepath)
            email = acc.get("email", acc_info.get("email", "unknown"))
            quota = acc.get("quota", {})
            tier = quota.get("subscription_tier", "pro")
            if tier == "g1-pro-tier":
                tier = "Pro"

            models = {m.get("name"): m.get("percentage") for m in quota.get("models", []) if isinstance(m, dict)}
            
            gemini_5h = f"{models.get('gemini-5h', '?')}%"
            claude_5h = f"{models.get('3p-5h', '?')}%"

            omni_info = omni_priorities.get(email, {})
            prio = omni_info.get("priority", "-")
            is_active = "Active" if omni_info.get("active", 1) == 1 else "Inactive"
            is_current = " [Cockpit Active]" if acc_id == current_id else ""

            print(f"{idx:<3} {email:<32} {tier:<12} {gemini_5h:<10} {claude_5h:<10} {str(prio):<8} {is_active}{is_current}")
            idx += 1
        except Exception as e:
            print(f"{idx:<3} {acc_info.get('email', acc_id):<32} Error: {e}")
            idx += 1

    print("=" * 80)
    print("Tip: OmniRoute automatically load-balances and fails over between active accounts.")
    print("     To set an account as primary: switch-email <email or number>")
    print("=" * 80 + "\n")

if __name__ == "__main__":
    main()
