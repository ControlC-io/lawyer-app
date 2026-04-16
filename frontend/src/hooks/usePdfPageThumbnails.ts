import { useEffect, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

export const THUMB_WIDTH_DEFAULT = 108;
export const THUMB_WIDTH_MIN = 64;
export const THUMB_WIDTH_MAX = 720;

export function usePdfPageThumbnails(
  pdfUrl: string | null,
  pageCount: number,
  thumbWidth: number = THUMB_WIDTH_DEFAULT,
) {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const w = Math.min(THUMB_WIDTH_MAX, Math.max(THUMB_WIDTH_MIN, Math.round(thumbWidth)));

  useEffect(() => {
    if (!pdfUrl || pageCount <= 0) {
      setThumbnails({});
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setThumbnails({});

    (async () => {
      try {
        const loadingTask = getDocument({ url: pdfUrl, withCredentials: false });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        const count = Math.min(pageCount, numPages);

        for (let p = 1; p <= count; p++) {
          if (cancelled) return;
          const page = await pdf.getPage(p);
          const base = page.getViewport({ scale: 1 });
          const scale = w / base.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          if (!cancelled) {
            setThumbnails((prev) => ({ ...prev, [p]: dataUrl }));
          }
        }
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl, pageCount, w]);

  return { thumbnails, loading, error, thumbWidth: w };
}
