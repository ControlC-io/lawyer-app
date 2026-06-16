# Testing Strategy

This document describes the testing approach for the Dossier project. Backend and frontend testing are kept separate: each has its own stack, conventions, and location.

---

## Backend testing

Backend tests live in the Express API (`backend/`) and focus on **API endpoints**: request/response shapes, status codes, and behaviour with mocked dependencies (no real database or external services).

### What we use

| Tool | Purpose |
|------|--------|
| **Jest** | Test runner and assertions |
| **ts-jest** | TypeScript support for Jest |
| **Supertest** | HTTP assertions against the Express app (no server listen) |

### Where tests live

- **Location:** `backend/src/tests/`
- **Pattern:** `**/tests/**/*.test.ts`
- **Setup:** `backend/src/tests/setup.ts` runs before each test file (global mocks and env).

### How it works

1. **App without listening**  
   The Express app is built in `backend/src/app.ts` and imported by `backend/src/index.ts`. Tests import the same `app` and pass it to Supertest, so no port is bound and tests run in process.

2. **Shared Prisma client**  
   All database access goes through `backend/src/lib/prisma.ts`. In tests, `jest.mock('../lib/prisma')` (or the appropriate path) replaces this with a mock. Each test file mocks only the Prisma methods it needs (e.g. `user.findUnique`, `workflow.create`) and sets return values in `beforeEach`.

3. **Service mocks**  
   External behaviour is mocked so tests don’t call real APIs or storage:
   - **Storage** (`storage.service.ts`): upload, download, signed URLs, file stat — mocked per test or in setup.
   - **AI / Email:** mocked in `setup.ts` or in individual test files when a test needs to assert on calls.

4. **Auth in tests**  
   - **API key:** set `x-api-key` and mock `prisma.company.findUnique` to return a company (and optionally `is_active: false` for 403 cases).
   - **JWT:** create a token with `jwt.sign({ userId }, process.env.JWT_SECRET)` and set `Authorization: Bearer <token>`, and mock `prisma.user.findUnique` where the controller uses it.

### Test layout by area

Current suites (19 files, all under `backend/src/tests/`):

| File | Coverage |
|------|----------|
| `auth.test.ts` | Register, login; success and error cases (e.g. duplicate user, invalid credentials). |
| `auth.middleware.test.ts` | `authMiddleware` credential resolution: JWT vs company `x-api-key` vs `x-super-admin-api-key`, precedence, and rejection paths. |
| `users.test.ts` | `GET /api/users/:userId` (API key auth, profile + companies). |
| `companies.branding.test.ts` | Company branding: get/update org, logo upload/remove, primary color. |
| `companies.folders.test.ts` | List/get folders (401/200/403 by access); folder permissions GET/POST/DELETE (admin, root-only); list files (403/200); by-metadata (200 with fileIds, 400 when metadata_id missing). |
| `documentAccess.test.ts` | Metadata-condition document permission rules: rule matching and per-user virtual tree resolution. |
| `folderAccess.test.ts` | `getRootFolderId`, `getUserGroupIdsInCompany`, `canUserAccessFolder` (admin, public root, user/group permission). |
| `splitPdfPresets.test.ts` | Document-type preset CRUD (`/documents/split-pdf-presets`): list/create/update/delete with auth + validation. |
| `splitPdfAuto.test.ts` | Auto split (`/documents/split-pdf/auto`): OCR → Gemini segments → file creation with `FilesMetadataValue` written per segment. |
| `ocr.test.ts` | OCR endpoints (`POST/GET /files/:fileId/ocr`): trigger, status, error paths. |
| `ocr.service.test.ts` | `processDocumentOcr` orchestration with mocked provider + pending-metadata chaining. |
| `metadata-from-ocr-extraction.service.test.ts` | `extractAndApplyMetadataFromOcr`: Gemini extraction, validation against allowed values, persistence, optional rename. |
| `mistral.provider.test.ts` | Mistral OCR provider adapter with mocked HTTP. |
| `files-metadata-validation.test.ts` | `validateMetadataValueForKey` / `parseAllowedValuesJson` (free_text vs predefined_list). |
| `fileHistory.test.ts` | `appendFileHistoryEvent` event recording. |
| `notifications.test.ts` | Notification endpoints (JWT): missing/invalid input, not found, success with recipients, 401 unauthorized. |
| `public.test.ts` | `GET /api/public/config` (signup flag) and `GET /api/health` (DB connectivity). |
| `validation.middleware.test.ts` | express-validator wrapper middleware behaviour. |
| `email.service.test.ts` | Smoke test that `emailService` is mocked in test env and exposes the expected interface. |

Controller API tests include error-path and auth cases (401 missing API key, 403/404 not found or access denied) in addition to happy-path coverage.

### Running backend tests

From the backend directory:

```bash
cd backend
npm test
```

Run tests with coverage (report in terminal + `backend/coverage/`):

```bash
npm run test:coverage
```

Run a single suite or file:

```bash
npm test src/tests/auth.test.ts
npm test -- --testPathPattern=workflow
```

### Coverage

Jest collects coverage for `src/**/*.ts` (excluding `src/tests/` and `.d.ts`). Use `npm run test:coverage` to get:

- **Terminal:** per-file and summary (statements, branches, functions, lines).
- **HTML:** `backend/coverage/index.html` for a browseable report.

Thresholds in `backend/jest.config.js` enforce minimum global coverage; the build fails if coverage drops below them. Raise the values as you add tests.

### Configuration

- **Jest config:** `backend/jest.config.js`  
  - Preset `ts-jest`, environment `node`, `testMatch`: `**/tests/**/*.test.ts`, `setupFilesAfterEnv` pointing at `src/tests/setup.ts`.
  - Coverage: `coverageDirectory`, `collectCoverageFrom`, `coverageReporters` (text, text-summary, html), and `coverageThreshold` for global minimums.
- **Module mapping:** `@yourapp/shared` is mapped to `../shared/src/index.ts` so shared code resolves in tests.

---

## Frontend testing

*(To be documented when the frontend testing strategy is defined.)*

Frontend tests will be described in a dedicated subsection here, including:

- Framework and runner (e.g. Vitest, Jest, React Testing Library)
- Where tests live (e.g. `frontend/src/**/*.test.tsx` or `__tests__/`)
- How the UI and API are tested (components, hooks, mocks for `fetch` or API client)
- How to run frontend tests and any scripts from the repo root

This keeps backend and frontend testing clearly separated in one place.
