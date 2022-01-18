# Multi-platform image

You can build multi-platform images using the [`platforms` input](../../README.md#inputs) as described below.

> :bulb: List of available platforms will be displayed and available through our [setup-buildx](https://github.com/docker/setup-buildx-action#about) action.

> :bulb: If you want support for more platforms, you can use QEMU with our [setup-qemu](https://github.com/docker/setup-qemu-action) action.

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
        uses: actions/checkout@v2
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@v1
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v1
      -
        name: Login to DockerHub
        uses: docker/login-action@v1 
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      -
        name: Build and push
        uses: docker/build-push-action@v2
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: user/app:latest
```
