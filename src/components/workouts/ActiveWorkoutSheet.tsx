"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

const DISMISS_DRAG_PX = 90

/**
 * Bottom sheet that lives inside the active workout overlay (z-120), so it
 * layers correctly without a portal. Drag the handle down to dismiss.
 */
export function ActiveWorkoutSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const titleId = useId()
  const [rendered, setRendered] = useState(open)
  const [dragY, setDragY] = useState(0)
  const dragRef = useRef<{ pointerId: number; startY: number } | null>(null)

  if (open && !rendered) setRendered(true)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!rendered) return null
  const state = open ? "open" : "closing"

  return (
    <div
      className={cn(
        "absolute inset-0 z-40 flex flex-col justify-end",
        !open && "pointer-events-none",
      )}
    >
      <div
        className="aw-sheet-backdrop absolute inset-0 bg-black/60 backdrop-blur-[3px]"
        data-state={state}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-state={state}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && !open) setRendered(false)
        }}
        className={cn(
          "aw-sheet relative flex max-h-[88%] flex-col rounded-t-[1.9rem] border-t border-white/[0.09] bg-[#0b0f14] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-24px_70px_rgba(0,0,0,0.65)]",
          className,
        )}
        style={
          dragY > 0
            ? { transform: `translateY(${dragY}px)`, transition: "none" }
            : { transition: "transform 220ms cubic-bezier(.22,1,.36,1)" }
        }
      >
        <div
          className="shrink-0 cursor-grab touch-none select-none px-5 pb-3 pt-2.5 active:cursor-grabbing"
          onPointerDown={(event) => {
            dragRef.current = { pointerId: event.pointerId, startY: event.clientY }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== event.pointerId) return
            setDragY(Math.max(0, event.clientY - drag.startY))
          }}
          onPointerUp={(event) => {
            const drag = dragRef.current
            dragRef.current = null
            if (!drag || drag.pointerId !== event.pointerId) return
            const distance = event.clientY - drag.startY
            setDragY(0)
            if (distance > DISMISS_DRAG_PX) onClose()
          }}
          onPointerCancel={() => {
            dragRef.current = null
            setDragY(0)
          }}
        >
          <span className="mx-auto block h-1 w-10 rounded-full bg-white/20" aria-hidden />
          <h2 id={titleId} className="mt-4 font-heading text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground/65">{description}</p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        {footer ? <div className="shrink-0 px-5 pt-3">{footer}</div> : null}
      </div>
    </div>
  )
}
