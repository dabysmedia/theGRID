import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, inputMode, ...props }: React.ComponentProps<"input">) {
  const tabular =
    type === "number" ||
    type === "time" ||
    type === "datetime-local" ||
    type === "date"
  const resolvedInputMode =
    inputMode ?? (type === "number" ? "decimal" : undefined)
  return (
    <InputPrimitive
      type={type}
      inputMode={resolvedInputMode}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-[3px] border border-glass-border bg-glass-highlight/30 px-3 py-2 text-base font-sans tracking-normal backdrop-blur-sm transition-all outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/60 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-glass-highlight/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm",
        tabular && "tabular-nums",
        className
      )}
      {...props}
    />
  )
}

export { Input }
