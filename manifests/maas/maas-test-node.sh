#!/usr/bin/env bash
set -e

MAAS_ADMIN_USERNAME=$(node bin config get --plain MAAS_ADMIN_USERNAME)
MAAS_ADMIN_EMAIL=$(node bin config get --plain MAAS_ADMIN_EMAIL)
MAAS_ADMIN_PASS=$(node bin config get --plain MAAS_ADMIN_PASS)

APIKEY=$(maas apikey --username "$MAAS_ADMIN_USERNAME")

IFS=':' read -r CONSUMER_KEY OAUTH_TOKEN OAUTH_SECRET <<<"$APIKEY"

echo "CONSUMER_KEY $CONSUMER_KEY"
echo "OAUTH_TOKEN $OAUTH_TOKEN"
echo "OAUTH_SECRET $OAUTH_SECRET"

curl -v \
    -H "Authorization: OAuth \
oauth_version=\"1.0\", \
oauth_signature_method=\"PLAINTEXT\", \
oauth_consumer_key=\"$CONSUMER_KEY\", \
oauth_token=\"$OAUTH_TOKEN\", \
oauth_signature=\"&$OAUTH_SECRET\", \
oauth_nonce=\"$(uuidgen)\", \
oauth_timestamp=\"$(date +%s)\"" \
    -H "User-Agent: Cloud-Init/25.1.2-0ubuntu0~24.04.1" \
    "http://192.168.1.87:5248/MAAS/metadata/2012-03-01/meta-data/instance-id"
