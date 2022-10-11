# syntax=docker/dockerfile:1
FROM busybox
RUN mount | grep /dev/shm
