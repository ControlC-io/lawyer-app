import { api } from "@/lib/api";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type FileOcrPollPayload = {
  ocrStatus: string;
  ocrError?: string | null;
  metadataAiExtractStatus?: string | null;
  metadataAiExtractError?: string | null;
};

/** Poll GET /api/files/:fileId/ocr until completed or failed. */
export async function pollOcrUntilDone(
  fileId: string,
  options?: { maxAttempts?: number; intervalMs?: number; timeoutMessage?: string },
) {
  const maxAttempts = options?.maxAttempts ?? 180;
  const intervalMs = options?.intervalMs ?? 2000;
  for (let i = 0; i < maxAttempts; i++) {
    const result = await api.get<{
      ocrStatus: string;
      ocrError?: string | null;
    }>(`/api/files/${fileId}/ocr`);
    if (result.ocrStatus === "completed") return;
    if (result.ocrStatus === "failed") {
      throw new Error(result.ocrError || "OCR failed");
    }
    await sleep(intervalMs);
  }
  throw new Error(options?.timeoutMessage ?? "OCR timed out");
}

/** Poll until OCR finishes; if AI extraction was requested, wait until extract reaches a terminal state too. */
export async function pollFileImportUntilDone(
  fileId: string,
  wantsExtract: boolean,
  options?: {
    maxAttempts?: number;
    intervalMs?: number;
    timeoutMessage?: string;
    onTick?: (payload: FileOcrPollPayload) => void;
  },
) {
  const maxAttempts = options?.maxAttempts ?? 240;
  const intervalMs = options?.intervalMs ?? 2000;
  for (let i = 0; i < maxAttempts; i++) {
    const result = await api.get<FileOcrPollPayload>(`/api/files/${fileId}/ocr`);
    options?.onTick?.(result);

    if (result.ocrStatus === "failed") {
      throw new Error(result.ocrError || "OCR failed");
    }

    if (result.ocrStatus === "completed") {
      if (!wantsExtract) return;
      const ex = result.metadataAiExtractStatus;
      if (ex === "completed" || ex === "failed") {
        if (ex === "failed" && result.metadataAiExtractError) {
          throw new Error(result.metadataAiExtractError);
        }
        return;
      }
      if (ex === null || ex === undefined) {
        return;
      }
    }

    await sleep(intervalMs);
  }
  throw new Error(options?.timeoutMessage ?? "Processing timed out");
}
