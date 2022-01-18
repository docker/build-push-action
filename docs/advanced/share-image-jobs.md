# Share built image between jobs

As each job is isolated in its own runner you cannot use your built image between jobs (except for [self-hosted runners](https://docs.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners)).
However, you can [pass data between jobs in a workflow](https://docs.github.com/en/actions/guides/storing-workflow-data-as-artifacts#passing-data-between-jobs-in-a-workflow)
using the [actions/upload-artifact](https://github.com/actions/upload-artifact) and [actions/download-artifact](https://github.com/actions/download-artifact)
actions:

```yaml
name: ci

on:
  push:
    branches:
      - 'main'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v2
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v1
      -
        name: Build and export
        uses: docker/build-push-action@v2
        with:
          context: .
          tags: myimage:latest
          outputs: type=docker,dest=/tmp/myimage.tar
      -
        name: Upload artifact
        uses: actions/upload-artifact@v2
        with:
          name: myimage
          path: /tmp/myimage.tar

  use:
    runs-on: ubuntu-latest
    needs: build
    steps:
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v1
      -
        name: Download artifact
        uses: actions/download-artifact@v2
        with:
          name: myimage
          path: /tmp
      -
        name: Load image
        run: |
          docker load --input /tmp/myimage.tar
          docker image ls -a
```
