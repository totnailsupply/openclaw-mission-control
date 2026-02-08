import { v } from "convex/values";
import { query, internalQuery, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const upsertUsage = internalMutation({
	args: {
		date: v.string(),
		costCents: v.number(),
		inputTokens: v.number(),
		cacheReadTokens: v.number(),
		outputTokens: v.number(),
		cacheCreationTokens: v.number(),
		tenantId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("tokenUsage")
			.withIndex("by_date", (q) => q.eq("date", args.date))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				costCents: args.costCents,
				inputTokens: args.inputTokens,
				cacheReadTokens: args.cacheReadTokens,
				outputTokens: args.outputTokens,
				cacheCreationTokens: args.cacheCreationTokens,
				fetchedAt: Date.now(),
			});
		} else {
			await ctx.db.insert("tokenUsage", {
				...args,
				fetchedAt: Date.now(),
			});
		}
	},
});

export const upsertHourlyUsage = internalMutation({
	args: {
		timestamp: v.string(),
		costCents: v.number(),
		inputTokens: v.number(),
		cacheReadTokens: v.number(),
		outputTokens: v.number(),
		cacheCreationTokens: v.number(),
		tenantId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("tokenUsageHourly")
			.withIndex("by_timestamp", (q) => q.eq("timestamp", args.timestamp))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				costCents: args.costCents,
				inputTokens: args.inputTokens,
				cacheReadTokens: args.cacheReadTokens,
				outputTokens: args.outputTokens,
				cacheCreationTokens: args.cacheCreationTokens,
				fetchedAt: Date.now(),
			});
		} else {
			await ctx.db.insert("tokenUsageHourly", {
				...args,
				fetchedAt: Date.now(),
			});
		}
	},
});

export const fetchFromAnthropic = internalAction({
	handler: async (ctx) => {
		const apiKey = process.env.ANTHROPIC_ADMIN_API_KEY;
		if (!apiKey) {
			console.log("ANTHROPIC_ADMIN_API_KEY not set, skipping token usage fetch");
			return;
		}

		const now = new Date();
		const todayStr = now.toISOString().split("T")[0];
		// Fetch a 3-day window to handle timezone edge cases
		const twoDaysAgoStr = new Date(now.getTime() - 2 * 86_400_000).toISOString().split("T")[0];
		const tomorrowStr = new Date(now.getTime() + 86_400_000).toISOString().split("T")[0];

		const headers = {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		};

		let costCents = 0;
		let inputTokens = 0;
		let cacheReadTokens = 0;
		let outputTokens = 0;
		let cacheCreationTokens = 0;

		// Fetch cost report (3-day window to handle timezone edge cases)
		try {
			const costRes = await fetch(
				`https://api.anthropic.com/v1/organizations/cost_report?starting_at=${twoDaysAgoStr}T00:00:00Z&ending_at=${tomorrowStr}T00:00:00Z&bucket_width=1d`,
				{ headers },
			);
			const costBody = await costRes.text();
			if (costRes.ok) {
				const costData = JSON.parse(costBody);
				// Sum costs from the last 2 days (handles timezone overlap)
				for (const bucket of costData.data ?? []) {
					for (const result of bucket.results ?? []) {
						costCents += Math.round(parseFloat(result.amount ?? "0"));
					}
				}
			} else {
				console.error("Cost report API error:", costRes.status, costBody);
			}
		} catch (err) {
			console.error("Cost report fetch failed:", err);
		}

		// Fetch usage report (3-day window)
		try {
			const usageRes = await fetch(
				`https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${twoDaysAgoStr}T00:00:00Z&ending_at=${tomorrowStr}T00:00:00Z&bucket_width=1d`,
				{ headers },
			);
			const usageBody = await usageRes.text();
			if (usageRes.ok) {
				const usageData = JSON.parse(usageBody);
				// Sum tokens from the last 2 days (each bucket has results[] array)
				for (const bucket of usageData.data ?? []) {
					for (const result of bucket.results ?? []) {
						inputTokens += result.uncached_input_tokens ?? 0;
						cacheReadTokens += result.cache_read_input_tokens ?? 0;
						outputTokens += result.output_tokens ?? 0;
						// Cache creation tokens are nested
						const cacheCreation = result.cache_creation ?? {};
						cacheCreationTokens += (cacheCreation.ephemeral_5m_input_tokens ?? 0) +
						                       (cacheCreation.ephemeral_1h_input_tokens ?? 0);
					}
				}
			} else {
				console.error("Usage report API error:", usageRes.status, usageBody);
			}
		} catch (err) {
			console.error("Usage report fetch failed:", err);
		}

		console.log(`Token usage for ${todayStr}: $${(costCents / 100).toFixed(2)}, ${inputTokens} in, ${outputTokens} out`);

		await ctx.runMutation(internal.tokenUsage.upsertUsage, {
			date: todayStr,
			costCents,
			inputTokens,
			cacheReadTokens,
			outputTokens,
			cacheCreationTokens,
		});
	},
});

