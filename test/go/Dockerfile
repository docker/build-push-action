FROM golang:1.19-alpine AS base
ENV CGO_ENABLED=0
RUN apk add --no-cache file git
WORKDIR /src

FROM base as build
COPY go.mod go.sum ./
RUN go mod download -x
COPY . .
RUN go build -ldflags "-s -w" -o /usr/bin/app .

FROM scratch AS binary
COPY --from=build /usr/bin/app /bin/app

FROM alpine:3.17 AS image
COPY --from=build /usr/bin/app /bin/app
