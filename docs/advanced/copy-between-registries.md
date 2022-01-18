# Copy images between registries

Multi-platform images built using buildx can be copied from one registry to another without
changing the image SHA using the [tag-push-action](https://github.com/akhilerm/tag-push-action).

The following workflow will first push the image to dockerhub, run some tests using the images
and then push to quay and ghcr

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
      - # quay and ghcr logins for pushing image after testing
        name: Login to Quay Registry
        uses: docker/login-action@v1 
        with:
          registry: quay.io
          username: ${{ secrets.QUAY_USERNAME }}
          password: ${{ secrets.QUAY_TOKEN }}
      -
        name: Login to GitHub Container Registry
        uses: docker/login-action@v1
        with:
          registry: ghcr.io
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GITHUB_TOKEN }}
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
          tags: |
            user/app:latest
            user/app:1.0.0
      - # run tests using image from docker hub
        name: Run Tests
        run: make tests
      - # copy multiplatform image from dockerhub to quay and ghcr
        name: Push Image to multiple registries
        uses: akhilerm/tag-push-action@v2.0.0
        with:
          src: docker.io/user/app:1.0.0
          dst: |
            quay.io/user/app:latest
            quay.io/user/app:1.0.0
            ghcr.io/user/app:latest
            ghcr.io/user/app:1.0.0
```
