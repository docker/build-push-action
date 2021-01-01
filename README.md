[![GitHub release](https://img.shields.io/github/release/docker/build-push-action.svg?style=flat-square)](https://github.com/docker/build-push-action/releases/latest)
[![GitHub marketplace](https://img.shields.io/badge/marketplace-build--and--push--docker--images-blue?logo=github&style=flat-square)](https://github.com/marketplace/actions/build-and-push-docker-images)
[![CI workflow](https://img.shields.io/github/workflow/status/docker/build-push-action/ci?label=ci&logo=github&style=flat-square)](https://github.com/docker/build-push-action/actions?workflow=ci)
[![Test workflow](https://img.shields.io/github/workflow/status/docker/build-push-action/test?label=test&logo=github&style=flat-square)](https://github.com/docker/build-push-action/actions?workflow=test)
[![Codecov](https://img.shields.io/codecov/c/github/docker/build-push-action?logo=codecov&style=flat-square)](https://codecov.io/gh/docker/build-push-action)

## Upgrade from v1

`v2` of this action includes significant updates and now uses Docker [Buildx](https://github.com/docker/buildx). It
works with 3 new actions ([login](https://github.com/docker/login-action), [setup-buildx](https://github.com/docker/setup-buildx-action)
and [setup-qemu](https://github.com/docker/setup-qemu-action)) that we have created. It's also rewritten as a
[typescript-action](https://github.com/actions/typescript-action/) to be as close as possible of the
[GitHub Runner](https://github.com/actions/virtual-environments) during its execution.

[Upgrade notes](UPGRADE.md) and many [usage examples](#usage) have been added to handle most use cases but `v1` is
still available through [`releases/v1` branch](https://github.com/docker/build-push-action/tree/releases/v1).

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
* [Advanced usage](#advanced-usage)
  * [Push to multi-registries](#push-to-multi-registries)
  * [Cache to registry](#cache-to-registry)
  * [Local registry](#local-registry)
  * [Export image to Docker](#export-image-to-docker)
  * [Leverage GitHub cache](#leverage-github-cache)
  * [Handle tags and labels](#handle-tags-and-labels)
  * [Update DockerHub repo description](#update-dockerhub-repo-description)
* [Customizing](#customizing)
  * [inputs](#inputs)
  * [outputs](#outputs)
* [Notes](#notes)
  * [Multi-line secret value](#multi-line-secret-value)
* [Troubleshooting](#troubleshooting)
* [Keep up-to-date with GitHub Dependabot](#keep-up-to-date-with-github-dependabot)
* [Limitation](#limitation)

## Usage

This action uses our [setup-buildx](https://github.com/docker/setup-buildx-action) action that extends the
`docker build` command named [buildx](https://github.com/docker/buildx) with the full support of the features
provided by [Moby BuildKit](https://github.com/moby/buildkit) builder toolkit. This includes multi-arch build,
build-secrets, remote cache, etc. and different builder deployment/namespacing options.

### Git context

The default behavior of this action is to use the Git context invoked by your workflow.
(eg. `https://github.com/<owner>/<repo>.git#<ref>`)

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
          build-args: |
            arg1=value1
            arg2=value2
      -
        name: Image digest
        run: echo ${{ steps.docker_build.outputs.digest }}
```

Building from current repository automatically uses the [GitHub Token](https://help.github.com/en/actions/configuring-and-managing-workflows/authenticating-with-the-github_token)
as provided by `secrets` so it does not need to be passed. But if you want to authenticate against another private
repository, you have to use a secret named `GIT_AUTH_TOKEN` to be able to authenticate against it with buildx:

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

> :warning: Subdir for Git context is not yet supported ([moby/buildkit#1684](https://github.com/moby/buildkit/issues/1684))
> but you can use the [path context](#path-context) in the meantime.

> More info: https://docs.docker.com/engine/reference/commandline/build/#git-repositories

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
          file: ./Dockerfile
          platforms: linux/386,linux/amd64,linux/arm/v6,linux/arm/v7,linux/arm64,linux/ppc64le,linux/s390x
          push: true
          tags: |
            user/app:latest
            user/app:1.0.0
```

## Advanced usage

### Push to multi-registries

The following workflow will connect you to [DockerHub](https://github.com/docker/login-action#dockerhub)
and [GitHub Container Registry](https://github.com/docker/login-action#github-container-registry) and push the
image to these registries.

<details>
  <summary><b>Show workflow</b></summary>
  
  ```yaml
  name: ci
  
  on:
    push:
      branches: master
  
  jobs:
    multi-registries:
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
          name: Login to GitHub Container Registry
          uses: docker/login-action@v1 
          with:
            registry: ghcr.io
            username: ${{ github.repository_owner }}
            password: ${{ secrets.CR_PAT }}
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
              ghcr.io/user/app:latest
              ghcr.io/user/app:1.0.0
  ```
</details>

### Cache to registry

You can import/export cache from a cache manifest or (special) image configuration on the registry.

<details>
  <summary><b>Show workflow</b></summary>
  
  ```yaml
  name: ci

  on:
    push:
      branches: master

  jobs:
    registry-cache:
      runs-on: ubuntu-latest
      steps:
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
            push: true
            tags: user/app:latest
            cache-from: type=registry,ref=user/app:latest
            cache-to: type=inline
  ```
</details>

### Local registry

For testing purposes you may need to create a [local registry](https://hub.docker.com/_/registry) to push images into:

<details>
  <summary><b>Show workflow</b></summary>
  
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
          name: Set up QEMU
          uses: docker/setup-qemu-action@v1
        -
          name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v1
          with:
            driver-opts: network=host
        -
          name: Build and push to local registry
          uses: docker/build-push-action@v2
          with:
            push: true
            tags: localhost:5000/name/app:latest
        -
          name: Inspect
          run: |
            docker buildx imagetools inspect localhost:5000/name/app:latest
  ```
</details>

### Export image to Docker

You may want your build result to be available in the Docker client through `docker images` to be able to use it
in another step of your workflow:

<details>
  <summary><b>Show workflow</b></summary>
  
  ```yaml
  name: ci

  on:
    push:
      branches: master

  jobs:
    export-docker:
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
            file: ./Dockerfile
            load: true
            tags: myimage:latest
        -
          name: Inspect
          run: |
            docker image inspect myimage:latest
  ```
</details>

### Leverage GitHub cache

You can leverage [GitHub cache](https://docs.github.com/en/actions/configuring-and-managing-workflows/caching-dependencies-to-speed-up-workflows)
using [actions/cache](https://github.com/actions/cache) with this action:

<details>
  <summary><b>Show workflow</b></summary>
  
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
            push: true
            tags: user/app:latest
            cache-from: type=local,src=/tmp/.buildx-cache
            cache-to: type=local,dest=/tmp/.buildx-cache
  ```
</details>

> If you want to [export layers for all stages](https://github.com/docker/buildx#--cache-tonametypetypekeyvalue),
> you have to specify `mode=max` attribute in `cache-to`.

### Handle tags and labels

If you come from [`v1`](https://github.com/docker/build-push-action/tree/releases/v1#readme) and want an
"automatic" tag management and [OCI Image Format Specification](https://github.com/opencontainers/image-spec/blob/master/annotations.md)
for labels, you can do it in a dedicated step. The following workflow will use the [Docker meta action](https://github.com/crazy-max/ghaction-docker-meta)
to handle tags and labels based on GitHub actions events and Git metadata.

<details>
  <summary><b>Show workflow</b></summary>
  
  ```yaml
  name: ci

  on:
    schedule:
      - cron: '0 10 * * *' # everyday at 10am
    push:
      branches:
        - '**'
      tags:
        - 'v*.*.*'
    pull_request:

  jobs:
    docker:
      runs-on: ubuntu-latest
      steps:
        -
          name: Checkout
          uses: actions/checkout@v2
        -
          name: Docker meta
          id: docker_meta
          uses: crazy-max/ghaction-docker-meta@v1
          with:
            images: name/app # list of Docker images to use as base name for tags
            tag-sha: true # add git short SHA as Docker tag
        -
          name: Set up QEMU
          uses: docker/setup-qemu-action@v1
        -
          name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v1
        -
          name: Login to DockerHub
          if: github.event_name != 'pull_request'
          uses: docker/login-action@v1 
          with:
            username: ${{ secrets.DOCKERHUB_USERNAME }}
            password: ${{ secrets.DOCKERHUB_TOKEN }}
        -
          name: Build and push
          id: docker_build
          uses: docker/build-push-action@v2
          with:
            context: .
            file: ./Dockerfile
            platforms: linux/amd64,linux/arm64,linux/386
            push: ${{ github.event_name != 'pull_request' }}
            tags: ${{ steps.docker_meta.outputs.tags }}
            labels: ${{ steps.docker_meta.outputs.labels }}
  ```
</details>

### Update DockerHub repo description

You can update the [DockerHub repository description](https://docs.docker.com/docker-hub/repos/) using
a third-party action called [DockerHub Description](https://github.com/peter-evans/dockerhub-description)
with this action:

<details>
  <summary><b>Show workflow</b></summary>
  
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
</details>

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
| `builder`           | String   | Builder instance (see [setup-buildx](https://github.com/docker/setup-buildx-action) action) |
| `context`           | String   | Build's context is the set of files located in the specified [`PATH` or `URL`](https://docs.docker.com/engine/reference/commandline/build/) (default [Git context](#git-context)) |
| `file`              | String   | Path to the Dockerfile. (default `{context}/Dockerfile`) |
| `build-args`        | List     | List of build-time variables |
| `labels`            | List     | List of metadata for an image |
| `tags`              | List/CSV | List of tags |
| `pull`              | Bool     | Always attempt to pull a newer version of the image (default `false`) |
| `target`            | String   | Sets the target stage to build |
| `allow`             | List/CSV | List of [extra privileged entitlement](https://github.com/docker/buildx#--allowentitlement) (eg. `network.host,security.insecure`) |
| `no-cache`          | Bool     | Do not use cache when building the image (default `false`) |
| `platforms`         | List/CSV | List of [target platforms](https://github.com/docker/buildx#---platformvaluevalue) for build |
| `load`              | Bool     | [Load](https://github.com/docker/buildx#--load) is a shorthand for `--output=type=docker` (default `false`) |
| `push`              | Bool     | [Push](https://github.com/docker/buildx#--push) is a shorthand for `--output=type=registry` (default `false`) |
| `outputs`           | List     | List of [output destinations](https://github.com/docker/buildx#-o---outputpath-typetypekeyvalue) (format: `type=local,dest=path`) |
| `cache-from`        | List     | List of [external cache sources](https://github.com/docker/buildx#--cache-fromnametypetypekeyvalue) (eg. `type=local,src=path/to/dir`) |
| `cache-to`          | List     | List of [cache export destinations](https://github.com/docker/buildx#--cache-tonametypetypekeyvalue) (eg. `type=local,dest=path/to/dir`) |
| `secrets`           | List     | List of secrets to expose to the build (eg. `key=value`, `GIT_AUTH_TOKEN=mytoken`) |
| `ssh`               | List     | List of SSH agent socket or keys to expose to the build |

### outputs

Following outputs are available

| Name          | Type    | Description                           |
|---------------|---------|---------------------------------------|
| `digest`      | String  | Image content-addressable identifier also called a digest |

## Notes

### Multi-line secret value

To handle multi-line value for a secret, you will need to place the key-value pair between quotes:

```yaml
secrets: |
  "MYSECRET=${{ secrets.GPG_KEY }}"
  GIT_AUTH_TOKEN=abcdefghi,jklmno=0123456789
  "MYSECRET=aaaaaaaa
  bbbbbbb
  ccccccccc"
  FOO=bar
  "EMPTYLINE=aaaa
  
  bbbb
  ccc"
  "JSON_SECRET={""key1"":""value1"",""key2"":""value2""}"
```

| Key                | Value                                            |
|--------------------|--------------------------------------------------|
| `MYSECRET`         | `***********************` |
| `GIT_AUTH_TOKEN`   | `abcdefghi,jklmno=0123456789` |
| `MYSECRET`         | `aaaaaaaa\nbbbbbbb\nccccccccc` |
| `FOO`              | `bar` |
| `EMPTYLINE`        | `aaaa\n\nbbbb\nccc` |
| `JSON_SECRET`      | `{"key1":"value1","key2":"value2"}` |

> Note: all quote signs need to be doubled for escaping.

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

## Limitation

This action is only available for Linux [virtual environments](https://help.github.com/en/articles/virtual-environments-for-github-actions#supported-virtual-environments-and-hardware-resources).
