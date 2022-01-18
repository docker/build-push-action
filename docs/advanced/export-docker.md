# Export image to Docker

You may want your build result to be available in the Docker client through `docker images` to be able to use it
in another step of your workflow:

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
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v1
      -
        name: Build
        uses: docker/build-push-action@v2
        with:
          context: .
          load: true
          tags: myimage:latest
      -
        name: Inspect
        run: |
          docker image inspect myimage:latest
```
