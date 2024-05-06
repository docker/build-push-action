# syntax=docker/dockerfile:1

ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-alpine AS base
RUN apk add --no-cache cpio findutils git
WORKDIR /src
RUN --mount=type=bind,target=.,rw \
  --mount=type=cache,target=/src/.yarn/cache <<EOT
  corepack enable
  yarn --version
  yarn config set --home enableTelemetry 0
EOT

FROM base AS deps
RUN --mount=type=bind,target=.,rw \
  --mount=type=cache,target=/src/.yarn/cache \
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
  --mount=type=cache,target=/src/.yarn/cache \
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
  --mount=type=cache,target=/src/.yarn/cache \
  --mount=type=cache,target=/src/node_modules \
  yarn run format \
  && mkdir /out && find . -name '*.ts' -not -path './node_modules/*' -not -path './.yarn/*' | cpio -pdm /out

FROM scratch AS format-update
COPY --from=format /out /

FROM deps AS lint
RUN --mount=type=bind,target=.,rw \
  --mount=type=cache,target=/src/.yarn/cache \
  --mount=type=cache,target=/src/node_modules \
  yarn run lint

FROM deps AS test
RUN --mount=type=bind,target=.,rw \
  --mount=type=cache,target=/src/.yarn/cache \
  --mount=type=cache,target=/src/node_modules \
  yarn run test --coverage --coverageDirectory=/tmp/coverage

FROM scratch AS test-coverage
COPY --from=test /tmp/coverage /
