"use client"

import { Suspense, type ReactNode } from "react"
import { DateProvider } from "@/context/DateContext"
import { UserProvider } from "@/context/UserContext"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <UserProvider>
        <DateProvider>{children}</DateProvider>
      </UserProvider>
    </Suspense>
  )
}
