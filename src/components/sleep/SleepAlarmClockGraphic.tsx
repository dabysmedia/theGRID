"use client"

import { cn } from "@/lib/utils"

export const SLEEP_ALARM_CLOCK_IMAGE = "/images/sleep-alarm-clock.png"

export function SleepAlarmClockGraphic({
  timeMain,
  meridiem,
  className,
  size = "lg",
}: {
  timeMain: string
  meridiem?: string
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const boxClass =
    size === "lg"
      ? "h-[7.25rem] w-full max-w-[9.5rem] origin-center scale-[1.1] sm:h-[7.75rem] sm:max-w-[10rem]"
      : size === "md"
        ? "h-[4.75rem] w-[4.75rem]"
        : "h-12 w-12"

  const timeClass =
    size === "lg"
      ? "text-[1.45rem] sm:text-[1.6rem]"
      : size === "md"
        ? "text-base"
        : "text-[11px]"

  const meridiemClass =
    size === "lg"
      ? "text-[11px] sm:text-[12px]"
      : size === "md"
        ? "text-[9px]"
        : "text-[7px]"

  return (
    <div className={cn("relative mx-auto shrink-0", boxClass, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- transparent PNG; next/image optimizer can flatten alpha */}
      <img
        src={SLEEP_ALARM_CLOCK_IMAGE}
        alt=""
        className="absolute inset-0 h-full w-full object-contain object-center"
        draggable={false}
      />
      <div
        className="absolute flex items-baseline justify-center gap-1 text-center"
        style={{
          left: "16.5%",
          right: "16.5%",
          top: "35.5%",
          bottom: "35.5%",
        }}
      >
        <p
          className={cn(
            "font-semibold tabular-nums leading-none tracking-tight text-[#1a1a18]",
            timeClass
          )}
        >
          {timeMain}
        </p>
        {meridiem && (
          <p
            className={cn(
              "font-medium uppercase tracking-[0.1em] text-[#2a2a26]/85",
              meridiemClass
            )}
          >
            {meridiem}
          </p>
        )}
      </div>
    </div>
  )
}
