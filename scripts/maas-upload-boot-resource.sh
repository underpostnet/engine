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

# Verify jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required for this script but not installed."
    exit 1
fi

# Get MAAS API URL and credentials from profile
MAAS_INFO=$(maas list | grep "^${PROFILE}")
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
OAUTH_SIGNATURE="&${TOKEN_SECRET}"

echo "Initiating upload to MAAS..."
echo "API URL: $ENDPOINT"
echo "Name: $NAME"
echo "Title: $TITLE"
echo "Architecture: $ARCHITECTURE"
echo "Base Image: $BASE_IMAGE"
echo "Filetype: $FILETYPE"
echo ""

# 1. Initiate Upload (POST metadata)
# We do NOT send the content here, just the metadata to create the resource and get the upload URI.
RESPONSE=$(curl -s -X POST "${ENDPOINT}" \
    -H "Authorization: OAuth oauth_version=\"${OAUTH_VERSION}\", oauth_signature_method=\"${OAUTH_SIGNATURE_METHOD}\", oauth_consumer_key=\"${CONSUMER_KEY}\", oauth_token=\"${TOKEN_KEY}\", oauth_signature=\"${OAUTH_SIGNATURE}\", oauth_timestamp=\"${TIMESTAMP}\", oauth_nonce=\"${NONCE}\"" \
    -F "name=${NAME}" \
    -F "title=${TITLE}" \
    -F "architecture=${ARCHITECTURE}" \
    -F "base_image=${BASE_IMAGE}" \
    -F "filetype=${FILETYPE}" \
    -F "sha256=${SHA256}" \
    -F "size=${SIZE}")
CURL_RET=$?

if [ $CURL_RET -ne 0 ]; then
    echo "Error: curl failed with exit code $CURL_RET"
    exit 1
fi

# Validate JSON before parsing
if ! echo "$RESPONSE" | jq . >/dev/null 2>&1; then
    echo "Error: MAAS returned invalid JSON."
    echo "Raw response:"
    echo "$RESPONSE"
    exit 1
fi

# Extract Upload URI
UPLOAD_URI=$(echo "$RESPONSE" | jq -r '.sets | to_entries | sort_by(.key) | reverse | .[0].value.files | to_entries | .[0].value.upload_uri // empty')

if [ -z "$UPLOAD_URI" ]; then
    echo "✗ Failed to get upload URI from MAAS response."
    echo "Response:"
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    exit 1
fi

echo "Upload URI obtained: $UPLOAD_URI"

# Construct the full upload URL
if [[ "$UPLOAD_URI" == http* ]]; then
    FULL_UPLOAD_URL="$UPLOAD_URI"
else
    # Extract scheme and authority from API_URL
    # e.g. http://192.168.1.5:5240/MAAS/api/2.0/ -> http://192.168.1.5:5240
    MAAS_ROOT=$(echo "$API_URL" | sed -E 's|^(https?://[^/]+).*|\1|')

    # Ensure UPLOAD_URI starts with /
    [[ "$UPLOAD_URI" != /* ]] && UPLOAD_URI="/$UPLOAD_URI"

    FULL_UPLOAD_URL="${MAAS_ROOT}${UPLOAD_URI}"
fi

echo "Full Upload URL: $FULL_UPLOAD_URL"

# 2. Split file into chunks
CHUNK_SIZE=$((4 * 1024 * 1024)) # 4MB
TMP_DIR=$(mktemp -d)
echo "Splitting file into 4MB chunks in $TMP_DIR..."
split -b ${CHUNK_SIZE} "${FILE_PATH}" "${TMP_DIR}/chunk_"

# 3. Upload chunks
echo "Starting chunked upload..."
CHUNK_COUNT=$(ls "${TMP_DIR}"/chunk_* | wc -l)
CURRENT_CHUNK=0

for chunk in "${TMP_DIR}"/chunk_*; do
    CURRENT_CHUNK=$((CURRENT_CHUNK + 1))
    CHUNK_SIZE_BYTES=$(stat -c%s "$chunk")

    # Progress indicator
    echo -ne "Uploading chunk $CURRENT_CHUNK of $CHUNK_COUNT ($CHUNK_SIZE_BYTES bytes)...\r"

    # Generate new nonce/timestamp for each request
    TIMESTAMP=$(date +%s)
    NONCE=$(openssl rand -hex 16)

    # Upload chunk
    CHUNK_RESPONSE=$(curl -s -X PUT "${FULL_UPLOAD_URL}" \
        -H "Content-Type: application/octet-stream" \
        -H "Content-Length: ${CHUNK_SIZE_BYTES}" \
        -H "Authorization: OAuth oauth_version=\"${OAUTH_VERSION}\", oauth_signature_method=\"${OAUTH_SIGNATURE_METHOD}\", oauth_consumer_key=\"${CONSUMER_KEY}\", oauth_token=\"${TOKEN_KEY}\", oauth_signature=\"${OAUTH_SIGNATURE}\", oauth_timestamp=\"${TIMESTAMP}\", oauth_nonce=\"${NONCE}\"" \
        --data-binary @"${chunk}" \
        -w "%{http_code}")

    HTTP_CODE="${CHUNK_RESPONSE: -3}"

    if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
        echo ""
        echo "✗ Chunk upload failed with status: $HTTP_CODE"
        echo "Response: ${CHUNK_RESPONSE::-3}"
        rm -r "${TMP_DIR}"
        exit 1
    fi

    rm "$chunk"
done

echo ""
echo "✓ Upload complete!"
rm -r "${TMP_DIR}"
exit 0
