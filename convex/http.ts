import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

const UNAUTHORIZED = new Response(
	JSON.stringify({ error: "Unauthorized" }),
	{ status: 401, headers: { "Content-Type": "application/json" } },
);

/**
 * Validate a Bearer token against the apiTokens table.
 * Returns true if the token is valid and not revoked.
 */
async function validateToken(
	ctx: { runQuery: any },
	request: Request,
): Promise<boolean> {
	const authHeader = request.headers.get("Authorization");
	if (!authHeader?.startsWith("Bearer ")) return false;

	const token = authHeader.slice(7);
	if (!token) return false;

	// Hash the token and look it up
	const encoder = new TextEncoder();
	const data = encoder.encode(token);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

	const result = await ctx.runQuery(api.apiAuth.validateTokenHash, { tokenHash });
	return result;
}

// OpenClaw webhook endpoint
http.route({
	path: "/openclaw/event",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		if (!(await validateToken(ctx, request))) return UNAUTHORIZED;

		const body = await request.json();
		await ctx.runMutation(api.openclaw.receiveAgentEvent, body);
		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}),
});

// Dispatch endpoint — creates a task and assigns it to an agent
http.route({
	path: "/dispatch",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		if (!(await validateToken(ctx, request))) return UNAUTHORIZED;

		const body = await request.json();

		const { title, description, agent, tags, tenantId } = body as {
			title?: string;
			description: string;
			agent: string;
			tags?: string[];
			tenantId?: string;
		};

		if (!description || !agent) {
			return new Response(
				JSON.stringify({ error: "Missing required fields: description, agent" }),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			);
		}

		const taskTitle = title || description.slice(0, 80);

		const taskId = await ctx.runMutation(api.dispatcher.createAndAssign, {
			title: taskTitle,
			description,
			agentName: agent,
			tags,
			tenantId,
		});

		return new Response(
			JSON.stringify({ ok: true, taskId }),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	}),
});

export default http;
