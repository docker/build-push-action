# Upgrade notes

## v1 to v2

* Input `path` is now called `context` for consistency with other Docker build tools
* `path` defaults to current git repository so checkout action is not required in a workflow
* Rename `dockerfile` input to `file` for consistency with other Docker build tools
* Rename `always_pull` input to `pull` for consistency with other Docker build tools
* Add `builder` input to be able to choose a builder instance through our [setup-buildx action](https://github.com/docker/setup-buildx-action)
* Add `platforms` input to support multi-platform builds
* Add `allow` input
* Add `load` input
* Add `outputs` input
* Add `cache-from` input (`cache_froms` removed)
* Add `cache-to` input
* Rename `build_args` input to `build-args` for consistency with other Docker build tools
* Add `secrets` input
* Review `tags` input
* Remove `repository` input. See [Simple workflow](#simple-workflow) for migration
* Remove `username`, `password` and `registry` inputs. Login support moved to [docker/login-action](https://github.com/docker/login-action) repo
* Remove `tag_with_sha`, `tag_with_ref`, `add_git_labels` inputs. See [Tags with ref and Git labels](#tags-with-ref-and-git-labels) for migration
* Handle Git context
* Add `digest` output

### Simple workflow

```yaml
# v1
steps:
  -
    name: Checkout
    uses: actions/checkout@v2
  -
    name: Build and push Docker images
    uses: docker/build-push-action@v1
    with:
      username: ${{ secrets.DOCKER_USERNAME }}
      password: ${{ secrets.DOCKER_PASSWORD }}
      repository: myorg/myrepository
      always_pull: true
      build_args: arg1=value1,arg2=value2
      cache_froms: myorg/myrepository:latest
      tags: latest
```

```yaml
# v2
steps:
  -
    name: Checkout
    uses: actions/checkout@v2
  -
    name: Set up Docker Buildx
    uses: docker/setup-buildx-action@v1
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
      pull: true
      push: true
      build-args: |
        arg1=value1
        arg2=value2
      cache-from: type=registry,ref=myorg/myrepository:latest
      cache-to: type=inline
      tags: myorg/myrepository:latest
```

### Tags with ref and Git labels

```yaml
# v1
steps:
  -
    name: Checkout
    uses: actions/checkout@v2
  -
    name: Build and push Docker images
    uses: docker/build-push-action@v1
    with:
      username: ${{ secrets.DOCKER_USERNAME }}
      password: ${{ secrets.DOCKER_PASSWORD }}
      repository: myorg/myrepository
      push: ${{ github.event_name != 'pull_request' }}
      tag_with_ref: true
      tag_with_sha: true
      add_git_labels: true
```

```yaml
# v2
steps:
  -
    name: Checkout
    uses: actions/checkout@v2
  -
    name: Docker meta
    id: meta
    uses: docker/metadata-action@v3
    with:
      images: |
        myorg/myrepository
      tags: |
        type=ref,event=branch
        type=ref,event=pr
        type=semver,pattern={{version}}
        type=sha
  -
    name: Set up Docker Buildx
    uses: docker/setup-buildx-action@v1
  -
    name: Login to DockerHub
    if: github.event_name != 'pull_request'
    uses: docker/login-action@v1 
    with:
      username: ${{ secrets.DOCKER_USERNAME }}
      password: ${{ secrets.DOCKER_PASSWORD }}
  -
    name: Build and push
    uses: docker/build-push-action@v2
    with:
      context: .
      push: ${{ github.event_name != 'pull_request' }}
      tags: ${{ steps.meta.outputs.tags }}
      labels: ${{ steps.meta.outputs.labels }}
```
