import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one Postgres instance and truncate tables
    // between tests -- running test files in parallel would let one
    // file's truncation race another file's in-progress assertions.
    fileParallelism: false,
  },
});
