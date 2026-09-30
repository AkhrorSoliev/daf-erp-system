import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

// Qo'llanma matni (`src/qollanma/kontent/**/*.mdx`) sahifa emas, import
// qilinadigan modul — shuning uchun `pageExtensions` o'zgarmaydi. Turbopack'da
// plagin satr nomi bilan beriladi: JS funksiyani Rust'ga uzatib bo'lmaydi.
const withMDX = createMDX({
  options: { remarkPlugins: ["remark-gfm"] },
});

export default withMDX(nextConfig);
