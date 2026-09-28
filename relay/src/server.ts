import express from "express";
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { ConvexHttpClient } from "convex/browser";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { api } from "../convex/_generated/api.js";
import dotenv from "dotenv";
import { siGithub } from "simple-icons";
import {
  authenticateUser,
  hasRequiredScopes,
  isAuthConfigured,
  publicAuthMetadataIssuer,
  requiredScopes,
} from "./auth.js";
import type { AuthContext } from "./auth.js";

const envFile = process.env.NODE_ENV === "production"
  ? ".env.production"
  : process.env.NODE_ENV === "test"
    ? ".env.test"
    : ".env.local";
dotenv.config({ path: envFile });

const PORT = Number(process.env.PORT ?? 3900);
const VERSION = process.env.SYSTEM_COMMANDER_VERSION ?? "0.2.51";
const PUBLIC_URL = (process.env.SYSTEM_COMMANDER_PUBLIC_URL || "http://localhost:" + PORT).replace(/\/$/, "");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_TEST = process.env.NODE_ENV === "test";
const PRODUCTION_CONVEX_URL = "https://rugged-dolphin-510.convex.cloud";
const RPC_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS ?? 60_000);
const MAX_INFLIGHT_CALLS = Number(process.env.MAX_INFLIGHT_CALLS_PER_DEVICE ?? 8);
const WS_MAX_PAYLOAD = Number(process.env.WS_MAX_PAYLOAD_BYTES ?? 2 * 1024 * 1024);
const DEVICE_TOKEN_TTL_DAYS = Number(process.env.DEVICE_TOKEN_TTL_DAYS ?? 90);
const MONTHLY_CALL_LIMIT = Number(process.env.MONTHLY_CALL_LIMIT ?? 10_000);

if (!process.env.CONVEX_URL) throw new Error("CONVEX_URL is not set.");
if (IS_PRODUCTION && process.env.CONVEX_URL.replace(/\/$/, "") !== PRODUCTION_CONVEX_URL) {
  throw new Error("Production relay must use the System Commander production Convex deployment.");
}
if (
  IS_PRODUCTION &&
  (!process.env.CLERK_SECRET_KEY ||
    !process.env.CLERK_PUBLISHABLE_KEY ||
    !process.env.CLERK_ISSUER_URL ||
    !process.env.SYSTEM_COMMANDER_PUBLIC_URL)
) {
  throw new Error("Production relay requires Clerk credentials, CLERK_ISSUER_URL, and SYSTEM_COMMANDER_PUBLIC_URL.");
}
if ((IS_PRODUCTION || IS_TEST) && process.env.SYSTEM_COMMANDER_DEV_AUTH === "true") {
  throw new Error("SYSTEM_COMMANDER_DEV_AUTH cannot be enabled in production/test mode.");
}
if (IS_TEST && process.env.CONVEX_URL.replace(/\/$/, "") !== PRODUCTION_CONVEX_URL) {
  throw new Error("Test relay must use the System Commander production Convex deployment.");
}
if (IS_TEST && !String(process.env.CLERK_PUBLISHABLE_KEY || "").startsWith("pk_test_")) {
  throw new Error("Test relay requires a Clerk development publishable key (pk_test_...).");
}
if (IS_TEST && !String(process.env.CLERK_SECRET_KEY || "").startsWith("sk_test_")) {
  throw new Error("Test relay requires a Clerk development secret key (sk_test_...).");
}
if (IS_TEST && !/^https:\/\//i.test(PUBLIC_URL)) {
  throw new Error("Test relay requires an HTTPS SYSTEM_COMMANDER_PUBLIC_URL.");
}
if (IS_PRODUCTION && !String(process.env.CLERK_PUBLISHABLE_KEY || "").startsWith("pk_live_")) {
  throw new Error("Production relay requires a Clerk production publishable key (pk_live_...).");
}
if (IS_PRODUCTION && !String(process.env.CLERK_SECRET_KEY || "").startsWith("sk_live_")) {
  throw new Error("Production relay requires a Clerk production secret key (sk_live_...).");
}
if (IS_PRODUCTION && !/^https:\/\//i.test(PUBLIC_URL)) {
  throw new Error("Production relay requires an HTTPS SYSTEM_COMMANDER_PUBLIC_URL.");
}
if (!isAuthConfigured() && IS_PRODUCTION) throw new Error("Authentication is not configured.");

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

interface PendingCall {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface ConnectedDevice {
  socket: WebSocket;
  pending: Map<string, PendingCall>;
  tools: any[];
  accountId: string;
}

const devices = new Map<string, ConnectedDevice>();

const requestRateLimit = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.MCP_REQUESTS_PER_MINUTE ?? 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again shortly." },
});

const accountRateLimit = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.ACCOUNT_REQUESTS_PER_MINUTE ?? 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many account requests. Try again shortly." },
});

const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

