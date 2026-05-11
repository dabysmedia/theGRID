"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home } from "lucide-react"
import { DatePicker } from "@/components/DatePicker"
import { ProfileHeaderTrigger } from "@/context/ProfileDialogContext"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
}

export function PageHeader({ title }: PageHeaderProps) {
  const pathname = usePathname()
  const isHome = pathname === "/"

  return (
    <header className="animate-fade-up">
      <div className="flex items-start gap-2.5 sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Link
              href="/"
              aria-label="Home"
              title="Home"
              aria-current={isHome ? "page" : undefined}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full ring-1 transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                isHome
                  ? "bg-glass-highlight/25 ring-primary/40 text-primary"
                  : "ring-border/50 text-muted-foreground hover:ring-primary/35 hover:text-foreground press-scale",
              )}
            >
              <Home className="size-[18px]" aria-hidden strokeWidth={2} />
            </Link>
            <h1 className="font-kelly-slab min-w-0 flex-1 text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl sm:leading-none">
              <span className="text-gradient-glass title-underline-accent block truncate">
                {title}
              </span>
            </h1>
          </div>

          <DatePicker />
        </div>

        <div className="flex shrink-0 items-start gap-2 sm:gap-2.5">
          <ProfileHeaderTrigger />
        </div>
      </div>
    </header>
  )
}
