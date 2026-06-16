export interface SplitReviewState {
  fileId: string;
  segments: {
    name: string;
    document_type_id?: string;
    person_id?: string;
    metadata?: Record<string, string>;
    start_page: number;
    end_page: number;
  }[];
  totalPages: number;
  savedAt: number;
}

export interface ProcessRecord {
  id: string;
  fileId: string | null;
  type: "split";
  status: "processing" | "review" | "completed" | "failed";
  filename: string;
  createdAt: number;
  updatedAt: number;
  reviewState?: SplitReviewState;
  error?: string;
}

const STORAGE_KEY = "process-history";
const MAX_ENTRIES = 50;
const EXPIRY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export function getProcessHistory(): ProcessRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProcessRecord[];
    const now = Date.now();
    return parsed
      .filter((r) => r && r.id && now - (r.createdAt ?? 0) < EXPIRY_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function saveHistory(records: ProcessRecord[]) {
  const trimmed = records.slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function upsertProcessRecord(record: ProcessRecord): void {
  const all = getProcessHistory();
  const idx = all.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    all[idx] = record;
  } else {
    all.unshift(record);
  }
  saveHistory(all.sort((a, b) => b.updatedAt - a.updatedAt));
}

export function updateProcessRecord(id: string, updates: Partial<ProcessRecord>): void {
  const all = getProcessHistory();
  const idx = all.findIndex((r) => r.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates, updatedAt: Date.now() };
    saveHistory(all);
  }
}

export function updateProcessRecordByFileId(fileId: string, updates: Partial<ProcessRecord>): void {
  const all = getProcessHistory();
  const idx = all.findIndex((r) => r.fileId === fileId);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates, updatedAt: Date.now() };
    saveHistory(all);
  }
}

export function removeProcessRecord(id: string): void {
  const all = getProcessHistory().filter((r) => r.id !== id);
  saveHistory(all);
}

export function clearFinishedProcesses(): void {
  const all = getProcessHistory().filter((r) => r.status === "processing" || r.status === "review");
  saveHistory(all);
}

export function generateProcessId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
