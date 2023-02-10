#!/usr/bin/env bash
set -eu

: "${HARBOR_VERSION:=v2.7.0}"
: "${HARBOR_HOST:=localhost}"
: "${HARBOR_PORT:=49154}"
: "${REGISTRY_USER:=admin}"
: "${REGISTRY_PASSWORD:=Harbor12345}"

: "${HARBOR_PROJECT:=test-docker-action}"

project_post_data() {
  cat <<EOF
{
  "project_name": "$HARBOR_PROJECT",
  "public": true
}
EOF
}

export TERM=xterm

# download
echo "::group::Downloading Harbor $HARBOR_VERSION"
(
  cd /tmp
  set -x
  wget -q "https://github.com/goharbor/harbor/releases/download/${HARBOR_VERSION}/harbor-offline-installer-${HARBOR_VERSION}.tgz" -O harbor-online-installer.tgz
  tar xvf harbor-online-installer.tgz
)
echo "::endgroup::"

# config
echo "::group::Configuring Harbor"
(
  cd /tmp/harbor
  set -x
  cp harbor.yml.tmpl harbor.yml
  harborConfig="$(harborHost="$HARBOR_HOST" harborPort="$HARBOR_PORT" harborPwd="$REGISTRY_PASSWORD" yq --no-colors '.hostname = env(harborHost) | .http.port = env(harborPort) | .harbor_admin_password = env(harborPwd) | del(.https)' harbor.yml)"
  tee harbor.yml <<<"$harborConfig" >/dev/null
  yq --no-colors harbor.yml
)
echo "::endgroup::"

# install and start
echo "::group::Installing Harbor"
(
  cd /tmp/harbor
  set -x
  ./install.sh
  sleep 10
  netstat -aptn
)
echo "::endgroup::"

# compose config
echo "::group::Compose config"
(
  cd /tmp/harbor
  set -x
  docker compose config
)
echo "::endgroup::"

# create project
echo "::group::Creating project"
(
  set -x
  curl --fail -v -k --max-time 10 -u "$REGISTRY_USER:$REGISTRY_PASSWORD" -X POST -H "Content-Type: application/json" -d "$(project_post_data)" "http://$HARBOR_HOST:$HARBOR_PORT/api/v2.0/projects"
)
echo "::endgroup::"

# list projects
echo "::group::List projects"
(
  set -x
  curl --fail -s -k --max-time 10 -u "$REGISTRY_USER:$REGISTRY_PASSWORD" -H "Content-Type: application/json" "http://$HARBOR_HOST:$HARBOR_PORT/api/v2.0/projects" | jq
)
echo "::endgroup::"
