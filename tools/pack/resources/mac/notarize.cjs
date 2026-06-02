const path = require("node:path");

const TRANSIENT_NOTARY_PATTERNS = [
  "abortedUpload",
  "deadlineExceeded",
  "HTTPClientError",
];

function parsePositiveInteger(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isTransientNotaryError(error) {
  const text = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return TRANSIENT_NOTARY_PATTERNS.some((pattern) => text.includes(pattern));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async function notarize(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const keychainProfile = process.env.APPLE_NOTARY_KEYCHAIN_PROFILE;
  const keychain = process.env.APPLE_NOTARY_KEYCHAIN;
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  let credentials;
  if (keychainProfile) {
    credentials = {
      keychainProfile,
      ...(keychain ? { keychain } : {}),
    };
  } else {
    const missing = [
      ["APPLE_ID", appleId],
      ["APPLE_APP_SPECIFIC_PASSWORD", appleIdPassword],
      ["APPLE_TEAM_ID", teamId],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `[tools-pack notarize] missing required Apple notarization env: ${missing.join(", ")}`,
      );
    }

    credentials = {
      appleId,
      appleIdPassword,
      teamId,
    };
  }

  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${productFilename}.app`);
  const { notarize } = await import("@electron/notarize");
  const attempts = parsePositiveInteger(process.env.APPLE_NOTARY_ATTEMPTS, 2);
  const retryDelayMs = parsePositiveInteger(process.env.APPLE_NOTARY_RETRY_DELAY_MS, 15000);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await notarize({
        appPath,
        ...credentials,
      });
      return;
    } catch (error) {
      if (attempt >= attempts || !isTransientNotaryError(error)) {
        throw error;
      }
      console.error(
        `[tools-pack notarize] transient notarytool failure on attempt ${attempt}/${attempts}; retrying in ${retryDelayMs}ms`,
      );
      await sleep(retryDelayMs);
    }
  }
};
