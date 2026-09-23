import Link from "next/link";
import { PERIODS, type PeriodKey } from "@/lib/dates";

export function PeriodToggle({ current, basePath }: { current: PeriodKey; basePath: string }) {
  return (
    <nav className="segmented" aria-label="Period">
      {PERIODS.map((p) => (
        <Link key={p.key} href={`${basePath}?period=${p.key}`} aria-current={p.key === current ? "true" : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
