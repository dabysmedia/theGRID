"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { DEFAULT_WEIGHT_UNIT } from "@/lib/units"
import { useActiveDate } from "@/context/DateContext"

type Status = "loading" | "ready"

function sameNumber(a: string, b: number | null): boolean {
  if (b == null) return false
  const n = parseFloat(a)
  return !Number.isNaN(n) && Math.abs(n - b) < 1e-6
}

interface WeighInPayload {
  todayEntry?: { value: number } | null
  latestEntry?: { value: number } | null
  previousEntry?: { value: number } | null
  unit?: string
}

function applyPayload(
  data: WeighInPayload,
  setters: {
    setValue: (v: string) => void
    setUnit: (u: string) => void
    setDayWeight: (n: number | null) => void
    setLatestWeight: (n: number | null) => void
    setPreviousWeight: (n: number | null) => void
  }
) {
  const dayVal = data.todayEntry?.value ?? null
  const latestVal = data.latestEntry?.value ?? null
  const prevVal = data.previousEntry?.value ?? null
  setters.setDayWeight(dayVal)
  setters.setLatestWeight(latestVal)
  setters.setPreviousWeight(prevVal)
  setters.setUnit(typeof data.unit === "string" ? data.unit : DEFAULT_WEIGHT_UNIT)

  if (dayVal != null) {
    setters.setValue(String(dayVal))
  } else if (latestVal != null) {
    setters.setValue(String(latestVal))
  } else {
    setters.setValue("")
  }
}

interface DailyWeighInProps {
  embedded?: boolean
}

export function DailyWeighIn({ embedded = false }: DailyWeighInProps) {
  const { activeDate } = useActiveDate()
  const [status, setStatus] = useState<Status>("loading")
  const [value, setValue] = useState("")
  const [dayWeight, setDayWeight] = useState<number | null>(null)
  const [latestWeight, setLatestWeight] = useState<number | null>(null)
  const [previousWeight, setPreviousWeight] = useState<number | null>(null)
  const [unit, setUnit] = useState(DEFAULT_WEIGHT_UNIT)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setStatus("loading")
    const res = await fetch(`/api/weigh-in?d=${activeDate}`)
    const data = await res.json()
    if (!res.ok) {
      setStatus("ready")
      return
    }
    applyPayload(data, {
      setValue,
      setUnit,
      setDayWeight,
      setLatestWeight,
      setPreviousWeight,
    })
    setStatus("ready")
  }, [activeDate])

  useEffect(() => {
    load().catch(() => setStatus("ready"))
  }, [load])

  useEffect(() => {
    if (status === "ready" && dayWeight == null) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [status, dayWeight])

  const logged = dayWeight != null
  const greyedHint =
    !logged &&
    latestWeight != null &&
    sameNumber(value, latestWeight)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (logged) return
    if (!value.trim() || submitting) return
    setSubmitting(true)

    try {
      const res = await fetch("/api/weigh-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, date: activeDate }),
      })

      if (res.ok) {
        const ref = await fetch(`/api/weigh-in?d=${activeDate}`)
        const data = await ref.json()
        if (ref.ok) {
          applyPayload(data, {
            setValue,
            setUnit,
            setDayWeight,
            setLatestWeight,
            setPreviousWeight,
          })
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (status === "loading") return null

  const delta =
    logged && previousWeight != null && dayWeight != null
      ? Math.round((dayWeight - previousWeight) * 10) / 10
      : null

  const formInner = (
    <div className="space-y-4">
      <div className="min-w-0 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {logged ? "Logged weight" : "Weigh-in"}
        </p>
        {logged && previousWeight != null && (
          <p className="text-[11px] text-muted-foreground/70">
            Last recorded{" "}
            <span className="tabular-nums text-muted-foreground/80">
              {previousWeight} {unit}
            </span>
          </p>
        )}
        {!logged && latestWeight != null && (
          <p className="text-[11px] text-muted-foreground/80">
            Last{" "}
            <span className="tabular-nums">{latestWeight}</span> {unit}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <Input
          ref={inputRef}
          type="number"
          step="0.1"
          placeholder={latestWeight != null ? `${latestWeight}` : "—"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={logged}
          className={cn(
            "h-auto min-h-0 w-[min(100%,12rem)] flex-1 border-0 border-b border-transparent rounded-none bg-transparent px-0 py-0 text-4xl sm:text-5xl font-extralight tracking-tight tabular-nums shadow-none backdrop-blur-none",
            "placeholder:text-muted-foreground/35 focus-visible:border-primary/35 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-transparent",
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            greyedHint && "text-muted-foreground/90 placeholder:text-muted-foreground/40",
            logged && "text-muted-foreground/85 border-muted-foreground/20 cursor-default"
          )}
          required={!logged}
        />
        <span className="pb-1.5 text-sm font-medium tracking-wide text-muted-foreground/60">
          {unit}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {logged && delta != null && delta !== 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {delta > 0 ? (
              <ArrowUp className="h-3 w-3 shrink-0 text-red-400/90" />
            ) : (
              <ArrowDown className="h-3 w-3 shrink-0 text-[#22c55e]" />
            )}
            <span className="tabular-nums">{Math.abs(delta)}</span> {unit} vs last
          </p>
        )}
        {logged ? (
          <Link
            href="/weight"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "inline-flex w-full sm:w-auto sm:ml-auto sm:shrink-0 gap-1 text-muted-foreground hover:text-foreground"
            )}
          >
            Weight
            <ChevronRight className="size-3.5 opacity-60" />
          </Link>
        ) : (
          <Button
            type="submit"
            disabled={!value.trim() || submitting}
            size="sm"
            className="w-full sm:w-auto sm:ml-auto sm:shrink-0"
          >
            Log
          </Button>
        )}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <form
        onSubmit={handleSubmit}
        className="animate-in fade-in slide-in-from-bottom-1 duration-300"
      >
        {formInner}
      </form>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="glass rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-300"
    >
      {formInner}
    </form>
  )
}
