#!/usr/bin/env bash
# Upload a file to an execution (single file or multifiles field) via the API.
#
# Usage:
#   ./scripts/upload-execution-file-curl.sh <api_base_url> <api_key> <execution_id> <field_name> <file_path>
#   ./scripts/upload-execution-file-curl.sh <api_base_url> <api_key> <execution_id> <field_name> --url <file_url>
#
# Examples:
#   ./scripts/upload-execution-file-curl.sh https://xxx.supabase.co/functions/v1 YOUR_API_KEY execution-uuid "documents" ./report.pdf
#   ./scripts/upload-execution-file-curl.sh https://xxx.supabase.co/functions/v1 YOUR_API_KEY execution-uuid "attachments" --url "https://example.com/file.pdf"
#
# The upload-execution-file function:
# - For a single "file" field: sets the field value to the new file path (replaces any previous file).
# - For a "multiple_files" field: appends the new file to the list (adds to existing files).

set -e

if [ $# -lt 5 ]; then
  echo "Usage: $0 <api_base_url> <api_key> <execution_id> <field_name> <file_path>"
  echo "   or: $0 <api_base_url> <api_key> <execution_id> <field_name> --url <file_url>"
  echo ""
  echo "  api_base_url   e.g. https://xxx.supabase.co/functions/v1 or https://services.floowly.app/functions/v1"
  echo "  api_key        Company API key (x-api-key)"
  echo "  execution_id   Workflow execution UUID"
  echo "  field_name     Field name in the workflow data structure (e.g. documents, attachments)"
  echo "  file_path      Local file path, or use --url <file_url> to provide a URL"
  exit 1
fi

BASE_URL="$1"
API_KEY="$2"
EXECUTION_ID="$3"
FIELD_NAME="$4"
shift 4

ENDPOINT="${BASE_URL%/}/upload-execution-file"

if [ "$1" = "--url" ] && [ -n "$2" ]; then
  # Upload from URL
  FILE_URL="$2"
  BODY=$(jq -n \
    --arg execution_id "$EXECUTION_ID" \
    --arg field_name "$FIELD_NAME" \
    --arg file_url "$FILE_URL" \
    '{ execution_id: $execution_id, field_name: $field_name, file_url: $file_url }')
else
  # Upload from local file (base64)
  FILE_PATH="$1"
  if [ ! -f "$FILE_PATH" ]; then
    echo "Error: File not found: $FILE_PATH"
    exit 1
  fi
  FILE_BASE64=$(base64 < "$FILE_PATH" | tr -d '\n')
  FILE_NAME=$(basename "$FILE_PATH")
  BODY=$(jq -n \
    --arg execution_id "$EXECUTION_ID" \
    --arg field_name "$FIELD_NAME" \
    --arg file_base64 "$FILE_BASE64" \
    --arg file_name "$FILE_NAME" \
    '{ execution_id: $execution_id, field_name: $field_name, file_base64: $file_base64, file_name: $file_name }')
fi

curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "$BODY"
