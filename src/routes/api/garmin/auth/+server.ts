// Garmin Authentication API using garmin-connect library
// POST /api/garmin/auth - Login with credentials from env or body
// GET /api/garmin/auth - Check auth status

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import pkg from "garmin-connect";
const { GarminConnect } = pkg;
import { setSetting, getSetting, getGarminCredentials, SETTING_KEYS } from "$lib/server/db";

// Login to Garmin and save tokens
export const POST: RequestHandler = async ({ request, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) {
    throw error(500, "Database not available");
  }
  const userId = locals.user.id;

  try {
    // Get credentials from request body or fallback to env/db
    const body = await request.json().catch(() => ({}));

    let email = body.email;
    let password = body.password;

    // If not provided in body, try env/db
    if (!email || !password) {
      const creds = await getGarminCredentials(db, userId);
      if (creds) {
        email = creds.email;
        password = creds.password;
      }
    }

    if (!email || !password) {
      return json(
        {
          success: false,
          error:
            "Garmin credentials required. Set GARMIN_EMAIL/GARMIN_PASSWORD in .env or provide in request body.",
        },
        { status: 400 },
      );
    }

    console.log(`🔑 Attempting Garmin login for ${email}...`);

    // Create Garmin client and login
    const client = new GarminConnect({
      username: email,
      password: password,
    });

    await client.login();

    // Get tokens from client
    const oauth1 = client.client.oauth1Token;
    const oauth2 = client.client.oauth2Token;

    if (!oauth1 || !oauth2) {
      return json(
        {
          success: false,
          error: "Login succeeded but failed to get tokens",
        },
        { status: 500 },
      );
    }

    // Save tokens to database
    await setSetting(
      db,
      userId,
      SETTING_KEYS.GARMIN_OAUTH1_TOKEN,
      JSON.stringify(oauth1),
    );
    await setSetting(
      db,
      userId,
      SETTING_KEYS.GARMIN_OAUTH2_TOKEN,
      JSON.stringify(oauth2),
    );

    // Also save credentials to DB if they came from body (not env)
    if (body.email && body.password) {
      await setSetting(db, userId, SETTING_KEYS.GARMIN_EMAIL, body.email);
      await setSetting(db, userId, SETTING_KEYS.GARMIN_PASSWORD, body.password);
    }

    // Get user profile for confirmation
    let displayName = "Unknown";
    try {
      const profile = await client.getUserProfile();
      displayName = profile?.userName || profile?.displayName || "Unknown";
    } catch {
      // Profile fetch is optional
    }

    console.log(`✅ Garmin login successful for ${displayName}`);

    return json({
      success: true,
      displayName,
      message: "Logged in and tokens saved",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Garmin login failed:", message);

    // Provide helpful error messages
    if (
      message.includes("401") ||
      message.includes("Unauthorized") ||
      message.includes("credentials")
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid Garmin credentials. Please check your email and password.",
          hint: "Make sure you can log in at connect.garmin.com with these credentials.",
        },
        { status: 401 },
      );
    }

    if (message.includes("locked") || message.includes("blocked")) {
      return json(
        {
          success: false,
          error: "Garmin account is locked or blocked. Try again later.",
          hint: "Wait 15-30 minutes before trying again.",
        },
        { status: 429 },
      );
    }

    return json(
      {
        success: false,
        error: `Login failed: ${message}`,
      },
      { status: 500 },
    );
  }
};

// Check auth status
export const GET: RequestHandler = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) {
    throw error(500, "Database not available");
  }
  const userId = locals.user.id;

  const oauth2Str = await getSetting(
    db,
    userId,
    SETTING_KEYS.GARMIN_OAUTH2_TOKEN,
  );

  if (!oauth2Str) {
    return json({
      authenticated: false,
      message: "No Garmin tokens found. Login required.",
    });
  }

  // Try to validate tokens by making a simple API call
  try {
    const oauth1Str = await getSetting(
      db,
      userId,
      SETTING_KEYS.GARMIN_OAUTH1_TOKEN,
    );
    if (!oauth1Str) {
      return json({
        authenticated: false,
        message: "Incomplete tokens. Login required.",
      });
    }

    const oauth1 = JSON.parse(oauth1Str);
    const oauth2 = JSON.parse(oauth2Str);

    // Get stored credentials - GarminConnect constructor requires them
    const creds = await getGarminCredentials(db, userId);
    if (!creds) {
      return json({
        authenticated: false,
        message: "Credentials missing. Login required.",
      });
    }

    const client = new GarminConnect({
      username: creds.email,
      password: creds.password,
    });
    client.loadToken(oauth1, oauth2);

    const profile = await client.getUserProfile();

    return json({
      authenticated: true,
      displayName: profile?.userName || profile?.displayName || "Unknown",
      message: "Garmin connected",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Token might be expired
    if (message.includes("401") || message.includes("expired")) {
      return json({
        authenticated: false,
        message: "Garmin session expired. Re-login required.",
        canAutoRefresh: true,
      });
    }

    return json({
      authenticated: false,
      message: `Token validation failed: ${message}`,
    });
  }
};
