"""
Fast, bulletproof health-check and auto-launcher for OmniRoute server.
"""

import os
import sys
import time
import subprocess
import urllib.request
import webbrowser

PORT = 20128
URL = f"http://127.0.0.1:{PORT}"
OMNIROUTE_DIR = r"D:\OmniRoute"

def is_server_running():
    try:
        req = urllib.request.Request(URL, headers={"User-Agent": "omniroute-probe"})
        with urllib.request.urlopen(req, timeout=0.8) as res:
            return res.status in (200, 301, 302, 307, 308, 404)
    except Exception:
        return False

def start_server():
    print("[OmniRoute] Server is offline. Starting in background...", flush=True)
    
    # Detached background process on Windows
    DETACHED_PROCESS = 0x00000008
    CREATE_NO_WINDOW = 0x08000000
    creationflags = DETACHED_PROCESS | CREATE_NO_WINDOW
    
    cmd = ["node.exe", "--max-old-space-size=8192", "scripts/dev/run-next.mjs", "dev"]
    
    subprocess.Popen(
        cmd,
        cwd=OMNIROUTE_DIR,
        creationflags=creationflags,
        close_fds=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL
    )

    # Wait for server to become ready
    max_wait = 35
    start_time = time.time()
    while time.time() - start_time < max_wait:
        time.sleep(1)
        if is_server_running():
            elapsed = int(time.time() - start_time)
            print(f"[OmniRoute] Server is ready on {URL} (took {elapsed}s)", flush=True)
            return True
            
    print("[OmniRoute] Server startup is taking longer than usual, proceeding...", flush=True)
    return False

def main():
    open_browser = "--open" in sys.argv or "--browser" in sys.argv
    
    if not is_server_running():
        start_server()
        
    if open_browser:
        webbrowser.open(f"http://localhost:{PORT}/dashboard")

if __name__ == "__main__":
    main()
