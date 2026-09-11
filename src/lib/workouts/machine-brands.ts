/*
 * Gym equipment manufacturers.
 *
 * A movement ("Pec Deck") can be built very differently by each manufacturer —
 * a Panatta selectorized stack and a Hammer Strength plate-loaded rig ask for
 * completely different numbers for the same effort. The catalogue below gives
 * every manufacturer a stable id, so a logged set can remember which machine it
 * was performed on and progressive overload can be tracked per machine instead
 * of conflating a machine change with a strength change.
 *
 * Brand marks are rendered from this metadata (see MachineBrandMark.tsx) rather
 * than bundled logo files, so they stay crisp at any size, work offline, and
 * never show a broken image.
 */

export type BrandShape = "square" | "round" | "hex" | "shield" | "chevron"

/** Typographic treatment for the brand wordmark. */
export type BrandWordmark = "condensed" | "italic" | "wide" | "serif" | "stencil" | "mono"

export interface MachineBrand {
  id: string
  name: string
  /** Two/three letter form for tight spaces (chips, set rows). */
  short: string
  /** Alternate spellings and search terms. */
  aliases?: string[]
  /** Primary brand colour. */
  color: string
  /** Ink colour that reads on top of `color`. */
  ink: string
  /** 1–2 character monogram for the emblem tile. */
  monogram: string
  shape: BrandShape
  wordmark: BrandWordmark
  /** Shown as a small tagline in the machine picker. */
  origin?: string
  /** Surface these first in the picker. */
  popular?: boolean
}

/** Prefix for user-typed machines that are not in the catalogue. */
export const CUSTOM_MACHINE_PREFIX = "custom:"

