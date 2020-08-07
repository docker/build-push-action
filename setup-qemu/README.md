## About

GitHub Action to install [QEMU static binaries](https://github.com/multiarch/qemu-user-static).

___

* [Usage](#usage)
  * [Quick start](#quick-start)
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
        uses: docker/action/setup-qemu@v2
        with:
          qemu-version: latest
```

## Customizing

### inputs

Following inputs can be used as `step.with` keys

| Name             | Type    | Default   | Description                        |
|------------------|---------|-----------|------------------------------------|
| `qemu-version`   | String  | `latest`  | [qemu-user-static](https://github.com/multiarch/qemu-user-static) version (Docker tag). Example: `4.2.0-7` |

## Limitation

This action is only available for Linux [virtual environments](https://help.github.com/en/articles/virtual-environments-for-github-actions#supported-virtual-environments-and-hardware-resources).
