// Admin utility: create an account + register one System Commander device.
// Prints the device token exactly once.
//
// Usage:
//   node scripts/bootstrap-account.mjs <email> <deviceId> [label]
//
// The command reads CONVEX_URL from .env.local.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const [, , email, deviceId, label] = process.argv;

if (!email || !deviceId) {
  console.error("Usage: node scripts/bootstrap-account.mjs <email> <deviceId> [label]");
  process.exit(1);
}

if (!process.env.CONVEX_URL) {
  console.error("CONVEX_URL is not set in .env.local");
  process.exit(1);
}

const relayUrl =
  process.env.SYSTEM_COMMANDER_PUBLIC_URL ||  process.env.PUBLIC_RELAY_URL ||
  "https://your-relay.example.com";

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

const accountId = await convex.mutation(api.accounts.createAccount, {
  email,
});

console.log("Account ready: " + email + " (" + accountId + ")");

const result = await convex.mutation(api.devices.registerDevice, {
  accountEmail: email,
  deviceId,
  label,
  tokenTtlMs: 90 * 24 * 60 * 60 * 1000,
});

console.log("");
console.log("Device registered: " + result.deviceId);
console.log("Token (save this now - it cannot be shown again): " + result.token);
console.log("");
console.log("Customer setup:");
console.log(
  "  npx @leukode-labs/system-commander@latest remote --relay " +
  relayUrl +
  " --device-id " +
  result.deviceId +
  " --token " +  result.token
);
console.log("");
console.log("Remote MCP endpoint:");
console.log(relayUrl + "/mcp/" + encodeURIComponent(result.deviceId));
