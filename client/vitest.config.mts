import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit tests only — no component rendering, no jsdom, no testing-library.
 *
 * The project had no frontend test harness at all. This one is deliberately
 * minimal: it exists to cover the branch-propagation logic (which branch the
 * client claims, and which saved selection is still legal), because that logic
 * decides what data every page asks for. Rendering tests would need a much
 * larger toolchain and are not what this change needs.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
