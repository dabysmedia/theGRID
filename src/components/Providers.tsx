"use client"

import { Suspense, type ReactNode } from "react"
import { DateProvider } from "@/context/DateContext"
import { FullscreenOverlayProvider } from "@/context/FullscreenOverlayContext"
import { ProfileDialogProvider } from "@/context/ProfileDialogContext"
import { QuickLogProvider } from "@/context/QuickLogContext"
import { UserProvider } from "@/context/UserContext"
import { ActiveWorkoutGuard } from "@/components/ActiveWorkoutGuard"
import { GoogleHealthAutoSync } from "@/components/GoogleHealthAutoSync"
import { ViewportHeightSync } from "@/components/ViewportHeightSync"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <ViewportHeightSync />
      <UserProvider>
        <GoogleHealthAutoSync />
        <ProfileDialogProvider>
          <DateProvider>
            <QuickLogProvider>
              <FullscreenOverlayProvider>
                <ActiveWorkoutGuard>{children}</ActiveWorkoutGuard>
              </FullscreenOverlayProvider>
            </QuickLogProvider>
          </DateProvider>
        </ProfileDialogProvider>
      </UserProvider>
    </Suspense>
  )
}
