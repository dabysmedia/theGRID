"use client"

import { Suspense, type ReactNode } from "react"
import { DateProvider } from "@/context/DateContext"
import { FullscreenOverlayProvider } from "@/context/FullscreenOverlayContext"
import { ProfileDialogProvider } from "@/context/ProfileDialogContext"
import { QuickLogProvider } from "@/context/QuickLogContext"
import { UserProvider } from "@/context/UserContext"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <UserProvider>
        <ProfileDialogProvider>
          <DateProvider>
            <QuickLogProvider>
              <FullscreenOverlayProvider>{children}</FullscreenOverlayProvider>
            </QuickLogProvider>
          </DateProvider>
        </ProfileDialogProvider>
      </UserProvider>
    </Suspense>
  )
}