export const MACHINE_BRANDS: MachineBrand[] = [
  {
    id: "arsenal",
    name: "Arsenal Strength",
    short: "ARS",
    aliases: ["arsenal", "arsenal strength", "ars"],
    color: "#E02020",
    ink: "#ffffff",
    monogram: "A",
    shape: "shield",
    wordmark: "italic",
    origin: "USA",
    popular: true,
  },
  {
    id: "panatta",
    name: "Panatta",
    short: "PNT",
    aliases: ["panatta", "panatta sport", "pnt"],
    color: "#E30613",
    ink: "#ffffff",
    monogram: "P",
    shape: "round",
    wordmark: "italic",
    origin: "Italy",
    popular: true,
  },
  {
    id: "hammer",
    name: "Hammer Strength",
    short: "HMR",
    aliases: ["hammer", "hammer strength", "hmr", "hs"],
    color: "#F5A623",
    ink: "#14161a",
    monogram: "H",
    shape: "hex",
    wordmark: "condensed",
    origin: "USA",
    popular: true,
  },
  {
    id: "cybex",
    name: "Cybex",
    short: "CYX",
    aliases: ["cybex", "cyb", "cyx"],
    color: "#1F5FA8",
    ink: "#ffffff",
    monogram: "C",
    shape: "hex",
    wordmark: "wide",
    origin: "USA",
    popular: true,
  },
  {
    id: "lifefitness",
    name: "Life Fitness",
    short: "LF",
    aliases: ["life fitness", "lifefitness", "life", "lf"],
    color: "#0B4C8C",
    ink: "#ffffff",
    monogram: "LF",
    shape: "round",
    wordmark: "wide",
    origin: "USA",
    popular: true,
  },
  {
    id: "technogym",
    name: "Technogym",
    short: "TCH",
    aliases: ["technogym", "techno gym", "tch", "tg"],
    color: "#F7C600",
    ink: "#14161a",
    monogram: "T",
    shape: "round",
    wordmark: "wide",
    origin: "Italy",
    popular: true,
  },
  {
    id: "prime",
    name: "Prime Fitness",
    short: "PRM",
    aliases: ["prime", "prime fitness", "prm"],
    color: "#C8102E",
    ink: "#ffffff",
    monogram: "P",
    shape: "chevron",
    wordmark: "condensed",
    origin: "USA",
    popular: true,
  },
  {
    id: "atlantis",
    name: "Atlantis",
    short: "ATL",
    aliases: ["atlantis", "atlantis strength", "atl"],
    color: "#0E7AC4",
    ink: "#ffffff",
    monogram: "A",
    shape: "shield",
    wordmark: "wide",
    origin: "Canada",
    popular: true,
  },
  {
    id: "nautilus",
    name: "Nautilus",
    short: "NAU",
    aliases: ["nautilus", "nau", "nautilus strength"],
    color: "#124C9C",
    ink: "#ffffff",
    monogram: "N",
    shape: "round",
    wordmark: "wide",
    origin: "USA",
    popular: true,
  },
  {
    id: "precor",
    name: "Precor",
    short: "PCR",
    aliases: ["precor", "pcr"],
    color: "#E4002B",
    ink: "#ffffff",
    monogram: "P",
    shape: "round",
    wordmark: "condensed",
    origin: "USA",
    popular: true,
  },
  {
    id: "matrix",
    name: "Matrix Fitness",
    short: "MTX",
    aliases: ["matrix", "matrix fitness", "mtx"],
    color: "#97C93D",
    ink: "#14161a",
    monogram: "M",
    shape: "square",
    wordmark: "wide",
    origin: "USA",
  },
  {
    id: "hoist",
    name: "Hoist Fitness",
    short: "HST",
    aliases: ["hoist", "hoist fitness", "hst"],
    color: "#D0021B",
    ink: "#ffffff",
    monogram: "H",
    shape: "square",
    wordmark: "condensed",
    origin: "USA",
  },
  {
    id: "rogue",
    name: "Rogue",
    short: "ROG",
    aliases: ["rogue", "rogue fitness", "rog"],
    color: "#D22F2F",
    ink: "#ffffff",
    monogram: "R",
    shape: "square",
    wordmark: "stencil",
    origin: "USA",
  },
  {
    id: "eleiko",
    name: "Eleiko",
    short: "ELK",
    aliases: ["eleiko", "elk"],
    color: "#0B5FA5",
    ink: "#ffffff",
    monogram: "E",
    shape: "round",
    wordmark: "wide",
    origin: "Sweden",
  },
  {
    id: "watson",
    name: "Watson Gym Equipment",
    short: "WAT",
    aliases: ["watson", "watson gym", "wat"],
    color: "#F2B705",
    ink: "#14161a",
    monogram: "W",
    shape: "shield",
    wordmark: "condensed",
    origin: "UK",
  },
  {
    id: "strive",
    name: "Strive",
    short: "STR",
    aliases: ["strive", "strive fitness", "str"],
    color: "#1E9E5A",
    ink: "#ffffff",
    monogram: "S",
    shape: "chevron",
    wordmark: "wide",
    origin: "USA",
  },
  {
    id: "legend",
    name: "Legend Fitness",
    short: "LGD",
    aliases: ["legend", "legend fitness", "lgd"],
    color: "#B0121B",
    ink: "#ffffff",
    monogram: "L",
    shape: "shield",
    wordmark: "stencil",
    origin: "USA",
  },
  {
    id: "bodysolid",
    name: "Body-Solid",
    short: "BSD",
    aliases: ["body solid", "bodysolid", "bsd"],
    color: "#C8102E",
    ink: "#ffffff",
    monogram: "BS",
    shape: "square",
    wordmark: "wide",
    origin: "USA",
  },
  {
    id: "muscled",
    name: "Muscle D Fitness",
    short: "MSD",
    aliases: ["muscle d", "muscled", "muscle d fitness", "msd"],
    color: "#E23A2E",
    ink: "#ffffff",
    monogram: "MD",
    shape: "hex",
    wordmark: "condensed",
    origin: "USA",
  },
  {
    id: "powerlift",
    name: "Power Lift",
    short: "PWL",
    aliases: ["power lift", "powerlift", "pwl"],
    color: "#1B4F9C",
    ink: "#ffffff",
    monogram: "PL",
    shape: "square",
    wordmark: "condensed",
    origin: "USA",
  },
  {
    id: "freemotion",
    name: "FreeMotion",
    short: "FMT",
    aliases: ["freemotion", "free motion", "fmt"],
    color: "#00A0DF",
    ink: "#06232e",
    monogram: "F",
    shape: "round",
    wordmark: "wide",
    origin: "USA",
  },
  {
    id: "tuffstuff",
    name: "TuffStuff Fitness",
    short: "TFS",
    aliases: ["tuffstuff", "tuff stuff", "tfs"],
    color: "#C8102E",
    ink: "#ffffff",
    monogram: "TS",
    shape: "shield",
    wordmark: "stencil",
    origin: "USA",
  },
  {
    id: "sorinex",
    name: "Sorinex",
    short: "SRX",
    aliases: ["sorinex", "srx"],
    color: "#1B1B1B",
    ink: "#ffffff",
    monogram: "SX",
    shape: "square",
    wordmark: "stencil",
    origin: "USA",
  },
  {
    id: "inspire",
    name: "Inspire Fitness",
    short: "INS",
    aliases: ["inspire", "inspire fitness", "ins"],
    color: "#0B72CE",
    ink: "#ffffff",
    monogram: "I",
    shape: "square",
    wordmark: "wide",
    origin: "USA",
  },
  {
    id: "gym80",
    name: "Gym80",
    short: "G80",
    aliases: ["gym80", "gym 80", "g80"],
    color: "#E2001A",
    ink: "#ffffff",
    monogram: "80",
    shape: "hex",
    wordmark: "condensed",
    origin: "Germany",
  },
]

