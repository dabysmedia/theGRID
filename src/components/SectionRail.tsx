export function SectionRail({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="hud-divider flex-1" />
      <span className="type-hud-rail shrink-0">{label}</span>
      <div className="hud-divider flex-1" />
    </div>
  )
}
