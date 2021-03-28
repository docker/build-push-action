# syntax=docker/dockerfile:1.2
ARG NODE_VERSION

FROM node:${NODE_VERSION}-alpine AS base
RUN apk add --no-cache git
WORKDIR /src

FROM base AS vendored
RUN --mount=type=bind,target=.,rw \
  --mount=type=cache,target=/src/node_modules \
  yarn install && mkdir /out && cp yarn.lock /out

FROM scratch AS update
COPY --from=vendored /out /

FROM vendored AS validate
RUN --mount=type=bind,target=.,rw \
  git add -A && cp -rf /out/* .; \
  if [ -n "$(git status --porcelain -- yarn.lock)" ]; then \
    echo >&2 'ERROR: Vendor result differs. Please vendor your package with "docker buildx bake vendor-update"'; \
    git status --porcelain -- yarn.lock; \
    exit 1; \
  fi
