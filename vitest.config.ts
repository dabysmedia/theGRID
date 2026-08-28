import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Vitest resolves the package's client build, which throws on import.
      // Server modules under test are plain Node here, so stub it out.
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
})
