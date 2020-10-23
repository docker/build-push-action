# Troubleshooting

* [`auto-push is currently not implemented for docker driver`](#auto-push-is-currently-not-implemented-for-docker-driver)
* [Cannot push to a registry](#cannot-push-to-a-registry)

## `auto-push is currently not implemented for docker driver`

If you're using the default builder (which uses the docker driver) without using our `setup-buildx-action`, you may
encounter this error message if you try to push your image:

```
Run docker/build-push-action@v2
📣 Buildx version: 0.4.2
🏃 Starting build...
/usr/bin/docker buildx build --tag localhost:5000/name/app:latest --iidfile /tmp/docker-build-push-eYl8PB/iidfile --file ./test/Dockerfile --push ./test
auto-push is currently not implemented for docker driver
Error: buildx call failed with: auto-push is currently not implemented for docker driver
```

While waiting for an implementation to be done on buildx/buildkit, you have the following possibilities
to solve this atm:

### With `docker-container` driver and `setup-buildx`

> Recommended solution

```yaml
jobs:
  build:
    -
      name: Checkout
      uses: actions/checkout@v2
    -
      name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v1
    -
      name: Login
      uses: docker/login-action@v1
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ env.USER }}
        password: ${{ secrets.PASSWORD }}
    -
      name: Build and push
      uses: docker/build-push-action@v2
      with:
        context: .
        tags: ${{ env.REGISTRY }}/myapp:latest
        push: true
```

### With `docker` driver

```yaml
jobs:
  build:
    -
      name: Checkout
      uses: actions/checkout@v2
    -
      name: Login
      uses: docker/login-action@v1
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ env.USER }}
        password: ${{ secrets.PASSWORD }}
    -
      name: Build
      uses: docker/build-push-action@v2
      with:
        context: .
        tags: ${{ env.REGISTRY }}/myapp:latest
        load: true
    -
      name: Push
      run: docker push ${{ env.REGISTRY }}/myapp:latest
```

### With `docker` driver and `setup-buildx`

```yaml
jobs:
  build:
    -
      name: Checkout
      uses: actions/checkout@v2
    -
      name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v1
      with:
        driver: docker
    -
      name: Login
      uses: docker/login-action@v1
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ env.USER }}
        password: ${{ secrets.PASSWORD }}
    -
      name: Build
      uses: docker/build-push-action@v2
      with:
        context: .
        tags: ${{ env.REGISTRY }}/myapp:latest
        load: true
    -
      name: Push
      run: docker push ${{ env.REGISTRY }}/myapp:latest
```

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

To help you solve this, you should first enable debugging in the
[setup-buildx action step](https://github.com/docker/setup-buildx-action):

```yaml
  -
    name: Set up Docker Buildx
    uses: docker/setup-buildx-action@v1
    with:
      buildkitd-flags: --debug
```

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
          file: ./Dockerfile
          platforms: linux/386,linux/amd64,linux/arm/v6,linux/arm/v7,linux/arm64,linux/ppc64le,linux/s390x
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
