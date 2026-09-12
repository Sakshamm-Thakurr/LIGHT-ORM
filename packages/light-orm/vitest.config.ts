import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    typecheck: {
      include: ["type-tests/**/*.test-d.ts"],
    },
  },
});
