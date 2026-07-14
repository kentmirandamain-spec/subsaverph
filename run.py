"""
Production entrypoint for Render / Linux hosts.
Usage: python3 run.py
"""
from __future__ import annotations

import os
import sys
import traceback


def main() -> None:
    try:
        port = int(os.environ.get("PORT") or "10000")
    except ValueError:
        port = 10000

    print(f"[SubSaverPH] starting on 0.0.0.0:{port}", flush=True)
    print(f"[SubSaverPH] python={sys.version}", flush=True)
    print(f"[SubSaverPH] cwd={os.getcwd()}", flush=True)

    try:
        from server import app, ensure_store

        ensure_store()
        print("[SubSaverPH] store ready", flush=True)
    except Exception:
        print("[SubSaverPH] FATAL import/store error:", flush=True)
        traceback.print_exc()
        sys.exit(1)

    # Prefer waitress if installed; else Flask built-in server
    try:
        from waitress import serve

        print("[SubSaverPH] using waitress", flush=True)
        serve(app, host="0.0.0.0", port=port, threads=4)
    except ImportError:
        print("[SubSaverPH] waitress missing, using Flask server", flush=True)
        try:
            app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
        except Exception:
            print("[SubSaverPH] FATAL run error:", flush=True)
            traceback.print_exc()
            sys.exit(1)


if __name__ == "__main__":
    main()
