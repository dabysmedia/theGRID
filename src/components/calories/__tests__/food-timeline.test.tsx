import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { CaloriesFocusPanel } from "@/components/calories/CaloriesFocusPanel"
import { FoodTimeline, groupEntriesBySlot, totalsForEntries } from "@/components/calories/FoodTimeline"
import type { CalorieEntry } from "@/lib/calories/log-food"
import type { FrequentFoodSuggestion } from "@/lib/calories/frequent-foods"

function entry(over: Partial<CalorieEntry> & { id: string }): CalorieEntry {
  return {
    date: "2026-08-28T12:00:00.000Z",
    mealType: "breakfast",
    mealSlot: "morning",
    createdAt: "2026-08-28T12:00:00.000Z",
    description: "Oats",
    calories: 285,
    protein: 18,
    carbs: 30,
    fat: 11,
    imageUrl: null,
    portionAmount: 1,
    portionUnit: "serving",
    ...over,
  }
}

function suggestion(over: Partial<FrequentFoodSuggestion> & { id: string }): FrequentFoodSuggestion {
  return {
    name: "Overnight Protein Oats",
    calories: 285,
    protein: 18,
    carbs: 30,
    fat: 11,
    imageUrl: null,
    portionAmount: 1,
    portionUnit: "serving",
    logCount: 12,
    lastLoggedAt: "2026-08-27T12:00:00.000Z",
    kind: "frequent",
    sameSlot: true,
    ...over,
  }
}

const noop = () => {}

function render(props: Partial<Parameters<typeof FoodTimeline>[0]> = {}) {
  return renderToStaticMarkup(
    <FoodTimeline
      entries={[]}
      status="ready"
      currentSlot="morning"
      suggestions={{}}
      quickAddPendingId={null}
      onAdd={noop}
      onEditBlock={noop}
      onQuickAdd={noop}
      onRetry={noop}
      {...props}
    />,
  )
}

describe("groupEntriesBySlot", () => {
  it("always returns all three blocks, in order through the day", () => {
    expect(groupEntriesBySlot([]).map((g) => g.slot)).toEqual([
      "morning",
      "afternoon",
      "evening",
    ])
  })

  it("routes entries by slot and totals each block's macros", () => {
    const groups = groupEntriesBySlot([
      entry({ id: "a", mealSlot: "morning", calories: 285, protein: 18, fat: 11, carbs: 30 }),
      entry({ id: "b", mealSlot: "morning", calories: 60, protein: 15, fat: 0, carbs: 0 }),
      entry({ id: "c", mealSlot: "evening", calories: 720, protein: 46, fat: 30, carbs: 55 }),
    ])
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(["a", "b"])
    expect(groups[0]!.totals).toMatchObject({ calories: 345, protein: 33, fat: 11, carbs: 30 })
    expect(groups[1]!.entries).toEqual([])
    expect(groups[2]!.totals.calories).toBe(720)
  })

  it("places legacy rows that never had a slot", () => {
    const groups = groupEntriesBySlot([
      entry({ id: "legacy", mealSlot: null, mealType: "dinner" }),
    ])
    expect(groups[2]!.entries.map((e) => e.id)).toEqual(["legacy"])
  })

  it("orders a block by when each food was logged", () => {
    const groups = groupEntriesBySlot([
      entry({ id: "late", createdAt: "2026-08-28T15:00:00.000Z" }),
      entry({ id: "early", createdAt: "2026-08-28T11:00:00.000Z" }),
    ])
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(["early", "late"])
  })

  it("only claims macros when something reported them", () => {
    expect(
      totalsForEntries([entry({ id: "x", protein: null, carbs: null, fat: null })]).hasMacros,
    ).toBe(false)
    expect(totalsForEntries([entry({ id: "y" })]).hasMacros).toBe(true)
  })
})

