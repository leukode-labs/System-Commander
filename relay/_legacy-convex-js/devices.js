import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
async function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function generateToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function assertTtl(ttlMs) {
    if (!Number.isFinite(ttlMs) || ttlMs < 24 * 60 * 60 * 1000 || ttlMs > 365 * 24 * 60 * 60 * 1000) {
        throw new Error("Device token TTL must be between 1 and 365 days.");
    }
}
async function findAccountByClerkUserId(ctx, clerkUserId) {
    return await ctx.db.query("accounts")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
        .unique();
}
export const registerDeviceForUser = mutation({
    args: {
        clerkUserId: v.string(),
        deviceId: v.string(),
        label: v.optional(v.string()),
        tokenTtlMs: v.number(),
    },
    handler: async (ctx, args) => {
        assertTtl(args.tokenTtlMs);
        const account = await findAccountByClerkUserId(ctx, args.clerkUserId);
        if (!account)
            throw new Error("System Commander account is not provisioned.");
        const existing = await ctx.db.query("devices")
            .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId)).unique();
        if (existing)
            throw new Error("That device ID is already registered.");
        const now = Date.now();
        const token = generateToken();
        await ctx.db.insert("devices", {
            accountId: account._id,
            deviceId: args.deviceId,
            label: args.label,
            tokenHash: await sha256Hex(token),
            tokenCreatedAt: now,
            tokenExpiresAt: now + args.tokenTtlMs,
            createdAt: now,
        });
        return { deviceId: args.deviceId, token, expiresAt: now + args.tokenTtlMs };
    },
});
export const registerDevice = mutation({
    args: {
        accountEmail: v.string(),
        deviceId: v.string(),
        label: v.optional(v.string()),
        tokenTtlMs: v.number(),
    },
    handler: async (ctx, args) => {
        assertTtl(args.tokenTtlMs);
        const account = await ctx.db.query("accounts")
            .withIndex("by_email", (q) => q.eq("email", args.accountEmail)).unique();
        if (!account)
            throw new Error("No account for that email.");
        const existing = await ctx.db.query("devices")
            .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId)).unique();
        if (existing)
            throw new Error("That device ID is already registered.");
        const now = Date.now();
        const token = generateToken();
        await ctx.db.insert("devices", {
            accountId: account._id,
            deviceId: args.deviceId,
            label: args.label,
            tokenHash: await sha256Hex(token),
            tokenCreatedAt: now,
            tokenExpiresAt: now + args.tokenTtlMs,
            createdAt: now,
        });
        return { deviceId: args.deviceId, token, expiresAt: now + args.tokenTtlMs };
    },
});
export const validateToken = query({
    args: { deviceId: v.string(), token: v.string() },
    handler: async (ctx, args) => {
        const device = await ctx.db.query("devices")
            .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId)).unique();
        if (!device)
            return { valid: false };
        const tokenHash = await sha256Hex(args.token);
        if (tokenHash !== device.tokenHash)
            return { valid: false };
        if (device.tokenExpiresAt <= Date.now())
            return { valid: false, expired: true };
        return { valid: true, accountId: device.accountId };
    },
});
export const getDeviceForUser = query({
    args: { clerkUserId: v.string(), deviceId: v.string() },
    handler: async (ctx, args) => {
        const account = await findAccountByClerkUserId(ctx, args.clerkUserId);
        if (!account)
            return null;
        const device = await ctx.db.query("devices")
            .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId)).unique();
        if (!device || device.accountId !== account._id)
            return null;
        return {
            deviceId: device.deviceId,
            label: device.label,
            createdAt: device.createdAt,
            lastSeenAt: device.lastSeenAt,
            tokenExpiresAt: device.tokenExpiresAt,
        };
    },
});
export const listDevicesForUser = query({
    args: { clerkUserId: v.string() },
    handler: async (ctx, args) => {
        const account = await findAccountByClerkUserId(ctx, args.clerkUserId);
        if (!account)
            return [];
        const devices = await ctx.db.query("devices")
            .withIndex("by_account", (q) => q.eq("accountId", account._id)).collect();
        return devices.map((d) => ({
            deviceId: d.deviceId,
            label: d.label,
            createdAt: d.createdAt,
            lastSeenAt: d.lastSeenAt,
            tokenExpiresAt: d.tokenExpiresAt,
        }));
    },
});
export const touchLastSeen = mutation({
    args: { deviceId: v.string() },
    handler: async (ctx, args) => {
        const device = await ctx.db.query("devices")
            .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId)).unique();
        if (device)
            await ctx.db.patch(device._id, { lastSeenAt: Date.now() });
    },
});
export const rotateDeviceToken = mutation({
    args: { clerkUserId: v.string(), deviceId: v.string(), tokenTtlMs: v.number() },
    handler: async (ctx, args) => {
        assertTtl(args.tokenTtlMs);
        const account = await findAccountByClerkUserId(ctx, args.clerkUserId);
        if (!account)
            throw new Error("System Commander account is not provisioned.");
        const device = await ctx.db.query("devices")
            .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId)).unique();
        if (!device || device.accountId !== account._id)
            throw new Error("Device not found.");
        const now = Date.now();
        const token = generateToken();
        await ctx.db.patch(device._id, {
            tokenHash: await sha256Hex(token),
            tokenCreatedAt: now,
            tokenExpiresAt: now + args.tokenTtlMs,
        });
        return { deviceId: device.deviceId, token, expiresAt: now + args.tokenTtlMs };
    },
});
export const revokeDevice = mutation({
    args: { clerkUserId: v.string(), deviceId: v.string() },
    handler: async (ctx, args) => {
        const account = await findAccountByClerkUserId(ctx, args.clerkUserId);
        if (!account)
            return false;
        const device = await ctx.db.query("devices")
            .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId)).unique();
        if (!device || device.accountId !== account._id)
            return false;
        await ctx.db.delete(device._id);
        return true;
    },
});
export const consumeUsage = mutation({
    args: { clerkUserId: v.string(), period: v.string(), limit: v.number() },
    handler: async (ctx, args) => {
        const account = await findAccountByClerkUserId(ctx, args.clerkUserId);
        if (!account)
            return { allowed: false, calls: 0 };
        const existing = await ctx.db.query("usageBuckets")
            .withIndex("by_account_period", (q) => q.eq("accountId", account._id).eq("period", args.period)).unique();
        if (!existing) {
            await ctx.db.insert("usageBuckets", {
                accountId: account._id, period: args.period, calls: 1, updatedAt: Date.now(),
            });
            return { allowed: true, calls: 1 };
        }
        if (existing.calls >= args.limit)
            return { allowed: false, calls: existing.calls };
        await ctx.db.patch(existing._id, { calls: existing.calls + 1, updatedAt: Date.now() });
        return { allowed: true, calls: existing.calls + 1 };
    },
});
export const migrateLegacyRecords = mutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const accounts = await ctx.db.query("accounts").collect();
        const devices = await ctx.db.query("devices").collect();
        for (const account of accounts) {
            if (account.createdAt == null || account.updatedAt == null) {
                await ctx.db.patch(account._id, {
                    createdAt: account.createdAt ?? now,
                    updatedAt: account.updatedAt ?? now,
                });
            }
        }
        for (const device of devices) {
            if (device.tokenCreatedAt == null || device.tokenExpiresAt == null) {
                const createdAt = device.tokenCreatedAt ?? device.createdAt ?? now;
                await ctx.db.patch(device._id, {
                    tokenCreatedAt: createdAt,
                    tokenExpiresAt: Math.max(now + 24 * 60 * 60 * 1000, createdAt + 90 * 24 * 60 * 60 * 1000),
                });
            }
        }
        return { accounts: accounts.length, devices: devices.length };
    },
});
//# sourceMappingURL=devices.js.map