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
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up"
      aria-label="Main navigation"
    >
      <div className="w-full ps-[max(0.75rem,env(safe-area-inset-left,0px))] pe-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[env(safe-area-inset-bottom,0px)] sm:ps-4 sm:pe-4 md:ps-6 md:pe-6">
        <div className="mx-auto w-full max-w-2xl lg:max-w-4xl">
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
                      "relative flex min-h-0 min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-[10px] font-medium tracking-[0.15em] uppercase transition-colors duration-150 sm:text-[11px]",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
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
      </div>
    </nav>
  )
}
