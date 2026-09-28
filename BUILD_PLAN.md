# Self-Hosted Remote MCP Platform — Build Plan

Goal: replace `mcp.desktopcommander.app` with your own hosted relay, so devices connect
with your own CLI (`npx @your-scope/your-name remote`) instead of wonderwhy-er's.

Legend: 🤖 = Claude does this (code/config I can write or run for you) · 🧑 = you do this
(accounts, decisions, money, or things that need to happen outside this machine).

---

## 0. Prep & decisions

- [ ] 🧑 Pick a project/package name and npm scope (e.g. `@yourname/commander`)
- [ ] 🧑 Register the domain you'll use for the relay + dashboard (e.g. `yourdomain.dev`)
- [ ] 🤖 Confirm the upstream license (MIT, per `package.json`) permits a hosted fork —
      check `LICENSE` in this repo for any attribution clause before launch
- [ ] 🧑 Decide: free forever, or paid tiers like wonderwhy-er? (affects step 5)

## 1. CLI fork (client side — runs on each user's PC)

- [ ] 🤖 Fork `src/remote-device/` into your own CLI entry point
- [ ] 🤖 Replace the hardcoded `mcp.desktopcommander.app` endpoint with your relay's URL
      (env-configurable, so you can point it at localhost while testing)
- [ ] 🤖 Rework device pairing/auth (`device-authenticator.ts`) to talk to your own
      accounts system instead of wonderwhy-er's
- [ ] 🧑 Pick and reserve the npm package name (`npm view <name>` to check it's free)
- [ ] 🧑 Publish to npm (needs your own npm account + `npm publish`)

## 2. Relay server (the core product)

- [ ] 🤖 Build a Node/TypeScript server using `@modelcontextprotocol/sdk`'s
      `StreamableHTTPServerTransport`, so any MCP client (ChatGPT, Claude, etc.) can
      connect over plain HTTPS
- [ ] 🤖 Add a WebSocket (or Durable Object, if Cloudflare) channel that each user's CLI
      dials into and holds open
- [ ] 🤖 Build the message-forwarding logic: HTTP request in from an AI client → find the
      right connected device by account/device ID → forward over its WebSocket → return
      the response
- [ ] 🤖 Handle multiple simultaneous devices per account, and multiple accounts —
      isolate sessions so one user can never reach another's device
- [ ] 🤖 Add reconnect/heartbeat logic so a flaky connection doesn't silently go stale

## 3. Auth & accounts

- [ ] 🤖 Design the auth model: API keys per device, short-lived bearer tokens per MCP
      client connection, or both
- [ ] 🤖 Build the account system (email/password or OAuth — I can scaffold either)
- [ ] 🧑 Choose an auth provider if you don't want to hand-roll it (e.g. Clerk, Auth0,
      Supabase Auth) — this is a judgment call on cost vs. control
- [ ] 🤖 Wire device pairing to accounts (a device belongs to exactly one account)
- [ ] 🧑 Decide your security posture for "what happens if a token leaks" (revocation,
      expiry) — I can implement whatever policy you choose

## 4. Web dashboard

- [ ] 🤖 Build the pages: login, device list (online/offline status), per-device
      connector URL + token for pasting into ChatGPT/Claude, revoke/delete device
- [ ] 🧑 Decide hosting for the dashboard (can live on the same VPS as the relay, or
      separately — I'll default to same-VPS unless you say otherwise)

## 5. Billing (only if going paid)

- [ ] 🧑 Create a Stripe (or similar) account
- [ ] 🤖 Integrate Stripe Checkout/Billing, gate device limits or usage by plan
- [ ] 🧑 Set your actual pricing tiers

## 6. Hosting & infra

- [ ] 🧑 Provision a VPS (DigitalOcean/Hetzner/etc., ~$4–12/mo depending on load) —
      needs your payment method and account
- [ ] 🤖 Set up the server: Node runtime, process manager (pm2 or systemd), firewall
- [ ] 🤖 Configure Caddy (or nginx) as reverse proxy with automatic HTTPS via Let's Encrypt
- [ ] 🧑 Point your domain's DNS at the VPS
- [ ] 🤖 Set up basic monitoring/logging (uptime checks, error logs)
- [ ] 🧑 Set up backups/snapshots for the VPS (provider-level, a few clicks)

## 7. Testing

- [ ] 🤖 End-to-end test: this PC's CLI → your relay → a real MCP client (ChatGPT or
      Claude) → confirm file/terminal commands round-trip correctly
- [ ] 🤖 Test multi-device isolation (two devices, confirm no cross-talk)
- [ ] 🧑 Real-world test from a second machine/network (phone hotspot, friend's PC) to
      confirm it works outside your home network

## 8. Launch

- [ ] 🧑 Write your own README/landing page copy (I can draft, you'll want final say on
      positioning/pricing language)
- [ ] 🧑 Decide where to announce it (if at all) — Reddit, Product Hunt, HN, etc.
- [ ] 🤖 Add rate limiting / abuse protection before anything public-facing goes live

---

## Suggested order to actually build this

1. Step 2 (relay, no auth yet) + Step 1 (CLI pointed at `localhost`) — get one device
   talking to your own relay on your own machine first, no VPS, no accounts yet.
2. Step 3 (auth) — bolt on real accounts once the core forwarding works.
3. Step 6 (hosting) — move it off localhost onto a real VPS with HTTPS.
4. Step 4 (dashboard) — make it usable without you hand-editing a database.
5. Step 5 + 8 (billing, launch) — only once 1–4 are solid.

Start with step 2 whenever you're ready — that's the part that proves the whole idea
works before any money or public exposure is involved.