const BY_ID = new Map(MACHINE_BRANDS.map((b) => [b.id, b]))

export function isKnownMachineBrand(id: string | null | undefined): boolean {
  return id != null && BY_ID.has(id)
}

export function getMachineBrand(id: string | null | undefined): MachineBrand | null {
  if (id == null) return null
  if (BY_ID.has(id)) return BY_ID.get(id)!
  if (isCustomMachineId(id)) {
    const name = customMachineName(id)
    if (!name) return null
    return buildCustomBrand(name)
  }
  return null
}

export function isCustomMachineId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(CUSTOM_MACHINE_PREFIX)
}

export function customMachineId(name: string): string {
  return `${CUSTOM_MACHINE_PREFIX}${name.trim()}`
}

export function customMachineName(id: string): string {
  return id.startsWith(CUSTOM_MACHINE_PREFIX) ? id.slice(CUSTOM_MACHINE_PREFIX.length) : ""
}

/** Deterministic pseudo-brand for a user-typed machine so it still gets a mark. */
export function buildCustomBrand(name: string): MachineBrand {
  const clean = name.trim() || "Custom"
  const monogram = initialsFor(clean)
  const hue = hashHue(clean.toLowerCase())
  return {
    id: customMachineId(clean),
    name: clean,
    short: monogram.slice(0, 3),
    color: `hsl(${hue} 62% 45%)`,
    ink: "#ffffff",
    monogram,
    shape: "square",
    wordmark: "wide",
    origin: "Custom",
  }
}

function initialsFor(name: string): string {
  const words = name.split(/[\s\-_/]+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function hashHue(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) % 360
  }
  return h
}

/** Display label for a machine selection: catalogue name, or the typed name. */
export function machineLabel(
  machineId: string | null | undefined,
  fallbackName?: string | null,
): string | null {
  if (machineId) {
    const brand = getMachineBrand(machineId)
    if (brand) return brand.name
    if (isCustomMachineId(machineId)) {
      return customMachineName(machineId) || fallbackName?.trim() || null
    }
  }
  const named = fallbackName?.trim()
  return named ? named : null
}

/**
 * Canonical comparison key for a machine selection. Catalogue ids compare by id;
 * custom machines compare case-insensitively by name. `""` = no machine, and is
 * what every pre-machine-mode exposure collapses to.
 */
export function normalizeMachineKey(
  machineId?: string | null,
  machineName?: string | null,
): string {
  const id = (machineId ?? "").trim()
  if (isCustomMachineId(id)) {
    const name = customMachineName(id).trim().toLowerCase()
    return name ? `${CUSTOM_MACHINE_PREFIX}${name}` : ""
  }
  if (id) return id.toLowerCase()
  const named = (machineName ?? "").trim().toLowerCase()
  return named ? `${CUSTOM_MACHINE_PREFIX}${named}` : ""
}

/** Fuzzy search used by the machine picker. */
export function searchMachineBrands(query: string): MachineBrand[] {
  const q = query.trim().toLowerCase()
  const sorted = [...MACHINE_BRANDS].sort((a, b) => {
    if (!!b.popular !== !!a.popular) return b.popular ? 1 : -1
    return a.name.localeCompare(b.name)
  })
  if (!q) return sorted
  return sorted.filter((brand) => {
    if (brand.name.toLowerCase().includes(q)) return true
    if (brand.short.toLowerCase().includes(q)) return true
    return (brand.aliases ?? []).some((alias) => alias.includes(q))
  })
}

/** Popular brands first, then the rest alphabetically. */
export function orderedMachineBrands(): MachineBrand[] {
  return searchMachineBrands("")
}
