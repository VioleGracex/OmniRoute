"""
Switch the primary Antigravity account in OmniRoute and Cockpit Tools.
Usage: python switch-account.py <number or email>
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
COCKPIT_CURRENT_FILE = os.path.join(COCKPIT_DIR, "current_account.json")
COCKPIT_ACCOUNTS_DIR = os.path.join(COCKPIT_DIR, "accounts")
OMNIROUTE_DB_FILE = os.path.join(os.environ.get("APPDATA", ""), "omniroute", "storage.sqlite")

def main():
    if len(sys.argv) < 2:
        print("Usage: switch-email <number 1-5 or email>")
        sys.exit(1)

    target_query = sys.argv[1].strip().lower()

    with open(COCKPIT_ACCOUNTS_FILE, "r", encoding="utf-8") as f:
        meta = json.load(f)

    accounts = meta.get("accounts", [])
    chosen_account = None

    # Check if number
    if target_query.isdigit():
        idx = int(target_query) - 1
        if 0 <= idx < len(accounts):
            chosen_account = accounts[idx]
    else:
        for acc in accounts:
            if target_query in acc.get("email", "").lower():
                chosen_account = acc
                break

    if not chosen_account:
        print(f"Account matching '{target_query}' not found.")
        print("Available accounts:")
        for i, acc in enumerate(accounts, 1):
            print(f"  {i}. {acc.get('email')}")
        sys.exit(1)

    chosen_email = chosen_account["email"]
    chosen_id = chosen_account["id"]

    print(f"\nSetting '{chosen_email}' as primary (Priority 1)...")

    # Update OmniRoute SQLite DB
    if os.path.exists(OMNIROUTE_DB_FILE):
        conn = sqlite3.connect(OMNIROUTE_DB_FILE)
        cursor = conn.cursor()
        
        # Get all antigravity connections
        rows = cursor.execute("SELECT id, email, priority FROM provider_connections WHERE provider='antigravity'").fetchall()
        
        # Re-assign priorities so chosen is 1
        other_emails = [r[1] for r in rows if r[1] != chosen_email]
        
        cursor.execute("UPDATE provider_connections SET priority=1, is_active=1 WHERE provider='antigravity' AND email=?", (chosen_email,))
        
        p = 2
        for e in other_emails:
            cursor.execute("UPDATE provider_connections SET priority=? WHERE provider='antigravity' AND email=?", (p, e))
            p += 1
            
        conn.commit()
        conn.close()
        print("[OK] Updated OmniRoute priorities.")

    # Update Cockpit active account
    meta["current_account_id"] = chosen_id
    with open(COCKPIT_ACCOUNTS_FILE, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    with open(COCKPIT_CURRENT_FILE, "w", encoding="utf-8") as f:
        json.dump({"account_id": chosen_id}, f, indent=2)

    print("[OK] Updated Cockpit active account.")
    print(f"Successfully switched primary account to: {chosen_email}\n")

if __name__ == "__main__":
    main()
