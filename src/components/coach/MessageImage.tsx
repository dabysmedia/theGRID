"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface MessageImageProps {
  src: string
  alt?: string
  className?: string
}

export function MessageImage({ src, alt, className }: MessageImageProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative block overflow-hidden rounded-xl border border-glass-border bg-glass-highlight/30 outline-none transition-all hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/40",
          className
        )}
        aria-label="Expand image"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? "Attached image"}
          className="block h-32 w-32 object-cover transition-transform duration-200 group-hover:scale-[1.02] sm:h-40 sm:w-40"
        />
      </button>

      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close image preview"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt ?? "Attached image"}
            className="max-h-full max-w-full rounded-xl shadow-2xl"
          />
        </button>
      )}
    </>
  )
}
