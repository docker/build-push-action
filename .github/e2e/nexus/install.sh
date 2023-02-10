#!/usr/bin/env bash
set -eu

SCRIPT_DIR=$(cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd)

: "${NEXUS_VERSION:=3.47.1}"
: "${NEXUS_HOST:=localhost}"
: "${NEXUS_PORT:=8081}"
: "${NEXUS_REGISTRY_PORT:=8082}"
: "${REGISTRY_USER:=admin}"
: "${REGISTRY_PASSWORD:=Nexus12345}"

: "${NEXUS_REPO:=test-docker-action}"

createrepo_post_data() {
  cat <<EOF
{
  "name": "${NEXUS_REPO}",
  "online": true,
  "storage": {
    "blobStoreName": "default",
    "strictContentTypeValidation": true,
    "writePolicy": "ALLOW"
  },
  "docker": {
    "v1Enabled": false,
    "forceBasicAuth": true,
    "httpPort": ${NEXUS_REGISTRY_PORT},
    "httpsPort": null,
    "subdomain": null
  }
}
EOF
}

export NEXUS_VERSION

mkdir -p /tmp/nexus/data
chown 200:200 /tmp/nexus/data
cp "${SCRIPT_DIR}/docker-compose.yml" /tmp/nexus/docker-compose.yml

echo "::group::Pulling Nexus $NEXUS_VERSION"
(
  cd /tmp/nexus
  set -x
  docker compose pull
)
echo "::endgroup::"

echo "::group::Compose config"
(
  cd /tmp/nexus
  set -x
  docker compose config
)
echo "::endgroup::"

echo "::group::Running Nexus"
(
  cd /tmp/nexus
  set -x
  docker compose up -d
)
echo "::endgroup::"

echo "::group::Running Nexus"
(
  cd /tmp/nexus
  set -x
  docker compose up -d
)
echo "::endgroup::"

echo "::group::Waiting for Nexus to be ready"
until $(curl --output /dev/null --silent --head --fail "http://$NEXUS_HOST:$NEXUS_PORT"); do
  printf '.'
  sleep 5
done
echo "::endgroup::"

echo "::group::Change user's password"
(
  set -x
  curl --fail -v -k --max-time 10 -u "$REGISTRY_USER:$(cat /tmp/nexus/data/admin.password)" -X PUT -H 'Content-Type: text/plain' -d "$REGISTRY_PASSWORD" "http://$NEXUS_HOST:$NEXUS_PORT/service/rest/v1/security/users/$REGISTRY_USER/change-password"
)
echo "::endgroup::"

echo "::group::Create Docker repository"
(
  set -x
  curl --fail -v -k --max-time 10 -u "$REGISTRY_USER:$REGISTRY_PASSWORD" -X POST -H 'Content-Type: application/json' -d "$(createrepo_post_data)" "http://$NEXUS_HOST:$NEXUS_PORT/service/rest/v1/repositories/docker/hosted"
)
echo "::endgroup::"
