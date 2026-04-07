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
    <div className="flex items-center gap-1">
      {/* Prev day */}
      <button
        onClick={goPrev}
        className="flex items-center justify-center w-8 h-8 text-muted-foreground/50 hover:text-primary hover:bg-grid-accent-dim press-scale transition-colors"
        style={{ borderRadius: "3px" }}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Date display — clickable */}
      <button
        onClick={openPicker}
        className={`relative group text-xs tracking-[0.1em] uppercase px-3 py-1.5 transition-all ${
          isToday
            ? "text-muted-foreground hover:text-foreground hover:bg-glass-highlight/30"
            : "text-primary font-semibold bg-grid-accent-dim border border-primary/20"
        }`}
        style={{ borderRadius: "3px" }}
      >
        <span className="text-muted-foreground/40 mr-1.5 group-hover:text-muted-foreground/60 transition-colors">//</span>
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
        onClick={goNext}
        className="flex items-center justify-center w-8 h-8 text-muted-foreground/50 hover:text-primary hover:bg-grid-accent-dim press-scale transition-colors"
        style={{ borderRadius: "3px" }}
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Return to today */}
      {!isToday && (
        <button
          onClick={goToday}
          className="flex items-center gap-1 ml-1.5 px-2.5 py-1.5 text-[10px] tracking-[0.12em] uppercase font-semibold text-primary bg-grid-accent-dim border border-primary/20 hover:bg-primary/20 hover:border-primary/35 transition-all"
          style={{ borderRadius: "3px" }}
        >
          <RotateCcw className="h-3 w-3" />
          Today
        </button>
      )}
    </div>
  )
}
