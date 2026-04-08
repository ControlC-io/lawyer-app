import { useEffect, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

const DEFAULT_MAX_WIDTH = 720;

export function usePdfPageLargePreview(
  pdfUrl: string | null,
  page: number,
  enabled: boolean,
  maxWidth = DEFAULT_MAX_WIDTH,
) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || !pdfUrl || page < 1) {
      setDataUrl(null);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setDataUrl(null);

    (async () => {
      try {
        const loadingTask = getDocument({ url: pdfUrl, withCredentials: false });
        const pdf = await loadingTask.promise;
        if (page > pdf.numPages) {
          if (!cancelled) setError(true);
          return;
        }
        const pg = await pdf.getPage(page);
        const base = pg.getViewport({ scale: 1 });
        const scale = maxWidth / base.width;
        const viewport = pg.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          if (!cancelled) setError(true);
          return;
        }
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await pg.render({ canvasContext: ctx, viewport }).promise;
        const url = canvas.toDataURL("image/jpeg", 0.88);
        if (!cancelled) {
          setDataUrl(url);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setDataUrl(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl, page, enabled, maxWidth]);

  return { dataUrl, loading, error };
}
