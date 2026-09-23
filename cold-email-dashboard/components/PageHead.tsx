import { formatDayShort, type Period } from "@/lib/dates";
import { PeriodToggle } from "./PeriodToggle";

export function PageHead({ title, period, basePath }: { title: string; period: Period; basePath: string }) {
  const year = period.end.slice(0, 4);
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <div className="range">
          {period.label}: {formatDayShort(period.start)} – {formatDayShort(period.end)} {year}
        </div>
      </div>
      <PeriodToggle current={period.key} basePath={basePath} />
    </div>
  );
}
