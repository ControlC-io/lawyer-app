import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { PDFDocument } from 'pdf-lib';

/** Gemini call resilience: mirror the Mistral OCR provider (3 attempts, backoff, per-attempt timeout). */
const GEMINI_RETRY_DELAYS = [1000, 3000, 9000];
const GEMINI_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms),
    ),
  ]);
}

function isRetriableGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b(408|409|429|500|502|503|504)\b/.test(msg) ||
    /timed out|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network|overloaded|rate.?limit|unavailable|try again/i.test(
      msg,
    )
  );
}

/** Call Gemini with retries + timeout. Returns the response text. */
async function generateContentWithRetry(model: GenerativeModel, prompt: string): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS, 'Gemini request');
      return result.response.text();
    } catch (err) {
      lastError = err;
      if (attempt < 2 && isRetriableGeminiError(err)) {
        await new Promise((r) => setTimeout(r, GEMINI_RETRY_DELAYS[attempt]));
        continue;
      }
      break;
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Gemini request failed: ${msg}`);
}

export interface SplitSegment {
  name: string;
  /** Id of the DocumentType this segment was classified as (UUID). */
  document_type_id?: string;
  /** Id of the Person this segment should be saved to (optional). */
  person_id?: string;
  /** Values keyed by `files_metadata_keys.id` (UUID strings). */
  metadata?: Record<string, string>;
  start_page: number;
  end_page: number;
}

/** Max chars sent to Gemini (OCR can be huge); tail is preserved for recency. */
const MAX_OCR_CHARS = 900_000;

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m;
  const m = s.match(fence);
  if (m) s = m[1].trim();
  else if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return s;
}

export function parseGeminiJsonArray(raw: string): unknown {
  const s = stripJsonFences(raw);
  try {
    return JSON.parse(s);
  } catch {
    throw new Error(`Gemini returned invalid JSON (expected an array): ${s.slice(0, 200)}`);
  }
}

/** Strip markdown fences and parse a single JSON object (not array). */
export function parseGeminiJsonObject(raw: string): unknown {
  const s = stripJsonFences(raw);
  try {
    return JSON.parse(s);
  } catch {
    throw new Error(`Gemini returned invalid JSON (expected an object): ${s.slice(0, 200)}`);
  }
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
      continue;
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
    const docTypeId = typeof o.document_type_id === 'string' && o.document_type_id.trim() ? o.document_type_id.trim() : undefined;
    out.push({
      name: o.name.trim(),
      ...(docTypeId ? { document_type_id: docTypeId } : {}),
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
  console.warn(
    `[pdf-split] OCR truncated before sending to Gemini: ${ocrMarkdown.length} chars -> ~${MAX_OCR_CHARS} (middle omitted). Extraction on very long documents may be incomplete.`,
  );
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

export interface DocumentTypeSpec {
  id: string;
  name: string;
  namingInstructions: string;
  metadataKeys: ProposeMetadataKeySpec[];
}

/**
 * Validate segments returned by Gemini when document types are known.
 * Requires document_type_id on each segment and validates metadata keys per type.
 */
function validateSegmentsWithTypes(
  segments: unknown,
  documentTypes: DocumentTypeSpec[],
): SplitSegment[] {
  if (!Array.isArray(segments)) throw new Error('Expected JSON array');
  const typeMap = new Map(documentTypes.map((dt) => [dt.id, dt]));
  const out: SplitSegment[] = [];
  for (const item of segments) {
    if (!item || typeof item !== 'object') throw new Error('Invalid segment');
    const o = item as Record<string, unknown>;
    if (typeof o.name !== 'string' || !o.name.trim()) throw new Error('Each segment needs a non-empty name');

    const document_type_id = typeof o.document_type_id === 'string' ? o.document_type_id.trim() : '';
    if (!document_type_id) throw new Error('Each segment must include a document_type_id');
    const docType = typeMap.get(document_type_id);
    if (!docType) throw new Error(`Unknown document_type_id in segment “${String(o.name)}”: ${document_type_id}`);

    const startRaw = o.start_page;
    const endRaw = o.end_page;
    const start = typeof startRaw === 'number' ? startRaw : typeof startRaw === 'string' ? Number(startRaw) : NaN;
    const end = typeof endRaw === 'number' ? endRaw : typeof endRaw === 'string' ? Number(endRaw) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error('start_page and end_page must be numbers');
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error('Page numbers must be integers');
    }

    const requiredKeyIds = docType.metadataKeys.map((k) => k.id);
    const metadata = parseMetadataObject(o.metadata, requiredKeyIds.length > 0 ? requiredKeyIds : undefined);
    const hasMeta = requiredKeyIds.length > 0 || Object.keys(metadata).length > 0;

    out.push({
      name: o.name.trim(),
      document_type_id,
      ...(hasMeta ? { metadata } : {}),
      start_page: start,
      end_page: end,
    });
  }
  if (out.length === 0) throw new Error('At least one segment is required');
  return out;
}

/**
 * Blank out predefined_list values Gemini proposed that are not in the allowed set,
 * using per-segment document type metadata keys.
 */
function sanitizePredefinedMetadataWithTypes(
  segments: SplitSegment[],
  documentTypes: DocumentTypeSpec[],
): SplitSegment[] {
  const typeMap = new Map(documentTypes.map((dt) => [dt.id, dt]));
  for (const seg of segments) {
    if (!seg.metadata || !seg.document_type_id) continue;
    const docType = typeMap.get(seg.document_type_id);
    if (!docType) continue;
    for (const key of docType.metadataKeys) {
      if (key.valueKind !== 'predefined_list' || key.allowedValues.length === 0) continue;
      const allowed = new Set(key.allowedValues);
      const v = seg.metadata[key.id];
      if (v && !allowed.has(v)) {
        console.warn(
          `[pdf-split] Gemini returned out-of-list value for key ${key.id} in segment “${seg.name}”: ${JSON.stringify(v)} -> cleared`,
        );
        seg.metadata[key.id] = '';
      }
    }
  }
  return segments;
}

export async function proposeSplitWithGemini(params: {
  ocrMarkdown: string;
  documentTypes: DocumentTypeSpec[];
  currentDate: string;
}): Promise<SplitSegment[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!params.documentTypes.length) throw new Error('At least one document type is required');

  const ocrBody = truncateOcr(params.ocrMarkdown);

  const typeBlocks = params.documentTypes.map((dt) => {
    const keyLines = dt.metadataKeys.map((k) => {
      const label = (k.name && k.name.trim()) || 'Unnamed field';
      if (k.valueKind === 'predefined_list' && k.allowedValues.length > 0) {
        const opts = k.allowedValues.map((v) => JSON.stringify(v)).join(', ');
        return `  - JSON key ${JSON.stringify(k.id)} (${label}, predefined_list): value MUST be exactly one of: ${opts}`;
      }
      return `  - JSON key ${JSON.stringify(k.id)} (${label}, free_text): short extracted string (empty if unknown)`;
    });

    const lines = [
      `TYPE: ${JSON.stringify(dt.name)} (id: ${JSON.stringify(dt.id)})`,
      `  Renaming instructions: ${dt.namingInstructions}`,
      keyLines.length > 0 ? `  Metadata fields:\n${keyLines.join('\n')}` : '  Metadata fields: (none)',
    ];
    return lines.join('\n');
  });

  const prompt = `You are a data extraction agent. You analyze OCR text from a multi-page PDF and propose how to split it into separate logical documents.

Available document types:

${typeBlocks.join('\n\n')}

Rules:
- Answer with ONLY a JSON array. No markdown fences, no commentary.
- Each element MUST have this shape: {“name”:”string”,”document_type_id”:”uuid”,”metadata”:{...},”start_page”:number,”end_page”:number}
- “document_type_id” MUST be the id of one of the document types listed above.
- “name” is the suggested output PDF base name (no path; .pdf will be added). Follow the renaming instructions of the identified type, substituting extracted values into the placeholders.
- “metadata” MUST include every field key listed for the identified type. Values are strings. Use empty string “” when a value cannot be determined.
- “metadata” must NOT include keys belonging to other types.
- start_page and end_page are 1-based inclusive page indices in the original PDF.
- The OCR uses headings like “#Page N over M” — use these to determine boundaries.
- Segments must not overlap and should cover all relevant pages (gaps are allowed when the content is not a recognisable document).
- Reference date (yyyy-mm-dd): ${params.currentDate}

OCR text:
${ocrBody}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const text = await generateContentWithRetry(model, prompt);
  const parsed = parseGeminiJsonArray(text);
  const segments = validateSegmentsWithTypes(parsed, params.documentTypes);
  return sanitizePredefinedMetadataWithTypes(segments, params.documentTypes);
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
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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
  const text = await generateContentWithRetry(model, prompt);
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
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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
  const text = await generateContentWithRetry(model, prompt);
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
        `Invalid page range for "${s.name}": pages ${s.start_page}â€“${s.end_page} (PDF has ${pageCount} page(s))`,
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
