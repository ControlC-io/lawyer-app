import { MistralOcrProvider } from './mistral.provider';
import type { OcrProvider } from './types';

const providers: Record<string, () => OcrProvider> = {
  mistral: () => new MistralOcrProvider(),
};

export function getOcrProvider(): OcrProvider {
  const name = process.env.OCR_PROVIDER || 'mistral';
  const factory = providers[name];
  if (!factory) throw new Error(`Unknown OCR provider: ${name}`);
  return factory();
}

export type { OcrProvider, OcrResult } from './types';
