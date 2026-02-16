import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const DOCUMENT_TOKEN_EXPIRY = 5 * 60; // 5 minutes

/**
 * Public base URL of the API (no trailing slash).
 * Used so document URLs work in production (not localhost:3001).
 */
export function getApiBaseUrl(): string {
  const base = process.env.BACKEND_URL || process.env.APP_URL || 'http://localhost:3001';
  return base.replace(/\/$/, '');
}

/**
 * Returns a full URL that proxies through GET /api/files/document?token=...
 * Use this for any document in the documents bucket so clients never see MinIO internal URLs.
 */
export function getDocumentProxyUrl(path: string, download = false): string {
  const token = jwt.sign(
    { path, download },
    JWT_SECRET,
    { expiresIn: DOCUMENT_TOKEN_EXPIRY }
  );
  const pathPart = `/api/files/document?token=${encodeURIComponent(token)}`;
  return `${getApiBaseUrl()}${pathPart}`;
}
