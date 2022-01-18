# Update DockerHub repo description

You can update the [DockerHub repository description](https://docs.docker.com/docker-hub/repos/) using
a third party action called [DockerHub Description](https://github.com/peter-evans/dockerhub-description)
with this action:

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
          push: true
          tags: user/app:latest
      -
        name: Update repo description
        uses: peter-evans/dockerhub-description@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_PASSWORD }}
          repository: user/app
```
