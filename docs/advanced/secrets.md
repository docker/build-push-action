# Secrets

In the following example we will expose and use the [GITHUB_TOKEN secret](https://docs.github.com/en/actions/reference/authentication-in-a-workflow#about-the-github_token-secret)
as provided by GitHub in your workflow.

First let's create our `Dockerfile` to use our secret:

```Dockerfile
#syntax=docker/dockerfile:1.2

FROM alpine
RUN --mount=type=secret,id=github_token \
  cat /run/secrets/github_token
```

As you can see we have named our secret `github_token`. Here is the workflow you can use to expose this secret using
the [`secrets` input](../../README.md#inputs):

```yaml
name: ci

on:
  push:
    branches:
      - 'master'

jobs:
  docker:
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
      -
        name: Build
        uses: docker/build-push-action@v2
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          tags: user/app:latest
          secrets: |
            "github_token=${{ secrets.GITHUB_TOKEN }}"
```

> :bulb: You can also expose a secret file to the build with [`secret-files`](../../README.md#inputs) input:
> ```yaml
> secret-files: |
>   "MY_SECRET=./secret.txt"
> ```

If you're using [GitHub secrets](https://docs.github.com/en/actions/reference/encrypted-secrets) and need to handle
multi-line value, you will need to place the key-value pair between quotes:

```yaml
secrets: |
  "MYSECRET=${{ secrets.GPG_KEY }}"
  GIT_AUTH_TOKEN=abcdefghi,jklmno=0123456789
  "MYSECRET=aaaaaaaa
  bbbbbbb
  ccccccccc"
  FOO=bar
  "EMPTYLINE=aaaa
  
  bbbb
  ccc"
  "JSON_SECRET={""key1"":""value1"",""key2"":""value2""}"
```

| Key                | Value                                            |
|--------------------|--------------------------------------------------|
| `MYSECRET`         | `***********************` |
| `GIT_AUTH_TOKEN`   | `abcdefghi,jklmno=0123456789` |
| `MYSECRET`         | `aaaaaaaa\nbbbbbbb\nccccccccc` |
| `FOO`              | `bar` |
| `EMPTYLINE`        | `aaaa\n\nbbbb\nccc` |
| `JSON_SECRET`      | `{"key1":"value1","key2":"value2"}` |

> :bulb: All quote signs need to be doubled for escaping.
