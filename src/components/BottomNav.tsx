"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from "react"
import type { LucideIcon } from "lucide-react"
import {
  Home,
  NotebookPen,
  BarChart3,
  CheckSquare,
  Settings,
  Menu,
  ChevronRight,
  Utensils,
  Footprints,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CALORIES_LOG_FOOD_QUERY } from "@/lib/calories-log-deep-link"
import { HUB_RESET_OVERVIEW_EVENT } from "@/lib/hub-tile-prefs"
import { useUser } from "@/context/UserContext"
import { useActiveDate } from "@/context/DateContext"
import { isVacationBlockingCalendarDay } from "@/lib/vacation-mode"
import { COACH_AVATAR_SRC } from "@/lib/coach/branding"
import { FastingNavChip } from "@/components/FastingTimer"

type QuickActionItem = {
  href: string
  label: string
  icon: LucideIcon
  /** When set, shown instead of the Lucide icon (e.g. coach persona). */
  avatarSrc?: string
}

const navItems = [
  { href: "/more", label: "Settings", icon: Settings },
  { href: "/habits", label: "Habits", icon: CheckSquare },
  { href: "/journal", label: "Journal", icon: NotebookPen },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/", label: "Home", icon: Home },
]

const quickActions: QuickActionItem[] = [
  { href: "/coach", label: "Coach", icon: Sparkles, avatarSrc: COACH_AVATAR_SRC },
  {
    href: `/calories?${CALORIES_LOG_FOOD_QUERY}=1`,
    label: "Log Meal",
    icon: Utensils,
  },
  { href: "/steps", label: "Steps", icon: Footprints },
]

const DOCK_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
const PANEL_WIDTH = "min(calc(100vw - 5.25rem), 42rem)"

