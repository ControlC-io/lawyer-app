const PAGE_SEPARATOR = '\n\n---\n\n';

/**
 * Concatenates per-page OCR markdown. For multi-page documents, prefixes each
 * page with a heading indicating its position in the original PDF.
 */
export function joinOcrMarkdownPages(pages: Array<{ markdown: string }>): string {
  const total = pages.length;
  if (total <= 1) {
    return pages[0]?.markdown ?? '';
  }
  return pages
    .map((p, i) => `#Page ${i + 1} over ${total}\n\n${p.markdown}`)
    .join(PAGE_SEPARATOR);
}
