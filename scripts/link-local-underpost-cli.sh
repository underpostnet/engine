
#!/usr/bin/env bash
set -euo pipefail

cd /home/dd && underpost clone underpostnet/pwa-microservices-template
cd /home/dd/pwa-microservices-template && npm install && npm link
