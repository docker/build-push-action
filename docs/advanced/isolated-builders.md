# Isolated builders

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
        uses: docker/setup-buildx-action@v1
        id: builder1
      -
        uses: docker/setup-buildx-action@v1
        id: builder2
      -
        name: Builder 1 name
        run: echo ${{ steps.builder1.outputs.name }}
      -
        name: Builder 2 name
        run: echo ${{ steps.builder2.outputs.name }}
      -
        name: Build against builder1
        uses: docker/build-push-action@v2
        with:
          builder: ${{ steps.builder1.outputs.name }}
          context: .
          target: mytarget1
      -
        name: Build against builder2
        uses: docker/build-push-action@v2
        with:
          builder: ${{ steps.builder2.outputs.name }}
          context: .
          target: mytarget2
```
