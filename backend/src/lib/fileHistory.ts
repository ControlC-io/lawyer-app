import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { SUPER_ADMIN_API_USER_ID } from '../middleware/auth';

/** Stored in `file_history_events.event_type` — keep in sync with UI labels. */
export const FILE_HISTORY_EVENT_TYPE = {
  FILE_UPLOADED: 'file_uploaded',
  OCR_REQUESTED: 'ocr_requested',
  OCR_STARTED: 'ocr_started',
  OCR_COMPLETED: 'ocr_completed',
  OCR_FAILED: 'ocr_failed',
  METADATA_CHANGED: 'metadata_changed',
  METADATA_AI_APPLIED: 'metadata_ai_applied',
  METADATA_AI_EXTRACT_FAILED: 'metadata_ai_extract_failed',
  FILE_RENAMED: 'file_renamed',
} as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns a profile UUID suitable for `file_history_events.actor_id`, or null for System / unknown.
 */
export function normalizeFileHistoryActorId(userId: string | null | undefined): string | null {
  if (!userId || userId === SUPER_ADMIN_API_USER_ID) return null;
  if (!UUID_RE.test(userId)) return null;
  return userId;
}

export type FileHistoryMetadataChange = {
  key: string;
  keyId: string;
  action: 'add' | 'edit' | 'remove';
  previous?: string;
  next?: string;
};

export async function appendFileHistoryEvent(params: {
  companyId: string;
  fileId: string;
  eventType: string;
  actorId?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.fileHistoryEvent.create({
      data: {
        company_id: params.companyId,
        file_id: params.fileId,
        event_type: params.eventType,
        actor_id: params.actorId ?? null,
        details: params.details === undefined || params.details === null ? undefined : (params.details as Prisma.InputJsonValue),
      },
    });
  } catch (e) {
    console.error('appendFileHistoryEvent failed:', e);
  }
}
