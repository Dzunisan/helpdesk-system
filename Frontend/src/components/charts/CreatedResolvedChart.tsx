import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { DailyPoint } from "@/types/api";
import { formatSast } from "@/lib/format";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

/** Created = brand indigo, resolved = the lighter indigo (validated pair: CVD ΔE 15.6, legend + tooltip as relief) */
const CONFIG = {
  created: { label: "Created", color: "var(--chart-1)" },
  resolved: { label: "Resolved", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** A YYYY-MM-DD SAST calendar day, read at noon so no time zone moves it */
const dayOf = (date: string) => `${date}T12:00:00+02:00`;

/**
 * Created vs resolved per day (briefing p.54), a grouped bar chart on the shadcn chart (Recharts).
 * Hover a day for both numbers. Axis labels: the first day, the middle and "Today".
 */
export default function CreatedResolvedChart({ days, className }: { days: DailyPoint[]; className?: string }) {
  const last = days.length - 1;
  const middle = Math.floor(last / 2);
  const ticks = [days[0]?.date, days[middle]?.date, days[last]?.date].filter(Boolean) as string[];

  return (
    <ChartContainer config={CONFIG} className={cn("aspect-auto h-56 w-full", className)}>
      <BarChart data={days} margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          ticks={ticks}
          interval={0}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(d: string) => (d === days[last]?.date ? "Today" : formatSast(dayOf(d), "day").replace(/^\w+ /, ""))}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tickMargin={4} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<ChartTooltipContent labelFormatter={(_, payload) => formatSast(dayOf(String(payload?.[0]?.payload?.date ?? "")), "day")} />}
        />
        <Bar dataKey="created" fill="var(--color-created)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="resolved" fill="var(--color-resolved)" radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ChartContainer>
  );
}

/** The two-dot legend for the card header (identity never by colour alone) */
export function CreatedResolvedLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 text-xs text-muted-foreground", className)}>
      {(Object.keys(CONFIG) as (keyof typeof CONFIG)[]).map((key) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-xs" style={{ background: CONFIG[key].color }} />
          {CONFIG[key].label}
        </span>
      ))}
    </div>
  );
}
