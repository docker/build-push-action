# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM golang:alpine AS build
ARG TARGETPLATFORM
ARG BUILDPLATFORM
RUN echo "I am running on $BUILDPLATFORM, building for $TARGETPLATFORM" > /log
RUN apk --update --no-cache add \
    shadow \
    sudo \
  && addgroup -g 1200 buildx \
  && adduser -u 1200 -G buildx -s /sbin/nologin -D buildx \
  && echo 'buildx ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers \
  && rm -rf /tmp/* /var/cache/apk/*

USER buildx
RUN sudo chown buildx. /log
USER root

FROM alpine
COPY --from=build /log /log
RUN ls -al /log
