"use client"

import { Suspense, type ReactNode } from "react"
import { DateProvider } from "@/context/DateContext"
import { ProfileDialogProvider } from "@/context/ProfileDialogContext"
import { UserProvider } from "@/context/UserContext"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <UserProvider>
        <ProfileDialogProvider>
          <DateProvider>{children}</DateProvider>
        </ProfileDialogProvider>
      </UserProvider>
    </Suspense>
  )
}
