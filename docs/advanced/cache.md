# Cache

* [Inline cache](#inline-cache)
* [Registry cache](#registry-cache)
* [GitHub cache](#github-cache)
  * [Cache backend API](#cache-backend-api)
  * [Local cache](#local-cache)

> More info about cache on [BuildKit](https://github.com/moby/buildkit#export-cache) and [Buildx](https://github.com/docker/buildx/blob/master/docs/reference/buildx_build.md#cache-from) repositories.

## Inline cache

In most cases you want to use the [`type=inline` cache exporter](https://github.com/moby/buildkit#inline-push-image-and-cache-together).
However, note that the `inline` cache exporter only supports `min` cache mode. To enable `max` cache mode, push the
image and the cache separately by using the `registry` cache exporter as shown in the [next example](#registry-cache).

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
          cache-from: type=registry,ref=user/app:latest
          cache-to: type=inline
```

## Registry cache

You can import/export cache from a cache manifest or (special) image configuration on the registry with the
[`type=registry` cache exporter](https://github.com/moby/buildkit/tree/master#registry-push-image-and-cache-separately).

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
          cache-from: type=registry,ref=user/app:buildcache
          cache-to: type=registry,ref=user/app:buildcache,mode=max
```

## GitHub cache

### Cache backend API

> :test_tube: This cache exporter is considered EXPERIMENTAL until further notice. Please provide feedback on
> [BuildKit repository](https://github.com/moby/buildkit) if you encounter any issues.

Since [buildx 0.6.0](https://github.com/docker/buildx/releases/tag/v0.6.0) and [BuildKit 0.9.0](https://github.com/moby/buildkit/releases/tag/v0.9.0),
you can use the [`type=gha` cache exporter](https://github.com/moby/buildkit/tree/master#github-actions-cache-experimental).

GitHub Actions cache exporter backend uses the [GitHub Cache API](https://github.com/tonistiigi/go-actions-cache/blob/master/api.md)
to fetch and upload cache blobs. That's why this type of cache should be exclusively used in a GitHub Action workflow
as the `url` (`$ACTIONS_CACHE_URL`) and `token` (`$ACTIONS_RUNTIME_TOKEN`) attributes are populated when a workflow
is started.

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
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Local cache

> :warning: At the moment caches are copied over the existing cache so it [keeps growing](https://github.com/docker/build-push-action/issues/252).
> The `Move cache` step is used as a temporary fix (see https://github.com/moby/buildkit/issues/1896).

You can also leverage [GitHub cache](https://docs.github.com/en/actions/configuring-and-managing-workflows/caching-dependencies-to-speed-up-workflows)
using [actions/cache](https://github.com/actions/cache) and [`type=local` cache exporter](https://github.com/moby/buildkit#local-directory-1)
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
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v1
      -
        name: Cache Docker layers
        uses: actions/cache@v2
        with:
          path: /tmp/.buildx-cache
          key: ${{ runner.os }}-buildx-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-buildx-
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
          cache-from: type=local,src=/tmp/.buildx-cache
          cache-to: type=local,dest=/tmp/.buildx-cache-new,mode=max
      -
        # Temp fix
        # https://github.com/docker/build-push-action/issues/252
        # https://github.com/moby/buildkit/issues/1896
        name: Move cache
        run: |
          rm -rf /tmp/.buildx-cache
          mv /tmp/.buildx-cache-new /tmp/.buildx-cache
```
