# syntax=docker/dockerfile:1.2
ARG NODE_VERSION
ARG DOCKER_VERSION=20.10.7
ARG BUILDX_VERSION=0.6.0

FROM docker:${DOCKER_VERSION} as docker
FROM docker/buildx-bin:${BUILDX_VERSION} as buildx

FROM node:${NODE_VERSION}-alpine AS base
RUN apk add --no-cache git
WORKDIR /src

FROM base AS deps
RUN --mount=type=bind,target=.,rw \
  --mount=type=cache,target=/src/node_modules \
  yarn install

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
