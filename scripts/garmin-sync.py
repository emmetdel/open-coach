#!/usr/bin/env python3
"""
Garmin Activity Sync

Fetches recent running activities from Garmin Connect and outputs them
in JSON format for OpenCoach to import.

Usage:
    uvx --python 3.12 --with garth python scripts/garmin-sync.py
"""

import json
import sys
from datetime import datetime
from pathlib import Path

try:
    from garth.http import Client
except ImportError:
    print("Please install garth: uv pip install garth")
    sys.exit(1)


GARTH_DIR = Path.home() / ".garth"


def main():
    print("🏃 Garmin Activity Sync for OpenCoach")
    print("=" * 40)
    print()

    if not GARTH_DIR.exists():
        print("❌ Not logged in. Run garmin-auth.py first.")
        sys.exit(1)

    client = Client()
    
    try:
        client.load(str(GARTH_DIR))
    except Exception as e:
        print(f"❌ Could not load session: {e}")
        print("Run garmin-auth.py to login first.")
        sys.exit(1)

    # Test connection
    try:
        profile = client.connectapi("/userprofile-service/socialProfile")
        print(f"✅ Connected as: {profile.get('displayName', 'Unknown')}")
    except Exception as e:
        print(f"❌ Session expired: {e}")
        print("Run garmin-auth.py to login again.")
        sys.exit(1)

    print()
    print("Fetching activities...")
    
    # Fetch recent activities
    try:
        activities = client.connectapi(
            "/activitylist-service/activities/search/activities",
            params={"limit": 20, "start": 0}
        )
    except Exception as e:
        print(f"❌ Failed to fetch activities: {e}")
        sys.exit(1)

    if not activities:
        print("No activities found.")
        sys.exit(0)

    # Filter to running activities
    running_types = {"running", "trail_running", "treadmill_running"}
    runs = [
        a for a in activities
        if a.get("activityType", {}).get("typeKey") in running_types
    ]

    print(f"Found {len(runs)} running activities out of {len(activities)} total.")
    print()

    # Format for OpenCoach
    formatted_runs = []
    for run in runs:
        formatted_runs.append({
            "garmin_activity_id": str(run.get("activityId")),
            "date": run.get("startTimeLocal"),
            "distance_meters": round(run.get("distance", 0)),
            "duration_seconds": round(run.get("duration", 0)),
            "avg_hr": round(run.get("averageHR")) if run.get("averageHR") else None,
            "max_hr": round(run.get("maxHR")) if run.get("maxHR") else None,
        })

    output = {"runs": formatted_runs}

    print("=" * 40)
    print("📋 Activities JSON:")
    print("=" * 40)
    print()
    print(json.dumps(output, indent=2))
    print()

    # Save to file
    output_file = Path("garmin-activities.json")
    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)

    print(f"💾 Saved to: {output_file.absolute()}")
    print()
    print("To import into OpenCoach, use the /api/runs endpoint")
    print("or add runs manually in the dashboard.")


if __name__ == "__main__":
    main()

