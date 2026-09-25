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
 *
 * The one exception is a static-markup render (`react-dom/server`, still in
 * the node environment) where a component's class wiring is what needs
 * covering — see `src/components/ui/alert-dialog.test.ts`.
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
