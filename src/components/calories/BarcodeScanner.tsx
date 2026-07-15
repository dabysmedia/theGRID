"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Flashlight, Keyboard, Loader2, ScanBarcode, X } from "lucide-react"
import type { IScannerControls } from "@zxing/browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface BarcodeScannerProps {
  onClose: () => void
  onDetected: (barcode: string) => void
}

function cameraMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError") return "Camera access was blocked. Allow camera access or enter the barcode below."
  if (name === "NotFoundError") return "No camera was found on this device. Enter the barcode below instead."
  if (name === "NotReadableError") return "The camera is being used by another app. Close it there and try again."
  return "The camera could not start. You can still enter the barcode below."
}

export function BarcodeScanner({ onClose, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const handledRef = useRef(false)
  const [status, setStatus] = useState<"starting" | "scanning" | "found" | "error">("starting")
  const [error, setError] = useState<string | null>(null)
  const [manualBarcode, setManualBarcode] = useState("")
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  const finish = useCallback((rawBarcode: string, controls?: IScannerControls) => {
    const barcode = rawBarcode.replace(/\D/g, "")
    if (!/^\d{4,18}$/.test(barcode) || handledRef.current) return

    handledRef.current = true
    controls?.stop()
    controlsRef.current?.stop()
    setStatus("found")
    if ("vibrate" in navigator) navigator.vibrate(60)
    window.setTimeout(() => onDetected(barcode), 220)
  }, [onDetected])

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera requires a secure context")
      }

      const { BrowserMultiFormatReader } = await import("@zxing/browser")
      if (cancelled || !videoRef.current) return

      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result, _scanError, scannerControls) => {
          if (result) finish(result.getText(), scannerControls)
        },
      )

      if (cancelled) {
        controls.stop()
        return
      }
      controlsRef.current = controls
      setTorchAvailable(Boolean(controls.switchTorch))
      setStatus("scanning")
    }

    void startCamera().catch((cameraError: unknown) => {
      if (cancelled) return
      setError(cameraMessage(cameraError))
      setStatus("error")
    })

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [finish])

  async function toggleTorch() {
    const next = !torchOn
    try {
      await controlsRef.current?.switchTorch?.(next)
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  function submitManual(event: React.FormEvent) {
    event.preventDefault()
    finish(manualBarcode)
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/80 p-2 backdrop-blur-md sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
        className="glass-strong w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/10 shadow-[0_28px_90px_rgba(0,0,0,0.75)]"
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <ScanBarcode className="size-4.5" />
            </span>
            <div>
              <h2 id="barcode-scanner-title" className="text-sm font-semibold">Scan a barcode</h2>
              <p className="text-[10px] text-muted-foreground/55">Powered by Open Food Facts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close barcode scanner"
            className="flex size-10 items-center justify-center rounded-xl text-muted-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground touch-manipulation"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <div className="p-3.5">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="size-full object-cover"
              aria-label="Camera preview"
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,transparent_44%,rgba(0,0,0,0.5)_72%)]" />
            <div className="pointer-events-none absolute inset-x-[10%] top-1/2 aspect-[2.25/1] -translate-y-1/2 rounded-2xl border border-primary/65 shadow-[0_0_0_999px_rgba(0,0,0,0.16),inset_0_0_24px_rgba(200,255,0,0.08)]">
              <i className="barcode-scan-line absolute inset-x-3 h-px bg-primary shadow-[0_0_12px_2px_rgba(200,255,0,0.75)]" />
              <span className="absolute -left-px -top-px size-6 rounded-tl-2xl border-l-2 border-t-2 border-primary" />
              <span className="absolute -right-px -top-px size-6 rounded-tr-2xl border-r-2 border-t-2 border-primary" />
              <span className="absolute -bottom-px -left-px size-6 rounded-bl-2xl border-b-2 border-l-2 border-primary" />
              <span className="absolute -bottom-px -right-px size-6 rounded-br-2xl border-b-2 border-r-2 border-primary" />
            </div>

            {status === "starting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span className="text-xs font-medium">Starting camera…</span>
              </div>
            )}
            {status === "found" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-primary/20 text-white backdrop-blur-sm">
                <span className="flex size-14 items-center justify-center rounded-full bg-primary text-xl font-black text-primary-foreground">✓</span>
                <span className="text-sm font-semibold">Barcode found</span>
              </div>
            )}
            {status === "error" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-8 text-center">
                <p className="text-xs leading-relaxed text-white/70">{error}</p>
              </div>
            )}

            {torchAvailable && status === "scanning" && (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                className="absolute bottom-3 right-3 flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-md touch-manipulation"
                aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
              >
                <Flashlight className={`size-4.5 ${torchOn ? "fill-primary text-primary" : ""}`} />
              </button>
            )}
          </div>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground/65">
            Center the package barcode inside the frame. It will scan automatically.
          </p>

          <div className="my-3 flex items-center gap-2">
            <span className="h-px flex-1 bg-white/[0.07]" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/40">or enter it</span>
            <span className="h-px flex-1 bg-white/[0.07]" />
          </div>

          <form onSubmit={submitManual} className="flex gap-2 pb-[max(0rem,env(safe-area-inset-bottom))]">
            <div className="relative min-w-0 flex-1">
              <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/45" />
              <Input
                value={manualBarcode}
                onChange={(event) => setManualBarcode(event.target.value.replace(/\D/g, "").slice(0, 18))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="UPC / EAN number"
                aria-label="Barcode number"
                className="h-12 border-white/10 bg-black/25 pl-9 text-base tabular-nums tracking-[0.08em]"
              />
            </div>
            <Button
              type="submit"
              variant="glass"
              className="h-12 px-5"
              disabled={!/^\d{4,18}$/.test(manualBarcode)}
            >
              Look up
            </Button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  )
}

