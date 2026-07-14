"""
Production entrypoint for Render.
Always chdirs to this file's folder so `import server` works.
"""
from __future__ import annotations

import os
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> None:
    # Critical on Render: ensure project root is on sys.path and is cwd
    os.chdir(ROOT)
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    try:
        port = int(os.environ.get("PORT") or "10000")
    except ValueError:
        port = 10000

    print(f"[SubSaverPH] root={ROOT}", flush=True)
    print(f"[SubSaverPH] cwd={os.getcwd()}", flush=True)
    print(f"[SubSaverPH] python={sys.version}", flush=True)
    print(f"[SubSaverPH] port={port}", flush=True)
    print(f"[SubSaverPH] files={os.listdir(ROOT)[:20]}", flush=True)

    try:
        import server as server_module

        app = server_module.app
        if hasattr(server_module, "ensure_store"):
            server_module.ensure_store()
        print("[SubSaverPH] import OK", flush=True)
    except Exception as e:
        print(f"[SubSaverPH] FATAL import/store error: {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        sys.stderr.flush()
        sys.stdout.flush()
        sys.exit(1)

    # Prefer waitress
    try:
        from waitress import serve

        print("[SubSaverPH] starting waitress...", flush=True)
        serve(app, host="0.0.0.0", port=port, threads=4)
        return
    except ImportError:
        print("[SubSaverPH] waitress not installed, using Flask", flush=True)
    except Exception as e:
        print(f"[SubSaverPH] waitress failed: {e}", flush=True)
        traceback.print_exc()

    try:
        print("[SubSaverPH] starting Flask...", flush=True)
        app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
    except Exception as e:
        print(f"[SubSaverPH] FATAL run error: {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
