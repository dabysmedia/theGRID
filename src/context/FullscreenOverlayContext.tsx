"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type FullscreenOverlayContextValue = {
  fullscreen: boolean
  setFullscreen: (value: boolean) => void
}

const FullscreenOverlayContext = createContext<FullscreenOverlayContextValue | null>(
  null,
)

export function FullscreenOverlayProvider({ children }: { children: ReactNode }) {
  const [fullscreen, setFullscreenState] = useState(false)
  const setFullscreen = useCallback((value: boolean) => {
    setFullscreenState(value)
  }, [])
  const value = useMemo(
    () => ({ fullscreen, setFullscreen }),
    [fullscreen, setFullscreen],
  )
  return (
    <FullscreenOverlayContext.Provider value={value}>
      {children}
    </FullscreenOverlayContext.Provider>
  )
}

export function useFullscreenOverlay() {
  const ctx = useContext(FullscreenOverlayContext)
  if (!ctx) {
    throw new Error("useFullscreenOverlay must be used within FullscreenOverlayProvider")
  }
  return ctx
}
