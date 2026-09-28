# Setup Questions — Self-Hosted Remote MCP Platform

Answer whatever you can now — anything left blank, I'll pick a sensible default and
note the assumption when I start building.

## 1. Naming & branding
1. What do you want to call this project/product? (used for the npm package name,
   the repo, and shown in your CLI's `--help`)
2. Do you already own a domain for it, or do you need to pick/buy one?
3. Is this meant to stay private (just for you / friends), or genuinely public-facing
   like wonderwhy-er's product?

## 2. Scope for the first working version
4. For the very first working version, is it OK if it only supports **one device,
   one account (you)** — no multi-tenancy yet — so we can prove the relay works
   before building accounts/billing?
5. Which AI clients do you actually need working first: ChatGPT, Claude web/desktop,
   both, or something else (Cursor, etc.)?
6. Do you want this to keep working with your existing "System Commander" fork's
   tools as-is, or do you want to trim/change which tools (filesystem, terminal,
   process control, etc.) are exposed?

## 3. Tech stack
7. Backend language/framework preference — plain Node/TypeScript (matches your
   existing fork), or something else (e.g. Bun, Deno, Python)?
8. Any preference for the reverse proxy / TLS setup — Caddy (simplest, auto-HTTPS),
   nginx, or no preference (I'll default to Caddy)?
9. Database for accounts/devices once we get to that stage — Postgres, SQLite,
   something hosted (Supabase, PlanetScale), or no preference?

## 4. Hosting
10. Do you already have a VPS provider you prefer (DigitalOcean, Hetzner, Linode,
    etc.), or should I recommend one based on price/location?
11. Roughly what's your monthly budget ceiling for hosting?
12. Do you want to test everything on `localhost` first before ever touching a VPS
    (recommended), or go straight to deploying on a server?

## 5. Auth & security
13. For device authentication, are you OK with a simple long-lived API token per
    device to start (simplest, matches how your current fork already works), or do
    you want something more robust (short-lived rotating tokens) from day one?
14. For the dashboard/account login later, do you have a preference (email+password,
    Google/GitHub OAuth, magic link), or should I decide when we get there?

## 6. Timeline & involvement
15. Do you want me to build this in one continuous push, or stop after each phase
    (relay → auth → dashboard → hosting) for you to test and approve before moving on?
16. Anything about wonderwhy-er's product specifically that you want to do
    *differently* — features you'd drop, add, or change?

---

*Once you answer these (even partially), I'll start on Phase 2 from BUILD_PLAN.md —
the core relay server — using your answers as the spec.*
