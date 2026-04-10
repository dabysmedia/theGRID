"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Cropper, { type Area } from "react-easy-crop"
import { canvasCropToSquareBlob } from "@/lib/avatar-crop"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const OUTPUT_PX = 512

type AvatarCropDialogProps = {
  open: boolean
  imageSrc: string | null
  onOpenChange: (open: boolean) => void
  /** Return true when the cropped image was saved successfully. */
  onCropped: (blob: Blob) => Promise<boolean>
}

export function AvatarCropDialog({
  open,
  imageSrc,
  onOpenChange,
  onCropped,
}: AvatarCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const pixelsRef = useRef<Area | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  useEffect(() => {
    if (!open) return
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    pixelsRef.current = null
    setErr("")
    setSaving(false)
  }, [open, imageSrc])

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    pixelsRef.current = areaPixels
  }, [])

  const handleSave = useCallback(async () => {
    if (!imageSrc) return
    const pixels = pixelsRef.current
    if (!pixels) {
      setErr("Adjust the image slightly, then try again.")
      return
    }
    setSaving(true)
    setErr("")
    try {
      const blob = await canvasCropToSquareBlob(imageSrc, pixels, OUTPUT_PX, "image/jpeg", 0.92)
      const ok = await onCropped(blob)
      if (ok) onOpenChange(false)
    } catch {
      setErr("Could not process image. Try another file.")
    } finally {
      setSaving(false)
    }
  }, [imageSrc, onCropped, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "glass-frost w-[min(100%,calc(100vw-1rem))] max-w-md max-h-[min(92dvh,calc(100dvh-1rem))]",
          "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3"
        )}
        showCloseButton={!saving}
      >
        <DialogHeader>
          <DialogTitle>Adjust photo</DialogTitle>
          <DialogDescription>
            Drag to reposition, pinch or scroll to zoom. Output is a {OUTPUT_PX}×{OUTPUT_PX} square.
          </DialogDescription>
        </DialogHeader>

        {imageSrc && (
          <div className="space-y-3">
            <div className="relative mx-auto aspect-square w-full max-h-[min(55dvh,320px)] overflow-hidden rounded-2xl bg-black/40 ring-1 ring-border/40">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="space-y-1.5 px-0.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Zoom
              </label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-primary"
                disabled={saving}
              />
            </div>
          </div>
        )}

        {err && <p className="text-xs text-red-400">{err}</p>}

        <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving || !imageSrc} onClick={handleSave}>
            {saving ? "Saving…" : "Use photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
