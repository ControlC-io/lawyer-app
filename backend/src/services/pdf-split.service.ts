import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFDocument } from 'pdf-lib';

export interface SplitSegment {
  name: string;
  /** Values keyed by `files_metadata_keys.id` (UUID strings). */
  metadata?: Record<string, string>;
  start_page: number;
  end_page: number;
}

/** Max chars sent to Gemini (OCR can be huge); tail is preserved for recency. */
const MAX_OCR_CHARS = 900_000;

export function parseGeminiJsonArray(raw: string): unknown {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m;
  const m = s.match(fence);
  if (m) s = m[1].trim();
  else if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(s);
}

/** Strip markdown fences and parse a single JSON object (not array). */
export function parseGeminiJsonObject(raw: string): unknown {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m;
  const m = s.match(fence);
  if (m) s = m[1].trim();
  else if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(s);
}

function parseMetadataObject(
  raw: unknown,
  requiredKeyIds: string[] | undefined,
): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string') parsed[k] = v;
      else if (v != null && (typeof v === 'number' || typeof v === 'boolean')) parsed[k] = String(v);
    }
  }
  if (!requiredKeyIds?.length) return parsed;
  const allowed = new Set(requiredKeyIds);
  const normalized: Record<string, string> = {};
  for (const id of requiredKeyIds) {
    const val = parsed[id];
    normalized[id] = typeof val === 'string' ? val.trim() : '';
  }
  for (const k of Object.keys(parsed)) {
    if (!allowed.has(k)) {
      throw new Error(`Unknown metadata key in segment: ${k}`);
    }
  }
  return normalized;
}

export function validateSegments(segments: unknown, requiredMetadataKeyIds?: string[]): SplitSegment[] {
  if (!Array.isArray(segments)) throw new Error('Expected JSON array');
  const out: SplitSegment[] = [];
  for (const item of segments) {
    if (!item || typeof item !== 'object') throw new Error('Invalid segment');
    const o = item as Record<string, unknown>;
    if (typeof o.name !== 'string' || !o.name.trim()) throw new Error('Each segment needs a non-empty name');
    const startRaw = o.start_page;
    const endRaw = o.end_page;
    const start =
      typeof startRaw === 'number' ? startRaw : typeof startRaw === 'string' ? Number(startRaw) : NaN;
    const end = typeof endRaw === 'number' ? endRaw : typeof endRaw === 'string' ? Number(endRaw) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error('start_page and end_page must be numbers');
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error('Page numbers must be integers');
    }
    const metadata = parseMetadataObject(o.metadata, requiredMetadataKeyIds);
    const requireMeta = Boolean(requiredMetadataKeyIds?.length);
    const hasMeta = requireMeta || Object.keys(metadata).length > 0;
    out.push({
      name: o.name.trim(),
      ...(hasMeta ? { metadata } : {}),
      start_page: start,
      end_page: end,
    });
  }
  if (out.length === 0) throw new Error('At least one segment is required');
  return out;
}

export function truncateOcr(ocrMarkdown: string): string {
  if (ocrMarkdown.length <= MAX_OCR_CHARS) return ocrMarkdown;
  const head = Math.floor(MAX_OCR_CHARS * 0.85);
  const tail = MAX_OCR_CHARS - head - 80;
  return (
    ocrMarkdown.slice(0, head) +
    '\n\n[... middle of OCR omitted due to length ...]\n\n' +
    ocrMarkdown.slice(-tail)
  );
}

export type ProposeMetadataKeySpec = {
  id: string;
  name: string | null;
  valueKind: 'free_text' | 'predefined_list';
  allowedValues: string[];
};

