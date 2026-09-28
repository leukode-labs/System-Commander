import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
    accounts: defineTable({
        email: v.string(),
        name: v.optional(v.string()),
        clerkUserId: v.optional(v.string()),
        githubId: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_email", ["email"])
        .index("by_clerkUserId", ["clerkUserId"]),
    devices: defineTable({
        accountId: v.id("accounts"),
        deviceId: v.string(),
        label: v.optional(v.string()),
        tokenHash: v.string(),
        tokenCreatedAt: v.number(),
        tokenExpiresAt: v.number(),
        lastSeenAt: v.optional(v.number()),
        createdAt: v.number(),
    })
        .index("by_deviceId", ["deviceId"])
        .index("by_account", ["accountId"]),
    usageBuckets: defineTable({
        accountId: v.id("accounts"),
        period: v.string(),
        calls: v.number(),
        updatedAt: v.number(),
    }).index("by_account_period", ["accountId", "period"]),
});
//# sourceMappingURL=schema.js.map