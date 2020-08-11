## About

GitHub Action to install [QEMU static binaries](https://github.com/multiarch/qemu-user-static).

___

* [Usage](#usage)
* [Customizing](#customizing)
  * [inputs](#inputs)
* [Limitation](#limitation)

## Usage

```yaml
name: ci

on:
  pull_request:
    branches: master
  push:
    branches: master
    tags:

jobs:
  qemu:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v2
      -
        name: Set up QEMU
        uses: docker/actions/setup-qemu@v1
        with:
          image: tonistiigi/binfmt:latest
          platforms: all
```

## Customizing

### inputs

Following inputs can be used as `step.with` keys

| Name             | Type    | Default                     | Description                        |
|------------------|---------|-----------------------------|------------------------------------|
| `image`          | String  | `tonistiigi/binfmt:latest`  | QEMU static binaries Docker image. Example: [`tonistiigi/binfmt:latest`](https://hub.docker.com/r/tonistiigi/binfmt/tags) |
| `platforms`      | String  | `all`                       | Platforms to install. Example: `arm64,riscv64,arm` |

## Limitation

This action is only available for Linux [virtual environments](https://help.github.com/en/articles/virtual-environments-for-github-actions#supported-virtual-environments-and-hardware-resources).
