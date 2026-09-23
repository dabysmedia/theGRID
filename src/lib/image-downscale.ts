/**
 * Shrink a camera photo before upload. A 48 MP iPhone frame can exceed the
 * 10 MB journal limit and takes seconds to send over gym Wi‑Fi; 2048 px on the
 * long edge is plenty for a progress photo. Browsers apply EXIF orientation
 * when decoding into an <img>, so the canvas copy comes out upright.
 */
export async function downscaleImageFile(
  file: File,
  { maxEdge = 2048, quality = 0.86 }: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return file
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("decode failed"))
      el.src = url
    })
    const longEdge = Math.max(image.naturalWidth, image.naturalHeight)
    if (!longEdge) return file
    const scale = Math.min(1, maxEdge / longEdge)
    if (scale === 1 && file.size < 2.5 * 1024 * 1024 && file.type === "image/jpeg") return file
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    )
    if (!blob) return file
    const originalUploadable = /^image\/(jpeg|png|webp|gif)$/.test(file.type)
    if (originalUploadable && blob.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, "") || "progress"
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() })
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}
