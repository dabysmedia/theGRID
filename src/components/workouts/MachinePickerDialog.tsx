"use client"

import { useMemo, useState } from "react"
import { Ban, Check, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { MachineBrandMark } from "@/components/workouts/MachineBrandMark"
import {
  getMachineBrand,
  machineLabel,
  searchMachineBrands,
  type MachineBrand,
} from "@/lib/workouts/machine-brands"

export interface MachinePick {
  machineId: string | null
  machineName: string | null
}

export function MachinePickerDialog({
  open,
  onClose,
  exerciseName,
  value,
  onSelect,
  recentMachineIds = [],
}: {
  open: boolean
  onClose: () => void
  exerciseName: string
  value: MachinePick
  onSelect: (selection: MachinePick) => void
  /** Machines already used for this movement, surfaced first. */
  recentMachineIds?: string[]
}) {
  const [search, setSearch] = useState("")
  const [customName, setCustomName] = useState("")

  const filtered = useMemo(() => searchMachineBrands(search), [search])

  const recentBrands = useMemo(() => {
    const out: MachineBrand[] = []
    const seen = new Set<string>()
    for (const id of recentMachineIds) {
      if (!id || seen.has(id)) continue
      const brand = getMachineBrand(id)
      if (!brand) continue
      seen.add(id)
      out.push(brand)
    }
    return out
  }, [recentMachineIds])

  const popular = useMemo(
    () => filtered.filter((b) => b.popular && !recentBrands.some((r) => r.id === b.id)),
    [filtered, recentBrands],
  )

  const rest = useMemo(
    () =>
      filtered.filter(
        (b) => !b.popular && !recentBrands.some((r) => r.id === b.id),
      ),
    [filtered, recentBrands],
  )

  const selectedKey = value.machineId ?? (value.machineName ? `custom:${value.machineName}` : null)
  const isNone = !value.machineId && !value.machineName

  function choose(selection: MachinePick) {
    onSelect(selection)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton
        priority="high"
        className={cn(
          "glass-frost flex min-h-0 w-[min(100%,calc(100vw-1rem))] max-w-lg flex-col gap-0 overflow-hidden p-0",
          "max-h-[min(88dvh,calc(100dvh-1rem))] sm:max-h-[85vh]",
          "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3",
        )}
      >
        <div className="shrink-0 border-b border-border/15 px-4 pb-3 pt-4 pr-12">
          <DialogHeader className="space-y-0">
            <DialogTitle className="text-base">Machine for {exerciseName}</DialogTitle>
            <DialogDescription className="mt-1 text-[11px] leading-relaxed text-muted-foreground/65">
              Every manufacturer loads differently, so we track your weights for this
              movement per machine. Switching machines never looks like lost strength.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="shrink-0 space-y-2.5 px-4 pb-3 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search manufacturers…"
              value={search}
              autoFocus
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 border-primary/15 bg-background/40 pl-9 text-base sm:text-sm"
            />
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]",
            "scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:size-0",
          )}
        >
          <button
            type="button"
            onClick={() => choose({ machineId: null, machineName: null })}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/[0.08] active:bg-primary/10 touch-manipulation sm:py-2.5",
              isNone && "bg-primary/[0.06]",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-glass-border/40 bg-glass-highlight/[0.06] text-muted-foreground/60">
              <Ban className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                No specific machine
              </span>
              <span className="block text-[10px] text-muted-foreground/55">
                Treat every session of this movement as one shared trend
              </span>
            </span>
            {isNone ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
          </button>

          {recentBrands.length > 0 && !search ? (
            <BrandSection
              title="Your machines"
              brands={recentBrands}
              selectedKey={selectedKey}
              onChoose={choose}
            />
          ) : null}

          {popular.length > 0 ? (
            <BrandSection
              title={search ? "Matches" : "Popular"}
              brands={popular}
              selectedKey={selectedKey}
              onChoose={choose}
            />
          ) : null}

          {rest.length > 0 ? (
            <BrandSection
              title="All manufacturers"
              brands={rest}
              selectedKey={selectedKey}
              onChoose={choose}
            />
          ) : null}

          {filtered.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-muted-foreground/60">
              No manufacturer matches &ldquo;{search}&rdquo; — add it below.
            </p>
          ) : null}

          <div className="mt-1 border-t border-border/15 px-4 pb-1 pt-3">
            <p className="pb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/55">
              Add your own
            </p>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const name = customName.trim()
                if (!name) return
                choose({ machineId: null, machineName: name })
              }}
            >
              <Input
                placeholder="e.g. Gold's Gym house brand"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="h-11 border-primary/15 bg-background/40 text-base sm:text-sm"
              />
              <Button
                type="submit"
                size="sm"
                variant="glass"
                disabled={!customName.trim()}
                className="h-11 shrink-0 gap-1 touch-manipulation"
              >
                <Plus className="size-3.5" aria-hidden />
                Add
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BrandSection({
  title,
  brands,
  selectedKey,
  onChoose,
}: {
  title: string
  brands: MachineBrand[]
  selectedKey: string | null
  onChoose: (selection: MachinePick) => void
}) {
  return (
    <div>
      <p className="px-4 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.15em] text-primary/70">
        {title}
      </p>
      {brands.map((brand) => {
        const selected = selectedKey === brand.id
        return (
          <button
            key={brand.id}
            type="button"
            onClick={() => onChoose({ machineId: brand.id, machineName: null })}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-primary/[0.08] active:bg-primary/10 touch-manipulation sm:py-2",
              selected && "bg-primary/[0.06]",
            )}
          >
            <MachineBrandMark machineId={brand.id} size="md" variant="plate" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {machineLabel(brand.id) ?? brand.name}
              </span>
              {brand.origin ? (
                <span className="block text-[10px] text-muted-foreground/50">{brand.origin}</span>
              ) : null}
            </span>
            {selected ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
          </button>
        )
      })}
    </div>
  )
}
