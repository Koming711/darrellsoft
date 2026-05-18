/**
 * Generate PDF from a DOM element using html2canvas + jsPDF
 * and share it via WhatsApp.
 */

/**
 * Generate a PDF blob from a DOM element
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options?: {
    format?: 'a4' | 'a5';
    landscape?: boolean;
  }
): Promise<Blob> {
  const format = options?.format || 'a4';
  const landscape = options?.landscape || false;

  // Clone the element to avoid modifying the original
  const clone = element.cloneNode(true) as HTMLElement;

  // Create a wrapper div with fixed dimensions for rendering
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.background = '#ffffff';
  wrapper.style.zIndex = '-1';

  // Reset transforms and set a fixed width for consistent rendering
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'top left';
  clone.style.width = format === 'a5' ? '148mm' : '210mm';
  clone.style.overflow = 'visible';

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const { jsPDF } = await import('jspdf');

    const pdf = new jsPDF({
      orientation: landscape ? 'l' : 'p',
      unit: 'mm',
      format: format,
    });

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

    const blob = pdf.output('blob');
    return blob;
  } finally {
    document.body.removeChild(wrapper);
  }
}

/**
 * Generate PDF from an HTML string by rendering it in a hidden iframe
 */
export async function generatePdfFromHtml(
  htmlContent: string,
  options?: {
    format?: 'a4' | 'a5';
    landscape?: boolean;
  }
): Promise<Blob> {
  const format = options?.format || 'a4';
  const landscape = options?.landscape || false;

  // Create a hidden iframe to render the HTML
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = format === 'a5' ? '148mm' : '210mm';
  iframe.style.height = format === 'a5' ? '210mm' : '297mm';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  document.body.appendChild(iframe);

  try {
    // Write HTML content to iframe
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.contentDocument!.open();
      iframe.contentDocument!.write(htmlContent);
      iframe.contentDocument!.close();
      // Fallback timeout in case onload doesn't fire
      setTimeout(resolve, 2000);
    });

    // Wait a bit for rendering
    await new Promise(resolve => setTimeout(resolve, 500));

    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(iframe.contentDocument!.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: format === 'a5' ? 558 : 794, // mm to px at 96dpi
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const { jsPDF } = await import('jspdf');

    const pdf = new jsPDF({
      orientation: landscape ? 'l' : 'p',
      unit: 'mm',
      format: format,
    });

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

    const blob = pdf.output('blob');
    return blob;
  } finally {
    document.body.removeChild(iframe);
  }
}

/**
 * Share a PDF blob via WhatsApp.
 * - On mobile: uses Web Share API (allows sharing files to WhatsApp)
 * - On desktop: downloads the PDF, then opens WhatsApp with text message
 */
export async function sharePdfViaWhatsApp(
  blob: Blob,
  fileName: string,
  documentLabel: string,
  waWindowRef?: React.MutableRefObject<Window | null>
): Promise<void> {
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

/**
 * Download a PDF blob
 */
export function downloadPdf(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
