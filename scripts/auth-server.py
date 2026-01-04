#!/usr/bin/env python3
"""
Garmin Authentication Server

A local HTTP server that handles Garmin authentication with MFA support.
Credentials are read from environment variables for automatic re-login.

Usage:
    # Set credentials in .env file or environment:
    export GARMIN_EMAIL="your@email.com"
    export GARMIN_PASSWORD="yourpassword"
    
    # Run the server:
    uv run --python 3.12 --with garth --with flask --with flask-cors python scripts/auth-server.py

The server runs on http://localhost:5050 and provides these endpoints:
    POST /auth/auto-login  - Auto-login using env credentials (may require MFA)
    POST /auth/mfa         - Submit MFA code to complete login
    GET  /auth/status      - Check if we have valid tokens
    POST /auth/export      - Export current tokens as JSON
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
    pass  # dotenv is optional

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173", "*"])

GARTH_DIR = Path.home() / ".garth"
TOKEN_FILE = Path("garmin-tokens.json")

# Global state
auth_lock = Lock()
mfa_pending = Event()
mfa_code_queue: Queue[str] = Queue()
login_result: dict | None = None


def get_credentials() -> tuple[str, str]:
    """Get Garmin credentials from environment."""
    email = os.environ.get("GARMIN_EMAIL", "").strip()
    password = os.environ.get("GARMIN_PASSWORD", "")
    return email, password


def test_session() -> dict | None:
    """Test if the current session is valid. Returns profile if valid, None otherwise."""
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
    GARTH_DIR.mkdir(exist_ok=True)
    client.dump(str(GARTH_DIR))
    
    tokens = export_tokens()
    if tokens:
        with open(TOKEN_FILE, "w") as f:
            json.dump(tokens, f, indent=2)
    return tokens


# Custom MFA prompt handler that waits for code via API
def mfa_prompt_handler(prompt: str) -> str:
    """Handler called by garth when MFA is required."""
    print(f"🔐 MFA Required: {prompt}")
    print("   Waiting for MFA code via API...")
    
    # Signal that MFA is needed
    mfa_pending.set()
    
    # Wait for code from the API (timeout after 5 minutes)
    try:
        code = mfa_code_queue.get(timeout=300)
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
    has_credentials = bool(email and password)
    
    return jsonify({
        "status": "ok",
        "service": "garmin-auth",
        "hasCredentials": has_credentials
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
    """
    Attempt automatic login using credentials from environment.
    If MFA is required, returns mfaRequired=true and waits for /auth/mfa call.
    """
    global login_result
    
    email, password = get_credentials()
    
    if not email or not password:
        return jsonify({
            "success": False,
            "error": "GARMIN_EMAIL and GARMIN_PASSWORD environment variables not set"
        }), 400

    # Check if we already have a valid session
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
        login_result = None
        
        try:
            print(f"🔑 Attempting login for {email}...")
            client = Client()
            
            # Try login - this may trigger MFA
            # garth will call input() for MFA, but we monkey-patch it
            import builtins
            original_input = builtins.input
            builtins.input = mfa_prompt_handler
            
            try:
                client.login(email, password)
            finally:
                builtins.input = original_input
            
            # Save tokens
            tokens = save_tokens(client)
            
            # Get profile
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
            
            # Check if MFA is pending (our handler was called)
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
        return jsonify({"success": False, "error": "No pending MFA challenge. Try /auth/auto-login first."}), 400

    print(f"📱 Received MFA code: {mfa_code[:2]}****")
    
    # Send the code to the waiting login thread
    mfa_code_queue.put(mfa_code)
    
    # Wait a moment for login to complete
    time.sleep(2)
    
    # Check if login succeeded
    profile = test_session()
    if profile:
        tokens = export_tokens()
        return jsonify({
            "success": True,
            "displayName": profile.get("displayName", "Unknown"),
            "tokens": tokens
        })
    
    # Check if still waiting for MFA
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
    else:
        return jsonify({"success": False, "error": "No tokens available"}), 404


def main():
    email, password = get_credentials()
    
    print("🏃 Garmin Authentication Server for OpenCoach")
    print("=" * 55)
    print()
    
    if email:
        print(f"✅ Credentials loaded for: {email}")
    else:
        print("⚠️  No credentials found!")
        print()
        print("   Set these environment variables (or in .env file):")
        print("   export GARMIN_EMAIL=\"your@email.com\"")
        print("   export GARMIN_PASSWORD=\"yourpassword\"")
    
    print()
    print("🌐 Server starting on http://localhost:5050")
    print()
    print("Endpoints:")
    print("  GET  /health          - Health check")
    print("  GET  /auth/status     - Check authentication status")
    print("  POST /auth/auto-login - Auto-login with env credentials")
    print("  POST /auth/mfa        - Submit MFA code")
    print("  POST /auth/export     - Export tokens")
    print()
    print("When sync fails, OpenCoach will:")
    print("  1. Call /auth/auto-login automatically")
    print("  2. If MFA needed, show a popup for the code")
    print("  3. Import tokens and retry sync")
    print()
    print("Press Ctrl+C to stop.")
    print()

    # Use threaded mode so MFA can work
    app.run(host="127.0.0.1", port=5050, debug=False, threaded=True)


if __name__ == "__main__":
    main()

