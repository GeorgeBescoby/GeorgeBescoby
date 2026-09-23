"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/campaigns", label: "Campaigns" },
  // Later: { href: "/pipeline", label: "Pipeline" }, { href: "/health", label: "Health" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const period = useSearchParams().get("period");
  return (
    <nav className="nav" aria-label="Sections">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={period && l.href !== "/settings" ? `${l.href}?period=${period}` : l.href}
          aria-current={pathname === l.href ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
