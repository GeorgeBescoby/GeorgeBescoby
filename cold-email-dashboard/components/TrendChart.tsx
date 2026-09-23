"use client";

// Single-series weekly trend. Downloads are counts (columns); CAC, CPL and
// positive reply rate are lines. Weeks with no denominator show as gaps.
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Kind = "count" | "money" | "pct";
type Point = { label: string; value: number | null };

const fmt = (kind: Kind, v: number | null, axis = false) => {
  if (v == null) return "—";
  if (kind === "money") return `£${v.toLocaleString("en-GB", { maximumFractionDigits: axis ? 0 : 2, minimumFractionDigits: axis ? 0 : 2 })}`;
  if (kind === "pct") return `${(v * 100).toFixed(1)}%`;
  return v.toLocaleString("en-GB");
};

function Tip({ active, payload, kind, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <div className="t-label">Week of {label}</div>
      <div className="t-value">{fmt(kind, payload[0].value ?? null)}</div>
    </div>
  );
}

const axisProps = {
  tick: { fill: "var(--text-muted)", fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: "var(--axis)" },
};

export function TrendChart({ title, sub, kind, data, bars }: { title: string; sub: string; kind: Kind; data: Point[]; bars?: boolean }) {
  const common = { data, margin: { top: 8, right: 12, bottom: 0, left: 0 } };
  const yAxis = (
    <YAxis
      {...axisProps}
      axisLine={false}
      width={kind === "money" ? 52 : 44}
      allowDecimals={kind !== "count"}
      tickFormatter={(v: number) => fmt(kind, v, true)}
    />
  );
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <div className="chart-sub">{sub}</div>
      <div style={{ height: 190 }} role="img" aria-label={`${title}, weekly`}>
        <ResponsiveContainer width="100%" height="100%">
          {bars ? (
            <BarChart {...common}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" {...axisProps} />
              {yAxis}
              <Tooltip content={<Tip kind={kind} />} cursor={{ fill: "var(--series-1-wash)" }} />
              <Bar dataKey="value" fill="var(--series-1)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          ) : (
            <LineChart {...common}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" {...axisProps} />
              {yAxis}
              <Tooltip content={<Tip kind={kind} />} cursor={{ stroke: "var(--axis)", strokeWidth: 1 }} />
              <Line
                dataKey="value"
                stroke="var(--series-1)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 2 }}
                activeDot={{ r: 5, fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
