#!/usr/bin/env python3
"""
Garmin Authentication Server for OpenCoach

A Flask server that handles Garmin OAuth authentication with MFA support.
Credentials are read from environment variables.

Endpoints:
    GET  /health          - Health check
    GET  /auth/status     - Check if authenticated
    POST /auth/auto-login - Auto-login using env credentials (may require MFA)
    POST /auth/mfa        - Submit MFA code to complete login
    POST /auth/export     - Export current tokens as JSON
"""

import json
import os
import sys
from pathlib import Path
from threading import Lock, Event
from queue import Queue
import time

try:
    import garth
    from garth.http import Client
except ImportError:
    print("Please install garth: pip install garth")
    sys.exit(1)

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("Please install flask and flask-cors: pip install flask flask-cors")
    sys.exit(1)

# Try to load .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = Flask(__name__)
CORS(app, origins=["*"])  # Allow all origins for Docker networking

# Token storage paths
GARTH_DIR = Path(os.environ.get("GARTH_DIR", str(Path.home() / ".garth")))
TOKEN_FILE = Path(os.environ.get("TOKEN_FILE", "/app/data/garmin-tokens.json"))

# Global state for MFA handling
auth_lock = Lock()
mfa_pending = Event()
mfa_code_queue: Queue[str] = Queue()


def get_credentials() -> tuple[str, str]:
    """Get Garmin credentials from environment."""
    email = os.environ.get("GARMIN_EMAIL", "").strip()
    password = os.environ.get("GARMIN_PASSWORD", "")
    return email, password


def test_session() -> dict | None:
    """Test if the current session is valid."""
    try:
        client = Client()
        if GARTH_DIR.exists():
            client.load(str(GARTH_DIR))
        profile = client.connectapi("/userprofile-service/socialProfile")
        return profile
    except Exception:
        return None


def export_tokens() -> dict | None:
    """Export current tokens as JSON."""
    oauth1_path = GARTH_DIR / "oauth1_token.json"
    oauth2_path = GARTH_DIR / "oauth2_token.json"

    if not oauth1_path.exists() or not oauth2_path.exists():
        return None

    with open(oauth1_path) as f:
        oauth1 = json.load(f)
    with open(oauth2_path) as f:
        oauth2 = json.load(f)

    return {"oauth1": oauth1, "oauth2": oauth2}


def save_tokens(client: Client) -> dict | None:
    """Save tokens to disk and return them."""
    GARTH_DIR.mkdir(parents=True, exist_ok=True)
    client.dump(str(GARTH_DIR))
    
    tokens = export_tokens()
    if tokens:
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(TOKEN_FILE, "w") as f:
            json.dump(tokens, f, indent=2)
    return tokens


def mfa_prompt_handler(prompt: str) -> str:
    """Handler called by garth when MFA is required."""
    print(f"🔐 MFA Required: {prompt}")
    print("   Waiting for MFA code via API...")
    
    mfa_pending.set()
    
    try:
        code = mfa_code_queue.get(timeout=300)  # 5 minute timeout
        print(f"   Received MFA code: {code[:2]}****")
        mfa_pending.clear()
        return code
    except Exception:
        mfa_pending.clear()
        raise Exception("MFA timeout - no code received")


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    email, password = get_credentials()
    return jsonify({
        "status": "ok",
        "service": "garmin-auth",
        "hasCredentials": bool(email and password)
    })


@app.route("/auth/status", methods=["GET"])
def auth_status():
    """Check if we have valid tokens."""
    profile = test_session()
    email, password = get_credentials()

    if profile:
        return jsonify({
            "authenticated": True,
            "displayName": profile.get("displayName", "Unknown"),
            "mfaPending": False
        })
    else:
        return jsonify({
            "authenticated": False,
            "mfaPending": mfa_pending.is_set(),
            "hasCredentials": bool(email and password)
        })


