# Cache

* [Inline cache](#inline-cache)
* [Registry cache](#registry-cache)
* [GitHub cache](#github-cache)
  * [Cache backend API](#cache-backend-api)
  * [Local cache](#local-cache)

> **Note**
>
> See [our guide](https://github.com/docker/buildx/blob/master/docs/guides/cache/index.md)
> for more details about cache storage backends.

## Inline cache

In most cases you want to use the [`type=inline` cache exporter](https://github.com/docker/buildx/blob/master/docs/guides/cache/inline.md).
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
        uses: actions/checkout@v3
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      -
        name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      -
        name: Build and push
        uses: docker/build-push-action@v3
        with:
          context: .
          push: true
          tags: user/app:latest
          cache-from: type=registry,ref=user/app:latest
          cache-to: type=inline
```

## Registry cache

You can import/export cache from a cache manifest or (special) image configuration on the registry with the
[`type=registry` cache exporter](https://github.com/docker/buildx/blob/master/docs/guides/cache/registry.md).

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
        name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      -
        name: Build and push
        uses: docker/build-push-action@v3
        with:
          context: .
          push: true
          tags: user/app:latest
          cache-from: type=registry,ref=user/app:buildcache
          cache-to: type=registry,ref=user/app:buildcache,mode=max
```

## GitHub cache

### Cache backend API

> **Warning**
>
> This cache exporter is considered EXPERIMENTAL until further notice. Please
> provide feedback on [BuildKit repository](https://github.com/moby/buildkit)
> if you encounter any issues.

[GitHub Actions cache exporter](https://github.com/docker/buildx/blob/master/docs/guides/cache/gha.md)
backend uses the [GitHub Cache API](https://github.com/tonistiigi/go-actions-cache/blob/master/api.md)
to fetch and upload cache blobs. That's why this type of cache should be
exclusively used in a GitHub Action workflow as the `url` (`$ACTIONS_CACHE_URL`)
and `token` (`$ACTIONS_RUNTIME_TOKEN`) attributes are populated when a workflow
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
        uses: actions/checkout@v3
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      -
        name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      -
        name: Build and push
        uses: docker/build-push-action@v3
        with:
          context: .
          push: true
          tags: user/app:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Local cache

> **Warning**
>
> At the moment caches are copied over the existing cache, so it [keeps growing](https://github.com/docker/build-push-action/issues/252).
> The `Move cache` step is used as a workaround (see [moby/buildkit#1896](https://github.com/moby/buildkit/issues/1896) for more info).

You can also leverage [GitHub cache](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)
using the [actions/cache](https://github.com/actions/cache) and [`type=local` cache exporter](https://github.com/docker/buildx/blob/master/docs/guides/cache/local.md)
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
        uses: actions/checkout@v3
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      -
        name: Cache Docker layers
        uses: actions/cache@v3
        with:
          path: /tmp/.buildx-cache
          key: ${{ runner.os }}-buildx-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-buildx-
      -
        name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      -
        name: Build and push
        uses: docker/build-push-action@v3
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
