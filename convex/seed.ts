import { mutation } from "./_generated/server";

const DEFAULT_TENANT_ID = "default";

export const clear = mutation({
	args: {},
	handler: async (ctx) => {
		for (const table of ["activities", "messages", "documents", "tasks", "agents"] as const) {
			const rows = await ctx.db.query(table).collect();
			for (const row of rows) {
				await ctx.db.delete(row._id);
			}
		}
	},
});

export const run = mutation({
	args: {},
	handler: async (ctx) => {
		// Clear existing agents
		const existingAgents = await ctx.db.query("agents").collect();
		for (const agent of existingAgents) {
			await ctx.db.delete(agent._id);
		}

		// Clear existing tasks, activities, messages
		for (const table of ["activities", "messages", "tasks"] as const) {
			const rows = await ctx.db.query(table).collect();
			for (const row of rows) {
				await ctx.db.delete(row._id);
			}
		}

		// Insert real agents
		const agents = [
			{
				name: "Scrappy",
				role: "Informant & Triage",
				level: "LEAD" as const,
				status: "active" as const,
				avatar: "🐕",
				agentType: "always-on" as const,
				containerState: "running" as const,
				capabilities: ["telegram", "triage", "delegation", "journal", "habits"],
				systemPrompt: "Always-on Telegram agent. Triages incoming requests, handles simple tasks directly, and delegates complex work to specialist agents.",
			},
			{
				name: "Researcher",
				role: "Research Specialist",
				level: "SPC" as const,
				status: "idle" as const,
				avatar: "🔬",
				agentType: "on-demand" as const,
				containerState: "stopped" as const,
				capabilities: ["research", "web-search", "summarization"],
				systemPrompt: "On-demand research agent. Conducts deep research, competitive analysis, and multi-step investigation. Returns structured findings.",
			},
			{
				name: "OpenClaw",
				role: "System Agent",
				level: "SPC" as const,
				status: "active" as const,
				avatar: "🤖",
				agentType: "always-on" as const,
				systemPrompt: "Internal system agent for tracking agent lifecycle events.",
			},
		];

		for (const a of agents) {
			await ctx.db.insert("agents", {
				name: a.name,
				role: a.role,
				level: a.level,
				status: a.status,
				avatar: a.avatar,
				agentType: a.agentType,
				containerState: a.containerState,
				capabilities: a.capabilities,
				systemPrompt: a.systemPrompt,
				tenantId: DEFAULT_TENANT_ID,
			});
		}
	},
});