describe("FoodTimeline", () => {
  it("shows every block even on a completely empty day", () => {
    const html = render()
    expect(html).toContain("Morning")
    expect(html).toContain("Afternoon")
    expect(html).toContain("Evening")
    expect(html).toContain("4a – 12p")
    expect(html.match(/Nothing logged yet/g)).toHaveLength(3)
  })

  it("marks the block the user is currently in", () => {
    expect(render({ currentSlot: "evening" })).toContain(">Now<")
  })

  it("renders logged food with its calories and macros", () => {
    const html = render({
      entries: [entry({ id: "a", description: "Overnight Protein Oats" })],
    })
    expect(html).toContain("Overnight Protein Oats")
    expect(html).toContain('aria-label="18P"')
    expect(html).toContain('aria-label="11F"')
    expect(html).toContain('aria-label="30C"')
    expect(html).toContain('style="color:#38bdf8"')
    expect(html).toContain('style="color:#fbbf24"')
    expect(html).toContain('style="color:#4ade80"')
    expect(html).toContain("1 serving")
  })

  it("offers a plus on an empty block and an edit button once it has food", () => {
    const empty = render()
    expect(empty).toContain('aria-label="Add food to morning"')
    expect(empty).not.toContain('aria-label="Edit morning"')

    const filled = render({ entries: [entry({ id: "a" })] })
    expect(filled).toContain('aria-label="Edit morning"')
    expect(filled).not.toContain('aria-label="Add food to morning"')
  })

  it("makes the whole food row open its block, with no tiny per-row controls", () => {
    const html = render({
      entries: [entry({ id: "a", description: "Overnight Protein Oats" })],
    })
    expect(html).toContain("Edit morning — Overnight Protein Oats")
    expect(html).not.toContain('aria-label="Delete Overnight Protein Oats"')
    expect(html).not.toContain('aria-label="Edit Overnight Protein Oats"')
  })

  it("offers the block's regulars while it is still empty", () => {
    const html = render({
      suggestions: { evening: [suggestion({ id: "s1", name: "Salmon Bowl" })] },
    })
    expect(html).toContain("You usually eat")
    expect(html).toContain("Salmon Bowl")
  })

  it("keeps offering regulars for the current block once it has food", () => {
    const html = render({
      currentSlot: "morning",
      entries: [entry({ id: "a" })],
      suggestions: { morning: [suggestion({ id: "s1", name: "Greek Yogurt" })] },
    })
    expect(html).toContain("Greek Yogurt")
  })

  it("hides regulars for a past block that has already been filled", () => {
    const html = render({
      currentSlot: "evening",
      entries: [entry({ id: "a", mealSlot: "morning" })],
      suggestions: { morning: [suggestion({ id: "s1", name: "Greek Yogurt" })] },
    })
    expect(html).not.toContain("Greek Yogurt")
  })

  it("falls back to a plain add row when there is no history to suggest", () => {
    expect(render()).toContain("Add morning food")
  })

  it("surfaces a retry when the log could not be loaded", () => {
    expect(render({ status: "error" })).toContain("Retry")
  })
})

describe("CaloriesFocusPanel", () => {
  function renderPanel(over: Partial<Parameters<typeof CaloriesFocusPanel>[0]> = {}) {
    const entries = over.entries ?? [entry({ id: "a" })]
    return renderToStaticMarkup(
      <CaloriesFocusPanel
        consumed={345}
        target={2000}
        entries={entries}
        dayTotals={totalsForEntries(entries)}
        status="ready"
        currentSlot="morning"
        suggestions={{}}
        quickAddPendingId={null}
        onAdd={noop}
        onEditBlock={noop}
        onQuickAdd={noop}
        onRetry={noop}
        {...over}
      />,
    )
  }

  it("leads with the day's macros and what is left", () => {
    const html = renderPanel()
    expect(html).toContain("Today&#x27;s timeline")
    expect(html).toContain("1,655 cal left today")
    expect(html).toContain(">P<")
  })

  it("counts over-target days up rather than clamping at zero", () => {
    expect(renderPanel({ consumed: 2400, target: 2000 })).toContain("400 cal over target")
  })

  it("hides the macro line until something is logged", () => {
    const html = renderPanel({ entries: [] })
    expect(html).not.toContain(">P<")
    expect(html).toContain("Morning · Afternoon · Evening")
  })

  it("leaves intake vs. goal to the ring — no duplicate readout or add button", () => {
    const html = renderPanel()
    expect(html).not.toContain("Calorie balance")
    expect(html).not.toContain("Daily progress")
    expect(html).not.toContain("cal remaining")
    expect(html).not.toContain(">Add food<")
  })
})

describe("CaloriesFocusPanel scrolling", () => {
  it("scrolls only the food, leaving the heading and totals fixed above it", () => {
    const entries = [entry({ id: "a" })]
    const html = renderToStaticMarkup(
      <CaloriesFocusPanel
        consumed={345}
        target={2000}
        entries={entries}
        dayTotals={totalsForEntries(entries)}
        status="ready"
        currentSlot="morning"
        suggestions={{}}
        quickAddPendingId={null}
        onAdd={noop}
        onEditBlock={noop}
        onQuickAdd={noop}
        onRetry={noop}
      />,
    )
    // The scroll container wraps the timeline, not the header.
    const headerAt = html.indexOf("Today&#x27;s timeline")
    const scrollAt = html.indexOf("overflow-y-auto")
    expect(headerAt).toBeGreaterThan(-1)
    expect(scrollAt).toBeGreaterThan(headerAt)
    expect(html).toContain("max-h-[min(58vh,34rem)]")
    expect(html).toContain("overscroll-contain")
  })
})
