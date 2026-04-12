"use client"

import type { ReactNode } from "react"
import { BottomNav } from "@/components/BottomNav"
import { useFullscreenOverlay } from "@/context/FullscreenOverlayContext"
import { cn } from "@/lib/utils"

/** Root shell: main column padding + bottom nav, coordinated with fullscreen overlays. */
export function AppChrome({ children }: { children: ReactNode }) {
  const { fullscreen } = useFullscreenOverlay()

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <main
        className={cn(
          "mx-auto flex w-full max-w-full flex-1 flex-col",
          "ps-[max(0.75rem,env(safe-area-inset-left,0px))] pe-[max(0.75rem,env(safe-area-inset-right,0px))]",
          "pt-[calc(env(safe-area-inset-top,0px)+2rem)]",
          fullscreen
            ? "pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
            : "pb-[calc(6rem+env(safe-area-inset-bottom,0px))]",
          "sm:ps-4 sm:pe-4 md:ps-6 md:pe-6",
          "md:max-w-2xl lg:max-w-3xl xl:max-w-5xl",
          "lg:px-8 xl:px-10",
          "animate-fade-in",
        )}
      >
        {children}
      </main>
      {!fullscreen && <BottomNav />}
    </div>
  )
}