export async function proposeSplitWithGemini(params: {
  ocrMarkdown: string;
  metadataKeys: ProposeMetadataKeySpec[];
  namingInstructions: string;
  currentDate: string;
}): Promise<SplitSegment[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  if (!params.metadataKeys.length) throw new Error('At least one metadata key is required');

  const ocrBody = truncateOcr(params.ocrMarkdown);

  const keyLines = params.metadataKeys.map((k) => {
    const label = (k.name && k.name.trim()) || 'Unnamed field';
    if (k.valueKind === 'predefined_list' && k.allowedValues.length > 0) {
      const opts = k.allowedValues.map((v) => JSON.stringify(v)).join(', ');
      return `- JSON key ${JSON.stringify(k.id)} (${label}, predefined_list): value MUST be exactly one of: ${opts}`;
    }
    return `- JSON key ${JSON.stringify(k.id)} (${label}, free_text): short extracted string (empty if unknown)`;
  });

  const idsJson = JSON.stringify(params.metadataKeys.map((k) => k.id));

  const prompt = `You are a data extraction agent. You analyze OCR text from a multi-page PDF and propose how to split it into separate logical documents.

For EACH output segment you MUST fill a "metadata" object. Use these keys exactly (UUID strings as JSON keys):
${keyLines.join('\n')}

The set of metadata key ids is: ${idsJson}

Additional instructions for file naming and extraction (follow as much as the OCR allows):
${params.namingInstructions}

Rules:
- Answer with ONLY a JSON array. No markdown fences, no commentary.
- Each element MUST have this shape: {"name":"string","metadata":{...},"start_page":number,"end_page":number}
- "name" is the suggested output PDF base name (no path; .pdf will be added later). Use metadata where helpful.
- "metadata" MUST include every id listed above. Values are strings.
- start_page and end_page are 1-based inclusive page indices in the original PDF.
- The OCR uses headings like "#Page N over M" — use these to determine boundaries.
- Segments must not overlap and should cover all relevant pages (gaps are allowed if the user instructions imply skipping).
- Reference date (yyyy-mm-dd): ${params.currentDate}

OCR text:
${ocrBody}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = parseGeminiJsonArray(text);
  const ids = params.metadataKeys.map((k) => k.id);
  return validateSegments(parsed, ids);
}

/**
 * Extract metadata values for one document from OCR markdown (single JSON object, UUID keys).
 */
export async function extractMetadataFromOcrWithGemini(params: {
  ocrMarkdown: string;
  metadataKeys: ProposeMetadataKeySpec[];
  currentDate: string;
}): Promise<Record<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  if (!params.metadataKeys.length) throw new Error('At least one metadata key is required');

  const ocrBody = truncateOcr(params.ocrMarkdown);

  const keyLines = params.metadataKeys.map((k) => {
    const label = (k.name && k.name.trim()) || 'Unnamed field';
    if (k.valueKind === 'predefined_list' && k.allowedValues.length > 0) {
      const opts = k.allowedValues.map((v) => JSON.stringify(v)).join(', ');
      return `- JSON key ${JSON.stringify(k.id)} (${label}, predefined_list): value MUST be exactly one of: ${opts}`;
    }
    return `- JSON key ${JSON.stringify(k.id)} (${label}, free_text): short extracted string (empty string "" if unknown)`;
  });

  const idsJson = JSON.stringify(params.metadataKeys.map((k) => k.id));

  const prompt = `You are a data extraction agent. You read OCR text from a document and fill metadata fields.

Return ONLY one JSON object (not an array). Use these keys exactly (UUID strings as JSON property names):
${keyLines.join('\n')}

The set of metadata key ids is: ${idsJson}

Rules:
- Answer with ONLY the JSON object. No markdown fences, no commentary.
- Every id listed above MUST appear as a property. Values are strings.
- Use empty string "" when the value cannot be determined from the OCR.
- Reference date (yyyy-mm-dd) for interpreting relative dates: ${params.currentDate}

OCR text:
${ocrBody}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = parseGeminiJsonObject(text);
  const ids = params.metadataKeys.map((k) => k.id);
  return parseMetadataObject(parsed, ids);
}

/**
 * Propose a renamed file base name from OCR + user instructions.
 * Returns a plain string (no path). Extension handling is performed by caller.
 */
export async function proposeFileNameFromOcrWithGemini(params: {
  ocrMarkdown: string;
  currentFileName: string;
  renameInstructions: string;
  currentDate: string;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  const ocrBody = truncateOcr(params.ocrMarkdown);

  const prompt = `You rename a single document based on OCR text and user instructions.

Current file name:
${JSON.stringify(params.currentFileName)}

User instructions for renaming:
${params.renameInstructions}

Rules:
- Return ONLY one JSON object: {"name":"..."}.
- "name" must be a concise descriptive file base name (no folders, no path separators).
- Do not include an extension.
- Use ASCII characters when possible.
- If uncertain, still provide your best short descriptive name.
- Reference date (yyyy-mm-dd): ${params.currentDate}

OCR text:
${ocrBody}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = parseGeminiJsonObject(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid rename response format');
  }
  const name = (parsed as { name?: unknown }).name;
  if (typeof name !== 'string') {
    throw new Error('Rename response must include a string name');
  }
  return name.trim();
}

export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  return pdfDoc.getPageCount();
}

export async function applyPdfSplit(
  pdfBuffer: Buffer,
  segments: SplitSegment[],
): Promise<Array<{ buffer: Buffer; suggestedFileName: string }>> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();

  const sorted = [...segments].sort((a, b) => a.start_page - b.start_page);
  for (const s of sorted) {
    if (s.start_page < 1 || s.end_page < s.start_page || s.end_page > pageCount) {
      throw new Error(
        `Invalid page range for "${s.name}": pages ${s.start_page}–${s.end_page} (PDF has ${pageCount} page(s))`,
      );
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start_page <= sorted[i - 1].end_page) {
      throw new Error(`Overlapping segments: "${sorted[i - 1].name}" and "${sorted[i].name}"`);
    }
  }

  const results: Array<{ buffer: Buffer; suggestedFileName: string }> = [];
  for (const s of segments) {
    const newPdf = await PDFDocument.create();
    const zeroBased: number[] = [];
    for (let p = s.start_page; p <= s.end_page; p++) {
      zeroBased.push(p - 1);
    }
    const copied = await newPdf.copyPages(pdfDoc, zeroBased);
    copied.forEach((page) => newPdf.addPage(page));
    const buf = Buffer.from(await newPdf.save());
    const baseName = s.name.replace(/\.pdf$/i, '').trim() || 'split';
    results.push({ buffer: buf, suggestedFileName: `${baseName}.pdf` });
  }
  return results;
}
