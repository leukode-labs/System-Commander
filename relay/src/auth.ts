import dotenv from "dotenv";
import { authenticateRequest as clerkAuthenticateRequest, createClerkClient } from "@clerk/express";
import type { Request } from "express";

const envFile = process.env.NODE_ENV === "production"
  ? ".env.production"
  : process.env.NODE_ENV === "test"
    ? ".env.test"
    : ".env.local";
dotenv.config({ path: envFile });

export interface AuthContext {
  userId: string;
  scopes: string[];
  tokenType: "session_token" | "oauth_token" | "dev";
}

const isProduction = process.env.NODE_ENV === "production";
const allowDevAuth = process.env.SYSTEM_COMMANDER_DEV_AUTH === "true" && !isProduction;

const clerkClient = process.env.CLERK_SECRET_KEY
  ? createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
      jwtKey: process.env.CLERK_JWT_KEY,
    })
  : null;

function requiredScopeList(): string[] {
  return (process.env.SYSTEM_COMMANDER_REQUIRED_SCOPES || "tools:execute")
    .split(/[ ,]+/).map((value) => value.trim()).filter(Boolean);
}

export function requiredScopes(): string[] {
  return requiredScopeList();
}

export async function authenticateUser(req: Request): Promise<AuthContext | null> {
  const authorization = req.header("authorization") || "";
  if (allowDevAuth && authorization.startsWith("Bearer dev:")) {
    return {
      userId: authorization.slice("Bearer dev:".length),
      scopes: requiredScopeList(),
      tokenType: "dev",
    };
  }
  if (!clerkClient) {
    throw new Error("Clerk authentication is not configured.");
  }

  const requestState = await clerkAuthenticateRequest({
    clerkClient,
    request: req,
    options: {
      // Remote MCP clients such as Claude present a Clerk OAuth access
      // token issued to the OAuth client. Do not apply the browser-origin
      // authorizedParties check to this machine-token flow.
      acceptsToken: ["session_token", "oauth_token"],
    },
  });

  if (!requestState.isAuthenticated) return null;

  const auth = requestState.toAuth();
  const scopes = Array.isArray((auth as any).scopes) ? (auth as any).scopes : [];
  const userId = (auth as any).userId || (auth as any).subject;
  return {
    userId,
    scopes,
    tokenType: (auth as any).tokenType === "session_token" ? "session_token" : "oauth_token",
  };
}

export function hasRequiredScopes(auth: AuthContext): boolean {
  if (auth.tokenType === "dev" || auth.tokenType === "session_token") return true;
  const required = requiredScopeList();
  return required.every((scope) => auth.scopes.includes(scope));
}

export function isAuthConfigured(): boolean {
  return Boolean(clerkClient) || allowDevAuth;
}

export function publicAuthMetadataIssuer(): string {
  return (process.env.CLERK_ISSUER_URL || "").replace(/\/$/, "");
}
