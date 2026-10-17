import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import path from "path";

// Shown at the bottom of the admin sidebar («Yangilangan: dd.MM.yyyy · sha»).
// The date is the Tashkent day of the build ("en-CA" prints yyyy-MM-dd).
// Vercel supplies VERCEL_GIT_COMMIT_SHA for Git deploys only; a CLI deploy
// (`vercel --prod`) can pass `-b BUILD_SHA=$(git rev-parse --short HEAD)`
// instead. With neither, the line shows «dev».
const buildDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tashkent",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const buildSha =
  (process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_SHA)?.slice(0, 7) || "dev";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  env: {
    NEXT_PUBLIC_BUILD_DATE: buildDate,
    NEXT_PUBLIC_BUILD_SHA: buildSha,
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
