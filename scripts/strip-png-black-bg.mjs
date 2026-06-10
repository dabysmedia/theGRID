/**
 * Remove connected near-black background from PNG corners/edges (flood fill).
 * Preserves interior black pixels (e.g. clock bezel).
 * Usage: node scripts/strip-png-black-bg.mjs <input.png> [output.png]
 */
import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

const input = process.argv[2]
const output = process.argv[3] ?? process.argv[2]
if (!input) {
  console.error("Usage: node scripts/strip-png-black-bg.mjs <input.png> [output.png]")
  process.exit(1)
}

const THRESHOLD = 36

function isBg(r, g, b) {
  return Math.max(r, g, b) <= THRESHOLD
}

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width, height } = info
const visited = new Uint8Array(width * height)
const queue = []

function push(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const idx = y * width + x
  if (visited[idx]) return
  const o = idx * 4
  if (!isBg(data[o], data[o + 1], data[o + 2])) return
  visited[idx] = 1
  queue.push(idx)
}

for (let x = 0; x < width; x++) {
  push(x, 0)
  push(x, height - 1)
}
for (let y = 0; y < height; y++) {
  push(0, y)
  push(width - 1, y)
}

while (queue.length) {
  const idx = queue.pop()
  const x = idx % width
  const y = (idx - x) / width
  push(x - 1, y)
  push(x + 1, y)
  push(x, y - 1)
  push(x, y + 1)
}

for (let idx = 0; idx < width * height; idx++) {
  if (!visited[idx]) continue
  const o = idx * 4
  data[o + 3] = 0
}

// Soften 1px fringe on the fill boundary
for (let y = 1; y < height - 1; y++) {
  for (let x = 1; x < width - 1; x++) {
    const idx = y * width + x
    if (visited[idx]) continue
    const o = idx * 4
    let bgNeighbors = 0
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (visited[ny * width + nx]) bgNeighbors++
    }
    if (bgNeighbors > 0 && isBg(data[o], data[o + 1], data[o + 2])) {
      data[o + 3] = Math.min(data[o + 3], Math.round(255 * (1 - bgNeighbors / 4)))
    }
  }
}

const tmp = output + ".tmp.png"
await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(tmp)
fs.renameSync(tmp, output)
console.log("Wrote", path.resolve(output))
