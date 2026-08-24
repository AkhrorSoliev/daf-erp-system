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
      // This product's copy is in Uzbek, where the apostrophe is a LETTER —
      // o', g', ko'p, ro'yxat. The rule's default forbids it in JSX text, so
      // enforcing it would mean escaping ordinary spelling on nearly every
      // line of user-facing copy. `>` and `}` are the characters that
      // actually break JSX, and those stay forbidden.
      "react/no-unescaped-entities": ["error", { forbid: [">", "}"] }],
    },
  },
]);

export default eslintConfig;
