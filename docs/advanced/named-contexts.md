# Named contexts

You can define [additional build contexts](https://docs.docker.com/engine/reference/commandline/buildx_build/#build-context)
that can be accessed in your Dockerfile with `FROM name` or `--from=name`. When
Dockerfile defines a stage with the same name it is overwritten.

This can be useful with GitHub Actions to reuse results from other builds or
pin an image to a spcific tag in your workflow.

## Pin image to a specific tag

Replace `alpine:latest` with a pinned one:

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine
RUN echo "Hello World"
```

```yaml
name: ci

on:
  push:
    branches:
      - 'main'

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v3
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      -
        name: Build
        uses: docker/build-push-action@v3
        with:
          context: .
          build-contexts: |
            alpine=docker-image://alpine:3.16
          tags: myimage:latest
```

## Usage of the built image in other build steps

By default, the [`setup-buildx` action](https://github.com/docker/setup-buildx-action#about)
uses `docker-container` as a build driver, so built Docker images are not
available in the builder container.

With named contexts you can reuse the built image:

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine
RUN echo "Hello World"
```

```yaml
name: ci

on:
  push:
    branches:
      - 'main'

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v3
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      -
        name: Build base image
        uses: docker/build-push-action@v3
        with:
          context: base
          load: true
          tags: my-base-image:latest
      -
        name: Build
        uses: docker/build-push-action@v3
        with:
          context: .
          build-contexts: |
            alpine=docker-image://my-base-image:latest
          tags: myimage:latest
```
