import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
	"fetch-token-usage",
	{ minutes: 15 },
	internal.tokenUsage.fetchFromAnthropic,
);

crons.interval(
	"fetch-hourly-usage",
	{ minutes: 15 },
	internal.tokenUsage.fetchHourlyFromAnthropic,
);

export default crons;