export const getTodayUsage = query({
	args: { tenantId: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const today = new Date().toISOString().split("T")[0];

		const usage = await ctx.db
			.query("tokenUsage")
			.withIndex("by_date", (q) => q.eq("date", today))
			.first();

		if (!usage) {
			return null;
		}

		// Look up daily budget from tenant settings
		let dailyBudgetCents = 2000; // default $20
		if (args.tenantId) {
			const settings = await ctx.db
				.query("tenantSettings")
				.withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId!))
				.first();
			if (settings?.dailyBudgetCents) {
				dailyBudgetCents = settings.dailyBudgetCents;
			}
		}

		return {
			...usage,
			dailyBudgetCents,
		};
	},
});

export const getWeekUsage = query({
	args: { tenantId: v.optional(v.string()), days: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const days = args.days ?? 7;
		const now = new Date();
		const startDate = new Date(now.getTime() - days * 86_400_000).toISOString().split("T")[0];

		const allUsage = await ctx.db
			.query("tokenUsage")
			.withIndex("by_date")
			.filter((q) => q.gte(q.field("date"), startDate))
			.collect();

		// Sort by date ascending
		allUsage.sort((a, b) => a.date.localeCompare(b.date));

		return allUsage.map(u => ({
			date: u.date,
			costCents: u.costCents,
		}));
	},
});

export const fetchHourlyFromAnthropic = internalAction({
	handler: async (ctx) => {
		const apiKey = process.env.ANTHROPIC_ADMIN_API_KEY;
		if (!apiKey) {
			console.log("ANTHROPIC_ADMIN_API_KEY not set, skipping hourly fetch");
			return;
		}

		const now = new Date();
		const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);

		const headers = {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		};

		// Fetch hourly cost data for last 48 hours
		try {
			const costRes = await fetch(
				`https://api.anthropic.com/v1/organizations/cost_report?starting_at=${twoDaysAgo.toISOString()}&ending_at=${now.toISOString()}&bucket_width=1h`,
				{ headers },
			);
			const costBody = await costRes.text();
			if (costRes.ok) {
				const costData = JSON.parse(costBody);
				for (const bucket of costData.data ?? []) {
					let costCents = 0;
					for (const result of bucket.results ?? []) {
						costCents += Math.round(parseFloat(result.amount ?? "0"));
					}
					await ctx.runMutation(internal.tokenUsage.upsertHourlyUsage, {
						timestamp: bucket.starting_at,
						costCents,
						inputTokens: 0,
						cacheReadTokens: 0,
						outputTokens: 0,
						cacheCreationTokens: 0,
					});
				}
			}
		} catch (err) {
			console.error("Hourly cost fetch failed:", err);
		}

		// Fetch hourly usage data
		try {
			const usageRes = await fetch(
				`https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${twoDaysAgo.toISOString()}&ending_at=${now.toISOString()}&bucket_width=1h`,
				{ headers },
			);
			const usageBody = await usageRes.text();
			if (usageRes.ok) {
				const usageData = JSON.parse(usageBody);
				for (const bucket of usageData.data ?? []) {
					let inputTokens = 0;
					let cacheReadTokens = 0;
					let outputTokens = 0;
					let cacheCreationTokens = 0;

					for (const result of bucket.results ?? []) {
						inputTokens += result.uncached_input_tokens ?? 0;
						cacheReadTokens += result.cache_read_input_tokens ?? 0;
						outputTokens += result.output_tokens ?? 0;
						const cacheCreation = result.cache_creation ?? {};
						cacheCreationTokens += (cacheCreation.ephemeral_5m_input_tokens ?? 0) +
						                       (cacheCreation.ephemeral_1h_input_tokens ?? 0);
					}

					// Update existing hourly record with token counts
					const existing = await ctx.runQuery(internal.tokenUsage.getHourlyByTimestamp, {
						timestamp: bucket.starting_at,
					});
					if (existing) {
						await ctx.runMutation(internal.tokenUsage.upsertHourlyUsage, {
							timestamp: bucket.starting_at,
							costCents: existing.costCents,
							inputTokens,
							cacheReadTokens,
							outputTokens,
							cacheCreationTokens,
						});
					}
				}
			}
		} catch (err) {
			console.error("Hourly usage fetch failed:", err);
		}

		console.log("Hourly data fetch complete");
	},
});