function applyCors(req: express.Request, res: express.Response) {
  const origin = req.header("origin");
  if (!origin) return;
  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Session-Id");
}
function deviceTokenTtlMs() {
  if (!Number.isFinite(DEVICE_TOKEN_TTL_DAYS) || DEVICE_TOKEN_TTL_DAYS < 1 || DEVICE_TOKEN_TTL_DAYS > 365) {
    throw new Error("DEVICE_TOKEN_TTL_DAYS must be between 1 and 365.");
  }
  return Math.floor(DEVICE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

async function getUserAuth(
  req: express.Request,
  res: express.Response,
  protectedResourcePath?: string
): Promise<AuthContext | null> {
  const resourcePath = protectedResourcePath || "/mcp";
  try {
    const auth = await authenticateUser(req);
    if (!auth) {
      const metadata =
        PUBLIC_URL +
        "/.well-known/oauth-protected-resource" +
        (resourcePath === "/mcp" ? "/mcp" : resourcePath);
      res.setHeader(
        "WWW-Authenticate",
        'Bearer resource_metadata="' + metadata + '", scope="' + requiredScopes().join(" ") + '"'
      );
      res.status(401).json({ error: "OAuth authentication required." });
      return null;
    }

    if (!hasRequiredScopes(auth)) {
      const metadata =
        PUBLIC_URL +
        "/.well-known/oauth-protected-resource" +
        (resourcePath === "/mcp" ? "/mcp" : resourcePath);
      res.setHeader(
        "WWW-Authenticate",
        'Bearer resource_metadata="' + metadata + '", scope="' + requiredScopes().join(" ") + '"'
      );
      res.status(403).json({ error: "OAuth token is missing the required System Commander scopes." });
      return null;
    }
    return auth;
  } catch (error: any) {
    console.error("[relay] authentication failure:", error?.message || String(error));
    res.status(503).json({ error: "Authentication service unavailable." });
    return null;
  }
}

async function ensureAccount(auth: AuthContext) {
  let account = await convex.query(api.accounts.getAccountByClerkUserId, {
    clerkUserId: auth.userId,
  });
  if (!account) {
    await convex.mutation(api.accounts.ensureAccountForUser, {
      clerkUserId: auth.userId,
    });
    account = await convex.query(api.accounts.getAccountByClerkUserId, {
      clerkUserId: auth.userId,
    });
  }
  if (!account) throw new Error("Unable to initialize System Commander account.");
  return account;
}

function monthPeriod() {
  const now = new Date();
  return String(now.getUTCFullYear()) + "-" + String(now.getUTCMonth() + 1).padStart(2, "0");
}

async function consumeMonthlyUsage(auth: AuthContext) {
  return await convex.mutation(api.devices.consumeUsage, {
    clerkUserId: auth.userId,
    period: monthPeriod(),
    limit: MONTHLY_CALL_LIMIT,
  });
}

function requestDevice(deviceId: string, frame: Record<string, unknown>): Promise<any> {
  const device = devices.get(deviceId);
  if (!device || device.socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error("System Commander device is offline."));
  }
  if (device.pending.size >= MAX_INFLIGHT_CALLS) {
    return Promise.reject(new Error("System Commander device is busy. Try again shortly."));
  }

  const requestId = String(frame.requestId ?? randomUUID());

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      device.pending.delete(requestId);
      reject(new Error("System Commander device did not respond in time."));
    }, RPC_TIMEOUT_MS);

    device.pending.set(requestId, { resolve, reject, timer });

    try {
      device.socket.send(JSON.stringify({ ...frame, requestId }));
    } catch (error: any) {
      clearTimeout(timer);
      device.pending.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function createMcpServer(deviceId: string): Server {
  const server = new Server(
    { name: "system-commander", version: VERSION },
    {
      instructions: "System Commander securely routes MCP tool calls to the customer device connected to this account.",
      capabilities: { tools: {} },
    }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const device = devices.get(deviceId);
    if (!device) throw new Error("System Commander device is offline.");
    console.log("[relay] MCP tools/list request:", deviceId);
    const result = await requestDevice(deviceId, {
      type: "list_tools",
      requestId: randomUUID(),
    });
    if (result?.tools) device.tools = result.tools;
    console.log("[relay] MCP tools/list result:", deviceId, "tools=" + (result?.tools?.length ?? 0));
    return result;
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return await requestDevice(deviceId, {
      type: "tool_call",
      requestId: randomUUID(),
      name: request.params.name,
      arguments: request.params.arguments ?? {},
    });
  });

  return server;
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use(helmet({ crossOriginResourcePolicy: false }));

app.use((req, res, next) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    if (req.header("origin") && !allowedOrigins.has(req.header("origin")!)) {
      return res.status(403).end();
    }
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, mcp-session-id, last-event-id");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: "4mb", strict: true }));
function protectedResourceMetadata(resourcePath = "/mcp") {
  const issuer = publicAuthMetadataIssuer();
  const metadata: Record<string, unknown> = {
    resource: PUBLIC_URL + resourcePath,
    bearer_methods_supported: ["header"],
    scopes_supported: requiredScopes(),
  };
  if (issuer) metadata.authorization_servers = [issuer];
  return metadata;
}

let oauthMetadataCache: { at: number; data: any } | null = null;

async function getAuthorizationServerMetadata() {
  const issuer = publicAuthMetadataIssuer();
  if (!issuer) throw new Error("CLERK_ISSUER_URL is not configured.");
  if (oauthMetadataCache && Date.now() - oauthMetadataCache.at < 5 * 60_000) {
    return oauthMetadataCache.data;
  }

  const urls = [
    issuer + "/.well-known/oauth-authorization-server",
    issuer + "/.well-known/openid-configuration",
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (response.ok) {
        const data = await response.json();
        oauthMetadataCache = { at: Date.now(), data };
        return data;
      }
    } catch {}
  }

  throw new Error("Unable to retrieve Clerk OAuth metadata.");
}

app.get("/", (_req, res) => {
  res.type("html").send(
    "<!doctype html><html><head><meta charset='utf-8'><title>System Commander Cloud</title>" +
    "<style>body{font-family:system-ui;background:#08090b;color:#f5f5f5;display:grid;place-items:center;min-height:100vh}" +
    ".card{max-width:760px;padding:48px;border:1px solid #24272d;border-radius:20px;background:#101215}" +
    "h1{margin:0 0 12px;font-size:42px}p{color:#a7adb7;line-height:1.6}</style></head>" +
    "<body><main class='card'><h1>System Commander</h1><p>Secure MCP relay for computers running System Commander.</p><p style='margin-top:22px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5fd4e0'>By Leukode Labs</p>" +
    "<p>Human clients authenticate with OAuth; device agents use separate device credentials.</p></main></body></html>"
  );
});

app.get("/__dev/version", (_req, res) => {
  try {
    res.type("text/plain").send(String(statSync(new URL(import.meta.url)).mtimeMs));
  } catch {
    res.type("text/plain").send(String(Date.now()));
  }
});

app.get("/sso-callback", (req, res) => {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY || "";
  const clerkIssuer = publicAuthMetadataIssuer();
  if (!publishableKey || !clerkIssuer) {
    res.status(503).type("html").send("<h1>System Commander</h1><p>Authentication is not configured.</p>");
    return;
  }
  const rawReturn = typeof req.query.return === "string" ? req.query.return : "/pair";
  const returnPath = rawReturn.startsWith("/pair") ? rawReturn : "/pair";
  const clerkOrigin = new URL(clerkIssuer).origin;
  const nonce = randomUUID().replace(/-/g, "");
  const escapedKey = JSON.stringify(publishableKey);
  const destination = JSON.stringify(returnPath);
  const clerkScriptUrl = JSON.stringify(clerkOrigin + "/npm/@clerk/clerk-js@6/dist/clerk.browser.js");
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self' " + clerkOrigin + " 'nonce-" + nonce + "'; connect-src 'self' " + clerkOrigin + "; style-src 'self' 'unsafe-inline';");
  const html = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Connecting · System Commander</title><style>body{margin:0;min-height:100vh;background:#08090b;color:#eef0f2;font-family:Space Grotesk,system-ui,sans-serif;display:grid;place-items:center}.card{width:min(420px,calc(100% - 40px));padding:32px;background:#101215;border:1px solid #1d2126;border-radius:3px;text-align:center}.ring{width:34px;height:34px;margin:0 auto 18px;border:2px solid #1d2126;border-top-color:#5fd4e0;border-right-color:#3d7cff;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}p{color:#767d87;font-size:13px}</style></head><body><div class='card'><div class='ring'></div><strong>Connecting to System Commander…</strong><p id='error'></p></div>" +
    "<script nonce='" + nonce + "'>(async()=>{const key=" + escapedKey + ";const load=src=>new Promise((ok,bad)=>{const x=document.createElement('script');x.src=src;x.async=false;x.crossOrigin='anonymous';x.nonce='" + nonce + "';x.setAttribute('data-clerk-publishable-key',key);x.onload=ok;x.onerror=bad;document.head.appendChild(x)});try{await load(" + clerkScriptUrl + ");const clerk=window.Clerk;await clerk.load({signInUrl:" + destination + ",signUpUrl:" + destination + "});await clerk.handleRedirectCallback({signInUrl:" + destination + ",signUpUrl:" + destination + ",signInForceRedirectUrl:" + destination + ",signUpForceRedirectUrl:" + destination + ",transferable:true});}catch(error){document.getElementById('error').textContent=error?.message||String(error);}})();</script></body></html>";
  res.type("html").send(html);
});

app.get("/pair", (_req, res) => {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY || "";
  if (!publishableKey) {
    res.status(503).type("html").send("<h1>System Commander</h1><p>Pairing is not configured.</p>");
    return;
  }

  const clerkIssuer = publicAuthMetadataIssuer();
  if (!clerkIssuer) {
    res.status(503).type("html").send("<h1>System Commander</h1><p>Clerk issuer is not configured.</p>");
    return;
  }
  const clerkOrigin = new URL(clerkIssuer).origin;
  const nonce = randomUUID().replace(/-/g, "");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; " +
      "img-src 'self' data: https:; object-src 'none'; script-src 'self' https://cdn.jsdelivr.net 'nonce-" + nonce + "'; " +
      "connect-src 'self' " + clerkOrigin + "; frame-src 'self' " + clerkOrigin + "; worker-src 'self' blob:; style-src 'self' https: 'unsafe-inline'; " +
      "upgrade-insecure-requests"
  );

  const escapedKey = JSON.stringify(publishableKey);
  const logoMark = "data:image/png;base64," + readFileSync(path.join(process.cwd(), "assets", "logo.png")).toString("base64");
  const logoWordmark = "data:image/png;base64," + readFileSync(path.join(process.cwd(), "assets", "logo-text.png")).toString("base64");
  const googleLogo = "data:image/png;base64," + readFileSync(path.join(process.cwd(), "assets", "google-g-logo.png")).toString("base64");
  const githubLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#ffffff" d="${siGithub.path}"/></svg>`;
  const githubLogo = "data:image/svg+xml;base64," + Buffer.from(githubLogoSvg).toString("base64");
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pair device · System Commander</title>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;background:#08090b;color:#f5f7fa;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,\\"Segoe UI\\",sans-serif}
    main{width:min(760px,calc(100% - 32px));margin:48px auto;padding:32px;border:1px solid #272b33;border-radius:24px;background:#101216;box-shadow:0 20px 60px rgba(0,0,0,.35)}
    h1{margin:0 0 8px;font-size:32px}
    p{color:#aab1bc;line-height:1.6}
    .muted{font-size:14px}
    #device-form,#result{display:block}
    label{display:block;margin:18px 0 8px;font-size:14px;color:#c7ccd4}
    input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid #313640;background:#0b0d10;color:#fff;font-size:15px}
    button{margin-top:20px;padding:13px 18px;border:0;border-radius:12px;background:#fff;color:#090a0c;font-weight:700;cursor:pointer}
    pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;border-radius:12px;background:#090b0e;border:1px solid #242831;color:#dfe4eb}
    .ok{color:#9be7b0}
    .warn{color:#ffd38a}
    #status{margin-top:16px}
    #bootstrap-main{width:min(480px,calc(100% - 32px));min-height:100vh;margin:0 auto;padding:28px 0;border:0;border-radius:0;background:transparent;box-shadow:none;display:grid;place-items:center}
    .bootstrap-loading{width:100%;display:flex;flex-direction:column;align-items:center;text-align:center}
    .bootstrap-brand{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:30px}
    .bootstrap-logo-mark{display:block;width:58px;height:58px;object-fit:contain}
    .bootstrap-logo-wordmark{display:block;width:210px;height:70px;object-fit:contain}
    .bootstrap-spinner{width:30px;height:30px;border:2px solid #1d2126;border-top-color:#5fd4e0;border-right-color:#3d7cff;border-radius:50%;animation:bootstrap-spin .8s linear infinite;box-shadow:0 0 24px rgba(61,124,255,.12)}
    @keyframes bootstrap-spin{to{transform:rotate(360deg)}}
    #bootstrap-message{margin:20px 0 6px;color:#eef0f2;font:600 14px/1.4 Inter,system-ui,sans-serif}
    #bootstrap-submessage{color:#68717d;font:400 12px/1.5 Inter,system-ui,sans-serif}
    .bootstrap-error .bootstrap-spinner{border-top-color:#ff6b7a;border-right-color:#ff9b6b;animation:none}
    .bootstrap-error #bootstrap-message{color:#ffb4bc}
    .setup-shell{max-width:820px;margin:0 auto;padding:24px 0 56px}
    .setup-brand{display:flex;align-items:center;gap:12px;margin-bottom:34px}
    .setup-brand .setup-mark{width:34px;height:34px;object-fit:contain}
    .setup-brand .setup-wordmark{width:154px;height:auto;object-fit:contain}
    .setup-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:28px}
    .setup-step{padding:13px 14px;border:1px solid #1d2630;border-radius:12px;background:#0d1116;color:#697586;font-size:11px}
    .setup-step.active{border-color:#285a67;background:linear-gradient(180deg,rgba(95,212,224,.09),rgba(61,124,255,.04));color:#eef0f2}
    .setup-step.done{color:#88e6a9}
    .setup-step-num{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;margin-right:8px;background:#171d25;color:#8d98a8;font-weight:800}
    .setup-step.active .setup-step-num{background:#5fd4e0;color:#071014}.setup-step.done .setup-step-num{background:#3ddc84;color:#06100a}
    .setup-step-title{font-weight:700}.setup-step-sub{margin:5px 0 0 30px;color:#596574;font-size:10px}
    .setup-card{border:1px solid #202a34;background:#0e1218;border-radius:18px;padding:30px;box-shadow:0 28px 90px rgba(0,0,0,.35)}
    .setup-eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#5fd4e0;font-weight:800}
    .setup-card h1{margin:9px 0 8px;font-size:30px;letter-spacing:-.03em}.setup-card p{margin:0;color:#7f8a99;line-height:1.6;font-size:14px}
    .setup-command-wrap{margin-top:24px}.setup-label{font-size:11px;color:#8d98a8;margin-bottom:8px}.setup-command{position:relative;padding:17px 54px 17px 17px;border:1px solid #27313d;border-radius:12px;background:#080b0f;color:#dfe7ef;font:12px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
    .setup-copy{position:absolute;top:10px;right:10px;width:34px;height:34px;border:1px solid #2b3643;border-radius:9px;background:#111720;color:#cbd4df;cursor:pointer}.setup-copy:hover{border-color:#5fd4e0;color:#5fd4e0}
    .setup-note{display:flex;gap:10px;align-items:flex-start;margin-top:16px;padding:12px 13px;border:1px solid rgba(255,180,84,.14);border-radius:11px;background:rgba(255,180,84,.045);color:#a9b0ba;font-size:11px;line-height:1.55}.setup-note strong{color:#ffbf73}
    .setup-next{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:22px}.setup-action{padding:14px;border-radius:11px;border:1px solid #202b35;background:#111720;color:#e9eef4}.setup-action strong{display:block;font-size:12px}.setup-action span{display:block;margin-top:4px;color:#778394;font-size:10px;line-height:1.5}
    .setup-after{margin-top:23px;padding-top:20px;border-top:1px solid #1b232d;color:#677281;font-size:11px;line-height:1.6}.setup-after strong{color:#aeb7c3}
    @media(max-width:680px){.setup-steps{grid-template-columns:1fr}.setup-card{padding:22px}.setup-next{grid-template-columns:1fr}.setup-brand{margin-bottom:24px}.setup-shell{padding-bottom:30px}}
  </style>
</head>
<body>
  <main id="bootstrap-main" aria-busy="true">
    <section id="bootstrap-loading" class="bootstrap-loading" role="status" aria-live="polite">
      <div class="bootstrap-brand">
        <img class="bootstrap-logo-mark" src="${logoMark}" alt="System Commander">
        <img class="bootstrap-logo-wordmark" src="${logoWordmark}" alt="System Commander">
      </div>
      <div class="bootstrap-spinner" aria-hidden="true"></div>
      <p id="bootstrap-message">Preparing secure sign-in…</p>
      <span id="bootstrap-submessage">Connecting your System Commander session</span>
    </section>
  </main>

  <script nonce="${nonce}">
  (async()=>{
    const publishableKey=${escapedKey};
    const bootstrapMain=document.getElementById("bootstrap-main");
    const bootstrapMessage=document.getElementById("bootstrap-message");
    const bootstrapSubmessage=document.getElementById("bootstrap-submessage");
    const slowConnectionTimer=window.setTimeout(()=>{if(bootstrapMessage){bootstrapMessage.textContent="Still preparing secure sign-in…";}if(bootstrapSubmessage){bootstrapSubmessage.textContent="A slower connection may take a few more seconds";}},4000);
    const loadScript=(src,attrs={})=>new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=src;s.async=false;s.crossOrigin="anonymous";s.nonce="${nonce}";Object.entries(attrs).forEach(([k,v])=>s.setAttribute(k,v));s.onload=resolve;s.onerror=()=>reject(new Error("Authentication library could not be loaded."));document.head.appendChild(s);});
    await loadScript("https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6/dist/clerk.browser.js",{"data-clerk-publishable-key":publishableKey});
    if(!window.Clerk)throw new Error("Authentication library is unavailable.");
    const returnUrl=window.location.pathname+window.location.search;await window.Clerk.load({signInForceRedirectUrl:returnUrl,signUpForceRedirectUrl:returnUrl});clearTimeout(slowConnectionTimer);const clerk=window.Clerk;
    const main=document.querySelector("main");
    main.innerHTML=\`      <div class="sc-brand"><img class="sc-logo-mark" src="${logoMark}" alt="System Commander"><img class="sc-logo-wordmark" src="${logoWordmark}" alt="System Commander"><div class="sc-tagline">Secure access to your connected computer</div><div class="sc-byline">By Leukode Labs</div></div>      <section id="sc-auth" class="sc-card"><div class="sc-eyebrow">SYSTEM COMMANDER ID</div><h1 id="sc-title">Continue to System Commander</h1><p id="sc-intro" class="sc-intro">Choose how you want to continue. Your account can be used to connect this computer securely.</p><div class="sc-social-title">Continue with</div><div class="sc-social"><button id="sc-google" class="sc-oauth sc-google" type="button"><span class="sc-provider-icon"><img src="${googleLogo}" alt="" aria-hidden="true"></span><span>Google</span></button><button id="sc-github" class="sc-oauth sc-github" type="button"><span class="sc-provider-icon"><img src="${githubLogo}" alt="" aria-hidden="true"></span><span>GitHub</span></button></div><div class="sc-divider"><span>OR</span></div><button id="sc-email-toggle" class="sc-email-toggle" type="button">Use email instead</button><div id="sc-email-panel" class="sc-hidden"><div class="sc-tabs"><button id="sc-signin-tab" class="sc-tab active" type="button">Sign in</button><button id="sc-signup-tab" class="sc-tab" type="button">Create account</button></div><form id="sc-auth-form"><div id="sc-name-wrap" class="sc-field sc-hidden"><label>Name</label><input id="sc-name" autocomplete="name" maxlength="120" placeholder="Your name"></div><div class="sc-field"><label>Email</label><input id="sc-email" type="email" autocomplete="email" required placeholder="you@example.com"></div><div class="sc-field"><label>Password</label><input id="sc-password" type="password" autocomplete="current-password" minlength="8" required placeholder="Your password"></div><button id="sc-submit" class="sc-submit" type="submit">Sign in</button><div id="sc-status" class="sc-status"></div></form><form id="sc-verify-form" class="sc-hidden"><div class="sc-field"><label>Verification code</label><input id="sc-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code"></div><button class="sc-submit" type="submit">Verify email</button><button id="sc-verify-back" class="sc-link" type="button">Back</button><div id="sc-verify-status" class="sc-status"></div></form><p class="sc-meta">Your identity is secured by System Commander.</p></div></section><section id="device-form" class="sc-card sc-hidden"><div class="sc-eyebrow">COMPUTER SETUP</div><h1>Connect this computer.</h1><p class="sc-intro">Register this device to generate its private connection credential.</p><div class="sc-field"><label>Device ID</label><input id="device-id" maxlength="96" readonly aria-readonly="true"></div><div class="sc-field"><label>Label</label><input id="label" value="My computer" maxlength="120"></div><button id="pair-button" class="sc-submit" type="button">Register this computer</button><div id="status" class="sc-status"></div></section><section id="result" class="sc-card sc-hidden"><div class="setup-shell"><div class="setup-brand"><img class="setup-mark" src="${logoMark}" alt=""><img class="setup-wordmark" src="${logoWordmark}" alt="System Commander"><span class="brand-label">Computer setup</span></div><div class="setup-steps"><div class="setup-step done"><span class="setup-step-num">✓</span><span class="setup-step-title">Account</span><div class="setup-step-sub">Signed in</div></div><div class="setup-step active"><span class="setup-step-num">2</span><span class="setup-step-title">Connect</span><div class="setup-step-sub">Run the command</div></div><div class="setup-step"><span class="setup-step-num">3</span><span class="setup-step-title">Ready</span><div class="setup-step-sub">Start using System Commander</div></div></div><div class="setup-eyebrow">COMPUTER REGISTERED</div><h1>Your computer is ready to connect.</h1><p>One step remains. Run the command below on this computer. System Commander will securely establish the connection for you.</p><div class="setup-command-wrap"><div class="setup-label">Step 2 · Open Terminal and paste this command</div><div class="setup-command"><button class="setup-copy" id="copy-command" type="button" aria-label="Copy command">⧉</button><code id="command"></code></div></div><div class="setup-note"><span>◆</span><div><strong>Keep this private.</strong><br>The command contains your computer's private connection credential. Do not post or share it publicly.</div></div><div class="setup-next"><div class="setup-action"><strong>1 · Paste & run</strong><span>Open Terminal, paste the command, then press Enter.</span></div><div class="setup-action"><strong>2 · Leave it running</strong><span>Keep the Terminal window open while you want System Commander connected.</span></div></div><div class="setup-after"><strong>What happens next?</strong> Once the connection is established, this setup page is no longer needed. Your live System Commander monitor will open automatically so you can watch requests as they happen.</div></div></section>\`;
    const style=document.createElement("style");style.textContent="body{background:#06070a;color:#f4f7fb;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:28px}main{width:min(480px,100%)}.sc-brand{text-align:center;margin-bottom:24px}.sc-mark{width:44px;height:44px;margin:0 auto 12px;border-radius:13px;display:grid;place-items:center;background:#111811;border:1px solid #39472f;color:#c6f36b;font-weight:850}.sc-wordmark{font-size:12px;font-weight:850;letter-spacing:.22em}.sc-tagline{margin-top:8px;color:#8d98a8;font-size:13px}.sc-card{border:1px solid #242b35;background:#0d1015;border-radius:24px;padding:28px;box-shadow:0 28px 90px rgba(0,0,0,.42)}.sc-eyebrow{font-size:11px;letter-spacing:.14em;color:#c6f36b;font-weight:800;margin-bottom:10px}.sc-card h1{margin:0;font-size:28px}.sc-intro{margin:10px 0 22px;color:#8d98a8;font-size:14px;line-height:1.6}.sc-tabs{display:grid;grid-template-columns:1fr 1fr;padding:4px;background:#090b0f;border:1px solid #242b35;border-radius:12px;margin-bottom:20px}.sc-tab{border:0;border-radius:9px;padding:10px;background:transparent;color:#8d98a8;font-weight:700;cursor:pointer}.sc-tab.active{background:#171c24;color:#fff}.sc-field{margin:14px 0}.sc-card label{display:block;margin-bottom:7px;font-size:12px;color:#bcc5d0}.sc-card input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid #2b333e;background:#090c11;color:#fff;font:inherit;outline:none}.sc-submit{width:100%;margin-top:8px;padding:13px 16px;border:0;border-radius:12px;background:#c6f36b;color:#0a0d08;font-weight:850;cursor:pointer}.sc-submit:disabled{opacity:.55}.sc-status{min-height:22px;margin-top:14px;color:#ff8f8f;font-size:12px}.sc-status.ok{color:#3ddc84}.sc-social-title{font-size:12px;color:#767d87;text-align:center;margin:-4px 0 10px;font-weight:600}.sc-social{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sc-oauth{height:46px;border:1px solid #1d2126;border-radius:3px;background:#08090b;color:#eef0f2;display:flex;align-items:center;justify-content:center;gap:10px;font:600 13px Space Grotesk,system-ui,sans-serif;cursor:pointer}.sc-oauth:hover{border-color:#5fd4e0;background:#0c1114}.sc-oauth:disabled{opacity:.55;cursor:wait}.sc-provider-icon{width:20px;height:20px;display:grid;place-items:center}.sc-provider-icon img{width:20px;height:20px;display:block;object-fit:contain}.sc-divider{display:flex;align-items:center;gap:12px;margin:18px 0;color:#4b5158;font-size:10px;letter-spacing:.16em}.sc-divider:before,.sc-divider:after{content:\\\"\\\";height:1px;background:#1d2126;flex:1}.sc-email-toggle{width:100%;height:42px;border:1px solid #1d2126;border-radius:3px;background:transparent;color:#5fd4e0;font:600 13px Space Grotesk,system-ui,sans-serif;cursor:pointer}.sc-email-toggle:hover{background:rgba(95,212,224,.06)}.sc-meta{margin:16px 0 0;text-align:center;color:#697586;font-size:11px}.sc-hidden{display:none!important}.sc-link{background:none;border:0;color:#b8c7d8;margin-top:8px;cursor:pointer}.sc-label{color:#8d98a8;font-size:12px;margin:15px 0 6px}.sc-warn{color:#ffd18a;font-size:12px}.sc-card pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:15px;border-radius:12px;background:#080a0e;border:1px solid #232a34;color:#dfe4eb;font:12px/1.55 ui-monospace,monospace}";document.head.appendChild(style); const brandStyle=document.createElement("style"); brandStyle.textContent=".sc-brand{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:28px}.sc-logo-mark{display:block;width:58px;height:58px;object-fit:contain}.sc-logo-wordmark{display:block;width:210px;height:70px;object-fit:contain}.sc-tagline{margin-top:0;color:#767d87;font-family:Space Grotesk,system-ui,sans-serif;font-size:12px}.sc-byline{margin-top:2px;color:#4f5966;font-family:Space Grotesk,system-ui,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase}.sc-card{background:#101215;border-color:#1d2126;border-radius:3px;box-shadow:0 24px 70px rgba(0,0,0,.38)}.sc-eyebrow{color:#5fd4e0}.sc-tabs{background:#08090b;border-color:#1d2126;border-radius:3px}.sc-tab{border-radius:2px}.sc-tab.active{background:linear-gradient(90deg,rgba(0,255,255,.12),rgba(0,100,255,.10));color:#eef0f2;box-shadow:inset 0 -1px #5fd4e0}.sc-card input{background:#08090b;border-color:#1d2126;border-radius:3px}.sc-card input:focus{border-color:#5fd4e0;box-shadow:0 0 0 3px rgba(95,212,224,.12)}.sc-submit{background:linear-gradient(90deg,#5fd4e0,#3d7cff);color:#061014;border-radius:3px;box-shadow:0 8px 22px rgba(0,140,255,.18)}.sc-submit:hover{filter:brightness(1.06)}.sc-status.ok{color:#3ddc84}.sc-link{color:#5fd4e0}.sc-label{color:#767d87}.sc-warn{color:#ffb454}.sc-meta{color:#4b5158}.sc-card pre{background:#08090b;border-color:#1d2126}"; document.head.appendChild(brandStyle);
    const authCard=document.getElementById("sc-auth"),authForm=document.getElementById("sc-auth-form"),verifyForm=document.getElementById("sc-verify-form"),signInTab=document.getElementById("sc-signin-tab"),signUpTab=document.getElementById("sc-signup-tab"),nameWrap=document.getElementById("sc-name-wrap"),nameInput=document.getElementById("sc-name"),emailInput=document.getElementById("sc-email"),passwordInput=document.getElementById("sc-password"),submit=document.getElementById("sc-submit"),authStatus=document.getElementById("sc-status"),verifyCode=document.getElementById("sc-code"),verifyStatus=document.getElementById("sc-verify-status"),deviceForm=document.getElementById("device-form"),result=document.getElementById("result"),deviceStatus=document.getElementById("status"),pairButton=document.getElementById("pair-button"),copyCommand=document.getElementById("copy-command");
    let mode="signin",deviceExists=false;
    const messageFrom=e=>Array.isArray(e?.errors)&&e.errors.length?e.errors.map(x=>x.longMessage||x.message).filter(Boolean).join(" "):e?.message||String(e);
    const emailPanel=document.getElementById("sc-email-panel"),emailToggle=document.getElementById("sc-email-toggle"),googleButton=document.getElementById("sc-google"),githubButton=document.getElementById("sc-github");
    const setAuthStatus=(m,ok=false)=>{authStatus.textContent=m||"";authStatus.className=m?"sc-status"+(ok?" ok":""):"sc-status";};
    const setSocialBusy=(busy,label)=>{googleButton.disabled=busy;githubButton.disabled=busy;if(label){googleButton.querySelector("span:last-child").textContent=label;githubButton.querySelector("span:last-child").textContent=label;}else{googleButton.querySelector("span:last-child").textContent="Google";githubButton.querySelector("span:last-child").textContent="GitHub";}};
    const startOAuth=async strategy=>{setSocialBusy(true,"Opening…");try{const target=window.location.pathname+window.location.search;const callback=new URL("/sso-callback",window.location.origin);callback.searchParams.set("return",target);await clerk.client.signIn.authenticateWithRedirect({strategy,redirectUrl:callback.toString()});}catch(error){emailPanel.classList.remove("sc-hidden");setAuthStatus(messageFrom(error));setSocialBusy(false);}};
    googleButton.addEventListener("click",()=>startOAuth("oauth_google"));
    githubButton.addEventListener("click",()=>startOAuth("oauth_github"));
    emailToggle.addEventListener("click",()=>{const open=!emailPanel.classList.contains("sc-hidden");emailPanel.classList.toggle("sc-hidden",open);emailToggle.textContent=open?"Use email instead":"Hide email options";if(!open)setAuthStatus("");});
    const activate=async a=>{if(a.status==="needs_second_factor")throw new Error("This account requires an additional verification step.");if(a.status!=="complete"||!a.createdSessionId)throw new Error("Authentication needs another step.");await clerk.setActive({session:a.createdSessionId});};
    const showMode=next=>{mode=next;const signup=mode==="signup";signInTab.classList.toggle("active",!signup);signUpTab.classList.toggle("active",signup);nameWrap.classList.toggle("sc-hidden",!signup);document.getElementById("sc-title").textContent=signup?"Create your account.":"Welcome back.";document.getElementById("sc-intro").textContent=signup?"Create a System Commander identity to connect your computer.":"Sign in to connect this browser to your System Commander account.";submit.textContent=signup?"Create account":"Sign in";passwordInput.autocomplete=signup?"new-password":"current-password";setAuthStatus("");};
    const refreshDeviceState=async()=>{const t=await clerk.session.getToken();if(!t)return;const r=await fetch("/api/devices",{headers:{Authorization:"Bearer "+t}});if(!r.ok)return;const ds=await r.json();const id=document.getElementById("device-id").value.trim();deviceExists=Array.isArray(ds)&&ds.some(d=>d.deviceId===id);if(deviceExists)pairButton.textContent="Generate a fresh device token";};
    const finishAuth=async()=>{authCard.classList.add("sc-hidden");deviceForm.classList.remove("sc-hidden");deviceStatus.textContent="Checking your connected computers…";try{await Promise.race([refreshDeviceState(),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Device check timed out.")),10000))]);deviceStatus.textContent="Ready to connect this computer.";}catch(error){deviceStatus.textContent="Ready to connect this computer. Device history could not be refreshed yet.";}};
    authForm.addEventListener("submit",async e=>{e.preventDefault();submit.disabled=true;submit.textContent=mode==="signup"?"Creating account…":"Signing in…";setAuthStatus("");try{const email=emailInput.value.trim(),password=passwordInput.value;if(mode==="signin"){const a=await clerk.client.signIn.create({identifier:email,password});await activate(a);await finishAuth();}else{const p={emailAddress:email,password};const n=nameInput.value.trim();if(n)p.firstName=n.split(/\s+/)[0];if(n&&n.split(/\s+/).length>1)p.lastName=n.split(/\s+/).slice(1).join(" ");const a=await clerk.client.signUp.create(p);if(a.status==="complete"){await activate(a);await finishAuth();}else{if(typeof clerk.client.signUp.prepareEmailAddressVerification==="function")await clerk.client.signUp.prepareEmailAddressVerification({strategy:"email_code"});else if(typeof clerk.client.signUp.prepareVerification==="function")await clerk.client.signUp.prepareVerification({strategy:"email_code"});else throw new Error("Email verification is required but is unavailable.");authForm.classList.add("sc-hidden");verifyForm.classList.remove("sc-hidden");verifyStatus.textContent="We sent a verification code to "+email+".";verifyStatus.className="sc-status ok";verifyCode.focus();}}}catch(err){setAuthStatus(messageFrom(err));}finally{submit.disabled=false;submit.textContent=mode==="signup"?"Create account":"Sign in";}});
    verifyForm.addEventListener("submit",async e=>{e.preventDefault();verifyStatus.textContent="Verifying…";try{const a=await clerk.client.signUp.attemptEmailAddressVerification({code:verifyCode.value.trim()});await activate(a);await finishAuth();}catch(err){verifyStatus.textContent=messageFrom(err);}});
    document.getElementById("sc-verify-back").addEventListener("click",()=>{verifyForm.classList.add("sc-hidden");authForm.classList.remove("sc-hidden");});signInTab.addEventListener("click",()=>showMode("signin"));signUpTab.addEventListener("click",()=>showMode("signup"));
    const q=new URLSearchParams(window.location.search).get("deviceId"),generated="SC-"+Math.random().toString(36).slice(2,14).toUpperCase();document.getElementById("device-id").value=/^[A-Za-z0-9._:-]{1,96}$/.test(q||"")?q:generated;
    const showDevice=async b=>{document.getElementById("command").textContent=b.remoteCommand;deviceForm.classList.add("sc-hidden");result.classList.remove("sc-hidden");copyCommand?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(b.remoteCommand);copyCommand.textContent="✓";setTimeout(()=>copyCommand.textContent="⧉",1400);}catch{copyCommand.textContent="!";setTimeout(()=>copyCommand.textContent="⧉",1400);}});};
    const rotate=async()=>{deviceStatus.textContent="Generating a fresh device token…";const t=await clerk.session.getToken();if(!t)throw new Error("No authenticated System Commander session.");const id=document.getElementById("device-id").value.trim();const r=await fetch("/api/devices/"+encodeURIComponent(id)+"/rotate",{method:"POST",headers:{Authorization:"Bearer "+t}});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||"Unable to rotate device token.");await showDevice(b);};
    const register=async()=>{deviceStatus.textContent="Registering device…";const t=await clerk.session.getToken();if(!t)throw new Error("No authenticated System Commander session.");const r=await fetch("/api/devices",{method:"POST",headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"},body:JSON.stringify({deviceId:document.getElementById("device-id").value.trim(),label:document.getElementById("label").value.trim()})});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||"Unable to register device.");deviceExists=true;await showDevice(b);};
    pairButton.addEventListener("click",()=>{(deviceExists?rotate():register()).catch(e=>{deviceStatus.textContent=messageFrom(e);});});
    if(clerk.isSignedIn)await finishAuth();else showMode("signin");
  })().catch(err=>{clearTimeout(slowConnectionTimer);if(bootstrapMain){bootstrapMain.classList.add("bootstrap-error");bootstrapMain.setAttribute("aria-busy","false");}if(bootstrapMessage){bootstrapMessage.textContent="Secure sign-in could not be loaded."; }if(bootstrapSubmessage){bootstrapSubmessage.textContent=err?.message||"Please refresh the page and try again.";}});
  </script>
</body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "system-commander-relay",
    version: VERSION,
    connectedDevices: devices.size,
  });
});

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json(protectedResourceMetadata("/mcp"));
});

app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
  res.json(protectedResourceMetadata("/mcp"));
});

app.get("/.well-known/oauth-protected-resource/mcp/:deviceId", (req, res) => {
  res.json(protectedResourceMetadata("/mcp/" + encodeURIComponent(req.params.deviceId)));
});

app.get("/.well-known/oauth-authorization-server", async (_req, res) => {
  try {
    res.json(await getAuthorizationServerMetadata());
  } catch (error: any) {
    res.status(503).json({ error: error?.message || "OAuth metadata unavailable." });
  }
});

app.get("/api/account", accountRateLimit, async (req, res) => {
  const auth = await getUserAuth(req, res);
  if (!auth) return;
  try {
    const account = await ensureAccount(auth);
    res.json({
      id: account._id,
      userId: account.clerkUserId,
      email: account.email,
      name: account.name,
      createdAt: account.createdAt,
    });
  } catch {
    res.status(503).json({ error: "Account service unavailable." });
  }
});
app.get("/api/devices", accountRateLimit, async (req, res) => {
  const auth = await getUserAuth(req, res);
  if (!auth) return;
  try {
    await ensureAccount(auth);
    res.json(await convex.query(api.devices.listDevicesForUser, {
      clerkUserId: auth.userId,
    }));
  } catch {
    res.status(503).json({ error: "Device service unavailable." });
  }
});

app.post("/api/devices", accountRateLimit, async (req, res) => {
  const auth = await getUserAuth(req, res);
  if (!auth) return;

  const deviceId =
    typeof req.body?.deviceId === "string" && req.body.deviceId.trim()
      ? req.body.deviceId.trim()
      : "SC-" + randomUUID().slice(0, 12);

  const label =
    typeof req.body?.label === "string"
      ? req.body.label.trim().slice(0, 120)
      : undefined;

  if (!/^[A-Za-z0-9._:-]{1,96}$/.test(deviceId)) {
    res.status(400).json({ error: "deviceId contains unsupported characters." });
    return;
  }

  try {
    await ensureAccount(auth);
    const result = await convex.mutation(api.devices.registerDeviceForUser, {
      clerkUserId: auth.userId,
      deviceId,
      label,
      tokenTtlMs: deviceTokenTtlMs(),
    });
    const remoteCommand =
      "npx @leukode-labs/system-commander@latest remote --relay " +
      PUBLIC_URL +
      " --device-id " +
      result.deviceId +
      " --token " +
      result.token;

    res.status(201).json({
      deviceId: result.deviceId,
      token: result.token,
      expiresAt: result.expiresAt,
      relayUrl: PUBLIC_URL,
      remoteCommand,
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Unable to register device." });
  }
});

app.post("/api/devices/:deviceId/rotate", accountRateLimit, async (req, res) => {
  const auth = await getUserAuth(req, res);
  if (!auth) return;

  try {
    const result = await convex.mutation(api.devices.rotateDeviceToken, {
      clerkUserId: auth.userId,
      deviceId: req.params.deviceId,
      tokenTtlMs: deviceTokenTtlMs(),
    });
    const device = devices.get(req.params.deviceId);
    if (device) {
      for (const pending of device.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Device token rotated."));
      }
      device.socket.close(1008, "Device token rotated");
      devices.delete(req.params.deviceId);
    }
    const remoteCommand =
      "npx @leukode-labs/system-commander@latest remote --relay " +
      PUBLIC_URL +
      " --device-id " +
      result.deviceId +
      " --token " +
      result.token;

    res.json({
      deviceId: result.deviceId,
      token: result.token,
      expiresAt: result.expiresAt,
      remoteCommand,
    });
  } catch (error: any) {
    res.status(404).json({ error: error?.message || "Device not found." });
  }
});

app.delete("/api/devices/:deviceId", accountRateLimit, async (req, res) => {
  const auth = await getUserAuth(req, res);
  if (!auth) return;

  try {
    const revoked = await convex.mutation(api.devices.revokeDevice, {
      clerkUserId: auth.userId,
      deviceId: req.params.deviceId,
    });
    const device = devices.get(req.params.deviceId);
    if (device) {
      for (const pending of device.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Device revoked."));
      }
      device.socket.close(1008, "Device revoked");
      devices.delete(req.params.deviceId);
    }
    res.status(revoked ? 204 : 404).end();
  } catch {
    res.status(503).json({ error: "Device service unavailable." });
  }
});
app.all("/mcp/:deviceId", requestRateLimit, async (req, res) => {
  const deviceId = req.params.deviceId;
  const protectedResourcePath = "/mcp/" + encodeURIComponent(deviceId);
  const auth = await getUserAuth(req, res, protectedResourcePath);
  if (!auth) return;

  if (auth.tokenType !== "oauth_token") {
    res.status(401).json({ error: "This MCP endpoint requires a System Commander OAuth access token." });
    return;
  }

  try {
    const account = await ensureAccount(auth);
    const deviceRecord = await convex.query(api.devices.getDeviceForUser, {
      clerkUserId: auth.userId,
      deviceId,
    });

    if (!deviceRecord) {
      res.status(403).json({
        error: "This device is not owned by the authenticated System Commander account.",
      });
      return;
    }

    const usage = await consumeMonthlyUsage(auth);
    if (!usage.allowed) {
      res.setHeader("Retry-After", "3600");
      res.status(429).json({ error: "Monthly System Commander usage limit reached." });
      return;
    }

    const device = devices.get(deviceId);
    if (!device || device.socket.readyState !== WebSocket.OPEN) {
      res.status(503).json({ error: "System Commander device is offline." });
      return;
    }
    if (device.accountId !== String(account._id)) {
      res.status(403).json({ error: "Device/account authorization mismatch." });
      return;
    }

    const server = createMcpServer(deviceId);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } finally {
      try {
        await transport.close();
      } catch {}
    }
  } catch (error: any) {
    if (!res.headersSent) {
      const message = error?.message || String(error);
      const status = /rate|limit/i.test(message)
        ? 429
        : /offline|busy/i.test(message)
          ? 503
          : 500;
      res.status(status).json({
        error: "System Commander MCP relay error.",
        detail: message,
      });
    }
  }
});

const httpServer = createServer(app);
const wss = new WebSocketServer({
  server: httpServer,
  path: "/device/connect",
  maxPayload: WS_MAX_PAYLOAD,
  perMessageDeflate: false,
});

const connectionWindows = new Map<string, { startedAt: number; count: number }>();

function allowDeviceConnection(ip: string): boolean {
  const now = Date.now();
  const current = connectionWindows.get(ip);
  if (!current || now - current.startedAt >= 60_000) {
    connectionWindows.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= Number(process.env.WS_CONNECTIONS_PER_MINUTE ?? 30)) return false;
  current.count += 1;
  return true;
}

wss.on("connection", (socket, request) => {
  const ip = request.socket.remoteAddress || "unknown";
  if (!allowDeviceConnection(ip)) {
    socket.send(JSON.stringify({
      type: "auth_error",
      code: "RATE_LIMITED",
      message: "Too many connection attempts from this network."
    }));
    socket.close(1013, "Connection rate limited");
    return;
  }

  let boundDeviceId: string | null = null;
  const registrationTimer = setTimeout(() => {
    if (!boundDeviceId) {
      socket.send(JSON.stringify({
        type: "auth_error",
        code: "REGISTRATION_TIMEOUT",
        message: "The device did not complete registration in time."
      }));
      socket.close(1008, "Registration timeout");
    }
  }, 10_000);

  const trackedSocket = socket as WebSocket & { isAlive?: boolean };
  trackedSocket.isAlive = true;
  socket.on("pong", () => {
    trackedSocket.isAlive = true;
  });

  socket.on("message", async (raw) => {
    let message: any;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      socket.send(JSON.stringify({
        type: "auth_error",
        code: "INVALID_REGISTRATION",
        message: "The device sent an invalid registration message."
      }));
      socket.close(1007, "Invalid JSON");
      return;
    }
    if (!boundDeviceId) {
      if (!message || message.type !== "register") {
        socket.send(JSON.stringify({
          type: "auth_error",
          code: "INVALID_REGISTRATION",
          message: "Device registration was not received."
        }));
        socket.close(1008, "Registration required");
        return;
      }

      if (
        typeof message.deviceId !== "string" ||
        typeof message.token !== "string" ||
        message.deviceId.length < 1 ||
        message.deviceId.length > 96 ||
        message.token.length < 32
      ) {
        socket.send(JSON.stringify({
          type: "auth_error",
          code: "INVALID_REGISTRATION",
          message: "The device ID or token in the registration command is invalid."
        }));
        socket.close(1008, "Invalid registration");
        return;
      }

      try {
        const validation = await convex.query(api.devices.validateToken, {
          deviceId: message.deviceId,
          token: message.token,
        });

        if (!validation.valid) {
          const code = validation.code;
          socket.send(JSON.stringify({
            type: "auth_error",
            code,
            message:
              code === "TOKEN_EXPIRED"
                ? "System Commander device token expired."
                : code === "DEVICE_NOT_REGISTERED"
                  ? "System Commander device is not registered in this Cloud account."
                  : "Invalid System Commander device token.",
          }));
          socket.close(1008, "Invalid token");
          return;
        }
        const previous = devices.get(message.deviceId);
        if (previous && previous.socket !== socket) {
          for (const pending of previous.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error("Device session replaced."));
          }
          previous.socket.close(1008, "Replaced by a newer session");
        }

        const registeredDeviceId = message.deviceId;
        boundDeviceId = registeredDeviceId;
        clearTimeout(registrationTimer);

        devices.set(registeredDeviceId, {
          socket,
          pending: new Map(),
          tools: Array.isArray(message.tools) ? message.tools.slice(0, 1000) : [],
          accountId: String(validation.accountId),
        });

        socket.send(JSON.stringify({
          type: "registered",
          deviceId: boundDeviceId,
        }));

        void convex.mutation(api.devices.touchLastSeen, {
          deviceId: boundDeviceId,
        }).catch(() => {});

        console.log("[relay] System Commander device connected:", boundDeviceId);
        return;
      } catch (error: any) {
        console.error("[relay] device authentication failure:", error?.message || String(error));
        socket.send(JSON.stringify({
          type: "auth_error",
          code: "AUTH_SERVICE_UNAVAILABLE",
          message: "System Commander Cloud could not verify this device right now."
        }));
        socket.close(1011, "Authentication unavailable");
        return;
      }
    }

    const device = devices.get(boundDeviceId);
    if (!device || device.socket !== socket) return;

    if (message?.type === "tool_result" || message?.type === "list_tools_result") {
      if (typeof message.requestId !== "string" || message.requestId.length > 100) return;
      const pending = device.pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      device.pending.delete(message.requestId);
      pending.resolve(message.result);
    }
  });

  socket.on("close", () => {
    clearTimeout(registrationTimer);
    if (!boundDeviceId) return;

    const device = devices.get(boundDeviceId);
    if (device?.socket === socket) {
      for (const pending of device.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("System Commander device disconnected."));
      }
      devices.delete(boundDeviceId);
      console.log("[relay] System Commander device disconnected:", boundDeviceId);
    }
  });

  socket.on("error", (error) => {
    console.error("[relay] device socket error:", error.message);
  });
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    const tracked = socket as WebSocket & { isAlive?: boolean };
    if (tracked.isAlive === false) {
      socket.terminate();
      continue;
    }
    tracked.isAlive = false;
    socket.ping();
  }
}, 30_000);
heartbeat.unref();

httpServer.headersTimeout = 15_000;
httpServer.requestTimeout = Math.max(RPC_TIMEOUT_MS + 10_000, 30_000);
httpServer.keepAliveTimeout = 65_000;

const shutdown = () => {
  clearInterval(heartbeat);

  for (const device of devices.values()) {
    for (const pending of device.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Relay shutting down."));
    }
    device.socket.close(1001, "Relay shutting down");
  }

  devices.clear();
  httpServer.close(() => process.exit(0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

httpServer.listen(PORT, () => {
  console.log("[relay] System Commander Cloud listening on port " + PORT);
  console.log("[relay] MCP endpoint: " + PUBLIC_URL + "/mcp/:deviceId");
  console.log("[relay] Device WebSocket: /device/connect");
  if (!IS_PRODUCTION && process.env.SYSTEM_COMMANDER_DEV_AUTH === "true") {
    console.log("[relay] Development bearer auth override is enabled.");
  }
});
