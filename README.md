<p align="center">
  <picture>
    <!-- Dark mode -->
    <source media="(prefers-color-scheme: dark)" srcset="./Blacksmith_Logo-White-Large.png" width="300">
    <!-- Light mode -->
    <source media="(prefers-color-scheme: light)" srcset="./Blacksmith_Logo-Black-Large.png" width="300">
    <img alt="Blacksmith Logo" src="./Blacksmith_Logo-Black-Large.png" width="300">
  </picture>
</p>

[![GitHub release](https://img.shields.io/github/release/docker/build-push-action.svg?style=flat-square)](https://github.com/docker/build-push-action/releases/latest)
[![GitHub marketplace](https://img.shields.io/badge/marketplace-build--and--push--docker--images-blue?logo=github&style=flat-square)](https://github.com/marketplace/actions/build-and-push-docker-images)
[![CI workflow](https://img.shields.io/github/actions/workflow/status/docker/build-push-action/ci.yml?branch=master&label=ci&logo=github&style=flat-square)](https://github.com/docker/build-push-action/actions?workflow=ci)
[![Test workflow](https://img.shields.io/github/actions/workflow/status/docker/build-push-action/test.yml?branch=master&label=test&logo=github&style=flat-square)](https://github.com/docker/build-push-action/actions?workflow=test)
[![Codecov](https://img.shields.io/codecov/c/github/docker/build-push-action?logo=codecov&style=flat-square)](https://codecov.io/gh/docker/build-push-action)


GitHub Action to build and push Docker images with [Buildx](https://github.com/docker/buildx), designed exclusively for Blacksmith runners. This action leverages Blacksmith's stickydisk primitive to mount Docker layer caches directly into Blacksmith runners, providing out of the box incremental builds.

> **Important:** This action only works with Blacksmith runners. When running, it will:
> 1. Mount a repository-specific Sticky Disk volume containing Docker layer caches directly into the runner
> 2. Automatically spin up a local buildkit instance on top of this mounted volume
> 3. Override any remote builder configuration options to ensure optimal use of the local cache
>
> As a result, any configuration options related to remote builders or builder setup will be ignored.

___

## Usage

> **Note:** This action requires a Blacksmith runner. It will not work with standard GitHub runners or other CI environments.

In the examples below we are using these additional actions:

* [`setup-qemu`](https://github.com/docker/setup-qemu-action) action can be
  useful if you want to add emulation support with QEMU to be able to build
  against more platforms.
* [`login`](https://github.com/docker/login-action) action will take care to
  log in against a Docker registry.

Note that unlike the original Docker build-push action, you do not need to set up Buildx separately as this is handled automatically by the Blacksmith runner.

### Git context

By default, this action uses the [Git context](https://docs.docker.com/engine/reference/commandline/build/#git-repositories),
so you don't need to use the [`actions/checkout`](https://github.com/actions/checkout/)
action to check out the repository as this will be done directly by [BuildKit](https://github.com/moby/buildkit).

```yaml
name: ci

on:
  push:

jobs:
  docker:
    runs-on: blacksmith
    steps:
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@v3
      -
        name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      -
        name: Build and push
        uses: useblacksmith/build-push-action@v1
        with:
          push: true
          tags: user/app:latest
```

### Path context

```yaml
name: ci

on:
  push:

jobs:
  docker:
    runs-on: blacksmith
    steps:
      -
        name: Checkout
        uses: actions/checkout@v4
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@v3
      -
        name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      -
        name: Build and push
        uses: useblacksmith/build-push-action@v1
        with:
          context: .
          push: true
          tags: user/app:latest
```

## Examples

* [Multi-platform image](https://docs.docker.com/build/ci/github-actions/multi-platform/)
* [Secrets](https://docs.docker.com/build/ci/github-actions/secrets/)
* [Push to multi-registries](https://docs.docker.com/build/ci/github-actions/push-multi-registries/)
* [Manage tags and labels](https://docs.docker.com/build/ci/github-actions/manage-tags-labels/)
* [Cache management](https://docs.docker.com/build/ci/github-actions/cache/)
* [Export to Docker](https://docs.docker.com/build/ci/github-actions/export-docker/)
* [Test before push](https://docs.docker.com/build/ci/github-actions/test-before-push/)
* [Local registry](https://docs.docker.com/build/ci/github-actions/local-registry/)
* [Share built image between jobs](https://docs.docker.com/build/ci/github-actions/share-image-jobs/)
* [Named contexts](https://docs.docker.com/build/ci/github-actions/named-contexts/)
* [Copy image between registries](https://docs.docker.com/build/ci/github-actions/copy-image-registries/)
* [Update Docker Hub repo description](https://docs.docker.com/build/ci/github-actions/update-dockerhub-desc/)
* [SBOM and provenance attestations](https://docs.docker.com/build/ci/github-actions/attestations/)
* [Annotations](https://docs.docker.com/build/ci/github-actions/annotations/)
* [Reproducible builds](https://docs.docker.com/build/ci/github-actions/reproducible-builds/)

## Summaries

This action generates a [job summary](https://github.blog/2022-05-09-supercharging-github-actions-with-job-summaries/)
that provides a detailed overview of the build execution. The summary shows an
overview of all the steps executed during the build, including the build inputs
and eventual errors.

![build-push-action job summary](./.github/build-push-summary.png)

The summary also includes a link for downloading the build record with
additional details about the build, including build stats, logs, outputs, and
more. The build record can be imported to Docker Desktop for inspecting the
build in greater detail.

Summaries are enabled by default, but can be disabled with the
`DOCKER_BUILD_SUMMARY` [environment variable](#environment-variables).

For more information about summaries, refer to the
[documentation](https://docs.docker.com/go/build-summary/).

## Customizing

### inputs

The following inputs can be used as `step.with` keys:

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

| Name               | Type        | Description                                                                                                                                                                       |
|--------------------|-------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `add-hosts`        | List/CSV    | List of [customs host-to-IP mapping](https://docs.docker.com/engine/reference/commandline/build/#add-entries-to-container-hosts-file---add-host) (e.g., `docker:10.180.0.1`)      |
| `allow`            | List/CSV    | List of [extra privileged entitlement](https://docs.docker.com/engine/reference/commandline/buildx_build/#allow) (e.g., `network.host,security.insecure`)                         |
| `annotations`      | List        | List of annotation to set to the image                                                                                                                                            |
| `attests`          | List        | List of [attestation](https://docs.docker.com/build/attestations/) parameters (e.g., `type=sbom,generator=image`)                                                                 | 
| `builder`          | String      | Builder instance (see [setup-buildx](https://github.com/docker/setup-buildx-action) action)                                                                                       |
| `build-args`       | List        | List of [build-time variables](https://docs.docker.com/engine/reference/commandline/buildx_build/#build-arg)                                                                      |
| `build-contexts`   | List        | List of additional [build contexts](https://docs.docker.com/engine/reference/commandline/buildx_build/#build-context) (e.g., `name=path`)                                         |
| `cache-from`       | List        | List of [external cache sources](https://docs.docker.com/engine/reference/commandline/buildx_build/#cache-from) (e.g., `type=local,src=path/to/dir`)                              |
| `cache-to`         | List        | List of [cache export destinations](https://docs.docker.com/engine/reference/commandline/buildx_build/#cache-to) (e.g., `type=local,dest=path/to/dir`)                            |
| `cgroup-parent`    | String      | Optional [parent cgroup](https://docs.docker.com/engine/reference/commandline/build/#use-a-custom-parent-cgroup---cgroup-parent) for the container used in the build              |
| `context`          | String      | Build's context is the set of files located in the specified [`PATH` or `URL`](https://docs.docker.com/engine/reference/commandline/build/) (default [Git context](#git-context)) |
| `file`             | String      | Path to the Dockerfile. (default `{context}/Dockerfile`)                                                                                                                          |
| `labels`           | List        | List of metadata for an image                                                                                                                                                     |
| `load`             | Bool        | [Load](https://docs.docker.com/engine/reference/commandline/buildx_build/#load) is a shorthand for `--output=type=docker` (default `false`)                                       |
| `network`          | String      | Set the networking mode for the `RUN` instructions during build                                                                                                                   |
| `no-cache`         | Bool        | Do not use cache when building the image (default `false`)                                                                                                                        |
| `no-cache-filters` | List/CSV    | Do not cache specified stages                                                                                                                                                     |
| `outputs`          | List        | List of [output destinations](https://docs.docker.com/engine/reference/commandline/buildx_build/#output) (format: `type=local,dest=path`)                                         |
| `platforms`        | List/CSV    | List of [target platforms](https://docs.docker.com/engine/reference/commandline/buildx_build/#platform) for build                                                                 |
| `provenance`       | Bool/String | Generate [provenance](https://docs.docker.com/build/attestations/slsa-provenance/) attestation for the build (shorthand for `--attest=type=provenance`)                           |
| `pull`             | Bool        | Always attempt to pull all referenced images (default `false`)                                                                                                                    |
| `push`             | Bool        | [Push](https://docs.docker.com/engine/reference/commandline/buildx_build/#push) is a shorthand for `--output=type=registry` (default `false`)                                     |
| `sbom`             | Bool/String | Generate [SBOM](https://docs.docker.com/build/attestations/sbom/) attestation for the build (shorthand for `--attest=type=sbom`)                                                  |
| `secrets`          | List        | List of [secrets](https://docs.docker.com/engine/reference/commandline/buildx_build/#secret) to expose to the build (e.g., `key=string`, `GIT_AUTH_TOKEN=mytoken`)                |
| `secret-envs`      | List/CSV    | List of [secret env vars](https://docs.docker.com/engine/reference/commandline/buildx_build/#secret) to expose to the build (e.g., `key=envname`, `MY_SECRET=MY_ENV_VAR`)         |
| `secret-files`     | List        | List of [secret files](https://docs.docker.com/engine/reference/commandline/buildx_build/#secret) to expose to the build (e.g., `key=filename`, `MY_SECRET=./secret.txt`)         |
| `shm-size`         | String      | Size of [`/dev/shm`](https://docs.docker.com/engine/reference/commandline/buildx_build/#shm-size) (e.g., `2g`)                                                                    |
| `ssh`              | List        | List of [SSH agent socket or keys](https://docs.docker.com/engine/reference/commandline/buildx_build/#ssh) to expose to the build                                                 |
| `tags`             | List/CSV    | List of tags                                                                                                                                                                      |
| `target`           | String      | Sets the target stage to build                                                                                                                                                    |
| `ulimit`           | List        | [Ulimit](https://docs.docker.com/engine/reference/commandline/buildx_build/#ulimit) options (e.g., `nofile=1024:1024`)                                                            |
| `github-token`     | String      | GitHub Token used to authenticate against a repository for [Git context](#git-context) (default `${{ github.token }}`)                                                            |

### outputs

The following outputs are available:

| Name       | Type    | Description           |
|------------|---------|-----------------------|
| `imageid`  | String  | Image ID              |
| `digest`   | String  | Image digest          |
| `metadata` | JSON    | Build result metadata |

### environment variables

| Name                                 | Type   | Default | Description                                                                                                                                                                                                                                                        |
|--------------------------------------|--------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `DOCKER_BUILD_CHECKS_ANNOTATIONS`    | Bool   | `true`  | If `false`, GitHub annotations are not generated for [build checks](https://docs.docker.com/build/checks/)                                                                                                                                                         |
| `DOCKER_BUILD_SUMMARY`               | Bool   | `true`  | If `false`, [build summary](https://docs.docker.com/build/ci/github-actions/build-summary/) generation is disabled                                                                                                                                                 |
| `DOCKER_BUILD_RECORD_UPLOAD`         | Bool   | `true`  | If `false`, build record upload as [GitHub artifact](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts) is disabled                                                                                                            |
| `DOCKER_BUILD_RECORD_RETENTION_DAYS` | Number |         | Duration after which build record artifact will expire in days. Defaults to repository/org [retention settings](https://docs.github.com/en/actions/learn-github-actions/usage-limits-billing-and-administration#artifact-and-log-retention-policy) if unset or `0` |

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## Contributing

Want to contribute? Awesome! You can find information about contributing to
this project in the [CONTRIBUTING.md](/.github/CONTRIBUTING.md)
