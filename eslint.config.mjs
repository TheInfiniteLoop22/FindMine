import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This app fetches on mount with plain fetch + local state (no data-fetching
      // library), which is exactly the pattern this React 19 rule flags: calling a
      // function in an effect that eventually sets state. It is a style opinion about
      // avoiding an extra render, not a correctness error, and the cure would be a
      // data library (React Query/SWR) or server components - a refactor, not a fix.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
