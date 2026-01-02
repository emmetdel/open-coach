#!/usr/bin/env python3
"""
Garmin Authentication Helper

This script uses the Garth library to authenticate with Garmin Connect,
handling MFA via browser. It exports tokens that can be used by OpenCoach.

Usage:
    uv run --python 3.12 --with garth python scripts/garmin-auth.py

The script will:
1. Prompt for your Garmin credentials
2. Handle MFA if needed
3. Save tokens to ~/.garth/
4. Output the tokens in JSON format for OpenCoach
"""

import json
import os
import sys
from dataclasses import asdict
from getpass import getpass
from pathlib import Path

try:
    import garth
    from garth.http import Client
except ImportError:
    print("Please install garth: uv pip install garth")
    sys.exit(1)


GARTH_DIR = Path.home() / ".garth"


def main():
    print("🏃 Garmin Authentication for OpenCoach")
    print("=" * 40)
    print()

    client = Client()

    # Try to load existing tokens first
    if GARTH_DIR.exists():
        try:
            client.load(str(GARTH_DIR))
            print("✅ Found existing session, testing...")

            # Test if session is still valid
            try:
                profile = client.connectapi("/userprofile-service/socialProfile")
                print(f"✅ Logged in as: {profile.get('displayName', 'Unknown')}")
            except Exception as e:
                print(f"⚠️  Session expired ({e}), need to re-login")
                client = Client()
                do_login(client)
        except Exception as e:
            print(f"⚠️  Could not load session: {e}")
            do_login(client)
    else:
        do_login(client)

    # Export tokens
    export_tokens(client)


def do_login(client: Client):
    print()
    print("Please enter your Garmin Connect credentials:")
    email = input("Email: ").strip()
    password = getpass("Password: ")
    print()

    try:
        client.login(email, password)
        
        # Save tokens
        GARTH_DIR.mkdir(exist_ok=True)
        client.dump(str(GARTH_DIR))
        
        print("✅ Login successful!")
    except Exception as e:
        print(f"❌ Login failed: {e}")
        print()
        print("If you have MFA enabled, try disabling it temporarily at:")
        print("https://connect.garmin.com → Settings → Security")
        sys.exit(1)


def export_tokens(client: Client):
    # Read the saved token files (already JSON serialized by Garth)
    oauth1_path = GARTH_DIR / "oauth1_token.json"
    oauth2_path = GARTH_DIR / "oauth2_token.json"

    if not oauth1_path.exists() or not oauth2_path.exists():
        print("❌ Token files not found. Please login first.")
        sys.exit(1)

    with open(oauth1_path) as f:
        oauth1 = json.load(f)
    with open(oauth2_path) as f:
        oauth2 = json.load(f)

    tokens = {
        "oauth1": oauth1,
        "oauth2": oauth2
    }

    print()
    print("=" * 40)
    print("📋 Copy these tokens into OpenCoach:")
    print("=" * 40)
    print()
    print(json.dumps(tokens, indent=2))
    print()
    print("=" * 40)

    # Also save to a file
    token_file = Path("garmin-tokens.json")
    with open(token_file, "w") as f:
        json.dump(tokens, f, indent=2)

    print(f"💾 Tokens also saved to: {token_file.absolute()}")
    print()
    print("Next steps:")
    print("1. Go to OpenCoach dashboard")
    print("2. Click the 🔑 key icon")
    print("3. Paste the JSON above or contents of garmin-tokens.json")
    print("4. Click 'Import Tokens'")
    print("5. Tokens refresh automatically for 3 months")


if __name__ == "__main__":
    main()
