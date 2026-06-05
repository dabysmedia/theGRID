"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { LogCaloriesDialog } from "@/components/quick-log/LogCaloriesDialog"
import { LogStepsDialog } from "@/components/quick-log/LogStepsDialog"
import { LogSleepDialog } from "@/components/quick-log/LogSleepDialog"

export type QuickLogKind = "calories" | "steps" | "sleep"

interface QuickLogContextValue {
  openQuickLog: (kind: QuickLogKind) => void
}

const QuickLogContext = createContext<QuickLogContextValue | null>(null)

export function useQuickLog(): QuickLogContextValue {
  const ctx = useContext(QuickLogContext)
  if (!ctx) throw new Error("useQuickLog must be used within QuickLogProvider")
  return ctx
}

export function QuickLogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<QuickLogKind | null>(null)

  const openQuickLog = useCallback((kind: QuickLogKind) => {
    setActive(kind)
  }, [])

  const close = useCallback(() => setActive(null), [])

  const handleSaved = useCallback(() => {
    close()
    window.dispatchEvent(new CustomEvent("grid:log-saved"))
  }, [close])

  const value = useMemo(() => ({ openQuickLog }), [openQuickLog])

  return (
    <QuickLogContext value={value}>
      {children}
      <LogCaloriesDialog
        open={active === "calories"}
        onOpenChange={(o) => !o && close()}
        onSaved={handleSaved}
      />
      <LogStepsDialog
        open={active === "steps"}
        onOpenChange={(o) => !o && close()}
        onSaved={handleSaved}
      />
      <LogSleepDialog
        open={active === "sleep"}
        onOpenChange={(o) => !o && close()}
        onSaved={handleSaved}
      />
    </QuickLogContext>
  )
}
