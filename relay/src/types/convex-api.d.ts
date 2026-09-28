// The relay's own `tsc` pass runs with strict settings that Convex's
// function files (convex/*.ts) aren't written to satisfy on their own —
// Convex has its own, separate build/typecheck step for those (via
// `npx convex dev` / `convex deploy`), which already runs and passes.
// Without this shim, importing the generated `api` object pulls the real
// convex/accounts.ts and devices.ts source into *this* program for type
// resolution, which fails under our stricter config for reasons that have
// nothing to do with actual bugs. This keeps the two builds decoupled:
// Convex verifies its own functions, the relay just gets a loose handle
// to call them by name.
declare module '../convex/_generated/api.js' {
  export const api: any;
  export const internal: any;
}
