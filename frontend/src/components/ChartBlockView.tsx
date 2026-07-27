import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import type { ChartData } from "@/lib/chart";

export function ChartBlockView({ data }: { data: ChartData }) {
  const rows = data.labels.map((label, i) => ({ label, value: data.values[i] }));

  return (
    <figure className="bf-chart" data-testid="chart-block-view">
      {data.description && <figcaption className="bf-chart-caption">{data.description}</figcaption>}
      <div style={{ width: "100%", height: 280 }}>
        {/* isAnimationActive=false on the Bar below: ResponsiveContainer can report
            an invalid (-1x-1) size on first mount before its ResizeObserver settles.
            With animation on, recharts bakes bar geometry off that first bad
            measurement and never recomputes it once the container resizes correctly
            — the axes and grid redraw fine, but the bars stay permanently empty. */}
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 20, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={36}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                color: "hsl(var(--popover-foreground))",
                fontSize: 13,
              }}
            />
            <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              <LabelList dataKey="value" position="top" fill="hsl(var(--foreground))" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
