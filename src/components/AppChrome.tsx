"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { BottomNav } from "@/components/BottomNav"
import { PageFooter } from "@/components/PageFooter"
import { useFullscreenOverlay } from "@/context/FullscreenOverlayContext"
import { isAgentPublicPath } from "@/lib/agent/public-routes"
import { cn } from "@/lib/utils"

/** Root shell: main column padding + bottom nav, coordinated with fullscreen overlays. */
export function AppChrome({ children }: { children: ReactNode }) {
  const { fullscreen } = useFullscreenOverlay()
  const pathname = usePathname()
  const agentPublic = isAgentPublicPath(pathname)
  const isHub = pathname === "/"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main
        className={cn(
          "mx-auto flex w-full max-w-full min-h-0 flex-1 flex-col",
          "ps-[max(0.75rem,env(safe-area-inset-left,0px))] pe-[max(0.75rem,env(safe-area-inset-right,0px))]",
          "pt-[var(--app-chrome-top)]",
          fullscreen || agentPublic
            ? "pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
            : "pb-0",
          "sm:ps-4 sm:pe-4 md:ps-6 md:pe-6",
          "md:max-w-2xl lg:max-w-3xl xl:max-w-5xl",
          "lg:px-8 xl:px-10",
          "animate-fade-in",
        )}
      >
        {children}
        {!fullscreen && !agentPublic && <PageFooter dockOnly={isHub} />}
      </main>
      {!fullscreen && !agentPublic && <BottomNav />}
    </div>
  )
}
