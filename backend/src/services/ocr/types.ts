export interface OcrResult {
  markdown: string;
  pagesProcessed: number;
  provider: string;
  model: string;
}

export interface OcrProvider {
  name: string;
  process(fileBuffer: Buffer, mimeType: string, fileName: string): Promise<OcrResult>;
}
