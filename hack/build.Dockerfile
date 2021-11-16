# syntax=docker/dockerfile:1.3-labs

ARG NODE_VERSION
ARG DOCKER_VERSION=20.10.10
ARG BUILDX_VERSION=0.7.0

FROM node:${NODE_VERSION}-alpine AS base
RUN apk add --no-cache cpio findutils git
WORKDIR /src

FROM base AS deps
RUN --mount=type=bind,target=.,rw \
  --mount=type=cache,target=/src/node_modules \
  yarn install && mkdir /vendor && cp yarn.lock /vendor

FROM scratch AS vendor-update
COPY --from=deps /vendor /

FROM deps AS vendor-validate
RUN --mount=type=bind,target=.,rw <<EOT
set -e
git add -A
cp -rf /vendor/* .
if [ -n "$(git status --porcelain -- yarn.lock)" ]; then
  echo >&2 'ERROR: Vendor result differs. Please vendor your package with "docker buildx bake vendor-update"'
  git status --porcelain -- yarn.lock
  exit 1
fi
EOT

FROM deps AS build
RUN --mount=type=bind,target=.,rw \
  --mount=type=cache,target=/src/node_modules \
  yarn run build && mkdir /out && cp -Rf dist /out/

FROM scratch AS build-update
COPY --from=build /out /

FROM build AS build-validate
RUN --mount=type=bind,target=.,rw <<EOT
set -e
git add -A
cp -rf /out/* .
if [ -n "$(git status --porcelain -- dist)" ]; then
  echo >&2 'ERROR: Build result differs. Please build first with "docker buildx bake build"'
  git status --porcelain -- dist
  exit 1
fi
EOT

FROM deps AS format
RUN --mount=type=bind,target=.,rw \
  --mount=type=cache,target=/src/node_modules \
  yarn run format \
  && mkdir /out && find . -name '*.ts' -not -path './node_modules/*' | cpio -pdm /out

FROM scratch AS format-update
COPY --from=format /out /

FROM deps AS format-validate
RUN --mount=type=bind,target=.,rw \
  --mount=type=cache,target=/src/node_modules \
  yarn run format-check

FROM docker:${DOCKER_VERSION} as docker
FROM docker/buildx-bin:${BUILDX_VERSION} as buildx

FROM deps AS test
ENV RUNNER_TEMP=/tmp/github_runner
ENV RUNNER_TOOL_CACHE=/tmp/github_tool_cache
RUN --mount=type=bind,target=.,rw \
  --mount=type=cache,target=/src/node_modules \
  --mount=type=bind,from=docker,source=/usr/local/bin/docker,target=/usr/bin/docker \
  --mount=type=bind,from=buildx,source=/buildx,target=/usr/libexec/docker/cli-plugins/docker-buildx \
  yarn run test --coverageDirectory=/tmp/coverage

FROM scratch AS test-coverage
COPY --from=test /tmp/coverage /
