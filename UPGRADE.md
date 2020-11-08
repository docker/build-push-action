# Upgrade notes

## v1 to v2

* Input `path` is now called `context` for consistency with other Docker build tools
* `path` defaults to current git repository so checkout action is not required in a workflow
* Rename `dockerfile` input to `file` for consistency with other Docker build tools
* Rename `always_pull` input to `pull` for consistency with other Docker build tools
* Add `builder` input to be able to choose a builder instance through our [setup-buildx action](https://github.com/docker/setup-buildx-action)
* Add [`platforms`](https://github.com/docker/buildx#---platformvaluevalue) input to support multi-platform builds
* Add [`allow`](https://github.com/docker/buildx#--allowentitlement) input
* Add [`load`](https://github.com/docker/buildx#--load) input
* Add [`outputs`](https://github.com/docker/buildx#-o---outputpath-typetypekeyvalue) input
* Add [`cache-from`](https://github.com/docker/buildx#--cache-fromnametypetypekeyvalue) input (`cache_froms` removed)
* Add [`cache-to`](https://github.com/docker/buildx#--cache-tonametypetypekeyvalue) input
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
    name: Checkout code
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
    name: Checkout code
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
      file: ./Dockerfile
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
    name: Checkout code
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
    name: Prepare
    id: prep
    run: |
      DOCKER_IMAGE=myorg/myrepository
      VERSION=edge
      if [[ $GITHUB_REF == refs/tags/* ]]; then
        VERSION=${GITHUB_REF#refs/tags/}
      elif [[ $GITHUB_REF == refs/heads/* ]]; then
        VERSION=$(echo ${GITHUB_REF#refs/heads/} | sed -r 's#/+#-#g')
      elif [[ $GITHUB_REF == refs/pull/* ]]; then
        VERSION=pr-${{ github.event.number }}
      fi
      TAGS="${DOCKER_IMAGE}:${VERSION}"
      if [ "${{ github.event_name }}" = "push" ]; then
        TAGS="$TAGS,${DOCKER_IMAGE}:sha-${GITHUB_SHA::8}"
      fi
      echo ::set-output name=version::${VERSION}
      echo ::set-output name=tags::${TAGS}
      echo ::set-output name=created::$(date -u +'%Y-%m-%dT%H:%M:%SZ')
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
      file: ./Dockerfile
      push: ${{ github.event_name != 'pull_request' }}
      tags: ${{ steps.prep.outputs.tags }}
      labels: |
        org.opencontainers.image.source=${{ github.event.repository.html_url }}
        org.opencontainers.image.created=${{ steps.prep.outputs.created }}
        org.opencontainers.image.revision=${{ github.sha }}
```

> You can also use the [Docker meta action](https://github.com/crazy-max/ghaction-docker-meta) to handle tags and
> labels based on GitHub actions events and Git metadata. A workflow example is available in the [README](README.md#handle-tags-and-labels).
