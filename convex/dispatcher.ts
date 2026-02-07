import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const DEFAULT_TENANT_ID = "default";

export const markDispatched = mutation({
	args: {
		taskId: v.id("tasks"),
		tenantId: v.string(),
	},
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task || task.tenantId !== args.tenantId) {
			throw new Error("Task not found");
		}
		await ctx.db.patch(args.taskId, { dispatchedAt: Date.now() });
	},
});

export const updateContainerState = mutation({
	args: {
		agentName: v.string(),
		tenantId: v.string(),
		state: v.union(
			v.literal("stopped"),
			v.literal("starting"),
			v.literal("running"),
			v.literal("stopping"),
		),
	},
	handler: async (ctx, args) => {
		const agent = await ctx.db
			.query("agents")
			.filter((q) =>
				q.and(
					q.eq(q.field("name"), args.agentName),
					q.eq(q.field("tenantId"), args.tenantId),
				),
			)
			.first();

		if (!agent) {
			throw new Error(`Agent "${args.agentName}" not found`);
		}

		await ctx.db.patch(agent._id, {
			containerState: args.state,
			lastActiveAt: Date.now(),
		});
	},
});

export const reportError = mutation({
	args: {
		taskId: v.id("tasks"),
		tenantId: v.string(),
		error: v.string(),
	},
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task || task.tenantId !== args.tenantId) {
			throw new Error("Task not found");
		}

		await ctx.db.patch(args.taskId, { status: "review" });

		// Find system agent for activity log
		const systemAgent = await ctx.db
			.query("agents")
			.filter((q) =>
				q.and(
					q.eq(q.field("name"), "OpenClaw"),
					q.eq(q.field("tenantId"), args.tenantId),
				),
			)
			.first();

		if (systemAgent) {
			await ctx.db.insert("messages", {
				taskId: args.taskId,
				fromAgentId: systemAgent._id,
				content: `**Dispatch Error**\n\n${args.error}`,
				attachments: [],
				tenantId: args.tenantId,
			});

			await ctx.db.insert("activities", {
				type: "status_update",
				agentId: systemAgent._id,
				message: `dispatch error on "${task.title}"`,
				targetId: args.taskId,
				tenantId: args.tenantId,
			});
		}
	},
});

export const createAndAssign = mutation({
	args: {
		title: v.string(),
		description: v.string(),
		agentName: v.string(),
		tags: v.optional(v.array(v.string())),
		tenantId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const tenantId = args.tenantId ?? DEFAULT_TENANT_ID;

		// Find the agent by name
		const agent = await ctx.db
			.query("agents")
			.filter((q) =>
				q.and(
					q.eq(q.field("name"), args.agentName),
					q.eq(q.field("tenantId"), tenantId),
				),
			)
			.first();

		if (!agent) {
			throw new Error(`Agent "${args.agentName}" not found`);
		}

		const taskId = await ctx.db.insert("tasks", {
			title: args.title,
			description: args.description,
			status: "assigned",
			assigneeIds: [agent._id],
			tags: args.tags ?? ["dispatched"],
			tenantId,
		});

		await ctx.db.insert("activities", {
			type: "status_update",
			agentId: agent._id,
			message: `task "${args.title}" created and assigned`,
			targetId: taskId,
			tenantId,
		});

		return taskId;
	},
});

export const listDispatchable = query({
	args: {
		tenantId: v.string(),
	},
	handler: async (ctx, args) => {
		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
			.filter((q) =>
				q.and(
					q.eq(q.field("status"), "assigned"),
					q.eq(q.field("dispatchedAt"), undefined),
				),
			)
			.collect();

		return tasks;
	},
});
