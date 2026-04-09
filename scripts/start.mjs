#!/usr/bin/env node
/**
 * Production start: prefer Next.js standalone `server.js` (Docker / outputFileTracing)
 * so `next` CLI is not required. Falls back to `next start` when developing with a full install.
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function exitChild(code) {
  process.exit(code ?? 0)
}

/** Docker / copied standalone: server.js next to package.json */
const dockerStyle = join(root, "server.js")
if (existsSync(dockerStyle)) {
  const child = spawn(process.execPath, [dockerStyle], {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  })
  child.on("exit", exitChild)
} else {
  const standaloneDir = join(root, ".next", "standalone")
  const standaloneServer = join(standaloneDir, "server.js")
  if (existsSync(standaloneServer)) {
    const child = spawn(process.execPath, [standaloneServer], {
      stdio: "inherit",
      cwd: standaloneDir,
      env: process.env,
    })
    child.on("exit", exitChild)
  } else {
    const child = spawn("npx", ["next", "start"], {
      stdio: "inherit",
      cwd: root,
      env: process.env,
      shell: true,
    })
    child.on("exit", exitChild)
  }
}
