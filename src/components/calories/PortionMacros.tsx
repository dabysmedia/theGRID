"use client"

/** Color matches the hub: protein blue, carbs green, fat gold. */
export function PortionMacros({ calories, protein, carbs, fat }: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null }) {
  const macros = [
    { name: "Protein", value: protein, energy: (protein ?? 0) * 4, color: "#38bdf8" },
    { name: "Carbs", value: carbs, energy: (carbs ?? 0) * 4, color: "#4ade80" },
    { name: "Fat", value: fat, energy: (fat ?? 0) * 9, color: "#fbbf24" },
  ]
  const total = macros.reduce((sum, macro) => sum + macro.energy, 0)
  const complete = macros.every((macro) => macro.value != null && macro.value >= 0)
  const proteinEnd = complete && total > 0 ? macros[0].energy / total * 100 : 0
  const carbsEnd = proteinEnd + (complete && total > 0 ? macros[1].energy / total * 100 : 0)
  return <section aria-label="Nutrition for selected portion" className="portion-macros mt-4 rounded-2xl border border-white/[0.08] p-4">
    <div className="flex items-center gap-5">
      <div className="relative flex size-28 shrink-0 items-center justify-center rounded-full" style={{ background: complete && total > 0 ? `conic-gradient(#38bdf8 0% ${proteinEnd}%, #4ade80 ${proteinEnd}% ${carbsEnd}%, #fbbf24 ${carbsEnd}% 100%)` : "rgb(255 255 255 / 8%)" }}>
        <div className="flex size-[100px] flex-col items-center justify-center rounded-full bg-background">
          <span className="font-heading text-3xl font-semibold tabular-nums">{calories == null ? "—" : Math.round(calories)}</span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Calories</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {macros.map((macro) => <div key={macro.name}>
          <div className="flex items-baseline justify-between gap-2 text-xs"><span style={{ color: macro.color }}>{macro.name}</span><span className="font-semibold tabular-nums">{macro.value == null ? "—" : `${Math.round(macro.value * 10) / 10} g`}</span></div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none" style={{ background: macro.color, width: `${complete && total > 0 ? macro.energy / total * 100 : 0}%` }} /></div>
        </div>)}
      </div>
    </div>
    <p className="mt-3 text-center text-[10px] text-muted-foreground/65">{complete ? "Color balance shows energy from protein, carbs and fat." : "Some macros aren’t available for this food."}</p>
  </section>
}
