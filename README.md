[![GitHub release](https://img.shields.io/github/release/docker/build-push-action.svg?style=flat-square)](https://github.com/docker/build-push-action/releases/latest)
[![GitHub marketplace](https://img.shields.io/badge/marketplace-build--and--push--docker--images-blue?logo=github&style=flat-square)](https://github.com/marketplace/actions/build-and-push-docker-images)
[![CI workflow](https://img.shields.io/github/workflow/status/docker/build-push-action/ci?label=ci&logo=github&style=flat-square)](https://github.com/docker/build-push-action/actions?workflow=ci)
[![Test workflow](https://img.shields.io/github/workflow/status/docker/build-push-action/test?label=test&logo=github&style=flat-square)](https://github.com/docker/build-push-action/actions?workflow=test)
[![Codecov](https://img.shields.io/codecov/c/github/docker/build-push-action?logo=codecov&style=flat-square)](https://codecov.io/gh/docker/build-push-action)

## Upgrade from v1

`v2` of this action includes significant updates and now uses Docker [Buildx](https://github.com/docker/buildx). It's
also rewritten as a [typescript-action](https://github.com/actions/typescript-action/) to be as close as possible
of the [GitHub Runner](https://github.com/actions/virtual-environments) during its execution.

[Upgrade notes](UPGRADE.md) with many [usage examples](#advanced-usage) have been added to handle most use cases but
`v1` is still available through [`releases/v1` branch](https://github.com/docker/build-push-action/tree/releases/v1).

## About

GitHub Action to build and push Docker images with [Buildx](https://github.com/docker/buildx) with full support of the
features provided by [Moby BuildKit](https://github.com/moby/buildkit) builder toolkit. This includes multi-platform
build, secrets, remote cache, etc. and different builder deployment/namespacing options.

![Screenshot](.github/build-push-action.png)

___

* [Usage](#usage)
  * [Git context](#git-context)
  * [Path context](#path-context)
* [Advanced usage](#advanced-usage)
  * [Multi-platform image](docs/advanced/multi-platform.md)
  * [Secrets](docs/advanced/secrets.md)
  * [Isolated builders](docs/advanced/isolated-builders.md)
  * [Push to multi-registries](docs/advanced/push-multi-registries.md)
  * [Copy between registries](docs/advanced/copy-between-registries.md)  
  * [Cache](docs/advanced/cache.md)
  * [Local registry](docs/advanced/local-registry.md)
  * [Export image to Docker](docs/advanced/export-docker.md)
  * [Share built image between jobs](docs/advanced/share-image-jobs.md)
  * [Handle tags and labels](docs/advanced/tags-labels.md)
  * [Update DockerHub repo description](docs/advanced/dockerhub-desc.md)
* [Customizing](#customizing)
  * [inputs](#inputs)
  * [outputs](#outputs)
* [Troubleshooting](#troubleshooting)
* [Keep up-to-date with GitHub Dependabot](#keep-up-to-date-with-github-dependabot)

## Usage

By default, this action uses the [Git context](#git-context) so you don't need to use the
[`actions/checkout`](https://github.com/actions/checkout/) action to checkout the repository because this will be
done directly by buildkit. The git reference will be based on the [event that triggered your workflow](https://docs.github.com/en/actions/reference/events-that-trigger-workflows)
and will result in the following context: `https://github.com/<owner>/<repo>.git#<ref>`.

Be careful because **any file mutation in the steps that precede the build step will be ignored, including processing of the `.dockerignore` file** since
the context is based on the git reference. However, you can use the [Path context](#path-context) using the
[`context` input](#inputs) alongside the [`actions/checkout`](https://github.com/actions/checkout/) action to remove
this restriction.

In the examples below we are using 3 other actions:

* [`setup-buildx`](https://github.com/docker/setup-buildx-action) action will create and boot a builder using by 
default the `docker-container` [builder driver](https://github.com/docker/buildx/blob/master/docs/reference/buildx_create.md#driver).
This is **not required but recommended** using it to be able to build multi-platform images, export cache, etc.
* [`setup-qemu`](https://github.com/docker/setup-qemu-action) action can be useful if you want
to add emulation support with QEMU to be able to build against more platforms. 
* [`login`](https://github.com/docker/login-action) action will take care to log in against a Docker registry.

### Git context

```yaml
name: ci

on:
  push:
    branches:
      - 'master'

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
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
        id: docker_build
        uses: docker/build-push-action@v2
        with:
          push: true
          tags: user/app:latest
```

Building from the current repository automatically uses the [GitHub Token](https://help.github.com/en/actions/configuring-and-managing-workflows/authenticating-with-the-github_token)
so it does not need to be passed. If you want to authenticate against another private repository, you have to use
a [secret](docs/advanced/secrets.md) named `GIT_AUTH_TOKEN` to be able to authenticate against it with buildx:

```yaml
      -
        name: Build and push
        id: docker_build
        uses: docker/build-push-action@v2
        with:
          push: true
          tags: user/app:latest
          secrets: |
            GIT_AUTH_TOKEN=${{ secrets.MYTOKEN }}
```

### Path context

```yaml
name: ci

on:
  push:
    branches:
      - 'master'

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
```

## Advanced usage

* [Multi-platform image](docs/advanced/multi-platform.md)
* [Secrets](docs/advanced/secrets.md)
* [Isolated builders](docs/advanced/isolated-builders.md)
* [Push to multi-registries](docs/advanced/push-multi-registries.md)
* [Copy between registries](docs/advanced/copy-between-registries.md)
* [Cache](docs/advanced/cache.md)
* [Local registry](docs/advanced/local-registry.md)
* [Export image to Docker](docs/advanced/export-docker.md)
* [Share built image between jobs](docs/advanced/share-image-jobs.md)
* [Handle tags and labels](docs/advanced/tags-labels.md)
* [Update DockerHub repo description](docs/advanced/dockerhub-desc.md)

## Customizing

### inputs

Following inputs can be used as `step.with` keys

> `List` type is a newline-delimited string
> ```yaml
> cache-from: |
>   user/app:cache
>   type=local,src=path/to/dir
> ```

> `CSV` type is a comma-delimited string
> ```yaml
> tags: name/app:latest,name/app:1.0.0
> ```

| Name                | Type     | Description                        |
|---------------------|----------|------------------------------------|
| `allow`             | List/CSV | List of [extra privileged entitlement](https://github.com/docker/buildx/blob/master/docs/reference/buildx_build.md#allow) (eg. `network.host,security.insecure`) |
| `builder`           | String   | Builder instance (see [setup-buildx](https://github.com/docker/setup-buildx-action) action) |
| `build-args`        | List     | List of build-time variables |
| `cache-from`        | List     | List of [external cache sources](https://github.com/docker/buildx/blob/master/docs/reference/buildx_build.md#cache-from) (eg. `type=local,src=path/to/dir`) |
| `cache-to`          | List     | List of [cache export destinations](https://github.com/docker/buildx/blob/master/docs/reference/buildx_build.md#cache-to) (eg. `type=local,dest=path/to/dir`) |
| `context`           | String   | Build's context is the set of files located in the specified [`PATH` or `URL`](https://docs.docker.com/engine/reference/commandline/build/) (default [Git context](#git-context)) |
| `file`              | String   | Path to the Dockerfile. (default `{context}/Dockerfile`) |
| `labels`            | List     | List of metadata for an image |
| `load`              | Bool     | [Load](https://github.com/docker/buildx/blob/master/docs/reference/buildx_build.md#load) is a shorthand for `--output=type=docker` (default `false`) |
| `network`           | String   | Set the networking mode for the `RUN` instructions during build |
| `no-cache`          | Bool     | Do not use cache when building the image (default `false`) |
| `outputs`           | List     | List of [output destinations](https://github.com/docker/buildx/blob/master/docs/reference/buildx_build.md#output) (format: `type=local,dest=path`) |
| `platforms`         | List/CSV | List of [target platforms](https://github.com/docker/buildx/blob/master/docs/reference/buildx_build.md#platform) for build |
| `pull`              | Bool     | Always attempt to pull a newer version of the [`FROM`](https://docs.docker.com/engine/reference/builder/#from) image (default `false`) |
| `push`              | Bool     | [Push](https://github.com/docker/buildx/blob/master/docs/reference/buildx_build.md#push) is a shorthand for `--output=type=registry` (default `false`) |
| `secrets`           | List     | List of secrets to expose to the build (eg. `key=string`, `GIT_AUTH_TOKEN=mytoken`) |
| `secret-files`      | List     | List of secret files to expose to the build (eg. `key=filename`, `MY_SECRET=./secret.txt`) |
| `ssh`               | List     | List of SSH agent socket or keys to expose to the build |
| `tags`              | List/CSV | List of tags |
| `target`            | String   | Sets the target stage to build |

### outputs
 
Following outputs are available

| Name          | Type    | Description                           |
|---------------|---------|---------------------------------------|
| `digest`      | String  | Image content-addressable identifier also called a digest |

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## Keep up-to-date with GitHub Dependabot

Since [Dependabot](https://docs.github.com/en/github/administering-a-repository/keeping-your-actions-up-to-date-with-github-dependabot)
has [native GitHub Actions support](https://docs.github.com/en/github/administering-a-repository/configuration-options-for-dependency-updates#package-ecosystem),
to enable it on your GitHub repo all you need to do is add the `.github/dependabot.yml` file:

```yaml
version: 2
updates:
  # Maintain dependencies for GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "daily"
```
