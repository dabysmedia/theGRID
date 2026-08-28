import "server-only"

import path from "node:path"

const SIGNATURES: Array<{ mime: string; ext: string; matches: (bytes: Uint8Array) => boolean }> = [
  {
    mime: "image/jpeg",
    ext: "jpg",
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/png",
    ext: "png",
    matches: (b) =>
      b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  },
  {
    mime: "image/webp",
    ext: "webp",
    matches: (b) =>
      b.length >= 12 &&
      String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
  {
    mime: "image/gif",
    ext: "gif",
    matches: (b) =>
      b.length >= 6 && ["GIF87a", "GIF89a"].includes(String.fromCharCode(...b.slice(0, 6))),
  },
]

export function detectJournalImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  return SIGNATURES.find((signature) => signature.matches(bytes)) ?? null
}

export function safeJournalStoragePath(root: string, storageKey: string): string | null {
  const parts = storageKey.split("/")
  if (parts.length !== 2 || parts.some((part) => !part || part !== path.basename(part) || part.includes(".."))) {
    return null
  }
  const target = path.resolve(root, ...parts)
  const resolvedRoot = path.resolve(root)
  return target.startsWith(`${resolvedRoot}${path.sep}`) ? target : null
}
