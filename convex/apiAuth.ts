import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Validate a hashed API token against the apiTokens table.
 * Used by HTTP routes (http.ts) for Bearer auth.
 */
export const validateTokenHash = query({
	args: { tokenHash: v.string() },
	handler: async (ctx, args) => {
		const token = await ctx.db
			.query("apiTokens")
			.withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
			.first();

		if (!token) return false;
		if (token.revokedAt) return false;

		return true;
	},
});

/**
 * Create a new API token. Returns the plaintext token (only shown once).
 * The hash is stored; the plaintext is never persisted.
 */
export const createToken = mutation({
	args: {
		name: v.string(),
		tenantId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Generate a random token
		const bytes = new Uint8Array(32);
		crypto.getRandomValues(bytes);
		const token = Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		const fullToken = `oc_${token}`;

		// Hash the full token (including prefix) — matches how http.ts validates
		const encoder = new TextEncoder();
		const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(fullToken));
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

		const tokenPrefix = token.slice(0, 8);

		await ctx.db.insert("apiTokens", {
			tokenHash,
			tokenPrefix,
			name: args.name,
			tenantId: args.tenantId ?? "default",
			createdAt: Date.now(),
		});

		// Return plaintext — this is the only time it's available
		return { token: `oc_${token}`, prefix: tokenPrefix };
	},
});
