/**
 * Convert PDF blob to image using pdfjs-dist.
 * 
 * Renders each page at 2x scale for good quality,
 * then combines all pages into a single tall image.
 * 
 * Supports both PNG (for clipboard) and JPG (for download).
 */

const RENDER_SCALE = 2 // 2x for good quality on mobile
const JPG_QUALITY = 0.92

async function pdfToCombinedCanvas(pdfBlob: Blob): Promise<HTMLCanvasElement> {
  // Dynamic import to avoid SSR issues
  const pdfjsLib = await import('pdfjs-dist')

  // Configure worker from CDN (avoids bundling the worker file)
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  // Load PDF from blob
  const arrayBuffer = await pdfBlob.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const numPages = pdf.numPages
  const canvases: HTMLCanvasElement[] = []
  let maxWidth = 0
  let totalHeight = 0

  // Render each page to its own canvas
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: RENDER_SCALE })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height

    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise

    canvases.push(canvas)
    maxWidth = Math.max(maxWidth, canvas.width)
    totalHeight += canvas.height

    // Add small gap between pages (except after last)
    if (i < numPages) {
      totalHeight += 10
    }
  }

  // Combine all pages into one tall canvas
  const combinedCanvas = document.createElement('canvas')
  combinedCanvas.width = maxWidth
  combinedCanvas.height = totalHeight
  const combinedCtx = combinedCanvas.getContext('2d')!

  // White background
  combinedCtx.fillStyle = '#FFFFFF'
  combinedCtx.fillRect(0, 0, maxWidth, totalHeight)

  let yOffset = 0
  for (const canvas of canvases) {
    combinedCtx.drawImage(canvas, 0, yOffset)
    yOffset += canvas.height + 10 // 10px gap between pages
  }

  return combinedCanvas
}

/**
 * Convert a PDF Blob to a PNG Blob.
 * PNG format is required for Clipboard API (navigator.clipboard.write).
 */
export async function pdfBlobToPng(pdfBlob: Blob): Promise<Blob> {
  const canvas = await pdfToCombinedCanvas(pdfBlob)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to convert canvas to PNG'))
      },
      'image/png'
    )
  })
}

/**
 * Convert a PDF Blob to a JPG Blob.
 * JPG is smaller file size, better for downloading.
 */
export async function pdfBlobToJpg(pdfBlob: Blob): Promise<Blob> {
  const canvas = await pdfToCombinedCanvas(pdfBlob)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to convert canvas to JPG'))
      },
      'image/jpeg',
      JPG_QUALITY
    )
  })
}

/**
 * Convert a PDF Blob to a PNG File (ready for Clipboard API or Web Share API).
 */
export async function pdfBlobToPngFile(
  pdfBlob: Blob,
  fileName: string
): Promise<File> {
  const pngBlob = await pdfBlobToPng(pdfBlob)
  const pngName = fileName.replace(/\.pdf$/i, '.png')
  return new File([pngBlob], pngName, { type: 'image/png' })
}

/**
 * Convert a PDF Blob to a JPG File (ready for download).
 */
export async function pdfBlobToJpgFile(
  pdfBlob: Blob,
  fileName: string
): Promise<File> {
  const jpgBlob = await pdfBlobToJpg(pdfBlob)
  const jpgName = fileName.replace(/\.pdf$/i, '.jpg')
  return new File([jpgBlob], jpgName, { type: 'image/jpeg' })
}
