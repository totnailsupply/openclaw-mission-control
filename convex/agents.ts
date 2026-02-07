import { v } from "convex/values";
import { mutation } from "./_generated/server";

function assertTenant(
	record: { tenantId?: string } | null,
	tenantId: string,
	entityName: string,
) {
	if (!record || record.tenantId !== tenantId) {
		throw new Error(`${entityName} not found`);
	}
}

export const generateAvatarUploadUrl = mutation({
  args: { tenantId: v.string() },
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("agents"),
    tenantId: v.string(),
    status: v.union(
      v.literal("idle"),
      v.literal("active"),
      v.literal("blocked"),
    ),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get("agents", args.id);
    assertTenant(agent, args.tenantId, "Agent");

    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const createAgent = mutation({
  args: {
    name: v.string(),
    role: v.string(),
    level: v.union(v.literal("LEAD"), v.literal("INT"), v.literal("SPC")),
    avatar: v.string(),
    avatarStorageId: v.optional(v.id("_storage")),
    status: v.union(v.literal("idle"), v.literal("active"), v.literal("blocked")),
    systemPrompt: v.optional(v.string()),
    character: v.optional(v.string()),
    lore: v.optional(v.string()),
    tenantId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agents", {
      name: args.name,
      role: args.role,
      level: args.level,
      avatar: args.avatar,
      avatarStorageId: args.avatarStorageId,
      status: args.status,
      systemPrompt: args.systemPrompt,
      character: args.character,
      lore: args.lore,
      tenantId: args.tenantId,
    });
  },
});

export const updateAgent = mutation({
  args: {
    id: v.id("agents"),
    tenantId: v.string(),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    level: v.optional(v.union(v.literal("LEAD"), v.literal("INT"), v.literal("SPC"))),
    avatar: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    status: v.optional(v.union(v.literal("idle"), v.literal("active"), v.literal("blocked"))),
    systemPrompt: v.optional(v.string()),
    character: v.optional(v.string()),
    lore: v.optional(v.string()),
    agentType: v.optional(v.union(v.literal("always-on"), v.literal("on-demand"))),
    containerState: v.optional(v.union(v.literal("stopped"), v.literal("starting"), v.literal("running"), v.literal("stopping"))),
    capabilities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get("agents", args.id);
    assertTenant(agent, args.tenantId, "Agent");

    // Delete old stored avatar file if replacing with a new one
    if (args.avatarStorageId && agent!.avatarStorageId) {
      await ctx.storage.delete(agent!.avatarStorageId);
    }

    const { id, tenantId: _tenantId, ...updates } = args;
    const filteredUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    await ctx.db.patch(id, filteredUpdates);
  },
});

export const deleteAgent = mutation({
  args: { id: v.id("agents"), tenantId: v.string() },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get("agents", args.id);
    assertTenant(agent, args.tenantId, "Agent");
    await ctx.db.delete(args.id);
  },
});
