"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface CategoryLogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  icon?: LucideIcon
  accentColor?: string
  children: ReactNode
  /** Sticky footer content (usually the submit button). */
  footer?: ReactNode
  /** Form id when footer submit should target a form in the body. */
  formId?: string
  className?: string
}

/**
 * Full-height mobile log dialog chrome — matches Log Food:
 * gradient header, scroll body, sticky safe-area footer.
 */
export function CategoryLogDialog({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  accentColor,
  children,
  footer,
  className,
}: CategoryLogDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "glass-frost flex h-[95dvh] max-h-[95dvh] flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[90vh]",
          "w-[min(100%,calc(100vw-0.75rem))] sm:max-w-lg",
          "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3",
          className,
        )}
      >
        <div
          className="shrink-0 border-b border-border/20 bg-gradient-to-b from-primary/[0.07] to-transparent px-4 pb-3 pt-4 pr-12"
          style={
            accentColor
              ? {
                  backgroundImage: `linear-gradient(to bottom, ${accentColor}14, transparent)`,
                }
              : undefined
          }
        >
          <DialogHeader className="space-y-0">
            <DialogTitle className="flex items-center gap-2 font-heading text-lg tracking-tight">
              {Icon ? (
                <span
                  className="flex size-8 items-center justify-center rounded-xl border"
                  style={
                    accentColor
                      ? {
                          borderColor: `${accentColor}33`,
                          backgroundColor: `${accentColor}14`,
                        }
                      : undefined
                  }
                >
                  <Icon
                    className="size-4"
                    style={accentColor ? { color: accentColor } : undefined}
                    aria-hidden
                  />
                </span>
              ) : null}
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription className="type-hud-caption mt-1 normal-case text-muted-foreground/70">
                {description}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{title}</DialogDescription>
            )}
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-border/30 bg-background/70 px-4 py-3 pb-[max(0.75rem,calc(0.5rem+env(safe-area-inset-bottom)))] backdrop-blur-md">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** Primary sticky CTA used inside CategoryLogDialog footers. */
export function CategoryLogSubmitButton({
  form,
  disabled,
  children,
  className,
}: {
  form?: string
  disabled?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <Button
      type="submit"
      form={form}
      variant="glass"
      disabled={disabled}
      className={cn("h-12 w-full press-scale text-sm font-semibold touch-manipulation", className)}
    >
      {children}
    </Button>
  )
}
