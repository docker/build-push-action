## About

GitHub Action to set up Docker [Buildx](https://github.com/docker/buildx).

___

* [Usage](#usage)
  * [Quick start](#quick-start)
  * [With QEMU](#with-qemu)
* [Customizing](#customizing)
  * [inputs](#inputs)
  * [outputs](#outputs)
  * [environment variables](#environment-variables)
* [Limitation](#limitation)

## Usage

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
        name: Set up Docker Buildx
        id: buildx
        uses: docker/actions/setup-buildx@v2
        with:
          buildx-version: latest
      -
        name: Available platforms
        run: echo ${{ steps.buildx.outputs.platforms }}
```

### With QEMU

If you want support for more platforms you can use our [setup-qemu](../setup-qemu) action:

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
        uses: docker/actions/setup-qemu@v2
        with:
          qemu-version: latest
      -
        name: Set up Docker Buildx
        id: buildx
        uses: docker/actions/setup-buildx@v2
        with:
          buildx-version: latest
      -
        name: Available platforms
        run: echo ${{ steps.buildx.outputs.platforms }}
```

## Customizing

### inputs

Following inputs can be used as `step.with` keys

| Name             | Type    | Default   | Description                        |
|------------------|---------|-----------|------------------------------------|
| `buildx-version` | String  | `latest`  | [Buildx](https://github.com/docker/buildx) version. Example: `v0.3.0` |

### outputs

Following outputs are available

| Name          | Type    | Description                           |
|---------------|---------|---------------------------------------|
| `platforms`   | String  | Available platforms (comma separated) |

### environment variables

The following [official docker environment variables](https://docs.docker.com/engine/reference/commandline/cli/#environment-variables) are supported:

| Name            | Type    | Default      | Description                                    |
|-----------------|---------|-------------|-------------------------------------------------|
| `DOCKER_CONFIG` | String  | `~/.docker` | The location of your client configuration files |

## Limitation

This action is only available for Linux [virtual environments](https://help.github.com/en/articles/virtual-environments-for-github-actions#supported-virtual-environments-and-hardware-resources).
