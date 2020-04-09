# build-push-action

Builds and pushes Docker images and will log in to a Docker registry if required.

Suggestions and issues can be posted on the repositories [issues page](https://github.com/docker/build-push-action/issues).

[Inputs](#Inputs)
* [repository](#repository)
* [username](#username)
* [password](#password)
* [registry](#registry)
* [tags](#tags)
* [tag_with_ref](#tag_with_ref)
* [tag_with_sha](#tag_with_sha)
* [path](#path)
* [dockerfile](#dockerfile)
* [target](#target)
* [always_pull](#always_pull)
* [build_args](#build_args)
* [labels](#labels)
* [add_git_labels](#add_git_labels)
* [push](#push)

[Example usage](#Example-usage)

## Inputs

### `repository`

**Required** Docker repository to tag the image with.

### `username`

Username used to log in to a Docker registry. If not set then no login will occur.

### `password`

Password or personal access token used to log in to a Docker registry. If not set then no login will occur.

### `registry`

Server address of Docker registry. If not set then will default to Docker Hub.

### `tags`

Comma-delimited list of tags. These will be added to the registry/repository to form the image's tags.

Example:

```yaml
tags: tag1,tag2
```

### `tag_with_ref`

Boolean value. Defaults to `false`.

Automatically tags the built image with the git reference. The format of the tag depends on the type of git reference with all forward slashes replaced with `-`.

For pushes to a branch the reference will be `refs/heads/{branch-name}` and the tag will be `{branch-name}`. If `{branch-name}` is master then the tag will be `latest`.

For pull requests the reference will be `refs/pull/{pull-request}` and the tag will be `pr-{pull-request}`.

For git tags the reference will be `refs/tags/{git-tag}` and the tag will be `{git-tag}`.

Examples:

|Git Reference|Image tag|
|---|---|
|`refs/heads/master`|`latest`|
|`refs/heads/my/branch`|`my-branch`|
|`refs/pull/2/merge`|`pr-2-merge`|
|`refs/tags/v1.0.0`|`v1.0.0`|

### `tag_with_sha`

Boolean value. Defaults to `false`.

Automatically tags the built image with the git short SHA prefixed with `sha-`.

Example:

|Git SHA|Image tag|
|---|---|
|`676cae2f85471aeff6776463c72881ebd902dcf9`|`sha-676cae2`|

### `path`

Path to the build context. Defaults to `.`

### `dockerfile`

Path to the Dockerfile. Defaults to `{path}/Dockerfile`

Note when set this path is **not** relative to the `path` input but is instead relative to the current working directory.

### `target`

Sets the target stage to build.

### `always_pull`

Boolean value. Defaults to `false`.

Always attempt to pull a newer version of the image.

### `build_args`

Comma-delimited list of build-time variables.

Example:

```yaml
build_args: arg1=value1,arg2=value2
```

### `labels`

Comma-delimited list of labels to add to the built image.

Example:

```yaml
labels: label_name_1=label_value_1,label_name_2=label_value_2
```

### `add_git_labels`

Boolean value. Defaults to `false`.

Adds labels with git repository information to the built image based on the standards set out in https://github.com/opencontainers/image-spec/blob/master/annotations.md.

The labels are:

|Label key|Example value|Description|
|---|---|---|
|`org.opencontainers.image.created`|`2020-03-06T23:00:00Z`|Date and time on which the image was built (string, date-time as defined by RFC 3339).|
|`org.opencontainers.image.source`|`https://github.com/myorg/myrepository`|URL to the GitHub repository.|
|`org.opencontainers.image.revision`|`676cae2f85471aeff6776463c72881ebd902dcf9`|The full git SHA of this commit.|


### `push`

Boolean value. Defaults to `true`.

Whether to push the built image.

## Example usage

The following will build the root Dockerfile, tag the image as `myorg/myrepository:latest`, log in to Docker Hub using GitHub secrets, and push the image to the Docker Hub repository `myorg/myrepository`:

```yaml
uses: docker/build-push-action@v1
with:
  username: ${{ secrets.DOCKER_USERNAME }}
  password: ${{ secrets.DOCKER_PASSWORD }}
  repository: myorg/myrepository
  tags: latest
```

The following will build the root Dockerfile, tag the image with the git reference and SHA as described above, log in to Docker Hub using GitHub secrets, and push the image to the Docker Hub repository `myorg/myrepository`:

```yaml
uses: docker/build-push-action@v1
with:
  username: ${{ secrets.DOCKER_USERNAME }}
  password: ${{ secrets.DOCKER_PASSWORD }}
  repository: myorg/myrepository
  tag_with_ref: true
  tag_with_sha: true
```

The following will only push the image when the event that kicked off the workflow was a push of a git tag:

```yaml
uses: docker/build-push-action@v1
with:
  username: ${{ secrets.DOCKER_USERNAME }}
  password: ${{ secrets.DOCKER_PASSWORD }}
  repository: myorg/myrepository
  tag_with_ref: true
  push: ${{ startsWith(github.ref, 'refs/tags/') }}
```

The following builds the `mytarget` stage and pushes that:
 
```yaml
uses: docker/build-push-action@v1
with:
  username: ${{ secrets.DOCKER_USERNAME }}
  password: ${{ secrets.DOCKER_PASSWORD }}
  repository: myorg/myrepository
  tag_with_ref: true
  target: mytarget
```

### Minimal complete working github actions yaml file

```yaml
name: Build Docker images
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: 'Checkout git repo'
        uses: actions/checkout@v1

      - name: Build Docker images
        uses: docker/build-push-action@v1.0.1
        with:
          repository: myorg/myrepository
          push: false
```
