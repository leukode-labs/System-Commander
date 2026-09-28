# Setup Answers — Self-Hosted Remote MCP Platform

Captured from the interactive Q&A. Used as the spec for BUILD_PLAN.md.

## Scope
- **Multi-tenant from the start** (not single-device-first) — but build/prove the
  core relay on localhost before ever deploying
- Public-facing product, but **built to leave room for growth and scaling**
- v1 AI client target: **ChatGPT only**
- Keep the fork's **full current tool set** (filesystem, terminal, process control,
  etc.) — no trimming

## Stack
- Backend: **Node/TypeScript** (matches current fork)
- Database (accounts/devices): **Convex**
- Reverse proxy / TLS: **Caddy**

## Auth
- Device auth: **simple long-lived API token per device** (v1; can harden later)
- Dashboard login (once accounts exist): **GitHub OAuth**

## Hosting
- Test on **localhost first**, deploy to a real server only once proven
- VPS provider: **undecided — user still exploring options**, revisit at Phase 6

## Process
- **Pause after each phase** (relay → auth → dashboard → hosting) for user to test
  and approve before moving to the next

## Still open (free text, pending)
- Domain (own one already, or pick later) — **deferred, decide later**
- Anything to deliberately do differently vs. wonderwhy-er's product — **nothing for
  now, get it running first**

## Branding
- Company: **Leukode Labs**
- Product name: **System Commander** (flagship product for Leukode Labs)
- npm scope: **@leukode-labs**
- Package: **@leukode-labs/system-commander**
- CLI binary alias: **system-commander** (so users can run
  `npx @leukode-labs/system-commander remote` or the shorter aliased form)
- Relay URL: placeholder `localhost` for now, real domain swapped in later
  (five-minute change once a domain is picked)
