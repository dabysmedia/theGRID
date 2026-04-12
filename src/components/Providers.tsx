"use client"

import { Suspense, type ReactNode } from "react"
import { DateProvider } from "@/context/DateContext"
import { FullscreenOverlayProvider } from "@/context/FullscreenOverlayContext"
import { ProfileDialogProvider } from "@/context/ProfileDialogContext"
import { UserProvider } from "@/context/UserContext"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <UserProvider>
        <ProfileDialogProvider>
          <DateProvider>
            <FullscreenOverlayProvider>{children}</FullscreenOverlayProvider>
          </DateProvider>
        </ProfileDialogProvider>
      </UserProvider>
    </Suspense>
  )
}
