# syntax=docker/dockerfile:1
FROM alpine
RUN cat /proc/self/cgroup
