[![GitHub release](https://img.shields.io/github/release/docker/build-push-action.svg?style=flat-square)](https://github.com/docker/build-push-action/releases/latest)
[![GitHub marketplace](https://img.shields.io/badge/marketplace-docker--build--push-blue?logo=github&style=flat-square)](https://github.com/marketplace/actions/docker-build-push)
[![CI workflow](https://img.shields.io/github/workflow/status/docker/build-push-action/ci?label=ci&logo=github&style=flat-square)](https://github.com/docker/build-push-action/actions?workflow=ci)
[![Test workflow](https://img.shields.io/github/workflow/status/docker/build-push-action/test?label=test&logo=github&style=flat-square)](https://github.com/docker/build-push-action/actions?workflow=test)

## About

GitHub Action to build and push Docker images with [Buildx](https://github.com/docker/buildx).

> :bulb: See also:
> * [login](https://github.com/docker/login-action) action
> * [setup-buildx](https://github.com/docker/setup-buildx-action) action
> * [setup-qemu](https://github.com/docker/setup-qemu-action) action

![Screenshot](.github/build-push-action.png)

___

* [Usage](#usage)
  * [Git context](#git-context)
  * [Path context](#path-context)
  * [Isolated builders](#isolated-builders)
  * [Multi-platform image](#multi-platform-image)
  * [Leverage GitHub cache](#leverage-github-cache)
  * [Complete workflow](#complete-workflow)
* [Customizing](#customizing)
  * [inputs](#inputs)
  * [outputs](#outputs)
* [Keep up-to-date with GitHub Dependabot](#keep-up-to-date-with-github-dependabot)
* [Limitation](#limitation)

## Usage

This action uses our [setup-buildx](https://github.com/docker/setup-buildx-action) action that extends the
`docker build` command named [buildx](https://github.com/docker/buildx) with the full support of the features
provided by [Moby BuildKit](https://github.com/moby/buildkit) builder toolkit. This includes multi-arch build,
build-secrets, remote cache, etc. and different builder deployment/namespacing options.

### Git context

The default behavior of this action is to use the Git context invoked by your workflow (`https://github.com/owner/repo#ref`).

```yaml
name: ci

on:
  push:
    branches: master

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@master
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@master
      -
        name: Login to DockerHub
        uses: docker/login-action@v1 
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      -
        name: Build and push
        id: docker_build
        uses: docker/build-push-action@v2
        with:
          push: true
          tags: user/app:latest
      -
        name: Image digest
        run: echo ${{ steps.docker_build.outputs.digest }}
```

If you use this action in a private repository, you have to pass the [GitHub Token](https://help.github.com/en/actions/configuring-and-managing-workflows/authenticating-with-the-github_token)
as a secret named `GIT_AUTH_TOKEN` to be able to authenticate against it with buildx:

```yaml
      -
        name: Build and push
        id: docker_build
        uses: docker/build-push-action@v2
        with:
          push: true
          tags: user/app:latest
          secrets: |
            GIT_AUTH_TOKEN=${{ github.token }}
```

### Path context

You can also use the `PATH` context alongside the [`actions/checkout`](https://github.com/actions/checkout/) action.

```yaml
name: ci

on:
  push:
    branches: master

jobs:
  path-context:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v2
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@master
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@master
      -
        name: Login to DockerHub
        uses: docker/login-action@v1
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      -
        name: Build and push
        uses: docker/build-push-action@v2
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/amd64,linux/arm64,linux/386
          push: true
          tags: user/app:latest
```

### Isolated builders

```yaml
name: ci

on:
  push:
    branches: master

jobs:
  multi-builders:
    runs-on: ubuntu-latest
    steps:
      -
        uses: docker/setup-buildx-action@master
        id: builder1
      -
        uses: docker/setup-buildx-action@master
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
          target: mytarget1
      -
        name: Build against builder2
        uses: docker/build-push-action@v2
        with:
          builder: ${{ steps.builder2.outputs.name }}
          target: mytarget2
```

### Multi-platform image

```yaml
name: ci

on:
  push:
    branches: master

jobs:
  multi:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v2
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@master
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@master
      -
        name: Login to DockerHub
        uses: docker/login-action@v1 
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      -
        name: Build and push
        uses: docker/build-push-action@v2
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/386,linux/amd64,linux/arm/v6,linux/arm/v7,linux/arm64,linux/ppc64le,linux/s390x
          push: true
          tags: |
            user/app:latest
            user/app:1.0.0
```

### Local registry

For testing purposes you may need to create a [local registry](https://hub.docker.com/_/registry) to push images into.

```yaml
name: ci

on:
  push:
    branches: master

jobs:
  local-registry:
    runs-on: ubuntu-latest
    services:
      registry:
        image: registry:2
        ports:
          - 5000:5000
    steps:
      -
        name: Checkout
        uses: actions/checkout@v2
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@master
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@master
        with:
          driver-opts: network=host
          #buildkitd-flags: --allow-insecure-entitlement security.insecure # default
      -
        name: Build and push to local registry
        uses: docker/build-push-action@v2
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/386,linux/amd64,linux/arm/v6,linux/arm/v7,linux/arm64,linux/ppc64le,linux/s390x
          allow: network.host,security.insecure
          push: true
          tags: localhost:5000/name/app:latest
      -
        name: Inspect
        run: |
          docker buildx imagetools inspect localhost:5000/name/app:latest
```

### Leverage GitHub cache

You can leverage [GitHub cache](https://docs.github.com/en/actions/configuring-and-managing-workflows/caching-dependencies-to-speed-up-workflows)
using [@actions/cache](https://github.com/actions/cache) with this action.

```yaml
name: ci

on:
  push:
    branches: master

jobs:
  github-cache:
    runs-on: ubuntu-latest
    steps:
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@master
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
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      -
        name: Build and push
        id: docker_build
        uses: docker/build-push-action@v2
        with:
          push: true
          tags: user/app:latest
          cache-from: type=local,src=/tmp/.buildx-cache
          cache-to: type=local,dest=/tmp/.buildx-cache
      -
        name: Image digest
        run: echo ${{ steps.docker_build.outputs.digest }}
```

### Complete workflow

* On `pull_request` event, Docker image `name/app:edge` is **built**.
* On `push` event, Docker image `name/app:edge` is **built** and **pushed** to DockerHub.
* On `schedule` event, Docker image `name/app:nightly` is **built** and **pushed** to DockerHub.
* On `push tags` event, Docker image `name/app:<version>` and `name/app:latest` is **built** and **pushed** to DockerHub.

```yaml
name: ci

on:
  schedule:
    - cron: '0 10 * * *' # everyday at 10am
  push:
    branches: master
    tags:
      - 'v*.*.*'
  pull_request:
    branches: master

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v2
      -
        name: Prepare
        id: prep
        run: |
          DOCKER_IMAGE=name/app
          VERSION=edge
          if [[ $GITHUB_REF == refs/tags/* ]]; then
            VERSION=${GITHUB_REF#refs/tags/v}
          fi
          if [ "${{ github.event_name }}" = "schedule" ]; then
            VERSION=nightly
          fi
          TAGS="${DOCKER_IMAGE}:${VERSION}"
          if [[ $VERSION =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            TAGS="$TAGS,${DOCKER_IMAGE}:latest"
          fi
          echo ::set-output name=tags::${TAGS}
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@master
      -
        name: Set up Docker Buildx
        id: buildx
        uses: docker/setup-buildx-action@master
      -
        name: Login to DockerHub
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v1 
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      -
        name: Build and push
        id: docker_build
        uses: docker/build-push-action@v2
        with:
          builder: ${{ steps.buildx.outputs.name }}
          context: .
          file: ./Dockerfile
          platforms: linux/amd64,linux/arm64,linux/386
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.prep.outputs.tags }}
```

## Customizing

### inputs

Following inputs can be used as `step.with` keys

| Name                | Type    | Description                        |
|---------------------|---------|------------------------------------|
| `builder`           | String  | Builder instance (see [setup-buildx](https://github.com/docker/setup-buildx-action) action) |
| `context`           | String  | Build's context is the set of files located in the specified [`PATH` or `URL`](https://docs.docker.com/engine/reference/commandline/build/) (default [Git context](#git-context)) |
| `file`              | String  | Path to the Dockerfile (default `Dockerfile`) |
| `build-args`        | List    | List of build-time variables |
| `labels`            | List    | List of metadata for an image |
| `tags`              | List    | List of tags |
| `pull`              | Bool    | Always attempt to pull a newer version of the image (default `false`) |
| `target`            | String  | Sets the target stage to build |
| `allow`             | List    | List of [extra privileged entitlement](https://github.com/docker/buildx#--allowentitlement) (eg. `network.host,security.insecure`) |
| `no-cache`          | Bool    | Do not use cache when building the image (default `false`) |
| `platforms`         | List    | List of [target platforms](https://github.com/docker/buildx#---platformvaluevalue) for build |
| `load`              | Bool    | [Load](https://github.com/docker/buildx#--load) is a shorthand for `--output=type=docker` (default `false`) |
| `push`              | Bool    | [Push](https://github.com/docker/buildx#--push) is a shorthand for `--output=type=registry` (default `false`) |
| `outputs`           | CSV     | List of [output destinations](https://github.com/docker/buildx#-o---outputpath-typetypekeyvalue) (format: `type=local,dest=path`) |
| `cache-from`        | CSV     | List of [external cache sources](https://github.com/docker/buildx#--cache-fromnametypetypekeyvalue) (eg. `type=local,src=path/to/dir`) |
| `cache-to`          | CSV     | List of [cache export destinations](https://github.com/docker/buildx#--cache-tonametypetypekeyvalue) (eg. `type=local,dest=path/to/dir`) |
| `secrets`           | CSV     | List of secrets to expose to the build (eg. `key=value`, `GIT_AUTH_TOKEN=mytoken`) |

> `List` type can be a comma or newline-delimited string
> ```yaml
> tags: name/app:latest,name/app:1.0.0
> ```
> ```yaml
> tags: |
>   name/app:latest
>   name/app:1.0.0
> ```

> `CSV` type must be a newline-delimited string
> ```yaml
> cache-from: user/app:cache
> ```
> ```yaml
> cache-from: |
>   user/app:cache
>   type=local,src=path/to/dir
> ```

### outputs

Following outputs are available

| Name          | Type    | Description                           |
|---------------|---------|---------------------------------------|
| `digest`      | String  | Image content-addressable identifier also called a digest |

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

## Limitation

This action is only available for Linux [virtual environments](https://help.github.com/en/articles/virtual-environments-for-github-actions#supported-virtual-environments-and-hardware-resources).
