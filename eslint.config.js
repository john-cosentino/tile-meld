// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // packages/engine must stay pure: no React, DB, network, Date.now(), or
    // Math.random() -- time and randomness are always injected by the
    // caller. See docs/opus-implementation-plan.md §4.2/§4.3.
    files: ["packages/engine/src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message:
            "packages/engine must not call Math.random() -- inject randomness via a RandomInt callback.",
        },
        {
          object: "Date",
          property: "now",
          message: "packages/engine must not call Date.now() -- inject the current time instead.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "fs",
            "node:fs",
            "net",
            "node:net",
            "http",
            "node:http",
            "https",
            "node:https",
            "crypto",
            "node:crypto",
            "child_process",
            "node:child_process",
            "react",
            "react-dom",
          ].map((name) => ({
            name,
            message:
              "packages/engine must stay free of IO/framework dependencies -- see docs/opus-implementation-plan.md §4.2.",
          })),
        },
      ],
    },
  },
  eslintConfigPrettier,
);