export function BottomNav() {
  const pathname = usePathname()
  const { user } = useUser()
  const { activeDate } = useActiveDate()
  const vacationBlocksCaloriesQuick = useMemo(
    () => isVacationBlockingCalendarDay(user?.vacationResumeDate, activeDate),
    [user?.vacationResumeDate, activeDate]
  )
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const quickPanelId = useId()

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((o) => !o), [])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setOpen(false)
    })
    return () => cancelAnimationFrame(id)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close])

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 animate-in fade-in duration-300 bg-background/60 backdrop-blur-sm motion-reduce:animate-none motion-reduce:backdrop-blur-none"
          onClick={close}
        />
      )}

      <nav
        className="fixed bottom-0 right-0 z-50 flex w-full animate-slide-up flex-col items-end ps-[max(0.75rem,env(safe-area-inset-left,0px))] pe-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[env(safe-area-inset-bottom,0px)] sm:ps-4 sm:pe-4 md:ps-6 md:pe-6"
        aria-label="Main navigation"
      >
        <div className="mb-2 flex max-w-full flex-row items-end justify-end gap-2">
          <FastingNavChip />
          <div className="glass-panel relative flex w-fit max-w-[min(100vw-1.5rem,calc(42rem+3.5rem))] flex-col overflow-hidden shadow-lg shadow-black/40">
            <div
              className={cn(
                "absolute top-0 left-4 right-4 z-[2] h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent transition-opacity duration-300 motion-reduce:transition-none",
                open ? "opacity-100" : "opacity-0"
              )}
            />

            <div
              id={quickPanelId}
              className={cn(
                "min-w-0 motion-safe:transition-[max-height,opacity] motion-safe:duration-500 motion-reduce:transition-none",
                open
                  ? "max-h-52 opacity-100"
                  : "max-h-0 max-w-0 overflow-hidden opacity-0"
              )}
              style={
                {
                  transitionTimingFunction: DOCK_EASE,
                } as CSSProperties
              }
            >
              <div
                className="flex w-full min-w-0 flex-col border-b border-white/10 px-1 pt-1 pb-0.5"
                style={{ pointerEvents: open ? "auto" : "none" }}
              >
                {quickActions.map((item, idx) => {
                  const pathPrefix = item.href.split("?")[0] ?? item.href
                  const isActive = pathname.startsWith(pathPrefix)
                  const logMealVacation =
                    pathPrefix === "/calories" && vacationBlocksCaloriesQuick
                  return (
                    <Link
                      key={item.href}
                      href={logMealVacation ? "#" : item.href}
                      aria-disabled={logMealVacation}
                      onClick={(e) => {
                        if (logMealVacation) {
                          e.preventDefault()
                          return
                        }
                        close()
                      }}
                      className={cn(
                        "relative flex touch-manipulation items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[11px] font-medium tracking-wide transition-colors duration-150 sm:text-xs",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                        logMealVacation && "cursor-not-allowed opacity-40",
                        open &&
                          "motion-safe:animate-nav-dock-item motion-reduce:opacity-100 motion-reduce:transform-none"
                      )}
                      style={
                        open
                          ? { animationDelay: `${40 + idx * 40}ms` }
                          : undefined
                      }
                      title={logMealVacation ? "Calories paused (vacation mode)" : undefined}
                    >
                      {isActive && (
                        <span className="pointer-events-none absolute inset-0.5 rounded-md bg-grid-accent-dim/60" />
                      )}
                      {item.avatarSrc ? (
                        <img
                          src={item.avatarSrc}
                          alt=""
                          className="relative h-4 w-4 shrink-0 rounded-full object-cover sm:h-[1.05rem] sm:w-[1.05rem]"
                          width={32}
                          height={32}
                          decoding="async"
                        />
                      ) : (
                        <item.icon
                          className="relative h-4 w-4 shrink-0 sm:h-[1.05rem] sm:w-[1.05rem]"
                          strokeWidth={isActive ? 2.1 : 1.65}
                          aria-hidden
                        />
                      )}
                      <span className="relative">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>

            <div
              className={cn(
                "h-px shrink-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent transition-opacity duration-300 motion-reduce:transition-none",
                open ? "opacity-100" : "opacity-0"
              )}
            />

            <div className="flex min-w-0 flex-row-reverse">
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-controls={`${quickPanelId} ${panelId}`}
                className={cn(
                  "relative z-[1] flex h-16 w-14 shrink-0 touch-manipulation flex-col items-center justify-center gap-0.5 border-border/40 text-muted-foreground transition-colors duration-200",
                  "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  open && "border-l border-white/10 bg-grid-accent-dim/30 text-primary"
                )}
              >
                {open ? (
                  <ChevronRight
                    className="h-6 w-6 motion-safe:transition-transform motion-safe:duration-500 motion-safe:[transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]"
                    strokeWidth={2}
                    aria-hidden
                  />
                ) : (
                  <Menu className="h-6 w-6" strokeWidth={1.8} aria-hidden />
                )}
                <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
              </button>

              <div
                id={panelId}
                className={cn(
                  "motion-safe:transition-[max-width,opacity] motion-safe:duration-500 motion-reduce:transition-none",
                  open ? "max-w-[var(--dock-w)] opacity-100" : "max-w-0 opacity-0"
                )}
                style={
                  {
                    "--dock-w": PANEL_WIDTH,
                    transitionTimingFunction: DOCK_EASE,
                  } as CSSProperties
                }
              >
                <div
                  className="h-16 w-[min(calc(100vw-5.25rem),42rem)] min-w-[min(calc(100vw-5.25rem),42rem)]"
                  style={{ pointerEvents: open ? "auto" : "none" }}
                >
                  <div className="grid h-16 grid-cols-5 items-stretch px-0.5">
                    {navItems.map((item, idx) => {
                      const isActive =
                        item.href === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => {
                            close()
                            if (item.href === "/") {
                              window.dispatchEvent(
                                new CustomEvent(HUB_RESET_OVERVIEW_EVENT)
                              )
                            }
                          }}
                          className={cn(
                            "relative flex min-h-0 min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-[10px] font-medium tracking-[0.15em] uppercase transition-colors duration-150 sm:text-[11px]",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground hover:text-foreground",
                            open &&
                              "motion-safe:animate-nav-dock-item motion-reduce:opacity-100 motion-reduce:transform-none"
                          )}
                          style={
                            open
                              ? { animationDelay: `${80 + idx * 48}ms` }
                              : undefined
                          }
                        >
                          {isActive && (
                            <span className="pointer-events-none absolute inset-1 rounded-md bg-grid-accent-dim animate-nav-indicator" />
                          )}
                          <span
                            className={`relative flex h-6 w-6 shrink-0 items-center justify-center transition-transform duration-200 sm:h-5 sm:w-5 lg:h-6 lg:w-6 ${isActive ? "scale-110" : ""}`}
                          >
                            <item.icon
                              className="h-6 w-6 sm:h-5 sm:w-5 lg:h-6 lg:w-6"
                              strokeWidth={isActive ? 2.2 : 1.6}
                              aria-hidden
                            />
                          </span>
                          <span className="relative max-w-full truncate">
                            {item.label}
                          </span>
                          {isActive && (
                            <span className="absolute bottom-1.5 left-1/2 h-px w-4 -translate-x-1/2 bg-primary/50 animate-nav-indicator" />
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </>
  )
}
