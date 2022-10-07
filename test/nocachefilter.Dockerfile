# syntax=docker/dockerfile:1
FROM busybox AS base
RUN echo "Hello world!" > /hello

FROM alpine AS build
COPY --from=base /hello /hello
RUN uname -a

FROM build
