# Test your image before pushing it

In some cases, you might want to validate that the image works as expected
before pushing it.

The workflow below will be composed of several steps to achieve this:
* Build and export the image to Docker
* Test your image
* Multi-platform build and push the image

```yaml
name: ci

on:
  push:
    branches:
      - 'main'

env:
  TEST_TAG: user/myapp:test

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
        name: Build and export to Docker
        uses: docker/build-push-action@v2
        with:
          context: .
          load: true
          tags: ${{ env.TEST_TAG }}
      -
        name: Test
        run: |
          docker run --rm ${{ env.TEST_TAG }}
      -
        name: Build and push
        uses: docker/build-push-action@v2
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: user/app:latest
```

> :bulb: Build time will not be increased with this workflow because internal
> cache for `linux/amd64` will be used from previous step on `Build and push`
> step so only `linux/arm64` will be actually built.
