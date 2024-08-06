frOM busybox as base
cOpy lint.Dockerfile .

from scratch
MAINTAINER moby@example.com
COPy --from=base \
  /lint.Dockerfile \
  /

CMD [ "echo", "Hello, Norway!" ]
CMD [ "echo", "Hello, Sweden!" ]
ENTRYPOINT my-program start
