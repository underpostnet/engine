#!/usr/bin/env bash
# Script to upload boot resources to MAAS using the REST API with OAuth
# Usage: ./maas-upload-boot-resource.sh <profile> <name> <title> <architecture> <base_image> <filetype> <file_path>

set -euo pipefail

if [ $# -lt 7 ]; then
    echo "Usage: $0 <profile> <name> <title> <architecture> <base_image> <filetype> <file_path>"
    echo ""
    echo "Example:"
    echo "  $0 maas custom/rocky9 'Rocky 9 Custom' amd64/generic rhel/9 tgz rocky9.tar.gz"
    exit 1
fi

PROFILE="$1"
NAME="$2"
TITLE="$3"
ARCHITECTURE="$4"
BASE_IMAGE="$5"
FILETYPE="$6"
FILE_PATH="$7"

# Verify file exists
if [ ! -f "$FILE_PATH" ]; then
    echo "Error: File not found: $FILE_PATH"
    exit 1
fi

# Get MAAS API URL and credentials from profile
MAAS_INFO=$(maas list | grep "^${PROFILE}" || true)
if [ -z "$MAAS_INFO" ]; then
    echo "Error: MAAS profile '${PROFILE}' not found"
    echo "Available profiles:"
    maas list
    exit 1
fi

API_URL=$(echo "$MAAS_INFO" | awk '{print $2}')
API_KEY=$(echo "$MAAS_INFO" | awk '{print $3}')

# Parse OAuth credentials
CONSUMER_KEY=$(echo "$API_KEY" | cut -d: -f1)
TOKEN_KEY=$(echo "$API_KEY" | cut -d: -f2)
TOKEN_SECRET=$(echo "$API_KEY" | cut -d: -f3)

# Calculate file hash and size
echo "Calculating SHA256 checksum..."
SHA256=$(sha256sum "$FILE_PATH" | awk '{print $1}')
SIZE=$(stat -c%s "$FILE_PATH")

echo "File: $FILE_PATH"
echo "Size: $SIZE bytes ($(numfmt --to=iec-i --suffix=B $SIZE))"
echo "SHA256: $SHA256"
echo ""

# Endpoint for boot resources
ENDPOINT="${API_URL}boot-resources/"

# Generate OAuth timestamp and nonce
TIMESTAMP=$(date +%s)
NONCE=$(openssl rand -hex 16)

# OAuth parameters
OAUTH_VERSION="1.0"
OAUTH_SIGNATURE_METHOD="PLAINTEXT"
OAUTH_SIGNATURE="${CONSUMER_KEY}&${TOKEN_SECRET}"

echo "Uploading to MAAS..."
echo "API URL: $ENDPOINT"
echo "Name: $NAME"
echo "Title: $TITLE"
echo "Architecture: $ARCHITECTURE"
echo "Base Image: $BASE_IMAGE"
echo "Filetype: $FILETYPE"
echo ""

# Upload using curl with multipart form data (with progress bar)
echo "Uploading $(numfmt --to=iec-i --suffix=B $SIZE) to MAAS (this may take several minutes)..."
RESPONSE=$(curl --progress-bar -w "\nHTTP_CODE:%{http_code}" \
    --max-time 600 \
    -H "Authorization: OAuth oauth_version=\"${OAUTH_VERSION}\", oauth_signature_method=\"${OAUTH_SIGNATURE_METHOD}\", oauth_consumer_key=\"${CONSUMER_KEY}\", oauth_token=\"${TOKEN_KEY}\", oauth_signature=\"${OAUTH_SIGNATURE}\", oauth_timestamp=\"${TIMESTAMP}\", oauth_nonce=\"${NONCE}\"" \
    -F "name=${NAME}" \
    -F "title=${TITLE}" \
    -F "architecture=${ARCHITECTURE}" \
    -F "base_image=${BASE_IMAGE}" \
    -F "filetype=${FILETYPE}" \
    -F "sha256=${SHA256}" \
    -F "size=${SIZE}" \
    -F "content=@${FILE_PATH}" \
    "${ENDPOINT}" 2>&1)

# Extract HTTP status code
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | tail -1 | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:" | grep -v "^#" | grep -v "^$")

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Successfully uploaded boot resource!"
    echo ""
    echo "Response:"
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
    exit 0
else
    echo "✗ Upload failed with HTTP status: $HTTP_CODE"
    echo ""
    echo "Response:"
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
    exit 1
fi