export const getHourlyByTimestamp = internalQuery({
	args: { timestamp: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("tokenUsageHourly")
			.withIndex("by_timestamp", (q) => q.eq("timestamp", args.timestamp))
			.first();
	},
});

export const getHourlyUsage = query({
	args: { tenantId: v.optional(v.string()), hours: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const hours = args.hours ?? 48;
		const now = new Date();
		const startTime = new Date(now.getTime() - hours * 3_600_000).toISOString();

		const allUsage = await ctx.db
			.query("tokenUsageHourly")
			.withIndex("by_timestamp")
			.filter((q) => q.gte(q.field("timestamp"), startTime))
			.collect();

		// Sort by timestamp ascending
		allUsage.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

		return allUsage.map(u => ({
			timestamp: u.timestamp,
			costCents: u.costCents,
			inputTokens: u.inputTokens,
			cacheReadTokens: u.cacheReadTokens,
			outputTokens: u.outputTokens,
			cacheCreationTokens: u.cacheCreationTokens,
		}));
	},
});

export const backfillHistoricalData = internalAction({
	args: { days: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const apiKey = process.env.ANTHROPIC_ADMIN_API_KEY;
		if (!apiKey) {
			console.log("ANTHROPIC_ADMIN_API_KEY not set, skipping backfill");
			return;
		}

		const days = args.days ?? 30;
		const now = new Date();
		const startDate = new Date(now.getTime() - days * 86_400_000);

		const headers = {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		};

		console.log(`Backfilling ${days} days of data...`);

		// Fetch daily cost data
		try {
			const costRes = await fetch(
				`https://api.anthropic.com/v1/organizations/cost_report?starting_at=${startDate.toISOString()}&ending_at=${now.toISOString()}&bucket_width=1d`,
				{ headers },
			);
			const costBody = await costRes.text();
			if (costRes.ok) {
				const costData = JSON.parse(costBody);
				console.log(`Found ${costData.data?.length ?? 0} daily buckets`);

				for (const bucket of costData.data ?? []) {
					const dateKey = bucket.starting_at.split("T")[0];
					let costCents = 0;
					for (const result of bucket.results ?? []) {
						costCents += Math.round(parseFloat(result.amount ?? "0"));
					}

					await ctx.runMutation(internal.tokenUsage.upsertUsage, {
						date: dateKey,
						costCents,
						inputTokens: 0,
						cacheReadTokens: 0,
						outputTokens: 0,
						cacheCreationTokens: 0,
					});
				}
			} else {
				console.error("Backfill cost API error:", costRes.status, costBody);
			}
		} catch (err) {
			console.error("Backfill failed:", err);
		}

		// Fetch daily usage data
		try {
			const usageRes = await fetch(
				`https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${startDate.toISOString()}&ending_at=${now.toISOString()}&bucket_width=1d`,
				{ headers },
			);
			const usageBody = await usageRes.text();
			if (usageRes.ok) {
				const usageData = JSON.parse(usageBody);

				for (const bucket of usageData.data ?? []) {
					const dateKey = bucket.starting_at.split("T")[0];
					let inputTokens = 0;
					let cacheReadTokens = 0;
					let outputTokens = 0;
					let cacheCreationTokens = 0;

					for (const result of bucket.results ?? []) {
						inputTokens += result.uncached_input_tokens ?? 0;
						cacheReadTokens += result.cache_read_input_tokens ?? 0;
						outputTokens += result.output_tokens ?? 0;
						const cacheCreation = result.cache_creation ?? {};
						cacheCreationTokens += (cacheCreation.ephemeral_5m_input_tokens ?? 0) +
						                       (cacheCreation.ephemeral_1h_input_tokens ?? 0);
					}

					// Update existing record with token counts
					const existing = await ctx.runQuery(internal.tokenUsage.getUsageByDate, {
						date: dateKey,
					});
					if (existing) {
						await ctx.runMutation(internal.tokenUsage.upsertUsage, {
							date: dateKey,
							costCents: existing.costCents,
							inputTokens,
							cacheReadTokens,
							outputTokens,
							cacheCreationTokens,
						});
					}
				}
			}
		} catch (err) {
			console.error("Backfill usage fetch failed:", err);
		}

		console.log("Backfill complete!");
	},
});

export const getUsageByDate = internalQuery({
	args: { date: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("tokenUsage")
			.withIndex("by_date", (q) => q.eq("date", args.date))
			.first();
	},
});
