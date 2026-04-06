import "dotenv/config"
import path from "node:path"
import { defineConfig } from "prisma/config"

function resolveDbUrl(): string {
  if (process.env["DATABASE_URL"]) return process.env["DATABASE_URL"]
  if (process.env["DATABASE_PATH"]) return `file:${path.resolve(process.env["DATABASE_PATH"])}`
  return `file:${path.resolve(__dirname, "prisma", "dev.db")}`
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolveDbUrl(),
  },
})
