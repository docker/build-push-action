# syntax=docker/dockerfile:1

FROM golang:alpine AS base
ENV CGO_ENABLED=0
RUN apk add --no-cache file git
WORKDIR /src

FROM base AS build
RUN --mount=type=bind,target=/src \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags "-s -w" -o /usr/bin/app .

FROM scratch AS binary
COPY --from=build /usr/bin/app /bin/app

FROM alpine AS image
COPY --from=build /usr/bin/app /bin/app
EXPOSE 8080
ENTRYPOINT ["/bin/app"]
