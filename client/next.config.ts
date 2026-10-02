import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    // Next 16.3 keeps Turbopack's build cache in .next/cache, and Vercel
    // restores that cache from the previous deployment. On 02.10.2026 a build
    // that restored it shipped the previous globals.css (PR #641 reached the
    // site only after a cache-free rebuild). Every build starts cold instead.
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
