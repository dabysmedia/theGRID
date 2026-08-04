"use client"

import { useEffect, type ReactNode } from "react"

const REVEAL_SELECTOR = [
  ".animate-fade-up",
  ".animate-scale-in",
  ".animate-chart-wipe",
  ".animate-bar-grow",
  '[class*="motion-safe:animate-fade-up"]',
].join(",")

/**
 * Reveals entrance motion when an element first reaches the viewport.
 * A MutationObserver also enrolls content revealed by accordions/dialogs after load.
 * Elements stay revealed after their first entrance so scrolling never restarts a
 * large batch of transitions or keeps unnecessary intersection targets alive.
 */
export function MotionOrchestrator({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      document.documentElement.hasAttribute("data-ios-standalone")
    if (standalone || reducedMotion.matches || !("IntersectionObserver" in window)) {
      document.querySelectorAll(REVEAL_SELECTOR).forEach((element) => {
        element.setAttribute("data-motion-visible", "")
      })
      document.documentElement.dataset.motionReady = "true"
      return
    }

    const enrolled = new WeakSet<Element>()
    const observedTargets = new WeakSet<Element>()
    const revealsByTarget = new WeakMap<Element, Set<Element>>()
    const intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const reveals = revealsByTarget.get(entry.target)
          for (const reveal of reveals ?? [entry.target]) {
            reveal.setAttribute("data-motion-visible", "")
          }
          intersection.unobserve(entry.target)
          observedTargets.delete(entry.target)
        }
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -3% 0px",
      },
    )

    const enroll = (root: ParentNode) => {
      const candidates = [
        ...(root instanceof Element && root.matches(REVEAL_SELECTOR) ? [root] : []),
        ...root.querySelectorAll(REVEAL_SELECTOR),
      ]
      for (const candidate of candidates) {
        if (enrolled.has(candidate)) continue
        enrolled.add(candidate)

        // A scaleY(0) bar has no intersection area. Observe its fixed-height
        // wrapper, then apply visibility to the animated child.
        const target = candidate.classList.contains("animate-bar-grow")
          ? candidate.parentElement?.parentElement?.parentElement ?? candidate
          : candidate
        const reveals = revealsByTarget.get(target) ?? new Set<Element>()
        reveals.add(candidate)
        revealsByTarget.set(target, reveals)
        if (!observedTargets.has(target)) {
          observedTargets.add(target)
          intersection.observe(target)
        }
      }
    }

    enroll(document)
    document.documentElement.dataset.motionReady = "true"

    const pendingRoots = new Set<Element>()
    let mutationFrame = 0
    const flushPendingRoots = () => {
      mutationFrame = 0
      for (const root of pendingRoots) enroll(root)
      pendingRoots.clear()
    }
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) pendingRoots.add(node)
        }
      }
      if (pendingRoots.size > 0 && !mutationFrame) {
        mutationFrame = requestAnimationFrame(flushPendingRoots)
      }
    })
    mutations.observe(document.body, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(mutationFrame)
      pendingRoots.clear()
      mutations.disconnect()
      intersection.disconnect()
      delete document.documentElement.dataset.motionReady
    }
  }, [])

  return children
}
