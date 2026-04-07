"use client"

import { useRef } from "react"
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react"
import { useActiveDate } from "@/context/DateContext"
import { parseLocalDate } from "@/lib/utils"
import { format } from "date-fns"

export function DatePicker() {
  const { activeDate, setActiveDate, isToday, goToday, goPrev, goNext } =
    useActiveDate()
  const inputRef = useRef<HTMLInputElement>(null)

  const dateObj = parseLocalDate(activeDate)
  const display = format(dateObj, "EEEE, MMMM d").toUpperCase()

  function openPicker() {
    inputRef.current?.showPicker?.()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value) setActiveDate(e.target.value)
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* Prev day */}
      <button
        onClick={goPrev}
        type="button"
        className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl text-muted-foreground/50 transition-colors hover:bg-grid-accent-dim hover:text-primary press-scale sm:h-8 sm:w-8"
        aria-label="Previous day"
      >
        <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
      </button>

      {/* Date display — clickable */}
      <button
        type="button"
        onClick={openPicker}
        className={`relative min-h-11 touch-manipulation group rounded-xl px-3 py-2.5 text-xs tracking-[0.1em] uppercase transition-all sm:min-h-0 sm:py-1.5 ${
          isToday
            ? "text-muted-foreground hover:text-foreground hover:bg-glass-highlight/30"
            : "text-primary font-semibold bg-grid-accent-dim border border-primary/20"
        }`}
      >
        <span className="text-muted-foreground/40 mr-1.5 group-hover:text-muted-foreground/60 transition-colors">
          {"//"}
        </span>
        {display}
        {!isToday && (
          <span className="absolute -top-px -right-px w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
        )}
        {/* Hidden native date input */}
        <input
          ref={inputRef}
          type="date"
          value={activeDate}
          onChange={handleChange}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full pointer-events-none"
          tabIndex={-1}
        />
      </button>

      {/* Next day */}
      <button
        type="button"
        onClick={goNext}
        className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl text-muted-foreground/50 transition-colors hover:bg-grid-accent-dim hover:text-primary press-scale sm:h-8 sm:w-8"
        aria-label="Next day"
      >
        <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
      </button>

      {/* Return to today */}
      {!isToday && (
        <button
          type="button"
          onClick={goToday}
          className="ml-1.5 flex min-h-11 touch-manipulation items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary transition-all bg-grid-accent-dim border border-primary/20 hover:bg-primary/20 hover:border-primary/35 sm:min-h-0 sm:px-2.5 sm:py-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
          Today
        </button>
      )}
    </div>
  )
}
