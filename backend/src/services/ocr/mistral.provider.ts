import fetch from 'node-fetch';
import type { OcrProvider, OcrResult } from './types';

const RETRY_DELAYS = [1000, 3000, 9000];
const TIMEOUT_MS = 120_000;

export class MistralOcrProvider implements OcrProvider {
  name = 'mistral';

  async process(fileBuffer: Buffer, mimeType: string, fileName: string): Promise<OcrResult> {
    const apiKey = process.env.OCR_API_KEY;
    if (!apiKey) throw new Error('OCR API key not configured');

    const model = process.env.OCR_MODEL || 'mistral-ocr-latest';
    const apiUrl = process.env.OCR_API_URL || 'https://api.mistral.ai/v1/ocr';
    const base64Data = fileBuffer.toString('base64');

    const body = JSON.stringify({
      model,
      document: {
        type: 'document_url',
        document_url: `data:${mimeType};base64,${base64Data}`,
      },
      include_image_base64: false,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
          signal: controller.signal as any,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json() as { pages: Array<{ index: number; markdown: string }> };
          const markdown = data.pages.map((p) => p.markdown).join('\n\n---\n\n');
          return { markdown, pagesProcessed: data.pages.length, provider: 'mistral', model };
        }

        if (response.status === 401 || response.status === 403) {
          throw new Error('OCR authentication failed. Check OCR_API_KEY.');
        }

        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`OCR API returned ${response.status}: ${response.statusText}`);
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
            continue;
          }
        } else {
          const text = await response.text();
          throw new Error(`OCR request failed with status ${response.status}: ${text}`);
        }
      } catch (err) {
        clearTimeout(timeout);
        if ((err as Error).message?.includes('OCR authentication failed')) throw err;
        if ((err as Error).name === 'AbortError') {
          throw new Error('OCR request timed out after 120 seconds');
        }
        lastError = err as Error;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
      }
    }

    throw new Error(`OCR request failed after 3 retries: ${lastError?.message}`);
  }
}
