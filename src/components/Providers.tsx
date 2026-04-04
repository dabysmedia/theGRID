"use client"

import { Suspense, type ReactNode } from "react"
import { DateProvider } from "@/context/DateContext"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <DateProvider>{children}</DateProvider>
    </Suspense>
  )
}
