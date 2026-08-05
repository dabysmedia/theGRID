"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { cn } from "@/lib/utils"

/** Default hub UI morph: quick enough for touch, long enough to read. */
export const HUB_MOTION_MS = 680

/** Larger Overview shared-element motion. */
export const HUB_SECTION_MOTION_MS = 780

/** Soft launch with the same settled character as the Water / Planner morphs. */
export const HUB_MOTION_EASING = "cubic-bezier(0.22, 0.7, 0.18, 1)"

export type HubMotionRect = Pick<DOMRect, "left" | "top" | "width" | "height">

type HubMotionDelta = {
  x: number
  y: number
  scaleX: number
  scaleY: number
}

/** Pure FLIP geometry, exported so the no-layout-per-frame contract is testable. */
export function getHubMotionDelta(
  from: HubMotionRect,
  to: HubMotionRect,
): HubMotionDelta {
  return {
    x: from.left - to.left,
    y: from.top - to.top,
    scaleX: to.width > 0 ? from.width / to.width : 1,
    scaleY: to.height > 0 ? from.height / to.height : 1,
  }
}

export function readHubMotionRect(node: Element | null): HubMotionRect | null {
  if (!node) return null
  const { left, top, width, height } = node.getBoundingClientRect()
  if (width <= 0 || height <= 0) return null
  return { left, top, width, height }
}

function reducedMotionRequested(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function playMeasuredMotion(
  node: HTMLElement,
  from: HubMotionRect,
  to: HubMotionRect,
  {
    durationMs,
    delayMs,
    scale,
  }: {
    durationMs: number
    delayMs: number
    scale: boolean
  },
): Animation | null {
  if (reducedMotionRequested()) return null
  const delta = getHubMotionDelta(from, to)
  if (
    Math.abs(delta.x) < 0.5 &&
    Math.abs(delta.y) < 0.5 &&
    (!scale ||
      (Math.abs(delta.scaleX - 1) < 0.005 &&
        Math.abs(delta.scaleY - 1) < 0.005))
  ) {
    return null
  }

  if (typeof node.animate !== "function") return null
  const animation = node.animate(
    [
      {
        transform: `translate3d(${delta.x}px, ${delta.y}px, 0)${
          scale ? ` scale(${delta.scaleX}, ${delta.scaleY})` : ""
        }`,
      },
      { transform: "translate3d(0, 0, 0) scale(1, 1)" },
    ],
    {
      duration: durationMs,
      delay: delayMs,
      easing: HUB_MOTION_EASING,
      fill: "both",
    },
  )
  animation.addEventListener("finish", () => animation.cancel(), { once: true })
  return animation
}

/**
 * FLIP a persistent hub element between two stable layouts. Layout changes once;
 * the visible movement is then handled entirely by the compositor.
 */
export function useHubMeasuredMorph<T extends HTMLElement>(
  layoutKey: string,
  {
    durationMs = HUB_SECTION_MOTION_MS,
    delayMs = 0,
    scale = false,
  }: {
    durationMs?: number
    delayMs?: number
    scale?: boolean
  } = {},
) {
  const nodeRef = useRef<T>(null)
  const previousRectRef = useRef<HubMotionRect | null>(null)
  const animationRef = useRef<Animation | null>(null)
  const previousKeyRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const node = nodeRef.current
    const keyChanged =
      previousKeyRef.current != null && previousKeyRef.current !== layoutKey

    // Data can resolve while a first-open morph is still running. Preserve the
    // compositor animation instead of treating that unrelated render as a new
    // geometry change.
    if (!keyChanged && animationRef.current?.playState === "running") return

    const nextRect = readHubMotionRect(node)
    if (!node || !nextRect) return

    const previousRect = previousRectRef.current
    previousRectRef.current = nextRect
    previousKeyRef.current = layoutKey
    if (keyChanged) {
      animationRef.current?.cancel()
      animationRef.current = previousRect
        ? playMeasuredMotion(node, previousRect, nextRect, {
            durationMs,
            delayMs,
            scale,
          })
        : null
    }
  }, [delayMs, durationMs, layoutKey, scale])

  useEffect(() => {
    const node = nodeRef.current
    if (!node || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      if (animationRef.current?.playState === "running") return
      previousRectRef.current = readHubMotionRect(node)
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
      animationRef.current?.cancel()
    }
  }, [])

  return nodeRef
}

/** Morph a newly mounted element from a captured source rectangle. */
export function useHubOriginMorph<T extends HTMLElement>(
  origin: HubMotionRect | null,
  motionKey: string,
  {
    durationMs = HUB_SECTION_MOTION_MS,
    delayMs = 0,
    scale = true,
  }: {
    durationMs?: number
    delayMs?: number
    scale?: boolean
  } = {},
) {
  const nodeRef = useRef<T>(null)

  useLayoutEffect(() => {
    const node = nodeRef.current
    const target = readHubMotionRect(node)
    if (!node || !target || !origin) return
    const animation = playMeasuredMotion(node, origin, target, {
      durationMs,
      delayMs,
      scale,
    })
    return () => animation?.cancel()
  }, [delayMs, durationMs, motionKey, origin, scale])

  return nodeRef
}

/** Height collapse reserved for small nested accordions, not Overview scenes. */
export function HubCollapse({
  open,
  children,
  className,
  durationMs = HUB_MOTION_MS,
}: {
  open: boolean
  children: React.ReactNode
  className?: string
  durationMs?: number
}) {
  return (
    <div
      className={cn(
        "grid motion-reduce:transition-none",
        open
          ? "grid-rows-[1fr] opacity-100"
          : "pointer-events-none grid-rows-[0fr] opacity-0",
        className,
      )}
      style={{
        transitionProperty: "grid-template-rows, opacity, margin",
        transitionDuration: `${durationMs}ms`,
        transitionTimingFunction: HUB_MOTION_EASING,
      }}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/**
 * Heavy focus panels mount directly in their final layout. Their child groups
 * own entrance choreography; the shared source element carries the exit.
 */
export function HubPresence({
  open,
  children,
  className,
  durationMs = HUB_MOTION_MS,
}: {
  open: boolean
  children: React.ReactNode
  className?: string
  durationMs?: number
}) {
  if (!open) return null

  return (
    <div
      data-hub-presence=""
      className={className}
      style={{ "--hub-presence-duration": `${durationMs}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
