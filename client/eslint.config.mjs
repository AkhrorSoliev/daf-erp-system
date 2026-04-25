import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Project-wide pragmatism: untyped backend payloads, recharts
      // event handlers, and Radix-style ref forwards make `any` hard
      // to avoid cleanly. Editor still surfaces it as a warning.
      "@typescript-eslint/no-explicit-any": "warn",
      // The React Compiler-era `set-state-in-effect` rule fires on
      // legitimate "derive state from prop" patterns. Demote to warn.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
