/**
 * Generate PDF from a DOM element using html2canvas + jsPDF
 * and share it via WhatsApp.
 */

/**
 * Generate a PDF blob from a DOM element
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  fileName: string
): Promise<Blob> {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const { jsPDF } = await import('jspdf');

  // A5 size: 148mm x 210mm
  const pdf = new jsPDF('p', 'mm', 'a5');
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  const margin = 3;
  const cw = pdfW - margin * 2;
  const ih = (canvas.height * cw) / canvas.width;
  const maxH = pdfH - margin * 2;

  let fw = cw;
  let fh = ih;
  if (fh > maxH) {
    fw = (maxH * cw) / ih;
    fh = maxH;
  }

  pdf.addImage(imgData, 'JPEG', margin + (cw - fw) / 2, margin, fw, fh);

  // Return as blob
  const blob = pdf.output('blob');
  return blob;
}

/**
 * Generate PDF from element and share via WhatsApp.
 * - On mobile: uses Web Share API (allows sharing files to WhatsApp)
 * - On desktop: downloads the PDF, then opens WhatsApp with text message
 */
export async function sharePdfViaWhatsApp(
  element: HTMLElement,
  fileName: string,
  documentLabel: string,
  waWindowRef?: React.MutableRefObject<Window | null>
): Promise<void> {
  const blob = await generatePdfFromElement(element, fileName);
  const file = new File([blob], fileName, { type: 'application/pdf' });

  // Check if Web Share API with file support is available (mobile)
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        text: `Dokumen ${documentLabel} - www.darrellsoft.com`,
      });
      return;
    } catch (err: unknown) {
      // User cancelled share or share failed - fallback to download + WhatsApp text
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  // Fallback for desktop: download PDF + open WhatsApp with text
  // Download the PDF
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Open WhatsApp with text message
  const msg = `Dokumen ${documentLabel} dalam format PDF sudah diunduh. Silakan lampirkan file PDF tersebut.`;
  const encoded = encodeURIComponent(msg);

  const { openWhatsApp } = await import('@/lib/whatsapp-business');
  openWhatsApp(encoded, waWindowRef ? { waWindowRef } : undefined);
}
