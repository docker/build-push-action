# Export image to Docker

You may want your build result to be available in the Docker client through `docker images` to be able to use it
in another step of your workflow:

```yaml
name: ci

on:
  push:
    branches:
      - 'main'

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v3
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      -
        name: Build
        uses: docker/build-push-action@v3
        with:
          context: .
          load: true
          tags: myimage:latest
      -
        name: Inspect
        run: |
          docker image inspect myimage:latest
```


## Usage of the built image in other build steps

[By default](https://github.com/docker/setup-buildx-action#customizing), `docker/setup-buildx-action@v2` 
uses `docker-container` as a build driver, so the docker images are not available in the builder container.
To use them, you may use [build contexts](https://github.com/docker/buildx/blob/master/docs/reference/buildx_build.md#-additional-build-contexts---build-context):

```yaml
name: ci

on:
  push:
    branches:
      - 'main'

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v3
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      -
        name: Build base image
        uses: docker/build-push-action@v3
        with:
          context: base
          load: true
          tags: my-base-image:latest
      -
        name: Build image from my-base-image:latest
        uses: docker/build-push-action@v3
        with:
          context: .
          build-contexts: |
            base-image=docker-image://my-base-image:latest
          tags: myimage:latest
```

Where `base-image`is the name of the base image (or stage name if specified) in your Dockerfile:
```Dockerfile
FROM base-image
```

### Bake alternative

You may also want to use [bake](https://docs.docker.com/build/bake/build-contexts/#using-a-result-of-one-target-as-a-base-image-in-another-target)
and build the base image and the target image in one build step:
```terraform
# docker-bake.hcl
target "base" {
  dockerfile = "baseapp.Dockerfile"
}

target "app" {
  contexts = {
    baseapp = "target:base"
  }
}
```

```yaml
      -
        name: Build
        uses: docker/bake-action@v2
        with:
          target: app
```