@app.route("/auth/auto-login", methods=["POST"])
def auth_auto_login():
    """Attempt automatic login using credentials from environment."""
    email, password = get_credentials()
    
    if not email or not password:
        return jsonify({
            "success": False,
            "error": "GARMIN_EMAIL and GARMIN_PASSWORD environment variables not set"
        }), 400

    # Check if already authenticated
    profile = test_session()
    if profile:
        tokens = export_tokens()
        return jsonify({
            "success": True,
            "displayName": profile.get("displayName", "Unknown"),
            "tokens": tokens,
            "message": "Already authenticated"
        })

    with auth_lock:
        mfa_pending.clear()
        
        try:
            print(f"🔑 Attempting login for {email}...")
            client = Client()
            
            # Monkey-patch input() for MFA handling
            import builtins
            original_input = builtins.input
            builtins.input = mfa_prompt_handler
            
            try:
                client.login(email, password)
            finally:
                builtins.input = original_input
            
            tokens = save_tokens(client)
            profile = test_session()
            
            print("✅ Login successful!")
            
            return jsonify({
                "success": True,
                "displayName": profile.get("displayName", "Unknown") if profile else "Unknown",
                "tokens": tokens
            })

        except Exception as e:
            error_msg = str(e)
            print(f"❌ Login error: {error_msg}")
            
            if mfa_pending.is_set():
                return jsonify({
                    "success": False,
                    "mfaRequired": True,
                    "message": "Enter the MFA code from your authenticator app"
                })
            
            return jsonify({
                "success": False,
                "error": f"Login failed: {error_msg}"
            }), 401


@app.route("/auth/mfa", methods=["POST"])
def auth_mfa():
    """Submit MFA code to complete pending login."""
    data = request.get_json() or {}
    mfa_code = data.get("code", "").strip()

    if not mfa_code:
        return jsonify({"success": False, "error": "MFA code required"}), 400

    if not mfa_pending.is_set():
        return jsonify({
            "success": False, 
            "error": "No pending MFA challenge. Try /auth/auto-login first."
        }), 400

    print(f"📱 Received MFA code: {mfa_code[:2]}****")
    mfa_code_queue.put(mfa_code)
    
    time.sleep(2)  # Wait for login to complete
    
    profile = test_session()
    if profile:
        tokens = export_tokens()
        return jsonify({
            "success": True,
            "displayName": profile.get("displayName", "Unknown"),
            "tokens": tokens
        })
    
    if mfa_pending.is_set():
        return jsonify({
            "success": False,
            "error": "MFA verification in progress, please wait...",
            "mfaPending": True
        })
    
    return jsonify({
        "success": False,
        "error": "MFA verification failed. Try again."
    }), 401


@app.route("/auth/export", methods=["POST"])
def auth_export():
    """Export current tokens."""
    tokens = export_tokens()
    if tokens:
        return jsonify({"success": True, "tokens": tokens})
    return jsonify({"success": False, "error": "No tokens available"}), 404


def main():
    """Run the auth server."""
    email, password = get_credentials()
    
    print("🏃 Garmin Authentication Server for OpenCoach")
    print("=" * 55)
    print()
    
    if email:
        print(f"✅ Credentials loaded for: {email}")
    else:
        print("⚠️  No credentials found!")
        print("   Set GARMIN_EMAIL and GARMIN_PASSWORD environment variables")
    
    print()
    print(f"📁 Token storage: {GARTH_DIR}")
    print(f"📄 Export file: {TOKEN_FILE}")
    print()
    
    host = os.environ.get("AUTH_HOST", "0.0.0.0")
    port = int(os.environ.get("AUTH_PORT", "5050"))
    
    print(f"🌐 Server starting on http://{host}:{port}")
    print()
    print("Endpoints:")
    print("  GET  /health          - Health check")
    print("  GET  /auth/status     - Check authentication status")
    print("  POST /auth/auto-login - Auto-login with env credentials")
    print("  POST /auth/mfa        - Submit MFA code")
    print("  POST /auth/export     - Export tokens")
    print()
    
    app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == "__main__":
    main()


