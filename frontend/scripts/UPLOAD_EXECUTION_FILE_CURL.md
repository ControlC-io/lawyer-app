# Upload file to execution via API (curl)

The **upload-execution-file** Edge Function lets you attach a file to an execution, for either a **single file** field or a **multifiles** (multiple_files) field.

- **Single file field**: the field value is set to the new file path (replaces any previous file).
- **Multiple files field**: the new file is **appended** to the list (existing files are kept).

**Endpoint:** `POST {BASE_URL}/upload-execution-file`  
**Auth:** `x-api-key: <your_company_api_key>`

---

## Local development (functions never answer / hang)

If the function shows "listening on https://localhost:9999" but never responds:

1. **Use the correct URL**  
   With `supabase functions serve` (or `--port 9999`), call the function by name with no path prefix:
   ```bash
   # Correct when using: supabase functions serve --port 9999
   https://localhost:9999/upload-execution-file
   ```
   With the full stack (`supabase start`), use the gateway:
   ```bash
   http://127.0.0.1:54321/functions/v1/upload-execution-file
   ```

2. **Pass env vars**  
   The function needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Use an env file when serving:
   ```bash
   supabase functions serve --env-file supabase/.env.local
   ```
   In `supabase/.env.local` (create it, don’t commit secrets), set:
   ```
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_SERVICE_ROLE_KEY=<from: supabase status, or Dashboard > Settings > API)
   ```

3. **Check logs**  
   You should see `[upload-execution-file] Request received:` in the terminal when a request hits the function. If you don’t, the request isn’t reaching this function (wrong URL/port or wrong function).

---

## 1. Upload from a URL (file_url)

Use when the file is already hosted somewhere (e.g. public URL).

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/upload-execution-file" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "execution_id": "EXECUTION_UUID",
    "field_name": "documents",
    "file_url": "https://example.com/path/to/document.pdf",
    "file_name": "document.pdf"
  }'
```

- `file_name` and `mime_type` are optional when using `file_url` (filename can be inferred from URL).

---

## 2. Upload from local file (file_base64)

Encode the file in base64 and send it in the body. Use for local files or when you don’t have a public URL.

**Option A – with `jq` (recommended):**

```bash
# Replace placeholders and path
EXECUTION_ID="your-execution-uuid"
FIELD_NAME="documents"
FILE_PATH="./myfile.pdf"
BASE64_FILE=$(base64 < "$FILE_PATH" | tr -d '\n')

curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/upload-execution-file" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d "$(jq -n \
    --arg execution_id "$EXECUTION_ID" \
    --arg field_name "$FIELD_NAME" \
    --arg file_base64 "$BASE64_FILE" \
    --arg file_name "$(basename "$FILE_PATH")" \
    '{ execution_id: $execution_id, field_name: $field_name, file_base64: $file_base64, file_name: $file_name }')"
```

**Option B – inline base64 (no jq):**

```bash
# Encode file once, then paste into JSON
BASE64_FILE=$(base64 -i ./myfile.pdf | tr -d '\n')

curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/upload-execution-file" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d "{\"execution_id\":\"EXECUTION_UUID\",\"field_name\":\"documents\",\"file_base64\":\"$BASE64_FILE\",\"file_name\":\"myfile.pdf\"}"
```

---

## 3. Shell script wrapper

Use the script for a simpler CLI (handles both local file and URL):

```bash
chmod +x scripts/upload-execution-file-curl.sh

# From local file
./scripts/upload-execution-file-curl.sh \
  https://YOUR_PROJECT.supabase.co/functions/v1 \
  YOUR_API_KEY \
  EXECUTION_UUID \
  "documents" \
  ./myfile.pdf

# From URL
./scripts/upload-execution-file-curl.sh \
  https://YOUR_PROJECT.supabase.co/functions/v1 \
  YOUR_API_KEY \
  EXECUTION_UUID \
  "documents" \
  --url "https://example.com/file.pdf"
```

Requires `jq` to be installed.

---

## Request body

| Field           | Required | Description |
|----------------|----------|-------------|
| `execution_id` | Yes      | Workflow execution UUID. |
| `field_name`   | Yes      | Name of the file/multifiles field in the workflow data structure. |
| `file_url`     | One of these | Public URL of the file to download and attach. |
| `file_base64`  | One of these | Base64-encoded file content (or data URL `data:mime/type;base64,...`). |
| `file_name`    | No       | Filename for storage/display (optional with `file_url`, recommended with `file_base64`). |
| `mime_type`    | No       | MIME type (e.g. `application/pdf`); can be inferred from URL or filename. |

You must send either `file_url` or `file_base64`, not both.

---

## Success response (200)

```json
{
  "success": true,
  "message": "File uploaded and execution data updated successfully",
  "file_path": "executions/EXECUTION_ID/1234567890_filename.pdf",
  "field_name": "documents",
  "field_id": "field-uuid"
}
```

Errors return JSON with `error` and optional `details` (e.g. 400, 401, 404, 500).
