# syntax=docker/dockerfile:1
FROM busybox
RUN --mount=type=secret,id=MYSECRET \
  echo "MYSECRET=$(cat /run/secrets/MYSECRET)"
