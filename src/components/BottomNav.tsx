"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  PlusCircle,
  BarChart3,
  CheckSquare,
  MoreHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/log", label: "Log", icon: PlusCircle },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/habits", label: "Habits", icon: CheckSquare },
  { href: "/more", label: "More", icon: MoreHorizontal },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile: bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden animate-slide-up">
        <div className="w-full ps-[max(0.75rem,env(safe-area-inset-left,0px))] pe-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[env(safe-area-inset-bottom,0px)] sm:ps-4 sm:pe-4 md:ps-6 md:pe-6">
          <div className="glass-frost relative mb-2 rounded-2xl shadow-lg shadow-black/40 hud-corners">
            {/* Top edge glow */}
            <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
            <div className="grid h-16 grid-cols-5 items-stretch px-0.5">
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex min-h-0 min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-[10px] font-medium tracking-[0.15em] uppercase transition-colors duration-150",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {isActive && (
                      <span className="pointer-events-none absolute inset-1 rounded-md bg-grid-accent-dim animate-nav-indicator" />
                    )}
                    <span className={`relative flex h-6 w-6 shrink-0 items-center justify-center transition-transform duration-200 sm:h-5 sm:w-5 ${isActive ? "scale-110" : ""}`}>
                      <item.icon
                        className="h-6 w-6 sm:h-5 sm:w-5"
                        strokeWidth={isActive ? 2.2 : 1.6}
                        aria-hidden
                      />
                    </span>
                    <span className="relative max-w-full truncate">{item.label}</span>
                    {isActive && (
                      <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-px bg-primary/50 animate-nav-indicator" />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* Desktop: side rail */}
      <nav className="hidden lg:flex fixed left-0 top-0 bottom-0 z-50 w-[72px] xl:w-[200px] flex-col items-center xl:items-stretch border-r border-glass-border py-6 xl:py-8 xl:px-4 glass-frost">
        {/* Top glow line */}
        <div className="absolute top-0 left-2 right-2 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        <div className="mb-10 flex items-center justify-center xl:justify-start gap-2 xl:px-2">
          <div className="status-dot shrink-0" />
          <span className="hidden xl:block text-sm font-bold tracking-[0.2em] uppercase">
            the<span className="text-gradient">GRID</span>
          </span>
        </div>

        <div className="flex flex-col gap-1 flex-1 w-full">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex min-h-[2.75rem] touch-manipulation items-center justify-center xl:justify-start gap-3 rounded-xl px-3 py-2.5 text-xs font-medium tracking-[0.15em] uppercase transition-colors duration-150",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-glass-highlight/30"
                )}
              >
                {isActive && (
                  <>
                    <span className="pointer-events-none absolute inset-0 rounded-xl bg-grid-accent-dim animate-nav-indicator" />
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary/60 animate-fade-in" style={{ borderRadius: '0 2px 2px 0' }} />
                  </>
                )}
                <span className={`relative flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-200 ${isActive ? "scale-110" : ""}`}>
                  <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.6} aria-hidden />
                </span>
                <span className="relative hidden min-w-0 flex-1 truncate xl:block">
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>

        {/* System status indicator at bottom */}
        <div className="mt-auto flex items-center justify-center xl:justify-start gap-2 xl:px-3 pt-4 border-t border-glass-border">
          <div className="status-dot" />
          <span className="hidden xl:block text-[10px] tracking-[0.15em] uppercase text-muted-foreground/60">
            SYS ACTIVE
          </span>
        </div>
      </nav>
    </>
  )
}
