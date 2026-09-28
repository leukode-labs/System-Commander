import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
export const createAccount = mutation({
    args: {
        email: v.string(),
        name: v.optional(v.string()),
        clerkUserId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const existingByClerk = args.clerkUserId
            ? await ctx.db.query("accounts")
                .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
                .unique()
            : null;
        if (existingByClerk)
            return existingByClerk._id;
        const existingByEmail = await ctx.db
            .query("accounts")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .unique();
        if (existingByEmail) {
            const patch = { updatedAt: now };
            if (args.name)
                patch.name = args.name;
            if (args.clerkUserId && !existingByEmail.clerkUserId)
                patch.clerkUserId = args.clerkUserId;
            await ctx.db.patch(existingByEmail._id, patch);
            return existingByEmail._id;
        }
        return await ctx.db.insert("accounts", {
            email: args.email,
            name: args.name,
            clerkUserId: args.clerkUserId,
            createdAt: now,
            updatedAt: now,
        });
    },
});
export const ensureAccountForUser = mutation({
    args: {
        clerkUserId: v.string(),
        email: v.optional(v.string()),
        name: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const existing = await ctx.db
            .query("accounts")
            .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
            .unique();
        if (existing) {
            const patch = { updatedAt: now };
            if (args.email && args.email !== existing.email)
                patch.email = args.email;
            if (args.name && args.name !== existing.name)
                patch.name = args.name;
            await ctx.db.patch(existing._id, patch);
            return existing._id;
        }
        return await ctx.db.insert("accounts", {
            clerkUserId: args.clerkUserId,
            email: args.email || args.clerkUserId + "@system-commander.invalid",
            name: args.name,
            createdAt: now,
            updatedAt: now,
        });
    },
});
// DEV-ONLY diagnostic query; remove after pairing the current test account.
export const listAccountsForDevelopment = query({
    args: {},
    handler: async (ctx) => {
        const accounts = await ctx.db.query("accounts").collect();
        return accounts
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
            .map((a) => ({
            clerkUserId: a.clerkUserId,
            email: a.email,
            name: a.name,
            createdAt: a.createdAt,
        }));
    },
});
export const getAccountByClerkUserId = query({
    args: { clerkUserId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("accounts")
            .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
            .unique();
    },
});
export const getAccountByEmail = query({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("accounts")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .unique();
    },
});
//# sourceMappingURL=accounts.js.map