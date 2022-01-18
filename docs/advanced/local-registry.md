# Local registry

For testing purposes you may need to create a [local registry](https://hub.docker.com/_/registry) to push images into:

```yaml
name: ci

on:
  push:
    branches:
      - 'main'

jobs:
  docker:
    runs-on: ubuntu-latest
    services:
      registry:
        image: registry:2
        ports:
          - 5000:5000
    steps:
      -
        name: Checkout
        uses: actions/checkout@v2
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@v1
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v1
        with:
          driver-opts: network=host
      -
        name: Build and push to local registry
        uses: docker/build-push-action@v2
        with:
          context: .
          push: true
          tags: localhost:5000/name/app:latest
      -
        name: Inspect
        run: |
          docker buildx imagetools inspect localhost:5000/name/app:latest
```
