#!/usr/bin/env bash
set -eu

: "${DISTRIBUTION_VERSION:=registry:2}"
: "${DISTRIBUTION_HOST:=localhost}"
: "${DISTRIBUTION_PORT:=8080}"

echo "::group::Starting ${DISTRIBUTION_VERSION}}"
(
  set -x
  docker run -d --name registry -p "5000:${DISTRIBUTION_PORT}" "${DISTRIBUTION_VERSION}"
)
echo "::endgroup::"