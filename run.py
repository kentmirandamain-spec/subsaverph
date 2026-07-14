"""
Production entrypoint for Render.
Loads server.py by file path (avoids name clashes) and binds 0.0.0.0:$PORT.
"""
from __future__ import annotations

import importlib.util
import os
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_app():
    os.chdir(ROOT)
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    server_path = ROOT / "server.py"
    if not server_path.is_file():
        raise FileNotFoundError(f"server.py not found at {server_path}")

    spec = importlib.util.spec_from_file_location("subsaverph_server", server_path)
    if spec is None or spec.loader is None:
        raise ImportError("Could not load server.py")

    mod = importlib.util.module_from_spec(spec)
    sys.modules["subsaverph_server"] = mod
    spec.loader.exec_module(mod)

    if hasattr(mod, "ensure_store"):
        mod.ensure_store()
    return mod.app


def main() -> None:
    try:
        port = int(os.environ.get("PORT") or "10000")
    except ValueError:
        port = 10000

    print(f"[SubSaverPH] root={ROOT}", flush=True)
    print(f"[SubSaverPH] cwd={os.getcwd()}", flush=True)
    print(f"[SubSaverPH] python={sys.version}", flush=True)
    print(f"[SubSaverPH] port={port}", flush=True)
    try:
        print(f"[SubSaverPH] listing={sorted(os.listdir(ROOT))[:30]}", flush=True)
    except Exception as e:
        print(f"[SubSaverPH] listdir error: {e}", flush=True)

    try:
        app = load_app()
        print("[SubSaverPH] import OK", flush=True)
    except Exception as e:
        print(f"[SubSaverPH] FATAL import/store error: {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        sys.stderr.flush()
        sys.stdout.flush()
        sys.exit(1)

    # waitress preferred
    try:
        from waitress import serve

        print("[SubSaverPH] starting waitress...", flush=True)
        serve(app, host="0.0.0.0", port=port, threads=4)
        return
    except ImportError:
        print("[SubSaverPH] waitress not installed — using Flask", flush=True)
    except Exception as e:
        print(f"[SubSaverPH] waitress error: {type(e).__name__}: {e}", flush=True)
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
