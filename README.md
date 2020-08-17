## About

GitHub Action to build and push Docker images.

___

* [Usage](#usage)
  * [Quick start](#quick-start)
  * [Git context](#git-context)
* [Customizing](#customizing)
  * [inputs](#inputs)
  * [outputs](#outputs)
* [Limitation](#limitation)

## Usage

This action uses our [setup-buildx](https://github.com/docker/setup-buildx-action) action that extends the
`docker build` command named [buildx](https://github.com/docker/buildx) with the full support of the features
provided by [Moby BuildKit](https://github.com/moby/buildkit) builder toolkik. This includes multi-arch build,
build-secrets, remote cache, etc. and different builder deployment/namespacing options.

### Quick start

```yaml
name: ci

on:
  pull_request:
    branches: master
  push:
    branches: master
    tags:

jobs:
  buildx:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v2
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@v1
        with:
          platforms: all
      -
        name: Set up Docker Buildx
        id: buildx
        uses: docker/setup-buildx-action@v1
      -
        name: Login to DockerHub
        uses: crazy-max/ghaction-docker-login@v1 # switch to docker/login-action@v1 when available 
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      -
        name: Build and push
        uses: docker/build-push-action@v2
        with:
          builder: ${{ steps.buildx.outputs.name }}
          platforms: linux/amd64,linux/arm/v6,linux/arm/v7,linux/arm64,linux/386,linux/ppc64le,linux/s390x
          push: true
          tags: |
            user/app:latest
            user/app:1.0.0
```

### Git context

You can build from Git directly without [`actions/checkout`](https://github.com/actions/checkout/) action,
even in private repositories if your `context` is a valid Git url:

```yaml
name: ci

on:
  pull_request:
    branches: master
  push:
    branches: master
    tags:

jobs:
  git-context:
    runs-on: ubuntu-latest
    steps:
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@v1
        with:
          platforms: all
      -
        name: Set up Docker Buildx
        id: buildx
        uses: docker/setup-buildx-action@v1
        with:
          version: latest
      -
        name: Login to DockerHub
        uses: crazy-max/ghaction-docker-login@v1 # switch to docker/login-action@v1 when available
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      -
        name: Build and push
        uses: ./
        env:
          GIT_AUTH_TOKEN: ${{ github.token }}
        with:
          context: "${{ github.repositoryUrl }}#${{ github.ref }}"
          builder: ${{ steps.buildx.outputs.name }}
          platforms: linux/amd64,linux/arm64,linux/386
          push: true
          tags: |
            name/app:latest
            name/app:1.0.0
```

## Customizing

### inputs

Following inputs can be used as `step.with` keys

| Name                | Type    | Default                           | Description                        |
|---------------------|---------|-----------------------------------|------------------------------------|
| `builder`           | String  |                                   | Builder instance (see [setup-buildx](https://github.com/docker/setup-buildx-action) action) |
| `context`           | String  | `.`                               | Build's context is the set of files located in the specified [`PATH` or `URL`](https://docs.docker.com/engine/reference/commandline/build/) |
| `file`              | String  | `./Dockerfile`                    | Path to the Dockerfile. |
| `build-args`        | List    |                                   | List of build-time variables |
| `labels`            | List    |                                   | List of metadata for an image |
| `tags`              | List    |                                   | List of tags |
| `pull`              | Bool    | `false`                           | Always attempt to pull a newer version of the image |
| `target`            | String  |                                   | Sets the target stage to build |
| `allow`             | List    |                                   | List of [extra privileged entitlement](https://github.com/docker/buildx#--allowentitlement) (eg. `network.host,security.insecure`) |
| `no-cache`          | Bool    | `false`                           | Do not use cache when building the image |
| `platforms`         | List    |                                   | List of [target platforms](https://github.com/docker/buildx#---platformvaluevalue) for build |
| `load`              | Bool    | `false`                           | [Load](https://github.com/docker/buildx#--load) is a shorthand for `--output=type=docker` |
| `push`              | Bool    | `false`                           | [Push](https://github.com/docker/buildx#--push) is a shorthand for `--output=type=registry` |
| `outputs`           | List    |                                   | List of [output destinations](https://github.com/docker/buildx#-o---outputpath-typetypekeyvalue) (format: `type=local,dest=path`) |
| `cache-from`        | List    |                                   | List of [external cache sources](https://github.com/docker/buildx#--cache-fromnametypetypekeyvalue) (eg. `user/app:cache`, `type=local,src=path/to/dir`) |
| `cache-to`          | List    |                                   | List of [cache export destinations](https://github.com/docker/buildx#--cache-tonametypetypekeyvalue) (eg. `user/app:cache`, `type=local,dest=path/to/dir`) |

> List type can be a comma or newline-delimited string
> ```yaml
> tags: name/app:latest,name/app:1.0.0
> ```
> ```yaml
> tags: |
>   name/app:latest
>   name/app:1.0.0
> ```

### outputs

Following outputs are available

| Name          | Type    | Description                           |
|---------------|---------|---------------------------------------|
| `digest`      | String  | Image content-addressable identifier also called a digest |

### environment variables

Following environment variables can be used as `step.env` keys

| Name                     | Description                           |
|--------------------------|---------------------------------------|
| `GIT_AUTH_HEADER`**¹**   | Raw authorization header to authenticate against git repository |
| `GIT_AUTH_TOKEN`**¹**    | `x-access-token` basic auth to authenticate against git repository |

> **¹** Only used if `input.context` is a valid git uri.

## Limitation

This action is only available for Linux [virtual environments](https://help.github.com/en/articles/virtual-environments-for-github-actions#supported-virtual-environments-and-hardware-resources).
