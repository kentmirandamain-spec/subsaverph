"""
Production entrypoint for Render.
Ensures dependencies exist, loads server.py by path, serves on $PORT.
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def ensure_deps() -> None:
    """Install requirements if flask is missing (covers broken Render build steps)."""
    try:
        import flask  # noqa: F401
        import waitress  # noqa: F401
        return
    except ImportError:
        print("[SubSaverPH] flask/waitress missing — installing requirements.txt ...", flush=True)

    req = ROOT / "requirements.txt"
    if not req.is_file():
        raise FileNotFoundError(f"requirements.txt not found at {req}")

    cmd = [sys.executable, "-m", "pip", "install", "--upgrade", "pip"]
    print("[SubSaverPH] running:", " ".join(cmd), flush=True)
    subprocess.check_call(cmd)

    cmd = [sys.executable, "-m", "pip", "install", "-r", str(req)]
    print("[SubSaverPH] running:", " ".join(cmd), flush=True)
    subprocess.check_call(cmd)

    import flask  # noqa: F401
    import waitress  # noqa: F401
    print("[SubSaverPH] dependencies installed OK", flush=True)


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
    print(f"[SubSaverPH] executable={sys.executable}", flush=True)
    print(f"[SubSaverPH] python={sys.version}", flush=True)
    print(f"[SubSaverPH] port={port}", flush=True)

    try:
        ensure_deps()
        app = load_app()
        print("[SubSaverPH] import OK", flush=True)
    except Exception as e:
        print(f"[SubSaverPH] FATAL import/store error: {type(e).__name__}: {e}", flush=True)
        import traceback

        traceback.print_exc()
        sys.stderr.flush()
        sys.stdout.flush()
        sys.exit(1)

    try:
        from waitress import serve

        print("[SubSaverPH] starting waitress...", flush=True)
        serve(app, host="0.0.0.0", port=port, threads=4)
    except Exception as e:
        print(f"[SubSaverPH] waitress failed: {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        print("[SubSaverPH] falling back to Flask...", flush=True)
        try:
            app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
        except Exception as e2:
            print(f"[SubSaverPH] FATAL run error: {type(e2).__name__}: {e2}", flush=True)
            traceback.print_exc()
            sys.exit(1)


if __name__ == "__main__":
    main()
