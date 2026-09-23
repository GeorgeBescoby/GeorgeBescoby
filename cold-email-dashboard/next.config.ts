import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL uses native bindings for local SQLite files.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
