"""
Production entrypoint for Render.
- Installs deps into ./_deps if missing (avoids system pip / PEP 668 errors)
- Loads server.py by absolute path
- Serves on 0.0.0.0:$PORT
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEPS = ROOT / "_deps"


def ensure_deps() -> None:
    """Make sure flask + waitress can be imported."""
    if str(DEPS) not in sys.path:
        sys.path.insert(0, str(DEPS))

    try:
        import flask  # noqa: F401
        import waitress  # noqa: F401
        print("[SubSaverPH] deps already available", flush=True)
        return
    except ImportError as e:
        print(f"[SubSaverPH] missing package ({e}) — installing into {DEPS}", flush=True)

    req = ROOT / "requirements.txt"
    if not req.is_file():
        raise FileNotFoundError(f"requirements.txt not found at {req}")

    DEPS.mkdir(parents=True, exist_ok=True)

    # Install into local _deps folder (works without root / bypasses externally-managed-env)
    cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--target",
        str(DEPS),
        "--upgrade",
        "-r",
        str(req),
    ]
    print("[SubSaverPH] running:", " ".join(cmd), flush=True)
    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError:
        # Last resort for distros that block pip without this flag
        cmd2 = [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--target",
            str(DEPS),
            "--break-system-packages",
            "-r",
            str(req),
        ]
        print("[SubSaverPH] retry with --break-system-packages:", flush=True)
        subprocess.check_call(cmd2)

    if str(DEPS) not in sys.path:
        sys.path.insert(0, str(DEPS))

    import flask  # noqa: F401
    import waitress  # noqa: F401
    print("[SubSaverPH] deps installed OK", flush=True)


def load_app():
    os.chdir(ROOT)
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    if str(DEPS) not in sys.path:
        sys.path.insert(0, str(DEPS))

    server_path = ROOT / "server.py"
    if not server_path.is_file():
        raise FileNotFoundError(f"server.py not found at {server_path}")

    # Ensure common vendor dirs are importable
    for p in (DEPS, ROOT):
        sp = str(p)
        if sp not in sys.path:
            sys.path.insert(0, sp)

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

    os.chdir(ROOT)
    print(f"[SubSaverPH] root={ROOT}", flush=True)
    print(f"[SubSaverPH] executable={sys.executable}", flush=True)
    print(f"[SubSaverPH] python={sys.version}", flush=True)
    print(f"[SubSaverPH] port={port}", flush=True)

    try:
        ensure_deps()
        app = load_app()
        print("[SubSaverPH] import OK", flush=True)
    except Exception as e:
        print(f"[SubSaverPH] FATAL import/store error: {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        sys.stderr.flush()
        sys.stdout.flush()
        sys.exit(1)

    try:
        from waitress import serve

        print("[SubSaverPH] starting waitress...", flush=True)
        serve(app, host="0.0.0.0", port=port, threads=4)
        return
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
