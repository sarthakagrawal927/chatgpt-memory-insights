import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: [".agents/**", ".claude/**", "dist/**", "node_modules/**"],
  },
});
