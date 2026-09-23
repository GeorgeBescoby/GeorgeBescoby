import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cold Email Economics",
  description: "ASK BOSCO cold email: spend, downloads, CAC and campaign performance.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
