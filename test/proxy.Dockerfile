# syntax=docker/dockerfile:1
FROM alpine
RUN apk add --no-cache curl net-tools
ARG HTTP_PROXY
ARG HTTPS_PROXY
RUN printenv HTTP_PROXY
RUN printenv HTTPS_PROXY
RUN netstat -aptn
RUN curl --retry 5 --retry-all-errors --retry-delay 0 --connect-timeout 5 --proxy $HTTP_PROXY -v --insecure --head https://www.google.com
