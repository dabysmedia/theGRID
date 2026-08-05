"use client"

import { Suspense, type ReactNode } from "react"
import { DateProvider } from "@/context/DateContext"
import { FullscreenOverlayProvider } from "@/context/FullscreenOverlayContext"
import { ProfileDialogProvider } from "@/context/ProfileDialogContext"
import { QuickLogProvider } from "@/context/QuickLogContext"
import { UserProvider } from "@/context/UserContext"
import { WorkoutPlannerProvider } from "@/context/WorkoutPlannerContext"
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
            <WorkoutPlannerProvider>
              <QuickLogProvider>
                <FullscreenOverlayProvider>
                  {children}
                </FullscreenOverlayProvider>
              </QuickLogProvider>
            </WorkoutPlannerProvider>
          </DateProvider>
        </ProfileDialogProvider>
      </UserProvider>
    </Suspense>
  )
}
