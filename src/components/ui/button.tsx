"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-200 outline-none select-none touch-manipulation focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85 glow-accent-sm",
        outline:
          "border-glass-border bg-glass-highlight/20 hover:bg-glass-highlight/40 hover:text-foreground backdrop-blur-sm",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-glass-highlight/30 hover:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "min-h-11 h-11 gap-2 px-4 sm:min-h-0 sm:h-9 sm:gap-1.5 sm:px-3 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 sm:has-data-[icon=inline-end]:pr-2.5 sm:has-data-[icon=inline-start]:pl-2.5",
        xs: "min-h-10 h-10 gap-1 rounded-lg px-3 text-xs sm:min-h-0 sm:h-6 sm:px-2 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 sm:has-data-[icon=inline-end]:pr-1.5 sm:has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-11 h-11 gap-1.5 rounded-lg px-3.5 text-[0.8rem] sm:min-h-0 sm:h-8 sm:gap-1 sm:px-3 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 sm:has-data-[icon=inline-end]:pr-2 sm:has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "min-h-12 h-12 gap-2 px-5 text-base sm:min-h-0 sm:h-10 sm:px-4 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 sm:has-data-[icon=inline-end]:pr-3 sm:has-data-[icon=inline-start]:pl-3",
        icon:
          "min-h-11 min-w-11 h-11 w-11 sm:min-h-0 sm:min-w-0 sm:h-9 sm:w-9 rounded-xl [&_svg:not([class*='size-'])]:size-[1.125rem] sm:[&_svg:not([class*='size-'])]:size-4",
        "icon-xs":
          "min-h-11 min-w-11 h-11 w-11 sm:min-h-0 sm:min-w-0 sm:h-6 sm:w-6 rounded-lg [&_svg:not([class*='size-'])]:size-3.5 sm:[&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "min-h-11 min-w-11 h-11 w-11 sm:min-h-0 sm:min-w-0 sm:h-7 sm:w-7 rounded-lg [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg":
          "min-h-12 min-w-12 h-12 w-12 sm:min-h-0 sm:min-w-0 sm:h-10 sm:w-10 rounded-xl [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
        type={type}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
