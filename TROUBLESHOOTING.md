# Troubleshooting

* [Cannot push to a registry](#cannot-push-to-a-registry)
  * [BuildKit container logs](#buildkit-container-logs)
  * [With containerd](#with-containerd)

## Cannot push to a registry

While pushing to a registry, you may encounter these kinds of issues:

* `failed commit on ref "layer-sha256:...": invalid content digest in response: invalid checksum digest format`
* `failed commit on ref "layer-sha256:...": no response`
* `failed commit on ref "manifest-sha256:...": unexpected status: 400 Bad Request`
* `failed commit on ref "manifest-sha256:...": unexpected status: 401 Unauthorized`
* `unexpected response: 401 Unauthorized`

These issues are not directly related to this action but are rather linked to [buildx](https://github.com/docker/buildx),
[buildkit](https://github.com/moby/buildkit), [containerd](https://github.com/containerd/containerd) or the registry
on which you're pushing your image. The quality of error message depends on the registry and are usually not very informative.

### BuildKit container logs

To help you solve this, you have to [enable debugging in the setup-buildx](https://github.com/docker/setup-buildx-action#buildkit-container-logs)
action step and attach BuildKit container logs to your issue.

### With containerd

Next you can test pushing with [containerd action](https://github.com/crazy-max/ghaction-setup-containerd) using the
following workflow. If it works then open an issue on [buildkit](https://github.com/moby/buildkit) repository.

```yaml
name: containerd

on:
  push:

jobs:
  containerd:
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
        with:
          buildkitd-flags: --debug
      -
        name: Set up containerd
        uses: crazy-max/ghaction-setup-containerd@v1
      -
        name: Build Docker image
        uses: docker/build-push-action@v2
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          tags: docker.io/user/app:latest
          outputs: type=oci,dest=/tmp/image.tar
      -
        name: Import image in containerd
        run: |
          sudo ctr i import --base-name docker.io/user/app --digests --all-platforms /tmp/image.tar
      -
        name: Push image with containerd
        run: |
          sudo ctr --debug i push --user "${{ secrets.DOCKER_USERNAME }}:${{ secrets.DOCKER_PASSWORD }}" docker.io/user/app:latest
```
