/**
 * A problem photo or screenshot for the AI (26.59, D162): read from a paste, a drop or a file, scaled so its longer
 * side is at most 1600 px and encoded as JPEG (about 0.2–0.6 MB), as a data URL.
 */
export async function imageToDataUrl(file: Blob, maxSide = 1600, quality = 0.85): Promise<string> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  return canvas.toDataURL('image/jpeg', quality)
}

/** The first image file of a paste or drop, if any. */
export function imageFrom(items: DataTransferItemList | FileList | null | undefined): File | null {
  if (!items) return null
  for (const it of Array.from(items as ArrayLike<DataTransferItem | File>)) {
    if (it instanceof File) { if (it.type.startsWith('image/')) return it; continue }
    if (it.kind === 'file' && it.type.startsWith('image/')) return it.getAsFile()
  }
  return null
}
