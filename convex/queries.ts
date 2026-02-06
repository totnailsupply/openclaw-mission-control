import { query } from "./_generated/server";
import { v } from "convex/values";

function assertTenant(
	record: { tenantId?: string } | null,
	tenantId: string,
	entityName: string,
) {
	if (!record || record.tenantId !== tenantId) {
		throw new Error(`${entityName} not found`);
	}
}

export const listAgents = query({
	args: {
		tenantId: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("agents")
			.withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
			.collect();
	},
});

export const listTasks = query({
	args: {
		tenantId: v.string(),
	},
	handler: async (ctx, args) => {
		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
			.collect();

		// Enrich tasks with last message time
		const enrichedTasks = await Promise.all(
			tasks.map(async (task) => {
				const lastMessage = await ctx.db
					.query("messages")
					.withIndex("by_tenant_task", (q) =>
						q.eq("tenantId", args.tenantId).eq("taskId", task._id),
					)
					.order("desc")
					.first();

				return {
					...task,
					lastMessageTime: lastMessage?._creationTime ?? null,
				};
			})
		);

		return enrichedTasks;
	},
});

export const listActivities = query({
	args: {
		tenantId: v.string(),
		agentId: v.optional(v.id("agents")),
		type: v.optional(v.string()),
		taskId: v.optional(v.id("tasks")),
	},
	handler: async (ctx, args) => {
		let activitiesQuery = ctx.db
			.query("activities")
			.withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
			.order("desc");

		if (args.agentId || args.type || args.taskId) {
			activitiesQuery = activitiesQuery.filter((q) => {
				const filters = [];
				if (args.agentId) filters.push(q.eq(q.field("agentId"), args.agentId));
				if (args.taskId) filters.push(q.eq(q.field("targetId"), args.taskId));

				if (args.type) {
                    if (args.type === "tasks") {
                        // Match any task-related activity
                        filters.push(
                            q.or(
                                q.eq(q.field("type"), "status_update"),
                                q.eq(q.field("type"), "assignees_update"),
                                q.eq(q.field("type"), "task_update")
                            )
                        );
                    } else if (args.type === "comments") {
                         // Match messages/comments
                        filters.push(
                            q.or(
                                q.eq(q.field("type"), "message"),
                                q.eq(q.field("type"), "commented")
                            )
                        );
                    } else if (args.type === "docs") {
                        filters.push(q.eq(q.field("type"), "document_created"));
                    } else if (args.type === "status") {
                         filters.push(q.eq(q.field("type"), "status_update"));
                    } else {
                        // Fallback for exact match
                        filters.push(q.eq(q.field("type"), args.type));
                    }
				}

				return q.and(...filters);
			});
		}

		const activities = await activitiesQuery.take(50);

		// Join with agents to get names for the feed
			const enrichedFeed = await Promise.all(
				activities.map(async (activity) => {
					const agent = await ctx.db.get("agents", activity.agentId);
					assertTenant(agent, args.tenantId, "Agent");
					return {
						...activity,
						agentName: agent?.name ?? "Unknown Agent",
				};
			}),
		);

		return enrichedFeed;
	},
});

export const listMessages = query({
	args: { taskId: v.id("tasks"), tenantId: v.string() },
	handler: async (ctx, args) => {
		const task = await ctx.db.get("tasks", args.taskId);
		assertTenant(task, args.tenantId, "Task");

		const messages = await ctx.db
			.query("messages")
			.withIndex("by_tenant_task", (q) =>
				q.eq("tenantId", args.tenantId).eq("taskId", args.taskId),
			)
			.collect();

        // Join with agents to get names/avatars
        const enrichedMessages = await Promise.all(
            messages.map(async (msg) => {
	                const agent = await ctx.db.get("agents", msg.fromAgentId);
					assertTenant(agent, args.tenantId, "Agent");
                return {
                    ...msg,
                    agentName: agent?.name ?? "Unknown",
                    agentAvatar: agent?.avatar,
                };
            })
        );
        
        return enrichedMessages;
	},
});
