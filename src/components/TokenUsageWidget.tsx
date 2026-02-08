import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DEFAULT_TENANT_ID } from "../lib/tenant";

function formatTokenCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toString();
}

function getSpendColor(ratio: number): string {
	if (ratio >= 0.8) return "var(--accent-red)";
	if (ratio >= 0.5) return "var(--accent-orange)";
	return "var(--accent-green)";
}

interface SparklineProps {
	data: number[];
	color: string;
	width?: number;
	height?: number;
}

const Sparkline: React.FC<SparklineProps> = ({ data, color, width = 50, height = 20 }) => {
	const path = React.useMemo(() => {
		if (!data || data.length === 0) return "";

		const maxValue = Math.max(...data, 1);
		const minValue = Math.min(...data, 0);
		const range = maxValue - minValue || 1;

		const points = data.map((value, i) => {
			const x = (i / Math.max(data.length - 1, 1)) * width;
			const y = height - ((value - minValue) / range) * (height - 2);
			return { x, y };
		});

		if (points.length === 0) return "";
		if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

		let path = `M ${points[0].x},${points[0].y}`;
		for (let i = 0; i < points.length - 1; i++) {
			const curr = points[i];
			const next = points[i + 1];
			const midX = (curr.x + next.x) / 2;
			path += ` Q ${curr.x},${curr.y} ${midX},${(curr.y + next.y) / 2}`;
			if (i === points.length - 2) {
				path += ` Q ${next.x},${next.y} ${next.x},${next.y}`;
			}
		}

		return path;
	}, [data, width, height]);

	if (!data || data.length === 0) return null;

	return (
		<svg width={width} height={height} className="shrink-0">
			<defs>
				<linearGradient id={`gradient-${color.replace(/[()]/g, '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
					<stop offset="0%" stopColor={color} stopOpacity="0.15" />
					<stop offset="100%" stopColor={color} stopOpacity="0" />
				</linearGradient>
			</defs>
			<path
				d={`${path} L ${width},${height} L 0,${height} Z`}
				fill={`url(#gradient-${color.replace(/[()]/g, '')})`}
			/>
			<path
				d={path}
				fill="none"
				stroke={color}
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
};

const TokenUsageWidget: React.FC = () => {
	const [showExpanded, setShowExpanded] = useState(false);
	const [timeRange, setTimeRange] = useState<7 | 30>(7);
	const usage = useQuery(api.tokenUsage.getTodayUsage, {
		tenantId: DEFAULT_TENANT_ID,
	});
	const weekData = useQuery(api.tokenUsage.getWeekUsage, {
		tenantId: DEFAULT_TENANT_ID,
		days: timeRange,
	});
	const hourlyData = useQuery(api.tokenUsage.getHourlyUsage, {
		tenantId: DEFAULT_TENANT_ID,
		hours: 48,
	});

	// Hide if no admin key configured (null), but show loading state (undefined)
	if (usage === null) return null;

	const dollars = usage ? (usage.costCents / 100).toFixed(2) : "-.--";
	const ratio = usage ? Math.min(usage.costCents / usage.dailyBudgetCents, 1) : 0;
	const color = usage ? getSpendColor(ratio) : "var(--muted-foreground)";
	const budgetDollars = usage ? (usage.dailyBudgetCents / 100).toFixed(0) : "20";

	// Extract time series data (use hourly if available, fallback to daily)
	const hasHourlyData = hourlyData && hourlyData.length > 0;
	const costSeries = hasHourlyData
		? hourlyData.map(d => d.costCents / 100)
		: weekData?.map(d => d.costCents / 100) ?? [];
	const inputSeries = hasHourlyData
		? hourlyData.map(d => d.inputTokens)
		: [];
	const outputSeries = hasHourlyData
		? hourlyData.map(d => d.outputTokens)
		: [];
	const cacheReadSeries = hasHourlyData
		? hourlyData.map(d => d.cacheReadTokens)
		: [];
	const cacheCreationSeries = hasHourlyData
		? hourlyData.map(d => d.cacheCreationTokens)
		: [];

	// Calculate totals and trends
	const todayCost = usage?.costCents ?? 0;
	const yesterdayCost = weekData && weekData.length > 1 ? weekData[weekData.length - 2].costCents : todayCost;
	const costTrend = todayCost - yesterdayCost;
	const costTrendPercent = yesterdayCost > 0 ? ((costTrend / yesterdayCost) * 100) : 0;

	// SVG ring math
	const size = 32;
	const strokeWidth = 2.5;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const strokeDashoffset = circumference * (1 - ratio);

	return (
		<div className="relative">
			<div
				className="flex items-center gap-2 cursor-pointer"
				onClick={() => setShowExpanded(!showExpanded)}
				onMouseEnter={() => setShowExpanded(true)}
			>
				{/* Ring indicator */}
				<svg width={size} height={size} className="shrink-0 -rotate-90">
					<circle
						cx={size / 2}
						cy={size / 2}
						r={radius}
						fill="none"
						stroke="var(--border)"
						strokeWidth={strokeWidth}
						opacity="0.3"
					/>
					<circle
						cx={size / 2}
						cy={size / 2}
						r={radius}
						fill="none"
						stroke={color}
						strokeWidth={strokeWidth}
						strokeDasharray={circumference}
						strokeDashoffset={strokeDashoffset}
						strokeLinecap="round"
					/>
				</svg>

				{/* Cost display */}
				<div className="flex flex-col">
					<div className="text-xl font-bold leading-none" style={{ color }}>
						${dollars}
					</div>
					<div className="text-[9px] font-semibold tracking-tight text-muted-foreground uppercase mt-0.5">
						Today's Spend
					</div>
				</div>

				{/* Mini sparkline */}
				{costSeries.length > 1 && (
					<div className="ml-1">
						<Sparkline data={costSeries} color={color} width={50} height={20} />
					</div>
				)}
			</div>

			{/* Expanded panel */}
			{showExpanded && usage && weekData && (
				<div
					className="absolute top-full mt-2 right-0 z-50 bg-card border border-border rounded-xl shadow-xl p-4 w-[520px]"
					onMouseLeave={() => setShowExpanded(false)}
				>
					<div className="flex items-center justify-between mb-4">
						<div className="font-bold text-foreground text-sm">API Usage Analytics</div>
						<div className="flex items-center gap-2">
							<button
								onClick={() => setTimeRange(7)}
								className={`text-xs px-2 py-1 rounded transition-colors ${
									timeRange === 7
										? 'bg-primary text-primary-foreground font-semibold'
										: 'text-muted-foreground hover:text-foreground'
								}`}
							>
								7D
							</button>
							<button
								onClick={() => setTimeRange(30)}
								className={`text-xs px-2 py-1 rounded transition-colors ${
									timeRange === 30
										? 'bg-primary text-primary-foreground font-semibold'
										: 'text-muted-foreground hover:text-foreground'
								}`}
							>
								30D
							</button>
						</div>
					</div>

					{/* Metrics grid */}
					<div className="grid grid-cols-3 gap-3">
						{/* Total Cost */}
						<div className="bg-muted/30 rounded-lg p-3">
							<div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">
								Total Cost
							</div>
							<div className="flex items-end justify-between mb-2">
								<div className="text-2xl font-bold" style={{ color }}>
									${dollars}
								</div>
								{costTrendPercent !== 0 && (
									<div
										className={`text-xs font-semibold ${
											costTrendPercent > 0 ? 'text-red-500' : 'text-green-500'
										}`}
									>
										{costTrendPercent > 0 ? '+' : ''}{costTrendPercent.toFixed(0)}%
									</div>
								)}
							</div>
							<Sparkline data={costSeries} color={color} width={100} height={30} />
						</div>

						{/* Input Tokens */}
						<div className="bg-muted/30 rounded-lg p-3">
							<div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">
								Input Tokens
							</div>
							<div className="flex items-end justify-between mb-2">
								<div className="text-2xl font-bold text-foreground">
									{formatTokenCount(usage.inputTokens)}
								</div>
							</div>
							{inputSeries.length > 0 ? (
								<Sparkline
									data={inputSeries}
									color="var(--accent-orange)"
									width={100}
									height={30}
								/>
							) : (
								<div className="h-[30px] flex items-center justify-center text-[10px] text-muted-foreground">
									No historical data
								</div>
							)}
						</div>

						{/* Output Tokens */}
						<div className="bg-muted/30 rounded-lg p-3">
							<div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">
								Output Tokens
							</div>
							<div className="flex items-end justify-between mb-2">
								<div className="text-2xl font-bold text-foreground">
									{formatTokenCount(usage.outputTokens)}
								</div>
							</div>
							{outputSeries.length > 0 ? (
								<Sparkline
									data={outputSeries}
									color="var(--accent-green)"
									width={100}
									height={30}
								/>
							) : (
								<div className="h-[30px] flex items-center justify-center text-[10px] text-muted-foreground">
									No historical data
								</div>
							)}
						</div>

						{/* Cache Reads */}
						<div className="bg-muted/30 rounded-lg p-3">
							<div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">
								Cache Reads
							</div>
							<div className="flex items-end justify-between mb-2">
								<div className="text-2xl font-bold text-foreground">
									{formatTokenCount(usage.cacheReadTokens)}
								</div>
							</div>
							{cacheReadSeries.length > 0 ? (
								<Sparkline
									data={cacheReadSeries}
									color="#10b981"
									width={100}
									height={30}
								/>
							) : (
								<div className="h-[30px] flex items-center justify-center text-[10px] text-muted-foreground">
									No historical data
								</div>
							)}
						</div>

						{/* Cache Creation */}
						<div className="bg-muted/30 rounded-lg p-3">
							<div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">
								Cache Creation
							</div>
							<div className="flex items-end justify-between mb-2">
								<div className="text-2xl font-bold text-foreground">
									{formatTokenCount(usage.cacheCreationTokens)}
								</div>
							</div>
							{cacheCreationSeries.length > 0 ? (
								<Sparkline
									data={cacheCreationSeries}
									color="#8b5cf6"
									width={100}
									height={30}
								/>
							) : (
								<div className="h-[30px] flex items-center justify-center text-[10px] text-muted-foreground">
									No historical data
								</div>
							)}
						</div>

						{/* Budget Progress */}
						<div className="bg-muted/30 rounded-lg p-3">
							<div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">
								Budget Used
							</div>
							<div className="flex items-end justify-between mb-2">
								<div className="text-2xl font-bold" style={{ color }}>
									{(ratio * 100).toFixed(0)}%
								</div>
								<div className="text-xs text-muted-foreground">
									${budgetDollars}/day
								</div>
							</div>
							<div className="w-full bg-border/30 rounded-full h-2 mt-2">
								<div
									className="h-2 rounded-full transition-all"
									style={{
										width: `${Math.min(ratio * 100, 100)}%`,
										backgroundColor: color,
									}}
								/>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default TokenUsageWidget;
