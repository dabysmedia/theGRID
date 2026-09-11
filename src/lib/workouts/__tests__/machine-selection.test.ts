import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  exerciseMachineKey,
  forgetMachineSelection,
  getRememberedMachine,
  loadMachineMemory,
  machineKeyOf,
  machineSelectionFromPick,
  rememberMachineSelection,
  sameMachineSelection,
  supportsMachineSelection,
} from "../machine-selection"
import { customMachineId, machineLabel } from "../machine-brands"

describe("supportsMachineSelection", () => {
  it("is on for machine and cable movements", () => {
    expect(supportsMachineSelection({ name: "Chest Press", category: "Machine" })).toBe(true)
    expect(supportsMachineSelection({ name: "Triceps Pushdown", category: "Cable" })).toBe(true)
    expect(supportsMachineSelection({ name: "Lat Pulldown", category: "Machine" })).toBe(true)
  })

  it("is off for free weights and bodyweight work", () => {
    expect(supportsMachineSelection({ name: "Bench Press", category: "Free weight" })).toBe(false)
    expect(supportsMachineSelection({ name: "Pull-Ups", category: "Body weight" })).toBe(false)
    expect(supportsMachineSelection({ name: "Dumbbell Curl", category: "Free weight" })).toBe(false)
  })

  it("falls back to the name for custom entries with no category", () => {
    expect(supportsMachineSelection({ name: "Reverse Pec Deck", category: "" })).toBe(true)
    expect(supportsMachineSelection({ name: "Goblet Squat", category: "" })).toBe(true)
    expect(supportsMachineSelection({ name: "Back Squat", category: "" })).toBe(false)
  })

  it("stays available once a machine has been assigned, even off-category", () => {
    expect(
      supportsMachineSelection({ name: "Bench Press", category: "Free weight", machineId: "rogue" }),
    ).toBe(true)
  })
})

describe("machine keys", () => {
  it("normalizes brand ids and custom names into one identity", () => {
    expect(machineKeyOf("arsenal")).toBe("arsenal")
    expect(machineKeyOf(customMachineId("Gold's Gym"))).toBe("custom:gold's gym")
    expect(machineKeyOf(null, "Gold's Gym")).toBe("custom:gold's gym")
    expect(machineKeyOf(null, null)).toBe("")
  })

  it("combines movement name and machine so history never crosses machines", () => {
    expect(exerciseMachineKey("Pec Deck", "arsenal")).toBe("pec deck@@arsenal")
    expect(exerciseMachineKey("  Pec   Deck ", "hammer")).toBe("pec deck@@hammer")
    expect(exerciseMachineKey("Pec Deck", null)).toBe("pec deck@@")
    expect(exerciseMachineKey("Pec Deck", "arsenal")).not.toBe(
      exerciseMachineKey("Pec Deck", "hammer"),
    )
  })

  it("compares selections by identity, not by object identity", () => {
    expect(
      sameMachineSelection(
        { machineId: "arsenal", machineName: null },
        { machineId: "arsenal", machineName: null },
      ),
    ).toBe(true)
    expect(
      sameMachineSelection(
        { machineId: null, machineName: "Gold's Gym" },
        { machineId: customMachineId("gold's gym"), machineName: "gold's gym" },
      ),
    ).toBe(true)
  })
})

describe("machineSelectionFromPick", () => {
  it("keeps a catalogue brand id", () => {
    expect(machineSelectionFromPick({ machineId: "panatta" })).toEqual({
      machineId: "panatta",
      machineName: null,
    })
  })

  it("converts a bare typed name into a custom machine", () => {
    expect(machineSelectionFromPick({ machineName: "Gold's Gym" })).toEqual({
      machineId: customMachineId("Gold's Gym"),
      machineName: "Gold's Gym",
    })
  })

  it("clears to no machine when nothing is given", () => {
    expect(machineSelectionFromPick({})).toEqual({ machineId: null, machineName: null })
    expect(machineSelectionFromPick({ machineName: "   " })).toEqual({
      machineId: null,
      machineName: null,
    })
  })
})

describe("machine memory", () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
      },
    })
  })

  it("remembers the last machine used for a movement", () => {
    rememberMachineSelection({ exerciseName: "Pec Deck", machineId: "arsenal" })
    const entry = getRememberedMachine("  pec   deck ")
    expect(entry?.machineId).toBe("arsenal")
    expect(entry?.exerciseName).toBe("Pec Deck")
    expect(entry?.useCount).toBe(1)
  })

  it("counts repeat uses and keeps the newest choice", () => {
    rememberMachineSelection({ exerciseName: "Pec Deck", machineId: "arsenal" })
    rememberMachineSelection({ exerciseName: "Pec Deck", machineId: "hammer" })
    const entry = getRememberedMachine("Pec Deck")
    expect(entry?.machineId).toBe("hammer")
    expect(entry?.useCount).toBe(2)
  })

  it("does not leak entries from an empty store", () => {
    rememberMachineSelection({ exerciseName: "Pec Deck", machineId: "arsenal" })
    /* Simulate storage being cleared out from under us (fresh device / cleared data). */
    store.clear()
    expect(loadMachineMemory()).toEqual({})
    expect(getRememberedMachine("Pec Deck")).toBeNull()
  })

  it("forgets a movement on request", () => {
    rememberMachineSelection({ exerciseName: "Pec Deck", machineId: "arsenal" })
    forgetMachineSelection("Pec Deck")
    expect(getRememberedMachine("Pec Deck")).toBeNull()
    expect(loadMachineMemory()).toEqual({})
  })
})

describe("machineLabel", () => {
  it("names catalogue brands and custom machines", () => {
    expect(machineLabel("hammer")).toBe("Hammer Strength")
    expect(machineLabel(customMachineId("Gold's Gym"))).toBe("Gold's Gym")
    expect(machineLabel(null, "  Home Rack ")).toBe("Home Rack")
    expect(machineLabel(null, null)).toBeNull()
  })
})
