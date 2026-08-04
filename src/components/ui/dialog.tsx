"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

export interface DialogMotionOrigin {
  left: number
  top: number
  width: number
  height: number
}

/** Capture a trigger-relative starting point for an opt-in spatial dialog morph. */
export function getDialogMotionOrigin(
  source: HTMLElement | null,
): DialogMotionOrigin | undefined {
  if (!source || typeof window === "undefined") return undefined
  const rect = source.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-[110] bg-black/25 duration-100 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  priority = "normal",
  motionOrigin,
  motionProfile,
  motionOpen,
  style,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  /** Use above fullscreen overlays (e.g. active workout at z-120). */
  priority?: "normal" | "high"
  /** Opt into a trigger-origin entrance/exit instead of the generic modal fade. */
  motionOrigin?: DialogMotionOrigin
  /** Optional choreography profile layered over the shared source morph. */
  motionProfile?: "planner"
  /** Remeasure a dynamic surface before its close animation starts. */
  motionOpen?: boolean
}) {
  const layer = priority === "high" ? "z-[130]" : "z-[110]"
  const motionFrame = React.useRef(0)
  const motionNode = React.useRef<HTMLDivElement | null>(null)
  const motionTargetCenter = React.useRef<{ x: number; y: number } | null>(null)
  const setMotionGeometry = React.useCallback(
    (node: HTMLDivElement, captureTargetCenter = false) => {
      if (!motionOrigin || typeof window === "undefined") return

      const targetWidth = Math.max(1, node.offsetWidth)
      const targetHeight = Math.max(1, node.offsetHeight)
      const sourceCenterX = motionOrigin.left + motionOrigin.width / 2
      const sourceCenterY = motionOrigin.top + motionOrigin.height / 2
      let targetCenterX = window.innerWidth / 2
      let targetCenterY = window.innerHeight / 2

      // A cold installed-iOS launch can briefly disagree about innerHeight,
      // 100vh, and the fixed containing block. Planner also grows when its
      // first data requests resolve. Measure the actual resting popup instead
      // of assuming the CSS-safe-area center equals window.innerHeight / 2.
      if (motionProfile === "planner") {
        if (captureTargetCenter || !motionTargetCenter.current) {
          const targetRect = node.getBoundingClientRect()
          motionTargetCenter.current = {
            x: targetRect.left + targetRect.width / 2,
            y: targetRect.top + targetRect.height / 2,
          }
        }
        targetCenterX = motionTargetCenter.current.x
        targetCenterY = motionTargetCenter.current.y
      }

      node.style.setProperty(
        "--dialog-motion-x",
        `${sourceCenterX - targetCenterX}px`,
      )
      node.style.setProperty(
        "--dialog-motion-y",
        `${sourceCenterY - targetCenterY}px`,
      )
      node.style.setProperty(
        "--dialog-motion-scale-x",
        String(Math.max(0.08, Math.min(0.98, motionOrigin.width / targetWidth))),
      )
      node.style.setProperty(
        "--dialog-motion-scale-y",
        String(Math.max(0.04, Math.min(0.98, motionOrigin.height / targetHeight))),
      )
    },
    [motionOrigin, motionProfile],
  )
  const setMotionNode = React.useCallback(
    (node: HTMLDivElement | null) => {
      cancelAnimationFrame(motionFrame.current)
      motionNode.current = node
      if (!node || !motionOrigin) return

      node.removeAttribute("data-motion-ready")
      setMotionGeometry(node, true)
      motionFrame.current = requestAnimationFrame(() => {
        if (motionProfile === "planner") {
          // Let WebKit resolve the portal, safe-area height, and flex content
          // before freezing first-open geometry and starting the compositor
          // animation. Water's proven single-frame path stays unchanged.
          motionFrame.current = requestAnimationFrame(() => {
            setMotionGeometry(node, true)
            node.setAttribute("data-motion-ready", "")
          })
          return
        }
        node.setAttribute("data-motion-ready", "")
      })
    },
    [motionOrigin, motionProfile, setMotionGeometry],
  )

  React.useLayoutEffect(() => {
    if (motionOpen !== false || !motionNode.current) return
    setMotionGeometry(motionNode.current)
  }, [motionOpen, setMotionGeometry])

  React.useEffect(
    () => () => cancelAnimationFrame(motionFrame.current),
    [],
  )

  return (
    <DialogPortal>
      <DialogOverlay
        className={cn(
          layer,
          motionOrigin && "dialog-spatial-overlay",
          motionProfile === "planner" && "dialog-spatial-overlay--planner",
        )}
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-spatial-motion={motionOrigin ? "" : undefined}
        data-motion-profile={motionProfile}
        className={cn(
          "glass-frost fixed grid w-full max-w-none gap-4 rounded-2xl p-4 pb-[max(1rem,calc(0.75rem+env(safe-area-inset-bottom)))] text-sm text-foreground outline-none duration-100",
          layer,
          "overflow-y-auto overscroll-contain",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className
        )}
        style={style}
        {...props}
        ref={setMotionNode}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-2xl border-t border-border/30 bg-background/70 p-4 backdrop-blur-md sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
