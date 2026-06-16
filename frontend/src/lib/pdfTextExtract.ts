import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

/** Minimum average characters per page to consider a PDF as having native text. */
const MIN_AVG_CHARS_PER_PAGE = 30;

/**
 * Attempt to extract embedded text from a native PDF (e.g. Word export, digital invoice).
 * Returns formatted markdown-style text if the PDF has sufficient embedded text,
 * or null if the PDF appears to be scanned (OCR required).
 */
export async function extractNativePdfText(file: File): Promise<string | null> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const pageTexts: string[] = [];
  let totalChars = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();
    pageTexts.push(`# Page ${i} of ${pdf.numPages}\n${text}`);
    totalChars += text.length;
  }

  if (pdf.numPages === 0 || totalChars / pdf.numPages < MIN_AVG_CHARS_PER_PAGE) return null;
  return pageTexts.join("\n\n");
}
