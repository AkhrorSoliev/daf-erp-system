import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import path from "path";

const nextConfig: NextConfig = {
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

// Qo'llanma matni (`src/qollanma/kontent/**/*.mdx`) sahifa emas, import
// qilinadigan modul — shuning uchun `pageExtensions` o'zgarmaydi. Turbopack'da
// plagin satr nomi bilan beriladi: JS funksiyani Rust'ga uzatib bo'lmaydi.
const withMDX = createMDX({
  options: { remarkPlugins: ["remark-gfm"] },
});

export default withMDX(nextConfig);
